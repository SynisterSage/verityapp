import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Audio, AVPlaybackStatusSuccess } from 'expo-av';

import { supabase } from '../../services/supabase';
import { authorizedFetch } from '../../services/backend';

type CallRow = {
  id: string;
  created_at: string;
  transcript: string | null;
  fraud_score: number | null;
  fraud_risk_level: string | null;
  fraud_keywords: string[] | null;
};

export default function CallDetailScreen({ route }: { route: any }) {
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
        .select('id, created_at, transcript, fraud_score, fraud_risk_level, fraud_keywords')
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
      Alert.alert('Saved', `Marked as ${status.replace('_', ' ')}`);
    } catch (err) {
      Alert.alert('Error', 'Failed to save feedback');
    }
  };

  if (!callRow) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Call Detail</Text>
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
        <TouchableOpacity style={styles.secondaryButton} onPress={() => markFeedback('marked_safe')}>
          <Text style={styles.secondaryText}>Mark Safe</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerButton} onPress={() => markFeedback('marked_fraud')}>
          <Text style={styles.secondaryText}>Mark Fraud</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  content: {
    padding: 24,
  },
  title: {
    color: '#f5f7fb',
    fontSize: 22,
    fontWeight: '700',
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
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dangerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#553a3a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#d2daea',
  },
  loading: {
    color: '#8aa0c6',
    padding: 24,
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
