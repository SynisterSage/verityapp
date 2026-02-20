import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import { authorizedFetch } from '../../services/backend';
import type { AppTheme } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { CircleActivityItem } from './circleActivityTypes';
import { AlertRow } from './alertTypes';
import { getCircleTrayCopy, getCircleTrayDisplay } from './circleTrayUtils';
import { CIRCLE_ALERT_TYPES } from './circleActivityConstants';
import { formatAlertTime, parseAlertTimestamp } from './alertTimeUtils';
import * as Haptics from 'expo-haptics';
import EmptyState from '../../components/common/EmptyState';
import AlertCard from '../../components/alerts/AlertCard';
import { useProfile } from '../../context/ProfileContext';

function toCircleActivityItem(alert: AlertRow): CircleActivityItem {
  const actorLabel = alert.payload?.actor_label ?? 'Circle member';
  const description =
    alert.payload?.message ??
    (alert.alert_type === 'circle_invite'
      ? 'Shared an invite link.'
      : alert.alert_type === 'pin_change'
      ? 'Updated the Safety PIN.'
      : alert.alert_type === 'safe_phrase_added'
      ? `Added safe word "${alert.payload?.phrase ?? 'a phrase'}".`
      : alert.alert_type === 'trusted_contact_added'
      ? `Added ${alert.payload?.added ?? 1} trusted contact${(alert.payload?.added ?? 1) === 1 ? '' : 's'}.`
      : alert.alert_type === 'blocked_caller_added'
      ? `Blocked number ${alert.payload?.caller_number ?? 'a caller'}.`
      : alert.alert_type === 'security_password'
      ? 'Updated the account password.'
      : alert.alert_type === 'member_joined'
      ? `${alert.payload?.member_display_name ?? 'A member'} joined the circle.`
      : alert.alert_type === 'member_role_changed'
      ? `Updated ${alert.payload?.target_display_name ?? 'a member'} role.`
      : alert.alert_type === 'member_removed'
      ? `Removed ${alert.payload?.target_display_name ?? 'a member'} from the circle.`
      : alert.alert_type === 'automation_settings_updated'
      ? 'Updated automation settings.'
      : alert.alert_type === 'data_exported'
      ? 'Exported the profile data.'
      : alert.alert_type === 'data_cleared'
      ? 'Cleared call and alert history.'
      : 'Circle activity updated.');

  return {
    id: `${alert.id}-circle`,
    label: actorLabel,
    description,
    timestamp: formatAlertTime(alert.created_at),
    alertRow: alert,
  };
}

export default function CircleActivityScreen() {
  const { theme } = useTheme();
  const { activeProfile, canManageProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'CircleActivityModal'>>();
  const [activityList, setActivityList] = useState<CircleActivityItem[]>(
    route.params?.activities ?? []
  );
  const [isLoadingActivities, setIsLoadingActivities] = useState(
    !route.params?.activities?.length
  );
  const styles = useMemo(() => createCircleStyles(theme), [theme]);
  const handleBackPress = useCallback(() => {
    navigation.goBack();
  }, [navigation]);
  const [deletingAll, setDeletingAll] = useState(false);

  const [trayAlert, setTrayAlert] = useState<AlertRow | null>(null);
  const [isTrayMounted, setIsTrayMounted] = useState(false);
  const trayAnim = useRef(new Animated.Value(0)).current;
  const [trayProcessing, setTrayProcessing] = useState(false);
  const [activeTrayAction, setActiveTrayAction] = useState<'delete' | null>(null);

  useEffect(() => {
    if (route.params?.activities && route.params.activities.length > 0) {
      setActivityList(route.params.activities);
      setIsLoadingActivities(false);
      return;
    }
    if (!activeProfile?.id) {
      setIsLoadingActivities(false);
      return;
    }

    let cancelled = false;
    const loadCircleActivity = async () => {
      setIsLoadingActivities(true);
      try {
        const data = await authorizedFetch(
          `/alerts?limit=50&profileId=${encodeURIComponent(activeProfile.id)}`
        );
        const alerts = (data?.alerts ?? []) as AlertRow[];
        const mapped = alerts
          .filter((alert) => CIRCLE_ALERT_TYPES.has(alert.alert_type ?? ''))
          .sort(
            (a, b) =>
              (parseAlertTimestamp(b.created_at)?.getTime() ?? 0) -
              (parseAlertTimestamp(a.created_at)?.getTime() ?? 0)
          )
          .map(toCircleActivityItem);
        if (!cancelled) {
          setActivityList(mapped);
        }
      } catch {
        if (!cancelled) {
          setActivityList([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingActivities(false);
        }
      }
    };

    loadCircleActivity();
    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id, route.params?.activities]);

  const deleteAlert = useCallback(async (alertId: string) => {
    try {
      await authorizedFetch(`/alerts/${alertId}`, { method: 'DELETE' });
      return true;
    } catch {
      Alert.alert('Delete failed', 'Could not delete the alert right now.');
      return false;
    }
  }, []);

  // All items in activityList are already circle alerts, so delete them all
  const allActivityIds = useMemo(
    () => activityList.map((activity) => activity.alertRow.id),
    [activityList]
  );

  const deleteAllActivities = useCallback(async () => {
    if (allActivityIds.length === 0) {
      return;
    }
    setDeletingAll(true);
    // Delete all alerts shown in this screen (all are circle alerts)
    for (const alertId of allActivityIds) {
      try {
        await authorizedFetch(`/alerts/${alertId}`, { method: 'DELETE' });
      } catch {
        // ignore individual failures
      }
    }
    // Clear the entire list since we deleted everything
    setActivityList([]);
    setDeletingAll(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [allActivityIds]);

  const confirmDeleteAll = useCallback(() => {
    if (allActivityIds.length === 0 || deletingAll) {
      return;
    }
    Alert.alert(
      'Delete circle activity',
      'This removes every circle action permanently. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete all', style: 'destructive', onPress: deleteAllActivities },
      ]
    );
  }, [allActivityIds, deletingAll, deleteAllActivities]);

  const showTray = useCallback(
    (alert: AlertRow) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTrayAlert(alert);
      setIsTrayMounted(true);
      setTrayProcessing(false);
      setActiveTrayAction(null);
      trayAnim.setValue(0);
      Animated.timing(trayAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [trayAnim]
  );

  const hideTray = useCallback(() => {
    void Haptics.selectionAsync();
    Animated.timing(trayAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsTrayMounted(false);
      setTrayAlert(null);
      setTrayProcessing(false);
      setActiveTrayAction(null);
    });
  }, [trayAnim]);

  const handleTrayDelete = useCallback(async () => {
    if (!trayAlert) return;
    setTrayProcessing(true);
    setActiveTrayAction('delete');
    const success = await deleteAlert(trayAlert.id);
    setTrayProcessing(false);
    setActiveTrayAction(null);
    if (success) {
      setActivityList((prev) => prev.filter((activity) => activity.alertRow.id !== trayAlert.id));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      hideTray();
    }
  }, [deleteAlert, hideTray, trayAlert]);

  const trayHandledDisplay = trayAlert ? getCircleTrayDisplay(trayAlert) : '';
  const circleTrayCopy = useMemo(
    () => (trayAlert ? getCircleTrayCopy(trayAlert, trayHandledDisplay) : null),
    [trayAlert, trayHandledDisplay]
  );
  const isTrayVisible = isTrayMounted && Boolean(trayAlert);
  const trayTranslateY = trayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
    extrapolate: 'clamp',
  });
  const trayBackdropOpacity = trayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={[styles.container, { paddingTop: Math.max(28, insets.top + 12)}]} edges={[]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Circle activity</Text>
          <Text style={styles.headerSubtitle}>
            Showing {activityList.length} recent action{activityList.length === 1 ? '' : 's'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={confirmDeleteAll}
          disabled={
            !canManageProfile || deletingAll || activityList.length === 0
          }
          activeOpacity={0.7}
        >
          {deletingAll ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={theme.colors.text} />
          )}
        </TouchableOpacity>
      </View>
      {isLoadingActivities ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.colors.textMuted} />
        </View>
      ) : activityList.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="people-outline"
            title="No circle activity"
            body="Circle updates appear here as soon as they happen."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardList}>
            {activityList.map((activity) => (
              <AlertCard
                key={activity.id}
                title={activity.label}
                description={activity.description}
                timestamp={activity.timestamp}
                iconName="people-outline"
                iconColor={theme.colors.accent}
                iconBackgroundColor={withOpacity(theme.colors.accent, 0.18)}
                onLongPress={
                  canManageProfile ? () => showTray(activity.alertRow) : undefined
                }
              />
            ))}
          </View>
        </ScrollView>
      )}
      <Modal visible={isTrayVisible} transparent animationType="none" onRequestClose={hideTray}>
        <View style={styles.trayOverlay} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.trayBackdrop,
              { opacity: trayBackdropOpacity, position: 'absolute', width: '100%', height: '100%' },
            ]}
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={hideTray} />
          {trayAlert && circleTrayCopy ? (
            <Animated.View
              style={[
                styles.tray,
                {
                  transform: [{ translateY: trayTranslateY }],
                },
              ]}
            >
              <View style={styles.trayContent}>
                <View style={styles.trayHandle} />
                <Text style={styles.trayTitle}>{circleTrayCopy.title}</Text>
                <Text style={styles.traySubtitle}>{circleTrayCopy.subtitle}</Text>
                {circleTrayCopy.detail ? (
                  <Text style={styles.trayDetail}>{circleTrayCopy.detail}</Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.trayAction,
                    styles.trayDanger,
                    pressed && styles.trayActionPressed,
                    trayProcessing && styles.trayActionDisabled,
                  ]}
                  onPress={handleTrayDelete}
                  disabled={trayProcessing}
                >
                  <Text style={[styles.trayActionText, styles.trayDangerText]}>
                    {trayProcessing && activeTrayAction === 'delete' ? 'Working…' : 'Delete activity'}
                  </Text>
                  <Text style={styles.trayActionHint}>Removes the alert permanently.</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.trayAction,
                    styles.trayCancel,
                    pressed && styles.trayActionPressed,
                  ]}
                  onPress={hideTray}
                  disabled={trayProcessing}
                >
                  <Text style={styles.trayCancelText}>Cancel</Text>
                </Pressable>
              </View>
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createCircleStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 10,
    },
    backButton: {
      marginRight: 8,
      padding: 8,
      borderRadius: 18,
      backgroundColor: withOpacity(theme.colors.text, 0.04),
    },
    headerContent: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
    },
    headerSubtitle: {
      fontSize: 14,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    headerAction: {
      marginLeft: 8,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.text, 0.04),
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingTop: 26,
    },
    cardList: {
      gap: 0,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'stretch',
      paddingHorizontal: 24,
      paddingTop: 0,
      paddingBottom: 34
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    trayOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      zIndex: 999,
      elevation: 999,
    },
    trayBackdrop: {
      backgroundColor: withOpacity(theme.colors.text, 0.2),
    },
    tray: {
      position: 'absolute',
      left: -12,
      right: -12,
      bottom: 0,
      borderRadius: 30,
      backgroundColor: theme.colors.surface,
      paddingVertical: 24,
      paddingHorizontal: 0,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.text, 0.08),
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      zIndex: 1000,
      elevation: 30,
    },
    trayHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: withOpacity(theme.colors.text, 0.3),
      alignSelf: 'center',
      marginBottom: 12,
    },
    trayContent: {
      paddingHorizontal: 30,
    },
    trayTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'left',
      marginBottom: 6,
    },
    traySubtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      textAlign: 'left',
      marginBottom: 2,
    },
    trayDetail: {
      color: theme.colors.textDim,
      fontSize: 12,
      textAlign: 'left',
      marginBottom: 18,
    },
    trayAction: {
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 18,
      backgroundColor: withOpacity(theme.colors.text, 0.08),
      marginBottom: 12,
    },
    trayActionPressed: {
      opacity: 0.8,
    },
    trayActionDisabled: {
      opacity: 0.6,
    },
    trayActionText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    trayActionHint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    trayDanger: {
      backgroundColor: withOpacity(theme.colors.danger, 0.15),
    },
    trayDangerText: {
      color: theme.colors.danger,
    },
    trayCancel: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.12),
    },
    trayCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
  });
