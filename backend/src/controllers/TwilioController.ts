import { Request, Response } from 'express';
import crypto from 'crypto';
import logger from 'jet-logger';
import twilio from 'twilio';
import fetch from 'node-fetch';
import supabaseAdmin from '@src/services/supabase';
import { transcribeWavBuffer } from '@src/services/azure';

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

function verifyPinHash(pin: string, stored?: string | null) {
  if (!pin || !stored) {
    return false;
  }
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) {
    return false;
  }
  const derived = crypto.scryptSync(pin, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}
/**
 * Respond to Twilio when a call comes in. We play a greeting, record the voicemail,
 * and point recordingStatusCallback to our recording-ready webhook.
 */
function callIncoming(req: Request, res: Response) {
  const callbackUrl = buildRecordingCallbackUrl(req);
  const verifyUrl = buildVerifyPinUrl(req);
  const { VoiceResponse } = twilio.twiml;
  const twimlResponse = new VoiceResponse();
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
  twimlResponse.say({ voice: 'Polly.Joanna' }, 'No passcode received. Please leave a message.');
  twimlResponse.record({
    recordingStatusCallback: callbackUrl,
    recordingStatusCallbackMethod: 'POST',
    maxLength: 120,
    playBeep: true,
    trim: 'trim-silence',
    finishOnKey: '#',
  });
  twimlResponse.hangup();
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
  const callbackUrl = buildRecordingCallbackUrl(req);
  const dialStatusUrl = buildDialStatusUrl(req);
  const { VoiceResponse } = twilio.twiml;
  const twimlResponse = new VoiceResponse();

  const profile = await getProfileByToNumber(toNumber);
  if (!profile) {
    twimlResponse.say(
      { voice: 'Polly.Joanna' },
      'We could not verify this call. Please leave a message.'
    );
    twimlResponse.record({
      recordingStatusCallback: callbackUrl,
      recordingStatusCallbackMethod: 'POST',
      maxLength: 120,
      playBeep: true,
      trim: 'trim-silence',
      finishOnKey: '#',
    });
    twimlResponse.hangup();
    return res.type('text/xml').send(twimlResponse.toString());
  }

  const isValid = verifyPinHash(pin, profile.passcode_hash);
  logger.info(
    `Verify pin result to=${toNumber} pin_len=${pin.length} valid=${isValid} phone=${profile.phone_number ?? 'none'}`
  );
  const bridgeEnabled = process.env.ENABLE_CALL_BRIDGE === 'true';
  if (isValid && profile.phone_number && bridgeEnabled) {
    const outboundCallerId = process.env.OUTBOUND_CALLER_ID || toNumber;
    logger.info(
      `Dialing profile_number=${profile.phone_number} callerId=${outboundCallerId}`
    );
    twimlResponse.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting your call.');
    const dial = twimlResponse.dial({
      callerId: outboundCallerId,
      timeout: 20,
      answerOnBridge: true,
    });
    dial.number(
      {
        statusCallback: dialStatusUrl,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      },
      profile.phone_number
    );
    return res.type('text/xml').send(twimlResponse.toString());
  }

  if (isValid && !bridgeEnabled) {
    twimlResponse.say(
      { voice: 'Polly.Joanna' },
      'Thank you. Please leave a message.'
    );
  } else {
    twimlResponse.say(
      { voice: 'Polly.Joanna' },
      'Passcode not accepted. Please leave a message.'
    );
  }
  twimlResponse.record({
    recordingStatusCallback: callbackUrl,
    recordingStatusCallbackMethod: 'POST',
    maxLength: 120,
    playBeep: true,
    trim: 'trim-silence',
    finishOnKey: '#',
  });
  twimlResponse.hangup();
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
  } = getPayload(req);
  const wavUrl = getRecordingUrl(RecordingUrl);
  const resolvedTo = await resolveToNumber(CallSid, To);
  logger.info(
    `Twilio recording ready CallSid=${CallSid} RecordingSid=${RecordingSid} status=${RecordingStatus} url=${wavUrl} To=${resolvedTo}`
  );
  if (!RecordingSid || !wavUrl || !resolvedTo) {
    return res.status(204).end();
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('twilio_virtual_number', resolvedTo)
    .single();

  if (profileError || !profile) {
    logger.warn(
      `No profile found for To=${resolvedTo} error=${profileError?.message ?? 'none'}`
    );
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
    await supabaseAdmin
      .from('calls')
      .update({
        storage_path: storagePath,
        transcript: text || null,
        transcript_confidence: confidence ?? null,
        transcribed_at: text ? new Date().toISOString() : null,
      })
      .eq('id', callRow.id);
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
