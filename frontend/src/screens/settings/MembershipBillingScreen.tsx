import { useCallback, useMemo, useState } from 'react';
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

export default function MembershipBillingScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createMembershipBillingStyles(theme), [theme]);
  const [feedback, setFeedback] = useState<BillingFeedback | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isReloadingPlans, setIsReloadingPlans] = useState(false);
  const [isOpeningManage, setIsOpeningManage] = useState(false);

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
            paddingBottom: Math.max(insets.bottom, 32) + 42,
            paddingTop: Math.max(insets.top, 16),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Current membership</Text>
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.statusValue}>{statusLabel}</Text>
            </View>
            <View
              style={[
                styles.statusPill,
                statusTone === 'active' ? styles.statusPillActive : styles.statusPillInactive,
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  statusTone === 'active' ? styles.statusPillTextActive : styles.statusPillTextInactive,
                ]}
              >
                {statusTone === 'active' ? 'LIVE' : 'OFF'}
              </Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Plan</Text>
            <Text style={styles.metaValue}>{planName}</Text>
          </View>
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
              key: 'reload',
              title: isReloadingPlans || isLoadingProducts ? 'Reloading plans…' : 'Reload App Store plans',
              detail: isReloadingPlans || isLoadingProducts
                ? 'Refreshing App Store products…'
                : 'Refresh plan availability for this build.',
              icon: 'cloud-download-outline',
              onPress: handleReloadPlans,
              loading: isReloadingPlans || isLoadingProducts,
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
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Invite code join access</Text>
            <Text style={[styles.metaValue, inviteBypassEnabled ? styles.successText : styles.warningText]}>
              {inviteBypassEnabled ? 'Enabled' : 'Unavailable'}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Owner profiles</Text>
            <Text style={styles.metaValue}>{status?.ownerProfileCount ?? 0}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Member profiles</Text>
            <Text style={styles.metaValue}>{status?.memberProfileCount ?? 0}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Billing details</Text>
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            Secure billing via Apple. Cancel anytime. Both plans include a 3-day grace period for renewals
            before service pauses.
          </Text>
          {!hasProductsLoaded && productsError ? (
            <Text style={styles.errorText}>{productsError}</Text>
          ) : null}
          <Text style={styles.footnote}>Verity Protect never stores your payment card details.</Text>
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

const createMembershipBillingStyles = (theme: AppTheme) =>
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
      elevation: 8,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    statusValue: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700',
      color: theme.colors.text,
    },
    statusPill: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusPillActive: {
      borderColor: withOpacity(theme.colors.success, 0.6),
      backgroundColor: withOpacity(theme.colors.success, 0.14),
    },
    statusPillInactive: {
      borderColor: withOpacity(theme.colors.warning, 0.6),
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
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.24),
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
      backgroundColor: withOpacity(theme.colors.textMuted, 0.25),
    },
    bodyText: {
      color: theme.colors.text,
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
    feedbackCard: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
      gap: 6,
    },
    feedbackSuccess: {
      borderColor: withOpacity(theme.colors.success, 0.45),
      backgroundColor: withOpacity(theme.colors.success, 0.12),
    },
    feedbackInfo: {
      borderColor: withOpacity(theme.colors.accent, 0.4),
      backgroundColor: withOpacity(theme.colors.accent, 0.1),
    },
    feedbackError: {
      borderColor: withOpacity(theme.colors.danger, 0.45),
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
