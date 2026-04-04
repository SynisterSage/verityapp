import { Request, Response } from 'express';
import logger from 'jet-logger';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { getAuthenticatedUserId } from '@src/common/util/auth';
import {
  uploadUserAvatar,
  deleteUserAvatar,
  validateImageBuffer,
} from '@src/services/userAvatarStorage';
import supabaseAdmin from '@src/services/supabase';

const UsersController = {
  /**
   * POST /users/:userId/avatar
   * Upload or update a user's avatar
   * Expects: base64-encoded image in request body
   */
  async uploadAvatar(req: Request, res: Response) {
    try {
      const userId = req.params.userId;
      const authenticatedUserId = await getAuthenticatedUserId(req);

      // Verify user is uploading their own avatar
      if (!authenticatedUserId || authenticatedUserId !== userId) {
        return res.status(HTTP_STATUS_CODES.Unauthorized).json({
          error: 'You can only upload your own avatar',
        });
      }

      const { imageData, mimeType } = req.body;

      // Validate input
      if (!imageData || typeof imageData !== 'string') {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({
          error: 'imageData is required and must be a string',
        });
      }

      if (!mimeType || !['image/jpeg', 'image/png', 'image/heic'].includes(mimeType)) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({
          error: 'mimeType must be image/jpeg, image/png, or image/heic',
        });
      }

      // Convert base64 to buffer
      let imageBuffer: Buffer;
      try {
        imageBuffer = Buffer.from(imageData, 'base64');
      } catch (error) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({
          error: 'Invalid base64 image data',
        });
      }

      // Validate image buffer
      const validation = validateImageBuffer(imageBuffer);
      if (!validation.valid) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({
          error: validation.error,
        });
      }

      // Upload to storage
      const avatarUrl = await uploadUserAvatar(userId, imageBuffer, mimeType);

      return res.status(HTTP_STATUS_CODES.Ok).json({
        success: true,
        avatar_url: avatarUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.err(`Avatar upload error: ${message}`);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({
        error: message,
      });
    }
  },

  /**
   * DELETE /users/:userId/avatar
   * Remove a user's avatar
   */
  async deleteAvatar(req: Request, res: Response) {
    try {
      const userId = req.params.userId;
      const authenticatedUserId = await getAuthenticatedUserId(req);

      // Verify user is deleting their own avatar
      if (!authenticatedUserId || authenticatedUserId !== userId) {
        return res.status(HTTP_STATUS_CODES.Unauthorized).json({
          error: 'You can only delete your own avatar',
        });
      }

      // Get current user's profile to find avatar URL
      const { data: profiles, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('avatar_url')
        .eq('caretaker_id', userId)
        .order('created_at', { ascending: true })
        .limit(1);

      if (fetchError || !profiles || profiles.length === 0) {
        return res.status(HTTP_STATUS_CODES.NotFound).json({
          error: 'Profile not found',
        });
      }

      // Delete avatar
      await deleteUserAvatar(userId, profiles[0].avatar_url);

      return res.status(HTTP_STATUS_CODES.Ok).json({
        success: true,
        message: 'Avatar deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.err(`Avatar delete error: ${message}`);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({
        error: message,
      });
    }
  },
};

export default UsersController;
