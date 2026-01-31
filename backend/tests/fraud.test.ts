import { describe, expect, it } from 'vitest';
import { analyzeTranscript } from '@src/services/fraud';

const CALLBACK_SCRIPT =
  'Hey memmaw, call this number when you can, call me back immediately, and let\'s talk about family dinner.';

describe('fraud analysis heuristics', () => {
  it('reduces the callback boost when a safe phrase is present', () => {
    const baseline = analyzeTranscript(CALLBACK_SCRIPT);
    const safeMatchResult = analyzeTranscript(CALLBACK_SCRIPT, {
      safePhraseMatches: ['family dinner'],
    });

    expect(baseline.notes.callbackHits).toBeGreaterThanOrEqual(1);
    expect(safeMatchResult.notes.callbackHits).toBeGreaterThanOrEqual(1);
    expect(baseline.notes.comboBoost - safeMatchResult.notes.comboBoost).toBe(8);
    expect(safeMatchResult.score).toBeLessThanOrEqual(baseline.score);
  });

  it('scores grandchild bail + gift card requests very high', () => {
    const transcript =
      'Grandchild in jail, need bail money, send gift card number to pay the lawyer and get them out';
    const result = analyzeTranscript(transcript);
    expect(result.notes.grandchildHits).toBeGreaterThan(0);
    expect(result.notes.giftCardHits).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('scores sweepstakes/prize + fee calls high', () => {
    const transcript =
      'Congratulations! You have won the sweepstakes grand prize but you must pay the processing fee or taxes immediately';
    const result = analyzeTranscript(transcript);
    expect(result.notes.sweepstakesHits).toBeGreaterThan(0);
    expect(result.notes.taxScamHits).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('detects email phishing + link combos', () => {
    const transcript =
      'Verify your email now by clicking the link we sent you, otherwise your account will be locked';
    const result = analyzeTranscript(transcript);
    console.log('email notes', result.notes);
    expect(result.notes.emailHits).toBeGreaterThan(0);
    expect(result.notes.linkHits).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('raises the score when family emergency + callback is detected', () => {
    const transcript =
      'My grandchild is in jail and this family emergency needs attorney fees; send a gift card, do not tell your dad, and wire me money right away. Call this number immediately.';
    const result = analyzeTranscript(transcript);
    expect(result.notes.familyEmergencyHits).toBeGreaterThan(0);
    expect(result.notes.grandchildHits).toBeGreaterThan(0);
    expect(result.notes.callbackHits).toBeGreaterThan(0);
    expect(result.notes.giftCardHits).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('flags government impersonation with payment demand', () => {
    const transcript =
      'IRS agent here, your Social Security is suspended and we will deport you unless you pay the tax fraud unit by transferring funds immediately.';
    const result = analyzeTranscript(transcript);
    expect(result.notes.governmentImpersonationHits).toBeGreaterThan(0);
    expect(result.notes.taxScamHits).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('scores celebrity charity donation scams', () => {
    const transcript =
      'Celebrity charity needs emergency donations for hurricane relief; wire me your money right now.';
    const result = analyzeTranscript(transcript);
    expect(result.notes.charityHits).toBeGreaterThan(0);
    expect(result.notes.paymentRequestHits).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('flags utility shut-off scams with provider names and technician threats', () => {
    const transcript =
      'ComEd warns your electric bill is past due, a field technician arrives tomorrow to cut power unless you wire me your bank account details and pay the reconnection fee immediately.';
    const result = analyzeTranscript(transcript);
    expect(result.notes.utilityHits).toBeGreaterThan(0);
    expect(result.notes.threatHits).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('detects tech support requests asking for remote access', () => {
    const transcript =
      'Microsoft support says your security certificate is expiring, let us take control via remote access so we can fix your computer and remove the malware.';
    const result = analyzeTranscript(transcript);
    expect(result.notes.techSupportHits).toBeGreaterThan(0);
    expect(result.notes.remoteAccessHits).toBeGreaterThan(0);
    expect(result.notes.deviceHits).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('raises job/loan advance when training deposits and mystery shopper scripts appear', () => {
    const transcript =
      'Work from home job offer requires a training deposit; send me your bank account details and wire me the check cashing fee so the mystery shopper account can be activated.';
    const result = analyzeTranscript(transcript);
    expect(result.notes.jobLoanHits).toBeGreaterThan(0);
    expect(result.notes.paymentRequestHits).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('rescues romance scams that combine urgent secrecy and flight imagery', () => {
    const transcript =
      'Long distance relationship—throwaway message—send money for my flight ticket and keep it between us; this family emergency must stay secret, my family must never know.';
    const result = analyzeTranscript(transcript);
    expect(result.notes.romanceHits).toBeGreaterThan(0);
    expect(result.notes.secrecyHits).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(60);
  });
});
