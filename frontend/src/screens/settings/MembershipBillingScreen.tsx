import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import SettingsHeader from '../../components/common/SettingsHeader';
import { useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { navigateToSupportPortal } from '../../navigation/rootNavigator';
import { logEvent } from '../../services/sentry';
import { FALLBACK_LEGAL_VERSIONS } from '../../services/legal';

type BillingFeedbackTone = 'success' | 'info' | 'error';

type BillingFeedback = {
  title: string;
  detail: string;
  tone: BillingFeedbackTone;
};

function toTitleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function isNetworkIssue(message: string) {
  return /network|internet|offline|timed out|could not connect/i.test(message);
}

function toRestoreFeedback(result: { status: string; message?: string }): BillingFeedback {
  const normalizedMessage = (result.message ?? '').trim();

  if (result.status === 'purchased') {
    return {
      title: 'Membership restored',
      detail: 'Your App Store purchase is active on this profile.',
      tone: 'success',
    };
  }

  if (result.status === 'pending') {
    return {
      title: 'Restore pending',
      detail: 'Apple is still confirming this purchase. Membership activates automatically when approved.',
      tone: 'info',
    };
  }

  if (result.status === 'cancelled') {
    return {
      title: 'Restore canceled',
      detail: 'No changes were made.',
      tone: 'info',
    };
  }

  if (/no active subscription found/i.test(normalizedMessage)) {
    return {
      title: 'No active membership found',
      detail: 'No previous purchase is linked to this Apple account.',
      tone: 'info',
    };
  }

  if (isNetworkIssue(normalizedMessage)) {
    return {
      title: 'Network issue',
      detail: 'Check your connection and try restoring again.',
      tone: 'error',
    };
  }

  return {
    title: 'Could not restore purchase',
    detail: normalizedMessage || 'Please try again.',
    tone: 'error',
  };
}

function formatDateLabel(value?: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function mapProductIdLabel(productId?: string | null) {
  if (!productId) {
    return 'No active plan';
  }
  const normalized = productId.toLowerCase();
  if (normalized.includes('annual') || normalized.includes('year')) {
    return 'Verity Protect Annual';
  }
  if (normalized.includes('month')) {
    return 'Verity Protect Monthly';
  }
  return toTitleCase(productId);
}

function formatTrialDaysLeft(trialEndsAt: string | null | undefined, nowMs: number) {
  if (!trialEndsAt) {
    return null;
  }
  const endsAtMs = Date.parse(trialEndsAt);
  if (!Number.isFinite(endsAtMs)) {
    return null;
  }
  const msLeft = endsAtMs - nowMs;
  if (msLeft < 0) {
    return 0;
  }
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
}

export default function MembershipBillingScreen() {
  const insets = useSafeAreaInsets();
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createMembershipBillingStyles(theme, mode), [theme, mode]);
  const [feedback, setFeedback] = useState<BillingFeedback | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isReloadingPlans, setIsReloadingPlans] = useState(false);
  const [isOpeningManage, setIsOpeningManage] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const {
    status,
    products,
    isLoadingStatus,
    isLoadingProducts,
    isProcessingPurchase,
    productsError,
    refreshStatus,
    refreshProducts,
    restore,
  } = useSubscription();

  const subscription = status?.subscription ?? null;
  const hasActiveSubscription = Boolean(status?.hasActiveSubscription);
  const hasProductsLoaded = products.length > 0;

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (hasProductsLoaded || isLoadingProducts) {
      return;
    }
    void refreshProducts();
  }, [hasProductsLoaded, isLoadingProducts, refreshProducts]);

  const planName = useMemo(() => {
    if (!subscription?.productId) {
      return 'No active plan';
    }
    const matchingProduct = products.find((product) => product.productId === subscription.productId);
    if (matchingProduct?.displayName) {
      return matchingProduct.displayName;
    }
    return mapProductIdLabel(subscription.productId);
  }, [products, subscription?.productId]);

  const statusLabel = useMemo(() => {
    if (isLoadingStatus && !status) {
      return 'Loading';
    }
    if (hasActiveSubscription) {
      return 'Active';
    }
    if (subscription?.status) {
      return toTitleCase(subscription.status);
    }
    return 'Inactive';
  }, [hasActiveSubscription, isLoadingStatus, status, subscription?.status]);

  const statusTone = hasActiveSubscription ? 'active' : 'inactive';
  const inviteBypassEnabled = status?.canJoinWithInviteCode !== false;
  const trialDaysLeft = formatTrialDaysLeft(subscription?.trialEndsAt, nowMs);
  const hasTrialConverted = Boolean(subscription?.trialConvertedAt);
  const showTrialStatusCard =
    Boolean(hasActiveSubscription) &&
    !hasTrialConverted &&
    typeof trialDaysLeft === 'number' &&
    trialDaysLeft <= 7;

  const trialStatusTitle =
    trialDaysLeft === 0
      ? 'Trial ends today'
      : trialDaysLeft === 1
        ? '1 day left in your trial'
        : `${trialDaysLeft ?? 0} days left in your trial`;
  const trialStatusDetail =
    trialDaysLeft === 0
      ? 'Keep your verified number and call screening active without interruption.'
      : 'You can manage or cancel anytime in App Store subscriptions.';

  const handleManageMembership = useCallback(async () => {
    if (isOpeningManage) {
      return;
    }
    setFeedback(null);
    setIsOpeningManage(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    logEvent('membership_manage_in_store_tapped', { screen: 'MembershipBillingScreen' });
    const targets = [
      'itms-apps://apps.apple.com/account/subscriptions',
      'https://apps.apple.com/account/subscriptions',
    ];
    try {
      let opened = false;
      for (const target of targets) {
        try {
          await Linking.openURL(target);
          opened = true;
          break;
        } catch {
          continue;
        }
      }
      if (!opened) {
        setFeedback({
          title: 'Could not open subscriptions',
          detail:
            'Open iPhone Settings > Apple Account > Subscriptions to cancel or change your plan.',
          tone: 'error',
        });
      }
    } finally {
      setIsOpeningManage(false);
    }
  }, [isOpeningManage]);

  const handleRestorePurchase = useCallback(async () => {
    if (isProcessingPurchase || isRestoring) {
      return;
    }
    setFeedback(null);
    setIsRestoring(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    logEvent('membership_restore_tapped_from_settings', { screen: 'MembershipBillingScreen' });
    try {
      const result = await restore();
      const nextFeedback = toRestoreFeedback(result);
      setFeedback(nextFeedback);
      if (nextFeedback.tone === 'success') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      } else if (nextFeedback.tone === 'error') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
      }
      await refreshStatus({ silent: true });
    } finally {
      setIsRestoring(false);
    }
  }, [isProcessingPurchase, isRestoring, refreshStatus, restore]);

  const handleReloadPlans = useCallback(async () => {
    if (isReloadingPlans) {
      return;
    }
    void Haptics.selectionAsync().catch(() => null);
    setFeedback(null);
    setIsReloadingPlans(true);
    try {
      await refreshProducts();
      await refreshStatus({ silent: true });
    } finally {
      setIsReloadingPlans(false);
    }
  }, [isReloadingPlans, refreshProducts, refreshStatus]);

  const handleBillingHelp = useCallback(() => {
    void Haptics.selectionAsync().catch(() => null);
    navigateToSupportPortal();
  }, []);

  const isAnyActionBusy = isRestoring || isReloadingPlans || isOpeningManage || isProcessingPurchase;

  const renderActionRow = (
    args: {
      key: string;
      title: string;
      detail: string;
      icon: keyof typeof Ionicons.glyphMap;
      onPress: () => void;
      loading?: boolean;
      disabled?: boolean;
    },
    isLast: boolean
  ) => (
    <View key={args.key}>
      <Pressable
        style={({ pressed }) => [
          styles.actionRow,
          pressed && !args.disabled ? styles.actionRowPressed : undefined,
          args.disabled ? styles.actionRowDisabled : undefined,
        ]}
        onPress={args.onPress}
        disabled={args.disabled}
      >
        <View style={styles.actionIconWrap}>
          <Ionicons name={args.icon} size={18} color={theme.colors.accent} />
        </View>
        <View style={styles.actionTextWrap}>
          <Text style={styles.actionTitle}>{args.title}</Text>
          <Text style={styles.actionDetail}>{args.detail}</Text>
        </View>
        {args.loading ? (
          <ActivityIndicator size="small" color={theme.colors.textMuted} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        )}
      </Pressable>
      {!isLast ? <View style={styles.actionDivider} /> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <SettingsHeader title="Membership & Billing" subtitle="Plan, restore, and account billing" />
      <ScrollView
        contentContainerStyle={[
          styles.body,
          {
            paddingBottom: Math.max(insets.bottom, 24) + 32,
            paddingTop: Math.max(insets.top, 16),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Current membership</Text>
        <View style={styles.card}>
          {/* Status hero row */}
          <View style={styles.membershipHero}>
            <View style={[styles.membershipIconWrap, hasActiveSubscription ? styles.membershipIconWrapActive : styles.membershipIconWrapInactive]}>
              <Ionicons
                name={hasActiveSubscription ? 'shield-checkmark' : 'shield-outline'}
                size={26}
                color={hasActiveSubscription ? theme.colors.success : theme.colors.textMuted}
              />
            </View>
            <View style={styles.membershipHeroText}>
              <Text style={styles.membershipPlanName}>{planName}</Text>
              <Text style={[styles.membershipStatusText, hasActiveSubscription ? styles.membershipStatusActive : styles.membershipStatusInactive]}>
                {statusLabel}
              </Text>
            </View>
            <View style={[styles.statusPill, statusTone === 'active' ? styles.statusPillActive : styles.statusPillInactive]}>
              <Text style={[styles.statusPillText, statusTone === 'active' ? styles.statusPillTextActive : styles.statusPillTextInactive]}>
                {statusTone === 'active' ? 'LIVE' : 'OFF'}
              </Text>
            </View>
          </View>

          <View style={styles.membershipDivider} />

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Renews / Expires</Text>
            <Text style={styles.metaValue}>{formatDateLabel(subscription?.expiresAt)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Last verified</Text>
            <Text style={styles.metaValue}>{formatDateLabel(subscription?.lastVerifiedAt)}</Text>
          </View>
          {isLoadingStatus ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
              <Text style={styles.inlineLoaderText}>Refreshing membership status…</Text>
            </View>
          ) : null}
        </View>

        {showTrialStatusCard ? (
          <>
            <Text style={styles.sectionLabel}>Trial status</Text>
            <View style={[styles.card, styles.trialCard]}>
              <View style={styles.trialHeader}>
                <View style={styles.trialIconWrap}>
                  <Ionicons name="hourglass-outline" size={20} color={theme.colors.accent} />
                </View>
                <View style={styles.trialHeaderText}>
                  <Text style={styles.trialTitle}>{trialStatusTitle}</Text>
                  <Text style={styles.trialDetail}>{trialStatusDetail}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.trialPrimaryButton,
                  pressed ? styles.trialPrimaryButtonPressed : undefined,
                ]}
                onPress={handleManageMembership}
              >
                <Ionicons name="card-outline" size={15} color="#fff" />
                <Text style={styles.trialPrimaryButtonText}>Review membership options</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>Billing actions</Text>
        <View style={styles.card}>
          {renderActionRow(
            {
              key: 'manage',
              title: isOpeningManage ? 'Opening App Store…' : 'Manage membership in App Store',
              detail: isOpeningManage
                ? 'Launching Apple subscriptions…'
                : 'Cancel, change plan, and billing method in Apple subscriptions.',
              icon: 'card-outline',
              onPress: handleManageMembership,
              loading: isOpeningManage,
              disabled: isAnyActionBusy,
            },
            false
          )}
          {renderActionRow(
            {
              key: 'restore',
              title: isRestoring ? 'Restoring purchase…' : 'Restore purchase',
              detail: isRestoring
                ? 'Checking App Store purchase history…'
                : 'Recover an active plan tied to this Apple account.',
              icon: 'refresh-outline',
              onPress: handleRestorePurchase,
              loading: isRestoring,
              disabled: isAnyActionBusy,
            },
            false
          )}
          {renderActionRow(
            {
              key: 'support',
              title: 'Billing help',
              detail: 'Contact support for subscription or receipt questions.',
              icon: 'help-circle-outline',
              onPress: handleBillingHelp,
              disabled: isAnyActionBusy,
            },
            true
          )}
        </View>

        <Text style={styles.sectionLabel}>Circle access</Text>
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            Invited caretakers and family members can join an active paid circle without purchasing
            their own plan.
          </Text>
          <View style={styles.circleRow}>
            <View style={[styles.circleIconWrap, inviteBypassEnabled ? styles.circleIconWrapActive : styles.circleIconWrapMuted]}>
              <Ionicons name="key-outline" size={16} color={inviteBypassEnabled ? theme.colors.success : theme.colors.textMuted} />
            </View>
            <View style={styles.circleRowText}>
              <Text style={styles.circleRowLabel}>Invite code join access</Text>
              <Text style={[styles.circleRowValue, inviteBypassEnabled ? styles.successText : styles.warningText]}>
                {inviteBypassEnabled ? 'Enabled' : 'Unavailable'}
              </Text>
            </View>
          </View>
          <View style={styles.circleRow}>
            <View style={styles.circleIconWrap}>
              <Ionicons name="person-outline" size={16} color={theme.colors.accent} />
            </View>
            <View style={styles.circleRowText}>
              <Text style={styles.circleRowLabel}>Owner profiles</Text>
              <Text style={styles.circleRowValue}>{status?.ownerProfileCount ?? 0}</Text>
            </View>
          </View>
          <View style={styles.circleRow}>
            <View style={styles.circleIconWrap}>
              <Ionicons name="people-outline" size={16} color={theme.colors.accent} />
            </View>
            <View style={styles.circleRowText}>
              <Text style={styles.circleRowLabel}>Member profiles</Text>
              <Text style={styles.circleRowValue}>{status?.memberProfileCount ?? 0}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Billing details</Text>
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            Secure billing via Apple. Cancel anytime. Both plans include a 3-day grace period for renewals
            before service pauses.
          </Text>
          <Text style={styles.bodyText}>
            The monthly plan starts with a 7-day free trial, and we surface an in-app reminder when two days remain so you can keep the number or cancel without surprise.
          </Text>
          {!hasProductsLoaded && productsError ? (
            <Text style={styles.errorText}>{productsError}</Text>
          ) : null}
          <Text style={styles.footnote}>Verity Protect never stores your payment card details.</Text>
          <View style={styles.legalLinksRow}>
            <Pressable
              onPress={() => {
                void Linking.openURL(FALLBACK_LEGAL_VERSIONS.privacyUrl).catch(() => null);
              }}
              hitSlop={6}
            >
              <Text style={styles.legalLinkText}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.legalDivider}>•</Text>
            <Pressable
              onPress={() => {
                void Linking.openURL(FALLBACK_LEGAL_VERSIONS.termsUrl).catch(() => null);
              }}
              hitSlop={6}
            >
              <Text style={styles.legalLinkText}>Terms of Use</Text>
            </Pressable>
          </View>
        </View>

        {feedback ? (
          <View
            style={[
              styles.feedbackCard,
              feedback.tone === 'success'
                ? styles.feedbackSuccess
                : feedback.tone === 'info'
                  ? styles.feedbackInfo
                  : styles.feedbackError,
            ]}
          >
            <Text style={styles.feedbackTitle}>{feedback.title}</Text>
            <Text style={styles.feedbackText}>{feedback.detail}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createMembershipBillingStyles = (theme: AppTheme, mode?: string) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    body: {
      paddingHorizontal: 24,
      gap: 20,
    },
    sectionLabel: {
      color: theme.colors.textMuted,
      fontWeight: '600',
      letterSpacing: 0.6,
      fontSize: 12,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      gap: 12,
    },
    trialCard: {
      borderColor: withOpacity(theme.colors.accent, 0.35),
      backgroundColor: withOpacity(theme.colors.accent, 0.08),
    },
    trialHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    trialIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
    },
    trialHeaderText: {
      flex: 1,
      gap: 2,
    },
    trialTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    trialDetail: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    trialPrimaryButton: {
      marginTop: 2,
      minHeight: 44,
      borderRadius: 13,
      backgroundColor: theme.colors.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    trialPrimaryButtonPressed: {
      opacity: 0.86,
    },
    trialPrimaryButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
    // ── Membership hero ──────────────────────────────────
    membershipHero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    membershipIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    membershipIconWrapActive: {
      backgroundColor: withOpacity(theme.colors.success, 0.14),
    },
    membershipIconWrapInactive: {
      backgroundColor: theme.colors.surfaceAlt,
    },
    membershipHeroText: {
      flex: 1,
      gap: 2,
    },
    membershipPlanName: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.text,
      letterSpacing: -0.2,
    },
    membershipStatusText: {
      fontSize: 13,
      fontWeight: '600',
    },
    membershipStatusActive: {
      color: theme.colors.success,
    },
    membershipStatusInactive: {
      color: theme.colors.textMuted,
    },
    membershipDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.surfaceAlt,
      marginVertical: 2,
    },
    // ── Status pill ──────────────────────────────────────
    statusPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusPillActive: {
      backgroundColor: withOpacity(theme.colors.success, 0.14),
    },
    statusPillInactive: {
      backgroundColor: withOpacity(theme.colors.warning, 0.12),
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    statusPillTextActive: {
      color: theme.colors.success,
    },
    statusPillTextInactive: {
      color: theme.colors.warning,
    },
    // ── Meta rows ────────────────────────────────────────
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    metaLabel: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
      flexShrink: 1,
    },
    metaValue: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'right',
      flexShrink: 1,
    },
    inlineLoader: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inlineLoaderText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    // ── Billing action rows ──────────────────────────────
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 64,
      gap: 14,
      paddingVertical: 8,
    },
    actionRowPressed: {
      opacity: 0.75,
    },
    actionRowDisabled: {
      opacity: 0.55,
    },
    actionIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
    },
    actionTextWrap: {
      flex: 1,
      gap: 3,
    },
    actionTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    actionDetail: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    actionDivider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 54,
      marginVertical: 2,
      backgroundColor: theme.colors.surfaceAlt,
    },
    // ── Circle access rows ───────────────────────────────
    circleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    circleIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
    },
    circleIconWrapActive: {
      backgroundColor: withOpacity(theme.colors.success, 0.14),
    },
    circleIconWrapMuted: {
      backgroundColor: theme.colors.surface,
    },
    circleRowText: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    circleRowLabel: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    circleRowValue: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'right',
    },
    // ── General ──────────────────────────────────────────
    bodyText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
    },
    successText: {
      color: theme.colors.success,
    },
    warningText: {
      color: theme.colors.warning,
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    },
    footnote: {
      color: withOpacity(theme.colors.textMuted, 0.82),
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '500',
    },
    legalLinksRow: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
    },
    legalDivider: {
      color: withOpacity(theme.colors.textMuted, 0.8),
      fontSize: 12,
      marginHorizontal: 7,
    },
    legalLinkText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 17,
      textDecorationLine: 'underline',
    },
    // ── Feedback ─────────────────────────────────────────
    feedbackCard: {
      borderRadius: 18,
      padding: 14,
      gap: 6,
    },
    feedbackSuccess: {
      backgroundColor: withOpacity(theme.colors.success, 0.12),
    },
    feedbackInfo: {
      backgroundColor: withOpacity(theme.colors.accent, 0.1),
    },
    feedbackError: {
      backgroundColor: withOpacity(theme.colors.danger, 0.12),
    },
    feedbackTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    feedbackText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
  });
