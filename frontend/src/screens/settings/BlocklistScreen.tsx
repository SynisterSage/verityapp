import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import SettingsHeader from '../../components/common/SettingsHeader';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';
import type { AppTheme } from '../../theme/tokens';

type BlockedCaller = {
  id: string;
  caller_number: string | null;
  reason: string | null;
  created_at: string;
};

const normalizeEntryDigits = (value = '') => {
  const digits = value.replace(/\D/g, '');
  return digits.slice(0, 10);
};

const extractTenDigits = (value?: string | null) => {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const formatInputDigits = (digits: string) => {
  if (!digits) return '';
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6, 10);
  let formatted = '';
  if (area) {
    formatted += `(${area}`;
  }
  if (area.length === 3) {
    formatted += ') ';
  }
  if (prefix) {
    formatted += prefix;
  }
  if (prefix.length === 3) {
    formatted += '-';
  }
  if (line) {
    formatted += line;
  }
  return formatted.trimEnd();
};

export default function BlocklistScreen() {
  const insets = useSafeAreaInsets();
  const { activeProfile, canManageProfile } = useProfile();
  const [blockedList, setBlockedList] = useState<BlockedCaller[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputDigits, setInputDigits] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [trayContact, setTrayContact] = useState<BlockedCaller | null>(null);
  const [isTrayMounted, setIsTrayMounted] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const trayAnim = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0.65)).current;

  const { theme } = useTheme();
  const styles = useMemo(() => createBlocklistStyles(theme), [theme]);
  const placeholderColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.65),
    [theme.colors.textMuted]
  );
  const howItems = useMemo(
    () => [
      {
        icon: 'call-outline',
        color: theme.colors.accent,
        text: 'Block suspicious callers so your loved one stays protected.',
      },
      {
        icon: 'shield-checkmark',
        color: theme.colors.success,
        text: 'Trusted callers reach through, blocked ones stay silent.',
      },
    ],
    [theme.colors.accent, theme.colors.success]
  );

  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `block-skel-${i}`), []);

  const fetchBlocked = useCallback(async () => {
    if (!activeProfile) return;
    setLoading(true);
    setShowSkeleton(true);
    try {
      const data = await authorizedFetch(`/fraud/blocked-callers?profileId=${activeProfile.id}`);
      setBlockedList(data?.blocked_callers ?? []);
    } catch {
      setBlockedList([]);
    } finally {
      setLoading(false);
      setTimeout(() => setShowSkeleton(false), 200);
    }
  }, [activeProfile]);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0.65,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const listEmpty = !loading && blockedList.length === 0 && !showSkeleton;

  const handleInputChange = (text: string) => {
    const digits = normalizeEntryDigits(text);
    const formatted = formatInputDigits(digits);
    setInputDigits(digits);
    setInputValue(formatted);
    setInputError('');
  };

  const handleAdd = async () => {
    if (!canManageProfile) {
      setInputError('Only caretakers or admins can block numbers.');
      return;
    }
    if (!inputDigits) {
      setInputError('Enter a phone number.');
      return;
    }
    if (!activeProfile) return;
    setIsAdding(true);
    try {
      await authorizedFetch('/fraud/blocked-callers', {
        method: 'POST',
        body: JSON.stringify({
          profileId: activeProfile.id,
          callerNumber: `+1${inputDigits}`,
          reason: 'manual',
        }),
      });
      setInputDigits('');
      setInputValue('');
      await fetchBlocked();
    } catch (err: any) {
      setInputError(err?.message || 'Failed to block number.');
    } finally {
      setIsAdding(false);
    }
  };

  const openTray = (caller: BlockedCaller) => {
    setTrayContact(caller);
    setIsTrayMounted(true);
    trayAnim.setValue(0);
    Animated.timing(trayAnim, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeTray = () => {
    Animated.timing(trayAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsTrayMounted(false);
      setTrayContact(null);
    });
  };

  const handleRemove = async () => {
    if (!trayContact || !canManageProfile) return;
    setIsRemoving(true);
    try {
      await authorizedFetch(`/fraud/blocked-callers/${trayContact.id}`, { method: 'DELETE' });
      await fetchBlocked();
      closeTray();
    } catch (err: any) {
      console.warn('Failed to remove block', err);
    } finally {
      setIsRemoving(false);
    }
  };

  const renderManualCard = () => {
    if (!canManageProfile) {
      return null;
    }
    return (
      <View style={styles.manualEntry}>
        <Text style={[styles.sectionLabel, styles.sectionLabelSpacing]}>Manual entry</Text>
        <View style={styles.manualInputRow}>
          <TextInput
            style={[
              styles.manualInputField,
              (!canManageProfile || isAdding) && styles.manualInputDisabled,
            ]}
            placeholder="(123) 456-7890"
            placeholderTextColor={placeholderColor}
            value={inputValue}
            onChangeText={handleInputChange}
            keyboardType="phone-pad"
            editable={canManageProfile && !isAdding}
          />
          <TouchableOpacity
            style={[
              styles.manualAddButton,
              (!canManageProfile || isAdding || !inputDigits) && styles.addButtonDisabled,
            ]}
            onPress={handleAdd}
            disabled={!canManageProfile || isAdding || !inputDigits}
          >
            {isAdding ? (
              <ActivityIndicator color={theme.colors.surface} />
            ) : (
              <Ionicons name="add" size={24} color={theme.colors.surface} />
            )}
          </TouchableOpacity>
        </View>
        {inputError ? <Text style={styles.inputError}>{inputError}</Text> : null}
      </View>
    );
  };

  const renderHowItWorks = () => (
    <View style={styles.howItWorks}>
      <HowItWorksCard caption="How it works" items={howItems} />
    </View>
  );

  const getReasonLabel = (caller: BlockedCaller) => {
    const reason = caller.reason?.toLowerCase();
    if (reason?.includes('auto')) {
      return 'Blocked automatically';
    }
    if (reason?.includes('quick')) {
      return 'Blocked via quick action';
    }
    if (reason?.includes('manual')) {
      return 'Blocked manually';
    }
    return 'Blocked';
  };

  const formatDisplayNumber = (number?: string | null) => {
    return formatPhoneNumber(number, 'Unknown number');
  };

  const renderBlockRow = (caller: BlockedCaller) => (
    <View key={caller.id} style={styles.blockRow}>
      <View style={styles.blockAvatar}>
        <Ionicons name="ban" size={22} color={theme.colors.danger} />
      </View>
      <View style={styles.blockContent}>
        <Text style={styles.blockNumber}>{formatDisplayNumber(caller.caller_number)}</Text>
        <Text style={styles.blockReason}>{getReasonLabel(caller)}</Text>
      </View>
      <TouchableOpacity
        onPress={() => {
          if (!canManageProfile) {
            setInputError('Only caretakers or admins can manage blocked numbers.');
            return;
          }
          openTray(caller);
        }}
        disabled={!canManageProfile}
      >
        <Text style={[styles.manageText, !canManageProfile && styles.manageTextDisabled]}>
          Manage
        </Text>
      </TouchableOpacity>
    </View>
  );

  const trayPaddingBottom = Math.max(insets.bottom, 24) + 12;
  const trayOpacity = trayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <SettingsHeader title="Blocked numbers" subtitle="Keep suspicious callers out" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 32) + 20 },
            { paddingTop: Math.max(insets.top, 12) + 0 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchBlocked}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {renderManualCard()}

        <Text style={[styles.sectionLabel, styles.sectionLabelSpacing]}>Current block list</Text>
      <View style={styles.listSection}>
          {showSkeleton ? (
            <View style={styles.skeletonList}>
              {skeletonRows.map((key) => (
                <Animated.View key={key} style={[styles.skeletonCard, { opacity: shimmer }]}>
                  <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                  <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
                </Animated.View>
              ))}
            </View>
          ) : listEmpty ? (
            <View style={styles.emptyStateWrap}>
              <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
                <Ionicons name="person-circle-outline" size={30} color={theme.colors.success} />
            </View>
                <Text style={styles.emptyBody}>
                  Import someone from your phone or add a number from above.
                </Text>
              </View>
            </View>
          ) : (
            blockedList.map((caller) => renderBlockRow(caller))
          )}
        </View>

        {renderHowItWorks()}
      </ScrollView>

      {isTrayMounted && trayContact ? (
        <Modal transparent animationType="fade" visible>
          <Animated.View style={[styles.modalOverlay, { opacity: trayOpacity }]}>
            <Pressable style={styles.modalBackdrop} onPress={closeTray} />
            <Animated.View
              style={[
                styles.tray,
                {
                  paddingBottom: trayPaddingBottom,
                  transform: [
                    {
                      translateY: trayAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [250, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.trayHandle} />
              <View style={styles.trayContent}>
                <Text style={styles.trayTitle}>Manage blocked caller</Text>
                <Text style={styles.trayNumber}>
                  {formatPhoneNumber(trayContact.caller_number, 'Unknown number')}
                </Text>
                <Text style={styles.trayReason}>
                  {trayContact.reason?.toLowerCase().includes('auto')
                    ? 'Blocked automatically'
                    : trayContact.reason?.toLowerCase().includes('quick')
                    ? 'Blocked via quick action'
                    : 'Blocked manually'}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.trayButton,
                  (isRemoving || !canManageProfile) && styles.trayButtonDisabled,
                ]}
                onPress={handleRemove}
                disabled={isRemoving || !canManageProfile}
              >
                {isRemoving ? (
                  <ActivityIndicator color={theme.colors.surface} />
                ) : (
                  <Text style={styles.trayButtonText}>Unblock number</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.trayCancelButton} onPress={closeTray}>
                <Text style={styles.trayCancelText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const createBlocklistStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      paddingHorizontal: 24,
      gap: 0,
    },
    sectionLabel: {
      fontSize: 12,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
    sectionLabelSpacing: {
      marginTop: 12,
      marginBottom: 6,
    },
    manualEntry: {
      gap: 18,
      marginBottom: 28,
    },
    manualInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 32,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      gap: 12,
      height: 60,
    },
    manualInputField: {
      flex: 1,
      fontSize: 16,
      color: theme.colors.text,
    },
    manualAddButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    addButtonDisabled: {
      opacity: 0.5,
    },
    manualInputDisabled: {
      opacity: 0.5,
    },
    inputError: {
      color: theme.colors.danger,
      fontSize: 13,
    },
    listSection: {
      marginTop: 0,
      gap: 12,
      marginBottom: 16,
    },
    emptyStateWrap: {
      marginTop: 24,
    },
    emptyCard: {
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderStyle: 'dashed',
      padding: 24,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      marginBottom: 16,
      gap: 12,
    },
    emptyIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: withOpacity(theme.colors.text, 0.06),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    emptyBody: {
      color: theme.colors.textMuted,
      fontSize: 13,
      textAlign: 'center',
    },
    skeletonList: {
      gap: 14,
    },
    skeletonCard: {
      height: 70,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 16,
      gap: 8,
    },
    skeletonLine: {
      height: 12,
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.textMuted, 0.2),
    },
    skeletonLineShort: {
      width: '60%',
    },
    skeletonLineTiny: {
      width: '40%',
    },
    blockRow: {
      backgroundColor: theme.colors.surface,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    blockAvatar: {
      width: 52,
      height: 52,
      borderRadius: 24,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.textMuted, 0.4),
      alignItems: 'center',
      justifyContent: 'center',
    },
    blockContent: {
      flex: 1,
      gap: 6,
    },
    blockNumber: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    blockReason: {
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    manageText: {
      fontSize: 15,
      color: theme.colors.accent,
      fontWeight: '600',
    },
    manageTextDisabled: {
      color: withOpacity(theme.colors.accent, 0.4),
    },
    howItWorks: {
      borderRadius: 32,
      overflow: 'hidden',
    },
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      alignItems: 'center',
      backgroundColor: theme.colors.overlay,
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    tray: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 24,
      gap: 12,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowOffset: { width: 0, height: -12 },
      shadowRadius: 30,
      elevation: 20,
      marginBottom: -10,
    },
    trayHandle: {
      width: 48,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      marginBottom: 12,
    },
    trayContent: {
      gap: 6,
      alignItems: 'center',
      marginBottom: 6,
    },
    trayTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    trayNumber: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
    },
    trayReason: {
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    trayButton: {
      width: '100%',
      height: 60,
      borderRadius: 24,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
      marginBottom: -10,
    },
    trayButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.surface,
    },
    trayButtonDisabled: {
      opacity: 0.6,
    },
    trayCancelButton: {
      width: '100%',
      height: 52,
      borderRadius: 24,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    trayCancelText: {
      color: theme.colors.textMuted,
      fontWeight: '600',
    },
  });
