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
  inviteMemberSchema,
  acceptInviteSchema,
  changeMemberRoleSchema,
  registerDeviceTokenSchema,
  createClientTokenSchema,
  recordClientHeartbeatSchema,
} from '@src/middleware/validationSchemas';

const router = Router();

router.get(PATHS.Profiles.Get, ProfilesController.listProfiles);
router.get(PATHS.Profiles.Update, ProfilesController.getProfile);
router.post(PATHS.Profiles.Create, validateRequest(createProfileSchema), ProfilesController.createProfile);
router.patch(PATHS.Profiles.Update, validateRequest(updateProfileSchema), ProfilesController.updateProfile);
router.post(PATHS.Profiles.Export, ProfilesController.exportProfileData);
router.delete(PATHS.Profiles.Records, ProfilesController.clearProfileRecords);
router.delete(PATHS.Profiles.Delete, ProfilesController.deleteProfile);
router.post(PATHS.Profiles.PasscodeVerify, validateRequest(verifyPasscodeSchema), ProfilesController.verifyPasscode);
router.post(PATHS.Profiles.Passcode, validateRequest(setPasscodeSchema), ProfilesController.setPasscode);
router.post(PATHS.Profiles.Activity, validateRequest(recordActivitySchema), ProfilesController.recordActivity);
router.patch(PATHS.Profiles.Alerts, validateRequest(updateAlertPrefsSchema), ProfilesController.updateAlertPrefs);
router.post(PATHS.Profiles.Invites, validateRequest(inviteMemberSchema), ProfilesController.inviteMember);
router.get(PATHS.Profiles.Invites, ProfilesController.listInvites);
router.delete(PATHS.Profiles.Invite, ProfilesController.revokeInvite);
router.post(PATHS.Profiles.InviteAccept, validateRequest(acceptInviteSchema), ProfileMembersController.acceptInvite);
router.get(PATHS.Profiles.Members, ProfileMembersController.listMembers);
router.patch(PATHS.Profiles.Member, validateRequest(changeMemberRoleSchema), ProfileMembersController.changeMemberRole);
router.delete(PATHS.Profiles.Member, ProfileMembersController.removeMember);
router.post('/:profileId/twilio-client/token', validateRequest(createClientTokenSchema), TwilioClientController.createClientToken);
router.post('/:profileId/twilio-client/heartbeat', validateRequest(recordClientHeartbeatSchema), TwilioClientController.recordClientHeartbeat);
router.post(PATHS.Profiles.DeviceTokens, validateRequest(registerDeviceTokenSchema), ProfileDeviceTokensController.registerDeviceToken);
router.get(PATHS.Profiles.ProfessionalLookup, ProfessionalLookupController.search);

export default router;
