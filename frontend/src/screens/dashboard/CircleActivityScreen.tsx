import { useCallback, useMemo, useRef, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import EmptyState from '../../components/common/EmptyState';
import AlertCard from '../../components/alerts/AlertCard';
import { useProfile } from '../../context/ProfileContext';

export default function CircleActivityScreen() {
  const { theme } = useTheme();
  const { canManageProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'CircleActivityModal'>>();
  const [activityList, setActivityList] = useState<CircleActivityItem[]>(route.params.activities ?? []);
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

  const deleteAlert = useCallback(async (alertId: string) => {
    try {
      await authorizedFetch(`/alerts/${alertId}`, { method: 'DELETE' });
      return true;
    } catch {
      Alert.alert('Delete failed', 'Could not delete the alert right now.');
      return false;
    }
  }, []);

  const circleActivitiesToDelete = useMemo(
    () => activityList.filter((activity) => CIRCLE_ALERT_TYPES.has(activity.alertRow.alert_type ?? '')),
    [activityList]
  );
  const circleActivityIdsToDelete = useMemo(
    () => new Set(circleActivitiesToDelete.map((activity) => activity.alertRow.id)),
    [circleActivitiesToDelete]
  );

  const deleteAllActivities = useCallback(async () => {
    if (circleActivityIdsToDelete.size === 0) {
      return;
    }
    setDeletingAll(true);
    for (const alertId of Array.from(circleActivityIdsToDelete)) {
      try {
        await authorizedFetch(`/alerts/${alertId}`, { method: 'DELETE' });
      } catch {
        // ignore individual failures
      }
    }
    setActivityList((prev) =>
      prev.filter((activity) => !circleActivityIdsToDelete.has(activity.alertRow.id))
    );
    setDeletingAll(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [circleActivityIdsToDelete]);

  const confirmDeleteAll = useCallback(() => {
    if (circleActivityIdsToDelete.size === 0 || deletingAll) {
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
  }, [circleActivityIdsToDelete, deletingAll, deleteAllActivities]);

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
            !canManageProfile || deletingAll || circleActivitiesToDelete.length === 0
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
      {activityList.length === 0 ? (
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
