import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av/build/Audio.types';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import ActionFooter from '../../components/onboarding/ActionFooter';
import * as Haptics from 'expo-haptics';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';

import { supabase } from '../../services/supabase';
import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import { emitCallUpdated } from '../../utils/callEvents';
import { getRiskStyles } from '../../utils/risk';
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';

type FraudNotes = {
  safePhraseMatches?: string[];
};

type CallRow = {
  id: string;
  profile_id: string | null;
  created_at: string;
  transcript: string | null;
  fraud_score: number | null;
  fraud_risk_level: string | null;
  fraud_keywords: string[] | null;
  fraud_notes: FraudNotes | null;
  caller_number: string | null;
  feedback_status?: string | null;
  caller_hash?: string | null;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

const AnimatedText = Animated.createAnimatedComponent(Text);

type KeywordMatch = {
  start: number;
  end: number;
  text: string;
  type: 'fraud' | 'safe';
};

type TranscriptSegment = {
  text: string;
  type: 'fraud' | 'safe' | null;
};

function collectMatches(text: string, keywords: string[], type: KeywordMatch['type']) {
  const cleanKeywords = Array.from(new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)));
  const matches: KeywordMatch[] = [];
  for (const keyword of cleanKeywords) {
    const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type,
      });
    }
  }
  return matches;
}

function highlightTranscript(text: string, fraudKeywords: string[], safeKeywords: string[]) {
  if (!text) {
    return [{ text, type: null }];
  }
  const matches = [
    ...collectMatches(text, fraudKeywords, 'fraud'),
    ...collectMatches(text, safeKeywords, 'safe'),
  ];
  if (matches.length === 0) {
    return [{ text, type: null }];
  }
  matches.sort((a, b) => (a.start === b.start ? b.end - a.end : a.start - b.start));
  const segments: TranscriptSegment[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (match.start < lastIndex) {
      continue;
    }
    if (match.start > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.start),
        type: null,
      });
    }
    segments.push({
      text: text.slice(match.start, match.end),
      type: match.type,
    });
    lastIndex = match.end;
  }
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      type: null,
    });
  }
  return segments;
}

const formatDateLabel = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatTimeLabel = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export default function CallDetailScreen({
  route,
}: {
  route: { params: { callId: string; compact?: boolean } };
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { callId, compact } = route.params;
  const isCompactModal = compact ?? false;
  const { activeProfile, canManageProfile } = useProfile();
  const { theme, mode } = useTheme();
  const [callRow, setCallRow] = useState<CallRow | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isMarkingSafe, setIsMarkingSafe] = useState(false);
  const [isMarkingFraud, setIsMarkingFraud] = useState(false);
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const riskBarAnim = useRef(new Animated.Value(0)).current;
  const transcriptAnim = useRef(new Animated.Value(0)).current;
  const [audioModeConfigured, setAudioModeConfigured] = useState(false);
  const styles = useMemo(() => createCallDetailStyles(theme), [theme]);

  const fetchRecordingLink = useCallback(async () => {
    const urlData = await authorizedFetch(`/calls/${callId}/recording-url`);
    const url = urlData?.url ?? null;
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {
        // ignore
      }
      soundRef.current = null;
      setIsPlaying(false);
    }
    setRecordingUrl(url);
    setRecordingStatus(url ? 'ready' : 'error');
    return url;
  }, [callId]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('calls')
        .select(
          'id, profile_id, created_at, transcript, fraud_score, fraud_risk_level, fraud_keywords, fraud_notes, caller_number, feedback_status, caller_hash'
        )
        .eq('id', callId)
        .single();
      setCallRow(data ?? null);
      setRecordingStatus('loading');
      try {
        await fetchRecordingLink();
      } catch (err) {
        console.warn('Failed to prefetch recording URL', err);
        setRecordingStatus('error');
      }
    };
    load();
  }, [callId, fetchRecordingLink]);

  useEffect(() => {
    if (!audioModeConfigured) {
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      }).catch((error) => {
        console.warn('Failed to configure audio mode', error);
      });
      setAudioModeConfigured(true);
    }
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const playOrPause = async () => {
    let url = recordingUrl;
    if (!url) {
      setRecordingStatus('loading');
      try {
        url = await fetchRecordingLink();
      } catch (err) {
        setRecordingStatus('error');
        Alert.alert('Recording', 'No recording URL available yet. Try again in a moment.');
        return;
      }
      if (!url) {
        Alert.alert('Recording', 'No recording URL available yet. Try again in a moment.');
        return;
      }
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
          { uri: url },
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
      await fetchRecordingLink();
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
    const isSafe = status === 'marked_safe';
    if (isSafe) {
      setIsMarkingSafe(true);
    } else {
      setIsMarkingFraud(true);
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
    finally {
      if (isSafe) {
        setIsMarkingSafe(false);
      } else {
        setIsMarkingFraud(false);
      }
    }
  };

  const handleMarkFraud = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    markFeedback('marked_fraud');
  };

  const handleMarkSafe = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    markFeedback('marked_safe');
  };

  const handleBackPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.goBack();
  };

  const handleRecordingPress = () => {
    Haptics.selectionAsync();
    if (recordingStatus === 'error') {
      retryUrl();
    } else {
      playOrPause();
    }
  };

  const safePhraseMatches = useMemo(() => {
    if (!callRow?.fraud_notes?.safePhraseMatches) {
      return [];
    }
    return callRow.fraud_notes.safePhraseMatches.filter(Boolean);
  }, [callRow?.fraud_notes]);
  const isSafeCall = callRow?.fraud_score === 0;
  const highlightedTranscript = useMemo(
    () =>
      callRow
        ? highlightTranscript(
            callRow.transcript ?? '',
            callRow.fraud_keywords ?? [],
            safePhraseMatches
          )
        : [],
    [callRow?.transcript, callRow?.fraud_keywords, safePhraseMatches]
  );
  const fraudRiskStyle = useMemo(
    () => getRiskStyles(callRow?.fraud_risk_level ?? 'unknown'),
    [callRow?.fraud_risk_level]
  );
  const safeRiskStyle = useMemo(() => getRiskStyles('low'), []);
  const safeButtonStyle = useMemo(
    () => ({
      accent: theme.colors.success,
      background: withOpacity(theme.colors.success, 0.14),
    }),
    [theme.colors.success]
  );
  const fraudButtonStyle = useMemo(() => getRiskStyles('critical'), []);
  const fraudHighlightColor = useMemo(
    () => withOpacity(fraudRiskStyle.accent, 0.35),
    [fraudRiskStyle.accent]
  );
  const safeHighlightColor = useMemo(
    () => withOpacity(safeRiskStyle.accent, 0.3),
    [safeRiskStyle.accent]
  );
  useEffect(() => {
    if (!callRow) {
      return;
    }
    highlightAnim.setValue(0);
    riskBarAnim.setValue(0);
    transcriptAnim.setValue(0);
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
    Animated.timing(transcriptAnim, {
      toValue: 1,
      duration: 550,
      delay: 50,
      useNativeDriver: true,
    }).start();
  }, [callRow, highlightAnim, riskBarAnim, transcriptAnim]);
  const riskBarWidth = riskBarAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });
  const highlightBackground = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0, 0, 0, 0)', fraudHighlightColor],
  });
  const safeHighlightBackground = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0, 0, 0, 0)', safeHighlightColor],
  });
  const transcriptAnimationStyle = useMemo(
    () => ({
      opacity: transcriptAnim,
      transform: [
        {
          translateY: transcriptAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [12, 0],
          }),
        },
      ],
    }),
    [transcriptAnim]
  );
  const riskStyles = useMemo(
    () => getRiskStyles(callRow?.fraud_risk_level ?? 'unknown'),
    [callRow?.fraud_risk_level]
  );
  const riskAccent = riskStyles.accent;
  const intelligenceTitle = useMemo(() => {
    const score = callRow?.fraud_score ?? 0;
    if (score <= 10) {
      return { title: 'Call verified', subtitle: 'Automatic screening, no concerns' };
    }
    if (score <= 35) {
      return { title: 'Low risk', subtitle: 'Proceed with caution, monitor patterns' };
    }
    if (score <= 70) {
      return { title: 'Elevated risk', subtitle: 'Behaviors resemble known scams' };
    }
    return { title: 'Fraud detected', subtitle: 'High probability of malicious intent' };
  }, [callRow?.fraud_score]);

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
  const contentPaddingBottom = Math.max(insets.bottom + 88, 240);
  const heroNumber = callRow?.caller_number
    ? formatPhoneNumber(callRow.caller_number, 'Unknown caller')
    : 'Unknown caller';
  const heroDate = formatDateLabel(callRow?.created_at);
  const heroTime = formatTimeLabel(callRow?.created_at);
  const heroMeta = [heroDate, heroTime].filter(Boolean).join(' • ');
  const riskScoreDisplay =
    callRow?.fraud_score != null ? `${Math.round(callRow.fraud_score)}%` : '—';
  const riskLevelLabel = (callRow?.fraud_risk_level ?? 'Unknown').toUpperCase();
  const keywordTags = callRow?.fraud_keywords?.slice(0, 4) ?? [];
  const recordingLabel =
    recordingStatus === 'ready' ? 'Ready' : recordingStatus === 'loading' ? 'Loading' : 'Unavailable';
  const playDisabled = recordingStatus === 'error' || recordingStatus === 'loading';
  const footerDisabledSafe = callRow.feedback_status === 'marked_safe';
  const footerDisabledFraud = callRow.feedback_status === 'marked_fraud';
  const disabledButtonBackground = withOpacity(theme.colors.text, 0.05);
  const disabledButtonText = theme.colors.textMuted;
  const primaryBackgroundColor = footerDisabledFraud
    ? disabledButtonBackground
    : fraudButtonStyle.background;
  const primaryTextColor = footerDisabledFraud ? disabledButtonText : fraudButtonStyle.accent;
  const secondaryBackgroundColor = footerDisabledSafe
    ? disabledButtonBackground
    : safeButtonStyle.background;
  const secondaryTextColor = footerDisabledSafe ? disabledButtonText : safeButtonStyle.accent;

  return (
    <SafeAreaView style={[styles.container, { paddingTop: containerPaddingTop }]} edges={[]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Call Details</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroBlock}>
          <Text style={styles.heroNumber}>{heroNumber}</Text>
          {heroMeta ? (
            <View style={styles.heroMeta}>
              <Ionicons name="time-outline" size={12} color={theme.colors.textMuted} />
              <Text style={styles.heroMetaText}>{heroMeta}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Transcript</Text>
          <View style={styles.card}>
            <Animated.View style={[styles.cardContent, transcriptAnimationStyle]}>
              {callRow?.transcript ? (
                <Text style={styles.cardBody}>
                  {highlightedTranscript.map((segment, index) =>
                    segment.type ? (
                      <AnimatedText
                        key={`segment-${index}`}
                        style={[
                          styles.cardBody,
                          segment.type === 'fraud' && styles.keywordHighlight,
                          segment.type === 'safe' && styles.safeKeywordHighlight,
                          segment.type === 'fraud'
                            ? {
                                backgroundColor: highlightBackground,
                                color: fraudRiskStyle.accent,
                              }
                            : {
                                backgroundColor: safeHighlightBackground,
                                color: safeRiskStyle.accent,
                              },
                        ]}
                      >
                        {segment.text}
                      </AnimatedText>
                  ) : (
                    <Text key={`segment-${index}`} style={styles.cardBody}>
                      {segment.text}
                    </Text>
                  )
                )}
              </Text>
            ) : (
              <Text style={styles.cardBody}>No transcript available.</Text>
            )}
            </Animated.View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Intelligence</Text>
          <View style={[styles.card, styles.intelCard]}>
            <View style={styles.cardContent}>
              <View style={styles.intelHeader}>
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: withOpacity(riskAccent, 0.25) },
                  ]}
                > 
                  <Ionicons name="shield-checkmark-outline" size={22} color={riskAccent} />
                </View>
                <View style={styles.intelText}>
                  <Text style={styles.intelTitle}>{intelligenceTitle.title}</Text>
                  <Text style={styles.intelSubtitle}>{intelligenceTitle.subtitle}</Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    {
                      borderColor: withOpacity(riskAccent, 0.5),
                      backgroundColor: withOpacity(riskAccent, 0.16),
                    },
                  ]}
                > 
                  <Text
                    style={[
                      styles.badgeText,
                      { color: riskAccent },
                    ]}
                  >
                    {riskLevelLabel}
                  </Text>
                </View>
              </View>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Risk score</Text>
                <Text style={[styles.scoreNumber, { color: riskAccent }]}>{riskScoreDisplay}</Text>
              </View>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: riskBarWidth,
                      backgroundColor: riskAccent,
                      shadowColor: riskAccent,
                      shadowOffset: { width: 0, height: 0 },
                      shadowRadius: riskScoreDisplay === '100%' ? 12 : 0,
                      shadowOpacity: riskScoreDisplay === '100%' ? 0.45 : 0,
                    },
                  ]}
                />
              </View>
              <View style={styles.keywordRow}>
                {keywordTags.length === 0 ? (
                  <Text style={styles.keywordFallback}>No keywords detected.</Text>
                ) : (
                  keywordTags.map((keyword) => (
                    <View key={keyword} style={styles.keywordPill}>
                      <Text style={styles.keywordText}>{keyword}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Recording</Text>
          <View style={styles.card}>
            <View style={styles.cardContent}>
              <View style={styles.recordingHeader}>
                  <View style={[styles.iconBox, { backgroundColor: withOpacity(theme.colors.accent, 0.2) }]}> 
                  <Ionicons name="pulse-outline" size={20} color={theme.colors.accent} />
                </View>
                <View style={styles.intelText}>
                  <Text style={[styles.recordingTitle, { color: mode === 'light' ? theme.colors.surface : theme.colors.text }]}>
                    Call capture
                  </Text>
                </View>
                <View style={[styles.recordingBadge, recordingStatus === 'ready' && styles.recordingBadgeReady]}>
                  <Text style={[styles.badgeText, styles.recordingBadgeText]}>{recordingLabel}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.playButton,
                  isPlaying ? styles.playButtonActive : styles.playButtonIdle,
                  playDisabled && styles.playButtonDisabled,
                ]}
                onPress={handleRecordingPress}
                disabled={isLoadingAudio || recordingStatus === 'loading'}
              >
                {isLoadingAudio || recordingStatus === 'loading' ? (
                  <ActivityIndicator color={theme.colors.text} />
                ) : (
                  <Text style={styles.playButtonText}>
                    {isPlaying ? 'Playing…' : 'Listen to message'}
                  </Text>
                )}
              </TouchableOpacity>
              {recordingStatus === 'error' && (
                <Text style={styles.hint}>Recording link not ready yet. Tap retry.</Text>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
      {canManageProfile && (
      <ActionFooter
        primaryLabel={footerDisabledFraud ? 'Marked fraud' : 'Mark fraud'}
        onPrimaryPress={handleMarkFraud}
        primaryDisabled={footerDisabledFraud}
        primaryLoading={isMarkingFraud}
        primaryIcon={<Ionicons name="ban-outline" size={20} color={primaryTextColor} />}
        primaryBackgroundColor={primaryBackgroundColor}
        primaryTextColor={primaryTextColor}
        secondaryLabel={footerDisabledSafe ? 'Marked safe' : 'Mark safe'}
        onSecondaryPress={handleMarkSafe}
        secondaryIcon={
          <Ionicons name="checkmark-circle-outline" size={20} color={secondaryTextColor} />
        }
        secondaryBackgroundColor={secondaryBackgroundColor}
        secondaryTextColor={secondaryTextColor}
        secondaryDisabled={footerDisabledSafe}
        secondaryLoading={isMarkingSafe}
      />
    )}
    </SafeAreaView>
  );
}

const createCallDetailStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    header: {
      paddingHorizontal: 24,
      paddingTop: 0,
      paddingBottom: 22,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.1),
    },
    headerTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    headerContent: {
      flex: 1,
    },
    heroNumber: {
      color: theme.colors.text,
      fontSize: 26,
      fontWeight: '600',
    },
    heroMeta: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    heroMetaText: {
      color: theme.colors.textMuted,
      marginLeft: 6,
      letterSpacing: 0.1,
      fontSize: 12,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    heroBlock: {
      paddingTop: 12,
      paddingBottom: 18,
    },
    section: {
      marginBottom: 24,
    },
    sectionLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    card: {
      position: 'relative',
      backgroundColor: theme.colors.surface,
      borderRadius: 32,
      padding: 24,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.08),
      overflow: 'hidden',
    },
    intelCard: {
      borderColor: withOpacity(theme.colors.text, 0.08),
    },
    cardContent: {
      marginLeft: 0,
    },
    cardBody: {
      color: theme.colors.text,
      fontSize: 17,
      lineHeight: 26,
    },
    keywordHighlight: {
      fontWeight: '700',
    },
    safeKeywordHighlight: {
      fontWeight: '700',
    },
    intelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    iconBox: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      backgroundColor: theme.colors.surfaceAlt,
    },
    intelText: {
      flex: 1,
    },
    intelTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    intelSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      letterSpacing: 0.2,
    },
    badge: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderColor: withOpacity(theme.colors.text, 0.12),
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text,
    },
    recordingBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: theme.colors.surface,
    },
    recordingBadgeReady: {
      backgroundColor: withOpacity(theme.colors.text, 0.08),
    },
    recordingBadgeText: {
      color: theme.colors.accent,
    },
    scoreRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    scoreLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    scoreNumber: {
      color: theme.colors.danger,
      fontSize: 28,
      fontWeight: '700',
    },
    progressTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
      overflow: 'hidden',
      marginBottom: 12,
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
    },
    keywordRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    keywordPill: {
      backgroundColor: withOpacity(theme.colors.text, 0.08),
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 14,
      marginRight: 8,
      marginBottom: 8,
    },
    keywordText: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    keywordFallback: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    recordingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    recordingTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '600',
    },
    playButton: {
      height: 52,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playButtonIdle: {
      backgroundColor: theme.colors.accent,
    },
    playButtonActive: {
      backgroundColor: withOpacity(theme.colors.accent, 0.35),
    },
    playButtonDisabled: {
      opacity: 0.6,
    },
    playButtonText: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    hint: {
      color: theme.colors.textMuted,
      marginTop: 10,
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
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.12),
      gap: 8,
    },
    skeletonTitle: {
      height: 16,
      width: '50%',
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.2),
    },
    skeletonLineWide: {
      height: 14,
      width: '70%',
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.2),
    },
    skeletonLineFull: {
      height: 12,
      width: '100%',
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.12),
    },
    skeletonLineMedium: {
      height: 12,
      width: '60%',
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.12),
    },
    skeletonLineShort: {
      height: 12,
      width: '35%',
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.12),
    },
  });
