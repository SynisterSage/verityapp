import logger from 'jet-logger';

import ENV from '@src/common/constants/ENV';
import server from './server';


/******************************************************************************
                                Constants
******************************************************************************/

const portFromEnv = Number(process.env.PORT ?? '');
const fallbackPort = Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : ENV.Port;
const normalizedPort = fallbackPort ?? 4000;
const SERVER_START_MSG = `Express server started on port: ${normalizedPort}`;

// Start the server
server.listen(normalizedPort, (err?: Error) => {
  if (err) {
    logger.err(err.message);
  } else {
    logger.info(SERVER_START_MSG);
  }
});
