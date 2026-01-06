import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import ProfilesController from '@src/controllers/ProfilesController';

const router = Router();

router.get(PATHS.Profiles.Get, ProfilesController.listProfiles);
router.post(PATHS.Profiles.Create, ProfilesController.createProfile);
router.post(PATHS.Profiles.Passcode, ProfilesController.setPasscode);
router.patch(PATHS.Profiles.Alerts, ProfilesController.updateAlertPrefs);
router.post(PATHS.Profiles.Invites, ProfilesController.inviteMember);
router.get(PATHS.Profiles.Invites, ProfilesController.listInvites);

export default router;
