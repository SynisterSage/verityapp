import apn from 'apn';
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import logger from 'jet-logger';
import supabaseAdmin from '@src/services/supabase';

let apnProvider: apn.Provider | null = null;
let apnsSigningKeyCache: string | null = null;

/**
 * Initialize APNs provider for VoIP push notifications
 * Supports two modes:
 * 1. File path (local dev): APNS_AUTH_KEY_PATH
 * 2. Direct key content (cloud/Render): APNS_AUTH_KEY
 */
function getApnProvider(): apn.Provider | null {
  if (apnProvider) {
    return apnProvider;
  }

  const authKeyPath = process.env.APNS_AUTH_KEY_PATH;
  const authKeyContent = process.env.APNS_AUTH_KEY;
  const authKeyId = process.env.APNS_AUTH_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.IOS_BUNDLE_IDENTIFIER;
  const production = process.env.APNS_PRODUCTION === 'true';

  // Need either path or content
  if ((!authKeyPath && !authKeyContent) || !authKeyId || !teamId || !bundleId) {
    logger.warn('APNs VoIP push not configured. Missing environment variables:');
    logger.warn(`  APNS_AUTH_KEY or APNS_AUTH_KEY_PATH: ${authKeyContent || authKeyPath ? 'set' : 'missing'}`);
    logger.warn(`  APNS_AUTH_KEY_ID: ${authKeyId ? 'set' : 'missing'}`);
    logger.warn(`  APNS_TEAM_ID: ${teamId ? 'set' : 'missing'}`);
    logger.warn(`  IOS_BUNDLE_IDENTIFIER: ${bundleId ? 'set' : 'missing'}`);
    return null;
  }

  try {
    // Use direct key content if provided (for cloud deployment),
    // otherwise use file path (for local development)
    const tokenConfig = authKeyContent
      ? {
          key: authKeyContent,
          keyId: authKeyId,
          teamId: teamId,
        }
      : {
          key: authKeyPath!,
          keyId: authKeyId,
          teamId: teamId,
        };

    apnProvider = new apn.Provider({
      token: tokenConfig,
      production,
    });

    logger.info(`APNs VoIP provider initialized (${production ? 'production' : 'development'})`);
    logger.info(`APNs using ${authKeyContent ? 'direct key content' : 'key file path'}`);
    return apnProvider;
  } catch (error) {
    logger.err('Failed to initialize APNs provider:', error);
    return null;
  }
}

export interface VoIPPushPayload {
  callSid: string;
  fromNumber: string;
  toNumber: string;
  callerName?: string;
  callUuid?: string;
  profileId: string;
}

function getApnsSigningKey(): string {
  if (apnsSigningKeyCache) {
    return apnsSigningKeyCache;
  }

  const inlineKey = process.env.APNS_AUTH_KEY;
  if (inlineKey && inlineKey.trim().length > 0) {
    // Render and other env providers often store newlines as "\n".
    apnsSigningKeyCache = inlineKey.includes('\\n') ? inlineKey.replace(/\\n/g, '\n') : inlineKey;
    return apnsSigningKeyCache;
  }

  const keyPath = process.env.APNS_AUTH_KEY_PATH;
  if (keyPath && keyPath.trim().length > 0) {
    apnsSigningKeyCache = readFileSync(keyPath, 'utf8');
    return apnsSigningKeyCache;
  }

  throw new Error('Missing APNS_AUTH_KEY or APNS_AUTH_KEY_PATH');
}

/**
 * Generate APNs JWT token for authentication
 */
function generateAPNsToken(): string {
  const authKeyId = process.env.APNS_AUTH_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;

  if (!authKeyId || !teamId) {
    throw new Error('Missing APNs credentials');
  }

  const token = jwt.sign({}, getApnsSigningKey(), {
    algorithm: 'ES256',
    keyid: authKeyId,
    issuer: teamId,
    expiresIn: '1h',
  });

  return token;
}

/**
 * Send VoIP push notification using raw HTTP/2 to APNs
 * This will wake the iOS app from ANY state (killed, background, suspended)
 */
export async function sendVoIPPush(
  voipToken: string,
  payload: VoIPPushPayload
): Promise<boolean> {
  const bundleId = process.env.IOS_BUNDLE_IDENTIFIER;
  const isProduction = process.env.APNS_PRODUCTION === 'true';

  if (!bundleId) {
    logger.err('IOS_BUNDLE_IDENTIFIER not set');
    return false;
  }

  // VoIP pushes MUST have data at root level without 'aps' wrapper
  const voipPayload = {
    call_sid: payload.callSid,
    from_number: payload.fromNumber,
    to_number: payload.toNumber,
    caller_name: payload.callerName,
    call_uuid: payload.callUuid || payload.callSid,
    profile_id: payload.profileId,
  };

  logger.info(`[VoIP] Sending: callSid=${payload.callSid} from=${payload.fromNumber}`);
  logger.info(`[VoIP] Config: token=${voipToken.substring(0, 16)}... env=${isProduction ? 'production' : 'development'} topic=${bundleId}.voip`);
  logger.info(`[VoIP] Payload: ${JSON.stringify(voipPayload)}`);

  try {
    const authToken = generateAPNsToken();
    const apnsHost = isProduction ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
    const path = `/3/device/${voipToken}`;

    return new Promise((resolve, reject) => {
      const client = http2.connect(`https://${apnsHost}`);

      client.on('error', (err) => {
        logger.err(`[VoIP] HTTP/2 connection error: ${err.message}`);
        client.close();
        reject(err);
      });

      const expirationTimestamp = Math.floor(Date.now() / 1000) + 60;

      const req = client.request({
        ':method': 'POST',
        ':path': path,
        ':scheme': 'https',
        'authorization': `bearer ${authToken}`,
        'apns-topic': `${bundleId}.voip`,
        'apns-push-type': 'voip',
        'apns-priority': '10',
        'apns-expiration': String(expirationTimestamp),
      });

      req.setEncoding('utf8');
      req.write(JSON.stringify(voipPayload));
      req.end();

      let responseData = '';
      let responseStatus = 0;
      let responseHeaders: any = {};

      req.on('response', (headers) => {
        responseStatus = Number(headers[':status']) || 0;
        responseHeaders = headers;
        logger.info(`[VoIP] APNs response status: ${responseStatus}`);
        if (headers['apns-id']) {
          logger.info(`[VoIP] APNs ID: ${headers['apns-id']}`);
        }
      });

      req.on('data', (chunk) => {
        responseData += chunk;
      });

      req.on('end', () => {
        client.close();

        if (responseStatus === 200) {
          logger.info(`[VoIP] Push delivered to APNs: token=${voipToken.substring(0, 8)}... callSid=${payload.callSid}`);
          resolve(true);
        } else {
          logger.err(`[VoIP] APNs rejected push: status=${responseStatus}`);
          logger.err(`[VoIP] Response body: ${responseData}`);
          logger.err(`[VoIP] Response headers: ${JSON.stringify(responseHeaders)}`);
          resolve(false);
        }
      });

      req.on('error', (err) => {
        logger.err(`[VoIP] Request error: ${err.message}`);
        client.close();
        resolve(false);
      });
    });
  } catch (error) {
    logger.err(`[VoIP] Push error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Send VoIP push to a profile by looking up their token
 */
export async function sendVoIPPushToProfile(
  profileId: string,
  payload: Omit<VoIPPushPayload, 'profileId'>
): Promise<boolean> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('voip_push_token')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    logger.err(`Failed to fetch profile VoIP token: ${error.message}`);
    return false;
  }

  if (!profile?.voip_push_token) {
    logger.warn(`No VoIP push token for profile ${profileId}`);
    return false;
  }

  return sendVoIPPush(profile.voip_push_token, {
    ...payload,
    profileId,
  });
}

/**
 * Cleanup APNs provider on shutdown
 */
export function shutdownVoIPPush(): void {
  if (apnProvider) {
    apnProvider.shutdown();
    apnProvider = null;
    logger.info('APNs VoIP provider shut down');
  }
}
