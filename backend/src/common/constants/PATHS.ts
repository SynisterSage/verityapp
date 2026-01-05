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
  },
} as const;

export const JET_PATHS = jetPaths(PATHS);
export default PATHS;
