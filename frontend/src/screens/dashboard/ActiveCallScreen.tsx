import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  NativeEventEmitter,
  NativeModules,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import TwilioVoice from 'react-native-twilio-programmable-voice';

import type { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import { useProfile } from '../../context/ProfileContext';
import { authorizedFetch } from '../../services/backend';
import { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';

type ActiveCallRoute = RouteProp<RootStackParamList, 'ActiveCallModal'>;

type AudioRoutePayload = {
  route?: string;
  displayName?: string;
  portType?: string;
};

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function normalizePhone(input?: string | null) {
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

function formatPhoneDisplay(input?: string | null) {
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  const usDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (usDigits.length === 10) {
    const area = usDigits.slice(0, 3);
    const exchange = usDigits.slice(3, 6);
    const line = usDigits.slice(6);
    return `+1 (${area}) ${exchange}-${line}`;
  }
  return input;
}

function formatStatusLabel(input?: string | null) {
  const value = (input ?? '').trim();
  if (!value) {
    return 'Ringing';
  }
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(' ');
}

type TrustedContact = {
  caller_number?: string | null;
  contact_name?: string | null;
};

export default function ActiveCallScreen() {
  const route = useRoute<ActiveCallRoute>();
  const { theme, mode } = useTheme();
  const { activeProfile } = useProfile();
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);

  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [elapsedLabel, setElapsedLabel] = useState('0:00');
  const [trustedDisplayName, setTrustedDisplayName] = useState<string | null>(null);
  const [identityLookupResolved, setIdentityLookupResolved] = useState(false);
  const [showIdentityFallback, setShowIdentityFallback] = useState(false);
  const [audioRouteLabel, setAudioRouteLabel] = useState('iPhone');
  const ringPulse = useRef(new Animated.Value(0)).current;
  const statusPulse = useRef(new Animated.Value(0)).current;
  const identitySkeletonPulse = useRef(new Animated.Value(0)).current;

  const callSid = route.params?.callSid ?? '';
  const fromNumber = route.params?.fromNumber ?? '';
  const status = route.params?.status || 'Ringing';
  const displayNumber = useMemo(() => formatPhoneDisplay(fromNumber), [fromNumber]);
  const statusLabel = useMemo(() => formatStatusLabel(status), [status]);

  console.log('[ActiveCallScreen] Render with params:', {
    fromNumber,
    status,
    callSid: route.params?.callSid,
    toNumber: route.params?.toNumber,
  });

  // Start timer when call connects
  useEffect(() => {
    const isConnected = status.toLowerCase() === 'connected';
    if (isConnected && !connectedAt) {
      console.log('[ActiveCallScreen] Call connected, starting timer');
      setConnectedAt(Date.now());
    }
  }, [status, connectedAt]);
  const hasCallerIdentity = Boolean(trustedDisplayName || (identityLookupResolved && displayNumber));
  const showIdentitySkeleton = !hasCallerIdentity && !showIdentityFallback;
  const callerTitle =
    trustedDisplayName ||
    (identityLookupResolved ? displayNumber : '') ||
    (showIdentityFallback ? 'Active Call' : '');
  const callerSubtitle =
    trustedDisplayName && displayNumber ? displayNumber : showIdentityFallback ? 'Protected line' : '';
  const initials = useMemo(() => {
    const source = identityLookupResolved ? callerTitle.trim() || 'TC' : 'TC';
    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map((item) => item.charAt(0).toUpperCase()).join('');
  }, [callerTitle, identityLookupResolved]);

  useEffect(() => {
    setIdentityLookupResolved(false);
    setShowIdentityFallback(false);
    const timer = setTimeout(() => {
      if (!fromNumber) {
        setShowIdentityFallback(true);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [callSid, fromNumber]);

  useEffect(() => {
    if (!connectedAt) {
      setElapsedLabel('0:00');
      return;
    }
    const interval = setInterval(() => {
      setElapsedLabel(formatElapsed(Date.now() - connectedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [connectedAt]);

  useEffect(() => {
    const profileId = activeProfile?.id;
    if (!profileId || !fromNumber) {
      console.log('[ActiveCallScreen] Skipping trusted lookup:', { profileId, fromNumber });
      setTrustedDisplayName(null);
      setIdentityLookupResolved(Boolean(fromNumber));
      return;
    }
    let cancelled = false;
    setIdentityLookupResolved(false);
    const normalizedIncoming = normalizePhone(fromNumber);
    console.log('[ActiveCallScreen] Looking up trusted contact:', { fromNumber, normalizedIncoming });
    if (!normalizedIncoming) {
      setTrustedDisplayName(null);
      setIdentityLookupResolved(true);
      return;
    }
    const lookupTimeout = setTimeout(() => {
      if (!cancelled) {
        setIdentityLookupResolved(true);
      }
    }, 1500);
    authorizedFetch(`/fraud/trusted-contacts?profileId=${profileId}`)
      .then((data) => {
        if (cancelled) return;
        const trustedContacts = (data?.trusted_contacts ?? []) as TrustedContact[];
        console.log('[ActiveCallScreen] Found trusted contacts:', trustedContacts.length);
        const matched = trustedContacts.find((entry) => {
          return normalizePhone(entry.caller_number) === normalizedIncoming;
        });
        const name = matched?.contact_name?.trim();
        console.log('[ActiveCallScreen] Matched contact:', { name, matched: !!matched });
        setTrustedDisplayName(name ? name : null);
        setIdentityLookupResolved(true);
      })
      .catch(() => {
        if (!cancelled) {
          setTrustedDisplayName(null);
          setIdentityLookupResolved(true);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(lookupTimeout);
    };
  }, [activeProfile?.id, fromNumber]);

  useEffect(() => {
    const animatePulse = (value: Animated.Value) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: 4000,
          easing: Easing.bezier(0.32, 1, 0.2, 1),
          useNativeDriver: true,
        })
      );
    const ringLoop = animatePulse(ringPulse);
    const statusLoop = animatePulse(statusPulse);
    ringLoop.start();
    statusLoop.start();
    return () => {
      ringLoop.stop();
      statusLoop.stop();
      ringPulse.setValue(0);
      statusPulse.setValue(0);
    };
  }, [ringPulse, statusPulse]);

  useEffect(() => {
    if (!showIdentitySkeleton) {
      identitySkeletonPulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(identitySkeletonPulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(identitySkeletonPulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      identitySkeletonPulse.setValue(0);
    };
  }, [identitySkeletonPulse, showIdentitySkeleton]);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    const module = NativeModules.VoIPPushModule as
      | {
          getCurrentAudioRoute?: () => Promise<AudioRoutePayload>;
        }
      | undefined;

    if (!module) {
      return;
    }

    let cancelled = false;
    const applyRoute = (payload?: AudioRoutePayload) => {
      if (cancelled) return;
      const nextLabel =
        typeof payload?.displayName === 'string' && payload.displayName.trim().length > 0
          ? payload.displayName.trim()
          : 'iPhone';
      setAudioRouteLabel(nextLabel);
    };

    module.getCurrentAudioRoute?.().then(applyRoute).catch(() => null);

    const emitter = new NativeEventEmitter(NativeModules.VoIPPushModule);
    const subscription = emitter.addListener('audioRouteChanged', (payload: AudioRoutePayload) => {
      applyRoute(payload);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      return;
    }
    setAudioRouteLabel(speakerOn ? 'Speaker' : 'Device');
  }, [speakerOn]);

  const toggleMute = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    const next = !muted;
    TwilioVoice.setMuted(next);
    setMuted(next);
  };

  const toggleSpeaker = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    const next = !speakerOn;
    TwilioVoice.setSpeakerPhone(next);
    setSpeakerOn(next);
  };

  const endCall = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    TwilioVoice.disconnect();
  };

  const ringScale = ringPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });
  const ringOpacity = ringPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0],
  });

  const statusScale = statusPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.6],
  });
  const statusOpacity = statusPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0],
  });
  const skeletonOpacity = identitySkeletonPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.7],
  });

  const renderControl = (
    key: string,
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    active: boolean,
    onPress: () => void
  ) => (
    <View key={key} style={styles.controlSlot}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.controlCircle,
          active ? styles.controlCircleActive : styles.controlCircleIdle,
          pressed && styles.controlCirclePressed,
        ]}
      >
        <Ionicons
          name={icon}
          size={22}
          color={active ? styles.controlIconActive.color : styles.controlIconIdle.color}
        />
      </Pressable>
      <Text style={styles.controlLabel}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBlock}>
        <View style={styles.statusPill}>
          <View style={styles.statusDotWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.statusDotPulse,
                {
                  opacity: statusOpacity,
                  transform: [{ scale: statusScale }],
                },
              ]}
            />
            <View style={styles.statusDot} />
          </View>
          <Text style={styles.statusPillText}>TRUSTED LINE</Text>
        </View>
        {showIdentitySkeleton ? (
          <Animated.View style={[styles.identitySkeleton, { opacity: skeletonOpacity }]}>
            <View style={styles.identitySkeletonName} />
            <View style={styles.identitySkeletonNumber} />
          </Animated.View>
        ) : (
          <>
            <Text style={styles.callerName} numberOfLines={1}>
              {callerTitle}
            </Text>
            <Text style={styles.callerNumber} numberOfLines={1}>
              {callerSubtitle}
            </Text>
          </>
        )}
        <Text style={styles.timer}>
          {statusLabel} • {elapsedLabel}
        </Text>
        <Text style={styles.audioRouteText}>Audio: {audioRouteLabel}</Text>
      </View>

      <View style={styles.middleBlock}>
        <View style={styles.avatarZone}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.avatarPulseRing,
              {
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
          <View style={styles.avatarOuter}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
        </View>

        <View style={styles.controlsGrid}>
          {renderControl('mute', muted ? 'mic-off' : 'mic', 'MUTE', muted, toggleMute)}
          {renderControl(
            'speaker',
            speakerOn ? 'volume-high' : 'volume-medium',
            'SPEAKER',
            speakerOn,
            toggleSpeaker
          )}
        </View>
      </View>

      <Pressable onPress={endCall} style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}>
        <Ionicons name="call" size={30} color="#fff" style={styles.endIcon} />
      </Pressable>
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme, mode: 'light' | 'dark') =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
      paddingHorizontal: 24,
      justifyContent: 'space-between',
      paddingBottom: 26,
      paddingTop: 8,
    },
    topBlock: {
      alignItems: 'center',
      paddingTop: 14,
      gap: 0,
    },
    statusPill: {
      minHeight: 32,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: withOpacity('#16A34A', mode === 'dark' ? 0.16 : 0.14),
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    statusDotWrap: {
      width: 10,
      height: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: '#22C55E',
    },
    statusDotPulse: {
      position: 'absolute',
      width: 10,
      height: 10,
      borderRadius: 999,
      backgroundColor: '#22C55E',
    },
    statusPillText: {
      color: '#34D399',
      fontSize: 11,
      letterSpacing: 1.2,
      fontWeight: '800',
    },
    callerName: {
      color: theme.colors.text,
      fontSize: 39,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 44,
      marginTop: 10,
      marginBottom: 2,
    },
    callerNumber: {
      color: theme.colors.textMuted,
      fontSize: 19,
      fontWeight: '500',
      textAlign: 'center',
      marginBottom: 8,
    },
    identitySkeleton: {
      alignItems: 'center',
      marginTop: 10,
      marginBottom: 10,
      gap: 10,
    },
    identitySkeletonName: {
      width: 148,
      height: 42,
      borderRadius: 12,
      backgroundColor: withOpacity(theme.colors.text, mode === 'dark' ? 0.16 : 0.11),
    },
    identitySkeletonNumber: {
      width: 190,
      height: 24,
      borderRadius: 10,
      backgroundColor: withOpacity(theme.colors.text, mode === 'dark' ? 0.13 : 0.09),
    },
    timer: {
      color: withOpacity(theme.colors.accent, mode === 'dark' ? 0.8 : 0.74),
      fontSize: 14,
      fontWeight: '600',
    },
    audioRouteText: {
      color: withOpacity(theme.colors.textMuted, 0.92),
      fontSize: 13,
      fontWeight: '500',
      marginTop: 8,
    },
    middleBlock: {
      alignItems: 'center',
      marginTop: -10,
    },
    avatarZone: {
      width: 224,
      height: 224,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 34,
    },
    avatarPulseRing: {
      position: 'absolute',
      width: 224,
      height: 224,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.4),
    },
    avatarOuter: {
      width: 192,
      height: 192,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity('#101E38', mode === 'dark' ? 0.8 : 0.16),
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, mode === 'dark' ? 0.17 : 0.2),
    },
    avatarInner: {
      width: 166,
      height: 166,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity('#233251', mode === 'dark' ? 0.9 : 0.22),
    },
    avatarText: {
      color: withOpacity('#FFFFFF', 0.3),
      fontSize: 64,
      fontWeight: '700',
      letterSpacing: 1,
    },
    controlsGrid: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 32,
    },
    controlSlot: {
      width: 68,
      alignItems: 'center',
      gap: 8,
    },
    controlCircle: {
      width: 64,
      height: 64,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlCircleIdle: {
      backgroundColor: withOpacity('#39465F', mode === 'dark' ? 0.46 : 0.18),
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, mode === 'dark' ? 0.12 : 0.14),
    },
    controlCircleActive: {
      backgroundColor: withOpacity(theme.colors.accent, mode === 'dark' ? 0.2 : 0.16),
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, mode === 'dark' ? 0.55 : 0.36),
      shadowColor: theme.colors.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: mode === 'dark' ? 0.18 : 0.1,
      shadowRadius: 14,
    },
    controlCirclePressed: {
      transform: [{ scale: 0.95 }],
      opacity: 0.9,
    },
    controlIconIdle: {
      color: theme.colors.text,
    },
    controlIconActive: {
      color: theme.colors.accent,
    },
    controlLabel: {
      color: withOpacity(theme.colors.textMuted, 0.95),
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1,
    },
    endButton: {
      alignSelf: 'center',
      width: 80,
      height: 80,
      borderRadius: 999,
      backgroundColor: '#E11D48',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
      shadowColor: '#E11D48',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: mode === 'dark' ? 0.45 : 0.24,
      shadowRadius: 18,
      elevation: 10,
    },
    endButtonPressed: {
      transform: [{ scale: 0.95 }],
      opacity: 0.92,
    },
    endIcon: {
      transform: [{ rotate: '135deg' }],
    },
  });
