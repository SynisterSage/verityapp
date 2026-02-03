import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzeTranscript } from '@src/services/fraud';

const SCAM_FILE = path.resolve(__dirname, '../tests/English_Scam.txt');
const HIT_KEYS = [
  'hardBlockHits',
  'piiHarvestHits',
  'paymentRequestHits',
  'giftCardHits',
  'grandchildHits',
  'sweepstakesHits',
  'romanceHits',
  'jobLoanHits',
  'charityHits',
  'utilityHits',
  'techSupportHits',
  'remoteAccessHits',
  'governmentImpersonationHits',
  'emailHits',
  'linkHits',
  'threatHits',
  'investmentHits',
  'medicalScamHits',
  'callbackHits',
  'safePhraseMatches',
];

type Entry = {
  number: number;
  transcript: string;
};

function parseEntries(contents: string): Entry[] {
  const regex = /^\s*(\d+)\.\s+([\s\S]*?)(?=^\s*\d+\.|\s*$)/gms;
  const entries: Entry[] = [];

  let match;
  while ((match = regex.exec(contents)) !== null) {
    const [, number, transcript] = match;
    entries.push({
      number: Number(number),
      transcript: transcript.replace(/\s+/g, ' ').trim(),
    });
  }

  return entries;
}

function formatHits(notes: Record<string, unknown>) {
  return HIT_KEYS.map((key) => {
    const value = (notes as any)[key];
    if (Array.isArray(value)) {
      return value.length ? `${key}:${value.length}` : null;
    }
    if (typeof value === 'number' && value > 0) {
      return `${key}:${value}`;
    }
    return null;
  })
    .filter(Boolean)
    .join(', ');
}

const LOW_SCORE_THRESHOLD = Number(process.env.LOW_SCORE_THRESHOLD ?? 60);

async function main() {
  const raw = await readFile(SCAM_FILE, 'utf8');
  const entries = parseEntries(raw);
  if (!entries.length) {
    console.error('No transcripts found in', SCAM_FILE);
    process.exit(1);
  }

  const riskTotals: Record<'low' | 'medium' | 'high' | 'critical', number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const lowEntries: Array<{ number: number; score: number; text: string }> = [];

  entries.forEach((entry) => {
    const result = analyzeTranscript(entry.transcript);
    riskTotals[result.riskLevel]++;
    if (result.score <= LOW_SCORE_THRESHOLD) {
      lowEntries.push({
        number: entry.number,
        score: result.score,
        text: entry.transcript,
      });
    }
    console.log(
      `[${entry.number}] score=${result.score} risk=${result.riskLevel} hits=${formatHits(
        result.notes
      )}`
    );
  });

  if (lowEntries.length > 0) {
    console.log('\ntranscripts <=', LOW_SCORE_THRESHOLD);
    for (const entry of lowEntries) {
      console.log(
        `  [${entry.number}] score=${entry.score} text=${entry.text.slice(0, 140)}${
          entry.text.length > 140 ? '...' : ''
        }`
      );
    }
  }

  console.log('risk distribution', riskTotals);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
