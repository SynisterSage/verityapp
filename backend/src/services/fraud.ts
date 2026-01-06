import { createHash } from 'crypto';

export type FraudRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type FraudKeyword = {
  phrase: string;
  weight: number;
  category: string;
};

export type FraudNotes = {
  matchCount: number;
  weightSum: number;
  comboBoost: number;
  negatedMatches: string[];
  urgencyHits: number;
  secrecyHits: number;
  impersonationHits: number;
  paymentAppHits: number;
  codeRequestHits: number;
  explicitScamHits: number;
  paymentRequestHits: number;
  hardBlockHits: number;
  threatHits: number;
  accountAccessHits: number;
  moneyAmountHits: number;
  criticalKeywordHits: number;
  safePhraseMatches: string[];
  safePhraseDampening: number;
  repeatCallerBoost: number;
};

export type FraudAnalysis = {
  score: number;
  riskLevel: FraudRiskLevel;
  matchedKeywords: string[];
  notes: FraudNotes;
};

const DEFAULT_KEYWORDS: FraudKeyword[] = [
  // Explicit scam intent
  { phrase: 'scam', weight: 40, category: 'explicit' },
  { phrase: 'scammer', weight: 40, category: 'explicit' },
  { phrase: 'scamming', weight: 40, category: 'explicit' },
  { phrase: "i'm gonna scam", weight: 45, category: 'explicit' },
  { phrase: 'i am going to scam', weight: 45, category: 'explicit' },
  { phrase: 'scam you', weight: 45, category: 'explicit' },
  { phrase: 'take your money', weight: 40, category: 'explicit' },
  { phrase: 'take all your money', weight: 45, category: 'explicit' },
  { phrase: 'steal your money', weight: 40, category: 'explicit' },
  { phrase: 'steal money', weight: 38, category: 'explicit' },
  { phrase: 'rob you', weight: 38, category: 'explicit' },
  { phrase: 'rob your', weight: 38, category: 'explicit' },
  { phrase: 'drain your account', weight: 40, category: 'explicit' },
  { phrase: 'empty your account', weight: 40, category: 'explicit' },
  { phrase: 'criminal', weight: 30, category: 'explicit' },
  { phrase: 'give me your money', weight: 38, category: 'explicit' },
  { phrase: 'send me your money', weight: 38, category: 'explicit' },
  { phrase: 'pay me', weight: 32, category: 'explicit' },
  { phrase: 'payment information', weight: 34, category: 'explicit' },

  // Banking & finance
  { phrase: 'wire money', weight: 20, category: 'banking' },
  { phrase: 'send money', weight: 20, category: 'banking' },
  { phrase: 'payment', weight: 30, category: 'banking' },
  { phrase: 'verify account', weight: 20, category: 'banking' },
  { phrase: 'confirm credit card', weight: 22, category: 'banking' },
  { phrase: 'account number', weight: 28, category: 'banking' },
  { phrase: 'routing number', weight: 28, category: 'banking' },
  { phrase: 'bank account', weight: 26, category: 'banking' },
  { phrase: 'bank', weight: 20, category: 'banking' },
  { phrase: 'refund', weight: 20, category: 'banking' },
  { phrase: 'overdraft', weight: 20, category: 'banking' },
  { phrase: 'password', weight: 20, category: 'banking' },
  { phrase: 'pin', weight: 20, category: 'banking' },
  { phrase: 'atm', weight: 20, category: 'banking' },
  { phrase: 'deposit', weight: 12, category: 'banking' },
  { phrase: 'withdraw', weight: 12, category: 'banking' },
  { phrase: 'balance', weight: 12, category: 'banking' },
  { phrase: 'transaction', weight: 12, category: 'banking' },
  { phrase: 'billing', weight: 12, category: 'banking' },

  // Government & taxes
  { phrase: 'irs', weight: 20, category: 'government' },
  { phrase: 'fbi', weight: 20, category: 'government' },
  { phrase: 'social security', weight: 20, category: 'government' },
  { phrase: 'legal action', weight: 20, category: 'government' },
  { phrase: 'arrest', weight: 20, category: 'government' },
  { phrase: 'tax refund', weight: 20, category: 'government' },
  { phrase: 'tax return', weight: 20, category: 'government' },
  { phrase: 'federal', weight: 18, category: 'government' },
  { phrase: 'law enforcement', weight: 18, category: 'government' },
  { phrase: 'compliance', weight: 14, category: 'government' },
  { phrase: 'audit', weight: 14, category: 'government' },
  { phrase: 'license', weight: 14, category: 'government' },
  { phrase: 'penalty', weight: 14, category: 'government' },

  // Tech support
  { phrase: 'microsoft', weight: 20, category: 'tech' },
  { phrase: 'apple', weight: 20, category: 'tech' },
  { phrase: 'microsoft support', weight: 20, category: 'tech' },
  { phrase: 'virus', weight: 18, category: 'tech' },
  { phrase: 'malware', weight: 18, category: 'tech' },
  { phrase: 'update', weight: 14, category: 'tech' },
  { phrase: 'install', weight: 14, category: 'tech' },
  { phrase: 'computer', weight: 14, category: 'tech' },
  { phrase: 'system', weight: 14, category: 'tech' },
  { phrase: 'repair', weight: 14, category: 'tech' },
  { phrase: 'access', weight: 14, category: 'tech' },
  { phrase: 'remote access', weight: 20, category: 'tech' },

  // Prize/lottery
  { phrase: 'congratulations', weight: 20, category: 'prize' },
  { phrase: 'winner', weight: 20, category: 'prize' },
  { phrase: 'prize', weight: 20, category: 'prize' },
  { phrase: 'claim', weight: 18, category: 'prize' },
  { phrase: 'reward', weight: 18, category: 'prize' },
  { phrase: 'lottery', weight: 18, category: 'prize' },
  { phrase: 'free', weight: 12, category: 'prize' },
  { phrase: 'gift', weight: 14, category: 'prize' },

  // Donations & charities
  { phrase: 'charity donation', weight: 30, category: 'donation' },
  { phrase: 'donate now', weight: 30, category: 'donation' },
  { phrase: 'emergency relief', weight: 28, category: 'donation' },
  { phrase: 'disaster fund', weight: 28, category: 'donation' },
  { phrase: 'orphanage', weight: 26, category: 'donation' },
  { phrase: "children's hospital", weight: 26, category: 'donation' },
  { phrase: 'donation', weight: 26, category: 'donation' },
  { phrase: 'charity', weight: 26, category: 'donation' },
  { phrase: 'fundraiser', weight: 22, category: 'donation' },
  { phrase: 'nonprofit', weight: 22, category: 'donation' },
  { phrase: 'give now', weight: 22, category: 'donation' },
  { phrase: 'pledge', weight: 18, category: 'donation' },
  { phrase: 'sponsor', weight: 18, category: 'donation' },
  { phrase: 'support our cause', weight: 18, category: 'donation' },
  { phrase: 'tax deductible', weight: 16, category: 'donation' },
  { phrase: 'organization', weight: 16, category: 'donation' },
  { phrase: 'call back', weight: 14, category: 'donation' },

  // Gift cards & crypto
  { phrase: 'gift card', weight: 28, category: 'payment' },
  { phrase: 'google play card', weight: 20, category: 'payment' },
  { phrase: 'apple gift card', weight: 20, category: 'payment' },
  { phrase: 'steam card', weight: 20, category: 'payment' },
  { phrase: 'crypto', weight: 26, category: 'payment' },
  { phrase: 'bitcoin', weight: 26, category: 'payment' },
  { phrase: 'wallet address', weight: 18, category: 'payment' },
  { phrase: 'western union', weight: 18, category: 'payment' },
  { phrase: 'moneygram', weight: 18, category: 'payment' },
  { phrase: 'zelle', weight: 35, category: 'payment' },
  { phrase: 'cash app', weight: 30, category: 'payment' },
  { phrase: 'venmo', weight: 30, category: 'payment' },
  { phrase: 'paypal', weight: 26, category: 'payment' },
  { phrase: 'give me your zelle', weight: 45, category: 'payment' },
  { phrase: 'gift card number', weight: 24, category: 'payment' },
  { phrase: 'scratch off', weight: 22, category: 'payment' },
  { phrase: 'load the card', weight: 22, category: 'payment' },
  { phrase: 'bitcoin atm', weight: 22, category: 'payment' },

  // Urgency/pressure
  { phrase: 'immediately', weight: 18, category: 'urgency' },
  { phrase: 'urgent', weight: 18, category: 'urgency' },
  { phrase: 'now', weight: 18, category: 'urgency' },
  { phrase: 'right away', weight: 18, category: 'urgency' },
  { phrase: 'today only', weight: 18, category: 'urgency' },
  { phrase: 'limited time', weight: 18, category: 'urgency' },
  { phrase: 'expire', weight: 14, category: 'urgency' },
  { phrase: 'deadline', weight: 14, category: 'urgency' },
  { phrase: "don't wait", weight: 14, category: 'urgency' },

  // Impersonation & account takeover
  { phrase: 'fraud department', weight: 22, category: 'impersonation' },
  { phrase: 'suspicious activity', weight: 20, category: 'impersonation' },
  { phrase: 'account locked', weight: 20, category: 'impersonation' },
  { phrase: 'account frozen', weight: 20, category: 'impersonation' },
  { phrase: 'one time password', weight: 22, category: 'impersonation' },
  { phrase: 'one time code', weight: 22, category: 'impersonation' },
  { phrase: 'verification code', weight: 22, category: 'impersonation' },
  { phrase: 'security code', weight: 24, category: 'impersonation' },
  { phrase: 'passcode', weight: 24, category: 'impersonation' },
  { phrase: 'ssn', weight: 28, category: 'impersonation' },
  { phrase: 'social security number', weight: 30, category: 'impersonation' },
];

const NEGATION_MARKERS = ['not ', 'never ', "don't ", 'do not ', 'did not ', 'no '];

const COMBO_RULES = [
  { all: ['scam', 'zelle'], add: 25 },
  { all: ['scam', 'payment'], add: 20 },
  { all: ['scam', 'money'], add: 20 },
  { all: ['give me your money', 'payment'], add: 20 },
  { all: ['gift card', 'urgent'], add: 12 },
  { all: ['wire money', 'bank'], add: 10 },
  { all: ['social security', 'verify'], add: 12 },
  { all: ['donation', 'gift card'], add: 12 },
  { all: ['charity', 'immediately'], add: 10 },
  { all: ['donation', 'charity'], add: 12 },
  { all: ['charity', 'call back'], add: 10 },
  { all: ['donation', 'organization'], add: 10 },
  { all: ['remote access', 'computer'], add: 10 },
  { all: ['verification code', 'bank'], add: 12 },
  { all: ['one time code', 'account'], add: 12 },
  { all: ['zelle', 'urgent'], add: 10 },
  { all: ['paypal', 'urgent'], add: 10 },
];

const URGENCY_TERMS = [
  'immediately',
  'urgent',
  'right away',
  'today only',
  'limited time',
  'act now',
  'asap',
];

const SECRECY_TERMS = [
  'keep this secret',
  'do not tell',
  "don't tell",
  'stay on the line',
  "don't hang up",
  'do not hang up',
  'confidential',
];

const THREAT_TERMS = [
  'arrest',
  'warrant',
  'lawsuit',
  'legal action',
  'court',
  'jail',
  'police',
  'sheriff',
  'federal agent',
  'deportation',
];

const ACCOUNT_ACCESS_TERMS = [
  'password',
  'pin',
  'passcode',
  'login',
  'verify account',
  'account number',
  'routing number',
  'bank account',
  'ssn',
  'social security',
];

const IMPERSONATION_TERMS = [
  'this is the bank',
  'bank calling',
  'fraud department',
  'irs',
  'social security administration',
  'law enforcement',
  'sheriff',
  'police',
  'dea',
  'microsoft support',
  'apple support',
  'amazon support',
  'from the organization',
];

const PAYMENT_APPS = ['zelle', 'cash app', 'venmo', 'paypal'];

const CODE_TERMS = [
  'verification code',
  'one time code',
  'one-time code',
  'security code',
  'otp',
];

const EXPLICIT_SCAM_TERMS = [
  'scam',
  'scammer',
  'scamming',
  "i'm gonna scam",
  'i am going to scam',
  'scam you',
  'take your money',
  'take all your money',
  'steal your money',
  'steal money',
  'rob you',
  'rob your',
  'drain your account',
  'empty your account',
  'criminal',
  'give me your money',
  'send me your money',
  'pay me',
];

const HARD_BLOCK_TERMS = [
  'gift card',
  'gift card number',
  'zelle',
  'cash app',
  'venmo',
  'paypal',
  'bitcoin',
  'crypto',
  'wire money',
  'verification code',
  'one time code',
  'one-time code',
  'security code',
  'social security number',
  'ssn',
  'account number',
  'routing number',
  'bank account',
  'give me your money',
  'send me your money',
  'steal your money',
  'take your money',
  'take all your money',
];

const PAYMENT_REQUEST_PATTERNS = [
  /\b(give|send|wire|pay)\s+me\s+(your\s+)?(zelle|cash app|venmo|paypal|bank|account|card|money)\b/i,
  /\b(i\s+need\s+your)\s+(zelle|cash app|venmo|paypal|bank|account|card|money)\b/i,
];

const HARD_BLOCK_PATTERNS = [
  /\b(give|send|wire|pay)\s+me\s+(all\s+)?(your\s+)?(money|cash|funds)\b/i,
  /\b(give|send|wire|pay)\s+me\s+(your\s+)?(zelle|cash app|venmo|paypal|bank|account|card)\b/i,
  /\b(social security|ssn)\b/i,
  /\bverification code\b/i,
];

const MONEY_AMOUNT_PATTERNS = [
  /\$\s?\d{2,}/,
  /\b\d{2,}\s?(dollars|bucks)\b/,
];

const CRITICAL_KEYWORDS = new Set([
  'zelle',
  'cash app',
  'venmo',
  'paypal',
  'gift card',
  'gift card number',
  'bitcoin',
  'crypto',
  'wire money',
  'send money',
  'payment information',
  'verification code',
  'one time code',
  'one-time code',
  'security code',
  'ssn',
  'social security number',
  'account number',
  'routing number',
  'bank account',
  'wallet address',
  'bitcoin atm',
  'scam',
  'scammer',
  'scamming',
  "i'm gonna scam",
  'i am going to scam',
  'scam you',
  'take your money',
  'take all your money',
  'steal your money',
  'steal money',
  'rob you',
  'drain your account',
  'empty your account',
  'give me your money',
  'send me your money',
  'payment',
]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchPhrases(text: string, phrases: string[]) {
  const normalized = normalizeText(text);
  if (!normalized || phrases.length === 0) {
    return [];
  }
  const matches = new Set<string>();
  for (const phrase of phrases) {
    const cleaned = normalizeText(phrase);
    if (!cleaned) {
      continue;
    }
    const pattern = `\\b${escapeRegExp(cleaned).replace(/\\s+/g, '\\\\s+')}\\b`;
    const regex = new RegExp(pattern, 'i');
    if (regex.test(normalized)) {
      matches.add(phrase);
    }
  }
  return Array.from(matches.values());
}

function countPhraseHits(text: string, phrases: string[]) {
  return phrases.reduce((count, phrase) => {
    const pattern = `\\b${escapeRegExp(phrase).replace(/\\s+/g, '\\\\s+')}\\b`;
    const regex = new RegExp(pattern, 'i');
    return regex.test(text) ? count + 1 : count;
  }, 0);
}

function isNegated(text: string, index: number) {
  const windowStart = Math.max(0, index - 40);
  const window = text.slice(windowStart, index);
  return NEGATION_MARKERS.some((marker) => window.includes(marker));
}

function findMatches(text: string, keywords: FraudKeyword[]) {
  const matches: FraudKeyword[] = [];
  const negated: string[] = [];

  for (const keyword of keywords) {
    const pattern = `\\b${escapeRegExp(keyword.phrase).replace(/\\s+/g, '\\\\s+')}\\b`;
    const regex = new RegExp(pattern, 'gi');
    let match = regex.exec(text);
    let matched = false;
    while (match) {
      const idx = match.index ?? 0;
      if (isNegated(text, idx)) {
        negated.push(keyword.phrase);
      } else {
        matched = true;
      }
      match = regex.exec(text);
    }
    if (matched) {
      matches.push(keyword);
    }
  }

  const uniqueMatches = Array.from(
    new Map(matches.map((kw) => [kw.phrase, kw])).values()
  );

  return { matches: uniqueMatches, negated };
}

function comboBoost(text: string) {
  let boost = 0;
  for (const rule of COMBO_RULES) {
    if (rule.all.every((kw) => text.includes(kw))) {
      boost += rule.add;
    }
  }
  return Math.min(20, boost);
}

function heuristicBoosts(text: string) {
  const urgencyHits = countPhraseHits(text, URGENCY_TERMS);
  const secrecyHits = countPhraseHits(text, SECRECY_TERMS);
  const impersonationHits = countPhraseHits(text, IMPERSONATION_TERMS);
  const paymentAppHits = countPhraseHits(text, PAYMENT_APPS);
  const codeRequestHits = countPhraseHits(text, CODE_TERMS);
  const explicitScamHits = countPhraseHits(text, EXPLICIT_SCAM_TERMS);
  const paymentRequestHits = PAYMENT_REQUEST_PATTERNS.reduce(
    (count, pattern) => (pattern.test(text) ? count + 1 : count),
    0
  );
  const hardBlockHits =
    countPhraseHits(text, HARD_BLOCK_TERMS) +
    HARD_BLOCK_PATTERNS.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0);
  const threatHits = countPhraseHits(text, THREAT_TERMS);
  const accountAccessHits = countPhraseHits(text, ACCOUNT_ACCESS_TERMS);
  const moneyAmountHits = MONEY_AMOUNT_PATTERNS.reduce(
    (count, pattern) => (pattern.test(text) ? count + 1 : count),
    0
  );

  let boost = 0;
  if (urgencyHits >= 2) boost += 10;
  if (secrecyHits >= 1) boost += 14;
  if (impersonationHits >= 1) boost += 8;
  if (paymentAppHits >= 1) boost += 12;
  if (codeRequestHits >= 1) boost += 14;
  if (text.includes('charity') || text.includes('donation')) boost += 12;
  if (explicitScamHits >= 1) boost += 28;
  if (paymentRequestHits >= 1) boost += 18;
  if (hardBlockHits >= 1) boost += 30;
  if (threatHits >= 1) boost += 12;
  if (accountAccessHits >= 1) boost += 10;
  if (moneyAmountHits >= 1) boost += 10;

  if (secrecyHits >= 1 && paymentAppHits >= 1) boost += 12;
  if (urgencyHits >= 1 && paymentAppHits >= 1) boost += 8;
  if (codeRequestHits >= 1 && impersonationHits >= 1) boost += 10;
  if (explicitScamHits >= 1 && paymentAppHits >= 1) boost += 18;
  if (explicitScamHits >= 1 && paymentRequestHits >= 1) boost += 20;
  if (threatHits >= 1 && paymentAppHits >= 1) boost += 12;
  if (accountAccessHits >= 1 && paymentRequestHits >= 1) boost += 12;
  if (moneyAmountHits >= 1 && paymentRequestHits >= 1) boost += 10;

  return {
    boost: Math.min(70, boost),
    urgencyHits,
    secrecyHits,
    impersonationHits,
    paymentAppHits,
    codeRequestHits,
    explicitScamHits,
    paymentRequestHits,
    hardBlockHits,
    threatHits,
    accountAccessHits,
    moneyAmountHits,
  };
}

export function scoreToRiskLevel(score: number): FraudRiskLevel {
  if (score >= 85) {
    return 'critical';
  }
  if (score >= 70) {
    return 'high';
  }
  if (score >= 40) {
    return 'medium';
  }
  return 'low';
}

export function hashCallerNumber(number?: string | null) {
  if (!number) {
    return null;
  }
  return createHash('sha256').update(number).digest('hex');
}

export function analyzeTranscript(transcript: string) {
  const normalized = normalizeText(transcript);
  if (!normalized) {
    return {
      score: 0,
      riskLevel: 'low',
      matchedKeywords: [],
      notes: {
        matchCount: 0,
        weightSum: 0,
        comboBoost: 0,
        negatedMatches: [],
        urgencyHits: 0,
        secrecyHits: 0,
        impersonationHits: 0,
        paymentAppHits: 0,
        codeRequestHits: 0,
        explicitScamHits: 0,
        paymentRequestHits: 0,
        hardBlockHits: 0,
        threatHits: 0,
        accountAccessHits: 0,
        moneyAmountHits: 0,
        criticalKeywordHits: 0,
        safePhraseMatches: [],
        safePhraseDampening: 0,
        repeatCallerBoost: 0,
      },
    } satisfies FraudAnalysis;
  }

  const { matches, negated } = findMatches(normalized, DEFAULT_KEYWORDS);
  const heuristic = heuristicBoosts(normalized);
  if (matches.length === 0) {
    return {
      score: 0,
      riskLevel: 'low',
      matchedKeywords: [],
      notes: {
        matchCount: 0,
        weightSum: 0,
        comboBoost: 0,
        negatedMatches: negated,
        urgencyHits: heuristic.urgencyHits,
        secrecyHits: heuristic.secrecyHits,
        impersonationHits: heuristic.impersonationHits,
        paymentAppHits: heuristic.paymentAppHits,
        codeRequestHits: heuristic.codeRequestHits,
        explicitScamHits: heuristic.explicitScamHits,
        paymentRequestHits: heuristic.paymentRequestHits,
        hardBlockHits: heuristic.hardBlockHits,
        threatHits: heuristic.threatHits,
        accountAccessHits: heuristic.accountAccessHits,
        moneyAmountHits: heuristic.moneyAmountHits,
        criticalKeywordHits: 0,
        safePhraseMatches: [],
        safePhraseDampening: 0,
        repeatCallerBoost: 0,
      },
    } satisfies FraudAnalysis;
  }

  const weightSum = matches.reduce((sum, kw) => sum + kw.weight, 0);
  let score = (matches.length / 4) * 40;
  score += (weightSum / 100) * 60;
  const multiplier = Math.max(1, Math.log(matches.length + 1));
  score *= multiplier;
  const boost = comboBoost(normalized) + heuristic.boost;
  score += boost;

  const criticalKeywordHits = matches.filter((kw) => CRITICAL_KEYWORDS.has(kw.phrase)).length;

  if (heuristic.explicitScamHits >= 1) {
    score = Math.max(score, 90);
  }
  if (heuristic.hardBlockHits >= 1) {
    score = Math.max(score, 95);
  }
  if (criticalKeywordHits >= 1) {
    score = Math.max(score, 75);
  }
  if (criticalKeywordHits >= 2) {
    score = Math.max(score, 85);
  }
  if (matches.length >= 1) {
    score = Math.max(score, 60);
  }
  if (matches.length >= 2) {
    score = Math.max(score, 70);
  }
  if (matches.length >= 3) {
    score = Math.max(score, 80);
  }
  if (heuristic.paymentRequestHits >= 1 || heuristic.codeRequestHits >= 1) {
    score = Math.max(score, 70);
  }
  if (heuristic.threatHits >= 1 && heuristic.accountAccessHits >= 1) {
    score = Math.max(score, 80);
  }
  if (normalized.includes('donation') || normalized.includes('charity')) {
    score = Math.max(score, 60);
  }

  const finalScore = Math.min(100, Math.round(score));
  return {
    score: finalScore,
    riskLevel: scoreToRiskLevel(finalScore),
    matchedKeywords: matches.map((kw) => kw.phrase),
    notes: {
      matchCount: matches.length,
      weightSum,
      comboBoost: boost,
      negatedMatches: negated,
      urgencyHits: heuristic.urgencyHits,
      secrecyHits: heuristic.secrecyHits,
      impersonationHits: heuristic.impersonationHits,
      paymentAppHits: heuristic.paymentAppHits,
      codeRequestHits: heuristic.codeRequestHits,
      explicitScamHits: heuristic.explicitScamHits,
      paymentRequestHits: heuristic.paymentRequestHits,
      hardBlockHits: heuristic.hardBlockHits,
      threatHits: heuristic.threatHits,
      accountAccessHits: heuristic.accountAccessHits,
      moneyAmountHits: heuristic.moneyAmountHits,
      criticalKeywordHits,
      safePhraseMatches: [],
      safePhraseDampening: 0,
      repeatCallerBoost: 0,
    },
  };
}
