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

// Profile Schemas
export const createProfileSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100, 'First name too long'),
  last_name: z.string().min(1, 'Last name is required').max(100, 'Last name too long'),
  phone_number: z.string().regex(/^[\d+\-().x\s]*$/, 'Invalid phone number format').optional().nullable(),
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
  pin: z.string().min(1, 'PIN is required'),
});

export const recordActivitySchema = z.object({
  activity_type: z.enum(['call_answered', 'call_missed', 'message_sent', 'login']),
  details: z.record(z.string(), z.any()).optional(),
});

export const updateAlertPrefsSchema = z.object({
  enable_email_alerts: z.boolean().optional(),
  enable_sms_alerts: z.boolean().optional(),
  enable_push_alerts: z.boolean().optional(),
  alert_threshold_score: z.number().min(0).max(100).optional(),
  auto_mark_enabled: z.boolean().optional(),
  auto_mark_fraud_threshold: z.number().min(0).max(100).optional(),
  auto_mark_safe_threshold: z.number().min(0).max(100).optional(),
  auto_trust_on_safe: z.boolean().optional(),
  auto_block_on_fraud: z.boolean().optional(),
}).strict();

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
  device_token: z.string().min(10, 'Invalid device token'),
  device_type: z.enum(['ios', 'android']),
  device_name: z.string().max(100).optional(),
});

// Twilio Client Schemas
export const createClientTokenSchema = z.object({
  identity: z.string().optional(),
});

export const recordClientHeartbeatSchema = z.object({
  timestamp: z.number().int().positive().optional(),
  status: z.enum(['active', 'idle', 'away']).optional(),
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

// Type exports for use in controllers
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;
export type CreateProfileRequest = z.infer<typeof createProfileSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type SetPasscodeRequest = z.infer<typeof setPasscodeSchema>;
export type VerifyPasscodeRequest = z.infer<typeof verifyPasscodeSchema>;
export type RecordActivityRequest = z.infer<typeof recordActivitySchema>;
export type UpdateAlertPrefsRequest = z.infer<typeof updateAlertPrefsSchema>;
export type InviteMemberRequest = z.infer<typeof inviteMemberSchema>;
export type AcceptInviteRequest = z.infer<typeof acceptInviteSchema>;
export type ChangeMemberRoleRequest = z.infer<typeof changeMemberRoleSchema>;
export type RegisterDeviceTokenRequest = z.infer<typeof registerDeviceTokenSchema>;
export type CreateClientTokenRequest = z.infer<typeof createClientTokenSchema>;
export type RecordClientHeartbeatRequest = z.infer<typeof recordClientHeartbeatSchema>;
export type AssignNumberRequest = z.infer<typeof assignNumberSchema>;
export type CreateSupportMessageRequest = z.infer<typeof createSupportMessageSchema>;
