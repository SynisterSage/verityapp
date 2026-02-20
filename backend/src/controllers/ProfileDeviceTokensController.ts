import { Request, Response } from 'express';
import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { getAuthenticatedUserId, userCanAccessProfile } from '@src/common/util/auth';

function isMissingUserIdColumnError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string } | null)?.message ??
      (error as { message?: string; details?: string } | null)?.details ??
      ''
  );
  return (
    message.includes("Could not find the 'user_id' column of 'profile_device_tokens'") ||
    message.includes('profile_device_tokens.user_id')
  );
}

async function registerDeviceToken(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    logger.warn(`[device-tokens] unauthorized request profile=${req.params?.profileId ?? 'missing'}`);
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId?: string };
  if (!profileId) {
    logger.warn(`[device-tokens] missing profileId user=${userId}`);
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .maybeSingle();

  if (profileError || !profileRow?.caretaker_id) {
    logger.warn(`[device-tokens] profile not found user=${userId} profile=${profileId}`);
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Profile not found' });
  }

  if (!(await userCanAccessProfile(userId, profileId))) {
    logger.warn(`[device-tokens] forbidden user=${userId} profile=${profileId}`);
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const {
    expoPushToken: rawExpoPushToken,
    device_token: legacyDeviceToken,
    platform: rawPlatform,
    device_type: legacyDeviceType,
    locale,
    metadata,
  } = req.body as {
    expoPushToken?: string;
    device_token?: string;
    platform?: string;
    device_type?: string;
    locale?: string;
    metadata?: Record<string, any>;
  };
  const expoPushToken = rawExpoPushToken ?? legacyDeviceToken;
  const platform = rawPlatform ?? legacyDeviceType;

  if (!expoPushToken || !platform) {
    logger.warn(`[device-tokens] invalid payload user=${userId} profile=${profileId} hasToken=${Boolean(expoPushToken)} hasPlatform=${Boolean(platform)}`);
    return res.status(HTTP_STATUS_CODES.BadRequest).json({
      error: 'expoPushToken and platform are required',
    });
  }

  logger.info(
    `[device-tokens] upsert start user=${userId} profile=${profileId} platform=${platform} tokenPreview=${expoPushToken.slice(0, 14)}...`
  );

  const payload = {
    profile_id: profileId,
    caretaker_id: profileRow.caretaker_id,
    user_id: userId,
    expo_push_token: expoPushToken,
    platform,
    locale: locale ?? null,
    metadata: metadata ?? null,
    is_active: true,
    last_seen_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('profile_device_tokens')
    .upsert(payload, { onConflict: 'profile_id,expo_push_token', ignoreDuplicates: false })
    .select(
      'id, profile_id, user_id, expo_push_token, platform, locale, metadata, is_active, last_seen_at, created_at, updated_at'
    )
    .maybeSingle();

  if (error && !isMissingUserIdColumnError(error)) {
    logger.err(error);
    logger.err(
      `[device-tokens] upsert failed user=${userId} profile=${profileId} message=${error.message}`
    );
    return res
      .status(HTTP_STATUS_CODES.InternalServerError)
      .json({ error: 'Failed to register device' });
  }

  if (error && isMissingUserIdColumnError(error)) {
    logger.warn(
      `[device-tokens] user_id missing in profile_device_tokens; using legacy upsert user=${userId} profile=${profileId}`
    );

    const legacyPayload = {
      profile_id: profileId,
      caretaker_id: profileRow.caretaker_id,
      expo_push_token: expoPushToken,
      platform,
      locale: locale ?? null,
      metadata: metadata ?? null,
      is_active: true,
      last_seen_at: new Date().toISOString(),
    };

    const { data: legacyData, error: legacyError } = await supabaseAdmin
      .from('profile_device_tokens')
      .upsert(legacyPayload, { onConflict: 'profile_id,expo_push_token', ignoreDuplicates: false })
      .select(
        'id, profile_id, expo_push_token, platform, locale, metadata, is_active, last_seen_at, created_at, updated_at'
      )
      .maybeSingle();

    if (legacyError) {
      logger.err(legacyError);
      logger.err(
        `[device-tokens] legacy upsert failed user=${userId} profile=${profileId} message=${legacyError.message}`
      );
      return res
        .status(HTTP_STATUS_CODES.InternalServerError)
        .json({ error: 'Failed to register device' });
    }

    logger.info(
      `[device-tokens] legacy upsert success user=${userId} profile=${profileId} row=${legacyData?.id ?? 'none'}`
    );
    return res.status(HTTP_STATUS_CODES.Ok).json({ device: legacyData });
  }

  logger.info(`[device-tokens] upsert success user=${userId} profile=${profileId} row=${data?.id ?? 'none'}`);

  return res.status(HTTP_STATUS_CODES.Ok).json({ device: data });
}

export default {
  registerDeviceToken,
};
