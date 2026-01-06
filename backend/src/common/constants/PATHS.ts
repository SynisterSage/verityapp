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
  Fraud: {
    _: '/fraud',
    SafePhrases: '/safe-phrases',
    BlockedCallers: '/blocked-callers',
  },
  Profiles: {
    _: '/profiles',
    Get: '/',
    Create: '/',
    Update: '/:profileId',
    Delete: '/:profileId',
    Passcode: '/:profileId/passcode',
    Alerts: '/:profileId/alerts',
    Invites: '/:profileId/invites',
  },
} as const;

export const JET_PATHS = jetPaths(PATHS);
export default PATHS;
