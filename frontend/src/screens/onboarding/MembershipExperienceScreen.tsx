import { useMemo, useRef, useState } from 'react';
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

import type { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';

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

export default function MembershipExperienceScreen() {
  const navigation = useNavigation<
    NativeStackNavigationProp<RootStackParamList, 'MembershipExperience'>
  >();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeStep, setActiveStep] = useState<StepId>('connect');
  const [isFraudMarked, setIsFraudMarked] = useState(false);
  const demoOpacity = useRef(new Animated.Value(1)).current;
  const fraudScale = useRef(new Animated.Value(1)).current;

  const currentStep = demoSteps.find((step) => step.id === activeStep) ?? demoSteps[0];

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
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>How Verity Works</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introWrap}>
          <Text style={styles.introTitle}>A quick interactive walkthrough</Text>
          <Text style={styles.introCopy}>
            Explore the exact flow your family uses to screen calls, flag risk, and stay protected.
          </Text>
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
              {['Mom', 'Dr. Stuart', 'Alex'].map((name) => (
                <View key={name} style={styles.trustedRow}>
                  <View style={styles.trustedNameWrap}>
                    <View style={styles.trustedAvatar}>
                      <Text style={styles.trustedAvatarText}>{name.charAt(0)}</Text>
                    </View>
                    <Text style={styles.trustedNameText}>{name}</Text>
                  </View>
                  <View style={styles.trustedBadge}>
                    <Text style={styles.trustedBadgeText}>Trusted</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {activeStep === 'members' ? (
            <View style={styles.membersPreviewWrap}>
              {[
                { name: 'Sarah (You)', role: 'Owner' },
                { name: 'David', role: 'Caretaker' },
                { name: 'Lex', role: 'Family' },
              ].map((member) => (
                <View key={member.name} style={styles.memberRow}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <View style={styles.memberRoleBadge}>
                    <Text style={styles.memberRoleText}>{member.role}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {activeStep === 'review' ? (
            <View style={styles.reviewPreviewWrap}>
              <View style={styles.reviewAlertCard}>
                <View style={styles.reviewAlertHeaderRow}>
                  <Text style={styles.reviewAlertLabel}>Fraud Alert</Text>
                  <Text style={styles.reviewAlertNow}>Now</Text>
                </View>
                <Text style={styles.reviewAlertTitle}>Unknown Caller</Text>
                <Text style={styles.reviewAlertNumber}>+1 (609) 444-7419</Text>
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
      paddingTop: 12,
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
      paddingTop: 20,
      gap: 16,
    },
    introWrap: {
      gap: 6,
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
      backgroundColor: withOpacity(theme.colors.accent, 0.1),
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
      gap: 10,
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
    trustedNameText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
    },
    trustedBadge: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.35),
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    trustedBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.accent,
      textTransform: 'uppercase',
    },
    membersPreviewWrap: {
      gap: 10,
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
    reviewPreviewWrap: {
      justifyContent: 'center',
    },
    reviewAlertCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 12,
      gap: 8,
    },
    reviewAlertHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    reviewAlertLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.danger,
      textTransform: 'uppercase',
    },
    reviewAlertNow: {
      fontSize: 11,
      color: theme.colors.textMuted,
    },
    reviewAlertTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    reviewAlertNumber: {
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    reviewActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
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
    backToPlansButton: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.45),
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
    },
    backToPlansText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.accent,
    },
  });
