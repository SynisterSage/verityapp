import jetPaths from 'jet-paths';

const PATHS = {
  _: '/api/v1',
  Users: {
    _: '/users',
    Get: '/all',
    Add: '/add',
    Update: '/update',
    Delete: '/delete/:id',
  },
  Calls: {
    _: '/calls',
    RecordingUrl: '/:callId/recording-url',
    Feedback: '/:callId/feedback',
  },
  Alerts: {
    _: '/alerts',
    Update: '/:alertId',
  },
  Auth: {
    _: '/auth',
    ResetPassword: '/reset-password',
  },
  Webhooks: {
    _: '/webhook',
    AppleAppStoreNotifications: '/apple/app-store-notifications',
  },
  Subscriptions: {
    _: '/subscriptions',
    Status: '/status',
    Verify: '/verify',
    SyncEntitlement: '/sync-entitlement',
    FacilityValidate: '/facility-offer/validate',
    FacilityResolveToken: '/facility-offer/resolve-token',
  },
  Fraud: {
    _: '/fraud',
    SafePhrases: '/safe-phrases',
    BlockedCallers: '/blocked-callers',
  },
  Profiles: {
    _: '/profiles',
    InviteResolveToken: '/invites/resolve-token',
    Get: '/',
    Create: '/',
    Update: '/:profileId',
    Delete: '/:profileId',
    Passcode: '/:profileId/passcode',
    PasscodeVerify: '/:profileId/passcode/verify',
    Alerts: '/:profileId/alerts',
    ContactsPermission: '/:profileId/contacts-permission',
    Activity: '/:profileId/activity',
    Invites: '/:profileId/invites',
    Invite: '/:profileId/invites/:inviteId',
    Members: '/:profileId/members',
    Member: '/:profileId/members/:memberId',
    InviteAccept: '/invites/:inviteId/accept',
    Records: '/:profileId/records',
    Export: '/:profileId/export',
    DeviceTokens: '/:profileId/device-tokens',
    ProfessionalLookup: '/:profileId/professional-lookup',
    Support: '/:profileId/support',
  },
} as const;

export const JET_PATHS = jetPaths(PATHS);
export default PATHS;
