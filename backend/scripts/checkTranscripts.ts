import { analyzeTranscript } from '@src/services/fraud';

type Sample = { label: string; transcript: string };
const samples: Sample[] = [
  {
    label: 'callback safe phrase',
    transcript:
      "Hey, call me back on safe call and say the phrase 'blue lighthouse' so we can verify it’s you when you return the call",
  },
  {
    label: 'attorney bail gift cards',
    transcript:
      'Grandchild is arrested, the attorney needs bail money and gift card numbers—wire now and do not tell your parents',
  },
  {
    label: 'foreign lottery customs',
    transcript:
      'You won a foreign sweepstakes; pay the customs clearance fee and processing charge to release the prize',
  },
  {
    label: 'secrecy romance ticket',
    transcript:
      'Long distance relationship, need money for my flight, send it secretly so no one knows—keep it between us',
  },
  {
    label: 'certificate remote fix',
    transcript:
      'Microsoft support says your certificate expires; let us remote in and install antivirus before your computer locks you out',
  },
  {
    label: 'celebrity disaster trust',
    transcript:
      'Celebrity trust needs donations for hurricane relief; wire us through your bank account and match the emergency funding',
  },
  {
    label: 'PG&E threat',
    transcript:
      'PG&E cut off your power; a field technician arrives unless you pay the reconnection deposit and service drop fee via wire',
  },
  {
    label: 'mystery shopper deposit',
    transcript:
      'Mystery shopper job pays big once you submit the training deposit and bank verification code so we can activate the account',
  },
  {
    label: 'IRS deportation threat',
    transcript:
      'IRS agent with a warrant says you owe back taxes; avoid arrest and deportation by sending the funds immediately',
  },
  {
    label: 'email link lock',
    transcript:
      'Click the link in this email to verify your login now or else your account will be locked and flagged for fraud',
  },
  {
    label: 'gift card courier hold',
    transcript:
      'Officer demands Apple gift card numbers for the courier to deliver the estate payment—drop off the cards with the driver',
  },
  {
    label: 'medical audit Venmo',
    transcript:
      'Insurance audit says send payment through Venmo to avoid surgery delay and hospital debt collection',
  },
  {
    label: 'crypto wallet panic',
    transcript:
      'Send Bitcoin to protect your account; the wallet address is urgent or hackers will drain it in minutes',
  },
  {
    label: 'social security verify',
    transcript:
      'Verify your social security number, routing number, and password to prevent the fake account takeover attempts',
  },
  {
    label: 'subscription renewal urgent',
    transcript:
      'Your subscription auto-renewal failed; click the link and confirm billing info immediately to avoid cancellation',
  },
  {
    label: 'courier certificate',
    transcript:
      'Courier pickup requires a security certificate and drop-off money to the agent at the door before releasing the parcel',
  },
  {
    label: 'investment transfer',
    transcript:
      'Investment opportunity requires transferring shares, verifying trading account details, and covering the settlement commission',
  },
  {
    label: 'police warrant callback',
    transcript:
      'Police bail warning says press 1 to avoid arrest; the warrant will execute if you disconnect the call now',
  },
  {
    label: 'charity donation match',
    transcript:
      'Support our cause by donating now; send a check to the nonprofit center and the charity will match your gift',
  },
  {
    label: 'bank fraud audit',
    transcript:
      'Bank fraud department needs your account number and routing number to verify suspicious activity, do not hang up',
  },
  {
    label: 'apple remote session',
    transcript:
      'Apple support called to say your security certificate expired—allow our remote session and we will fix the warning',
  },
];

for (const sample of samples) {
  const result = analyzeTranscript(sample.transcript);
  const hitsToShow = ['callbackHits','giftCardHits','grandchildHits','sweepstakesHits','romanceHits','jobLoanHits','charityHits','utilityHits','techSupportHits','remoteAccessHits','governmentImpersonationHits','emailHits','linkHits','paymentRequestHits','hardBlockHits','threatHits'];
  const hitValues = hitsToShow.map((key) => ({ key, value: (result.notes as any)[key] ?? 0 }));
  console.log('---', sample.label);
  console.log(' score', result.score, 'level', result.riskLevel);
  console.log('keywords', result.matchedKeywords);
  console.log(hitValues.filter((h) => h.value > 0).map((h) => `${h.key}:${h.value}`).join(', '));
}
