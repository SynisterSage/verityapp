import { createHash } from 'crypto';
import type { VoiceAnalysisResult } from '@src/services/voiceDetector';

export type FraudRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type FraudKeyword = {
  phrase: string;
  weight: number;
  category: string;
};

export type FraudMetadata = {
  callerCountry?: string | null;
  callerRegion?: string | null;
  isHighRiskCountry?: boolean;
  callDurationSeconds?: number | null;
  callTimestamp?: string | null;
  repeatCallCount?: number;
  detectedLocale?: string | null;
  voiceSyntheticScore?: number | null;
  voiceAnalysis?: VoiceAnalysisResult | null;
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
  taxScamHits: number;
  bankFraudHits: number;
  piiHarvestHits: number;
  criticalKeywordHits: number;
  safePhraseMatches: string[];
  safePhraseDampening: number;
  repeatCallerBoost: number;
  callerHistory?: {
    windowDays: number;
    previousCalls: number;
  } | null;
  callerCountry?: string | null;
  callerRegion?: string | null;
  highRiskCountryBoost: number;
  timeOfDayBoost: number;
  durationBoost: number;
  repeatCallCount: number;
  detectedLocale?: string | null;
  localeBoost: number;
  regionMismatchBoost: number;
  commandSensitiveHits: number;
  actionBoost: number;
  techSupportHits: number;
  investmentHits: number;
  medicalHits: number;
  deviceHits: number;
  voiceSyntheticScore: number | null;
  voiceBoost: number;
  voiceAnalysis?: VoiceAnalysisResult | null;
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

  // Account takeover & identity
  { phrase: 'account takeover', weight: 38, category: 'identity' },
  { phrase: "we're taking over your account", weight: 40, category: 'identity' },
  { phrase: 'we are taking over your account', weight: 40, category: 'identity' },
  { phrase: 'identity recovery', weight: 34, category: 'identity' },
  { phrase: 'identity verification', weight: 34, category: 'identity' },
  { phrase: 'switch account owner', weight: 28, category: 'identity' },
  { phrase: 'security question change', weight: 32, category: 'identity' },
  { phrase: 'change your security question', weight: 32, category: 'identity' },
  { phrase: 'confirm your identity', weight: 32, category: 'identity' },
  { phrase: 'verify identity', weight: 32, category: 'identity' },
  { phrase: 'identity protection lock', weight: 26, category: 'identity' },
  { phrase: 'account integrity check', weight: 30, category: 'identity' },
  { phrase: 'account under review', weight: 30, category: 'identity' },
  { phrase: 'account update required', weight: 28, category: 'identity' },

  // Banking & finance
  { phrase: 'wire money', weight: 20, category: 'banking' },
  { phrase: 'send money', weight: 20, category: 'banking' },
  { phrase: 'payment', weight: 30, category: 'banking' },
  { phrase: 'verify account', weight: 20, category: 'banking' },
  { phrase: 'verify your account', weight: 28, category: 'banking' },
  { phrase: 'confirm credit card', weight: 22, category: 'banking' },
  { phrase: 'account number', weight: 28, category: 'banking' },
  { phrase: 'routing number', weight: 28, category: 'banking' },
  { phrase: 'bank account', weight: 28, category: 'banking' },
  { phrase: 'bank', weight: 24, category: 'banking' },
  { phrase: 'refund', weight: 20, category: 'banking' },
  { phrase: 'refund department', weight: 24, category: 'banking' },
  { phrase: 'overdraft', weight: 20, category: 'banking' },
  { phrase: 'password', weight: 20, category: 'banking' },
  { phrase: 'pin', weight: 20, category: 'banking' },
  { phrase: 'atm', weight: 20, category: 'banking' },
  { phrase: 'deposit', weight: 12, category: 'banking' },
  { phrase: 'withdraw', weight: 12, category: 'banking' },
  { phrase: 'balance', weight: 12, category: 'banking' },
  { phrase: 'transaction', weight: 12, category: 'banking' },
  { phrase: 'billing', weight: 12, category: 'banking' },
  { phrase: 'fraud alert', weight: 40, category: 'banking' },
  { phrase: 'fraud department', weight: 36, category: 'banking' },
  { phrase: 'bank fraud', weight: 38, category: 'banking' },
  { phrase: 'bank security', weight: 34, category: 'banking' },
  { phrase: 'security department', weight: 32, category: 'banking' },
  { phrase: 'fraud team', weight: 30, category: 'banking' },
  { phrase: 'account compromised', weight: 34, category: 'banking' },
  { phrase: 'account locked', weight: 30, category: 'banking' },
  { phrase: 'account suspended', weight: 30, category: 'banking' },
  { phrase: 'suspicious activity', weight: 32, category: 'banking' },
  { phrase: 'suspicious transaction', weight: 32, category: 'banking' },
  { phrase: 'unauthorized transaction', weight: 34, category: 'banking' },
  { phrase: 'unauthorized charge', weight: 34, category: 'banking' },
  { phrase: 'fraud department', weight: 36, category: 'banking' },
  { phrase: 'fraud investigations', weight: 32, category: 'banking' },
  { phrase: 'bank investigator', weight: 32, category: 'banking' },
  { phrase: 'bank of america', weight: 30, category: 'banking' },
  { phrase: 'chase bank', weight: 30, category: 'banking' },
  { phrase: 'wells fargo', weight: 30, category: 'banking' },
  { phrase: 'citibank', weight: 28, category: 'banking' },
  { phrase: 'capital one', weight: 28, category: 'banking' },
  { phrase: 'paypal', weight: 28, category: 'banking' },
  { phrase: 'cash app', weight: 30, category: 'banking' },
  { phrase: 'venmo', weight: 30, category: 'banking' },
  { phrase: 'zelle support', weight: 34, category: 'banking' },
  { phrase: 'stock broker', weight: 32, category: 'investment' },
  { phrase: 'investment advisor', weight: 30, category: 'investment' },
  { phrase: 'trading account', weight: 30, category: 'investment' },
  { phrase: 'brokerage account', weight: 30, category: 'investment' },
  { phrase: 'trade confirmation', weight: 26, category: 'investment' },
  { phrase: 'transfer shares', weight: 28, category: 'investment' },
  { phrase: 'margin call', weight: 34, category: 'investment' },
  { phrase: 'stock options', weight: 32, category: 'investment' },
  { phrase: 'option trading', weight: 30, category: 'investment' },
  { phrase: 'call options', weight: 28, category: 'investment' },
  { phrase: 'put options', weight: 28, category: 'investment' },
  { phrase: 'options exercise', weight: 30, category: 'investment' },
  { phrase: 'option assignment', weight: 30, category: 'investment' },
  { phrase: 'stock option grant', weight: 26, category: 'investment' },
  { phrase: 'online brokerage', weight: 24, category: 'investment' },
  { phrase: 'brokerage platform', weight: 26, category: 'investment' },
  { phrase: 'brokerage verification', weight: 26, category: 'investment' },
  { phrase: 'portfolio manager', weight: 26, category: 'investment' },
  { phrase: 'trading desk', weight: 24, category: 'investment' },
  { phrase: 'investment opportunity', weight: 28, category: 'investment' },
  { phrase: 'portfolio review', weight: 24, category: 'investment' },
  { phrase: 'trading platform', weight: 26, category: 'investment' },
  { phrase: 'commission refund', weight: 22, category: 'investment' },
  { phrase: 'verify trading account', weight: 28, category: 'investment' },
  { phrase: 'settlement department', weight: 26, category: 'investment' },

  // Government & taxes
  { phrase: 'irs', weight: 32, category: 'government' },
  { phrase: 'internal revenue service', weight: 34, category: 'government' },
  { phrase: 'revenue service', weight: 28, category: 'government' },
  { phrase: 'tax authority', weight: 30, category: 'government' },
  { phrase: 'tax agency', weight: 28, category: 'government' },
  { phrase: 'tax office', weight: 28, category: 'government' },
  { phrase: 'tax department', weight: 30, category: 'government' },
  { phrase: 'tax bureau', weight: 30, category: 'government' },
  { phrase: 'revenue department', weight: 30, category: 'government' },
  { phrase: 'government debt', weight: 28, category: 'government' },
  { phrase: 'federal tax', weight: 32, category: 'government' },
  { phrase: 'state tax', weight: 28, category: 'government' },
  { phrase: 'tax balance', weight: 30, category: 'government' },
  { phrase: 'tax balance due', weight: 36, category: 'government' },
  { phrase: 'balance due', weight: 28, category: 'government' },
  { phrase: 'tax notice', weight: 28, category: 'government' },
  { phrase: 'tax case', weight: 28, category: 'government' },
  { phrase: 'tax investigation', weight: 34, category: 'government' },
  { phrase: 'tax fraud', weight: 30, category: 'government' },
  { phrase: 'tax audit', weight: 32, category: 'government' },
  { phrase: 'audit notice', weight: 30, category: 'government' },
  { phrase: 'audit department', weight: 28, category: 'government' },
  { phrase: 'collections department', weight: 30, category: 'government' },
  { phrase: 'collections agency', weight: 28, category: 'government' },
  { phrase: 'tax collector', weight: 30, category: 'government' },
  { phrase: 'fbi', weight: 20, category: 'government' },
  { phrase: 'social security', weight: 20, category: 'government' },
  { phrase: 'legal action', weight: 20, category: 'government' },
  { phrase: 'arrest', weight: 20, category: 'government' },
  { phrase: 'warrant', weight: 26, category: 'government' },
  { phrase: 'levy', weight: 26, category: 'government' },
  { phrase: 'garnishment', weight: 26, category: 'government' },
  { phrase: 'customs', weight: 22, category: 'government' },
  { phrase: 'border patrol', weight: 22, category: 'government' },
  { phrase: 'homeland security', weight: 24, category: 'government' },
  { phrase: 'tax refund', weight: 24, category: 'government' },
  { phrase: 'tax return', weight: 24, category: 'government' },
  { phrase: 'refund department', weight: 26, category: 'government' },
  { phrase: 'tax refund owed', weight: 30, category: 'government' },
  { phrase: 'back taxes', weight: 45, category: 'government' },
  { phrase: 'back tax', weight: 42, category: 'government' },
  { phrase: 'tax debt', weight: 42, category: 'government' },
  { phrase: 'taxes owed', weight: 40, category: 'government' },
  { phrase: 'owe taxes', weight: 38, category: 'government' },
  { phrase: 'owed taxes', weight: 38, category: 'government' },
  { phrase: 'tax lien', weight: 34, category: 'government' },
  { phrase: 'tax warrant', weight: 36, category: 'government' },
  { phrase: 'tax penalty', weight: 30, category: 'government' },
  { phrase: 'tax collection', weight: 32, category: 'government' },
  { phrase: 'taxes', weight: 22, category: 'government' },
  { phrase: 'federal', weight: 18, category: 'government' },
  { phrase: 'law enforcement', weight: 18, category: 'government' },
  { phrase: 'compliance', weight: 14, category: 'government' },
  { phrase: 'national fraud helpline', weight: 32, category: 'government' },
  { phrase: 'federal reserve', weight: 30, category: 'government' },
  { phrase: 'income tax department', weight: 30, category: 'government' },
  { phrase: 'uidai', weight: 28, category: 'government' },
  { phrase: 'passport control', weight: 28, category: 'government' },
  { phrase: 'immigration bureau', weight: 28, category: 'government' },
  { phrase: 'railway police', weight: 26, category: 'government' },
  { phrase: 'visa sanction', weight: 26, category: 'government' },
  { phrase: 'stop payment order', weight: 28, category: 'government' },
  { phrase: 'court of appeals', weight: 26, category: 'government' },
  { phrase: 'audit', weight: 14, category: 'government' },
  { phrase: 'license', weight: 14, category: 'government' },
  { phrase: 'penalty', weight: 14, category: 'government' },
  { phrase: 'utility shut-off notice', weight: 30, category: 'authority' },
  { phrase: 'marshal office', weight: 26, category: 'authority' },
  { phrase: 'police bail warning', weight: 30, category: 'authority' },
  { phrase: 'immigration hold notice', weight: 28, category: 'authority' },

  // Authority & legal
  { phrase: 'warrant notice', weight: 36, category: 'authority' },
  { phrase: 'warrant check', weight: 32, category: 'authority' },
  { phrase: 'court summons', weight: 34, category: 'authority' },
  { phrase: 'legal order', weight: 26, category: 'authority' },
  { phrase: 'police warrant', weight: 32, category: 'authority' },
  { phrase: 'judge office', weight: 24, category: 'authority' },
  { phrase: 'debt collection agent', weight: 28, category: 'authority' },
  { phrase: 'immigration officer', weight: 26, category: 'authority' },

  // Tech support
  { phrase: 'microsoft', weight: 20, category: 'tech' },
  { phrase: 'apple', weight: 20, category: 'tech' },
  { phrase: 'microsoft support', weight: 20, category: 'tech' },
  { phrase: 'apple support', weight: 22, category: 'tech' },
  { phrase: 'amazon support', weight: 22, category: 'tech' },
  { phrase: 'paypal support', weight: 22, category: 'tech' },
  { phrase: 'cash app support', weight: 24, category: 'tech' },
  { phrase: 'virus', weight: 18, category: 'tech' },
  { phrase: 'malware', weight: 18, category: 'tech' },
  { phrase: 'update', weight: 14, category: 'tech' },
  { phrase: 'install', weight: 14, category: 'tech' },
  { phrase: 'computer', weight: 14, category: 'tech' },
  { phrase: 'system', weight: 14, category: 'tech' },
  { phrase: 'repair', weight: 14, category: 'tech' },
  { phrase: 'access', weight: 14, category: 'tech' },
  { phrase: 'remote access', weight: 20, category: 'tech' },
  { phrase: 'teamviewer', weight: 28, category: 'tech' },
  { phrase: 'anydesk', weight: 28, category: 'tech' },
  { phrase: 'logmein', weight: 26, category: 'tech' },
  { phrase: 'remote session', weight: 26, category: 'tech' },
  { phrase: 'remote access code', weight: 30, category: 'tech' },
  { phrase: 'connect to your computer', weight: 30, category: 'tech' },
  { phrase: 'laptop security scan', weight: 26, category: 'tech' },
  { phrase: 'laptop update', weight: 24, category: 'tech' },
  { phrase: 'install antivirus', weight: 28, category: 'tech' },
  { phrase: 'security patch', weight: 24, category: 'tech' },
  { phrase: 'system scan', weight: 24, category: 'tech' },
  { phrase: 'screen share', weight: 24, category: 'tech' },
  { phrase: 'teamviewer code', weight: 24, category: 'tech' },
  { phrase: 'logmein code', weight: 24, category: 'tech' },
  { phrase: 'remote technician', weight: 24, category: 'tech' },
  { phrase: 'security breach notice', weight: 26, category: 'tech' },
  { phrase: 'device quarantine notice', weight: 26, category: 'tech' },
  { phrase: 'account disabled', weight: 24, category: 'tech' },
  { phrase: 'cyber security breach', weight: 26, category: 'tech' },

  // Medical & healthcare
  { phrase: 'doctor calling', weight: 28, category: 'medical' },
  { phrase: 'nurse calling', weight: 24, category: 'medical' },
  { phrase: 'urgent surgery', weight: 30, category: 'medical' },
  { phrase: 'medical bill', weight: 24, category: 'medical' },
  { phrase: 'insurance verification', weight: 24, category: 'medical' },
  { phrase: 'medicare representative', weight: 24, category: 'medical' },
  { phrase: 'clinic warning', weight: 22, category: 'medical' },
  { phrase: 'medication refill', weight: 20, category: 'medical' },
  { phrase: 'healthcare compliance', weight: 20, category: 'medical' },
  { phrase: 'hospital administrator', weight: 22, category: 'medical' },

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
  { phrase: 'charity donation', weight: 38, category: 'donation' },
  { phrase: 'donate now', weight: 38, category: 'donation' },
  { phrase: 'donation', weight: 36, category: 'donation' },
  { phrase: 'charity', weight: 34, category: 'donation' },
  { phrase: 'charity drive', weight: 32, category: 'donation' },
  { phrase: 'emergency relief', weight: 32, category: 'donation' },
  { phrase: 'disaster fund', weight: 32, category: 'donation' },
  { phrase: 'relief fund', weight: 32, category: 'donation' },
  { phrase: 'hurricane relief', weight: 32, category: 'donation' },
  { phrase: 'earthquake relief', weight: 32, category: 'donation' },
  { phrase: 'widows and orphans', weight: 30, category: 'donation' },
  { phrase: 'orphanage', weight: 30, category: 'donation' },
  { phrase: "children's hospital", weight: 30, category: 'donation' },
  { phrase: 'church donation', weight: 28, category: 'donation' },
  { phrase: 'missionary', weight: 26, category: 'donation' },
  { phrase: 'charitable contribution', weight: 26, category: 'donation' },
  { phrase: 'fundraiser', weight: 26, category: 'donation' },
  { phrase: 'nonprofit', weight: 24, category: 'donation' },
  { phrase: 'give now', weight: 24, category: 'donation' },
  { phrase: 'pledge', weight: 22, category: 'donation' },
  { phrase: 'sponsor', weight: 22, category: 'donation' },
  { phrase: 'support our cause', weight: 22, category: 'donation' },
  { phrase: 'tax deductible', weight: 20, category: 'donation' },
  { phrase: 'organization', weight: 18, category: 'donation' },
  { phrase: 'call back', weight: 14, category: 'donation' },
  { phrase: 'subscription', weight: 20, category: 'billing' },
  { phrase: 'renewal', weight: 18, category: 'billing' },
  { phrase: 'auto-renew', weight: 18, category: 'billing' },
  { phrase: 'auto renew', weight: 18, category: 'billing' },
  { phrase: 'recurring charge', weight: 20, category: 'billing' },
  { phrase: 'invoice', weight: 24, category: 'billing' },
  { phrase: 'receipt', weight: 16, category: 'billing' },
  { phrase: 'billing department', weight: 20, category: 'billing' },
  { phrase: 'charged', weight: 16, category: 'billing' },
  { phrase: 'charge of', weight: 16, category: 'billing' },
  { phrase: 'refund department', weight: 18, category: 'billing' },
  { phrase: 'norton', weight: 20, category: 'billing' },
  { phrase: 'mcafee', weight: 20, category: 'billing' },
  { phrase: 'geek squad', weight: 20, category: 'billing' },
  { phrase: 'paypal invoice', weight: 18, category: 'billing' },
  { phrase: 'courier', weight: 16, category: 'logistics' },
  { phrase: 'pickup', weight: 16, category: 'logistics' },
  { phrase: 'pick up cash', weight: 18, category: 'logistics' },
  { phrase: 'collect the money', weight: 18, category: 'logistics' },
  { phrase: 'send a driver', weight: 18, category: 'logistics' },
  { phrase: 'agent will come', weight: 18, category: 'logistics' },
  { phrase: 'hand it to', weight: 18, category: 'logistics' },
  { phrase: 'package', weight: 16, category: 'logistics' },
  { phrase: 'drop off', weight: 16, category: 'logistics' },
  { phrase: 'safe keeping', weight: 14, category: 'logistics' },
  { phrase: 'verify your identity', weight: 18, category: 'identity' },
  { phrase: 'confirm your information', weight: 18, category: 'identity' },
  { phrase: 'date of birth', weight: 16, category: 'identity' },
  { phrase: 'mother’s maiden name', weight: 16, category: 'identity' },
  { phrase: 'mother s maiden name', weight: 16, category: 'identity' },
  { phrase: 'security questions', weight: 16, category: 'identity' },
  { phrase: 'address verification', weight: 16, category: 'identity' },
  { phrase: 'verificar', weight: 10, category: 'spanish' },
  { phrase: 'transferencia', weight: 12, category: 'spanish' },
  { phrase: 'tarjeta de regalo', weight: 18, category: 'spanish' },
  { phrase: 'urgente', weight: 12, category: 'spanish' },
  { phrase: 'código', weight: 12, category: 'spanish' },

  // Gift cards & crypto
  { phrase: 'gift card', weight: 28, category: 'payment' },
  { phrase: 'google play card', weight: 20, category: 'payment' },
  { phrase: 'apple gift card', weight: 20, category: 'payment' },
  { phrase: 'steam card', weight: 20, category: 'payment' },
  { phrase: 'bitcoin', weight: 26, category: 'payment' },
  { phrase: 'crypto', weight: 26, category: 'payment' },
  { phrase: 'wallet address', weight: 18, category: 'payment' },
  { phrase: 'coinbase', weight: 20, category: 'payment' },
  { phrase: 'binance', weight: 20, category: 'payment' },
  { phrase: 'kraken', weight: 20, category: 'payment' },
  { phrase: 'crypto', weight: 26, category: 'payment' },
  { phrase: 'bitcoin', weight: 26, category: 'payment' },
  { phrase: 'wallet address', weight: 18, category: 'payment' },
  { phrase: 'western union', weight: 18, category: 'payment' },
  { phrase: 'moneygram', weight: 18, category: 'payment' },
  { phrase: 'money order', weight: 18, category: 'payment' },
  { phrase: 'zelle', weight: 35, category: 'payment' },
  { phrase: 'cash app', weight: 30, category: 'payment' },
  { phrase: 'venmo', weight: 30, category: 'payment' },
  { phrase: 'paypal', weight: 26, category: 'payment' },
  { phrase: 'give me your zelle', weight: 45, category: 'payment' },
  { phrase: 'gift card number', weight: 24, category: 'payment' },
  { phrase: 'itunes gift card', weight: 28, category: 'payment' },
  { phrase: 'amazon gift card', weight: 28, category: 'payment' },
  { phrase: 'walmart gift card', weight: 28, category: 'payment' },
  { phrase: 'target gift card', weight: 28, category: 'payment' },
  { phrase: 'best buy gift card', weight: 28, category: 'payment' },
  { phrase: 'green dot', weight: 26, category: 'payment' },
  { phrase: 'onevanilla', weight: 26, category: 'payment' },
  { phrase: 'prepaid card', weight: 24, category: 'payment' },
  { phrase: 'scratch off', weight: 22, category: 'payment' },
  { phrase: 'load the card', weight: 22, category: 'payment' },
  { phrase: 'bitcoin atm', weight: 22, category: 'payment' },

  // Creator / social subscription hooks
  { phrase: 'onlyfans', weight: 26, category: 'social' },
  { phrase: 'exclusive content', weight: 18, category: 'social' },
  { phrase: 'subscribe now', weight: 16, category: 'social' },
  { phrase: 'send a tip', weight: 18, category: 'social' },
  { phrase: 'premium subscription', weight: 18, category: 'social' },
  { phrase: 'fans only', weight: 16, category: 'social' },
  { phrase: 'creator payout', weight: 16, category: 'social' },
  { phrase: 'perks package', weight: 16, category: 'social' },
  { phrase: 'creator link', weight: 14, category: 'social' },
  { phrase: 'fan club', weight: 14, category: 'social' },
  { phrase: 'apply now for perks', weight: 14, category: 'social' },
  { phrase: 'support my content', weight: 14, category: 'social' },
  { phrase: 'monthly subscription', weight: 16, category: 'social' },
  { phrase: 'pay per view', weight: 16, category: 'social' },

  // Delivery, courier & package
  { phrase: 'delivery on hold', weight: 32, category: 'courier' },
  { phrase: 'package held', weight: 32, category: 'courier' },
  { phrase: 'mail intercept', weight: 30, category: 'courier' },
  { phrase: 'parcel held', weight: 30, category: 'courier' },
  { phrase: 'courier pickup', weight: 30, category: 'courier' },
  { phrase: 'package hold fee', weight: 30, category: 'courier' },
  { phrase: 'agent will collect', weight: 28, category: 'courier' },
  { phrase: 'pickup driver', weight: 26, category: 'courier' },
  { phrase: 'urgent courier', weight: 26, category: 'courier' },
  { phrase: 'delivery attempt', weight: 26, category: 'courier' },
  { phrase: 'hold the line', weight: 24, category: 'courier' },

  // Charity, donation & emergency relief
  { phrase: 'donation hotline', weight: 28, category: 'charity' },
  { phrase: 'charity representative', weight: 26, category: 'charity' },
  { phrase: 'immediate donation', weight: 26, category: 'charity' },
  { phrase: 'support victims', weight: 24, category: 'charity' },
  { phrase: 'fund emergency relief', weight: 24, category: 'charity' },
  { phrase: 'relief fund transfer', weight: 24, category: 'charity' },

  // Government & authority pressure
  { phrase: 'penalty notice', weight: 34, category: 'government' },
  { phrase: 'benefit suspension', weight: 34, category: 'government' },
  { phrase: 'freeze your social security', weight: 36, category: 'government' },
  { phrase: 'Medicare overpayment', weight: 34, category: 'government' },
  { phrase: 'warrant notice', weight: 32, category: 'government' },
  { phrase: 'federal agent', weight: 30, category: 'government' },
  { phrase: 'court summons', weight: 32, category: 'government' },
  { phrase: 'civil penalty', weight: 30, category: 'government' },
  { phrase: 'collection agent', weight: 30, category: 'government' },
  { phrase: 'immigration hold notice', weight: 30, category: 'government' },
  { phrase: 'law enforcement agent', weight: 28, category: 'government' },

  // Romance, prize & sweepstakes
  { phrase: 'sweepstakes winner', weight: 32, category: 'romance' },
  { phrase: 'oil rig worker', weight: 28, category: 'romance' },
  { phrase: 'overseas work', weight: 28, category: 'romance' },
  { phrase: 'romance scam', weight: 32, category: 'romance' },
  { phrase: 'taxes due to collect prize', weight: 30, category: 'romance' },
  { phrase: 'keep it secret', weight: 26, category: 'romance' },
  { phrase: 'send a friend', weight: 24, category: 'romance' },
  { phrase: 'hotel bill', weight: 24, category: 'romance' },

  // Tech support & remote access
  { phrase: 'remote desktop', weight: 30, category: 'tech' },
  { phrase: 'screen share request', weight: 30, category: 'tech' },
  { phrase: 'install this update', weight: 28, category: 'tech' },
  { phrase: 'download this app', weight: 28, category: 'tech' },
  { phrase: 'run a security scan', weight: 28, category: 'tech' },
  { phrase: 'enter the code', weight: 28, category: 'tech' },
  { phrase: 'allow remote access', weight: 28, category: 'tech' },
  { phrase: 'share your screen', weight: 26, category: 'tech' },
  { phrase: 'license renewal', weight: 26, category: 'tech' },
  { phrase: 'virus alert', weight: 26, category: 'tech' },
  { phrase: 'apple tech support', weight: 32, category: 'tech' },
  { phrase: 'laptop needing service', weight: 28, category: 'tech' },
  { phrase: 'laptop service', weight: 26, category: 'tech' },
  { phrase: 'virus on it', weight: 30, category: 'tech' },
  { phrase: 'email me for gift cards', weight: 24, category: 'tech' },
  { phrase: 'we received an email from you', weight: 18, category: 'tech' },
  { phrase: 'contact me', weight: 12, category: 'tech' },

  // Investment & stock pressure
  { phrase: 'investment opportunity', weight: 30, category: 'investment' },
  { phrase: 'trading platform', weight: 28, category: 'investment' },
  { phrase: 'commission refund', weight: 26, category: 'investment' },
  { phrase: 'transfer shares', weight: 28, category: 'investment' },

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
  { phrase: 'call me back immediately', weight: 20, category: 'family' },
  { phrase: 'press 1', weight: 18, category: 'family' },
  { phrase: 'transfer the money', weight: 30, category: 'family' },
  { phrase: 'urgent wire', weight: 28, category: 'family' },

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
const REPORTING_MARKERS = [
  'this is a scam',
  'they asked for my',
  'someone told me',
  'he said it was a scam',
  'they said it was fraudulent',
  'i think it is a scam',
];

const COMBO_RULES = [
  { all: ['scam', 'zelle'], add: 25 },
  { all: ['scam', 'payment'], add: 20 },
  { all: ['scam', 'money'], add: 20 },
  { all: ['give me your money', 'payment'], add: 20 },
  { all: ['gift card', 'urgent'], add: 12 },
  { all: ['wire money', 'bank'], add: 10 },
  { all: ['social security', 'verify'], add: 12 },
  { all: ['donation', 'gift card'], add: 12 },
  { all: ['charity', 'immediately'], add: 14 },
  { all: ['donation', 'charity'], add: 16 },
  { all: ['charity', 'call back'], add: 12 },
  { all: ['donation', 'organization'], add: 12 },
  { all: ['remote access', 'computer'], add: 10 },
  { all: ['verification code', 'bank'], add: 12 },
  { all: ['one time code', 'account'], add: 12 },
  { all: ['zelle', 'urgent'], add: 10 },
  { all: ['paypal', 'urgent'], add: 10 },
  { all: ['remote access', 'install'], add: 16 },
  { all: ['call this number', 'stay on the line'], add: 14 },
  { all: ['call this number', "don't hang up"], add: 14 },
  { all: ['gift card', 'call this number'], add: 16 },
  { all: ['subscription', 'remote access'], add: 18 },
  { all: ['billing department', 'remote access'], add: 18 },
  { all: ['gift card', 'courier'], add: 20 },
  { all: ['crypto', 'urgent'], add: 16 },
  { all: ['crypto', 'fraud department'], add: 14 },
  { all: ['package', 'money'], add: 16 },
  { all: ['identity', 'confirm'], add: 10 },
  { all: ['margin call', 'urgent wire'], add: 18 },
  { all: ['stock options', 'brokerage verification'], add: 16 },
  { all: ['option trading', 'call options'], add: 10 },
  { all: ['put options', 'options exercise'], add: 12 },
  { all: ['online brokerage', 'transfer shares'], add: 14 },
  { all: ['utility shut-off notice', 'pay now'], add: 18 },
  { all: ['security breach notice', 'screen share'], add: 12 },
  { all: ['organ transplant delay', 'medical debt collection'], add: 14 },
  { all: ['police bail warning', 'transfer the money'], add: 16 },
  { all: ['warrant notice', 'pay now'], add: 18 },
  { all: ['court summons', 'urgent wire'], add: 16 },
  { all: ['laptop security scan', 'remote access'], add: 16 },
  { all: ['install antivirus', 'remote technician'], add: 14 },
  { all: ['doctor calling', 'verify identity'], add: 16 },
  { all: ['urgent surgery', 'call me back immediately'], add: 14 },
  { all: ['press 1', 'gift card'], add: 12 },
  { all: ['legal order', 'transfer the money'], add: 18 },
  { all: ['laptop update', 'screen share'], add: 12 },
  { all: ['nurse calling', 'medical bill'], add: 12 },
  { all: ['stock broker', 'verify identity'], add: 18 },
  { all: ['trading account', 'urgent'], add: 14 },
  { all: ['investment opportunity', 'transfer shares'], add: 16 },
  { all: ['delivery on hold', 'courier pickup'], add: 20 },
  { all: ['package held', 'hold the line'], add: 18 },
  { all: ['package hold fee', 'delivery attempt'], add: 18 },
  { all: ['grandchild in jail', 'bail money'], add: 20 },
  { all: ['romance scam', 'keep it secret'], add: 18 },
  { all: ['sweepstakes winner', 'taxes due to collect prize'], add: 20 },
  { all: ['remote desktop', 'enter the code'], add: 18 },
  { all: ['support ticket', 'allow remote control'], add: 16 },
  { all: ['donation hotline', 'immediate donation'], add: 18 },
  { all: ['national fraud helpline', 'mobile money'], add: 18 },
  { all: ['federal reserve', 'swift transfer'], add: 18 },
  { all: ['passport control', 'parcel intercept'], add: 18 },
  { all: ['immigration bureau', 'stop payment order'], add: 16 },
  { all: ['custom broker', 'doorstep delivery fee'], add: 16 },
  { all: ['parcel intercept', 'international shipment hold'], add: 18 },
  { all: ['security audit', 'allow remote access'], add: 18 },
  { all: ['software license audit', 'download this app'], add: 16 },
  { all: ['remittance', 'funds release'], add: 18 },
  { all: ['onlyfans', 'send a tip'], add: 20 },
  { all: ['exclusive content', 'subscribe now'], add: 18 },
  { all: ['premium subscription', 'pay per view'], add: 18 },
  { all: ['creator payout', 'monthly subscription'], add: 16 },
  { all: ['fans only', 'perks package'], add: 16 },
  { all: ['support my content', 'creator link'], add: 16 },
  { all: ['irs agent', 'gift card'], add: 25 },
  { all: ['law enforcement agent', 'zelle'], add: 20 },
  { all: ['national fraud helpline', 'wire western union now'], add: 18 },
  { all: ['passport control', 'custom broker'], add: 20 },
  { all: ['security audit', 'wire money'], add: 18 },
  { all: ['govt tech support', 'pay per view'], add: 16 },
  { all: ['support ticket', 'gift card number'], add: 18 },
  { all: ['remote login', 'delivery on hold'], add: 16 },
  { all: ['apple tech support', 'virus notice'], add: 20 },
  { all: ['laptop needing service', 'email me for gift cards'], add: 18 },
  { all: ['laptop service', 'contact me'], add: 16 },
  { all: ['virus on it', 'apple tech support'], add: 18 },
  { all: ['email me for gift cards', 'gift card'], add: 18 },
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
  'final notice',
  'last attempt',
  'collections',
  'garnishment',
  'levy',
  'disconnection',
  'service interruption',
  'warrant notice',
  'court summons',
  'police warrant',
  'legal order',
  'debt collection agent',
  'utility shut-off notice',
  'police bail warning',
  'immigration hold notice',
];

const AUTHORITY_TERMS = [
  'this is the bank',
  'i am calling from your bank',
  'calling from your bank',
  'this is [company] support',
  'irs agent',
  'tax collector',
  'amazon fraud department',
  'social security administration',
  'department of justice',
  'law enforcement',
  'police department',
  'legal department',
  'sheriff office',
  'warrant notice',
  'court summons',
  'police warrant',
  'legal order',
  'judge office',
  'immigration officer',
  'debt collection agent',
  'utility shut-off notice',
  'marshal office',
  'police bail warning',
  'immigration hold notice',
];

const REMOTE_ACCESS_TERMS = [
  'anydesk',
  'teamviewer',
  'logmein',
  'remote access',
  'screen share',
  'install software',
  'download this app',
  'share your screen',
  'connect to your computer',
  'remote session',
  'access your device',
  'laptop security scan',
  'install antivirus',
  'security patch',
  'system scan',
  'teamviewer code',
  'logmein code',
  'remote technician',
  'security breach notice',
  'device quarantine notice',
  'account disabled',
  'cyber security breach',
  'remote desktop',
  'remote login',
  'allow remote control',
  'give remote access',
  'support ticket',
  'security certificate',
  'remote connection',
  'share control',
  'remote agent',
  'govt tech support',
  'endpoint protection',
  'security audit',
  'it helpdesk',
  'windows activation',
  'server patch',
  'software license audit',
  'zscaler portal',
  'remote vpn access',
];

const GIFT_CARD_TERMS = [
  'gift card',
  'apple gift card',
  'google play card',
  'steam card',
  'target card',
  'walmart card',
  'scratch off the back',
  'gift card number',
];

const CALLBACK_TERMS = [
  'call this number',
  'don\'t hang up',
  'don’t hang up',
  'stay on the line',
  'transfer me',
  'press 1',
  'press 2',
  'press 3',
  'press 4',
  'press 5',
  'press 6',
  'press 7',
  'press 8',
  'press 9',
  'press 0',
  'don\'t disconnect',
  'do not hang up',
  'call back this number',
];

const BRAND_IMPERSONATION_TERMS = [
  'microsoft support',
  'apple support',
  'google support',
  'paypal support',
  'geek squad',
  'norton support',
  'support center',
  'help desk',
  'security team',
];

const LINK_TERMS = [
  'open this link',
  'click the link',
  'go to this website',
  'i\'m texting you a link',
  'check your email',
  'visit this site',
];

const URL_PATTERNS = [
  /(https?:\/\/)?(www\.)?[a-z0-9-]+\.(com|net|org|io|us|co)(\/\S*)?/i,
  /\bbit\.ly\b/i,
  /\btinyurl\b/i,
  /\bgoo\.gl\b/i,
];

const CARRIER_TERMS = [
  'sim swap',
  'port out',
  'carrier',
  'esim',
  'account pin',
  'porting pin',
  'transfer your number',
  'verification code from your carrier',
];

const ACCOUNT_ACCESS_TERMS = [
  'password',
  'pin',
  'passcode',
  'login',
  'verify account',
  'verify your account',
  'account verification',
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
  'fraud alert',
  'bank fraud',
  'bank security',
  'security department',
  'fraud team',
  'account compromised',
  'account locked',
  'account suspended',
  'suspicious activity',
  'suspicious transaction',
  'unauthorized transaction',
  'unauthorized charge',
  'irs',
  'internal revenue service',
  'tax department',
  'revenue service',
  'tax authority',
  'tax agency',
  'tax office',
  'tax bureau',
  'revenue department',
  'collections department',
  'collections agency',
  'tax collector',
  'government debt',
  'federal tax',
  'state tax',
  'tax audit',
  'audit department',
  'audit notice',
  'tax investigation',
  'tax fraud',
  'social security administration',
  'law enforcement',
  'sheriff',
  'police',
  'dea',
  'homeland security',
  'customs and border protection',
  'border patrol',
  'department of justice',
  'microsoft support',
  'apple support',
  'amazon support',
  'google support',
  'paypal support',
  'bank of america',
  'wells fargo',
  'chase bank',
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

const ACTION_VERBS = [
  'press',
  'provide',
  'confirm',
  'call back',
  'wire',
  'send',
  'transfer',
  'submit',
  'enter',
  'speak to',
  'talk to',
  'download',
  'scan',
  'enter code',
  'verify identity',
  'allow remote',
  'share screen',
  'authenticate',
  'install',
];

const SENSITIVE_NOUNS = [
  'payment',
  'money',
  'account',
  'account holder',
  'bank',
  'credit card',
  'debit card',
  'routing',
  'ssn',
  'social security',
  'password',
  'pin',
  'code',
  'verification',
  'taxes',
  'warrant',
  'computer',
  'device',
  'service',
  'support',
  'plan',
  'discount',
  'identity',
  'security question',
  'certificate',
  'subscription',
  'virus alert',
  'remote session',
  'security alert',
  'security lock',
];

const TECH_SUPPORT_PHRASES = [
  'tech',
  'support',
  'help desk',
  'help center',
  'service desk',
  'customer support',
  'customer service',
  'technical department',
  'technical team',
  'tech support',
  'technical support',
  'it support',
  'it department',
  'security team',
  'security center',
  'computer problem',
  'computer issue',
  'computer security',
  'windows license',
  'microsoft support',
  'apple support',
  'amazon support',
  'paypal support',
  'cash app support',
  'remote support',
  'connect to your computer',
  'fix your computer',
  'service your computer',
  'security alert on your computer',
  'govt tech support',
  'endpoint protection',
  'security audit',
  'it helpdesk',
  'windows activation',
  'server patch',
  'software license audit',
  'zscaler portal',
  'apple tech support',
  'laptop service',
  'laptop needing service',
  'email support team',
  'gift cards',
  'virus notice',
];

const CRYPTO_TERMS = [
  'bitcoin',
  'crypto',
  'wallet address',
  'crypto wallet',
  'usdt',
  'tether',
  'ethereum',
  'send to this address',
  'coinbase',
  'binance',
  'kraken',
];

const SUBSCRIPTION_TERMS = [
  'subscription',
  'renewal',
  'auto-renew',
  'auto renew',
  'recurring charge',
  'invoice',
  'receipt',
  'billing department',
  'charged',
  'charge of',
  'refund department',
  'norton',
  'mcafee',
  'geek squad',
  'paypal invoice',
  'paypal payment',
];

const COURIER_TERMS = [
  'courier',
  'pickup',
  'pick up cash',
  'collect the money',
  'send a driver',
  'agent will come',
  'hand it to',
  'package',
  'drop off',
  'safe keeping',
  'pick up the card',
  'delivery on hold',
  'package held',
  'mail intercept',
  'parcel held',
  'package hold fee',
  'delivery attempt',
  'hold the line',
  'urgent courier',
  'delivery notice',
  'parcel intercept',
  'custom broker',
  'dhl express fee',
  'fedex security hold',
  'postal service fine',
  'doorstep delivery fee',
  'parcel clearance',
  'international shipment hold',
];

const INVESTMENT_TERMS = [
  'stock broker',
  'investment advisor',
  'trading account',
  'brokerage account',
  'investment opportunity',
  'transfer shares',
  'trade confirmation',
  'portfolio review',
  'trading platform',
  'settlement department',
  'commission refund',
  'verify trading account',
  'swift transfer',
  'mobile money',
  'mtn momo',
  'airtel money',
  'certified check',
  'funds release',
  'remittance',
  'transaction reversal',
];

const MEDICAL_TERMS = [
  'doctor calling',
  'nurse calling',
  'urgent surgery',
  'medical bill',
  'insurance verification',
  'medicare representative',
  'clinic warning',
  'medication refill',
  'healthcare compliance',
  'hospital administrator',
  'medical emergency',
  'organ transplant delay',
  'medical debt collection',
  'insurance audit',
  'pharmacy pin',
];

const DEVICE_TERMS = [
  'laptop security scan',
  'laptop update',
  'security patch',
  'system scan',
  'install antivirus',
  'screen share',
  'teamviewer code',
  'logmein code',
  'remote technician',
  'fix your laptop',
  'macbook support',
  'desktop support',
];

const IDENTITY_TERMS = [
  'verify your identity',
  'confirm your information',
  'date of birth',
  'mother’s maiden name',
  'mother s maiden name',
  'security questions',
  'address verification',
  'verify identity',
  'confirm identity',
];

const ESCALATION_TERMS = [
  'final notice',
  'legal action',
  'last warning',
  'final warning',
];

const REPETITION_TERMS = ['send', 'transfer', 'download', 'stay on the line', 'install'];

const SPANISH_TERMS = ['urgente', 'verificar', 'transferencia', 'tarjeta de regalo', 'código'];

// Common obfuscations and near-miss variants
const FUZZY_KEYWORD_MAP: Record<string, string[]> = {
  account: ['acct', 'acnt', 'accnt'],
  verify: ['verif', 'vrfy', 'verifyy', 'verfy'],
  payment: ['pymt', 'paymnt', 'paymnts'],
  password: ['passwrd', 'passcode'],
  transaction: ['txn', 'transactn'],
  security: ['sec', 'securty'],
  refund: ['refnd', 'refd'],
  bank: ['bnk'],
  taxes: ['taxs', 'taxe', 'taxed'],
};

const PII_TERMS = [
  'birthday',
  'date of birth',
  'dob',
  'birth date',
  'mother maiden',
  'maiden name',
  'social security',
  'ssn',
  'last 4',
  'last four',
  'last four digits',
  'security question',
  'security answers',
  'name on the account',
  'account holder',
  'home address',
  'billing address',
  'residential address',
  'your address',
  'pin code',
  'pin number',
  '4 digit pin',
  'four digit pin',
  'password reset',
  'one time passcode',
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
  'swift transfer',
  'mobile money',
  'mtn momo',
  'airtel money',
  'back taxes',
  'tax debt',
  'taxes owed',
  'owed taxes',
  'owe taxes',
  'tax lien',
  'tax warrant',
  'tax penalty',
  'tax collection',
  'tax balance due',
  'tax audit',
  'audit notice',
  'tax investigation',
  'tax fraud',
  'fraud alert',
  'bank fraud',
  'account compromised',
  'unauthorized transaction',
  'unauthorized charge',
  'give me your money',
  'send me your money',
  'steal your money',
  'take your money',
  'take all your money',
  'itunes gift card',
  'amazon gift card',
  'walmart gift card',
  'target gift card',
  'best buy gift card',
  'green dot',
  'onevanilla',
  'prepaid card',
  'onlyfans',
  'exclusive content',
  'fans only',
  'send a tip',
  'premium subscription',
  'support my content',
  'creator payout',
  'perks package',
  'fan club',
  'monthly subscription',
  'teamviewer',
  'anydesk',
  'remote access code',
  'remote session',
  'warrant notice',
  'court summons',
  'police warrant',
  'legal order',
  'pretend warrant',
  'doctor calling',
  'urgent surgery',
  'laptop security scan',
  'install antivirus',
  'remote technician',
  'transfer the money',
  'call me back immediately',
  'margin call',
  'stock options',
  'utility shut-off notice',
  'police bail warning',
  'immigration hold notice',
  'security breach notice',
  'account disabled',
  'virus on it',
  'email me for gift cards',
  'laptop needing service',
  'apple tech support',
  'delivery on hold',
  'package held',
  'mail intercept',
  'parcel held',
  'package hold fee',
  'courier pickup',
  'dear valued customer',
  'bail money',
  'grandchild in jail',
  'prize taxes due',
  'sweepstakes winner',
  'romance scam',
  'oil rig worker',
  'overseas work',
  'hotel bill',
  'taxes due to collect prize',
  'keep it secret',
  'send a friend',
  'charity donation',
  'donation hotline',
  'relief fund transfer',
  'fund emergency relief',
  'penalty notice',
  'benefit suspension',
  'freeze your social security',
  'Medicare overpayment',
  'federal agent',
  'law enforcement agent',
  'collection agent',
  'civil penalty',
  'national fraud helpline',
  'federal reserve',
  'income tax department',
  'uidai',
  'passport control',
  'immigration bureau',
  'railway police',
  'visa sanction',
  'stop payment order',
  'court of appeals',
  'remote desktop',
  'screen share request',
  'enter the code',
  'download this app',
  'run a security scan',
  'install this update',
  'license renewal',
  'support ticket',
  'teamviewer code',
  'logmein code',
  'remote login',
  'allow remote control',
  'give remote access',
  'gift card code',
  'visa gift card',
  'amazon gift card codes',
  'western union',
  'moneygram',
  'wire western union now',
  'passport hold',
  'utility shut off notice',
  'virtual assistant request',
  'zip code verification',
  'parcel intercept',
  'custom broker',
  'dhl express fee',
  'fedex security hold',
  'postal service fine',
  'doorstep delivery fee',
  'parcel clearance',
  'security audit',
  'software license audit',
  'doorstep charges',
  'security certificate',
  'endpoint protection',
  'it helpdesk',
  'zscaler portal',
  'windows activation',
  'server patch',
  'remote vpn access',
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
  /\bback\s+tax(es)?\b/i,
  /\btax(es)?\s+(owed|due)\b/i,
  /\b(balance)\s+due\b/i,
  /\btax\s+debt\b/i,
  /\btax\s+lien\b/i,
  /\btax\s+warrant\b/i,
  /\btax\s+audit\b/i,
  /\btax\s+investigation\b/i,
  /\bunauthorized\s+(transaction|charge)\b/i,
  /\bsuspicious\s+activity\b/i,
  /\baccount\s+compromised\b/i,
  /\b(remote\s+access|remote\s+session|teamviewer|anydesk|logmein)\b/i,
  /\bstock\s+broker\b/i,
  /\binvestment\s+advisor\b/i,
  /\btrading\s+account\b/i,
  /\bbrokerage\s+account\b/i,
  /\binvestment\s+opportunity\b/i,
  /\btransfer\s+shares\b/i,
  /\bstock\s+options\b/i,
  /\bmargin\s+call\b/i,
  /\bwarrant\s+(notice|check)\b/i,
  /\bcourt\s+sum(mons?)?\b/i,
  /\bpolice\s+warrant\b/i,
  /\blegal\s+order\b/i,
  /\bdoctor\s+calling\b/i,
  /\burgent\s+surgery\b/i,
  /\blaptop\s+security\s+scan\b/i,
  /\bremote\s+technician\b/i,
  /\btransfer\s+the\s+money\b/i,
  /\bcall\s+me\s+back\s+immediately\b/i,
  /\butility\s+shut-off\b/i,
  /\bsecurity\s+breach\b/i,
  /\baccount\s+disabled\b/i,
  /\bmtn\s+momo\b/i,
  /\bairtel\s+money\b/i,
  /\bmobile\s+money\b/i,
  /\bswift\s+transfer\b/i,
  /\bfunds\s+release\b/i,
  /\bremittance\b/i,
  /\bparcel\s+intercept\b/i,
  /\bcustom\s+broker\b/i,
  /\bdoorstep\s+delivery\b/i,
  /\binternational\s+shipment\b/i,
  /\bsecurity\s+audit\b/i,
  /\bsoftware\s+license\b/i,
];

const MONEY_AMOUNT_PATTERNS = [
  /\$\s?\d{2,}(?:\.\d{1,2})?/,
  /\b\d{2,}(?:,\d{3})*(?:\.\d{1,2})?\s?(dollars|bucks)\b/,
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
  'irs',
  'internal revenue service',
  'revenue service',
  'tax authority',
  'tax agency',
  'tax office',
  'tax bureau',
  'revenue department',
  'collections department',
  'collections agency',
  'tax collector',
  'government debt',
  'federal tax',
  'state tax',
  'tax audit',
  'audit notice',
  'tax investigation',
  'tax fraud',
  'back taxes',
  'back tax',
  'tax debt',
  'taxes owed',
  'owe taxes',
  'owed taxes',
  'tax lien',
  'tax warrant',
  'tax penalty',
  'tax collection',
  'tax balance due',
  'balance due',
  'fraud alert',
  'fraud department',
  'bank fraud',
  'bank security',
  'security department',
  'fraud team',
  'account compromised',
  'account locked',
  'account suspended',
  'suspicious activity',
  'suspicious transaction',
  'unauthorized transaction',
  'unauthorized charge',
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
  'stock broker',
  'investment advisor',
  'trading account',
  'brokerage account',
  'investment opportunity',
  'transfer shares',
  'trade confirmation',
  'portfolio review',
  'trading platform',
  'settlement department',
  'commission refund',
  'verify trading account',
]);

const TAX_SCAM_TERMS = [
  'irs',
  'internal revenue service',
  'revenue service',
  'tax authority',
  'tax agency',
  'tax office',
  'tax bureau',
  'revenue department',
  'collections department',
  'collections agency',
  'tax collector',
  'government debt',
  'federal tax',
  'state tax',
  'tax audit',
  'audit notice',
  'tax investigation',
  'tax fraud',
  'swift transfer',
  'mobile money',
  'remittance',
  'parcel intercept',
  'custom broker',
  'security audit',
  'software license audit',
  'back taxes',
  'back tax',
  'tax debt',
  'taxes owed',
  'owe taxes',
  'owed taxes',
  'tax lien',
  'tax warrant',
  'tax penalty',
  'tax collection',
  'tax balance due',
  'balance due',
  'taxes',
  'tax refund',
  'tax return',
];

const BANK_FRAUD_TERMS = [
  'fraud alert',
  'fraud department',
  'bank fraud',
  'bank security',
  'security department',
  'fraud team',
  'account compromised',
  'account locked',
  'account suspended',
  'suspicious activity',
  'suspicious transaction',
  'unauthorized transaction',
  'unauthorized charge',
  'verify your account',
];

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

function countCommandSensitiveCombos(text: string) {
  let hits = 0;
  for (const verb of ACTION_VERBS) {
    const verbRegex = new RegExp(`\\b${escapeRegExp(verb)}\\b`, 'i');
    if (!verbRegex.test(text)) continue;
    for (const noun of SENSITIVE_NOUNS) {
      const nounRegex = new RegExp(`\\b${escapeRegExp(noun)}\\b`, 'i');
      if (nounRegex.test(text)) {
        hits += 1;
        break;
      }
    }
  }
  return hits;
}

function countTechSupportHits(text: string) {
  let hits = 0;
  for (const phrase of TECH_SUPPORT_PHRASES) {
    const regex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i');
    if (regex.test(text)) {
      hits += 1;
    }
  }
  return hits;
}

function countRepetitionHits(text: string, terms: string[]) {
  let hits = 0;
  for (const term of terms) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi');
    const matches = text.match(pattern);
    if (matches && matches.length > 1) {
      hits += matches.length - 1;
    }
  }
  return hits;
}

function isNegated(text: string, index: number) {
  const windowStart = Math.max(0, index - 40);
  const window = text.slice(windowStart, index);
  return NEGATION_MARKERS.some((marker) => window.includes(marker));
}

function isReported(text: string, index: number) {
  const windowStart = Math.max(0, index - 60);
  const window = text.slice(windowStart, index).toLowerCase();
  return REPORTING_MARKERS.some((marker) => window.includes(marker));
}

function findMatches(text: string, keywords: FraudKeyword[]) {
  const matches: FraudKeyword[] = [];
  const negated: string[] = [];

  // Fuzzy hits
  for (const [canonical, variants] of Object.entries(FUZZY_KEYWORD_MAP)) {
    const pattern = `\\b(${[canonical, ...variants.map(escapeRegExp)].join('|')})\\b`;
    const regex = new RegExp(pattern, 'gi');
    if (regex.test(text)) {
      matches.push({ phrase: canonical, weight: 8, category: 'fuzzy' });
    }
  }

  for (const keyword of keywords) {
    const pattern = `\\b${escapeRegExp(keyword.phrase).replace(/\\s+/g, '\\\\s+')}\\b`;
    const regex = new RegExp(pattern, 'gi');
    let match = regex.exec(text);
    let matched = false;
    while (match) {
      const idx = match.index ?? 0;
      if (isNegated(text, idx) || isReported(text, idx)) {
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
  return Math.min(30, boost);
}

function heuristicBoosts(text: string) {
  const urgencyHits = countPhraseHits(text, URGENCY_TERMS);
  const secrecyHits = countPhraseHits(text, SECRECY_TERMS);
  const impersonationHits = countPhraseHits(text, IMPERSONATION_TERMS);
  const paymentAppHits = countPhraseHits(text, PAYMENT_APPS);
  const codeRequestHits = countPhraseHits(text, CODE_TERMS);
  const explicitScamHits = countPhraseHits(text, EXPLICIT_SCAM_TERMS);
  const techSupportHits = countTechSupportHits(text);
  const piiHarvestHits = countPhraseHits(text, PII_TERMS);
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
  const taxScamHits = countPhraseHits(text, TAX_SCAM_TERMS);
  const bankFraudHits = countPhraseHits(text, BANK_FRAUD_TERMS);
  const authorityHits = countPhraseHits(text, AUTHORITY_TERMS);
  const remoteAccessHits = countPhraseHits(text, REMOTE_ACCESS_TERMS);
  const giftCardHits = countPhraseHits(text, GIFT_CARD_TERMS);
  const callbackHits = countPhraseHits(text, CALLBACK_TERMS);
  const cryptoHits = countPhraseHits(text, CRYPTO_TERMS);
  const subscriptionHits = countPhraseHits(text, SUBSCRIPTION_TERMS);
  const courierHits = countPhraseHits(text, COURIER_TERMS);
  const identityHits = countPhraseHits(text, IDENTITY_TERMS);
  const escalationHits = countPhraseHits(text, ESCALATION_TERMS);
  const repetitionHits = countRepetitionHits(text, REPETITION_TERMS);
  const spanishHits = countPhraseHits(text, SPANISH_TERMS);
  const reportingHits = countPhraseHits(text, REPORTING_MARKERS);
  const brandHits = countPhraseHits(text, BRAND_IMPERSONATION_TERMS);
  const linkHits = countPhraseHits(text, LINK_TERMS);
  const linkPatternsHits = URL_PATTERNS.reduce(
    (count, pattern) => (pattern.test(text) ? count + 1 : count),
    0
  );
  const carrierHits = countPhraseHits(text, CARRIER_TERMS);
  const investmentHits = countPhraseHits(text, INVESTMENT_TERMS);
  const medicalHits = countPhraseHits(text, MEDICAL_TERMS);
  const deviceHits = countPhraseHits(text, DEVICE_TERMS);

  let boost = 0;
  if (urgencyHits >= 2) boost += 10;
  if (secrecyHits >= 1) boost += 14;
  if (impersonationHits >= 1) boost += 8;
  if (paymentAppHits >= 1) boost += 12;
  if (codeRequestHits >= 1) boost += 14;
  if (text.includes('charity') || text.includes('donation')) boost += 20;
  if (explicitScamHits >= 1) boost += 28;
  if (paymentRequestHits >= 1) boost += 18;
  if (hardBlockHits >= 1) boost += 30;
  if (threatHits >= 1) boost += 12;
  if (accountAccessHits >= 1) boost += 10;
  if (moneyAmountHits >= 1) boost += 10;
  if (taxScamHits >= 1) boost += 30;
  if (taxScamHits >= 2) boost += 10;
  if (bankFraudHits >= 1) boost += 28;
  if (bankFraudHits >= 2) boost += 10;
  if (authorityHits >= 1) boost += 14;
  if (remoteAccessHits >= 1) boost += 18;
  if (giftCardHits >= 1) boost += 20;
  if (callbackHits >= 1) boost += 12;
  if (cryptoHits >= 1) boost += 18;
  if (subscriptionHits >= 1) boost += 14;
  if (courierHits >= 1) boost += 22;
  if (identityHits >= 1) boost += 12;
  if (escalationHits >= 1) boost += 10;
  if (repetitionHits >= 1) boost += Math.min(20, repetitionHits * 8);
  if (spanishHits >= 1) boost += 6;
  if (reportingHits >= 1) boost = Math.max(0, boost - 10);
  if (brandHits >= 1) boost += 10;
  if (linkHits >= 1) boost += 14;
  if (linkPatternsHits >= 1) boost += 14;
  if (carrierHits >= 1) boost += 16;
  if (piiHarvestHits >= 1) boost += 10;
  if (piiHarvestHits >= 2) boost += 8;
  const commandSensitiveHits = countCommandSensitiveCombos(text);
  const actionBoost = Math.min(12, commandSensitiveHits * 6);
  boost += actionBoost;
  if (techSupportHits >= 1) boost += Math.min(40, techSupportHits * 20);
  if (investmentHits >= 1) boost += 18;
  if (investmentHits >= 2) boost += 6;
  if (investmentHits >= 1 && urgencyHits >= 1) boost += 8;
  if (investmentHits >= 1 && paymentAppHits >= 1) boost += 10;
  if (medicalHits >= 1) boost += 14;
  if (medicalHits >= 2) boost += 6;
  if (medicalHits >= 1 && authorityHits >= 1) boost += 10;
  if (medicalHits >= 1 && urgencyHits >= 1) boost += 6;
  if (medicalHits >= 1 && paymentAppHits >= 1) boost += 8;
  if (deviceHits >= 1) boost += 18;
  if (deviceHits >= 2) boost += 6;
  if (deviceHits >= 1 && remoteAccessHits >= 1) boost += 12;
  if (deviceHits >= 1 && commandSensitiveHits > 0) boost += 8;

  if (secrecyHits >= 1 && paymentAppHits >= 1) boost += 12;
  if (urgencyHits >= 1 && paymentAppHits >= 1) boost += 8;
  if (codeRequestHits >= 1 && impersonationHits >= 1) boost += 10;
  if (explicitScamHits >= 1 && paymentAppHits >= 1) boost += 18;
  if (explicitScamHits >= 1 && paymentRequestHits >= 1) boost += 20;
  if (threatHits >= 1 && paymentAppHits >= 1) boost += 12;
  if (accountAccessHits >= 1 && paymentRequestHits >= 1) boost += 12;
  if (moneyAmountHits >= 1 && paymentRequestHits >= 1) boost += 10;
  if (piiHarvestHits >= 1 && actionBoost > 0) boost += 12;
  if (authorityHits >= 1 && paymentAppHits >= 1) boost += 10;
  if (remoteAccessHits >= 1 && actionBoost > 0) boost += 12;
  if (giftCardHits >= 1 && urgencyHits >= 1) boost += 12;
  if (callbackHits >= 1 && paymentRequestHits >= 1) boost += 10;
  if (callbackHits >= 1 && accountAccessHits >= 1) boost += 12;
  if (cryptoHits >= 1 && urgencyHits >= 1) boost += 16;
  if (subscriptionHits >= 1 && remoteAccessHits >= 1) boost += 18;
  if (courierHits >= 1 && paymentRequestHits >= 1) boost += 18;
  if (identityHits >= 1 && authorityHits >= 1) boost += 12;
  if (escalationHits >= 1 && urgencyHits >= 1) boost += 12;
  if (reportingHits >= 1 && paymentRequestHits >= 1) boost = Math.max(0, boost - 5);
  if (brandHits >= 1 && linkHits >= 1) boost += 10;
  if (carrierHits >= 1 && accountAccessHits >= 1) boost += 18;
  if (linkPatternsHits >= 1 && authorityHits >= 1) boost += 14;
  if (investmentHits >= 1 && commandSensitiveHits > 0) boost += 12;
  if (medicalHits >= 1 && codeRequestHits >= 1) boost += 10;

  return {
    boost: Math.min(70, boost),
    authorityHits,
    urgencyHits,
    secrecyHits,
    impersonationHits,
    paymentAppHits,
    codeRequestHits,
    explicitScamHits,
    piiHarvestHits,
    commandSensitiveHits,
    techSupportHits,
    paymentRequestHits,
    hardBlockHits,
    threatHits,
    accountAccessHits,
    moneyAmountHits,
    remoteAccessHits,
    giftCardHits,
    callbackHits,
    cryptoHits,
    subscriptionHits,
    courierHits,
    identityHits,
    escalationHits,
    repetitionHits,
    spanishHits,
    reportingHits,
    brandHits,
    linkHits,
    linkPatternsHits,
    carrierHits,
    taxScamHits,
    bankFraudHits,
    actionBoost,
    investmentHits,
    medicalHits,
    deviceHits,
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

export function analyzeTranscript(transcript: string, metadata: FraudMetadata = {}) {
  const normalized = normalizeText(transcript);
  const callerCountry = metadata.callerCountry ?? null;
  const callerRegion = metadata.callerRegion ?? null;
  const isHighRiskCountry = metadata.isHighRiskCountry ?? false;
  const callDurationSeconds =
    typeof metadata.callDurationSeconds === 'number' ? metadata.callDurationSeconds : null;
  const callTimestamp = metadata.callTimestamp ?? null;
  const repeatCallCount = metadata.repeatCallCount ?? 0;
  const detectedLocale = metadata.detectedLocale ?? null;
  const highRiskCountryBoost = isHighRiskCountry ? 10 : 0;
  const timeOfDayBoost = calculateTimeOfDayBoost(callTimestamp);
  const durationBoost = calculateDurationBoost(callDurationSeconds);
  const localeBoost = calculateLocaleBoost(detectedLocale, callerCountry);
  const regionMismatchBoost =
    callerRegion && callerRegion !== '+1' ? 12 : callerCountry && callerCountry !== 'US' ? 12 : 0;
  const voiceSyntheticScore =
    typeof metadata.voiceSyntheticScore === 'number' ? metadata.voiceSyntheticScore : null;
  const voiceAnalysis = metadata.voiceAnalysis ?? null;
  const voiceMedian = voiceAnalysis?.chunkMedianFake ?? voiceSyntheticScore;
  const voiceMax = voiceAnalysis?.chunkMaxFake ?? voiceSyntheticScore;
  const inferredAlertBand =
    voiceAnalysis?.alertBand ??
    (voiceMedian != null
      ? voiceMedian >= 0.93
        ? 'high'
        : voiceMedian >= 0.8
        ? 'caution'
        : 'none'
      : 'none');
  const voiceAlertBand: 'none' | 'caution' | 'high' = inferredAlertBand;
  let voiceBoost = 0;
  if (voiceAlertBand === 'high' && voiceMedian !== null) {
    voiceBoost = Math.min(30, voiceMedian * 40);
  } else if (voiceAlertBand === 'caution' && voiceMedian !== null) {
    voiceBoost = Math.min(15, voiceMedian * 30);
  }
  const voiceHardOverride = voiceAlertBand === 'high' && (voiceMax ?? 0) >= 0.97;
  const heuristic = heuristicBoosts(normalized);
  const actionBoost = heuristic.actionBoost;

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
        taxScamHits: 0,
        bankFraudHits: 0,
        piiHarvestHits: 0,
        criticalKeywordHits: 0,
        safePhraseMatches: [],
        safePhraseDampening: 0,
        repeatCallerBoost: 0,
        callerCountry,
        callerRegion,
        highRiskCountryBoost,
        timeOfDayBoost,
        durationBoost,
        repeatCallCount,
        detectedLocale,
        localeBoost,
        regionMismatchBoost,
        commandSensitiveHits: 0,
        actionBoost: 0,
        techSupportHits: 0,
        investmentHits: 0,
        medicalHits: 0,
        deviceHits: 0,
        voiceSyntheticScore,
        voiceBoost,
        voiceAnalysis: metadata.voiceAnalysis ?? null,
      },
    } satisfies FraudAnalysis;
  }

  const { matches, negated } = findMatches(normalized, DEFAULT_KEYWORDS);
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
        taxScamHits: heuristic.taxScamHits,
        bankFraudHits: heuristic.bankFraudHits,
        piiHarvestHits: heuristic.piiHarvestHits,
        criticalKeywordHits: 0,
        safePhraseMatches: [],
        safePhraseDampening: 0,
        repeatCallerBoost: 0,
        callerCountry,
        callerRegion,
        highRiskCountryBoost,
        timeOfDayBoost,
        durationBoost,
        repeatCallCount,
        detectedLocale,
        localeBoost,
        regionMismatchBoost,
        commandSensitiveHits: heuristic.commandSensitiveHits,
        actionBoost: heuristic.actionBoost,
        techSupportHits: heuristic.techSupportHits,
        investmentHits: heuristic.investmentHits,
        medicalHits: heuristic.medicalHits,
        deviceHits: heuristic.deviceHits,
        voiceSyntheticScore,
        voiceBoost,
        voiceAnalysis: metadata.voiceAnalysis ?? null,
      },
    } satisfies FraudAnalysis;
  }

  const weightSum = matches.reduce((sum, kw) => sum + kw.weight, 0);
  let score = (matches.length / 4) * 40;
  score += (weightSum / 100) * 60;
  const multiplier = Math.max(1, Math.log(matches.length + 1));
  score *= multiplier;
  const boost = comboBoost(normalized) + heuristic.boost;
  score +=
    boost +
    highRiskCountryBoost +
    timeOfDayBoost +
    durationBoost +
    localeBoost +
    regionMismatchBoost +
    heuristic.actionBoost +
    voiceBoost;

  const criticalKeywordHits = matches.filter((kw) => CRITICAL_KEYWORDS.has(kw.phrase)).length;
  const taxKeywordHits = matches.filter((kw) => TAX_SCAM_TERMS.includes(kw.phrase)).length;
  const taxHardTerms = new Set(['back taxes', 'back tax', 'tax debt', 'taxes owed', 'owe taxes', 'owed taxes', 'tax lien', 'tax warrant', 'tax penalty', 'tax collection']);
  const taxHardHits = matches.filter((kw) => taxHardTerms.has(kw.phrase)).length;
  const bankKeywordHits = matches.filter((kw) => BANK_FRAUD_TERMS.includes(kw.phrase)).length;
  const bankHardTerms = new Set(['fraud alert', 'bank fraud', 'account compromised', 'unauthorized transaction', 'unauthorized charge', 'suspicious activity', 'suspicious transaction']);
  const bankHardHits = matches.filter((kw) => bankHardTerms.has(kw.phrase)).length;
  const techSupportHits = heuristic.techSupportHits;
  const piiHarvestHits = heuristic.piiHarvestHits;

  if (heuristic.explicitScamHits >= 1) {
    score = Math.max(score, 90);
  }
  if (heuristic.hardBlockHits >= 1) {
    score = Math.max(score, 95);
  }
  // Override patterns: tax + payment
  if (taxKeywordHits >= 1 && (heuristic.paymentRequestHits >= 1 || matches.some((kw) => kw.phrase === 'payment'))) {
    score = Math.max(score, 96);
  }
  if (taxKeywordHits >= 1) {
    score = Math.max(score, 90);
  }
  if (taxHardHits >= 1) {
    score = Math.max(score, 100);
  }
  if (bankKeywordHits >= 1) {
    score = Math.max(score, 85);
  }
  if (bankHardHits >= 1) {
    score = Math.max(score, 95);
  }
  if (bankKeywordHits >= 1 && (heuristic.impersonationHits >= 1 || heuristic.accountAccessHits >= 1)) {
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
  if (techSupportHits >= 1) {
    score = Math.max(score, 95);
  }
  if (piiHarvestHits >= 1 && actionBoost > 0) {
    score = Math.max(score, 80);
  }
  if (piiHarvestHits >= 2 && actionBoost > 0) {
    score = Math.max(score, 85);
  }
  if (voiceAlertBand === 'high') {
    score = Math.max(score, 90);
  } else if (voiceAlertBand === 'caution') {
    score = Math.max(score, 75);
  }
  if (voiceHardOverride) {
    score = Math.max(score, 95);
  }

  // If hard-block terms or tax+payment patterns hit, force alert-required signal.
  const hardBlockOverride =
    heuristic.hardBlockHits >= 1 ||
    (taxKeywordHits >= 1 && (heuristic.paymentRequestHits >= 1 || matches.some((kw) => kw.phrase === 'payment'))) ||
    voiceHardOverride;
  const techSupportOverride = techSupportHits >= 1;

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
        taxScamHits: heuristic.taxScamHits,
        bankFraudHits: heuristic.bankFraudHits,
        piiHarvestHits: heuristic.piiHarvestHits,
        criticalKeywordHits,
        safePhraseMatches: [],
        safePhraseDampening: 0,
        repeatCallerBoost: 0,
        callerCountry,
        callerRegion,
        highRiskCountryBoost,
        timeOfDayBoost,
        durationBoost,
        repeatCallCount,
        detectedLocale,
        localeBoost,
        regionMismatchBoost,
        commandSensitiveHits: heuristic.commandSensitiveHits,
        actionBoost: heuristic.actionBoost,
        techSupportHits,
        investmentHits: heuristic.investmentHits,
        medicalHits: heuristic.medicalHits,
        deviceHits: heuristic.deviceHits,
        voiceSyntheticScore,
        voiceBoost,
        voiceAnalysis: metadata.voiceAnalysis ?? null,
      },
    override: hardBlockOverride || techSupportOverride,
  };
}

function calculateTimeOfDayBoost(timestamp?: string | null): number {
  if (!timestamp) {
    return 0;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }
  const hour = date.getHours();
  return hour < 6 || hour >= 22 ? 6 : 0;
}

function calculateDurationBoost(duration?: number | null): number {
  if (typeof duration !== 'number' || Number.isNaN(duration)) {
    return 0;
  }
  if (duration < 10) {
    return 6;
  }
  if (duration > 120) {
    return 4;
  }
  return 0;
}

function calculateLocaleBoost(detectedLocale?: string | null, callerCountry?: string | null): number {
  if (!detectedLocale) {
    return 0;
  }
  const normalized = detectedLocale.toLowerCase();
  const highRiskLocales = ['en-in', 'hi-in'];
  if (highRiskLocales.includes(normalized)) {
    return 8;
  }
  // If locale and country disagree (e.g., callerCountry is US but locale is another region), add a small flag.
  if (callerCountry && normalized.startsWith('en-') && !normalized.endsWith(callerCountry.toLowerCase())) {
    return 4;
  }
  return 0;
}
