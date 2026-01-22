import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';

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

export default function validateTwilioSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const shouldValidate = process.env.TWILIO_VALIDATE_SIGNATURE === 'true';
  if (!shouldValidate) {
    return next();
  }

  const signature = req.header('x-twilio-signature') ?? '';
  if (!signature) {
    return res.status(403).json({ error: 'Missing Twilio signature' });
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  if (!authToken) {
    return res.status(500).json({ error: 'Missing TWILIO_AUTH_TOKEN' });
  }

  const url = `${getPublicBaseUrl(req)}${req.originalUrl}`;
  const params = req.method === 'GET' ? req.query : req.body;
  const isValid = twilio.validateRequest(authToken, signature, url, params);

  if (!isValid) {
    return res.status(403).json({ error: 'Invalid Twilio signature' });
  }

  return next();
}
