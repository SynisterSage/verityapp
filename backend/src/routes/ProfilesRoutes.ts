import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import ProfilesController from '@src/controllers/ProfilesController';
import ProfileMembersController from '@src/controllers/ProfileMembersController';

const router = Router();

router.get(PATHS.Profiles.Get, ProfilesController.listProfiles);
router.post(PATHS.Profiles.Create, ProfilesController.createProfile);
router.patch(PATHS.Profiles.Update, ProfilesController.updateProfile);
router.delete(PATHS.Profiles.Delete, ProfilesController.deleteProfile);
router.post(PATHS.Profiles.Passcode, ProfilesController.setPasscode);
router.patch(PATHS.Profiles.Alerts, ProfilesController.updateAlertPrefs);
router.post(PATHS.Profiles.Invites, ProfilesController.inviteMember);
router.get(PATHS.Profiles.Invites, ProfilesController.listInvites);
router.post(PATHS.Profiles.InviteAccept, ProfileMembersController.acceptInvite);
router.get(PATHS.Profiles.Members, ProfileMembersController.listMembers);
router.delete(PATHS.Profiles.Member, ProfileMembersController.removeMember);

export default router;
