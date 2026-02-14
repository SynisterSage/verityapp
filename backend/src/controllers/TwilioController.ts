import { Request, Response } from 'express';
import logger from 'jet-logger';
import twilio from 'twilio';
import fetch from 'node-fetch';
import supabaseAdmin from '@src/services/supabase';
import { transcribeWavBuffer } from '@src/services/azure';
import { detectSyntheticVoice, VoiceAnalysisResult } from '@src/services/voiceDetector';
import { analyzeTranscript, hashCallerNumber, matchPhrases, scoreToRiskLevel } from '@src/services/fraud';
import { getCallerMetadata } from '@src/services/phone';
import {
  hashPasscode,
  verifyCurrentPasscode,
  verifyLegacyPasscode,
  CURRENT_PEPPER_VERSION,
} from '@src/services/passcode';
import { removeBlockedEntry, removeTrustedContact } from '@src/services/callerLists';
import { getPinLockState, recordPinAttempt } from '@src/services/pinAttempts';
import { dispatchAlertPush } from '@src/services/alertPushDispatcher';
import { notifyProfileForAlert } from '@src/services/pushNotifications';

const DEFAULT_GREETING = 'Hello, you have reached Verity Protect. This call is being recorded for safety purposes.';
const PUBLIC_API_URL = process.env.PUBLIC_API_URL?.replace(/\/+$/, '');

function getPublicBaseUrl(req: Request) {
  if (PUBLIC_API_URL) {
    return PUBLIC_API_URL;
  }
  const host = req.get('host') ?? 'localhost:4000';
  const forwardedProto = req.header('x-forwarded-proto') ?? '';
  const protocol = forwardedProto || req.protocol || 'http';
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

function buildBridgeFallbackUrl(req: Request) {
  return new URL('/api/v1/webhook/twilio/bridge-fallback', getPublicBaseUrl(req)).toString();
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

const CLIENT_SESSION_TTL_MS = Number(process.env.TWILIO_CLIENT_SESSION_TTL ?? '120') * 1000;

async function isCallerTrusted(profileId: string, fromNumber?: string | null) {
  const trustedCaller = await getTrustedCaller(profileId, fromNumber);
  return Boolean(trustedCaller);
}

async function getTrustedCaller(profileId: string, fromNumber?: string | null) {
  const callerHash = hashCallerNumber(fromNumber);
  if (!callerHash) {
    return null;
  }
  const { data } = await supabaseAdmin
    .from('trusted_contacts')
    .select('id, caller_number, contact_name')
    .eq('profile_id', profileId)
    .eq('caller_hash', callerHash)
    .maybeSingle();
  return data ?? null;
}

async function notifyStaleClientSession(profile: {
  id: string;
  twilio_client_last_seen_at?: string | null;
  twilio_client_stale_notified_at?: string | null;
}) {
  if (!profile.twilio_client_last_seen_at) {
    return;
  }
  const lastSeenAt = new Date(profile.twilio_client_last_seen_at);
  if (Number.isNaN(lastSeenAt.getTime())) {
    return;
  }
  if (Date.now() - lastSeenAt.getTime() < CLIENT_SESSION_TTL_MS) {
    return;
  }
  const lastNotifiedAt = profile.twilio_client_stale_notified_at
    ? new Date(profile.twilio_client_stale_notified_at)
    : null;
  if (lastNotifiedAt && !Number.isNaN(lastNotifiedAt.getTime())) {
    // Notify at most once per 24h for this condition.
    if (Date.now() - lastNotifiedAt.getTime() < 24 * 60 * 60 * 1000) {
      return;
    }
  }

  try {
    await notifyProfileForAlert(profile.id, {
      alertId: `twilio-stale-${Date.now()}`,
      title: 'Open Verity to stay reachable',
      body: 'Open Verity Protect so incoming protected calls can reach you in-app.',
      data: {
        alertType: 'twilio_client_stale',
        routeTarget: 'calls_trusted',
      },
    });
    await supabaseAdmin
      .from('profiles')
      .update({ twilio_client_stale_notified_at: new Date().toISOString() })
      .eq('id', profile.id);
  } catch (error) {
    logger.err(error as Error);
  }
}

async function logTrustedBridgeActivity(args: {
  profileId: string;
  caretakerId?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  bridgeTarget: string;
  trustedCaller?: { caller_number?: string | null; contact_name?: string | null } | null;
}) {
  const { profileId, caretakerId, fromNumber, toNumber, bridgeTarget, trustedCaller } = args;
  const contactName = trustedCaller?.contact_name ?? null;
  const callerNumber = fromNumber ?? trustedCaller?.caller_number ?? null;
  const payload = {
    callerNumber,
    contactName,
    toNumber: toNumber ?? null,
    bridgeTarget,
    riskLevel: 'low',
    label: 'trusted',
    bridged: true,
  };

  const { data: alertRow, error } = await supabaseAdmin
    .from('alerts')
    .insert({
      profile_id: profileId,
      caretaker_id: caretakerId ?? null,
      alert_type: 'trusted',
      status: 'pending',
      payload,
    })
    .select('id, profile_id, call_id, alert_type, payload, created_at')
    .maybeSingle();

  if (error || !alertRow) {
    logger.err(
      `[trusted-bridge] insert failed profile=${profileId} code=${error?.code ?? 'n/a'} message=${error?.message ?? 'unknown'} details=${error?.details ?? 'n/a'} hint=${error?.hint ?? 'n/a'}`
    );
    logger.warn(`Failed to log trusted bridge activity profile=${profileId}`);
    return;
  }

  await dispatchAlertPush(alertRow);
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

function getClientIdentity(profile: {
  id: string;
  twilio_client_identity?: string | null;
}) {
  return profile.twilio_client_identity || `profile-${profile.id}`;
}

function numbersLikelyMatch(a?: string | null, b?: string | null) {
  if (!a || !b) {
    return false;
  }
  const normalizedA = getCallerMetadata(a).normalized ?? a.replace(/\D/g, '');
  const normalizedB = getCallerMetadata(b).normalized ?? b.replace(/\D/g, '');
  return Boolean(normalizedA && normalizedB && normalizedA === normalizedB);
}

function appendNumberBridge(
  twimlResponse: twilio.twiml.VoiceResponse,
  dialStatusUrl: string,
  callerId: string,
  destination: string,
  actionUrl?: string
) {
  twimlResponse.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting your call.');
  const dial = twimlResponse.dial({
    callerId,
    timeout: 20,
    answerOnBridge: true,
    action: actionUrl,
    method: actionUrl ? 'POST' : undefined,
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

function appendClientBridge(
  twimlResponse: twilio.twiml.VoiceResponse,
  dialStatusUrl: string,
  callerId: string,
  clientIdentity: string,
  actionUrl?: string
) {
  twimlResponse.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting your call.');
  const dial = twimlResponse.dial({
    callerId,
    timeout: 10,
    answerOnBridge: true,
    action: actionUrl,
    method: actionUrl ? 'POST' : undefined,
  });
  dial.client(
    {
      statusCallback: dialStatusUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    },
    clientIdentity
  );
}

function bridgeToProfile(
  twimlResponse: twilio.twiml.VoiceResponse,
  dialStatusUrl: string,
  bridgeFallbackUrl: string,
  callerId: string,
  toNumber: string,
  profile: {
    id: string;
    phone_number?: string | null;
    fallback_phone_number?: string | null;
    twilio_client_identity?: string | null;
    twilio_client_last_seen_at?: string | null;
  }
) {
  const fallbackNumber = profile.fallback_phone_number || profile.phone_number || null;
  const loopTarget = numbersLikelyMatch(profile.phone_number, toNumber);

  // If the profile number points back to the routed Twilio number, do not dial it again.
  // Prefer Twilio Client so VoIP push can wake the app and avoid infinite call loops.
  if (loopTarget) {
    if (profile.twilio_client_identity) {
      const clientIdentity = getClientIdentity(profile);
      appendClientBridge(twimlResponse, dialStatusUrl, callerId, clientIdentity, bridgeFallbackUrl);
      return `client=${clientIdentity} (loop-avoidance)`;
    }
    logger.warn(`Skipping bridge loop for to=${toNumber}; profile phone matches routed number`);
    return null;
  }

  if (profile.twilio_client_identity) {
    const clientIdentity = getClientIdentity(profile);
    appendClientBridge(twimlResponse, dialStatusUrl, callerId, clientIdentity, bridgeFallbackUrl);
    return `client=${clientIdentity}`;
  }
  if (fallbackNumber) {
    appendNumberBridge(twimlResponse, dialStatusUrl, callerId, fallbackNumber);
    return `number=${fallbackNumber}`;
  }
  return null;
}

/**
 * Respond to Twilio when a call comes in. We play a greeting, record the voicemail,
 * and point recordingStatusCallback to our recording-ready webhook.
 */
async function callIncoming(req: Request, res: Response) {
  const callbackUrl = buildRecordingCallbackUrl(req);
  const verifyUrl = buildVerifyPinUrl(req);
  const dialStatusUrl = buildDialStatusUrl(req);
  const bridgeFallbackBaseUrl = buildBridgeFallbackUrl(req);
  const { VoiceResponse } = twilio.twiml;
  const twimlResponse = new VoiceResponse();

  const payload = getPayload(req);
  const toNumber = payload.To ?? '';
  const fromNumber = payload.From ?? '';
  const profile = await getProfileByToNumber(toNumber);
  if (profile) {
    const trustedCaller = await getTrustedCaller(profile.id, fromNumber);
    if (trustedCaller) {
      const bridgeEnabled = process.env.ENABLE_CALL_BRIDGE === 'true';
      if (bridgeEnabled) {
        const outboundCallerId = process.env.OUTBOUND_CALLER_ID || toNumber;
        const bridgeFallbackUrl = `${bridgeFallbackBaseUrl}?profileId=${encodeURIComponent(
          profile.id
        )}&to=${encodeURIComponent(toNumber)}&from=${encodeURIComponent(fromNumber)}`;
        const bridgeTarget = bridgeToProfile(
          twimlResponse,
          dialStatusUrl,
          bridgeFallbackUrl,
          outboundCallerId,
          toNumber,
          profile
        );
        if (bridgeTarget) {
          if (bridgeTarget.startsWith('client=')) {
            await notifyStaleClientSession(profile);
          }
          await logTrustedBridgeActivity({
            profileId: profile.id,
            caretakerId: profile.caretaker_id,
            fromNumber,
            toNumber,
            bridgeTarget,
            trustedCaller,
          });
          logger.info(`Trusted caller bridged ${bridgeTarget} to=${toNumber} from=${fromNumber}`);
          return res.type('text/xml').send(twimlResponse.toString());
        }
      }
      const { data: trustedAlert } = await supabaseAdmin
        .from('alerts')
        .insert({
          profile_id: profile.id,
          caretaker_id: profile.caretaker_id,
          alert_type: 'trusted',
          status: 'pending',
          payload: {
            callerNumber: fromNumber || null,
            riskLevel: 'low',
            label: 'trusted',
          },
        })
        .select('id, profile_id, call_id, alert_type, payload, created_at')
        .maybeSingle();
      if (trustedAlert) {
        await dispatchAlertPush(trustedAlert);
      }
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
    .select(
      'id, caretaker_id, phone_number, fallback_phone_number, twilio_virtual_number, pin_hash, pin_pepper_version, passcode_hash, twilio_client_identity, twilio_client_last_seen_at, twilio_client_stale_notified_at'
    )
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
  const bridgeFallbackBaseUrl = buildBridgeFallbackUrl(req);
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

  const trustedCaller = await getTrustedCaller(profile.id, fromNumber);
  if (trustedCaller) {
    const bridgeEnabled = process.env.ENABLE_CALL_BRIDGE === 'true';
    if (bridgeEnabled) {
      const outboundCallerId = process.env.OUTBOUND_CALLER_ID || toNumber;
      const bridgeFallbackUrl = `${bridgeFallbackBaseUrl}?profileId=${encodeURIComponent(
        profile.id
      )}&to=${encodeURIComponent(toNumber)}&from=${encodeURIComponent(fromNumber)}`;
      const bridgeTarget = bridgeToProfile(
        twimlResponse,
        dialStatusUrl,
        bridgeFallbackUrl,
        outboundCallerId,
        toNumber,
        profile
      );
      if (bridgeTarget) {
        if (bridgeTarget.startsWith('client=')) {
          await notifyStaleClientSession(profile);
        }
        await logTrustedBridgeActivity({
          profileId: profile.id,
          caretakerId: profile.caretaker_id,
          fromNumber,
          toNumber,
          bridgeTarget,
          trustedCaller,
        });
        logger.info(`Trusted caller bridged ${bridgeTarget} to=${toNumber} from=${fromNumber}`);
        return res.type('text/xml').send(twimlResponse.toString());
      }
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

  const pinResult = await validateProfilePin(pin, profile, req.ip);
  const isValid = pinResult.valid;
  logger.info(
    `Verify pin result to=${toNumber} pin_len=${pin.length} valid=${isValid} locked=${pinResult.locked} phone=${profile.phone_number ?? 'none'}`
  );
  const bridgeEnabled = process.env.ENABLE_CALL_BRIDGE === 'true';
  if (isValid && bridgeEnabled) {
    const outboundCallerId = process.env.OUTBOUND_CALLER_ID || toNumber;
    if (profile.twilio_client_identity) {
      const clientIdentity = getClientIdentity(profile);
      const bridgeFallbackUrl = `${bridgeFallbackBaseUrl}?profileId=${encodeURIComponent(
        profile.id
      )}&to=${encodeURIComponent(toNumber)}&from=${encodeURIComponent(fromNumber)}`;
      logger.info(
        `Dialing client=${clientIdentity} callerId=${outboundCallerId}`
      );
      appendClientBridge(
        twimlResponse,
        dialStatusUrl,
        outboundCallerId,
        clientIdentity,
        bridgeFallbackUrl
      );
      await notifyStaleClientSession(profile);
      return res.type('text/xml').send(twimlResponse.toString());
    }
    const fallbackNumber = profile.fallback_phone_number || profile.phone_number || null;
    if (fallbackNumber) {
      logger.info(
        `Dialing fallback_number=${fallbackNumber} callerId=${outboundCallerId}`
      );
      appendNumberBridge(twimlResponse, dialStatusUrl, outboundCallerId, fallbackNumber);
      return res.type('text/xml').send(twimlResponse.toString());
    }
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

function shouldFallbackDial(status?: string, sipCode?: string | null) {
  const normalized = String(status ?? '').toLowerCase();
  if (['no-answer', 'busy', 'failed', 'canceled', 'cancelled'].includes(normalized)) {
    return true;
  }
  const sip = Number.parseInt(String(sipCode ?? ''), 10);
  if (!Number.isNaN(sip) && [480, 486, 603].includes(sip)) {
    return true;
  }
  return false;
}

async function bridgeFallback(req: Request, res: Response) {
  const payload = getPayload(req);
  const profileId = payload.profileId ?? payload.profile_id;
  const toNumber = payload.to ?? payload.To ?? '';
  const fromNumber = payload.from ?? payload.From ?? '';
  const dialStatus = payload.DialCallStatus;
  const sipCode = payload.SipResponseCode;
  const shouldFallback = shouldFallbackDial(dialStatus, sipCode);

  const { VoiceResponse } = twilio.twiml;
  const twimlResponse = new VoiceResponse();
  if (!profileId || !shouldFallback) {
    twimlResponse.hangup();
    return res.type('text/xml').send(twimlResponse.toString());
  }

  const profile = await ensureProfileForFallback(profileId);
  if (!profile) {
    twimlResponse.hangup();
    return res.type('text/xml').send(twimlResponse.toString());
  }

  const destination = profile.fallback_phone_number || profile.phone_number || null;
  if (!destination) {
    appendHangupMessage(
      twimlResponse,
      'We could not complete this call right now. Please try again later.'
    );
    return res.type('text/xml').send(twimlResponse.toString());
  }

  if (
    numbersLikelyMatch(destination, profile.twilio_virtual_number) ||
    numbersLikelyMatch(destination, toNumber)
  ) {
    logger.warn(`Skipping fallback loop profile=${profile.id} destination=${destination} to=${toNumber}`);
    appendHangupMessage(
      twimlResponse,
      'We could not complete this call right now. Please try again later.'
    );
    return res.type('text/xml').send(twimlResponse.toString());
  }

  const dialStatusUrl = buildDialStatusUrl(req);
  const outboundCallerId = process.env.OUTBOUND_CALLER_ID || toNumber || profile.twilio_virtual_number || destination;
  logger.info(
    `Bridge fallback dial profile=${profile.id} status=${dialStatus ?? 'n/a'} sip=${sipCode ?? 'n/a'} destination=${destination}`
  );
  appendNumberBridge(twimlResponse, dialStatusUrl, outboundCallerId, destination);
  return res.type('text/xml').send(twimlResponse.toString());
}

async function ensureProfileForFallback(profileId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, phone_number, fallback_phone_number, twilio_virtual_number'
    )
    .eq('id', profileId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data;
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
      'id, caretaker_id, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud'
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
      caretaker_id: profile.caretaker_id,
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
    let voiceResult: VoiceAnalysisResult | null = null;
    try {
      voiceResult = await detectSyntheticVoice(recordingBuffer);
    } catch (err) {
      logger.err(
        `Synthetic voice detection failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    const { text, confidence } = await transcribeWavBuffer(recordingBuffer);
    let safePhraseMatches: string[] = [];
    if (text) {
      const { data: safeRows, error: safeError } = await supabaseAdmin
        .from('fraud_safe_phrases')
        .select('phrase')
        .eq('profile_id', profile.id);
      if (safeError) {
        logger.err(safeError);
      } else {
        safePhraseMatches = matchPhrases(
          text,
          safeRows?.map((row) => row.phrase) ?? []
        );
      }
    }
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
          voiceSyntheticScore: voiceResult?.score ?? null,
          voiceAnalysis: voiceResult ?? undefined,
          safePhraseMatches,
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
      voiceSyntheticScore: number | null;
      voiceBoost: number;
      voiceAnalysis?: VoiceAnalysisResult | null;
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
      const dampening =
        typeof fraudScore === 'number'
          ? Math.min(20, safePhraseMatches.length * 8)
          : 0;
      fraudNotes.safePhraseMatches = safePhraseMatches;
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
        voice_synthetic_score: voiceResult?.score ?? null,
        voice_analysis: voiceResult ?? null,
        voice_detected_at: voiceResult ? new Date().toISOString() : null,
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
            caretaker_id: profile.caretaker_id,
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
      if (profile.enable_push_alerts) {
        const { data: recentAlerts } = await supabaseAdmin
          .from('alerts')
          .select('id, call_id')
          .eq('profile_id', profile.id)
          .eq('call_id', callRow.id)
          .eq('alert_type', 'fraud')
          .order('created_at', { ascending: false })
          .limit(1);
        const latestAlert = recentAlerts?.[0];
        if (latestAlert) {
          const pushData: Record<string, string> = { type: 'fraud' };
          if (fraudRiskLevel) {
            pushData.riskLevel = fraudRiskLevel;
          }
          await dispatchAlertPush({
            id: latestAlert.id,
            profile_id: profile.id,
            call_id: latestAlert.call_id ?? callRow.id,
            alert_type: 'fraud',
            payload: {
              score: fraudScore,
              riskLevel: fraudRiskLevel,
              callerHash,
              ...pushData,
            },
          });
        }
      }
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

interface ProfilePinRow {
  id: string;
  pin_hash?: string | null;
  pin_pepper_version?: number | null;
  passcode_hash?: string | null;
}

interface PinValidationResult {
  valid: boolean;
  locked: boolean;
}

async function validateProfilePin(
  pin: string,
  profile: ProfilePinRow,
  clientIp?: string
): Promise<PinValidationResult> {
  const lockState = await getPinLockState(profile.id, clientIp);
  if (lockState.locked) {
    return { valid: false, locked: true };
  }

  let valid = false;
  if (profile.pin_hash) {
    valid = await verifyCurrentPasscode(
      pin,
      profile.pin_hash,
      profile.pin_pepper_version ?? CURRENT_PEPPER_VERSION
    );
  } else if (profile.passcode_hash) {
    valid = verifyLegacyPasscode(pin, profile.passcode_hash);
    if (valid) {
      try {
        const hashed = await hashPasscode(pin);
        await supabaseAdmin
          .from('profiles')
          .update({
            pin_hash: hashed.hash,
            pin_salt: hashed.salt,
            pin_pepper_version: hashed.pepperVersion,
            passcode_hash: null,
            pin_updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
        profile.pin_hash = hashed.hash;
        profile.pin_pepper_version = hashed.pepperVersion;
      } catch (err) {
        logger.err(err as Error);
      }
    }
  }

  await recordPinAttempt(profile.id, clientIp, valid);
  return { valid, locked: false };
}

export default {
  callIncoming,
  verifyPin,
  dialStatus,
  bridgeFallback,
  recordingReady,
};
