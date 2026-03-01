import { createHash } from 'crypto';

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
  safePhraseMatches?: string[];
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
  giftCardHits: number;
  emailHits: number;
  linkHits: number;
  criticalKeywordHits: number;
  callbackHits: number;
  grandchildHits: number;
  sweepstakesHits: number;
  romanceHits: number;
  jobLoanHits: number;
  medicalScamHits: number;
  utilityHits: number;
  charityHits: number;
  familyEmergencyHits: number;
  governmentImpersonationHits: number;
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
  travelPromoHits: number;
  remoteAccessHits: number;
  voiceSyntheticScore: number | null;
  voiceBoost: number;
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
  { phrase: 'call me back', weight: 26, category: 'callback' },
  { phrase: 'call me right back', weight: 26, category: 'callback' },
  { phrase: 'call me now', weight: 26, category: 'callback' },
  { phrase: 'phishing attempt', weight: 36, category: 'explicit' },
  { phrase: 'official notice', weight: 30, category: 'explicit' },
  { phrase: 'fake agent', weight: 34, category: 'explicit' },
  { phrase: 'blackmail', weight: 40, category: 'explicit' },
  { phrase: 'sextortion', weight: 42, category: 'explicit' },
  { phrase: 'extortion', weight: 40, category: 'explicit' },
  { phrase: 'nude photos', weight: 36, category: 'explicit' },
  { phrase: 'explicit photos', weight: 36, category: 'explicit' },
  { phrase: 'private photos', weight: 34, category: 'explicit' },
  { phrase: 'leak your photos', weight: 38, category: 'explicit' },

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
  { phrase: 'ownership verification', weight: 30, category: 'identity' },
  { phrase: 'identity compliance', weight: 26, category: 'identity' },
  { phrase: 'identity number', weight: 32, category: 'identity' },
  { phrase: 'identification number', weight: 32, category: 'identity' },
  { phrase: 'id number', weight: 28, category: 'identity' },
  { phrase: 'birthdate', weight: 26, category: 'identity' },
  { phrase: 'banking details', weight: 32, category: 'identity' },

  // Banking & finance
  { phrase: 'wire money', weight: 20, category: 'banking' },
  { phrase: 'send money', weight: 20, category: 'banking' },
  { phrase: 'payment', weight: 30, category: 'banking' },
  { phrase: 'verify account', weight: 20, category: 'banking' },
  { phrase: 'verify your account', weight: 28, category: 'banking' },
  { phrase: 'confirm credit card', weight: 22, category: 'banking' },
  { phrase: 'credit card', weight: 24, category: 'banking' },
  { phrase: 'debit card', weight: 24, category: 'banking' },
  { phrase: 'account number', weight: 28, category: 'banking' },
  { phrase: 'routing number', weight: 28, category: 'banking' },
  { phrase: 'card number', weight: 28, category: 'banking' },
  { phrase: 'debit card number', weight: 30, category: 'banking' },
  { phrase: 'credit card number', weight: 30, category: 'banking' },
  { phrase: 'routing and account number', weight: 32, category: 'banking' },
  { phrase: 'card pin', weight: 32, category: 'banking' },
  { phrase: 'atm pin', weight: 32, category: 'banking' },
  { phrase: 'cvv', weight: 30, category: 'banking' },
  { phrase: 'cvc', weight: 30, category: 'banking' },
  { phrase: 'cvc2', weight: 30, category: 'banking' },
  { phrase: 'cvn', weight: 30, category: 'banking' },
  { phrase: 'card details', weight: 30, category: 'banking' },
  { phrase: 'card information', weight: 30, category: 'banking' },
  { phrase: 'card expiry', weight: 30, category: 'banking' },
  { phrase: 'expiry date', weight: 28, category: 'banking' },
  { phrase: 'expiration date', weight: 28, category: 'banking' },
  { phrase: 'exp date', weight: 28, category: 'banking' },
  { phrase: 'checking account', weight: 28, category: 'banking' },
  { phrase: 'savings account', weight: 28, category: 'banking' },
  { phrase: 'billing zip', weight: 28, category: 'banking' },
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
  { phrase: 'credit bureau', weight: 30, category: 'banking' },
  { phrase: 'credit reporting agency', weight: 30, category: 'banking' },
  { phrase: 'credit freeze', weight: 30, category: 'banking' },
  { phrase: 'freeze your credit', weight: 30, category: 'banking' },
  { phrase: 'credit report', weight: 28, category: 'banking' },
  { phrase: 'equifax', weight: 28, category: 'banking' },
  { phrase: 'experian', weight: 28, category: 'banking' },
  { phrase: 'transunion', weight: 28, category: 'banking' },
  { phrase: 'suspicious activity', weight: 32, category: 'banking' },
  { phrase: 'suspicious transaction', weight: 32, category: 'banking' },
  { phrase: 'unauthorized transaction', weight: 34, category: 'banking' },
  { phrase: 'unauthorized charge', weight: 34, category: 'banking' },
  { phrase: 'fraud department', weight: 36, category: 'banking' },
  { phrase: 'fraud investigations', weight: 32, category: 'banking' },
  { phrase: 'bank investigator', weight: 32, category: 'banking' },
  { phrase: 'financial security team', weight: 34, category: 'banking' },
  { phrase: 'transaction records', weight: 30, category: 'banking' },
  { phrase: 'primary banks', weight: 30, category: 'banking' },
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
  { phrase: 'gift certificate', weight: 26, category: 'explicit' },
  { phrase: 'gift voucher', weight: 26, category: 'explicit' },
  { phrase: 'claim your prize', weight: 28, category: 'explicit' },
  { phrase: 'rewards program', weight: 24, category: 'explicit' },
  { phrase: 'rewards points', weight: 24, category: 'explicit' },
  { phrase: 'verify your identity', weight: 24, category: 'identity' },
  { phrase: 'security code', weight: 22, category: 'identity' },
  { phrase: 'one time pin', weight: 24, category: 'identity' },
  { phrase: 'one-time pin', weight: 24, category: 'identity' },
  { phrase: 'otp number', weight: 24, category: 'identity' },
  { phrase: 'text code', weight: 24, category: 'identity' },
  { phrase: 'sms code', weight: 24, category: 'identity' },
  { phrase: 'login code', weight: 24, category: 'identity' },
  { phrase: 'confirm your password', weight: 22, category: 'identity' },
  { phrase: 'account details', weight: 20, category: 'identity' },
  { phrase: 'one-time password', weight: 22, category: 'identity' },
  { phrase: 'kidnap', weight: 38, category: 'explicit' },
  { phrase: 'ransom', weight: 40, category: 'explicit' },
  { phrase: 'pay ransom', weight: 42, category: 'explicit' },
  { phrase: 'hostage', weight: 38, category: 'explicit' },
  { phrase: 'safe release', weight: 30, category: 'explicit' },
  { phrase: 'money transfer now', weight: 34, category: 'explicit' },
  { phrase: 'transfer the funds', weight: 32, category: 'banking' },
  { phrase: 'wire funds immediately', weight: 34, category: 'banking' },
  { phrase: 'urgent payment', weight: 28, category: 'explicit' },
  { phrase: 'fear of harm', weight: 30, category: 'explicit' },
  { phrase: 'we have your loved one', weight: 42, category: 'explicit' },
  { phrase: 'meet our demands', weight: 36, category: 'explicit' },
  { phrase: 'send the money', weight: 34, category: 'explicit' },
  { phrase: 'drop the cash', weight: 32, category: 'banking' },
  { phrase: 'delivery location', weight: 28, category: 'banking' },
  { phrase: 'location coordinates', weight: 26, category: 'explicit' },
  { phrase: 'keep quiet', weight: 30, category: 'explicit' },
  { phrase: 'do not call police', weight: 38, category: 'explicit' },
  { phrase: 'we know where you live', weight: 36, category: 'explicit' },
  { phrase: 'deadline to pay', weight: 28, category: 'explicit' },
  { phrase: 'purchase today', weight: 24, category: 'investment' },
  { phrase: 'purchase our product', weight: 26, category: 'investment' },
  { phrase: 'buy our product', weight: 26, category: 'investment' },
  { phrase: 'giving out 50% discount', weight: 30, category: 'explicit' },
  { phrase: '50% discount codes', weight: 32, category: 'explicit' },
  { phrase: 'discount codes', weight: 22, category: 'explicit' },
  { phrase: 'discount code', weight: 22, category: 'explicit' },
  { phrase: 'everybody that answers', weight: 18, category: 'explicit' },
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
  { phrase: 'long distance relationship', weight: 30, category: 'romance' },
  { phrase: 'flight ticket', weight: 22, category: 'romance' },
  { phrase: 'family must never know', weight: 22, category: 'romance' },
  { phrase: 'send it secretly', weight: 20, category: 'romance' },

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
  { phrase: 'reconnection deposit', weight: 28, category: 'utility' },
  { phrase: 'field technician arrives', weight: 26, category: 'utility' },
  { phrase: 'power cut', weight: 20, category: 'utility' },
  { phrase: 'cut off power', weight: 20, category: 'utility' },
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
  { phrase: 'jury duty', weight: 32, category: 'government' },
  { phrase: 'jury summons', weight: 34, category: 'government' },
  { phrase: 'missed jury duty', weight: 36, category: 'government' },
  { phrase: 'bench warrant', weight: 36, category: 'government' },
  { phrase: 'contempt of court', weight: 34, category: 'government' },
  { phrase: 'unpaid toll', weight: 34, category: 'government' },
  { phrase: 'toll violation', weight: 34, category: 'government' },
  { phrase: 'toll notice', weight: 30, category: 'government' },
  { phrase: 'pay by plate', weight: 34, category: 'government' },
  { phrase: 'ez pass', weight: 30, category: 'government' },
  { phrase: 'e-zpass', weight: 30, category: 'government' },
  { phrase: 'sunpass', weight: 30, category: 'government' },
  { phrase: 'fastrak', weight: 30, category: 'government' },
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
  { phrase: 'court clerk', weight: 28, category: 'authority' },
  { phrase: 'jury commissioner', weight: 30, category: 'authority' },
  { phrase: 'bench warrant', weight: 34, category: 'authority' },
  { phrase: 'contempt of court', weight: 32, category: 'authority' },

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

  // Gambling scams
  { phrase: 'casino', weight: 18, category: 'gambling' },
  { phrase: 'gambling', weight: 18, category: 'gambling' },
  { phrase: 'poker', weight: 14, category: 'gambling' },
  { phrase: 'slots', weight: 14, category: 'gambling' },
  { phrase: 'blackjack', weight: 14, category: 'gambling' },
  { phrase: 'roulette', weight: 14, category: 'gambling' },
  { phrase: 'sports bet', weight: 20, category: 'gambling' },
  { phrase: 'wager', weight: 16, category: 'gambling' },
  { phrase: 'betting', weight: 16, category: 'gambling' },

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
  { phrase: 'seed phrase', weight: 34, category: 'payment' },
  { phrase: 'recovery phrase', weight: 34, category: 'payment' },
  { phrase: 'secret phrase', weight: 30, category: 'payment' },
  { phrase: 'mnemonic phrase', weight: 34, category: 'payment' },
  { phrase: 'wallet recovery phrase', weight: 36, category: 'payment' },
  { phrase: 'private key', weight: 36, category: 'payment' },
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
  { phrase: 'gift card pin', weight: 32, category: 'payment' },
  { phrase: 'scratch code', weight: 30, category: 'payment' },
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
  { phrase: 'package held up', weight: 30, category: 'courier' },
  { phrase: 'parcel is affected', weight: 28, category: 'courier' },
  { phrase: 'incomplete address information', weight: 28, category: 'courier' },
  { phrase: 'verify your current address', weight: 30, category: 'courier' },
  { phrase: 'ensure correct delivery', weight: 28, category: 'courier' },
  { phrase: 'hold the line', weight: 24, category: 'courier' },
  { phrase: 'usps', weight: 28, category: 'courier' },
  { phrase: 'ups', weight: 24, category: 'courier' },
  { phrase: 'fedex', weight: 24, category: 'courier' },
  { phrase: 'post office', weight: 24, category: 'courier' },
  { phrase: 'postal service', weight: 24, category: 'courier' },

  // Charity, donation & emergency relief
  { phrase: 'donation hotline', weight: 28, category: 'charity' },
  { phrase: 'charity representative', weight: 26, category: 'charity' },
  { phrase: 'immediate donation', weight: 26, category: 'charity' },
  { phrase: 'support victims', weight: 24, category: 'charity' },
  { phrase: 'fund emergency relief', weight: 24, category: 'charity' },
  { phrase: 'relief fund transfer', weight: 24, category: 'charity' },
  { phrase: 'mobile deposit', weight: 28, category: 'banking' },
  { phrase: 'mobile check deposit', weight: 30, category: 'banking' },
  { phrase: "cashier's check", weight: 30, category: 'banking' },
  { phrase: 'cashiers check', weight: 30, category: 'banking' },
  { phrase: 'fake check', weight: 34, category: 'banking' },
  { phrase: 'overpayment check', weight: 34, category: 'banking' },
  { phrase: 'send back the difference', weight: 36, category: 'banking' },
  { phrase: 'wire back the difference', weight: 36, category: 'banking' },
  { phrase: 'refund the difference', weight: 34, category: 'banking' },
  { phrase: 'forward funds', weight: 30, category: 'banking' },
  { phrase: 'money mule', weight: 36, category: 'banking' },

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
  { phrase: 'read me the code', weight: 34, category: 'tech' },
  { phrase: 'tell me the code', weight: 34, category: 'tech' },
  { phrase: 'share the code', weight: 32, category: 'tech' },
  { phrase: 'six digit code', weight: 30, category: 'tech' },
  { phrase: '6 digit code', weight: 30, category: 'tech' },
  { phrase: 'qr code', weight: 30, category: 'tech' },
  { phrase: 'barcode', weight: 26, category: 'tech' },
  { phrase: 'gift card barcode', weight: 32, category: 'tech' },
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
  { phrase: 'guaranteed return', weight: 32, category: 'investment' },
  { phrase: 'guaranteed profit', weight: 32, category: 'investment' },
  { phrase: 'double your money', weight: 30, category: 'investment' },
  { phrase: 'trading mentor', weight: 26, category: 'investment' },
  { phrase: 'passive income', weight: 22, category: 'investment' },

  // Utility cutoff scams
  { phrase: 'service disconnection', weight: 28, category: 'utility' },
  { phrase: 'disconnect within', weight: 30, category: 'utility' },
  { phrase: 'power will be shut', weight: 30, category: 'utility' },
  { phrase: 'electricity will be cut', weight: 30, category: 'utility' },
  { phrase: 'final notice before disconnection', weight: 32, category: 'utility' },
  { phrase: 'immediate payment to avoid disconnection', weight: 36, category: 'utility' },

  // Bail bond / grandchild variant
  { phrase: 'bail money', weight: 34, category: 'family' },
  { phrase: 'post bail', weight: 32, category: 'family' },
  { phrase: 'arrested family member', weight: 36, category: 'family' },
  { phrase: 'loved one is in trouble', weight: 34, category: 'family' },
  { phrase: 'do not tell anyone', weight: 28, category: 'family' },

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
  'i think it is phishing',
  'this feels like a scam',
  'it said to email me',
  'the email told me to',
];

const EMAIL_PHISHING_TERMS = [
  'verify your email',
  'click the link',
  'open this link',
  'confirm your email',
  'update your account',
  'secure your account',
  'email verification',
  'reset your password',
  'confirm billing info',
  'update payment',
  'account locked due to unusual activity',
  'security alert',
  'verify your identity now',
  'new login detected',
  'support ticket',
  'password reset',
];

const MEDICAL_SCAM_TERMS = [
  'medical bill',
  'insurance fraud',
  'hospital bill',
  'health alert',
  'medical emergency',
  'medical debt',
  'insurance payment',
  'medicare overpayment',
  'medical debt collection',
  'care insurance',
  'Medicare audit',
  'insurance fraud unit',
  'prescription refill',
  'medical alert',
  'claim denied',
  'urgent medical notice',
  'critical care notification',
];

const UTILITY_TERMS = [
  'service suspension',
  'account suspended',
  'utility account',
  'pay the reconnection fee',
  'utility shut-off notice',
  'electric bill',
  'water bill',
  'gas bill',
  'phone service suspension',
  'cable disconnected',
  'power company',
  'energy service',
  'red tag',
  'meter shut down',
  'disconnection notice',
  'shut off notice',
  'turn off your service',
  'past due amount',
  'billing arrears',
  'amount due today',
  'reconnect fee',
  'service disconnection',
  'ComEd',
  'PG&E',
  'Duke Energy',
  'Spectrum bill',
  'Xcel Energy',
  'CenterPoint energy',
  'field technician arriving',
  'deposit before reconnection',
  'utility lien',
  'billing department',
  'gas leak alert',
  'city utility',
  'water service hold',
  'cut off power',
  'cutting your power',
  'power cut',
  'reconnection deposit',
  'pg&e',
  'municipal utility',
];

const CHARITY_TERMS = [
  'charity',
  'donation',
  'donations',
  'disaster relief',
  'hurricane relief',
  'emergency donations',
  'fire victims',
  'school fundraiser',
  'mission trip',
  'church donation',
  'charity drive',
  'support our cause',
  'celebrity charity',
  'celebrity fundraiser',
  'celebrity endorsement',
  'kids in need',
  'give back to the community',
  'nonprofit',
  'humanitarian aid',
  'relief fund',
  'emergency relief',
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
  { all: ['field technician arrives', 'reconnection deposit'], add: 16 },
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
  { all: ['grandchild in jail', 'gift card number'], add: 24 },
  { all: ['grandchild needs bail money', 'wire money'], add: 20 },
  { all: ['grandchild in jail', 'send money'], add: 18 },
  { all: ['sweepstakes winner', 'tax due'], add: 22 },
  { all: ['you have won', 'processing fee'], add: 18 },
  { all: ['long distance relationship', 'send money'], add: 20 },
  { all: ['long distance relationship', 'flight ticket'], add: 16 },
  { all: ['romance scam', 'need money for ticket'], add: 18 },
  { all: ['police bail warning', 'gift card'], add: 18 },
  { all: ['unpaid toll', 'pay by plate'], add: 20 },
  { all: ['toll violation', 'final notice'], add: 18 },
  { all: ['jury duty', 'bench warrant'], add: 20 },
  { all: ['blackmail', 'send money'], add: 22 },
  { all: ['sextortion', 'gift card'], add: 22 },
  { all: ['credit card number', 'cvv'], add: 22 },
  { all: ['debit card number', 'security code'], add: 20 },
  { all: ['checking account', 'routing number'], add: 18 },
  { all: ['card details', 'expiry date'], add: 18 },
  { all: ['read me the code', 'verification code'], add: 22 },
  { all: ['qr code', 'gift card'], add: 18 },
  { all: ['credit bureau', 'social security'], add: 18 },
  { all: ['credit reporting agency', 'social security'], add: 18 },
  { all: ['freeze your credit', 'social security'], add: 18 },
  { all: ['routing and account number', 'verify your account'], add: 20 },
  { all: ['card pin', 'credit card number'], add: 20 },
  { all: ['atm pin', 'debit card number'], add: 20 },
  { all: ['gift card pin', 'gift card'], add: 22 },
  { all: ['scratch code', 'gift card'], add: 20 },
  { all: ['one time pin', 'bank'], add: 18 },
  { all: ['sms code', 'bank'], add: 18 },
  { all: ['login code', 'verify account'], add: 20 },
  { all: ['wallet address', 'seed phrase'], add: 24 },
  { all: ['wallet address', 'private key'], add: 24 },
  { all: ['recovery phrase', 'crypto'], add: 22 },
  { all: ['fake check', 'send back the difference'], add: 24 },
  { all: ['mobile deposit', 'wire back the difference'], add: 24 },
  { all: ["cashier's check", 'overpayment check'], add: 20 },
  { all: ['money mule', 'forward funds'], add: 20 },
];

const URGENCY_TERMS = [
  'immediately',
  'urgent',
  'right away',
  'today only',
  'limited time',
  'act now',
  'asap',
  'final warning',
  'last chance',
  'deadline today',
  'cutoff',
  'service interruption',
  'power cut',
  'act before',
  'press 1',
  'press one',
  'press 2',
  'press two',
  'press 5',
  'press five',
  'press 9',
  'press nine',
];

const SECRECY_TERMS = [
  'keep this secret',
  'do not tell',
  "don't tell",
  'stay on the line',
  "don't hang up",
  'do not hang up',
  'confidential',
  'keep this between us',
  'hide this from your spouse',
  'don’t mention',
  'discrete transaction',
  'cover this up',
  'keep it between us',
];

const THREAT_TERMS = [
  'arrest',
  'warrant',
  'lawsuit',
  'legal action',
  'money laundering',
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
  'red tag',
  'meter sealed',
  'field technician arriving',
  'anger to disconnect',
  'power shut off',
  'field technician arrives',
  'cut off power',
  'cutting your power',
  'service cut off',
  'bench warrant',
  'contempt of court',
  'jury summons',
  'missed jury duty',
  'unpaid toll',
  'toll violation',
  'blackmail',
  'sextortion',
  'leak your photos',
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
  'social security suspension',
  'IRS refund notice',
  'retirement account review',
  'security threat report',
  'compliance department',
  'consumer advocate',
  'federal enforcement',
  'court clerk',
  'jury commissioner',
  'jury duty office',
  'dmv compliance unit',
  'toll enforcement unit',
];

const GOVERNMENT_IMPERSONATION_TERMS = [
  'social security suspension',
  'social security blocked',
  'federal audit',
  'fbi warrant',
  'immigration hold',
  'immigration office',
  'border patrol',
  'customs hold',
  'tax fraud unit',
  'rmv hold',
  'child support arrears',
  'court order',
  'government agent',
  'federal agent',
  'agent from the department',
  'we represent the government',
  'illegal immigration notice',
  'tax enforcement',
  'deportation proceeding',
  'IRS refund notice',
  'customs clearance notice',
  'treasury department',
  'social security fraud unit',
  'credit bureau fraud unit',
  'credit freeze department',
  'equifax security team',
  'experian security team',
  'transunion security team',
  'special investigation team',
  'fraud prevention unit',
  'financial security bureau',
  'financial crimes unit',
  'anti financial crime unit',
  'financial irregularities',
  'jury duty summons',
  'missed jury duty',
  'bench warrant',
  'contempt of court',
  'unpaid toll notice',
  'toll violation notice',
  'dmv toll enforcement',
  'ez pass violation',
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
  'allow us to take control',
  'grant remote access',
  'remote login prompt',
  'support agent on the line',
  'security certificate expiring',
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
  'press pound',
  'stay on the phone',
  'hold the line',
  'call back immediately',
  'call back now',
  'do not end this call',
  'hang on',
  'call me back',
  'call me right back',
  'call me now',
];

const GRANDCHILD_TERMS = [
  'grandchild in jail',
  'grandchild is in jail',
  'grandchild needs bail money',
  'bail money',
  'pay bail',
  'grandchild arrested',
  'lawyer fee',
  'send gift card',
  'gift card number',
  'gift card fee',
  'car accident',
  'hospitalized',
  'family emergency',
  'emergency funds',
  'son in accident',
  'daughter in accident',
  'nephew in hospital',
  'licence check',
  'emergency surgery',
  'hospital bill',
  'attorney on the phone',
  'accident on the highway',
  'emergency wire transfer',
];

const FAMILY_EMERGENCY_TERMS = [
  'son in jail',
  'son is in jail',
  'daughter in jail',
  'daughter is in jail',
  'child in jail',
  'child is in jail',
  'niece in jail',
  'nephew in jail',
  'attorney fee',
  'lawyer fees',
  'bail bond',
  'court fees',
  'immigration detention',
  'accident on the highway',
  'hospital bill',
  'car crash',
  'emergency for the family',
  'do not tell mom',
  'do not tell dad',
  'keep this secret',
  'urgent bail money',
  'pay the bail',
  'pay attorney now',
  'family member arrested',
  'don’t mention to anyone',
  'keep it between us',
  'lawyer is on the line',
  'hospital wing',
  'wires the ambulance',
  'accident in the city',
  'emergency surgery bill',
  'immigration lawyer fee',
  'family emergency',
  'attorney fees',
];

const SWEEPSTAKES_TERMS = [
  'sweepstakes winner',
  'sweepstakes',
  'you have won',
  'prize claim',
  'lottery winner',
  'tax due',
  'processing fee',
  'pay the fee',
  'congratulations you won',
  'prize alert',
  'claim reward',
  'grand prize',
  'free vacation',
  'exclusive prize',
  'customs fee',
  'customs hold',
  'delivery clearance',
  'tax on winnings',
  'processing charge',
  'lottery check',
  'prize processing',
  'winning notification',
  'rewards check',
  'foreign lottery',
  'processing check',
  'customs clearance',
  'vacation package',
  'travel package',
  'luxury vacation',
  'guided tour',
  'travel retreat',
  'discount for the first bookings',
  'unlock a discount',
  'first bookings',
  'country adventure',
  'visa gift',
  'prize processing fee',
  'winning confirmation',
  'rewards certificate',
  'bonus check',
  'cash reward',
  'prize auditor',
  'reward notice',
  // Gambling scams
  'casino bonus',
  'casino winnings',
  'casino account',
  'online casino',
  'gambling winnings',
  'poker winnings',
  'slots bonus',
  'betting winnings',
  'sports bet',
  'wager winnings',
  'blackjack winnings',
  'roulette winnings',
  'casino payout',
  'unclaimed casino',
];

const TRAVEL_PROMO_TERMS = [
  'travel package',
  'vacation package',
  'luxury vacation',
  'guided tour',
  'travel retreat',
  'country adventure',
  'product tour',
  'first bookings',
  'first to grab',
  'first to book',
  'unlock a discount',
  'discount for the first bookings',
  'discover the enchantment',
  'seize a discount',
];

const ROMANCE_TERMS = [
  'long distance relationship',
  'need money for ticket',
  'send money for flight',
  'love you',
  'miss you',
  'relationship scam',
  'romance scam',
  'pay for my ticket',
  'emergency for us',
  'family is waiting',
];

const JOB_LOAN_TERMS = [
  'work from home job',
  'advance fee loan',
  'loan scam',
  'job offer scam',
  'pay for training',
  'credit repair fee',
  'loan approval fee',
  'pay to get job',
  'employment scam',
  'fake employer',
  'be a mystery shopper',
  'mystery shopper',
  'check cashing jobs',
  'government grant',
  'grant approval',
  'processing fee',
  'training fee',
  'tax free payment',
  'pay the broker',
  'deposit the check',
  'mobile deposit',
  'mobile check deposit',
  "cashier's check",
  'cashiers check',
  'fake check',
  'overpayment check',
  'send back the difference',
  'wire back the difference',
  'refund the difference',
  'forward funds',
  'money mule',
  'advance payment',
  'job placement fee',
  'remote hiring',
  'verify your training',
  'training deposit',
  'instant job offer',
  'check cashing job',
  'mystery shopper payout',
  'work from anywhere job',
  'personal loan',
  'loan application',
  'loan approval',
  'part-time job',
  'part time job',
  'paid opportunity',
  'paid position',
  'paid surveys',
  'paid survey',
  'paid mobile app review',
  'mobile app review',
  'data entry job',
  'resume',
  'cv',
  'system trial',
  'paid system trial',
  'beta tester',
  'product review program',
  'affiliate marketing',
  'sales gig',
  'commission',
  'fund transfer',
  'fund transfers',
  'fund transfers program',
  'assistant purchaser',
  'stock taker',
  'investment community',
  'investment group',
  'apply for personal loan',
  'apply for a personal loan',
  'earn money',
  'making money',
  'came across your profile',
  'your profile caught my eye',
  'profile stood out',
  'profile caught your eye',
  'reached out to you',
  'unique opportunity',
  'special opportunity',
  'opportunity for you',
  'gig',
  'game changer',
  'game-changer',
  'high profit',
  'high-profit',
  'assistant purchasers',
  'stock takers',
  'social media influencer',
  'social media influencers',
  'job seekers',
  'writer',
  'writers',
  'program for you',
  'this program',
  'with this program',
  'with this company program',
  'make around',
  'in this program',
  'consistently making',
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
  // Additional brand impersonation
  'facebook support',
  'instagram support',
  'amazon support',
  'netflix support',
  'social security office',
  'medicare office',
  'medicaid office',
  'bank helpline',
  'fraud helpline',
  'federal reserve',
  'treasury department',
  'us treasury',
  'department of treasury',
  'ftc',
  'federal trade commission',
  'fbi',
  'secret service',
  'irs agent',
  'irs officer',
  'immigration enforcement',
  'ice agent',
  'warrant division',
];

const LINK_TERMS = [
  'open this link',
  'click the link',
  'go to this website',
  'i\'m texting you a link',
  'check your email',
  'visit this site',
  'visit this page',
  'follow this link',
  'tap this link',
  'copy this link',
  'link inside this message',
  'clicking the link',
  'link we sent you',
];

const URL_PATTERNS = [
  /(https?:\/\/)?(www\.)?[a-z0-9-]+\.(com|net|org|io|us|co)(\/\S*)?/i,
  /\bbit\.ly\b/i,
  /\btinyurl\b/i,
  /\bgoo\.gl\b/i,
  /\binfo\b/i,
  /\bbiz\b/i,
  /update-account/i,
  /support-ticket/i,
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
  'routing and account number',
  'routing number',
  'checking account',
  'savings account',
  'bank account',
  'online banking',
  'bank login',
  'account login',
  'credit card',
  'debit card',
  'credit cards',
  'debit cards',
  'card number',
  'debit card number',
  'credit card number',
  'card pin',
  'atm pin',
  'card details',
  'card information',
  'credit card details',
  'debit card details',
  'card expiry',
  'expiry date',
  'expiration date',
  'exp date',
  'cvc',
  'cvc2',
  'cvn',
  'billing zip',
  'cvv',
  'seed phrase',
  'recovery phrase',
  'secret phrase',
  'mnemonic phrase',
  'wallet recovery phrase',
  'private key',
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
  'credit bureau',
  'credit reporting agency',
  'credit freeze',
  'freeze your credit',
  'credit report',
  'equifax',
  'experian',
  'transunion',
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
  'official notice',
  'fraud prevention unit',
  'security compliance',
  'task force agent',
  'senior fraud team',
  'verified agent',
  'identity compliance team',
];

const PAYMENT_APPS = [
  'zelle',
  'cash app',
  'venmo',
  'paypal',
  'apple cash',
  'apple pay',
  'google pay',
  'applepay',
  'googlepay',
  'chime',
  'revolut',
  'wise',
  'chase pay',
  'samsung pay',
];

const CODE_TERMS = [
  'verification code',
  'verify code',
  'one time code',
  'one-time code',
  'one time passcode',
  'one-time passcode',
  'one time password',
  'one-time password',
  'read me the code',
  'read out the code',
  'read back the code',
  'tell me the code',
  'share the code',
  'six digit code',
  '6 digit code',
  'security code',
  'otp number',
  'one time pin',
  'one-time pin',
  'sms code',
  'text code',
  'login code',
  'card security code',
  'card verification code',
  'cvc',
  'cvc2',
  'cvn',
  'otp',
  'authenticator code',
  '2fa code',
  'two factor code',
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
  'blackmail',
  'sextortion',
  'extortion',
  'nude photos',
  'explicit photos',
  'private photos',
  'leak your photos',
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
  'read',
  'tell',
  'forward',
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
  'card details',
  'card information',
  'cvv',
  'cvc',
  'cvc2',
  'cvn',
  'qr code',
  'barcode',
  'expiry date',
  'expiration date',
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
  'seed phrase',
  'recovery phrase',
  'mnemonic phrase',
  'private key',
  'subscription',
  'virus alert',
  'remote session',
  'security alert',
  'security lock',
  'government agency',
  'refund check',
  'prize money',
  'customs fine',
  'immigration hold',
  'utility lien',
  'reconnection fee',
  'voucher',
];

const TECH_SUPPORT_PHRASES = [
  'tech support',
  'technical support',
  'it helpdesk',
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
  'your computer is infected',
  'call us to fix your computer',
  'malware detected',
  'security breach',
  'data breach notice',
  'windows license alert',
  'pay to remove virus',
  'cyber attack',
  'urgent tech support',
  'remote tech assistance',
  'security certificate expiring',
  'grant remote access',
  'allow remote control',
  'service your device',
  'install security patch',
  'tracking number issue',
  'support agent on the line',
  'call our security team',
  'maintain remote session',
];

const CRYPTO_TERMS = [
  'bitcoin',
  'crypto',
  'wallet address',
  'crypto wallet',
  'seed phrase',
  'recovery phrase',
  'secret phrase',
  'mnemonic phrase',
  'wallet recovery phrase',
  'private key',
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
  'package held up',
  'parcel is affected',
  'incomplete address information',
  'verify your current address',
  'ensure correct delivery',
  'usps',
  'ups',
  'fedex',
  'post office',
  'postal service',
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
  'investment community',
  'investment group',
  'financial acumen',
  'financial prosperity',
  'financial success',
  'elite investors',
  'investment club',
  'investment scheme',
  'high profit',
  'high-profit',
  'investors',
  'financial manager',
];

// Car/home warranty scams
const WARRANTY_SCAM_TERMS = [
  'vehicle warranty',
  'car warranty',
  'auto warranty',
  'extended warranty',
  'warranty expiring',
  'warranty has expired',
  'warranty department',
  'vehicle protection plan',
  'auto protection plan',
  'home warranty',
  'home warranty expiring',
  'appliance warranty',
  'warranty coverage lapsing',
  'manufacturer warranty',
  'warranty claim',
];

// Timeshare exit scams
const TIMESHARE_SCAM_TERMS = [
  'timeshare',
  'timeshare exit',
  'timeshare cancellation',
  'get out of your timeshare',
  'timeshare relief',
  'timeshare transfer',
  'timeshare resale',
  'vacation ownership',
  'exit your vacation',
  'timeshare maintenance fee',
  'cancel your timeshare',
  'timeshare release',
  'resort exit program',
  'timeshare buyout',
];

// Student loan scams
const STUDENT_LOAN_SCAM_TERMS = [
  'student loan forgiveness',
  'loan forgiveness program',
  'student debt relief',
  'federal loan forgiveness',
  'student loan cancellation',
  'apply for loan forgiveness',
  'student loan department',
  'loan discharge',
  'student loan relief program',
  'qualify for forgiveness',
  'income driven repayment',
  'pslf program',
  'student loan consolidation fee',
  'loan forgiveness fee',
];

// Inheritance / estate scams
const INHERITANCE_SCAM_TERMS = [
  'unclaimed inheritance',
  'named in a will',
  'estate beneficiary',
  'inheritance transfer',
  'inheritance fee',
  'deceased estate',
  'unclaimed funds',
  'beneficiary notification',
  'inheritance tax fee',
  'estate lawyer',
  'foreign estate',
  'will and testament',
  'probate fee',
  'release of inheritance',
  'inheritance claim',
];

// QR code / quishing scams
const QR_SCAM_TERMS = [
  'scan this qr code',
  'qr code to verify',
  'scan the barcode',
  'qr code link',
  'scan to pay',
  'scan to confirm',
  'qr code payment',
  'qr code on your phone',
  'scan to unlock',
  'send you a qr',
];

// Solar / energy scams
const SOLAR_SCAM_TERMS = [
  'free solar panels',
  'government solar program',
  'solar rebate',
  'solar grant',
  'free energy program',
  'solar installation fee',
  'energy assistance program',
  'utility rebate program',
  'government energy rebate',
  'solar savings program',
  'zero cost solar',
  'solar tax credit program',
];

// Veteran benefit scams
const VETERAN_SCAM_TERMS = [
  'veteran benefits',
  'va benefits',
  'va loan',
  'veteran loan',
  'veteran grant',
  'disabled veteran',
  'military benefit',
  'gi bill',
  'veterans administration',
  'va disability',
  'veteran payment',
  'veteran assistance',
  'military compensation',
  'veteran fund',
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
  'covid test',
  'dialysis appointment',
  'surgery delay',
  'emergency room bill',
  'hospital transfer',
  'medical fraud unit',
  'clinical trial',
  'insurance premium increase',
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
  'computer',
  'your computer',
  'pc',
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

const TOKEN_ASR_VARIANT_MAP: Record<string, string[]> = {
  account: ['acct'],
  app: ['ap'],
  cvc: ['c v c'],
  cvc2: ['c v c 2'],
  cvn: ['c v n'],
  cvv: ['c v v'],
  ez: ['e z'],
  expiry: ['expairy'],
  expiration: ['exp'],
  code: ['codes'],
  gift: ['gft'],
  number: ['num', 'no'],
  one: ['1'],
  otp: ['o t p'],
  paypal: ['paypall', 'paypaul'],
  routing: ['routeing'],
  security: ['sec'],
  sms: ['s m s'],
  zelle: ['zell', 'zele', 'zella'],
};

const TOKEN_INFLECTION_MAP: Record<string, string[]> = {
  account: ['accounts'],
  address: ['addresses', 'addressed', 'addressing'],
  affect: ['affects', 'affected', 'affecting'],
  bank: ['banks', 'banking'],
  birthdate: ['birthdates'],
  call: ['calls', 'called', 'calling'],
  card: ['cards'],
  charge: ['charges', 'charged', 'charging'],
  code: ['codes'],
  collect: ['collects', 'collected', 'collecting', 'collection'],
  compromise: ['compromises', 'compromised', 'compromising'],
  confirm: ['confirms', 'confirmed', 'confirming', 'confirmation'],
  disconnect: ['disconnects', 'disconnected', 'disconnecting', 'disconnection'],
  deliver: ['delivers', 'delivered', 'delivering', 'delivery', 'deliveries'],
  detail: ['details'],
  expire: ['expires', 'expired', 'expiring', 'expiration'],
  extort: ['extorts', 'extorted', 'extorting', 'extortion'],
  freeze: ['freezes', 'frozen', 'freezing'],
  hold: ['holds', 'holding', 'held'],
  install: ['installs', 'installed', 'installing', 'installation'],
  lock: ['locks', 'locked', 'locking'],
  login: ['logins', 'logged', 'logging'],
  miss: ['misses', 'missed', 'missing'],
  number: ['numbers'],
  provide: ['provides', 'provided', 'providing'],
  pay: ['pays', 'paid', 'paying', 'payment'],
  pin: ['pins'],
  report: ['reports', 'reported', 'reporting'],
  record: ['records', 'recorded', 'recording'],
  renew: ['renews', 'renewed', 'renewing', 'renewal'],
  request: ['requests', 'requested', 'requesting'],
  scam: ['scams', 'scammed', 'scamming', 'scammer'],
  scan: ['scans', 'scanned', 'scanning'],
  share: ['shares', 'shared', 'sharing'],
  suspend: ['suspends', 'suspended', 'suspending', 'suspension'],
  threaten: ['threatens', 'threatened', 'threatening', 'threat'],
  toll: ['tolls'],
  transaction: ['transactions'],
  transfer: ['transfers', 'transferred', 'transferring'],
  recover: ['recovers', 'recovered', 'recovering', 'recovery'],
  wire: ['wires', 'wired', 'wiring'],
  update: ['updates', 'updated', 'updating'],
  verify: ['verifies', 'verified', 'verifying', 'verification', 'verifications'],
};

const PHRASE_ASR_VARIANT_MAP: Record<string, string[]> = {
  'account number': ['acct number', 'account no', 'account num'],
  'routing and account number': ['account and routing number'],
  anydesk: ['any desk'],
  'bank account': ['bank acct'],
  'cash app': ['cashapp'],
  'credit card': ['creditcard', 'credit cards'],
  'debit card': ['debit cards'],
  'gift card': ['giftcard'],
  'gift card number': ['giftcard number', 'gift card code', 'gift card numbers'],
  'gift card pin': ['giftcard pin', 'gift card pins', 'scratch code'],
  'pay by plate': ['paybyplate'],
  'ez pass': ['e z pass', 'e-z pass', 'e-zpass', 'ezpass'],
  'debit card number': ['debit card no', 'debit card num'],
  'credit card number': ['credit card no', 'credit card num'],
  'card pin': ['credit card pin', 'debit card pin', 'card pins'],
  'atm pin': ['atm passcode', 'atm pins'],
  'expiration date': ['expiry date', 'exp date', 'card expiry'],
  'card details': ['card detail', 'card information'],
  'credit bureau': ['credit reporting agency'],
  'credit freeze': ['freeze your credit'],
  'seed phrase': ['seed words', 'recovery seed phrase'],
  'recovery phrase': ['recovery words', 'wallet recovery phrase'],
  'private key': ['private keys'],
  "cashier's check": ['cashiers check', 'cashier check'],
  'send back the difference': ['send the difference back', 'send back difference'],
  'wire back the difference': ['wire the difference back'],
  'mobile check deposit': ['check mobile deposit', 'mobile cheque deposit'],
  'six digit code': ['6 digit code', 'six-digit code'],
  'qr code': ['q r code', 'qr-code'],
  barcode: ['bar code'],
  'read me the code': ['read me your code', 'read the code'],
  cvv: ['c v v'],
  'authenticator code': ['authentication code', 'auth code'],
  'jury duty': ['juror duty'],
  'bench warrant': ['bench warrants'],
  irs: ['i r s'],
  logmein: ['log me in'],
  'one time code': [
    'one-time code',
    'one time pass code',
    'one time passcode',
    'otp code',
    'one time pin',
    'one-time pin',
    'otp number',
  ],
  paypal: ['pay pal'],
  'remote access': ['remote-access'],
  'routing number': ['routeing number'],
  'social security number': ['social security no', 'social security num', 'social sec number'],
  ssn: ['s s n'],
  teamviewer: ['team viewer'],
  venmo: ['ven mo'],
  'verification code': ['verify code', 'verification codes', 'text code', 'sms code', 'login code'],
  zelle: ['zell', 'zele', 'zella'],
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
  'cvv',
  'cvc',
  'cvc2',
  'cvn',
  'card number',
  'debit card number',
  'credit card number',
  'routing and account number',
  'card pin',
  'atm pin',
  'card details',
  'card information',
  'credit card details',
  'debit card details',
  'gift card pin',
  'scratch code',
  'qr code',
  'barcode',
  'gift card barcode',
  'card expiry',
  'expiry date',
  'expiration date',
  'exp date',
  'billing zip',
  'checking account',
  'savings account',
  'seed phrase',
  'recovery phrase',
  'mnemonic phrase',
  'wallet recovery phrase',
  'private key',
  '4 digit pin',
  'four digit pin',
  'one time pin',
  'one-time pin',
  'otp number',
  'sms code',
  'text code',
  'login code',
  'password reset',
  'one time passcode',
  'identity number',
  'identification number',
  'id number',
  'birthdate',
  'full name',
  'complete name',
  'legal name',
  'banking details',
  'banking number',
  'transaction records',
  'primary banks',
  'salary slip',
  'salary slips',
  'salary statement',
  "cashier's check",
  'cashiers check',
  'fake check',
  'overpayment check',
  'send back the difference',
  'wire back the difference',
  'refund the difference',
  'money mule',
  'e filing',
  'efiling',
];

const HARD_BLOCK_TERMS = [
  'gift card',
  'gift card number',
  'zelle',
  'cash app',
  'venmo',
  'paypal',
  'apple cash',
  'chime',
  'bitcoin',
  'crypto',
  'wire money',
  'verification code',
  'one time pin',
  'one-time pin',
  'otp number',
  'text code',
  'sms code',
  'login code',
  'one time code',
  'one-time code',
  'security code',
  'social security number',
  'ssn',
  'account number',
  'routing and account number',
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
  'credit card',
  'card number',
  'debit card number',
  'credit card number',
  'card pin',
  'atm pin',
  'cvv',
  'cvc',
  'cvc2',
  'cvn',
  'card details',
  'card information',
  'card expiry',
  'expiry date',
  'expiration date',
  'exp date',
  'billing zip',
  'checking account',
  'savings account',
  'seed phrase',
  'recovery phrase',
  'mnemonic phrase',
  'wallet recovery phrase',
  'private key',
  "cashier's check",
  'cashiers check',
  'fake check',
  'overpayment check',
  'send back the difference',
  'wire back the difference',
  'refund the difference',
  'money mule',
  'forward funds',
  'authenticator code',
  '2fa code',
  'two factor code',
  'read me the code',
  'tell me the code',
  'share the code',
  'six digit code',
  '6 digit code',
  'gift card pin',
  'scratch code',
  'credit bureau',
  'credit reporting agency',
  'credit freeze',
  'freeze your credit',
  'credit report',
  'equifax',
  'experian',
  'transunion',
  'blackmail',
  'sextortion',
  'extortion',
  'nude photos',
  'explicit photos',
  'private photos',
  'leak your photos',
  'unpaid toll',
  'toll violation',
  'toll notice',
  'pay by plate',
  'ez pass',
  'e-zpass',
  'sunpass',
  'fastrak',
  'jury duty',
  'jury summons',
  'missed jury duty',
  'bench warrant',
  'contempt of court',
  'court clerk',
  'jury commissioner',
  'escort',
  'escorts',
  'male companion',
  'male companions',
  'secure account',
  'salary slip',
  'salary slips',
  'efiling',
  'warranty',
];

const PAYMENT_REQUEST_PATTERNS = [
  /\b(give|send|wire|pay)\s+me\s+(your\s+)?(zelle|cash app|venmo|paypal|apple cash|chime|bank|account|card|money)\b/i,
  /\b(i|we)\s+(?:need|needed|needing|require|required|requiring)\s+(your\s+)?(zelle|cash app|venmo|paypal|apple cash|chime|bank|account|card|money)\b/i,
  /\b(i|we)\s+(?:need|needed|needing|require|required|requiring)\s+(your\s+)?(banking details|banking number|account number|routing number|routing and account number|checking account|savings account|card number|card details|card information|debit card number|credit card number|card pin|atm pin|gift card pin|scratch code|cvv|cvc|cvc2|cvn|expiry date|expiration date|exp date|billing zip|identity number|identification number|transaction records|pin|birthdate|date of birth|full name|complete name|authenticator code|2fa code|two factor code|one[\s-]?time pin|otp number|sms code|text code|login code|seed phrase|recovery phrase|mnemonic phrase|wallet recovery phrase|private key)\b/i,
  /\b(provide|provides|provided|providing|share|shares|shared|sharing|confirm|confirms|confirmed|confirming|verify|verifies|verified|verifying)\s+(your\s+)?(banking details|banking number|account number|routing number|routing and account number|checking account|savings account|card number|card details|card information|debit card number|credit card number|card pin|atm pin|gift card pin|scratch code|cvv|cvc|cvc2|cvn|expiry date|expiration date|exp date|billing zip|identity number|identification number|transaction records|pin|birthdate|date of birth|full name|complete name|authenticator code|2fa code|two factor code|one[\s-]?time pin|otp number|sms code|text code|login code|seed phrase|recovery phrase|mnemonic phrase|wallet recovery phrase|private key)\b/i,
  /\b(read|read out|read back|tell|share)\s+(me\s+)?(the\s+)?(verification code|security code|one[\s-]?time code|one[\s-]?time passcode|one[\s-]?time password|one[\s-]?time pin|otp|otp number|authenticator code|2fa code|two factor code|six digit code|6 digit code|sms code|text code|login code|gift card pin|card pin|atm pin|scratch code|cvc|cvc2|cvn)\b/i,
];

const HARD_BLOCK_PATTERNS = [
  /\b(give|send|wire|pay)\s+me\s+(all\s+)?(your\s+)?(money|cash|funds)\b/i,
  /\b(give|send|wire|pay)\s+me\s+(your\s+)?(zelle|cash app|venmo|paypal|bank|account|card)\b/i,
  /\b(social security|ssn)\b/i,
  /\bverification code\b/i,
  /\b(one[\s-]?time\s+pin|otp\s+number|sms\s+code|text\s+code|login\s+code)\b/i,
  /\b(card\s+pin|atm\s+pin|gift\s+card\s+pin|scratch\s+code)\b/i,
  /\brouting\s+and\s+account\s+number\b/i,
  /\b(credit\s+reporting\s+agency|freeze\s+your\s+credit)\b/i,
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
  /\butility\s+shut(?:\s|-)?off\b/i,
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
  /\b(unpaid|outstanding)\s+toll\b/i,
  /\btoll\s+(violation|notice|invoice)\b/i,
  /\bpay\s+by\s+plate\b/i,
  /\b(e[\s-]?z\s?pass|ezpass|sunpass|fastrak)\b/i,
  /\b(jury\s+duty|jury\s+summons|missed\s+jury\s+duty)\b/i,
  /\bbench\s+warrant\b/i,
  /\bcontempt\s+of\s+court\b/i,
  /\b(blackmail|sextortion|extortion)\b/i,
  /\b(nude|explicit|private)\s+photos\b/i,
  /\b(card\s+number|debit\s+card\s+number|credit\s+card\s+number|cvv)\b/i,
  /\b(cvc|cvc2|cvn)\b/i,
  /\b(card\s+details?|card\s+information)\b/i,
  /\b(expiry|expiration|exp)\s+date\b/i,
  /\b(checking|savings)\s+account\b/i,
  /\b(one[\s-]?time\s+passcode|2fa\s+code|two\s+factor\s+code)\b/i,
  /\b(read|tell|share)\s+(me\s+)?(the\s+)?(verification|security|one[\s-]?time|six[\s-]?digit)\s+code\b/i,
  /\b(qr|bar)\s*code\b/i,
  /\b(seed|recovery|mnemonic)\s+phrase\b/i,
  /\b(private\s+key|wallet\s+recovery\s+phrase)\b/i,
  /\b(fake\s+check|overpayment\s+check)\b/i,
  /\b(send|wire|refund)\s+back\s+the\s+difference\b/i,
  /\b(mobile(\s+check)?\s+deposit)\b/i,
  /\bcashier'?s\s+check\b/i,
  /\bmoney\s+mule\b/i,
  /\bc\s*v\s*v\b/i,
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
  'routing and account number',
  'routing number',
  'bank account',
  'card number',
  'debit card number',
  'credit card number',
  'card pin',
  'atm pin',
  'cvv',
  'authenticator code',
  '2fa code',
  'two factor code',
  'one time pin',
  'one-time pin',
  'otp number',
  'sms code',
  'text code',
  'login code',
  'gift card pin',
  'scratch code',
  'credit reporting agency',
  'freeze your credit',
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
  'unpaid toll',
  'toll violation',
  'pay by plate',
  'ez pass',
  'e-zpass',
  'sunpass',
  'fastrak',
  'jury duty',
  'jury summons',
  'missed jury duty',
  'bench warrant',
  'contempt of court',
  'blackmail',
  'sextortion',
  'extortion',
  'nude photos',
  'explicit photos',
  'private photos',
  'leak your photos',
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
  'credit bureau',
  'credit reporting agency',
  'credit freeze',
  'freeze your credit',
  'credit report',
  'equifax',
  'experian',
  'transunion',
  'routing and account number',
  'card pin',
  'atm pin',
  'one time pin',
  'otp number',
  'sms code',
  'text code',
  'login code',
  'financial security team',
  'banking details',
  'transaction records',
  'primary banks',
  // Pig butchering / investment romance
  'trading platform',
  'investment platform',
  'trading app',
  'forex trading',
  'fx trading',
  'crypto trading platform',
  'compound interest daily',
  'high return investment',
  'guaranteed return',
  'guaranteed profit',
  'double your money',
  'triple your money',
  'passive income program',
  'financial mentor',
  'trading mentor',
  'trading signal',
  'trading group',
  // Deed / property fraud
  'sign over your property',
  'deed transfer',
  'property lien',
  'foreclosure notice',
  'eviction notice',
  'sign the deed',
  // Bail bond scam
  'bail money',
  'bail bond',
  'post bail',
  'release from jail',
  'arrested family member',
  'lawyer fee',
  'attorney retainer',
  // AI / voice clone scam signals
  'ai voice',
  'cloned voice',
  'i am calling on behalf of your family',
  'your loved one is in trouble',
  'do not tell anyone about this call',
  // Utility / service cutoff scams
  'power will be shut off',
  'electricity will be cut',
  'service disconnection',
  'final notice before disconnection',
  'utility disconnection',
  'gas will be shut',
  'water will be shut',
  'disconnect within the hour',
  'immediate payment to avoid disconnection',
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

function buildPhraseRegex(
  phrase: string,
  options: {
    global?: boolean;
    allowInflections?: boolean;
    allowAsrVariants?: boolean;
    includePhraseVariants?: boolean;
    maxInterveningWords?: number;
  } = {}
) {
  const {
    global = false,
    allowInflections = true,
    allowAsrVariants = true,
    includePhraseVariants = true,
    maxInterveningWords = 1,
  } = options;
  const cleaned = normalizeText(phrase);
  if (!cleaned) {
    return null;
  }
  const phraseVariants = includePhraseVariants ? PHRASE_ASR_VARIANT_MAP[cleaned] ?? [] : [];
  const candidatePhrases = Array.from(
    new Set([cleaned, ...phraseVariants.map((value) => normalizeText(value)).filter(Boolean)])
  );
  const candidatePatterns = candidatePhrases
    .map((candidate) => {
      const tokens = candidate.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) {
        return null;
      }
      const tokenPatterns = tokens.map((token) => {
        const alternatives = new Set<string>([token]);
        if (allowInflections) {
          for (const variant of TOKEN_INFLECTION_MAP[token] ?? []) {
            const normalizedVariant = normalizeText(variant);
            if (normalizedVariant) {
              alternatives.add(normalizedVariant);
            }
          }
        }
        if (allowAsrVariants) {
          for (const variant of TOKEN_ASR_VARIANT_MAP[token] ?? []) {
            const normalizedVariant = normalizeText(variant);
            if (normalizedVariant) {
              alternatives.add(normalizedVariant);
            }
          }
        }
        const validAlternatives = Array.from(alternatives).filter((value) => !value.includes(' '));
        if (validAlternatives.length <= 1) {
          return escapeRegExp(token);
        }
        return `(?:${validAlternatives.map(escapeRegExp).join('|')})`;
      });
      if (tokenPatterns.length === 1) {
        return tokenPatterns[0];
      }
      const gapPattern =
        maxInterveningWords > 0
          ? `(?:\\s+\\w+){0,${maxInterveningWords}}\\s+`
          : '\\s+';
      return tokenPatterns.join(gapPattern);
    })
    .filter((value): value is string => Boolean(value));
  if (candidatePatterns.length === 0) {
    return null;
  }
  const combinedPattern =
    candidatePatterns.length > 1 ? `(?:${candidatePatterns.join('|')})` : candidatePatterns[0];
  return new RegExp(`\\b${combinedPattern}\\b`, global ? 'gi' : 'i');
}

export function matchPhrases(text: string, phrases: string[]) {
  const normalized = normalizeText(text);
  if (!normalized || phrases.length === 0) {
    return [];
  }
  const matches = new Set<string>();
  for (const phrase of phrases) {
    const regex = buildPhraseRegex(phrase, {
      allowInflections: false,
      allowAsrVariants: false,
      includePhraseVariants: false,
      maxInterveningWords: 0,
    });
    if (regex && regex.test(normalized)) {
      matches.add(phrase);
    }
  }
  return Array.from(matches.values());
}

function countPhraseHits(text: string, phrases: string[]) {
  return phrases.reduce((count, phrase) => {
    const regex = buildPhraseRegex(phrase, { maxInterveningWords: 1 });
    return regex && regex.test(text) ? count + 1 : count;
  }, 0);
}

function countCommandSensitiveCombos(text: string) {
  let hits = 0;
  for (const verb of ACTION_VERBS) {
    const verbRegex = buildPhraseRegex(verb, { maxInterveningWords: 0 });
    if (!verbRegex || !verbRegex.test(text)) continue;
    for (const noun of SENSITIVE_NOUNS) {
      const nounRegex = buildPhraseRegex(noun, { maxInterveningWords: 0 });
      if (nounRegex && nounRegex.test(text)) {
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
    const regex = buildPhraseRegex(phrase, { maxInterveningWords: 1 });
    if (regex && regex.test(text)) {
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
    const variantMatched = [canonical, ...variants].some((variant) => {
      const regex = buildPhraseRegex(variant, {
        allowInflections: false,
        includePhraseVariants: false,
        maxInterveningWords: 0,
      });
      return Boolean(regex && regex.test(text));
    });
    if (variantMatched) {
      matches.push({ phrase: canonical, weight: 8, category: 'fuzzy' });
    }
  }

  for (const keyword of keywords) {
    const regex = buildPhraseRegex(keyword.phrase, { global: true, maxInterveningWords: 1 });
    if (!regex) {
      continue;
    }
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
    if (rule.all.every((kw) => {
      const regex = buildPhraseRegex(kw, { maxInterveningWords: 1 });
      return regex ? regex.test(text) : false;
    })) {
      boost += rule.add;
    }
  }
  return Math.min(30, boost);
}

function heuristicBoosts(text: string, safePhraseMatches: string[] = []) {
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
  const callbackBoost = callbackHits >= 1 ? 12 : 0;
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
  const travelPromoHits = countPhraseHits(text, TRAVEL_PROMO_TERMS);
  const emailHits = countPhraseHits(text, EMAIL_PHISHING_TERMS);
  const medicalScamHits = countPhraseHits(text, MEDICAL_SCAM_TERMS);
  const utilityHits = countPhraseHits(text, UTILITY_TERMS);
  const charityHits = countPhraseHits(text, CHARITY_TERMS);
  const grandchildHits = countPhraseHits(text, GRANDCHILD_TERMS);
  const sweepstakesHits = countPhraseHits(text, SWEEPSTAKES_TERMS);
  const romanceHits = countPhraseHits(text, ROMANCE_TERMS);
  const jobLoanHits = countPhraseHits(text, JOB_LOAN_TERMS);
  const familyEmergencyHits = countPhraseHits(text, FAMILY_EMERGENCY_TERMS);
  const governmentImpersonationHits = countPhraseHits(text, GOVERNMENT_IMPERSONATION_TERMS);
  const warrantyHits = countPhraseHits(text, WARRANTY_SCAM_TERMS);
  const timeshareHits = countPhraseHits(text, TIMESHARE_SCAM_TERMS);
  const studentLoanHits = countPhraseHits(text, STUDENT_LOAN_SCAM_TERMS);
  const inheritanceHits = countPhraseHits(text, INHERITANCE_SCAM_TERMS);
  const qrScamHits = countPhraseHits(text, QR_SCAM_TERMS);
  const solarScamHits = countPhraseHits(text, SOLAR_SCAM_TERMS);
  const veteranScamHits = countPhraseHits(text, VETERAN_SCAM_TERMS);

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
  if (grandchildHits >= 1) boost += 28;
  if (grandchildHits >= 1 && giftCardHits >= 1) boost += 18;
  if (sweepstakesHits >= 1) boost += 22;
  if (sweepstakesHits >= 1 && paymentRequestHits >= 1) boost += 16;
  if (romanceHits >= 1) boost += 20;
  if (romanceHits >= 1 && paymentAppHits >= 1) boost += 10;
  if (jobLoanHits >= 1) boost += 26;
  if (jobLoanHits >= 1 && paymentAppHits >= 1) boost += 8;
  if (emailHits >= 1) boost += 18;
  if (emailHits >= 1 && linkHits >= 1) boost += 16;
  if (emailHits >= 1 && paymentRequestHits >= 1) boost += 12;
  if (medicalScamHits >= 1) boost += 18;
  if (medicalScamHits >= 1 && paymentAppHits >= 1) boost += 10;
  if (utilityHits >= 1) boost += 16;
  if (utilityHits >= 1 && urgencyHits >= 1) boost += 10;
  if (charityHits >= 1) boost += 16;
  if (charityHits >= 1 && paymentRequestHits >= 1) boost += 10;
  if (charityHits >= 1 && urgencyHits >= 1) boost += 6;
  if (familyEmergencyHits >= 1) boost += 24;
  if (familyEmergencyHits >= 1 && giftCardHits >= 1) boost += 16;
  if (familyEmergencyHits >= 1 && callbackHits >= 1) boost += 10;
  if (familyEmergencyHits >= 1 && urgencyHits >= 1) boost += 8;
  if (governmentImpersonationHits >= 1) boost += 22;
  if (governmentImpersonationHits >= 1 && paymentRequestHits >= 1) boost += 14;
  if (governmentImpersonationHits >= 2) boost += 10;
  if (callbackBoost > 0) {
    const callbackReduction = safePhraseMatches.length > 0 ? Math.min(8, callbackBoost) : 0;
    boost += Math.max(0, callbackBoost - callbackReduction);
  }
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
  if (travelPromoHits >= 1) boost += Math.min(24, travelPromoHits * 12);
  if (warrantyHits >= 1) boost += 18;
  if (warrantyHits >= 1 && paymentRequestHits >= 1) boost += 12;
  if (warrantyHits >= 1 && urgencyHits >= 1) boost += 8;
  if (timeshareHits >= 1) boost += 20;
  if (timeshareHits >= 1 && paymentRequestHits >= 1) boost += 14;
  if (studentLoanHits >= 1) boost += 22;
  if (studentLoanHits >= 1 && paymentRequestHits >= 1) boost += 14;
  if (inheritanceHits >= 1) boost += 24;
  if (inheritanceHits >= 1 && paymentRequestHits >= 1) boost += 16;
  if (qrScamHits >= 1) boost += 20;
  if (qrScamHits >= 1 && paymentRequestHits >= 1) boost += 12;
  if (solarScamHits >= 1) boost += 16;
  if (solarScamHits >= 1 && paymentRequestHits >= 1) boost += 12;
  if (veteranScamHits >= 1) boost += 18;
  if (veteranScamHits >= 1 && paymentRequestHits >= 1) boost += 12;

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
    travelPromoHits,
    grandchildHits,
    sweepstakesHits,
    romanceHits,
    jobLoanHits,
    emailHits,
    medicalScamHits,
    utilityHits,
    charityHits,
    familyEmergencyHits,
    governmentImpersonationHits,
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
  const voiceSyntheticScore = null;
  const voiceBoost = 0;
  const safePhraseMatches = (metadata.safePhraseMatches ?? []).filter(Boolean);
  const heuristic = heuristicBoosts(normalized, safePhraseMatches);
  const actionBoost = heuristic.actionBoost;
  const safePhraseDampening = safePhraseMatches.length > 0 ? Math.min(40, safePhraseMatches.length * 12) : 0;

  if (!normalized) {
    return {
      score: 0,
      riskLevel: 'low',
      matchedKeywords: [],
      notes: {
        callbackHits: 0,
        giftCardHits: 0,
        linkHits: 0,
        grandchildHits: 0,
        sweepstakesHits: 0,
        romanceHits: 0,
        jobLoanHits: 0,
        emailHits: 0,
        medicalScamHits: 0,
        utilityHits: 0,
        charityHits: 0,
        familyEmergencyHits: 0,
        governmentImpersonationHits: 0,
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
        travelPromoHits: 0,
        remoteAccessHits: 0,
        voiceSyntheticScore,
        voiceBoost,
      },
    } satisfies FraudAnalysis;
  }

  const { matches, negated } = findMatches(normalized, DEFAULT_KEYWORDS);

  const weightSum = matches.reduce((sum, kw) => sum + kw.weight, 0);
  let score = (matches.length / 4) * 40;
  score += (weightSum / 100) * 60;
  const multiplier = Math.max(1, Math.log(matches.length + 1));
  score *= multiplier;
  let boost = comboBoost(normalized) + heuristic.boost;
  boost = Math.max(0, boost - safePhraseDampening);
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
  const strongHardBlockSignal =
    heuristic.hardBlockHits >= 1 &&
    (heuristic.paymentRequestHits >= 1 ||
      heuristic.codeRequestHits >= 1 ||
      heuristic.explicitScamHits >= 1 ||
      heuristic.threatHits >= 1 ||
      heuristic.accountAccessHits >= 1 ||
      heuristic.impersonationHits >= 1 ||
      criticalKeywordHits >= 2);
  const strongTechSupportSignal =
    techSupportHits >= 1 &&
    (heuristic.remoteAccessHits >= 1 ||
      heuristic.codeRequestHits >= 1 ||
      heuristic.paymentRequestHits >= 1 ||
      heuristic.accountAccessHits >= 1);

  if (heuristic.explicitScamHits >= 1) {
    score = Math.max(score, 90);
  }
  if (heuristic.hardBlockHits >= 1) {
    score = Math.max(score, strongHardBlockSignal ? 95 : 82);
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
    score = Math.max(score, 35);
  }
  if (matches.length >= 2) {
    score = Math.max(score, 50);
  }
  if (matches.length >= 3) {
    score = Math.max(score, 65);
  }
  if (heuristic.jobLoanHits >= 1) {
    score = Math.max(score, 85);
  }
  if (heuristic.sweepstakesHits >= 1) {
    score = Math.max(score, 70);
  }
  if (heuristic.governmentImpersonationHits >= 1) {
    score = Math.max(score, 85);
  }
  if (heuristic.threatHits >= 1) {
    score = Math.max(score, 70);
  }
  if (heuristic.threatHits >= 2) {
    score = Math.max(score, 90);
  }
  if (heuristic.travelPromoHits >= 1) {
    score = Math.max(score, 70);
  }
  if (heuristic.investmentHits >= 1) {
    score = Math.max(score, 70);
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
  if (strongTechSupportSignal) {
    score = Math.max(score, 95);
  } else if (techSupportHits >= 2) {
    score = Math.max(score, 88);
  } else if (techSupportHits >= 1) {
    score = Math.max(score, 75);
  }
  if (piiHarvestHits >= 1 && actionBoost > 0) {
    score = Math.max(score, 80);
  }
  if (piiHarvestHits >= 2 && actionBoost > 0) {
    score = Math.max(score, 85);
  }

  // If hard-block terms or tax+payment patterns hit, force alert-required signal.
  const hardBlockOverride =
    heuristic.hardBlockHits >= 1 ||
    (taxKeywordHits >= 1 && (heuristic.paymentRequestHits >= 1 || matches.some((kw) => kw.phrase === 'payment')));
  const techSupportOverride = strongTechSupportSignal || techSupportHits >= 3;

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
        linkHits: heuristic.linkHits,
        giftCardHits: heuristic.giftCardHits,
        grandchildHits: heuristic.grandchildHits,
        sweepstakesHits: heuristic.sweepstakesHits,
        romanceHits: heuristic.romanceHits,
        jobLoanHits: heuristic.jobLoanHits,
        emailHits: heuristic.emailHits,
        medicalScamHits: heuristic.medicalScamHits,
        utilityHits: heuristic.utilityHits,
        charityHits: heuristic.charityHits,
        familyEmergencyHits: heuristic.familyEmergencyHits,
        governmentImpersonationHits: heuristic.governmentImpersonationHits,
        remoteAccessHits: heuristic.remoteAccessHits,
        criticalKeywordHits,
        callbackHits: heuristic.callbackHits,
        safePhraseMatches,
        safePhraseDampening,
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
        travelPromoHits: heuristic.travelPromoHits,
        voiceSyntheticScore,
        voiceBoost,
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
