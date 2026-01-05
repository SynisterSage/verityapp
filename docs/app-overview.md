# SafeCall - Elderly Fraud Protection App

**Project Overview**

SafeCall is a mobile application designed to protect elderly people from phone scams and fraud by intercepting, transcribing, and analyzing incoming calls in real-time. Family members and caretakers receive alerts about suspicious calls and can monitor all activity through a mobile dashboard.

## Problem Statement

Elderly people are frequent targets of phone scams:
- Scammers impersonate banks, government agencies, tech support
- Elderly individuals may forget what they discussed or agreed to
- Current solutions are either non-existent or require complex setup
- Family members have no visibility into incoming calls until after fraud occurs

## Solution

SafeCall provides:
1. **Transparent call interception** via Twilio
2. **Real-time transcription** using Azure Speech-to-Text
3. **AI-powered fraud detection** via keyword analysis
4. **Family notifications** via email/SMS
5. **Call history & blocking** for future protection

## Key Features

- ✅ Custom voicemail greeting (recorded by caretaker)
- ✅ All calls automatically recorded & transcribed
- ✅ Real-time fraud detection (keywords, patterns)
- ✅ Instant alerts to family members
- ✅ Call playback & full transcript review
- ✅ Block caller functionality
- ✅ Multi-family member access
- ✅ Call history export
- ✅ Settings for fraud keywords & alert preferences

## Target Users

1. **Elderly/Vulnerable People** (Primary beneficiary)
   - Limited technical knowledge
   - May have cognitive decline/dementia
   - Use traditional landlines or older phones

2. **Caretakers/Family Members** (Primary users)
   - Adult children, spouses, nurses
   - Want to protect their loved ones
   - Need real-time visibility

3. **Assisted Living Facilities** (Future market)
   - Bulk protection for residents
   - Legal liability reduction
   - Caregiver monitoring

## Business Model (Post-MVP)

- **Freemium:** Basic protection (limited transcriptions) free
- **Premium:** Unlimited transcriptions, advanced analytics, priority support ($9.99/month)
- **Enterprise:** Assisted living facilities, bulk accounts ($99+/month)

## Success Metrics (MVP)

- App installs: 100+
- Active users: 50+
- Calls intercepted: 1000+
- Scams prevented: 10+
- User satisfaction: 4.5/5 stars

---

## Timeline

- **Week 1-2:** Backend setup, database, Twilio integration
- **Week 3:** Frontend (React Native), greeting recording, dashboard
- **Week 4:** Azure transcription, fraud detection, testing
- **Week 5:** Deployment, monitoring, launch

**Total MVP: 5 weeks, 1 developer**
