# Twilio Local Webhook Setup (ngrok)

This note captures the current local Twilio webhook setup, what is working, and what remains.

## What we implemented
- Twilio webhook routes:
  - `POST /api/v1/webhook/twilio/call-incoming`
  - `POST /api/v1/webhook/twilio/recording-ready`
  - `GET /api/v1/webhook/twilio/recording-ready` (Twilio sent a GET callback)
- TwiML response:
  - Greeting + `<Record>` with `recordingStatusCallback` set to the same ngrok host.
- Logs:
  - `call-incoming` and `recording-ready` handlers log to the backend console via `jet-logger`.
- API base path:
  - Updated to `/api/v1` to match the webhook URLs used in Twilio and curl.

## Working flow
1. Run the backend: `cd backend && npm run dev` (server on port 3000).
2. Run ngrok: `ngrok http 3000` and copy the HTTPS URL.
3. Twilio phone number:
   - "A call comes in" webhook should be:
     `https://<ngrok-host>.ngrok-free.dev/api/v1/webhook/twilio/call-incoming`
4. Place a real call to the Twilio number.
5. You should see:
   - `call-incoming` log (200)
   - `recording-ready` log (204) with CallSid/RecordingSid/RecordingUrl

## Known behavior
- Twilio sent `recording-ready` as a GET with query params, not a POST body.
- We handle both methods and read from `req.query` when the body is empty.

## Next steps
- Download the recording file from `RecordingUrl` in the `recording-ready` handler.
- Upload to Supabase Storage and store metadata in Supabase.
- Run Azure Speech-to-Text and log/store transcripts.
- Add fraud scoring and alert sending (Resend) after transcription.
- Add signature validation using `TWILIO_WEBHOOK_SECRET` for production.
