import apn from 'apn';
import logger from 'jet-logger';
import supabaseAdmin from '@src/services/supabase';

let apnProvider: apn.Provider | null = null;

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
  callUuid?: string;
  profileId: string;
}

/**
 * Send VoIP push notification to wake the app and show incoming call
 * This will wake the iOS app from ANY state (killed, background, suspended)
 */
export async function sendVoIPPush(
  voipToken: string,
  payload: VoIPPushPayload
): Promise<boolean> {
  const provider = getApnProvider();
  if (!provider) {
    logger.warn('APNs provider not available, skipping VoIP push');
    return false;
  }

  const bundleId = process.env.IOS_BUNDLE_IDENTIFIER;
  if (!bundleId) {
    logger.err('IOS_BUNDLE_IDENTIFIER not set');
    return false;
  }

  // Create notification with MINIMAL configuration for VoIP
  const notification = new apn.Notification();
  notification.topic = `${bundleId}.voip`;
  notification.priority = 10;
  notification.expiry = Math.floor(Date.now() / 1000) + 60;
  notification.pushType = 'voip';

  // For VoIP pushes, payload must be at root level (not wrapped in 'aps')
  notification.payload = {
    call_sid: payload.callSid,
    from_number: payload.fromNumber,
    to_number: payload.toNumber,
    call_uuid: payload.callUuid || payload.callSid,
    profile_id: payload.profileId,
  };

  const isProduction = process.env.APNS_PRODUCTION === 'true';
  logger.info(`[VoIP] Sending: callSid=${payload.callSid} from=${payload.fromNumber}`);
  logger.info(`[VoIP] Config: token=${voipToken.substring(0, 16)}... env=${isProduction ? 'production' : 'development'} topic=${bundleId}.voip`);

  try {
    const result = await provider.send(notification, voipToken);

    if (result.failed.length > 0) {
      const failure = result.failed[0];
      logger.err(
        `VoIP push FAILED: token=${voipToken.substring(0, 8)}... reason=${failure?.response?.reason || 'unknown'} status=${failure?.status || 'unknown'}`
      );
      return false;
    }

    logger.info(
      `VoIP push sent: token=${voipToken.substring(0, 8)}... callSid=${payload.callSid}`
    );
    return true;
  } catch (error) {
    logger.err(`VoIP push error: ${error instanceof Error ? error.message : String(error)}`);
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
