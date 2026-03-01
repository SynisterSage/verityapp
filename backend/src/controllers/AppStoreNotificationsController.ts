import { Environment, SignedDataVerifier, VerificationException } from '@apple/app-store-server-library';
import { Request, Response } from 'express';
import logger from 'jet-logger';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import supabaseAdmin from '@src/services/supabase';

type AppStoreNotificationBody = {
  signedPayload?: string;
};

// Apple App Store Server Notification types that indicate subscription state changes
const ACTIONABLE_NOTIFICATION_TYPES = new Set([
  'DID_RENEW',
  'EXPIRED',
  'DID_FAIL_TO_RENEW',
  'DID_CHANGE_RENEWAL_STATUS',
  'REVOKE',
  'REFUND',
  'SUBSCRIBED',
  'GRACE_PERIOD_EXPIRED',
]);

// Apple Root CA certificates (public certs from https://www.apple.com/certificateauthority/)
// Embedded as base64 to avoid filesystem dependencies in deployment
const APPLE_ROOT_CA_G3_B64 =
  'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==';
const APPLE_ROOT_CA_G2_B64 =
  'MIIFkjCCA3qgAwIBAgIIAeDltYNno+AwDQYJKoZIhvcNAQEMBQAwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEcyMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxMDA5WhcNMzkwNDMwMTgxMDA5WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzIxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBANgREkhI2imKScUcx+xuM23+TfvgHN6sXuI2pyT5f1BrTM65MFQn5bPW7SXmMLYFN14UIhHF6Kob0vuy0gmVOKTvKkmMXT5xZgM4+xb1hYjkWpIMBDLyyED7Ul+f9sDx47pFoFDVEovy3d6RhiPw9bZyLgHaC/YuOQhfGaFjQQscp5TBhsRTL3b2CtcM0YM/GlMZ81fVJ3/8E7j4ko380yhDPLVoACVdJ2LT3VXdRCCQgzWTxb+4Gftr49wIQuavbfqeQMpOhYV4SbHXw8EwOTKrfl+q04tvny0aIWhwZ7Oj8ZhBbZF8+NfbqOdfIRqMM78xdLe40fTgIvS/cjTf94FNcX1RoeKz8NMoFnNvzcytN31O661A4T+B/fc9Cj6i8b0xlilZ3MIZgIxbdMYs0xBTJh0UT8TUgWY8h2czJxQI6bR3hDRSj4n4aJgXv8O7qhOTH11UL6jHfPsNFL4VPSQ08prcdUFmIrQB1guvkJ4M6mL4m1k8COKWNORj3rw31OsMiANDC1CvoDTdUE0V+1ok2Az6DGOeHwOx4e7hqkP0ZmUoNwIx7wHHHtHMn23KVDpA287PT0aLSmWaasZobNfMmRtHsHLDd4/E92GcdB/O/WuhwpyUgquUoue9G7q5cDmVF8Up8zlYNPXEpMZ7YLlmQ1A/bmH8DvmGqmAMQ0uVAgMBAAGjQjBAMB0GA1UdDgQWBBTEmRNsGAPCe8CjoA1/coB6HHcmjTAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjANBgkqhkiG9w0BAQwFAAOCAgEAUabz4vS4PZO/Lc4Pu1vhVRROTtHlznldgX/+tvCHM/jvlOV+3Gp5pxy+8JS3ptEwnMgNCnWefZKVfhidfsJxaXwU6s+DDuQUQp50DhDNqxq6EWGBeNjxtUVAeKuowM77fWM3aPbn+6/Gw0vsHzYmE1SGlHKy6gLti23kDKaQwFd1z4xCfVzmMX3zybKSaUYOiPjjLUKyOKimGY3xn83uamW8GrAlvacp/fQ+onVJv57byfenHmOZ4VxG/5IFjPoeIPmGlFYl5bRXOJ3riGQUIUkhOb9iZqmxospvPyFgxYnURTbImHy99v6ZSYA7LNKmp4gDBDEZt7Y6YUX6yfIjyGNzv1aJMbDZfGKnexWoiIqrOEDCzBL/FePwN983csvMmOa/orz6JopxVtfnJBtIRD6e/J/JzBrsQzwBvDR4yGn1xuZW7AYJNpDrFEobXsmII9oDMJELuDY++ee1KG++P+w8j2Ud5cAeh6Squpj9kuNsJnfdBrRkBof0Tta6SqoWqPQFZ2aWuuJVecMsXUmPgEkrihLHdoBR37q9ZV0+N0djMenl9MU/S60EinpxLK8JQzcPqOMyT/RFtm2XNuyE9QoB6he7hY1Ck3DDUOUUi78/w0EP3SIEIwiKum1xRKtzCTrJ+VKACd+66eYWyi4uTLLT3OUEVLLUNIAytbwPF+E=';

const appleRootCerts = [
  Buffer.from(APPLE_ROOT_CA_G3_B64, 'base64'),
  Buffer.from(APPLE_ROOT_CA_G2_B64, 'base64'),
];

const bundleId = process.env.APPLE_APP_STORE_BUNDLE_ID ?? process.env.IOS_BUNDLE_IDENTIFIER ?? '';
const appAppleId = process.env.APPLE_APP_STORE_APP_ID ? Number(process.env.APPLE_APP_STORE_APP_ID) : undefined;
const isSandbox = (process.env.APPLE_ENVIRONMENT ?? 'Sandbox') !== 'Production';
const appleEnvironment = isSandbox ? Environment.SANDBOX : Environment.PRODUCTION;

const verifier = new SignedDataVerifier(appleRootCerts, true, appleEnvironment, bundleId, appAppleId);

function toIso(millis?: number | null): string | null {
  if (!millis || !Number.isFinite(millis) || millis <= 0) {
    return null;
  }
  return new Date(millis).toISOString();
}

type TransactionDates = { expiresDate?: number | null; revocationDate?: number | null };

function deriveSubscriptionStatus(
  notificationType: string,
  subtype: string | null,
  transactionInfo: TransactionDates
): { status: string; isActive: boolean } {
  const now = Date.now();
  const expiresAtMs = transactionInfo.expiresDate ?? 0;
  const isRevoked = Boolean(transactionInfo.revocationDate);

  if (isRevoked) {
    return { status: 'cancelled', isActive: false };
  }

  switch (notificationType) {
    case 'DID_RENEW':
    case 'SUBSCRIBED':
      return { status: 'active', isActive: expiresAtMs > now };
    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
      return { status: 'expired', isActive: false };
    case 'DID_FAIL_TO_RENEW':
      // Subscription is in billing retry — still active until grace period ends
      return { status: 'billing_retry', isActive: expiresAtMs > now };
    case 'REVOKE':
    case 'REFUND':
      return { status: 'cancelled', isActive: false };
    case 'DID_CHANGE_RENEWAL_STATUS':
      // Renewal preference changed; subscription remains active until expiry
      return { status: subtype === 'AUTO_RENEW_DISABLED' ? 'active' : 'active', isActive: expiresAtMs > now };
    default:
      return { status: 'unknown', isActive: expiresAtMs > now };
  }
}

async function receive(req: Request, res: Response) {
  const { signedPayload } = req.body as AppStoreNotificationBody;

  if (!signedPayload || typeof signedPayload !== 'string' || signedPayload.trim().length < 20) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'signedPayload is required' });
  }

  try {
    // Verify Apple JWS signature — throws VerificationException on invalid/forged payloads
    const payload = await verifier.verifyAndDecodeNotification(signedPayload.trim());
    const notificationType = payload.notificationType ?? 'unknown';
    const subtype = payload.subtype ?? null;
    const environment = payload.data?.environment ?? null;
    const notificationUUID = payload.notificationUUID ?? null;

    logger.info(
      `[AppleASN] received type=${notificationType} subtype=${subtype ?? 'none'} env=${environment ?? 'unknown'} uuid=${notificationUUID ?? 'none'}`
    );

    // Only process actionable notification types
    if (!ACTIONABLE_NOTIFICATION_TYPES.has(notificationType)) {
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    const signedTransactionInfo = payload.data?.signedTransactionInfo;
    if (!signedTransactionInfo) {
      logger.warn('[AppleASN] actionable notification missing signedTransactionInfo');
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    // Verify and decode the inner transaction JWS
    const transactionInfo = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
    const originalTransactionId = transactionInfo.originalTransactionId;

    if (!originalTransactionId) {
      logger.warn('[AppleASN] transaction info missing originalTransactionId');
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    // Look up user by original_transaction_id
    const { data: existingSubscription, error: lookupError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('user_id, product_id, status, is_active, metadata')
      .eq('original_transaction_id', originalTransactionId)
      .maybeSingle();

    if (lookupError) {
      logger.err(`[AppleASN] DB lookup error: ${lookupError.message}`);
      // Still return 200 so Apple doesn't retry; we'll recover on next app launch
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    if (!existingSubscription) {
      // No matching subscription found — user may not have synced yet
      logger.info(`[AppleASN] no subscription found for originalTransactionId, skipping update`);
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    const { status, isActive } = deriveSubscriptionStatus(notificationType, subtype, {
      expiresDate: transactionInfo.expiresDate,
      revocationDate: transactionInfo.revocationDate ?? undefined,
    });
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('user_subscriptions')
      .update({
        status,
        is_active: isActive,
        transaction_id: transactionInfo.transactionId ?? null,
        product_id: transactionInfo.productId ?? existingSubscription.product_id,
        purchased_at: toIso(transactionInfo.purchaseDate),
        expires_at: toIso(transactionInfo.expiresDate),
        verification_environment: transactionInfo.environment ?? String(environment ?? ''),
        source: 'app_store_server_notification',
        last_verified_at: nowIso,
        metadata: {
          ...(existingSubscription.metadata ?? {}),
          lastNotification: {
            type: notificationType,
            subtype,
            uuid: notificationUUID,
            environment,
            receivedAt: nowIso,
          },
        },
      })
      .eq('user_id', existingSubscription.user_id);

    if (updateError) {
      logger.err(`[AppleASN] DB update error: ${updateError.message}`);
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    logger.info(
      `[AppleASN] updated subscription status=${status} isActive=${isActive} for originalTransactionId ending ...${originalTransactionId.slice(-6)}`
    );

    return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: true });
  } catch (error) {
    if (error instanceof VerificationException) {
      // Forged or invalid Apple signature — reject silently with 200 to avoid Apple retry loop
      logger.warn(`[AppleASN] JWS verification failed: status=${error.status}`);
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }
    const message = error instanceof Error ? error.message : 'unknown';
    logger.warn(`[AppleASN] processing error: ${message}`);
    // Return 200 to prevent Apple retry loops for malformed payloads
    return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
  }
}

export default {
  receive,
};
