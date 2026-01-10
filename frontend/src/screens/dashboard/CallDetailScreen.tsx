import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { supabase } from '../../services/supabase';
import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { emitCallUpdated } from '../../utils/callEvents';
import { getRiskStyles } from '../../utils/risk';

type CallRow = {
  id: string;
  profile_id: string | null;
  created_at: string;
  transcript: string | null;
  fraud_score: number | null;
  fraud_risk_level: string | null;
  fraud_keywords: string[] | null;
  caller_number: string | null;
  feedback_status?: string | null;
  caller_hash?: string | null;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

const AnimatedText = Animated.createAnimatedComponent(Text);

function highlightTranscript(text: string, keywords: string[]) {
  if (!text) {
    return [{ text, highlight: false }];
  }
  const normalized = Array.from(
    new Set(
      keywords
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .map((keyword) => keyword)
    )
  );
  if (normalized.length === 0) {
    return [{ text, highlight: false }];
  }
  const sorted = normalized
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((keyword) => escapeRegExp(keyword));
  const pattern = new RegExp(`(${sorted.join('|')})`, 'gi');
  const segments: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        highlight: false,
      });
    }
    segments.push({
      text: match[0],
      highlight: true,
    });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      highlight: false,
    });
  }
  return segments;
}

export default function CallDetailScreen({
  route,
}: {
  route: { params: { callId: string; compact?: boolean } };
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { callId, compact } = route.params;
  const isCompactModal = compact ?? false;
  const { activeProfile } = useProfile();
  const [callRow, setCallRow] = useState<CallRow | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const riskBarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('calls')
        .select(
          'id, profile_id, created_at, transcript, fraud_score, fraud_risk_level, fraud_keywords, caller_number, feedback_status, caller_hash'
        )
        .eq('id', callId)
        .single();
      setCallRow(data ?? null);
      try {
        const urlData = await authorizedFetch(`/calls/${callId}/recording-url`); 
        setRecordingUrl(urlData?.url ?? null);
        setRecordingStatus(urlData?.url ? 'ready' : 'error');
      } catch (err) {
        console.warn('Failed to prefetch recording URL', err);
        setRecordingStatus('error');
      }
    };
    load();
  }, [callId]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const playOrPause = async () => {
    if (!recordingUrl) {
      Alert.alert('Recording', 'No recording URL available yet. Try again in a moment.');
      return;
    }
    try {
      const sound = soundRef.current;
      if (sound && isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
        return;
      }
      setIsLoadingAudio(true);
      let nextSound = sound;
      if (!nextSound) {
        const { sound: created } = await Audio.Sound.createAsync(
          { uri: recordingUrl },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setIsPlaying(status.isPlaying ?? false);
            if (status.didJustFinish) {
              setIsPlaying(false);
              if (soundRef.current) {
                soundRef.current.setPositionAsync(0);
              }
            }
          }
        );
        nextSound = created;
        soundRef.current = created;
      } else {
        const status = await nextSound.getStatusAsync();
        if (status.isLoaded) {
          const duration = status.durationMillis ?? Number.MAX_SAFE_INTEGER;
          if (status.positionMillis >= duration) {
            await nextSound.setPositionAsync(0);
          }
        }
        await nextSound.playAsync();
      }
      setIsLoadingAudio(false);
    } catch (err) {
      setIsLoadingAudio(false);
      Alert.alert('Playback error', 'Could not play the recording.');
    }
  };

  const retryUrl = async () => {
    setRecordingStatus('loading');
    try {
      const urlData = await authorizedFetch(`/calls/${callId}/recording-url`);
      setRecordingUrl(urlData?.url ?? null);
      setRecordingStatus(urlData?.url ? 'ready' : 'error');
    } catch (err) {
      setRecordingStatus('error');
      Alert.alert('Error', 'Failed to refresh recording link.');
    }
  };

  const checkCallerStatus = async () => {
    if (!callRow?.profile_id || !callRow.caller_number) {
      return null;
    }
    try {
      const data = await authorizedFetch(
        `/fraud/caller-status?profileId=${callRow.profile_id}&callerNumber=${encodeURIComponent(
          callRow.caller_number
        )}`
      );
      return data as { blocked?: boolean; trusted?: boolean };
    } catch {
      return null;
    }
  };

  const confirmOverride = (title: string, message: string) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(
        title,
        message,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue', onPress: () => resolve(true) },
        ],
        { cancelable: true }
      );
    });

  const shouldProceedWithMark = async (status: 'marked_safe' | 'marked_fraud') => {
    const statusMap = await checkCallerStatus();
    if (!statusMap) {
      return true;
    }
    if (status === 'marked_fraud' && statusMap.trusted) {
      return confirmOverride(
        'Block trusted number?',
        'This number is currently trusted. Blocking it will remove the trusted status. Continue?'
      );
    }
    if (status === 'marked_safe' && statusMap.blocked) {
      return confirmOverride(
        'Trust blocked number?',
        'This number is currently blocked. Trusting it will remove the block. Continue?'
      );
    }
    return true;
  };

  const markFeedback = async (status: 'marked_safe' | 'marked_fraud') => {
    const canProceed = await shouldProceedWithMark(status);
    if (!canProceed) {
      return;
    }
    try {
      await authorizedFetch(`/calls/${callId}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setCallRow((prev) => (prev ? { ...prev, feedback_status: status } : prev));
      const automationEnabled = activeProfile?.auto_mark_enabled === true;
      const automationBlockEnabled =
        automationEnabled && (activeProfile.auto_block_on_fraud ?? true);
      const automationTrustEnabled =
        automationEnabled && (activeProfile.auto_trust_on_safe ?? false);

      const profileId = callRow?.profile_id;
      const callerNumber = callRow?.caller_number;

      if (profileId && callerNumber) {
        if (status === 'marked_fraud' && automationBlockEnabled) {
          await authorizedFetch('/fraud/blocked-callers', {
            method: 'POST',
            body: JSON.stringify({
              profileId,
              callerNumber,
              reason: 'auto_mark_fraud',
            }),
          });
        }
        if (status === 'marked_safe' && automationTrustEnabled) {
          await authorizedFetch('/fraud/trusted-contacts', {
            method: 'POST',
            body: JSON.stringify({
              profileId,
              callerNumbers: [callerNumber],
              source: 'auto',
            }),
          });
        }
      }
      emitCallUpdated({ callId });
      Alert.alert('Saved', `Marked as ${status.replace('_', ' ')}`);
    } catch (err) {
      Alert.alert('Error', 'Failed to save feedback');
    }
  };

  const isSafeCall = callRow?.fraud_score === 0;
  const highlightedTranscript = useMemo(
    () =>
      callRow ? highlightTranscript(callRow.transcript ?? '', callRow.fraud_keywords ?? []) : [],
    [callRow?.transcript, callRow?.fraud_keywords]
  );
  const fraudRiskStyle = useMemo(
    () => getRiskStyles(callRow?.fraud_risk_level ?? 'unknown'),
    [callRow?.fraud_risk_level]
  );
  useEffect(() => {
    if (!callRow) {
      return;
    }
    highlightAnim.setValue(0);
    riskBarAnim.setValue(0);
    Animated.timing(highlightAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
    Animated.timing(riskBarAnim, {
      toValue: Math.min(100, Math.max(0, callRow.fraud_score ?? 0)),
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [callRow, highlightAnim, riskBarAnim]);
  const riskBarWidth = riskBarAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });
  const highlightBackground = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 182, 193, 0)', 'rgba(255, 182, 193, 0.28)'],
  });

  if (!callRow) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.skeletonWrapper}>
          <View style={styles.skeletonHeader}>
            <View style={styles.skeletonLineWide} />
            <View style={styles.skeletonLineShort} />
          </View>
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLineFull} />
            <View style={styles.skeletonLineShort} />
          </View>
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLineFull} />
            <View style={styles.skeletonLineMedium} />
          </View>
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLineFull} />
            <View style={styles.skeletonLineFull} />
            <View style={styles.skeletonLineShort} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const baseTopPadding = Math.max(16, insets.top + 4);
  const containerPaddingTop = isCompactModal ? Math.max(12, insets.top + 2) : baseTopPadding;
  const contentPaddingTop = isCompactModal ? 4 : 16;

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: containerPaddingTop }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Call Detail</Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: contentPaddingTop }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.caller}>{callRow.caller_number ?? 'Unknown caller'}</Text>
        <Text style={styles.meta}>{new Date(callRow.created_at).toLocaleString()}</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          {callRow.transcript ? (
          <Text style={styles.body}>
            {highlightedTranscript.map((segment, index) =>
              segment.highlight ? (
                <AnimatedText
                  key={`segment-${index}`}
                  style={[
                    styles.transcriptHighlightText,
                    { backgroundColor: highlightBackground },
                  ]}
                >
                  {segment.text}
                </AnimatedText>
              ) : (
                <Text key={`segment-${index}`}>{segment.text}</Text>
              )
            )}
          </Text>
          ) : (
            <Text style={styles.body}>No transcript</Text>
          )}
        </View>

        <View style={[styles.card, styles.fraudCard]}>
          <Text style={styles.sectionTitle}>Fraud</Text>
          <View style={styles.riskRow}>
            <Text style={[styles.scoreText, { color: fraudRiskStyle.text }]}>Score: {callRow.fraud_score ?? '—'}</Text>
            <View
              style={[
                styles.badge,
                {
                  borderColor: fraudRiskStyle.accent,
                  backgroundColor: fraudRiskStyle.background,
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: fraudRiskStyle.text }]}> 
                {callRow.fraud_risk_level?.toUpperCase() ?? 'UNKNOWN'}
              </Text>
            </View>
          </View>
          {isSafeCall ? (
            <>
              <Text style={styles.safeCaption}>Safe call</Text>
              <Text style={styles.safeNote}>No suspicious behavior detected.</Text>
              <View style={styles.safeBar} />
            </>
          ) : (
            <>
              <Text style={styles.body}>
                Keywords:{' '}
                {callRow.fraud_keywords && callRow.fraud_keywords.length > 0
                  ? callRow.fraud_keywords.join(', ')
                  : '—'}
              </Text>
              <View style={styles.riskBar}>
                <Animated.View
                  style={[
                    styles.riskFill,
                    {
                      width: riskBarWidth,
                      backgroundColor: fraudRiskStyle.accent,
                    },
                  ]}
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.recordingHeader}>
            <Text style={styles.sectionTitle}>Recording</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {recordingStatus === 'loading'
                  ? 'Loading'
                  : recordingStatus === 'error'
                  ? 'Unavailable'
                  : isPlaying
                  ? 'Playing'
                  : 'Ready'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.playButton, recordingStatus === 'error' && styles.playButtonError]}
            onPress={recordingStatus === 'error' ? retryUrl : playOrPause}
            disabled={isLoadingAudio || recordingStatus === 'loading'}
          >
            {isLoadingAudio || recordingStatus === 'loading' ? (
              <ActivityIndicator color="#f5f7fb" />
            ) : (
              <Text style={styles.playText}>
                {recordingStatus === 'error' ? 'Retry' : isPlaying ? 'Pause' : 'Play'}
              </Text>
            )}
          </TouchableOpacity>
          {recordingStatus === 'error' ? (
            <Text style={styles.hint}>Recording link not ready yet. Tap retry.</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              callRow.feedback_status === 'marked_safe' && styles.buttonDisabled,
            ]}
            onPress={() => markFeedback('marked_safe')}
            activeOpacity={0.85}
            disabled={callRow.feedback_status === 'marked_safe'}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#cfe0ff" />
            <Text style={styles.secondaryText}>
              {callRow.feedback_status === 'marked_safe' ? 'Marked Safe' : 'Mark Safe'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.dangerButton,
              callRow.feedback_status === 'marked_fraud' && styles.buttonDisabled,
            ]}
            onPress={() => markFeedback('marked_fraud')}
            activeOpacity={0.85}
            disabled={callRow.feedback_status === 'marked_fraud'}
          >
            <Ionicons name="warning-outline" size={18} color="#ffe3e3" />
            <Text style={styles.dangerText}>
              {callRow.feedback_status === 'marked_fraud' ? 'Marked Fraud' : 'Mark Fraud'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    marginBottom: 30,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121a26',
    borderWidth: 1,
    borderColor: '#1f2a3a',
  },
  headerTitle: {
    color: '#f5f7fb',
    fontSize: 28,
    fontWeight: '700',
    marginLeft: 12,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 120,
  },
  caller: {
    color: '#cbd6ea',
    marginTop: 4,
    fontSize: 15,
  },
  meta: {
    color: '#8aa0c6',
    marginTop: 6,
  },
  card: {
    marginTop: 16,
    backgroundColor: '#121a26',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
  },
  fraudCard: {
    borderColor: '#1f293a',
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  scoreText: {
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#f5f7fb',
    fontWeight: '600',
    marginBottom: 8,
  },
  body: {
    color: '#d2daea',
    lineHeight: 20,
  },
  transcriptHighlightText: {
    color: '#ffaeb2',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 0,
    lineHeight: 20,
    marginHorizontal: 0,
  },
  safeCaption: {
    color: '#8ab4ff',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  safeNote: {
    color: '#9fb0c9',
    fontSize: 12,
    marginBottom: 10,
  },
  recordingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  playButton: {
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  playButtonError: {
    backgroundColor: '#8c3b3b',
  },
  playText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  hint: {
    color: '#8aa0c6',
    marginTop: 10,
  },
  badge: {
    backgroundColor: '#20304a',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#8ab4ff',
    fontSize: 12,
  },
  actions: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2b3c57',
    backgroundColor: '#111b2b',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dangerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#553a3a',
    backgroundColor: '#3a1e22',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  riskBar: {
    marginTop: 12,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#1d2737',
    overflow: 'hidden',
  },
  riskFill: {
    height: '100%',
    borderRadius: 999,
  },
  safeBar: {
    height: 2,
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: '#1d2737',
  },
  secondaryText: {
    color: '#d7e3f7',
    fontWeight: '600',
  },
  dangerText: {
    color: '#ffe3e3',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  skeletonWrapper: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
  },
  skeletonHeader: {
    gap: 8,
  },
  skeletonCard: {
    backgroundColor: '#121a26',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    gap: 8,
  },
  skeletonTitle: {
    height: 16,
    width: '50%',
    borderRadius: 6,
    backgroundColor: '#20293a',
  },
  skeletonLineWide: {
    height: 14,
    width: '70%',
    borderRadius: 6,
    backgroundColor: '#20293a',
  },
  skeletonLineFull: {
    height: 12,
    width: '100%',
    borderRadius: 6,
    backgroundColor: '#152034',
  },
  skeletonLineMedium: {
    height: 12,
    width: '60%',
    borderRadius: 6,
    backgroundColor: '#152034',
  },
  skeletonLineShort: {
    height: 12,
    width: '35%',
    borderRadius: 6,
    backgroundColor: '#152034',
  },
});
