import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';

import type { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { logEvent } from '../../services/sentry';

type StepId = 'connect' | 'trusted' | 'members' | 'review';

type DemoStep = {
  id: StepId;
  title: string;
  headline: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

const demoSteps: DemoStep[] = [
  {
    id: 'connect',
    title: 'Connect Your Phone',
    headline: 'Set forwarding once and Verity handles the rest.',
    description:
      'Unknown callers are screened first before they can interrupt your loved one.',
    icon: 'call-outline',
  },
  {
    id: 'trusted',
    title: 'Trusted Contacts',
    headline: 'People you trust get through instantly.',
    description:
      'Family, doctors, and verified contacts bypass screening and avoid delays.',
    icon: 'shield-checkmark-outline',
  },
  {
    id: 'members',
    title: 'Circle Members',
    headline: 'Keep caregivers and family in sync.',
    description:
      'Invited members can monitor activity and respond quickly when something looks off.',
    icon: 'people-outline',
  },
  {
    id: 'review',
    title: 'Family Review',
    headline: 'Review suspicious calls and act in one tap.',
    description:
      'Mark a call safe or fraud and keep future calls cleaner over time.',
    icon: 'warning-outline',
  },
];

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function MembershipExperienceScreen() {
  const navigation = useNavigation<
    NativeStackNavigationProp<RootStackParamList, 'MembershipExperience'>
  >();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeStep, setActiveStep] = useState<StepId>('connect');
  const [isFraudMarked, setIsFraudMarked] = useState(false);
  const [videoDurationMs, setVideoDurationMs] = useState(0);
  const [videoPositionMs, setVideoPositionMs] = useState(0);
  const [videoIsPlaying, setVideoIsPlaying] = useState(false);
  const [videoIsMuted, setVideoIsMuted] = useState(false);
  const [videoDidFinish, setVideoDidFinish] = useState(false);
  const [videoIsLoaded, setVideoIsLoaded] = useState(false);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const demoOpacity = useRef(new Animated.Value(1)).current;
  const fraudScale = useRef(new Animated.Value(1)).current;
  const videoSkeletonOpacity = useRef(new Animated.Value(0.55)).current;
  const videoRef = useRef<Video | null>(null);

  const currentStep = demoSteps.find((step) => step.id === activeStep) ?? demoSteps[0];
  const progressRatio =
    videoDurationMs > 0 ? Math.min(1, Math.max(0, videoPositionMs / videoDurationMs)) : 0;
  const videoTotalLabel = videoDurationMs > 0 ? formatDuration(videoDurationMs) : '--:--';

  const selectStep = (stepId: StepId) => {
    if (stepId === activeStep) {
      return;
    }

    void Haptics.selectionAsync().catch(() => null);
    Animated.timing(demoOpacity, {
      toValue: 0.2,
      duration: 110,
      useNativeDriver: true,
    }).start(() => {
      setActiveStep(stepId);
      if (stepId !== 'review') {
        setIsFraudMarked(false);
      }
      Animated.timing(demoOpacity, {
        toValue: 1,
        duration: 170,
        useNativeDriver: true,
      }).start();
    });
  };

  const markFraud = () => {
    if (isFraudMarked) {
      return;
    }
    setIsFraudMarked(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
    Animated.sequence([
      Animated.timing(fraudScale, {
        toValue: 0.96,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(fraudScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 8,
      }),
    ]).start();
  };

  const handleVideoStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setVideoIsLoaded(false);
      setVideoIsPlaying(false);
      return;
    }
    setVideoIsLoaded(true);
    const durationMillis = status.durationMillis ?? 0;
    const positionMillis = status.positionMillis ?? 0;
    setVideoDurationMs(durationMillis);
    setVideoPositionMs(positionMillis);
    setVideoIsPlaying(status.isPlaying);
    const reachedEnd = durationMillis > 0 && durationMillis - positionMillis <= 250;
    setVideoDidFinish(Boolean(status.didJustFinish) || (reachedEnd && !status.isPlaying));
  };

  const toggleVideoPlayback = async () => {
    if (!videoRef.current || !videoIsLoaded) {
      return;
    }
    void Haptics.selectionAsync().catch(() => null);
    try {
      if (videoDidFinish) {
        await videoRef.current.setPositionAsync(0);
      }
      if (videoIsPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
    } catch {
      // Best effort controls.
    }
  };

  const toggleVideoMute = async () => {
    if (!videoRef.current || !videoIsLoaded) {
      return;
    }
    void Haptics.selectionAsync().catch(() => null);
    const nextMuted = !videoIsMuted;
    setVideoIsMuted(nextMuted);
    try {
      await videoRef.current.setIsMutedAsync(nextMuted);
    } catch {
      // Keep local UI state even if platform call fails.
    }
  };

  const restartVideo = async () => {
    if (!videoRef.current || !videoIsLoaded) {
      return;
    }
    void Haptics.selectionAsync().catch(() => null);
    try {
      await videoRef.current.setPositionAsync(0);
      await videoRef.current.playAsync();
    } catch {
      // Best effort controls.
    }
  };

  const seekToRatio = async (ratio: number) => {
    if (!videoRef.current || !videoIsLoaded || videoDurationMs <= 0) {
      return;
    }
    const boundedRatio = Math.min(1, Math.max(0, ratio));
    const targetMs = Math.floor(videoDurationMs * boundedRatio);
    try {
      await videoRef.current.setPositionAsync(targetMs);
      setVideoPositionMs(targetMs);
    } catch {
      // Best effort controls.
    }
  };

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(videoSkeletonOpacity, {
          toValue: 0.9,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(videoSkeletonOpacity, {
          toValue: 0.55,
          duration: 850,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [videoSkeletonOpacity]);

  useEffect(() => {
    return () => {
      if (!videoRef.current) {
        return;
      }
      videoRef.current.unloadAsync().catch(() => null);
    };
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => null);
            navigation.goBack();
          }}
        >
          <Ionicons name="chevron-back" size={17} color={theme.colors.text} style={styles.backIcon} />
        </Pressable>
        <Text style={styles.headerTitle}>How Verity Works</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introWrap}>
          <Text style={styles.introTitle}>A quick interactive walkthrough</Text>
          <Text style={styles.introCopy}>
            Explore the exact flow your family uses to screen calls, flag risk, and stay protected.
          </Text>
        </View>

        <View style={styles.videoCard}>
          <View style={styles.videoHeaderRow}>
            <Text style={styles.videoTitle}>Watch Verity in action</Text>
            <Text style={styles.videoDurationLabel}>
              {formatDuration(videoPositionMs)} / {videoTotalLabel}
            </Text>
          </View>
          <View style={styles.videoFrame}>
            <Video
              ref={videoRef}
              source={require('../../../assets/videos/lowrescomp_mobile.mp4')}
              style={styles.video}
              resizeMode={ResizeMode.COVER}
              isMuted={videoIsMuted}
              shouldPlay={false}
              isLooping={false}
              useNativeControls={false}
              progressUpdateIntervalMillis={250}
              onPlaybackStatusUpdate={handleVideoStatusUpdate}
            />
            {!videoIsPlaying ? (
              <Pressable
                style={styles.videoPlayOverlay}
                onPress={() => {
                  void toggleVideoPlayback();
                }}
              >
                <View style={styles.videoPlayBadge}>
                  <Ionicons
                    name={videoDidFinish ? 'refresh' : 'play'}
                    size={18}
                    color="#FFFFFF"
                  />
                </View>
                <Text style={styles.videoPlayOverlayText}>
                  {videoDidFinish ? 'Replay video' : 'Play video'}
                </Text>
              </Pressable>
            ) : null}
            {!videoIsLoaded ? (
              <Animated.View style={[styles.videoLoadingOverlay, { opacity: videoSkeletonOpacity }]}>
                <View style={styles.videoLoadingShimmerTop} />
                <View style={styles.videoLoadingShimmerBottom} />
                <Text style={styles.videoLoadingText}>Loading video…</Text>
              </Animated.View>
            ) : null}
          </View>
          <View style={styles.videoControlsWrap}>
            <Pressable style={styles.videoControlButton} onPress={() => void toggleVideoPlayback()}>
              <Ionicons
                name={videoIsPlaying ? 'pause' : videoDidFinish ? 'refresh' : 'play'}
                size={14}
                color={theme.colors.text}
              />
              <Text style={styles.videoControlText}>
                {videoIsPlaying ? 'Pause' : videoDidFinish ? 'Replay' : 'Play'}
              </Text>
            </Pressable>
            <Pressable style={styles.videoControlButton} onPress={() => void toggleVideoMute()}>
              <Ionicons
                name={videoIsMuted ? 'volume-mute' : 'volume-high'}
                size={14}
                color={theme.colors.text}
              />
              <Text style={styles.videoControlText}>{videoIsMuted ? 'Unmute' : 'Mute'}</Text>
            </Pressable>
            <Pressable style={styles.videoControlButton} onPress={() => void restartVideo()}>
              <Ionicons name="play-skip-back" size={14} color={theme.colors.text} />
              <Text style={styles.videoControlText}>Restart</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.videoProgressTrack}
            onLayout={(event) => setProgressTrackWidth(event.nativeEvent.layout.width)}
            onPress={(event) => {
              if (progressTrackWidth <= 0) {
                return;
              }
              const ratio = event.nativeEvent.locationX / progressTrackWidth;
              void seekToRatio(ratio);
            }}
          >
            <View style={[styles.videoProgressFill, { width: `${progressRatio * 100}%` }]} />
          </Pressable>
        </View>

        <View style={styles.stepsWrap}>
          {demoSteps.map((step, index) => {
            const isActive = step.id === activeStep;
            return (
              <Pressable
                key={step.id}
                style={[styles.stepChip, isActive && styles.stepChipActive]}
                onPress={() => selectStep(step.id)}
              >
                <View style={[styles.stepIndex, isActive && styles.stepIndexActive]}>
                  <Text style={[styles.stepIndexText, isActive && styles.stepIndexTextActive]}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{step.title}</Text>
              </Pressable>
            );
          })}
        </View>

        <Animated.View style={[styles.demoCard, { opacity: demoOpacity }]}>
          {activeStep === 'connect' ? (
            <View style={styles.connectPreviewWrap}>
              <View style={styles.connectNodesRow}>
                <View style={styles.connectNode}>
                  <Ionicons name="phone-portrait-outline" size={16} color={theme.colors.textMuted} />
                  <Text style={styles.connectNodeLabel}>Your phone</Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color={theme.colors.textMuted} />
                <View style={styles.connectNode}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.accent} />
                  <Text style={styles.connectNodeLabel}>Verity #</Text>
                </View>
              </View>
              <View style={styles.connectForwardingCard}>
                <View>
                  <Text style={styles.connectForwardingTitle}>Call Forwarding</Text>
                  <Text style={styles.connectForwardingCaption}>Enabled</Text>
                </View>
                <View style={styles.connectToggleTrack}>
                  <View style={styles.connectToggleDot} />
                </View>
              </View>
            </View>
          ) : null}

          {activeStep === 'trusted' ? (
            <View style={styles.trustedPreviewWrap}>
              <View style={styles.trustedActionsRow}>
                <View style={styles.trustedActionPill}>
                  <Ionicons name="person-add-outline" size={12} color={theme.colors.accent} />
                  <Text style={styles.trustedActionText}>Import</Text>
                </View>
                <View style={styles.trustedActionPill}>
                  <Ionicons name="sync-outline" size={12} color={theme.colors.accent} />
                  <Text style={styles.trustedActionText}>Sync</Text>
                </View>
              </View>
              <Text style={styles.trustedSectionLabel}>Manual Entry</Text>
              {[
                { name: 'Dr. Stuart', relationship: 'Doctor' },
                { name: 'Amanda', relationship: 'Grandchild' },
                { name: 'Chase', relationship: 'Friend' },
              ].map((contact) => (
                <View key={contact.name} style={styles.trustedRow}>
                  <View style={styles.trustedNameWrap}>
                    <View style={styles.trustedAvatar}>
                      <Text style={styles.trustedAvatarText}>{contact.name.charAt(0)}</Text>
                    </View>
                    <View style={styles.trustedNameTextWrap}>
                      <Text style={styles.trustedNameText}>{contact.name}</Text>
                      <Text style={styles.trustedRelationshipText}>{contact.relationship}</Text>
                    </View>
                  </View>
                  <Text style={styles.trustedManageText}>Manage</Text>
                </View>
              ))}
            </View>
          ) : null}

          {activeStep === 'members' ? (
            <View style={styles.membersPreviewWrap}>
              <Text style={styles.memberSectionLabel}>Active Members</Text>
              {[
                { name: 'Sarah (You)', role: 'Owner', badge: 'You' },
                { name: 'David', role: 'Caretaker', badge: 'Admin' },
              ].map((member) => (
                <View key={member.name} style={styles.memberRow}>
                  <View>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberRoleSubtext}>{member.role}</Text>
                  </View>
                  <View style={styles.memberRoleBadge}>
                    <Text style={styles.memberRoleText}>{member.badge}</Text>
                  </View>
                </View>
              ))}
              <View style={styles.memberInviteButton}>
                <Text style={styles.memberInviteButtonText}>Create Invite</Text>
              </View>
              <View style={styles.memberPendingCard}>
                <Text style={styles.memberPendingLabel}>Pending Invites</Text>
                <Text style={styles.memberPendingCode}>46DC-2VDM</Text>
              </View>
            </View>
          ) : null}

          {activeStep === 'review' ? (
            <View style={styles.reviewPreviewWrap}>
              <View style={styles.reviewCriticalCard}>
                <View style={styles.reviewCriticalIconWrap}>
                  <Ionicons name="warning" size={13} color={theme.colors.danger} />
                </View>
                <View style={styles.reviewCriticalTextWrap}>
                  <Text style={styles.reviewCriticalTitle}>Critical Detected</Text>
                  <Text style={styles.reviewCriticalTime}>11:55 AM</Text>
                </View>
                <View style={styles.reviewCriticalScore}>
                  <Text style={styles.reviewCriticalScoreText}>100%</Text>
                </View>
              </View>
              <View style={styles.reviewAlertCard}>
                <Text style={styles.reviewAlertTitle}>Unknown Caller</Text>
                <Text style={styles.reviewAlertNumber}>+1 (609) 444-7419</Text>
                <Text style={styles.reviewSnippet}>
                  \"Your account was locked. Tell me the number we texted you to unlock it.\"
                </Text>
              </View>
              <View style={styles.reviewActionsRow}>
                <View style={styles.reviewSafeButton}>
                  <Text style={styles.reviewSafeButtonText}>Mark Safe</Text>
                </View>
                <Animated.View style={{ flex: 1, transform: [{ scale: fraudScale }] }}>
                  <Pressable
                    onPress={markFraud}
                    style={[styles.reviewFraudButton, isFraudMarked && styles.reviewFraudButtonMarked]}
                  >
                    <Text
                      style={[
                        styles.reviewFraudButtonText,
                        isFraudMarked && styles.reviewFraudButtonTextMarked,
                      ]}
                    >
                      {isFraudMarked ? 'Marked Fraud' : 'Mark Fraud'}
                    </Text>
                  </Pressable>
                </Animated.View>
              </View>
            </View>
          ) : null}
        </Animated.View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryIconWrap}>
            <Ionicons name={currentStep.icon} size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.summaryTextWrap}>
            <Text style={styles.summaryHeadline}>{currentStep.headline}</Text>
            <Text style={styles.summaryDescription}>{currentStep.description}</Text>
          </View>
        </View>

        <Pressable
          style={styles.whyChooseButton}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
            logEvent('membership_why_choose_opened', {
              screen: 'MembershipExperienceScreen',
            });
            navigation.navigate('WhyChooseVerity');
          }}
        >
          <Text style={styles.whyChooseButtonText}>Why choose Verity</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.accent} />
        </Pressable>

        <Pressable
          style={styles.backToPlansButton}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
            navigation.goBack();
          }}
        >
          <Text style={styles.backToPlansText}>Back to plans</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    headerRow: {
      paddingHorizontal: 24,
      paddingTop: 14,
      paddingBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    backIcon: {
      marginTop: -1,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    headerSpacer: {
      width: 34,
      height: 34,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 24,
      gap: 18,
    },
    introWrap: {
      gap: 8,
    },
    introTitle: {
      fontSize: 26,
      fontWeight: '700',
      color: theme.colors.text,
      lineHeight: 30,
      letterSpacing: -0.3,
    },
    introCopy: {
      fontSize: 15,
      lineHeight: 21,
      color: theme.colors.textMuted,
    },
    videoCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 10,
    },
    videoHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    videoTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    videoDurationLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    videoFrame: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.border, 0.9),
      backgroundColor: withOpacity(theme.colors.text, 0.05),
      aspectRatio: 16 / 9,
      position: 'relative',
    },
    video: {
      width: '100%',
      height: '100%',
    },
    videoPlayOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: withOpacity(theme.colors.text, 0.26),
    },
    videoPlayBadge: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.9),
      borderWidth: 1,
      borderColor: withOpacity('#FFFFFF', 0.35),
    },
    videoPlayOverlayText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    videoLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'space-between',
      padding: 14,
      backgroundColor: withOpacity(theme.colors.surfaceAlt, 0.9),
    },
    videoLoadingShimmerTop: {
      height: 14,
      width: '48%',
      borderRadius: 7,
      backgroundColor: withOpacity(theme.colors.textMuted, 0.22),
    },
    videoLoadingShimmerBottom: {
      height: 14,
      width: '34%',
      borderRadius: 7,
      backgroundColor: withOpacity(theme.colors.textMuted, 0.22),
      alignSelf: 'flex-end',
    },
    videoLoadingText: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: '46%',
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    videoControlsWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    videoControlButton: {
      flex: 1,
      minHeight: 34,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.border, 0.9),
      backgroundColor: withOpacity(theme.colors.surfaceAlt, 0.75),
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: 8,
    },
    videoControlText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.text,
    },
    videoProgressTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: withOpacity(theme.colors.textMuted, 0.25),
      overflow: 'hidden',
    },
    videoProgressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
      minWidth: 0,
    },
    stepsWrap: {
      gap: 9,
    },
    stepChip: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 11,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    stepChipActive: {
      borderColor: withOpacity(theme.colors.accent, 0.75),
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
    },
    stepIndex: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.textMuted, 0.18),
    },
    stepIndexActive: {
      backgroundColor: withOpacity(theme.colors.accent, 0.24),
    },
    stepIndexText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    stepIndexTextActive: {
      color: theme.colors.accent,
    },
    stepLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textMuted,
      flex: 1,
    },
    stepLabelActive: {
      color: theme.colors.text,
    },
    demoCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 14,
      minHeight: 198,
      justifyContent: 'center',
    },
    connectPreviewWrap: {
      gap: 12,
    },
    connectNodesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    connectNode: {
      width: '42%',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: withOpacity(theme.colors.surfaceAlt, 0.75),
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      gap: 4,
    },
    connectNodeLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    connectForwardingCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    connectForwardingTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text,
    },
    connectForwardingCaption: {
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 1,
    },
    connectToggleTrack: {
      width: 42,
      height: 24,
      borderRadius: 12,
      backgroundColor: withOpacity(theme.colors.accent, 0.35),
      justifyContent: 'center',
      paddingHorizontal: 3,
      alignItems: 'flex-end',
    },
    connectToggleDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.colors.accent,
    },
    trustedPreviewWrap: {
      gap: 8,
    },
    trustedActionsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 2,
    },
    trustedActionPill: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.35),
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
      paddingHorizontal: 8,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    trustedActionText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    trustedSectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      color: theme.colors.textMuted,
      marginBottom: 2,
    },
    trustedRow: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    trustedNameWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    trustedAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.15),
    },
    trustedAvatarText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    trustedNameTextWrap: {
      gap: 1,
    },
    trustedNameText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
    },
    trustedRelationshipText: {
      fontSize: 11,
      color: theme.colors.textMuted,
    },
    trustedManageText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    membersPreviewWrap: {
      gap: 8,
    },
    memberSectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      color: theme.colors.textMuted,
      marginBottom: 2,
    },
    memberRow: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    memberName: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
    },
    memberRoleSubtext: {
      fontSize: 11,
      color: theme.colors.textMuted,
      marginTop: 1,
    },
    memberRoleBadge: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.35),
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    memberRoleText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.accent,
      textTransform: 'uppercase',
    },
    memberInviteButton: {
      marginTop: 2,
      borderRadius: 12,
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
    },
    memberInviteButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    memberPendingCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 2,
    },
    memberPendingLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    memberPendingCode: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text,
      letterSpacing: 0.3,
    },
    reviewPreviewWrap: {
      gap: 8,
      justifyContent: 'center',
    },
    reviewCriticalCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.danger, 0.22),
      backgroundColor: withOpacity(theme.colors.danger, 0.1),
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    reviewCriticalIconWrap: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.danger, 0.14),
    },
    reviewCriticalTextWrap: {
      flex: 1,
      gap: 1,
    },
    reviewCriticalTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text,
    },
    reviewCriticalTime: {
      fontSize: 11,
      color: theme.colors.textMuted,
    },
    reviewCriticalScore: {
      borderRadius: 10,
      backgroundColor: withOpacity(theme.colors.danger, 0.22),
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    reviewCriticalScoreText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.danger,
    },
    reviewAlertCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 12,
      gap: 4,
    },
    reviewAlertTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text,
    },
    reviewAlertNumber: {
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    reviewSnippet: {
      marginTop: 4,
      fontSize: 12,
      color: theme.colors.textMuted,
      lineHeight: 17,
    },
    reviewActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    reviewSafeButton: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
    },
    reviewSafeButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textMuted,
    },
    reviewFraudButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.danger, 0.38),
      backgroundColor: withOpacity(theme.colors.danger, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
    },
    reviewFraudButtonMarked: {
      backgroundColor: withOpacity(theme.colors.danger, 0.26),
      borderColor: withOpacity(theme.colors.danger, 0.52),
    },
    reviewFraudButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.danger,
    },
    reviewFraudButtonTextMarked: {
      color: theme.colors.text,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
    },
    summaryIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
      marginTop: 1,
    },
    summaryTextWrap: {
      flex: 1,
      gap: 2,
    },
    summaryHeadline: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
      lineHeight: 18,
    },
    summaryDescription: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textMuted,
    },
    whyChooseButton: {
      marginTop: 2,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.4),
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      paddingVertical: 12,
    },
    whyChooseButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    backToPlansButton: {
      marginTop: 2,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
    },
    backToPlansText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
