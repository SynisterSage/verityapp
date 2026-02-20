import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import ProfilesController from '@src/controllers/ProfilesController';
import ProfileMembersController from '@src/controllers/ProfileMembersController';
import ProfileDeviceTokensController from '@src/controllers/ProfileDeviceTokensController';
import TwilioClientController from '@src/controllers/TwilioClientController';
import ProfessionalLookupController from '@src/controllers/ProfessionalLookupController';
import { validateRequest } from '@src/middleware/validateRequest';
import {
  createProfileSchema,
  updateProfileSchema,
  setPasscodeSchema,
  verifyPasscodeSchema,
  recordActivitySchema,
  updateAlertPrefsSchema,
  updateContactsPermissionSchema,
  inviteMemberSchema,
  acceptInviteSchema,
  changeMemberRoleSchema,
  registerDeviceTokenSchema,
  createClientTokenSchema,
  recordClientHeartbeatSchema,
  recordClientCallLifecycleSchema,
  updateVoIPTokenSchema,
  sensitiveActionPasscodeSchema,
} from '@src/middleware/validationSchemas';

const router = Router();

router.get(PATHS.Profiles.Get, ProfilesController.listProfiles);
router.get(PATHS.Profiles.Update, ProfilesController.getProfile);
router.post(PATHS.Profiles.Create, validateRequest(createProfileSchema), ProfilesController.createProfile);
router.patch(PATHS.Profiles.Update, validateRequest(updateProfileSchema), ProfilesController.updateProfile);
router.post(
  PATHS.Profiles.Export,
  validateRequest(sensitiveActionPasscodeSchema),
  ProfilesController.exportProfileData
);
router.delete(
  PATHS.Profiles.Records,
  validateRequest(sensitiveActionPasscodeSchema),
  ProfilesController.clearProfileRecords
);
router.delete(
  PATHS.Profiles.Delete,
  validateRequest(sensitiveActionPasscodeSchema),
  ProfilesController.deleteProfile
);
router.post(PATHS.Profiles.PasscodeVerify, validateRequest(verifyPasscodeSchema), ProfilesController.verifyPasscode);
router.post(PATHS.Profiles.Passcode, validateRequest(setPasscodeSchema), ProfilesController.setPasscode);
router.post(PATHS.Profiles.Activity, validateRequest(recordActivitySchema), ProfilesController.recordActivity);
router.patch(PATHS.Profiles.Alerts, validateRequest(updateAlertPrefsSchema), ProfilesController.updateAlertPrefs);
router.patch(
  PATHS.Profiles.ContactsPermission,
  validateRequest(updateContactsPermissionSchema),
  ProfilesController.updateContactsPermission
);
router.post(PATHS.Profiles.Invites, validateRequest(inviteMemberSchema), ProfilesController.inviteMember);
router.get(PATHS.Profiles.Invites, ProfilesController.listInvites);
router.delete(PATHS.Profiles.Invite, ProfilesController.revokeInvite);
router.post(PATHS.Profiles.InviteAccept, validateRequest(acceptInviteSchema), ProfileMembersController.acceptInvite);
router.get(PATHS.Profiles.Members, ProfileMembersController.listMembers);
router.patch(PATHS.Profiles.Member, validateRequest(changeMemberRoleSchema), ProfileMembersController.changeMemberRole);
router.delete(PATHS.Profiles.Member, ProfileMembersController.removeMember);
router.post('/:profileId/twilio-client/token', validateRequest(createClientTokenSchema), TwilioClientController.createClientToken);
router.post('/:profileId/twilio-client/heartbeat', validateRequest(recordClientHeartbeatSchema), TwilioClientController.recordClientHeartbeat);
router.post(
  '/:profileId/twilio-client/call-lifecycle',
  validateRequest(recordClientCallLifecycleSchema),
  (req, res) => TwilioClientController.recordCallLifecycle(req, res)
);
router.get('/:profileId/twilio-client/active-call', (req, res) =>
  TwilioClientController.getActiveCall(req, res)
);
router.post(PATHS.Profiles.DeviceTokens, validateRequest(registerDeviceTokenSchema), ProfileDeviceTokensController.registerDeviceToken);
router.put('/:profileId/voip-token', validateRequest(updateVoIPTokenSchema), ProfilesController.updateVoIPToken);
router.get(PATHS.Profiles.ProfessionalLookup, ProfessionalLookupController.search);

export default router;
