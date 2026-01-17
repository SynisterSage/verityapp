import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import ProfilesController from '@src/controllers/ProfilesController';
import ProfileMembersController from '@src/controllers/ProfileMembersController';
import TwilioClientController from '@src/controllers/TwilioClientController';

const router = Router();

router.get(PATHS.Profiles.Get, ProfilesController.listProfiles);
router.get(PATHS.Profiles.Update, ProfilesController.getProfile);
router.post(PATHS.Profiles.Create, ProfilesController.createProfile);
router.patch(PATHS.Profiles.Update, ProfilesController.updateProfile);
router.delete(PATHS.Profiles.Delete, ProfilesController.deleteProfile);
router.post(PATHS.Profiles.Passcode, ProfilesController.setPasscode);
router.patch(PATHS.Profiles.Alerts, ProfilesController.updateAlertPrefs);
router.post(PATHS.Profiles.Invites, ProfilesController.inviteMember);
router.get(PATHS.Profiles.Invites, ProfilesController.listInvites);
router.delete(PATHS.Profiles.Invite, ProfilesController.revokeInvite);
router.post(PATHS.Profiles.InviteAccept, ProfileMembersController.acceptInvite);
router.get(PATHS.Profiles.Members, ProfileMembersController.listMembers);
router.patch(PATHS.Profiles.Member, ProfileMembersController.changeMemberRole);
router.delete(PATHS.Profiles.Member, ProfileMembersController.removeMember);
router.post('/:profileId/twilio-client/token', TwilioClientController.createClientToken);
router.post('/:profileId/twilio-client/heartbeat', TwilioClientController.recordClientHeartbeat);

export default router;
