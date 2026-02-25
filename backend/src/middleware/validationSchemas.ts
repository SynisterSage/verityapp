import { z } from 'zod';

/**
 * Validation schemas for API request bodies
 * These ensure all incoming data matches expected types and constraints
 */

// Auth Schemas
export const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
  redirectUrl: z.string().url('Invalid redirect URL').optional(),
});

export const checkEmailSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const legalAcceptanceSchema = z
  .object({
    terms_version: z.string().min(1).max(64),
    privacy_version: z.string().min(1).max(64),
    accepted_at: z.string().datetime().optional(),
    source: z.string().min(1).max(64).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .strict();

// Profile Schemas
export const createProfileSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100, 'First name too long'),
  last_name: z.string().min(1, 'Last name is required').max(100, 'Last name too long'),
  phone_number: z.string().regex(/^[\d+\-().x\s]*$/, 'Invalid phone number format').optional().nullable(),
  fallback_phone_number: z
    .string()
    .regex(/^[\d+\-().x\s]*$/, 'Invalid fallback phone number format')
    .optional()
    .nullable(),
  twilio_virtual_number: z.string().regex(/^\+?1?\d{10,}$/, 'Invalid Twilio number format').optional().nullable(),
  address: z.string().max(300, 'Address too long').optional().nullable(),
  city: z.string().max(100, 'City name too long').optional().nullable(),
  state: z.string().length(2, 'State must be 2 characters').optional().nullable(),
  zip_code: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format').optional().nullable(),
  alert_threshold_score: z.number().min(0).max(100, 'Alert threshold must be 0-100').optional(),
  enable_email_alerts: z.boolean().optional(),
  enable_sms_alerts: z.boolean().optional(),
  enable_push_alerts: z.boolean().optional(),
  auto_mark_enabled: z.boolean().optional(),
  auto_mark_fraud_threshold: z.number().min(0).max(100).optional(),
  auto_mark_safe_threshold: z.number().min(0).max(100).optional(),
  auto_trust_on_safe: z.boolean().optional(),
  auto_block_on_fraud: z.boolean().optional(),
});

export const updateProfileSchema = createProfileSchema.partial().strict();

export const setPasscodeSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits'),
  safety_pin: z.string().regex(/^\d{4,8}$/, 'Safety PIN must be 4-8 digits').optional(),
});

export const verifyPasscodeSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
});

export const sensitiveActionPasscodeSchema = z
  .object({
    pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
  })
  .strict();

export const recordActivitySchema = z.object({
  alertType: z.enum([
    'circle_invite',
    'pin_change',
    'safe_phrase_added',
    'trusted_contact_added',
    'blocked_caller_added',
    'security_password',
    'member_joined',
    'member_role_changed',
    'member_removed',
    'automation_settings_updated',
    'data_exported',
    'data_cleared',
  ]),
  payload: z.record(z.string(), z.any()).optional(),
  status: z.enum(['pending', 'acknowledged', 'resolved']).optional(),
}).strict();

export const updateAlertPrefsSchema = z.object({
  enable_email_alerts: z.boolean().optional(),
  enable_sms_alerts: z.boolean().optional(),
  enable_push_alerts: z.boolean().optional(),
  enable_push_trusted_activity: z.boolean().optional(),
  enable_push_circle_activity: z.boolean().optional(),
  enable_push_support_replies: z.boolean().optional(),
  enable_email_weekly_reports: z.boolean().optional(),
  alert_threshold_score: z.number().min(0).max(100).optional(),
  auto_mark_enabled: z.boolean().optional(),
  auto_mark_fraud_threshold: z.number().min(0).max(100).optional(),
  auto_mark_safe_threshold: z.number().min(0).max(100).optional(),
  auto_trust_on_safe: z.boolean().optional(),
  auto_block_on_fraud: z.boolean().optional(),
}).strict();

export const updateContactsPermissionSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  role: z.enum(['editor', 'admin']).optional(),
});

export const acceptInviteSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const changeMemberRoleSchema = z.object({
  member_id: z.string().uuid('Invalid member ID'),
  role: z.enum(['editor', 'admin']),
});

export const registerDeviceTokenSchema = z.object({
  expoPushToken: z.string().min(10, 'Invalid device token').optional(),
  platform: z.enum(['ios', 'android']).optional(),
  // Backward-compat field names
  device_token: z.string().min(10, 'Invalid device token').optional(),
  device_type: z.enum(['ios', 'android']).optional(),
  device_name: z.string().max(100).optional(),
  locale: z.string().max(50).optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
}).refine(
  (value) =>
    (Boolean(value.expoPushToken) && Boolean(value.platform)) ||
    (Boolean(value.device_token) && Boolean(value.device_type)),
  {
    message: 'expoPushToken/platform (or device_token/device_type) is required',
  }
);

// Twilio Client Schemas
export const createClientTokenSchema = z.object({
  identity: z.string().optional(),
});

export const recordClientHeartbeatSchema = z.object({
  timestamp: z.number().int().positive().optional(),
  status: z.enum(['active', 'idle', 'away']).optional(),
});

export const recordClientCallLifecycleSchema = z.object({
  callSid: z.string().min(4, 'callSid is required'),
  callUuid: z.string().optional(),
  direction: z.enum(['incoming', 'outgoing']).optional(),
  state: z.enum([
    'ringing',
    'connecting',
    'connected',
    'reconnecting',
    'disconnected',
    'failed',
    'ended',
  ]),
  fromNumber: z.string().max(100).optional().nullable(),
  toNumber: z.string().max(150).optional().nullable(),
  toClientIdentity: z.string().max(150).optional().nullable(),
  eventAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updateVoIPTokenSchema = z.object({
  voipPushToken: z.string().min(10, 'Invalid VoIP push token'),
});

// Number Assignment Schema
export const assignNumberSchema = z.object({
  // Optional body - most data comes from URL params and auth
  source: z.enum(['onboarding', 'manual']).optional(),
});

export const createSupportMessageSchema = z.object({
  content: z.string().min(1, 'Message is required').max(2000, 'Message is too long'),
  category: z.string().max(100, 'Category too long').optional(),
  metadata: z.record(z.any(), z.string()).optional(),
});

export const createSupportBugReportSchema = z
  .object({
    topic: z.string().min(1, 'Topic is required').max(80, 'Topic is too long'),
    details: z.string().min(10, 'Details are too short').max(3000, 'Details are too long'),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .strict();

export const verifySubscriptionReceiptSchema = z
  .object({
    receiptData: z.string().min(20, 'receiptData is required'),
    platform: z.literal('ios').optional(),
    productId: z.string().min(1).max(128).optional(),
    transactionId: z.string().min(1).max(128).optional(),
    originalTransactionId: z.string().min(1).max(128).optional(),
  })
  .strict();

// Type exports for use in controllers
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;
export type LegalAcceptanceRequest = z.infer<typeof legalAcceptanceSchema>;
export type CreateProfileRequest = z.infer<typeof createProfileSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type SetPasscodeRequest = z.infer<typeof setPasscodeSchema>;
export type VerifyPasscodeRequest = z.infer<typeof verifyPasscodeSchema>;
export type SensitiveActionPasscodeRequest = z.infer<typeof sensitiveActionPasscodeSchema>;
export type RecordActivityRequest = z.infer<typeof recordActivitySchema>;
export type UpdateAlertPrefsRequest = z.infer<typeof updateAlertPrefsSchema>;
export type UpdateContactsPermissionRequest = z.infer<typeof updateContactsPermissionSchema>;
export type InviteMemberRequest = z.infer<typeof inviteMemberSchema>;
export type AcceptInviteRequest = z.infer<typeof acceptInviteSchema>;
export type ChangeMemberRoleRequest = z.infer<typeof changeMemberRoleSchema>;
export type RegisterDeviceTokenRequest = z.infer<typeof registerDeviceTokenSchema>;
export type CreateClientTokenRequest = z.infer<typeof createClientTokenSchema>;
export type RecordClientHeartbeatRequest = z.infer<typeof recordClientHeartbeatSchema>;
export type RecordClientCallLifecycleRequest = z.infer<typeof recordClientCallLifecycleSchema>;
export type AssignNumberRequest = z.infer<typeof assignNumberSchema>;
export type CreateSupportMessageRequest = z.infer<typeof createSupportMessageSchema>;
export type CreateSupportBugReportRequest = z.infer<typeof createSupportBugReportSchema>;
export type VerifySubscriptionReceiptRequest = z.infer<typeof verifySubscriptionReceiptSchema>;
