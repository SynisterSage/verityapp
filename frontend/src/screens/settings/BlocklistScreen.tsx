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
import { BlurView } from 'expo-blur';

type BlockedCaller = {
  id: string;
  caller_number: string | null;
  reason: string | null;
  created_at: string;
};

const normalizeDigits = (value = '') => {
  const digits = value.replace(/\D/g, '');
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
};

const formatPhoneNumber = (digits: string) => {
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
  const { activeProfile } = useProfile();
  const [blockedList, setBlockedList] = useState<BlockedCaller[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputDigits, setInputDigits] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [prevInputValue, setPrevInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [trayContact, setTrayContact] = useState<BlockedCaller | null>(null);
  const [isTrayMounted, setIsTrayMounted] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const trayAnim = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0.65)).current;

  const howItems = useMemo(
    () => [
      {
        icon: 'call-outline',
        color: '#2d6df6',
        text: 'Block suspicious callers so your loved one stays protected.',
      },
      {
        icon: 'shield-checkmark',
        color: '#4ade80',
        text: 'Trusted callers reach through, blocked ones stay silent.',
      },
    ],
    []
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
    const digits = normalizeDigits(text);
    const formatted = formatPhoneNumber(digits);
    const isDeleting = text.length < prevInputValue.length;
    const nextValue = isDeleting ? text : formatted;
    setInputDigits(digits);
    setInputValue(nextValue);
    setPrevInputValue(nextValue);
    setInputError('');
  };

  const handleAdd = async () => {
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
      setPrevInputValue('');
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
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsTrayMounted(false);
      setTrayContact(null);
    });
  };

  const handleRemove = async () => {
    if (!trayContact) return;
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

  const renderManualCard = () => (
    <View style={styles.manualEntry}>
      <Text style={[styles.sectionLabel, styles.sectionLabelSpacing]}>Manual entry</Text>
      <View style={styles.manualInputRow}>
        <TextInput
          style={styles.manualInputField}
          placeholder="(123) 456-7890"
          placeholderTextColor="#6c768a"
          value={inputValue}
          onChangeText={handleInputChange}
          keyboardType="phone-pad"
          editable={!isAdding}
        />
        <TouchableOpacity
          style={[styles.manualAddButton, (isAdding || !inputDigits) && styles.addButtonDisabled]}
          onPress={handleAdd}
          disabled={isAdding || !inputDigits}
        >
          {isAdding ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="add" size={24} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
      {inputError ? <Text style={styles.inputError}>{inputError}</Text> : null}
    </View>
  );

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
    if (reason?.includes('manual')) {
      return 'Blocked manually';
    }
    return 'Blocked';
  };

  const formatDisplayNumber = (number?: string | null) => {
    if (!number) return 'Unknown number';
    return formatPhoneNumber(normalizeDigits(number));
  };

  const renderBlockRow = (caller: BlockedCaller) => (
    <View key={caller.id} style={styles.blockRow}>
      <View style={styles.blockAvatar}>
        <Ionicons name="ban" size={22} color="#f87171" />
      </View>
      <View style={styles.blockContent}>
        <Text style={styles.blockNumber}>{formatDisplayNumber(caller.caller_number)}</Text>
        <Text style={styles.blockReason}>{getReasonLabel(caller)}</Text>
      </View>
      <TouchableOpacity onPress={() => openTray(caller)}>
        <Text style={styles.manageText}>Manage</Text>
      </TouchableOpacity>
    </View>
  );

  const trayPaddingBottom = Math.max(insets.bottom, 24) + 12;

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
            tintColor="#8ab4ff"
            colors={['#8ab4ff']}
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
                  <Ionicons name="person-circle-outline" size={30} color="#4ade80" />
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
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={closeTray}>
              <BlurView intensity={65} tint="dark" style={styles.modalBlur} />
            </Pressable>
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
                <Text style={styles.trayNumber}>{trayContact.caller_number}</Text>
                <Text style={styles.trayReason}>
                  {trayContact.reason?.toLowerCase().includes('auto') ? 'Blocked automatically' : 'Blocked manually'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.trayButton, isRemoving && styles.trayButtonDisabled]}
                onPress={handleRemove}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.trayButtonText}>Unblock number</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.trayCancelButton} onPress={closeTray}>
                <Text style={styles.trayCancelText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f141d',
  },
  content: {
    paddingHorizontal: 24,
    gap: 0,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#94a3b8',
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
    borderColor: '#1b2534',
    borderRadius: 32,
    backgroundColor: '#121a26',
    paddingHorizontal: 16,
    gap: 12,
    height: 60,
  },
  manualInputField: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  manualAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2d6df6',
    justifyContent: 'center',
    alignItems: 'center',
    
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  inputError: {
    color: '#ff8a8a',
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
    borderColor: '#1f2937',
    borderStyle: 'dashed',
    padding: 24,
    backgroundColor: '#121a26',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0f1b2d',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyBody: {
    color: '#8aa0c6',
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
    borderColor: '#1b2534',
    backgroundColor: '#101626',
    padding: 16,
    gap: 8,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1d2433',
  },
  skeletonLineShort: {
    width: '60%',
  },
  skeletonLineTiny: {
    width: '40%',
  },
  blockRow: {
    backgroundColor: '#121a26',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  blockAvatar: {
    width: 52,
    height: 52,
    borderRadius: 24,
    backgroundColor: '#0f1724',
    borderWidth: 1,
    borderColor: '#1f2330',
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
    color: '#fff',
  },
  blockReason: {
    fontSize: 14,
    color: '#8aa0c6',
  },
  manageText: {
    fontSize: 15,
    color: '#2d6df6',
    fontWeight: '600',
  },
  howItWorks: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  tray: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0f1724',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 24,
    gap: 12,
    alignItems: 'center',
  },
  trayHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1d2534',
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
    color: '#f5f7fb',
  },
  trayNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  trayReason: {
    fontSize: 14,
    color: '#94a3b8',
  },
  trayButton: {
    width: '100%',
    height: 60,
    borderRadius: 24,
    backgroundColor: '#2d6df6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: -10,
  },
  trayButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  trayButtonDisabled: {
    opacity: 0.6,
  },
  trayCancelButton: {
    width: '100%',
    height: 52,
    borderRadius: 24,
    backgroundColor: '#1f2230',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2a3448',
  },
  trayCancelText: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
});
