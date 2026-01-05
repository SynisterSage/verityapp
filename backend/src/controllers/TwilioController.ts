import { Request, Response } from 'express';
import logger from 'jet-logger';
import twilio from 'twilio';

const DEFAULT_GREETING = 'Hello from SafeCall. Please leave a message after the beep, and we will alert your caretaker if anything looks suspicious.';

/**
 * Build an absolute URL that points back at our recording-ready endpoint.
 * We derive the host from the incoming request so ngrok + production both work.
 */
function buildRecordingCallbackUrl(req: Request) {
  const protocol = req.protocol;
  const host = req.get('host') ?? 'localhost:3000';
  return new URL('/api/v1/webhook/twilio/recording-ready', `${protocol}://${host}`).toString();
}

/**
 * Respond to Twilio when a call comes in. We play a greeting, record the voicemail,
 * and point recordingStatusCallback to our recording-ready webhook.
 */
function callIncoming(req: Request, res: Response) {
  const callbackUrl = buildRecordingCallbackUrl(req);
  const { VoiceResponse } = twilio.twiml;
  const twimlResponse = new VoiceResponse();
  twimlResponse.say({ voice: 'Polly.Joanna' }, DEFAULT_GREETING);
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
function recordingReady(req: Request, res: Response) {
  const payload = req.body && Object.keys(req.body).length > 0 ? req.body : req.query;
  const {
    CallSid,
    RecordingSid,
    RecordingUrl,
    RecordingStatus,
  } = (payload ?? {}) as Record<string, string | undefined>;
  logger.info(
    `Twilio recording ready CallSid=${CallSid} RecordingSid=${RecordingSid} status=${RecordingStatus} url=${RecordingUrl}`
  );
  return res.status(204).end();
}

export default {
  callIncoming,
  recordingReady,
};
