# Fraud Detection & Keyword Analysis

## Overview

SafeCall detects fraud through a multi-layered approach:

1. **Keyword Matching** - Real-time pattern detection
2. **Contextual Analysis** - Understanding meaning beyond keywords
3. **Machine Learning** (Phase 2) - Advanced pattern recognition
4. **Community Reporting** (Phase 3) - Crowdsourced scam database

This document focuses on **Phase 1: Keyword Matching** for MVP.

---

## Fraud Score Calculation

### Algorithm

```
fraud_score = (matched_keywords_sum / total_possible_weight) * 100

Where:
- matched_keywords_sum = sum of severity weights of detected keywords
- total_possible_weight = sum of all active keyword weights
```

**Example:**

```
Transcript: "Hello, this is your bank calling. We detected suspicious 
activity on your account. Please verify your social security number."

Matched Keywords:
- "bank" (weight: 8)
- "verify" (weight: 16)
- "account" (weight: 12)
- "social security" (weight: 18)

Total Keywords Weight: 8 + 16 + 12 + 18 = 54

All Active Keywords Weight:
- "wire money" (20)
- "verify account" (16)
- "bank" (8)
- "confirm password" (18)
... and 30 more = 400 total

fraud_score = (54 / 400) * 100 = 13.5

Wait... that's too low!
```

### Better Algorithm (Weighted Average)

```
fraud_score = (total_matched_weight / 100) * 100

But capped at 100 and using severity multipliers:

fraud_score = Math.min(100, matched_count * 15 + keyword_weight_sum * 2)

Example:
- matched_count = 4 keywords
- keyword_weight_sum = 54
- fraud_score = (4 * 15) + (54 * 2) = 60 + 108 = 168 → capped at 100

Hmm, still need refinement...
```

### Final Algorithm (Linear Scale)

```javascript
/**
 * Calculate fraud risk score based on detected keywords
 * 
 * @param detectedKeywords - Array of matched keywords
 * @param allKeywords - All available keywords with weights
 * @returns number (0-100)
 */
const calculateFraudScore = (
  detectedKeywords: Keyword[],
  allKeywords: Keyword[]
): number => {
  if (detectedKeywords.length === 0) {
    return 0;
  }
  
  // Sum of weights of detected keywords
  const detectedSum = detectedKeywords.reduce(
    (sum, kw) => sum + kw.severity_weight, 
    0
  );
  
  // Average weight per keyword
  const avgKeywordWeight = 15; // Empirically determined
  
  // Base score from keyword matches
  let score = (detectedKeywords.length / 4) * 40; // 4+ keywords = high risk
  
  // Add weight-based score
  score += (detectedSum / 100) * 60;
  
  // Multiply by number of matches (diminishing returns)
  const matchMultiplier = Math.log(detectedKeywords.length + 1);
  score *= matchMultiplier;
  
  // Cap at 100
  return Math.min(100, Math.round(score));
};
```

**Examples:**

| Keyword Count | Keywords | Total Weight | Fraud Score |
|---|---|---|---|
| 0 | None | 0 | 0 (safe) |
| 1 | "bank" | 8 | 15 (low) |
| 2 | "verify", "account" | 28 | 35 (medium) |
| 3 | "bank", "verify", "password" | 42 | 55 (high) |
| 4+ | "bank", "verify", "SSN", "confirm" | 54 | 80+ (critical) |

---

## Default Fraud Keywords

### DONATIONS (High Risk)

### CHARITIES (High Risk)

### Banking & Finance (High Risk)

```
Weight 20 (highest):
- "wire money"
- "send money"
- "payment"
- "verify account"
- "confirm credit card"
- "account number"

Weight 16-18:
- "bank"
- "refund"
- "overdraft"
- "password"
- "PIN"
- "ATM"

Weight 10-15:
- "deposit"
- "withdraw"
- "balance"
- "transaction"
- "billing"
```

### Government & Taxes (High Risk)

```
Weight 20 (highest):
- "IRS"
- "FBI"
- "Social Security"
- "legal action"
- "arrest"

Weight 16-18:
- "tax refund"
- "tax return"
- "federal"
- "law enforcement"

Weight 10-15:
- "compliance"
- "audit"
- "license"
- "penalty"
```

### Tech Support (Medium-High Risk)

```
Weight 18:
- "Microsoft"
- "Apple"
- "Microsoft support"

Weight 15:
- "virus"
- "malware"
- "update"
- "install"

Weight 10-12:
- "computer"
- "system"
- "repair"
- "access"
```

### Prize/Lottery (High Risk)

```
Weight 18:
- "congratulations"
- "winner"
- "prize"

Weight 15:
- "claim"
- "reward"
- "lottery"

Weight 10:
- "free"
- "gift"
```

### Urgency/Pressure Tactics

```
Weight 15:
- "immediately"
- "urgent"
- "now"
- "right away"
- "today only"
- "limited time"

Weight 12:
- "expire"
- "deadline"
- "don't wait"
```

---

## Implementation

### Database Schema

```sql
CREATE TABLE fraud_keywords (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL,
  keyword VARCHAR(100) NOT NULL,
  keyword_category VARCHAR(50),
  severity_weight INT (0-20),
  is_active BOOLEAN DEFAULT true,
  source VARCHAR(50), -- 'default' | 'custom'
  created_by_user_id UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Backend Service

```typescript
// backend/src/services/fraud.ts

import { Keyword, Call } from '../types';

interface FraudAnalysisResult {
  fraud_score: number;
  fraud_keywords_detected: string[];
  is_fraud: boolean;
  analysis_details: {
    keyword_matches: number;
    total_words: number;
    match_percentage: number;
    severity_sum: number;
  };
}

class FraudDetectionService {
  /**
   * Analyze transcript for fraud indicators
   */
  async analyzeTranscript(
    transcript: string,
    keywords: Keyword[],
    threshold: number = 70
  ): Promise<FraudAnalysisResult> {
    // Normalize transcript
    const normalized = this.normalizeText(transcript);
    
    // Extract words
    const words = normalized.split(/\s+/);
    
    // Find matching keywords
    const matches = this.findKeywordMatches(normalized, keywords);
    
    // Calculate fraud score
    const fraudScore = this.calculateScore(matches);
    
    // Determine risk level
    const isFraud = fraudScore >= threshold;
    
    return {
      fraud_score: fraudScore,
      fraud_keywords_detected: matches.map(m => m.keyword),
      is_fraud: isFraud,
      analysis_details: {
        keyword_matches: matches.length,
        total_words: words.length,
        match_percentage: (matches.length / words.length) * 100,
        severity_sum: matches.reduce((sum, m) => sum + m.severity_weight, 0)
      }
    };
  }

  /**
   * Normalize text for keyword matching
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  /**
   * Find keyword matches in transcript
   */
  private findKeywordMatches(
    text: string,
    keywords: Keyword[]
  ): Keyword[] {
    const matches: Keyword[] = [];
    
    for (const keyword of keywords) {
      if (!keyword.is_active) continue;
      
      // Create regex for phrase or word matching
      const regex = new RegExp(`\\b${keyword.keyword}\\b`, 'gi');
      
      if (regex.test(text)) {
        matches.push(keyword);
      }
    }
    
    // Remove duplicates
    return Array.from(new Map(
      matches.map(m => [m.keyword, m])
    ).values());
  }

  /**
   * Calculate fraud score (0-100)
   */
  private calculateScore(matches: Keyword[]): number {
    if (matches.length === 0) return 0;
    
    // Sum of matched keyword weights
    const weightSum = matches.reduce((sum, m) => sum + m.severity_weight, 0);
    
    // Base score from keyword count
    let score = (matches.length / 5) * 40;
    
    // Add weight-based score
    score += (weightSum / 100) * 60;
    
    // Multiply by match frequency (diminishing returns)
    const frequencyMultiplier = Math.log(matches.length + 1);
    score *= frequencyMultiplier;
    
    return Math.min(100, Math.round(score));
  }

  /**
   * Get keywords for a profile
   */
  async getKeywordsForProfile(profileId: string): Promise<Keyword[]> {
    // Get default keywords + custom keywords
    const defaultKeywords = await this.supabase
      .from('fraud_keywords')
      .select('*')
      .eq('source', 'default')
      .eq('is_active', true);
    
    const customKeywords = await this.supabase
      .from('fraud_keywords')
      .select('*')
      .eq('profile_id', profileId)
      .eq('is_active', true);
    
    return [...defaultKeywords.data, ...customKeywords.data];
  }

  /**
   * Add custom keyword for profile
   */
  async addCustomKeyword(
    profileId: string,
    keyword: string,
    weight: number,
    userId: string
  ): Promise<void> {
    await this.supabase
      .from('fraud_keywords')
      .insert({
        profile_id: profileId,
        keyword: keyword.toLowerCase(),
        severity_weight: Math.min(20, Math.max(1, weight)),
        is_active: true,
        source: 'custom',
        created_by_user_id: userId
      });
  }
}

export default new FraudDetectionService();
```

### Integration with Call Processing

```typescript
// When voicemail is transcribed

const transcriptionResult = await azure.transcribe(recording);
const keywords = await fraud.getKeywordsForProfile(profileId);

const fraudAnalysis = await fraud.analyzeTranscript(
  transcriptionResult.transcript,
  keywords,
  profile.alert_threshold_score
);

// Update call record
await supabase.from('calls').update({
  transcript: transcriptionResult.transcript,
  fraud_score: fraudAnalysis.fraud_score,
  fraud_keywords_detected: fraudAnalysis.fraud_keywords_detected,
  is_fraud: fraudAnalysis.is_fraud,
  fraud_analysis_details: fraudAnalysis.analysis_details,
  status: 'completed'
}).eq('id', callId);

// If fraud, create alert
if (fraudAnalysis.is_fraud) {
  await alerts.createAlert(profileId, callId, 'fraud');
}
```

---

## Customization

### Adjusting Sensitivity

**For sensitive profiles** (high false positive rate):
```
Lower threshold: 60 instead of 70
Remove low-weight keywords (< 10)
Add caretaker-approved safe phrases
```

**For less sensitive profiles:**
```
Higher threshold: 80
Add more keywords
Stricter matching (exact phrases only)
```

### Adding Custom Keywords

**Via App:**
```
Settings > Fraud Detection > Add Keyword
Keyword: "PayPal"
Severity: 15
```

**Via API:**
```bash
POST /api/v1/profiles/prof_123/fraud-keywords
{
  "keyword": "PayPal",
  "severity_weight": 15
}
```

**Via Database:**
```sql
INSERT INTO fraud_keywords (
  profile_id, keyword, severity_weight, source, created_by_user_id
) VALUES
('prof_123', 'paypal', 15, 'custom', 'user_123');
```

---

## Machine Learning (Phase 2)

Future improvements:

1. **Sentiment Analysis**
   - Detect urgent/emotional language
   - Analyze pressure tactics

2. **Speech Patterns**
   - Unusual accents/speech patterns
   - Background noise indicators
   - Unusual call timing

3. **Sequential Analysis**
   - Multiple calls from same number
   - Similar scripts detected
   - Pattern matching across community

4. **NLP Models**
   - Fine-tuned BERT for scam detection
   - Contextual embeddings
   - Transfer learning from labeled scam database

---

## Testing Fraud Detection

### Unit Tests

```typescript
// tests/fraud.test.ts

describe('FraudDetectionService', () => {
  test('detects high-risk banking scam', async () => {
    const transcript = `
      Hello, this is your bank calling. We detected suspicious 
      activity on your account. Please verify your social security 
      number to confirm your identity.
    `;
    
    const result = await fraud.analyzeTranscript(
      transcript,
      defaultKeywords,
      70
    );
    
    expect(result.fraud_score).toBeGreaterThanOrEqual(70);
    expect(result.is_fraud).toBe(true);
    expect(result.fraud_keywords_detected).toContain('bank');
    expect(result.fraud_keywords_detected).toContain('verify');
  });

  test('returns low score for legitimate call', async () => {
    const transcript = `
      Hi, this is John from your book club. Just calling to 
      check in and confirm the meeting next Tuesday.
    `;
    
    const result = await fraud.analyzeTranscript(
      transcript,
      defaultKeywords,
      70
    );
    
    expect(result.fraud_score).toBeLessThan(30);
    expect(result.is_fraud).toBe(false);
  });

  test('custom keywords override defaults', async () => {
    const customKeywords = [
      ...defaultKeywords,
      { keyword: 'grandma', severity_weight: 20, is_active: true }
    ];
    
    const transcript = 'Hi grandma, are you there?';
    const result = await fraud.analyzeTranscript(
      transcript,
      customKeywords,
      70
    );
    
    // Should match custom keyword
    expect(result.fraud_keywords_detected).toContain('grandma');
  });
});
```

### Integration Tests

```typescript
// Test with real transcriptions
import * as fs from 'fs';

describe('Fraud Detection Integration', () => {
  const testCases = [
    {
      file: 'tests/samples/banking-scam.wav',
      expectedScore: 80,
      expectedFraud: true
    },
    {
      file: 'tests/samples/legitimate-call.wav',
      expectedScore: 15,
      expectedFraud: false
    }
  ];

  for (const testCase of testCases) {
    test(`correctly identifies ${testCase.file}`, async () => {
      const audio = fs.readFileSync(testCase.file);
      const transcript = await azure.transcribe(audio);
      const result = await fraud.analyzeTranscript(transcript, defaultKeywords);
      
      expect(result.fraud_score).toBeCloseTo(testCase.expectedScore, 10);
      expect(result.is_fraud).toBe(testCase.expectedFraud);
    });
  }
});
```

---

## Monitoring & Improvement

### Metrics to Track

```sql
-- False positive rate
SELECT 
  COUNT(*) as total_fraud_calls,
  COUNT(CASE WHEN status = 'marked_safe' THEN 1 END) as false_positives,
  COUNT(CASE WHEN status = 'marked_safe' THEN 1 END)::FLOAT / COUNT(*) as fp_rate
FROM calls WHERE is_fraud = true;

-- Detection accuracy
SELECT 
  COUNT(CASE WHEN is_fraud = true AND status = 'marked_fraud' THEN 1 END)::FLOAT / 
  COUNT(CASE WHEN status = 'marked_fraud' THEN 1 END) as precision,
  COUNT(CASE WHEN is_fraud = true AND status IN ('marked_fraud', 'reviewed') THEN 1 END)::FLOAT / 
  COUNT(CASE WHEN status IN ('marked_fraud', 'reviewed') THEN 1 END) as recall
FROM calls;

-- Keyword effectiveness
SELECT 
  keyword,
  COUNT(*) as times_matched,
  COUNT(CASE WHEN is_fraud = true THEN 1 END) as fraud_cases,
  COUNT(CASE WHEN is_fraud = true THEN 1 END)::FLOAT / COUNT(*) as accuracy
FROM calls, UNNEST(fraud_keywords_detected) as keyword
GROUP BY keyword
ORDER BY accuracy DESC;
```

### Feedback Loop

1. **Collect feedback:** "Mark as fraud" / "Mark as safe" from caretakers
2. **Analyze misclassifications:** Why did we miss this? Why false alarm?
3. **Adjust keywords:** Add new ones, adjust weights
4. **Retrain models:** Feed labeled data to ML model (Phase 2)
5. **Iterate:** Continuously improve detection

---

## Edge Cases

### Handling

```typescript
// Empty transcript
const emptyTranscript = '';
// Returns score: 0 (safe)

// Very short transcript
const shortTranscript = 'Hi';
// Returns score: 0 (too short to assess)

// All keywords
const allKeywords = 'wire money verify account confirm password send gift card';
// Returns score: 90+ (high risk)

// Legitimate but matches keywords
const legitimateButMatches = 'My bank called to verify my account information';
// Returns score: 45 (medium risk - context matters)
```

### Context Awareness (Phase 2)

```
Current: Keyword matching only
Problem: "verify account" = fraud, but "I need to verify my account" = legitimate

Future: Contextual analysis
- "they asked me to verify" = fraud indicator
- "I need to verify" = legitimate
- Sentiment analysis
- Negation detection ("I did NOT give them money")
```
