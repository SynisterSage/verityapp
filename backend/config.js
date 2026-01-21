/* eslint-disable n/no-process-env */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const moduleAlias = require('module-alias');

const NODE_ENV = process.env.NODE_ENV ?? 'development';

const envPath = path.join(__dirname, `./config/.env.${NODE_ENV}`);
const result2 = fs.existsSync(envPath) ? dotenv.config({ path: envPath }) : null;
if (result2?.error) {
  throw result2.error;
}

if (__filename.endsWith('js')) {
  moduleAlias.addAlias('@src', __dirname + '/dist');
}
