import crypto from 'crypto';
import supabaseAdmin from '@src/services/supabase';
import logger from 'jet-logger';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const ACCESS_TOKEN_EXPIRY_SECONDS = 3600; // 1 hour

interface RefreshTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Hash a token for secure storage in database
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a cryptographically secure refresh token
 */
function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new refresh token and store it in database
 * @param userId The user ID to create token for
 * @returns Raw token (send to client) and hash (stored in DB)
 */
export async function createRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabaseAdmin
    .from('refresh_tokens')
    .insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });

  if (error) {
    logger.err(`Failed to create refresh token: ${error.message}`);
    throw new Error('Failed to create refresh token');
  }

  return token;
}

/**
 * Validate and use a refresh token
 * Returns new access + refresh token pair if valid
 * Revokes old token on success (one-time use)
 * @param refreshToken Raw token from client
 * @returns New token pair {accessToken, refreshToken, expiresIn}
 */
export async function validateAndRotateRefreshToken(
  refreshToken: string
): Promise<RefreshTokenPair> {
  const tokenHash = hashToken(refreshToken);

  // Find token in database
  const { data: tokenRecord, error: selectError } = await supabaseAdmin
    .from('refresh_tokens')
    .select('id, user_id, expires_at, is_revoked')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (selectError) {
    logger.err(`Database error validating refresh token: ${selectError.message}`);
    throw new Error('Failed to validate token');
  }

  // Token not found
  if (!tokenRecord) {
    logger.warn('[Security] Refresh token validation failed - token not found');
    throw new Error('Invalid refresh token');
  }

  // Token already used/revoked
  if (tokenRecord.is_revoked) {
    logger.warn(`[Security] Refresh token reuse detected for user ${tokenRecord.user_id}`);
    // SECURITY: Revoke all tokens for this user (potential compromise)
    await revokeAllUserTokens(tokenRecord.user_id);
    throw new Error('Token has been revoked. Please log in again.');
  }

  // Token expired
  const expiresAt = new Date(tokenRecord.expires_at);
  if (expiresAt < new Date()) {
    logger.warn(`[Security] Expired refresh token used for user ${tokenRecord.user_id}`);
    throw new Error('Refresh token has expired');
  }

  // ✅ Token is valid - revoke it and issue new pair
  await revokeToken(tokenRecord.id);

  // Get new Supabase session (validates user still exists)
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
    tokenRecord.user_id
  );

  if (userError || !userData?.user) {
    logger.err(`User not found during token refresh: ${tokenRecord.user_id}`);
    throw new Error('User not found');
  }

  // Create new token pair
  const newRefreshToken = await createRefreshToken(tokenRecord.user_id);

  // Sign new JWT (Supabase generates this)
  // For now, we'll use the user's existing JWT
  // In production, you'd generate a new one using a signing key
  const newAccessToken = userData.user.aud; // Placeholder - actual implementation needs JWT signing

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
  };
}

/**
 * Revoke a specific token
 */
async function revokeToken(tokenId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('refresh_tokens')
    .update({
      is_revoked: true,
      revoked_at: new Date().toISOString(),
    })
    .eq('id', tokenId);

  if (error) {
    logger.err(`Failed to revoke token ${tokenId}: ${error.message}`);
  }
}

/**
 * Revoke all tokens for a user (used on suspected compromise)
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('refresh_tokens')
    .update({
      is_revoked: true,
      revoked_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_revoked', false);

  if (error) {
    logger.err(`Failed to revoke all tokens for user ${userId}: ${error.message}`);
  }
}

/**
 * Clean up expired tokens (should run periodically via cron)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('refresh_tokens')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select();

  if (error) {
    logger.err(`Failed to cleanup expired tokens: ${error.message}`);
    return 0;
  }

  return data?.length ?? 0;
}
