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
    id: 'verity-number-basics',
    title: 'Your Verity number',
    body:
      'Your Verity number is the private screening line linked to your profile. Calls route through this line first so Verity can screen risk before the call reaches you.',
    bullets: [
      'Your Verity number is assigned during setup and managed by the app.',
      'When call forwarding is enabled, incoming calls go to your Verity number for screening.',
      'After screening, Verity routes approved calls back to your protected phone line.',
      'You can view your assigned Verity number in your profile details.',
    ],
  },
  {
    id: 'reliable-fallback-basics',
    title: 'Reliable fallback number (optional)',
    body:
      'A reliable fallback number is optional, but helpful. If your app cannot connect in time, Verity can ring this number so trusted calls still have a backup route.',
    bullets: [
      'You can set or update it in Settings → Account.',
      'Use a direct phone number that can answer calls right away.',
      'Do not use a number that forwards back to Verity, or calls can loop.',
      'If you change phones or carriers, update the fallback number right away.',
    ],
  },
  {
    id: 'profile-setup',
    title: 'Profile setup, fallback number, and call flow',
    body:
      'Each profile pairs with a Verity/Twilio number and a reliable fallback number. Verity rings your app first, then falls back if your device is unavailable.',
    bullets: [
      'Set a direct fallback number during profile setup or later in Settings → Account.',
      'Do not use a number that forwards back to Verity, or calls can loop.',
      'When calls route through Verity, logs include time, status, transcript, and risk context.',
      'If you change phones, update devices and fallback details right away.',
    ],
  },
  {
    id: 'calls-page',
    title: 'Calls page: filters, taps, and press actions',
    body:
      'The Calls screen is your review queue. You can filter quickly and act on calls without leaving the list.',
    bullets: [
      'Use filters like All, Verified, Risk, Trusted, Handled, and Archived to focus the list.',
      'Tap a call to open full call details.',
      'Long press a call to open quick actions (for example trust, block, archive, or remove).',
      'Trusted activity can jump directly into the trusted-filter view.',
    ],
  },
  {
    id: 'alerts-page',
    title: 'Alerts page: needs attention and history',
    body:
      'Alerts prioritize risk events and show what still needs action versus what is already handled.',
    bullets: [
      'Use mode tabs such as Needs Attention and History to triage quickly.',
      'Tap an alert to open the linked call detail when available.',
      'Long press handled alerts to open quick options like delete.',
      'Circle activity is tracked separately so operational alerts stay clean.',
    ],
  },
  {
    id: 'call-detail',
    title: 'Call detail and quick-action modal',
    body:
      'Call Detail is where you verify what happened on a call and decide the final status.',
    bullets: [
      'Review recording playback, transcript, score, notes, and fraud indicators.',
      'Mark calls safe or fraud based on what you hear and read.',
      'Use quick actions to trust, block, or update the caller status without extra navigation.',
      'Handled status flows back to Calls and Alerts automatically.',
    ],
  },
  {
    id: 'automation',
    title: 'Automation and how it works',
    body:
      'Automation combines transcript signals, risk patterns, and profile preferences to escalate suspicious calls.',
    bullets: [
      'Tune thresholds and behavior in Settings → Automation.',
      'Automation can influence alert priority and follow-up workflows.',
      'Use safe phrases to reduce false alarms for known-safe interactions.',
    ],
  },
  {
    id: 'my-circle',
    title: 'My Circle: owner, caretaker, and family roles',
    body:
      'My Circle controls who can help manage the profile and what each member can do.',
    bullets: [
      'Owner manages the profile and core safety settings.',
      'Caretaker/admin can help manage workflows and review events.',
      'Family roles focus on visibility and day-to-day safety participation.',
      'Role changes and membership updates appear in Circle Activity.',
    ],
  },
  {
    id: 'safety-lists',
    title: 'Safe phrases, doctor lookup, trusted contacts, and blocked callers',
    body:
      'Safety lists help Verity separate expected calls from risky ones and reduce noise for your circle.',
    bullets: [
      'Safe phrases help confirm known-safe context during review.',
      'Doctor Lookup can add verified offices into trusted workflows.',
      'Trusted Contacts identifies approved numbers for easier handling.',
      'Blocked callers prevents known scam numbers from reaching the profile.',
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications preferences',
    body:
      'Notification controls let you decide which events should interrupt you and which can stay quiet.',
    bullets: [
      'Configure alert categories in Settings → Notifications.',
      'Enable or disable trusted activity and circle activity notifications.',
      'Use push/email combinations based on urgency and caregiver workflow.',
    ],
  },
  {
    id: 'membership',
    title: 'Membership and billing basics',
    body:
      'Membership keeps call protection, storage, and monitoring active for the profile.',
    bullets: [
      'Manage billing through Settings → Membership/Billing.',
      'Store billing actions happen in Apple/Google account settings.',
      'Subscription status affects safety feature availability.',
    ],
  },
  {
    id: 'security',
    title: 'Security and PIN changes',
    body:
      'Security settings protect profile access and sensitive call data.',
    bullets: [
      'Change your app PIN in Settings → Security.',
      'Use device security (Face ID/Touch ID/passcode) where available.',
      'Keep credentials and device access limited to trusted users.',
    ],
  },
  {
    id: 'support-system',
    title: 'Support system and tickets',
    body:
      'Support includes live ticket timelines, issue categories, and follow-up tracking from inside the app.',
    bullets: [
      'Open support from Settings and choose the right topic.',
      'Review ticket history and replies in one timeline.',
      'Use support for setup help, billing questions, automation issues, and privacy requests.',
    ],
  },
  {
    id: 'privacy-deletion',
    title: 'Data, privacy, and account deletion',
    body:
      'You control your data. Export your timeline or delete your account with a few taps inside Settings.',
    bullets: [
      'Review privacy controls in Settings → Data & Privacy.',
      'Export profile-related data when needed.',
      'Delete your account/profile in Settings → Account when you want full removal.',
      'Contact support for identity verification during sensitive requests.',
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
      'Call logs, recordings, and alerts remain available while your profile is active. You can clear history anytime from Settings.',
  },
  {
    id: 'privacy-rights',
    title: 'Account controls',
    body:
      'Control exports, deletions, and privacy questions through Settings or support; everything is yours to manage.',
    bullets: [
      'Export your entire timeline from Settings → Privacy and keep a copy.',
      'Delete your profile from Settings → Account to remove active profile data from the app.',
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
    id: 'faq-verity-number',
    title: 'What is my Verity number?',
    body:
      'It is your assigned screening number. Verity uses it to process forwarded calls, check risk, and route the call back to your protected line.',
    bullets: [
      'It is not a public replacement for your normal phone number.',
      'You can find it in your profile/account details.',
      'Keep call forwarding pointed to this number for screening to work.',
    ],
  },
  {
    id: 'faq-fallback',
    title: 'How does call fallback work?',
    body:
      'Verity tries to ring your app first. If your app is not reachable, Verity calls your fallback number so trusted callers can still reach you.',
    bullets: [
      'Set your fallback number in Profile setup or Settings → Account.',
      'Use a direct number only. Do not use a number that forwards back to your Verity line.',
      'If you change phones or carriers, update your fallback number right away.',
    ],
  },
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
      'Yes. Export your timeline from Settings → Privacy, and delete your profile from Settings → Account to remove active profile data and history.',
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
    id: 'billing-why-membership',
    title: 'Why membership is required',
    body:
      'Membership covers the live infrastructure that keeps call protection running in real time, including routing, recording, and monitoring systems.',
    bullets: [
      'Phone infrastructure: forwarded-line call routing, carrier connectivity, and uptime monitoring.',
      'Call recording and storage: secure capture, retention, and access to transcripts/history for review.',
      'Active fraud monitoring: real-time risk checks, alert delivery, and family visibility across devices.',
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
