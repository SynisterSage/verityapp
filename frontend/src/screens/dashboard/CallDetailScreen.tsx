import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio, AVPlaybackStatusSuccess } from 'expo-av';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { supabase } from '../../services/supabase';
import { authorizedFetch } from '../../services/backend';

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
};

export default function CallDetailScreen({ route }: { route: any }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { callId } = route.params;
  const [callRow, setCallRow] = useState<CallRow | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('calls')
        .select(
          'id, profile_id, created_at, transcript, fraud_score, fraud_risk_level, fraud_keywords, caller_number, feedback_status'
        )
        .eq('id', callId)
        .single();
      setCallRow(data ?? null);
      try {
        const urlData = await authorizedFetch(`/calls/${callId}/recording-url`);
        setRecordingUrl(urlData?.url ?? null);
        setRecordingStatus(urlData?.url ? 'ready' : 'error');
      } catch (err) {
        // If we can't load the URL, keep UI minimal and let user retry via alert
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

  const markFeedback = async (status: 'marked_safe' | 'marked_fraud') => {
    try {
      await authorizedFetch(`/calls/${callId}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setCallRow((prev) => (prev ? { ...prev, feedback_status: status } : prev));
      if (status === 'marked_fraud') {
        if (callRow?.profile_id && callRow?.caller_number) {
          await authorizedFetch('/fraud/blocked-callers', {
            method: 'POST',
            body: JSON.stringify({
              profileId: callRow.profile_id,
              callerNumber: callRow.caller_number,
              reason: 'marked_fraud',
            }),
          });
        }
      }
      Alert.alert('Saved', `Marked as ${status.replace('_', ' ')}`);
    } catch (err) {
      Alert.alert('Error', 'Failed to save feedback');
    }
  };

  if (!callRow) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.loading}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const topPadding = Math.max(16, insets.top + 4);

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: topPadding }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Call Detail</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.caller}>{callRow.caller_number ?? 'Unknown caller'}</Text>
        <Text style={styles.meta}>{new Date(callRow.created_at).toLocaleString()}</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Transcript</Text>
        <Text style={styles.body}>{callRow.transcript ?? 'No transcript'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Fraud</Text>
        <Text style={styles.body}>
          Score: {callRow.fraud_score ?? '—'} ({callRow.fraud_risk_level ?? 'unknown'})
        </Text>
        <Text style={styles.body}>
          Keywords: {callRow.fraud_keywords?.join(', ') ?? '—'}
        </Text>
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
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 8,
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
    paddingTop: 16,
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
  recordingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#f5f7fb',
    fontWeight: '600',
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
  loading: {
    color: '#8aa0c6',
    paddingHorizontal: 24,
    paddingTop: 16,
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
});
