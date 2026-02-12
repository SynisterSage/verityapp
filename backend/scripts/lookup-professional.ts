#!/usr/bin/env node
import fetch from 'node-fetch';

const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

type ArgMap = Record<string, string>;

function parseArgs(args: string[]): ArgMap {
  const map: ArgMap = {};
  args.forEach((arg) => {
    const [key, value] = arg.split('=');
    if (key.startsWith('--')) {
      map[key.replace(/^--/, '')] = value ?? '';
    }
  });
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profileId = args.profile || process.env.TEST_PROFILE_ID;
  const token = args.token || process.env.TEST_API_TOKEN;
  if (!profileId) {
    throw new Error('profile ID required (pass --profile=... or set TEST_PROFILE_ID)');
  }
  if (!token) {
    throw new Error('Auth token required (pass --token=... or set TEST_API_TOKEN)');
  }
  const baseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
  const params = new URLSearchParams();
  if (args.q) params.set('q', args.q);
  if (args.lat) params.set('lat', args.lat);
  if (args.lon) params.set('lon', args.lon);
  if (args.radius) params.set('radius', args.radius);
  if (args.limit) params.set('limit', args.limit);
  const url = `${baseUrl}/api/v1/profiles/${profileId}/professional-lookup?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Lookup failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error('Lookup failed', err);
  process.exit(1);
});
