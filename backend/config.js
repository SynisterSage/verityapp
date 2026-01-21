/* eslint-disable n/no-process-env */

const path = require('path');
const dotenv = require('dotenv');
const moduleAlias = require('module-alias');

const NODE_ENV = process.env.NODE_ENV ?? 'development';

const result2 = dotenv.config({
  path: path.join(__dirname, `./config/.env.${NODE_ENV}`),
});

if (result2.error) {
  throw result2.error;
}

if (__filename.endsWith('js')) {
  moduleAlias.addAlias('@src', __dirname + '/dist');
}
