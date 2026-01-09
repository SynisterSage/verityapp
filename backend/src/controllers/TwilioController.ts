import { Request, Response } from 'express';
import logger from 'jet-logger';
import twilio from 'twilio';
import fetch from 'node-fetch';
import supabaseAdmin from '@src/services/supabase';
import { transcribeWavBuffer } from '@src/services/azure';
import { analyzeTranscript, hashCallerNumber, matchPhrases, scoreToRiskLevel } from '@src/services/fraud';
import { getCallerMetadata } from '@src/services/phone';
import { verifyPasscodeHash } from '@src/services/passcode';
import { removeBlockedEntry, removeTrustedContact } from '@src/services/callerLists';

const DEFAULT_GREETING = 'Hello, you have reached SafeCall.';

/**
 * Build an absolute URL that points back at our recording-ready endpoint.
 * We derive the host from the incoming request so ngrok + production both work.
 */
function getPublicBaseUrl(req: Request) {
  const host = req.get('host') ?? 'localhost:3000';
  const forwardedProto = req.header('x-forwarded-proto') ?? '';
  const protocol =
    forwardedProto ||
    (host.includes('ngrok-free.dev') || host.includes('ngrok-free.app') ? 'https' : req.protocol);
  return `${protocol}://${host}`;
}

function buildRecordingCallbackUrl(req: Request) {
  return new URL('/api/v1/webhook/twilio/recording-ready', getPublicBaseUrl(req)).toString();
}

function buildVerifyPinUrl(req: Request) {
  return new URL('/api/v1/webhook/twilio/verify-pin', getPublicBaseUrl(req)).toString();
}

function buildDialStatusUrl(req: Request) {
  return new URL('/api/v1/webhook/twilio/dial-status', getPublicBaseUrl(req)).toString();
}

function extractPin(digits?: string, speechResult?: string) {
  if (digits && digits.trim()) {
    return digits.trim();
  }
  if (!speechResult) {
    return '';
  }
  const numeric = speechResult.replace(/\D/g, '');
  return numeric.length >= 6 ? numeric.slice(0, 6) : '';
}

async function isCallerTrusted(profileId: string, fromNumber?: string | null) {
  const callerHash = hashCallerNumber(fromNumber);
  if (!callerHash) {
    return false;
  }
  const { data } = await supabaseAdmin
    .from('trusted_contacts')
    .select('id')
    .eq('profile_id', profileId)
    .eq('caller_hash', callerHash)
    .maybeSingle();
  return !!data;
}

function appendVoicemail(
  twimlResponse: twilio.twiml.VoiceResponse,
  callbackUrl: string,
  message: string
) {
  twimlResponse.say({ voice: 'Polly.Joanna' }, message);
  twimlResponse.record({
    recordingStatusCallback: callbackUrl,
    recordingStatusCallbackMethod: 'POST',
    maxLength: 120,
    playBeep: true,
    trim: 'trim-silence',
    finishOnKey: '#',
  });
  twimlResponse.hangup();
}

function appendHangupMessage(
  twimlResponse: twilio.twiml.VoiceResponse,
  message: string
) {
  twimlResponse.say({ voice: 'Polly.Joanna' }, message);
  twimlResponse.hangup();
}

function appendBridge(
  twimlResponse: twilio.twiml.VoiceResponse,
  dialStatusUrl: string,
  callerId: string,
  destination: string
) {
  twimlResponse.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting your call.');
  const dial = twimlResponse.dial({
    callerId,
    timeout: 20,
    answerOnBridge: true,
  });
  dial.number(
    {
      statusCallback: dialStatusUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    },
    destination
  );
}

/**
 * Respond to Twilio when a call comes in. We play a greeting, record the voicemail,
 * and point recordingStatusCallback to our recording-ready webhook.
 */
async function callIncoming(req: Request, res: Response) {
  const callbackUrl = buildRecordingCallbackUrl(req);
  const verifyUrl = buildVerifyPinUrl(req);
  const dialStatusUrl = buildDialStatusUrl(req);
  const { VoiceResponse } = twilio.twiml;
  const twimlResponse = new VoiceResponse();

  const payload = getPayload(req);
  const toNumber = payload.To ?? '';
  const fromNumber = payload.From ?? '';
  const profile = await getProfileByToNumber(toNumber);
  if (profile) {
    const trusted = await isCallerTrusted(profile.id, fromNumber);
    if (trusted) {
      const bridgeEnabled = process.env.ENABLE_CALL_BRIDGE === 'true';
      if (bridgeEnabled && profile.phone_number) {
        const outboundCallerId = process.env.OUTBOUND_CALLER_ID || toNumber;
        appendBridge(twimlResponse, dialStatusUrl, outboundCallerId, profile.phone_number);
        logger.info(`Trusted caller bridged to=${toNumber} from=${fromNumber}`);
        return res.type('text/xml').send(twimlResponse.toString());
      }
      await supabaseAdmin.from('alerts').insert({
        profile_id: profile.id,
        call_id: null,
        alert_type: 'trusted',
        status: 'pending',
        payload: {
          callerNumber: fromNumber || null,
          riskLevel: 'low',
          label: 'trusted',
        },
      });
      appendHangupMessage(
        twimlResponse,
        'Thank you. We will let them know you called.'
      );
      logger.info(`Trusted caller bypassed passcode to=${toNumber} from=${fromNumber}`);
      return res.type('text/xml').send(twimlResponse.toString());
    }
  }

  twimlResponse.say({ voice: 'Polly.Joanna' }, DEFAULT_GREETING);
  const gather = twimlResponse.gather({
    input: ['dtmf', 'speech'],
    numDigits: 6,
    action: verifyUrl,
    method: 'POST',
    speechTimeout: 'auto',
  });
  gather.say(
    { voice: 'Polly.Joanna' },
    'Please say or enter your six digit passcode.'
  );
  // If no input, go to voicemail.
  appendVoicemail(twimlResponse, callbackUrl, 'No passcode received. Please leave a message.');
  logger.info(`Twilio call incoming handled, callback ${callbackUrl}`);
  res.type('text/xml').send(twimlResponse.toString());
}

/**
 * Handle Twilio's recording-ready callback. We log the event for now.
 */
function getPayload(req: Request) {
  if (req.body && Object.keys(req.body).length > 0) {
    return req.body as Record<string, string | undefined>;
  }
  return req.query as Record<string, string | undefined>;
}

function getRecordingUrl(baseUrl?: string) {
  if (!baseUrl) {
    return '';
  }
  return baseUrl.endsWith('.wav') ? baseUrl : `${baseUrl}.wav`;
}

async function resolveToNumber(callSid?: string, fallbackTo?: string) {
  if (fallbackTo) {
    return fallbackTo;
  }
  if (!callSid) {
    return '';
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? '';
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  if (!accountSid || !authToken) {
    return '';
  }
  const client = twilio(accountSid, authToken);
  try {
    const call = await client.calls(callSid).fetch();
    return call.to ?? '';
  } catch (err) {
    logger.err(err as Error);
    return '';
  }
}

async function resolveFromNumber(callSid?: string, fallbackFrom?: string) {
  if (fallbackFrom) {
    return fallbackFrom;
  }
  if (!callSid) {
    return '';
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? '';
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  if (!accountSid || !authToken) {
    return '';
  }
  const client = twilio(accountSid, authToken);
  try {
    const call = await client.calls(callSid).fetch();
    return call.from ?? '';
  } catch (err) {
    logger.err(err as Error);
    return '';
  }
}

async function getProfileByToNumber(to?: string | null) {
  if (!to) {
    return null;
  }
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, phone_number, passcode_hash')
    .eq('twilio_virtual_number', to)
    .single();
  if (error || !profile) {
    return null;
  }
  return profile;
}

async function verifyPin(req: Request, res: Response) {
  const payload = getPayload(req);
  const pin = extractPin(payload.Digits, payload.SpeechResult);
  const toNumber = payload.To ?? '';
  const fromNumber = payload.From ?? '';
  const callbackUrl = buildRecordingCallbackUrl(req);
  const dialStatusUrl = buildDialStatusUrl(req);
  const { VoiceResponse } = twilio.twiml;
  const twimlResponse = new VoiceResponse();

  const profile = await getProfileByToNumber(toNumber);
  if (!profile) {
    appendVoicemail(
      twimlResponse,
      callbackUrl,
      'We could not verify this call. Please leave a message.'
    );
    return res.type('text/xml').send(twimlResponse.toString());
  }

  const trusted = await isCallerTrusted(profile.id, fromNumber);
  if (trusted) {
    const bridgeEnabled = process.env.ENABLE_CALL_BRIDGE === 'true';
    if (bridgeEnabled && profile.phone_number) {
      const outboundCallerId = process.env.OUTBOUND_CALLER_ID || toNumber;
      appendBridge(twimlResponse, dialStatusUrl, outboundCallerId, profile.phone_number);
      return res.type('text/xml').send(twimlResponse.toString());
    }
    appendHangupMessage(twimlResponse, 'Thank you. We will let them know you called.');
    return res.type('text/xml').send(twimlResponse.toString());
  }

  const callBlockingEnabled = process.env.ENABLE_CALL_BLOCKING === 'true';
  if (callBlockingEnabled) {
    const callerHash = hashCallerNumber(fromNumber);
    if (callerHash) {
      const { data: blocked } = await supabaseAdmin
        .from('blocked_callers')
        .select('id, blocked_until')
        .eq('profile_id', profile.id)
        .eq('caller_hash', callerHash)
        .maybeSingle();
      if (blocked) {
        const stillBlocked =
          !blocked.blocked_until || new Date(blocked.blocked_until) > new Date();
        if (stillBlocked) {
          appendVoicemail(
            twimlResponse,
            callbackUrl,
            'We cannot connect your call. Please leave a message.'
          );
          return res.type('text/xml').send(twimlResponse.toString());
        }
      }
    }
  }

  const isValid = verifyPasscodeHash(pin, profile.passcode_hash);
  logger.info(
    `Verify pin result to=${toNumber} pin_len=${pin.length} valid=${isValid} phone=${profile.phone_number ?? 'none'}`
  );
  const bridgeEnabled = process.env.ENABLE_CALL_BRIDGE === 'true';
  if (isValid && profile.phone_number && bridgeEnabled) {
    const outboundCallerId = process.env.OUTBOUND_CALLER_ID || toNumber;
    logger.info(
      `Dialing profile_number=${profile.phone_number} callerId=${outboundCallerId}`
    );
    appendBridge(twimlResponse, dialStatusUrl, outboundCallerId, profile.phone_number);
    return res.type('text/xml').send(twimlResponse.toString());
  }

  if (isValid && !bridgeEnabled) {
    appendVoicemail(twimlResponse, callbackUrl, 'Thank you. Please leave a message.');
  } else {
    appendVoicemail(twimlResponse, callbackUrl, 'Passcode not accepted. Please leave a message.');
  }
  return res.type('text/xml').send(twimlResponse.toString());
}

function dialStatus(req: Request, res: Response) {
  const payload = getPayload(req);
  logger.info(
    `Dial status CallSid=${payload.CallSid} DialCallSid=${payload.DialCallSid} status=${payload.DialCallStatus} sip=${payload.SipResponseCode ?? 'n/a'}`
  );
  return res.status(204).end();
}

async function recordingReady(req: Request, res: Response) {
  const {
    CallSid,
    RecordingSid,
    RecordingUrl,
    RecordingStatus,
    RecordingDuration,
    To,
    From,
  } = getPayload(req);
  const wavUrl = getRecordingUrl(RecordingUrl);
  const resolvedTo = await resolveToNumber(CallSid, To);
  const resolvedFrom = await resolveFromNumber(CallSid, From);
  const callerHash = hashCallerNumber(resolvedFrom);
  const callerMeta = getCallerMetadata(resolvedFrom);
  const callTimestamp = new Date().toISOString();
  const recordingDurationSeconds = RecordingDuration ? Number(RecordingDuration) : null;
  logger.info(
    `Twilio recording ready CallSid=${CallSid} RecordingSid=${RecordingSid} status=${RecordingStatus} url=${wavUrl} To=${resolvedTo}`
  );
  if (!RecordingSid || !wavUrl || !resolvedTo) {
    return res.status(204).end();
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud'
    )
    .eq('twilio_virtual_number', resolvedTo)
    .single();

  if (profileError || !profile) {
    logger.warn(
      `No profile found for To=${resolvedTo} error=${profileError?.message ?? 'none'}`
    );
    return res.status(204).end();
  }

  const trusted = await isCallerTrusted(profile.id, resolvedFrom);
  if (trusted) {
    logger.info(`Skipping recording for trusted caller profile=${profile.id}`);
    return res.status(204).end();
  }

  const { data: insertedRow, error: insertError } = await supabaseAdmin
    .from('calls')
    .insert({
      profile_id: profile.id,
      call_sid: CallSid ?? null,
      recording_sid: RecordingSid,
      recording_url: wavUrl,
      recording_status: RecordingStatus ?? null,
      recording_duration_seconds: RecordingDuration ? Number(RecordingDuration) : null,
      caller_number: resolvedFrom || null,
      caller_country: callerMeta.country ?? null,
      caller_region: callerMeta.region ?? null,
      caller_hash: callerHash,
    })
    .select('id')
    .single();

  let callRow = insertedRow;
  if (insertError || !callRow) {
    logger.warn(`Call insert skipped: ${insertError?.message ?? 'unknown error'}`);
    const { data: existingRow, error: lookupError } = await supabaseAdmin
      .from('calls')
      .select('id')
      .or(`recording_sid.eq.${RecordingSid},call_sid.eq.${CallSid ?? ''}`)
      .single();
    if (lookupError || !existingRow) {
      logger.err(`Failed to find existing call record: ${lookupError?.message ?? 'unknown error'}`);
      return res.status(204).end();
    }
    callRow = existingRow;
  }

  const storagePath = `profiles/${profile.id}/calls/${callRow.id}.wav`;

  try {
    let previousCalls = 0;
    if (callerHash) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profile.id)
        .eq('caller_hash', callerHash)
        .gte('created_at', thirtyDaysAgo)
        .neq('id', callRow.id);
      previousCalls = count ?? 0;
    }
    const auth = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
    ).toString('base64');
    const recordingResp = await fetch(wavUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!recordingResp.ok) {
      logger.err(`Failed to download recording: ${recordingResp.status}`);
      return res.status(204).end();
    }
    const recordingBuffer = Buffer.from(await recordingResp.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from('call-recordings')
      .upload(storagePath, recordingBuffer, {
        contentType: 'audio/wav',
        upsert: true,
      });
    if (uploadError) {
      logger.err(`Supabase upload failed: ${uploadError.message}`);
      return res.status(204).end();
    }
    const { text, confidence } = await transcribeWavBuffer(recordingBuffer);
    const fraudThreshold =
      typeof profile.alert_threshold_score === 'number'
        ? profile.alert_threshold_score
        : Number(process.env.FRAUD_SCORE_THRESHOLD ?? 90);
    const fraudResult = text
      ? analyzeTranscript(text, {
          callerCountry: callerMeta.country ?? null,
          callerRegion: callerMeta.region ?? null,
          isHighRiskCountry: callerMeta.isHighRiskCountry,
          callDurationSeconds: recordingDurationSeconds,
          callTimestamp,
          repeatCallCount: previousCalls,
        })
      : null;
    let fraudScore = fraudResult?.score ?? null;
    let fraudRiskLevel = fraudResult?.riskLevel ?? null;
    const fraudKeywords = fraudResult?.matchedKeywords ?? null;
    const fraudNotes: {
      matchCount: number;
      weightSum: number;
      comboBoost: number;
      negatedMatches: string[];
      urgencyHits: number;
      secrecyHits: number;
      impersonationHits: number;
      paymentAppHits: number;
      codeRequestHits: number;
      explicitScamHits: number;
      paymentRequestHits: number;
      hardBlockHits: number;
      threatHits: number;
      accountAccessHits: number;
      moneyAmountHits: number;
      criticalKeywordHits: number;
      safePhraseMatches: string[];
      safePhraseDampening: number;
      repeatCallerBoost: number;
      callerHistory: { windowDays: number; previousCalls: number } | null;
    } | null = fraudResult
      ? {
          ...fraudResult.notes,
          callerHistory: null,
        }
      : null;

    if (callerHash && fraudNotes) {
      fraudNotes.callerHistory = {
        windowDays: 30,
        previousCalls,
      };
      if (typeof fraudScore === 'number') {
        const repeatBoost = previousCalls >= 5 ? 10 : previousCalls >= 2 ? 5 : 0;
        fraudNotes.repeatCallerBoost = repeatBoost;
        fraudScore = Math.min(100, fraudScore + repeatBoost);
      }
    }

    if (text && fraudNotes) {
      const { data: safeRows } = await supabaseAdmin
        .from('fraud_safe_phrases')
        .select('phrase')
        .eq('profile_id', profile.id);
      const safeMatches = matchPhrases(
        text,
        safeRows?.map((row) => row.phrase) ?? []
      );
      const dampening =
        typeof fraudScore === 'number'
          ? Math.min(20, safeMatches.length * 8)
          : 0;
      fraudNotes.safePhraseMatches = safeMatches;
      fraudNotes.safePhraseDampening = dampening;
      if (typeof fraudScore === 'number' && dampening > 0) {
        fraudScore = Math.max(0, fraudScore - dampening);
      }
    }

    if (typeof fraudScore === 'number') {
      fraudRiskLevel = scoreToRiskLevel(fraudScore);
    }

    const autoMarkEnabled = profile.auto_mark_enabled ?? false;
    const autoFraudThreshold =
      typeof profile.auto_mark_fraud_threshold === 'number'
        ? profile.auto_mark_fraud_threshold
        : fraudThreshold;
    const autoSafeThreshold =
      typeof profile.auto_mark_safe_threshold === 'number'
        ? profile.auto_mark_safe_threshold
        : 30;
    const autoTrustOnSafe = profile.auto_trust_on_safe ?? false;
    const autoBlockOnFraud = profile.auto_block_on_fraud ?? true;

    let autoFeedback: 'marked_fraud' | 'marked_safe' | null = null;
    let autoAlertRequired = false;
    let shouldBlockCaller = false;
    let shouldTrustCaller = false;
    const automationBlockEnabled = autoMarkEnabled && autoBlockOnFraud;
    const automationTrustEnabled = autoMarkEnabled && autoTrustOnSafe;
    if (autoMarkEnabled && typeof fraudScore === 'number') {
      if (fraudScore >= autoFraudThreshold) {
        autoFeedback = 'marked_fraud';
        autoAlertRequired = true;
        shouldBlockCaller = automationBlockEnabled;
      } else if (fraudScore <= autoSafeThreshold) {
        autoFeedback = 'marked_safe';
        shouldTrustCaller = automationTrustEnabled;
      }
    }
    await supabaseAdmin
      .from('calls')
      .update({
        storage_path: storagePath,
        transcript: text || null,
        transcript_confidence: confidence ?? null,
        transcribed_at: text ? new Date().toISOString() : null,
        caller_number: resolvedFrom || null,
        caller_country: callerMeta.country ?? null,
        caller_region: callerMeta.region ?? null,
        caller_hash: callerHash,
        fraud_score: fraudScore,
        fraud_risk_level: fraudRiskLevel,
        fraud_keywords: fraudKeywords,
        fraud_notes: fraudNotes,
        fraud_alert_required:
          typeof fraudScore === 'number'
            ? fraudScore >= fraudThreshold ||
              autoAlertRequired ||
              Boolean((fraudResult as { override?: boolean })?.override)
            : false,
        feedback_status: autoFeedback ?? undefined,
      })
      .eq('id', callRow.id);

    if (typeof fraudScore === 'number' && fraudScore >= fraudThreshold) {
      const alertsEnabled =
        profile.enable_email_alerts || profile.enable_sms_alerts || profile.enable_push_alerts;
      if (alertsEnabled) {
        await supabaseAdmin
          .from('alerts')
          .upsert(
            {
              profile_id: profile.id,
              call_id: callRow.id,
              alert_type: 'fraud',
              status: 'pending',
              payload: {
                score: fraudScore,
                riskLevel: fraudRiskLevel,
                keywords: fraudKeywords,
                callerHash,
              },
            },
            { onConflict: 'call_id,alert_type', ignoreDuplicates: true }
          );
      }

      const callBlockingEnabled = process.env.ENABLE_CALL_BLOCKING === 'true';
      if (callBlockingEnabled && callerHash && automationBlockEnabled) {
        await removeTrustedContact(profile.id, callerHash);
        await supabaseAdmin.from('blocked_callers').upsert(
          {
            profile_id: profile.id,
            caller_hash: callerHash,
            caller_number: resolvedFrom || null,
            reason: `auto_block_fraud_score_${fraudScore}`,
          },
          { onConflict: 'profile_id,caller_hash' }
        );
      }
    }

    // Auto-trust low-risk callers if enabled
    if (shouldTrustCaller && callerHash && resolvedFrom) {
      await removeBlockedEntry(profile.id, callerHash);
      await supabaseAdmin.from('trusted_contacts').upsert(
        {
          profile_id: profile.id,
          caller_hash: callerHash,
          caller_number: resolvedFrom,
          source: 'auto',
        },
        { onConflict: 'profile_id,caller_hash' }
      );
    }

    // Auto-block when auto-mark triggered high risk (even if below alert threshold)
    if (shouldBlockCaller && callerHash && typeof fraudScore === 'number') {
      const callBlockingEnabled = process.env.ENABLE_CALL_BLOCKING === 'true';
      if (callBlockingEnabled) {
        await supabaseAdmin.from('blocked_callers').upsert(
          {
            profile_id: profile.id,
            caller_hash: callerHash,
            caller_number: resolvedFrom || null,
            reason: `auto_mark_fraud_${fraudScore}`,
          },
          { onConflict: 'profile_id,caller_hash' }
        );
      }
    }
  } catch (err) {
    logger.err(err as Error);
  }
  return res.status(204).end();
}

export default {
  callIncoming,
  verifyPin,
  dialStatus,
  recordingReady,
};
