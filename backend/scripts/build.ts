import path from 'path';
import fs from 'fs-extra';
import logger from 'jet-logger';
import { copy, copyFilesRec, exec, remove } from './common/utils';

/******************************************************************************
                                  Run
******************************************************************************/

/**
 * Start
 */
(async () => {
  try {
    // Remove current build
    await remove('./dist/');
    if (process.env.SKIP_LINT !== 'true') {
      await exec('npm run lint', '../');
    }
    await exec('tsc --project tsconfig.prod.json', '../');
    // Copy
    await copyFilesRec('./src', './dist', ['.ts']);
    await copy('./temp/config.js', './config.js');
    await copy('./temp/src', './dist');
    const voiceDetectorSrc = path.resolve(__dirname, '../voice-detector');
    const voiceDetectorDest = path.resolve(__dirname, '../dist/voice-detector');
    if (await fs.pathExists(voiceDetectorSrc)) {
      await copyFilesRec(voiceDetectorSrc, voiceDetectorDest);
    } else {
      logger.warn(`Voice detector dir not found (skipping): ${voiceDetectorSrc}`);
    }
    await remove('./temp/');
  } catch (err) {
    logger.err(err);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
})();

