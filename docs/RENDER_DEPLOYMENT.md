# Render Deployment Guide for VoIP Push

## Environment Variables for Render

When deploying to Render, you need to set these environment variables in your Render dashboard.

### Navigate to Environment Variables

1. Go to your Render dashboard
2. Select your backend service
3. Go to **Environment** tab
4. Add the following variables

### Required VoIP Push Variables

```bash
# APNs Auth Key ID (10 characters)
APNS_AUTH_KEY_ID=YOUR_APNS_KEY_ID

# Apple Team ID (10 characters)
APNS_TEAM_ID=YOUR_APPLE_TEAM_ID

# iOS Bundle Identifier
IOS_BUNDLE_IDENTIFIER=com.yourcompany.yourapp

# Production mode (false for testing, true for production)
APNS_PRODUCTION=false

# APNs Auth Key Content (IMPORTANT: See below for format)
APNS_AUTH_KEY=-----BEGIN PRIVATE KEY-----
<PASTE_YOUR_APNS_P8_PRIVATE_KEY_CONTENT_HERE>
-----END PRIVATE KEY-----
```

## How to Add the Key Content in Render

### Option 1: Multi-line Environment Variable (Recommended)

Render supports multi-line environment variables. In the Render dashboard:

1. Click **Add Environment Variable**
2. Key: `APNS_AUTH_KEY`
3. Value: Paste the entire key including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines
4. Click **Save**

Render will preserve the line breaks.

### Option 2: Secret Files (Alternative)

If you prefer not to use environment variables for the key:

1. In Render dashboard, go to your service
2. Navigate to **Secret Files**
3. Click **Add Secret File**
4. File Path: `/etc/secrets/apns_key.p8`
5. Contents: Paste your entire `.p8` key content
6. Click **Save**

Then update your environment variable:
```bash
APNS_AUTH_KEY_PATH=/etc/secrets/apns_key.p8
```

And remove the `APNS_AUTH_KEY` variable.

## Testing After Deployment

After deploying with the new environment variables:

1. Check Render logs for:
   ```
   APNs VoIP provider initialized (development/production)
   APNs using direct key content
   ```

2. Test with your iOS app:
   - Kill the app completely
   - Have someone call your Twilio number
   - The app should wake and show the call screen

## Local vs Production Configuration

### Local Development (.env file)
```bash
# Use file path for local dev
APNS_AUTH_KEY_PATH=/absolute/path/to/AuthKey_<YOUR_APNS_KEY_ID>.p8
APNS_AUTH_KEY_ID=YOUR_APNS_KEY_ID
APNS_TEAM_ID=YOUR_APPLE_TEAM_ID
IOS_BUNDLE_IDENTIFIER=com.yourcompany.yourapp
APNS_PRODUCTION=false
```

### Render Production (Environment Variables)
```bash
# Use key content for cloud deployment
APNS_AUTH_KEY=<paste full key content>
APNS_AUTH_KEY_ID=YOUR_APNS_KEY_ID
APNS_TEAM_ID=YOUR_APPLE_TEAM_ID
IOS_BUNDLE_IDENTIFIER=com.yourcompany.yourapp
APNS_PRODUCTION=true  # Set to true for production
```

## Security Notes

✅ **Safe**: Storing the `.p8` key in Render environment variables or secret files is secure
- Render encrypts all environment variables and secret files
- Only your service can access them
- They're never exposed in logs or to the public

⚠️ **Never**: Commit `.p8` files to git
- Already added to `.gitignore`
- These keys give access to send push notifications to your app

## Switching to Production

When you're ready to go live:

1. Update `APNS_PRODUCTION=true` in Render
2. Use a production build of your iOS app (TestFlight or App Store)
3. Test thoroughly before releasing

## Troubleshooting

**"APNs VoIP push not configured"** in logs:
- Check that `APNS_AUTH_KEY` is set in Render environment variables
- Verify the key content includes the BEGIN/END lines
- Ensure no extra spaces or formatting issues

**VoIP push not waking app:**
- Verify `APNS_PRODUCTION` matches your build type (dev vs production)
- Check that the key content is correct
- Ensure the app has VoIP push entitlement enabled

**"Failed to initialize APNs provider":**
- Check that the key content is valid
- Verify Key ID and Team ID are correct
- Review Render logs for specific error messages
