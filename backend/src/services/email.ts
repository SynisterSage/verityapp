import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const DEFAULT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Overrides the configured sender */
  from?: string;
}

/**
 * Send an email using Resend. The default sender address is the value of
 * `RESEND_FROM_EMAIL` (or Resend's sandbox address) so you can start sending
 * without owning a custom domain.
 */
export async function sendEmail(payload: SendEmailPayload) {
  if (!resendClient) {
    throw new Error('Missing RESEND_API_KEY. Set RESEND_API_KEY in your environment.');
  }

  await resendClient.emails.send({
    from: payload.from ?? DEFAULT_FROM_EMAIL,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  } as any);
}

export default { sendEmail };
