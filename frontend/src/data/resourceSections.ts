export type ResourceSection = {
  id: string;
  title: string;
  body: string;
  bullets?: string[];
};

export type SupportResourceType = 'system-basics' | 'privacy' | 'faq' | 'billing';

export const SYSTEM_BASICS_CONTENT: ResourceSection[] = [
  {
    id: 'overview',
    title: 'How Verity Protect keeps you safe',
    body:
      'Verity Protect brings your trusted circle, ticket history, automation, and call monitoring into one place. You never have to dig through different apps; everything happens inside the same interface so you can act quickly.',
  },
  {
    id: 'twilio-call-flow',
    title: 'Twilio number & paired device',
    body:
      'Each profile pairs with a Twilio number. We record, analyze, and forward suspect calls, while also sending low-latency alerts to your phone. Add that number to your contacts so calls feel like a normal call from a trusted helper.',
    bullets: [
      'Link the Twilio number inside Settings → Paired Devices to see what hardware is listening.',
      'If you answer through the Twilio number, Verity automatically logs duration, transcription, and risk scores.',
      'Lost your phone? Remove the device from the list so it stops receiving alerts and recordings.',
    ],
  },
  {
    id: 'circles',
    title: 'Circle members & roles',
    body:
      'Invite caretakers, trusted contacts, or emergency helpers from the Members screen. Assign roles to control who can change automation, who can read alerts, and who can stay silent.',
    bullets: [
      'Caretakers manage automation, invite people, and can open tickets on behalf of a profile.',
      'Trusted contacts get read-only insights and can verify alerts with a safe phrase.',
      'Guests see only what you share and cannot reply or edit settings.',
    ],
  },
  {
    id: 'automation-safe-phrases',
    title: 'Automation, safe phrases, and blocked callers',
    body:
      'Automation watches keywords, call volume, location, and other signals. Combine it with safe phrases so your circle knows a call is okay without interrupting you.',
    bullets: [
      'Create automation rules for scam keywords; the system escalates alerts automatically.',
      'Add safe phrases that the system accepts when heard on a call so your caretakers can keep listening without raising an alarm.',
      'Use the blocked caller list in Settings to keep known scams out of the conversation.',
    ],
  },
  {
    id: 'pin-security',
    title: 'PINs, passcodes, and security support',
    body:
      'The app lock is a PIN that you choose; change it anytime from Settings → Security. It keeps the timeline, automation, and circle controls private.',
    bullets: [
      'Enter the PIN when opening the app or changing privacy settings.',
      'Reset it by verifying your email or phone number if you forget it.',
      'Enable biometric unlock if your device allows it so you can skip typing the PIN.',
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications & alerts',
    body:
      'Alerts pop up when automation fires, a ticket is replied to, or a suspicious call happens. Tweak alerts from Settings → Notifications so you hear only what matters to you.',
    bullets: [
      'Turn on push, email, or SMS alerts for each type of event.',
      'Mute an alert directly from the call or ticket card if it is not helpful.',
    ],
  },
  {
    id: 'support-tickets',
    title: 'Support tickets & feedback',
    body:
      'Open a ticket whenever something feels off. We keep the conversation in the portal so you can scroll back through replies, file attachments, and automation notes.',
    bullets: [
      'Use quick-prompt chips to start conversations about scams, billing, or technical help.',
      'View the timeline to see past replies before writing a new message.',
      'Hit “End session” when resolved so we can ask how we did and archive the ticket.',
    ],
  },
  {
    id: 'export-delete',
    title: 'Exporting and deleting accounts',
    body:
      'You control your data. Export your timeline or delete your account with a few taps inside Settings.',
    bullets: [
      'Export call logs, tickets, and automation history from Settings → Privacy.',
      'Delete a profile from Settings → Account; we keep it for 30 days in case you change your mind.',
      'Need help? Ask through the portal so we can verify you before processing exports or deletions.',
    ],
  },
];

export const PRIVACY_CONTENT: ResourceSection[] = [
  {
    id: 'privacy-vision',
    title: 'We keep your circle secure',
    body:
      'Verity Protect was built for families and caretakers. We only store what is required to protect you, encrypt it, and give you tools to control every call and message that passes through the service.',
  },
  {
    id: 'privacy-data',
    title: 'What we collect',
    body:
      'We collect only the minimum: profile metadata, call metadata, and recordings/transcripts that you explicitly turn on.',
    bullets: [
      'Profile metadata (name, email, trusted circle).',
      'Call metadata (caller, time, fraud score, duration).',
      'Recordings, transcripts, and automation flags once you enable recording.',
      'Device info for tuning push and audio delivery.',
    ],
  },
  {
    id: 'privacy-use',
    title: 'How we use it',
    body:
      'We only use the data inside the app; nothing is sold or shared outside your circle without your approval.',
    bullets: [
      'Stop fraud: we analyze calls for scams and elevate alerts as needed.',
      'Support: ticket chat uses metadata to keep replies in context.',
      'Share with your circle depending on their role and permissions.',
    ],
  },
  {
    id: 'privacy-retention',
    title: 'Data retention',
    body:
      'Call logs, recordings, and alerts are deleted after 90 days unless you export them. Exported copies live only on your devices.',
  },
  {
    id: 'privacy-rights',
    title: 'Account controls',
    body:
      'Control exports, deletions, and privacy questions through Settings or support; everything is yours to manage.',
    bullets: [
      'Export your entire timeline from Settings → Privacy and keep a copy.',
      'Delete your profile from Settings → Account; we hold it for 30 days to recover if needed.',
      'Contact support for privacy questions, data portability requests, or legal notices.',
    ],
  },
  {
    id: 'privacy-compliance',
    title: 'Legal safeguards & compliance',
    body:
      'We follow strong safeguards: encryption in transit and at rest, strict row-level access control on Supabase, and clearly scoped contracts with partners. That means only you and trusted circle members see your calls unless you explicitly share them.',
    bullets: [
      'Encryption keeps recordings and tickets unreadable except for your circle and our service team.',
      'We enforce data minimization: only the metadata needed to deliver alerts, tickets, and automation is stored.',
      'Legal requests? We respond according to the law but always notify you when possible and require verification before releasing data.',
    ],
  },
  {
    id: 'privacy-partners',
    title: 'Third-party partners',
    body:
      'We work with trusted service providers; they only process data under strict agreements, and we audit their access regularly.',
    bullets: [
      'Twilio powers call routing, recording, and transcription.',
      'Supabase handles authentication, database, and row-level security.',
      'Resend delivers verification and alert emails, never marketing messages.',
    ],
  },
];

export const FAQ_CONTENT: ResourceSection[] = [
  {
    id: 'faq-response-time',
    title: 'When will I hear back?',
    body:
      'Support replies usually arrive within minutes, but during busy times it can take longer. We surface unread counts and send push notifications to keep you informed while you wait.',
  },
  {
    id: 'faq-automation',
    title: 'Why did automation flag this call?',
    body:
      'Automation watches keywords, caller reputation, and call timing. If it sees a match, it flags the call, alerts your circle, and keeps a ticket ready for you to explain what happened.',
    bullets: [
      'You can silence a rule temporarily if you expect a known number to call.',
      'Safe phrases let the system know a call is okay without yanking the line.',
      'Use the blocked caller list to stop known scams from appearing again.',
    ],
  },
  {
    id: 'faq-tickets',
    title: 'How does the ticket timeline work?',
    body:
      'Every message stays in the portal. You can scroll back through replies, transcripts, and status updates, so nothing is lost between sessions.',
    bullets: [
      'Hit “End session” when solved so we can ask how it went and archive the ticket.',
      'Quick prompts save typing on common topics like billing or scams.',
      'Long-press tickets on the portal to reopen or end them without typing.',
    ],
  },
  {
    id: 'faq-account',
    title: 'Can I export or delete my data?',
    body:
      'Yes. Export your timeline from Settings → Privacy, and delete your profile from Settings → Account. We keep deleted profiles for 30 days in case you change your mind.',
  },
  {
    id: 'faq-app-store',
    title: 'How do I manage charges?',
    body:
      'All payments occur through the App Store or Google Play. Open the store’s subscription settings to view receipts, cancel, or request refunds. Support can pin down which charges to reference before you reach out to the store.',
    bullets: [
      'The App Store billing portal shows the exact amounts you paid and any active subscriptions.',
      'Tap “Report a Problem” inside the store if you need a refund; mention the support ticket ID so we can link the conversation.',
      'Keep the ticket open and share the receipt you received from Apple/Google; we can help agents check the right profile.',
    ],
  },
];

export const BILLING_CONTENT: ResourceSection[] = [
  {
    id: 'billing-overview',
    title: 'App Store or Play Store billing',
    body:
      'Verity Protect charges are processed through the platform store tied to your Apple or Google account. We do not store your payment info, and the store handles subscriptions, receipts, and refunds.',
    bullets: [
      'Open the App Store or Play Store app, tap your profile, and go to Subscriptions to see active charges.',
      'Receipts are emailed from the store; save them for your records or share them with support.',
      'Need a refund? Use the store’s “Report a Problem” feature and mention the Verity Protect ticket so we can support the request.',
    ],
  },
  {
    id: 'billing-support',
    title: 'How support helps',
    body:
      'We can highlight the account, verify your identity, and summarize what happened to help the store respond faster while keeping you informed.',
    bullets: [
      'Start a ticket from the Support screen and mention which App Store account the purchase used.',
      'If you canceled a subscription, support can confirm it was marked resolved on our side once the store refunds.',
      'Question about shared profiles? Support can explain how the charge maps to the profile you care for.',
    ],
  },
];
