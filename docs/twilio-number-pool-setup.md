# Twilio Number Pool Setup Guide

## Overview
Automated number assignment system that lets you manually purchase Twilio numbers and automatically assign them to users during onboarding.

---

## Initial Setup (One Time)

### 1. Run the Database Migration

```bash
cd supabase
# Apply the migration (creates twilio_number_pool table + functions)
supabase db push
```

Or if using Supabase CLI:
```bash
supabase migration up
```

### 2. Purchase Numbers in Twilio Console

1. Go to https://console.twilio.com/
2. Navigate to: **Phone Numbers → Buy a Number**
3. Purchase 2-20 numbers (whatever you need for launch)
4. Configure each number:
   - **Voice & Fax → Configure:**
     - A call comes in: `Webhook`
     - URL: `https://api.verityprotect.com/api/v1/webhook/twilio/call-incoming`
     - HTTP: `POST`
   - Save configuration

### 3. Sync Numbers to Database Pool

```bash
cd backend
npm run sync-twilio-numbers
```

**Expected output:**
```
🔄 Fetching numbers from Twilio...

Found 2 number(s) in Twilio account

✅ +1 (415) 555-0101 - Imported (available)
✅ +1 (415) 555-0102 - Imported (available)

─────────────────────────────────────
📊 Sync Summary:
   Total in Twilio: 2
   ✅ Imported:     2
   ⏭️  Skipped:      0
─────────────────────────────────────

📈 Current Pool Status:
   Available:  2
   Assigned:   0
   Total:      2

✨ Sync complete!
```

---

## Usage

### Auto-Assign During Onboarding

**Frontend (CreateProfileScreen):**
- Remove manual Twilio number input field
- Add "Assign Verity Number" button
- Call: `POST /api/v1/profiles/:profileId/assign-number`
- Display assigned number to user

**Backend automatically:**
- Finds first available number in pool
- Marks it as assigned
- Updates profile with the number
- Returns number to frontend

### Check Pool Status Anytime

```bash
curl https://api.verityprotect.com/api/v1/admin/twilio-numbers/stats

# Response:
{
  "available": 18,
  "assigned": 2,
  "total": 20
}
```

### When You Need More Numbers

1. Buy more numbers in Twilio console
2. Configure their webhooks
3. Run sync script again:
   ```bash
   npm run sync-twilio-numbers
   ```

Numbers are added to the pool automatically, already-imported numbers are skipped.

---

## API Endpoints

### Assign Number
```http
POST /api/v1/profiles/:profileId/assign-number
Authorization: Bearer <token>

Response:
{
  "phoneNumber": "+14155550101",
  "twilioSid": "PN1234567890abcdef"
}
```

### Get Pool Stats (Admin)
```http
GET /api/v1/admin/twilio-numbers/stats
Authorization: Bearer <token>

Response:
{
  "available": 18,
  "assigned": 2,
  "reserved": 0,
  "total": 20
}
```

---

## Database Schema

```sql
twilio_number_pool
├─ phone_number        (e.g., "+14155550101")
├─ twilio_sid         (Twilio resource ID)
├─ status             ('available' | 'assigned' | 'reserved')
├─ assigned_to_profile_id
├─ assigned_at
├─ area_code
└─ capabilities       (voice, sms, mms)
```

**Statuses:**
- `available`: Ready to assign
- `reserved`: Temporarily held (5 min) during assignment
- `assigned`: Permanently assigned to a profile
- `released`: Returned to pool (future feature)

---

## Monitoring & Maintenance

### View Pool in Supabase Dashboard
```sql
SELECT 
  phone_number,
  status,
  assigned_at,
  area_code
FROM twilio_number_pool
ORDER BY status, created_at;
```

### Cleanup Expired Reservations (Optional)
If a number gets stuck in "reserved" status (assignment failed midway), run:
```sql
SELECT release_expired_reservations();
```

This is automatically handled but can be run manually if needed.

---

## Next Steps (Frontend)

Update `frontend/src/screens/onboarding/CreateProfileScreen.tsx`:

1. Remove manual Twilio number input
2. Add "Assign Number" button
3. Call assign endpoint
4. Show assigned number
5. Continue to next step

Example button:
```tsx
<Pressable onPress={handleAssignNumber}>
  <Text>Assign Verity Number</Text>
</Pressable>
```

Handler:
```tsx
const handleAssignNumber = async () => {
  const response = await authorizedFetch(`/profiles/${profileId}/assign-number`, {
    method: 'POST'
  });
  const { phoneNumber } = await response.json();
  setTwilioNumber(phoneNumber);
};
```

---

## Troubleshooting

**"No available numbers in pool"**
- Run `npm run sync-twilio-numbers` to import purchased numbers
- Or buy more numbers in Twilio console

**Number shows in Twilio but not importing**
- Check webhook is configured correctly
- Re-run sync script with verbose logging

**Assignment fails**
- Check user has permission to modify profile
- Verify profile doesn't already have a number
- Check pool has available numbers

---

## Cost

**Twilio pricing:**
- ~$1-2/month per phone number
- $0.0085/min for call forwarding
- Pool of 20 numbers = ~$20-40/month base cost

