# App Store Metadata — VerityProtect 1.0.0

---

## Promotional Text (170 chars max)
```
The smart shield for your family's phone. Stop scam and spam calls early, get instant risk alerts, and keep a clear call history for peace of mind.
```

---

## Description
```
Protect your loved ones from scam calls before damage is done.

Verity Protect screens unknown callers first, flags suspicious activity, and helps your family respond quickly with clear call context.

How it works

- Calls to your Verity number are screened before they reach you.
- Trusted callers route through quickly.
- High-risk calls are flagged so you can take action fast.
- Your family circle sees the same alerts and history.

What you can do with Verity

- Catch suspicious calls early with real-time risk alerts.
- Keep trusted people moving with trusted-contact routing.
- Review clear call details, transcripts, and timelines in one place.
- See urgent calls separately from past history at a glance.
- Coordinate with circle members so everyone stays informed.
- Get live support replies when you need help.

Built for real life

- Simple, readable screens designed for fast decisions.
- Useful for older adults, caregivers, and families managing call safety together.
- Clear records of what happened on each call and alert.

Privacy and control

You choose who is in your circle and how notifications are delivered. Verity is designed to reduce confusion during stressful call moments while keeping you in control.

Set up in minutes and stay protected from the very first call.

Terms of Use: https://www.verityprotect.com/terms
Privacy Policy: https://www.verityprotect.com/privacy
Support: https://www.verityprotect.com/support
```

---

## Keywords (100 chars max — comma separated, no spaces after commas)
```
scamcall,spamcall,callerid,callblocker,fraudalert,robocall,seniorsafety,familysafety,caregiver,fraud
```
> ⚠️ Currently exactly 100 chars. If App Store Connect rejects length, remove `fraud` from end.

---

## App Review Notes

TEST ACCOUNT
- Email: support@verityprotect.com
- Password: ReviewApp2026!
- 2FA: Not required for test account.

STARTING STATE
- Sign in with the given information and continue to the Onboarding Choice screen.
- A Verity Number is available in the pool for assignment.

PRIMARY TEST FLOW
1. Tap "Choose my Verity Number" and complete onboarding prompts.
2. Note your assigned Verity number (shown in the app after onboarding).
3. On your test device, enable call forwarding to your Verity number:
   iPhone Settings > Phone > Call Forwarding > enter the Verity number.
4. From a second phone (or Google Voice), call your test device's real phone number.
5. That call forwards to your Verity number, is screened by Verity, then routes
   back — you will see the CallKit incoming call UI appear on the test device.
6. Answer the call and let it complete.
7. In-app expected behavior:
   - Calls tab logs the call.
   - Call Details shows transcript + risk scoring.
   - Alerts tab shows critical/high-risk events when applicable.
8. Mark the call as Safe or Fraud from Call Details to verify handling updates.

SUBSCRIPTION FLOW (IAP)
- App uses auto-renewable subscriptions: verityprotect_monthly and verityprotect_annual.
- Reviewer can test purchase/restore using Apple's review purchase environment.
- No external payment method is used or linked.
- The Restore Purchases button is available on the membership screen.

CALL SCREENING & TECHNICAL NOTES
- The app assigns each user a Twilio screening number during onboarding.
- Calls forwarded to that number are screened through a Twilio bridge before
  routing back to the user's real phone. This is the core screening flow above.
- Apple's VoIP push entitlement (APNs VoIP) is used solely to wake the app for
  CallKit integration. It is not used for any other purpose.

CIRCLE / CONTACTS FLOW
- Add trusted contacts in onboarding or Settings > Trusted Contacts.
- Add circle members in Settings > Account Members.
- Invite code flow is available from the onboarding screen.

PERMISSIONS
- Microphone: required for the live call bridge — after screening, the user can speak directly with the caller through the app.
- Notifications: used for real-time call alerts and circle activity updates.

NOTES
- The app is fully functional without push notifications. Enabling them adds
  real-time alerts for call events and circle activity, but is not required.
- If needed, Settings > Support Portal is available for in-app support actions.

---

## Checklist Before Submitting Metadata

- [ ] Test account email + password added above
- [ ] Keywords confirmed under 100 chars in App Store Connect field
- [ ] Promotional text confirmed under 170 chars
- [ ] Description previewed in App Store Connect (check formatting/line breaks)
- [ ] Support URL live: https://www.verityprotect.com/support
- [ ] Privacy URL live: https://www.verityprotect.com/privacy
- [ ] Terms URL live: https://www.verityprotect.com/terms

---

*Last updated: 2026-03-02*
