/* eslint-disable n/no-process-env */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import moduleAlias from 'module-alias';


// Check the env
const NODE_ENV = (process.env.NODE_ENV ?? 'development');

// Configure "dotenv"
const envPath = path.join(__dirname, `./config/.env.${NODE_ENV}`);
const result2 = fs.existsSync(envPath) ? dotenv.config({ path: envPath }) : null;
if (result2?.error) {
  throw result2.error;
}

// Configure moduleAlias
if (__filename.endsWith('js')) {
  moduleAlias.addAlias('@src', __dirname + '/dist');
}
