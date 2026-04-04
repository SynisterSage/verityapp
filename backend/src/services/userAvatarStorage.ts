import logger from 'jet-logger';
import supabaseAdmin from '@src/services/supabase';

const AVATARS_BUCKET = 'avatars';

/**
 * Uploads a user avatar image to Supabase Storage
 * @param userId - The user ID
 * @param imageBuffer - The image buffer (JPEG/PNG)
 * @param mimeType - The MIME type of the image
 * @returns The public URL of the uploaded avatar
 */
export async function uploadUserAvatar(
  userId: string,
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  try {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const fileName = `${userId}/${timestamp}.jpg`;

    // Upload to Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from(AVATARS_BUCKET)
      .upload(fileName, imageBuffer, {
        contentType: mimeType,
        upsert: false, // Create new file, don't overwrite
      });

    if (error) {
      logger.err(`Failed to upload avatar for user ${userId}: ${error.message}`);
      throw new Error(`Avatar upload failed: ${error.message}`);
    }

    if (!data?.path) {
      throw new Error('No path returned from upload');
    }

    // Get the public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from(AVATARS_BUCKET)
      .getPublicUrl(data.path);

    if (!publicUrlData?.publicUrl) {
      throw new Error('Failed to generate public URL');
    }

    // Update users table with the new avatar URL
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: publicUrlData.publicUrl })
      .eq('id', userId);

    if (updateError) {
      logger.err(`Failed to update user avatar_url: ${updateError.message}`);
      throw new Error(`Failed to save avatar URL: ${updateError.message}`);
    }

    logger.info(`Avatar uploaded successfully for user ${userId}`);
    return publicUrlData.publicUrl;
  } catch (error) {
    logger.err(`uploadUserAvatar error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Deletes a user's avatar from Supabase Storage
 * @param userId - The user ID
 * @param avatarUrl - The current avatar URL (to extract the path)
 */
export async function deleteUserAvatar(userId: string, avatarUrl?: string): Promise<void> {
  try {
    if (!avatarUrl) {
      logger.info(`No avatar URL provided for user ${userId}, skipping delete`);
    } else {
      // Extract path from URL: https://...avatars.supabase.co/storage/v1/object/public/avatars/{userId}/{timestamp}.jpg
      const pathMatch = avatarUrl.match(/avatars\/(.+?)\/(.+?)\.jpg$/);
      if (pathMatch) {
        const filePath = `${pathMatch[1]}/${pathMatch[2]}.jpg`;
        const { error } = await supabaseAdmin.storage.from(AVATARS_BUCKET).remove([filePath]);

        if (error) {
          logger.warn(`Failed to delete avatar file from storage: ${error.message}`);
          // Don't throw, continue to clear the URL
        }
      }
    }

    // Clear the avatar_url from the users table
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: null })
      .eq('id', userId);

    if (updateError) {
      logger.err(`Failed to clear avatar_url for user ${userId}: ${updateError.message}`);
      throw new Error(`Failed to remove avatar: ${updateError.message}`);
    }

    logger.info(`Avatar deleted for user ${userId}`);
  } catch (error) {
    logger.err(`deleteUserAvatar error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Validates image buffer
 * Checks file size and type
 */
export function validateImageBuffer(
  buffer: Buffer,
  maxSizeMB: number = 5
): { valid: boolean; error?: string } {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (buffer.length === 0) {
    return { valid: false, error: 'Image is empty' };
  }

  if (buffer.length > maxSizeBytes) {
    return { valid: false, error: `Image exceeds maximum size of ${maxSizeMB}MB` };
  }

  // Check for JPEG or PNG magic bytes
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;

  if (!isJpeg && !isPng) {
    return { valid: false, error: 'Image must be JPEG or PNG format' };
  }

  return { valid: true };
}
