import { analyzeTranscript, FraudMetadata } from '../src/services/fraud';
import { describe, it, expect } from 'vitest';

describe('Fraud Engine v1.1.0 - Phase 1 Fixes', () => {
  /**
   * PHASE 1.1: Context Dampening
   * Tests that legitimate context (joking, reporting scams, doctor consultations)
   * results in LOW scores (0), not CRITICAL (95)
   */
  describe('Phase 1.1: Legitimate Context Suppression', () => {
    it('Should suppress score when caller says they were joking about being a scammer', () => {
      const transcript = 'I was just joking, I am not a real scammer or anything like that';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(20);
      expect(result.riskLevel).toBe('low');
    });

    it('Should suppress score for "I think it is a scam" (reporting to someone)', () => {
      const transcript = 'Yeah I got a weird call asking for gift cards, I think it is a scam they were calling about';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(30);
      expect(result.riskLevel).toBe('low');
    });

    it('Should suppress score when caller mentions doctor said something, even with payment keywords', () => {
      const transcript = 'My doctor said I might have to pay for surgery, it could be expensive';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(40);
    });

    it('Should suppress score for explicit joking context', () => {
      const transcript = 'I am just messing around with you, I would never actually scam someone or rob your account';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(25);
    });

    it('Should suppress score when person says "not a scam" after mentioning it', () => {
      const transcript = 'They asked me to send zelle money, but that is not a real scam situation actually';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(35);
    });

    it('Should suppress score when friend/advisor mentioned with payment keywords', () => {
      const transcript = 'My accountant told me I might need to transfer some funds for tax purposes, so I was wondering';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(40);
    });

    it('Should suppress score for "testing" context with fraud keywords', () => {
      const transcript = 'I am testing you, im just playing around, would you really send money if I asked for gift card codes';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(30);
    });
  });

  /**
   * PHASE 1.2: Revert Aggressive Floor Forcing
   * Tests that single fraud keywords NO LONGER force critical scores
   * Requires 2+ signals for high scores
   */
  describe('Phase 1.2: Multi-Signal Floor Requirements', () => {
    it('Should NOT force critical on single "Zelle" mention alone', () => {
      const transcript = 'I got a call about zelle';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(80);
      expect(result.riskLevel).not.toBe('critical');
    });

    it('Should NOT force critical on single "gift card" mention alone', () => {
      const transcript = 'I got a gift card for my birthday';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(75);
      expect(result.riskLevel).not.toBe('critical');
    });

    it('Should NOT force high on single "credit card" mention', () => {
      const transcript = 'I lost my credit card somewhere';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(70);
    });

    it('SHOULD force critical on Zelle + payment request + urgency (3 signals)', () => {
      const transcript = 'Buy iTunes gift cards now and send me the codes immediately via Zelle, pay me right away';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeGreaterThanOrEqual(85);
    });

    it('SHOULD force high on hard block + payment request combo (2 signals)', () => {
      const transcript = 'I need you to send money via zelle immediately please';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeGreaterThanOrEqual(75);
    });

    it('SHOULD force critical on tax keywords + payment request (strong combo)', () => {
      const transcript = 'Back taxes are owed and you must pay immediately via wire transfer or face legal action';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeGreaterThanOrEqual(90);
    });

    it('Should reduce score significantly for single tax keyword without payment signals', () => {
      const transcript = 'I was wondering about my taxes this year';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(65);
    });

    it('SHOULD force high on explicit scam intent (always strong)', () => {
      const transcript = 'I am going to scam you out of your money';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeGreaterThanOrEqual(85);
    });

    it('SHOULD force critical on tech support + remote access + code request (3 signals)', () => {
      const transcript = 'Microsoft support here, we need remote access to your computer, can you read me the code on your screen';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeGreaterThanOrEqual(90);
    });
  });

  /**
   * PHASE 1.3: Safe Phrase Override
   * Tests that when 2+ safe phrases present (doctor, friend, legitimate context),
   * aggressive floors are skipped entirely, allowing heuristic boosts to dominate
   */
  describe('Phase 1.3: Safe Phrase Dampening Override', () => {
    it('Should crash score with 2+ safe phrases despite hard block keywords', () => {
      const transcript = 'My doctor and my lawyer both said I might have to pay some money, they called me about it';
      const safePhrases = ['doctor', 'lawyer'];
      const result = analyzeTranscript(transcript, { safePhraseMatches: safePhrases });
      expect(result.score).toBeLessThan(50);
      expect(result.riskLevel).not.toBe('high');
    });

    it('Should prevent aggressive floor for bank + auth keywords with safe phrases', () => {
      const transcript = 'My bank said they need to verify my account for account compromised situation, my advisor mentioned';
      const safePhrases = ['bank', 'advisor'];
      const result = analyzeTranscript(transcript, { safePhraseMatches: safePhrases });
      expect(result.score).toBeLessThan(60);
    });

    it('Should allow normal scoring with single safe phrase (no override)', () => {
      const transcript = 'Wire money to me immediately or face arrest and warrant for unpaid taxes';
      const safePhrases = ['doctor'];
      const result = analyzeTranscript(transcript, { safePhraseMatches: safePhrases });
      // Should NOT be 0-10, single safe phrase doesn't override
      expect(result.score).toBeGreaterThan(40);
    });

    it('Should allow critical score for explicit scam + multiple signals even with 1 safe phrase', () => {
      const transcript = 'I am going to scam you and steal all your money, send zelle payment now urgently';
      const safePhrases = ['doctor'];
      const result = analyzeTranscript(transcript, { safePhraseMatches: safePhrases });
      // Explicit scam hits 90+ floor regardless
      expect(result.score).toBeGreaterThanOrEqual(85);
    });

    it('Should skip aggressive tax floors with 2+ safe phrases', () => {
      const transcript = 'Back taxes are owed, my accountant said, and the government will contact you for payment';
      const safePhrases = ['accountant', 'government'];
      const result = analyzeTranscript(transcript, { safePhraseMatches: safePhrases });
      expect(result.score).toBeLessThan(70);
    });
  });

  /**
   * Integration Tests: Realistic scenarios combining all phases
   */
  describe('Phase 1 Integration: Realistic Call Scenarios', () => {
    it('Scenario 1: Legitimate grandparent helping with bail (should be LOW)', () => {
      const transcript = 'My granddaughter called me from the police station, she needs bail money, I am going to help her out by sending a gift card number';
      const safePhrases = ['granddaughter', 'police'];
      const result = analyzeTranscript(transcript, { safePhraseMatches: safePhrases });
      // Should have low-medium score despite bail + money keywords
      expect(result.score).toBeLessThan(60);
    });

    it('Scenario 2: Actual scam - multiple signals without safe phrases (should be CRITICAL)', () => {
      const transcript = 'Listen to me carefully, this is the IRS, you have unpaid back taxes, we are sending a federal agent to arrest you, wire money via western union right now immediately or face jail';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeGreaterThanOrEqual(90);
      expect(result.riskLevel).toBe('critical');
    });

    it('Scenario 3: Person joking about scamming (should be LOW - Phase 1.1)', () => {
      const transcript = 'I am totally just kidding, if I was a scammer I would ask you to send me zelle money and gift card codes immediately lol, but I am just testing you';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(30);
    });

    it('Scenario 4: Techsupport scam - obvious (should be CRITICAL)', () => {
      const transcript = 'We are calling from Apple support, your laptop has a virus, we need teamviewer access, tell me the code on your screen, then we will charge your credit card for antivirus';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeGreaterThanOrEqual(85);
      expect(['high', 'critical']).toContain(result.riskLevel);
    });

    it('Scenario 5: Legitimate doctor call with payment mention (should be LOW-MEDIUM)', () => {
      const transcript = 'Your doctor called to confirm your insurance information and let you know about potential surgery costs that might be expensive';
      const safePhrases = ['doctor', 'insurance'];
      const result = analyzeTranscript(transcript, { safePhraseMatches: safePhrases });
      expect(result.score).toBeLessThan(50);
    });

    it('Scenario 6: Romance scam - clear indicators (should be HIGH-CRITICAL)', () => {
      const transcript = 'I love you so much, I need you to send me money for a flight ticket, keep this between us, do not tell your family, I will pay you back after we meet';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeGreaterThanOrEqual(75);
    });

    it('Scenario 7: Charity scam with urgency (should be MEDIUM-HIGH)', () => {
      const transcript = 'We are collecting donations for earthquake relief, please donate now via gift card, this is urgent, send the codes immediately';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeGreaterThanOrEqual(65);
    });

    it('Scenario 8: Single hard block keyword with legitimate context (should be MEDIUM)', () => {
      const transcript = 'My friend got me a gift card as a present for my birthday';
      const safePhrases = ['friend'];
      const result = analyzeTranscript(transcript, { safePhraseMatches: safePhrases });
      expect(result.score).toBeLessThan(60);
    });
  });

  /**
   * Edge Cases and Boundary Testing
   */
  describe('Edge Cases', () => {
    it('Empty transcript should return low score', () => {
      const result = analyzeTranscript('');
      expect(result.score).toBe(0);
      expect(result.riskLevel).toBe('low');
    });

    it('Whitespace-only transcript should return low score', () => {
      const result = analyzeTranscript('   \n\n  \t\t  ');
      expect(result.score).toBe(0);
    });

    it('Should handle negations correctly (not asking for money)', () => {
      const transcript = 'No I do not want your money and I will never ask for a gift card, that would be a scam';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(30);
    });

    it('Should handle very short legitimate context detection', () => {
      const transcript = 'I was joking';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(20);
    });

    it('Should handle mixed case and punctuation', () => {
      const transcript = 'I WAS JUST TESTING YOU!!! Would you really send ZELLE money???';
      const result = analyzeTranscript(transcript);
      expect(result.score).toBeLessThan(60);
    });

    it('Should calculate score as number 0-100', () => {
      const result = analyzeTranscript('Send me money immediately via zelle for taxes back payment');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result.score)).toBe(true);
    });
  });

  /**
   * Score Boundary Tests
   */
  describe('Score Ranges and Risk Levels', () => {
    it('Generic keyword should return low (0-39) range', () => {
      const result = analyzeTranscript('Hi this is a phone call about bank');
      expect(result.score).toBeLessThan(40);
      expect(result.riskLevel).toBe('low');
    });

    it('Mild fraud signals should return medium (40-69) range', () => {
      const result = analyzeTranscript('I need you to verify your account information and credit card');
      expect(result.score).toBeLessThanOrEqual(69);
      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.riskLevel).toBe('medium');
    });

    it('Strong fraud signals should return high (70-84) range', () => {
      const result = analyzeTranscript('Verify your bank account now, we detected suspicious unauthorized transactions on your account');
      expect(result.score).toBeLessThanOrEqual(84);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.riskLevel).toBe('high');
    });

    it('Explicit scam indicators should return critical (85-100) range', () => {
      const result = analyzeTranscript('I am going to scam you, send me all your money via zelle immediately or face arrest');
      expect(result.score).toBeGreaterThanOrEqual(85);
      expect(result.riskLevel).toBe('critical');
    });
  });

  /**
   * Ensure matchedKeywords are populated correctly
   */
  describe('Matched Keywords Output', () => {
    it('Should return list of matched keywords', () => {
      const result = analyzeTranscript('Send zelle money now for verified bank account payment');
      expect(Array.isArray(result.matchedKeywords)).toBe(true);
      expect(result.matchedKeywords.length).toBeGreaterThan(0);
    });

    it('Should include only actual matches, not false positives', () => {
      const result = analyzeTranscript('I was joking about being a scammer');
      // Should NOT match despite "scammer" keyword due to legitimate context
      expect(result.score).toBeLessThan(20);
    });

    it('Should track multiple keyword matches', () => {
      const result = analyzeTranscript('Back taxes owed, wire transfer payment immediately via zelle');
      expect(result.matchedKeywords.length).toBeGreaterThanOrEqual(3);
    });
  });

  /**
   * Metadata Integration
   */
  describe('Metadata Handling', () => {
    it('Should accept caller country metadata', () => {
      const result = analyzeTranscript('Send money now', { callerCountry: 'IN' });
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('Should accept call duration metadata', () => {
      const result = analyzeTranscript('Quick payment request', { callDurationSeconds: 5 });
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('Should handle missing metadata gracefully', () => {
      const result = analyzeTranscript('Send zelle payment');
      expect(result.riskLevel).toBeTruthy();
      expect(result.score).toBeTruthy();
    });
  });
});
