import { useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';

type LiveFeatureTopic = 'tracking' | 'widgets' | 'siri';

type LiveFeatureCard = {
  key: LiveFeatureTopic;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  cta: string;
};

type LiveFeatureModalContent = {
  title: string;
  subtitle: string;
  steps: string[];
  actionLabel?: string;
};

const FEATURE_CARDS: LiveFeatureCard[] = [
  {
    key: 'tracking',
    title: 'Live call tracking',
    description: 'See active calls on your Lock Screen.',
    icon: 'radio-outline',
    cta: 'Enable',
  },
  {
    key: 'widgets',
    title: 'Home Screen widgets',
    description: 'See alert counts at a glance.',
    icon: 'grid-outline',
    cta: 'How to add',
  },
  {
    key: 'siri',
    title: 'Siri shortcuts',
    description: 'Open alerts by voice.',
    icon: 'mic-outline',
    cta: 'Try phrases',
  },
];

const FEATURE_MODAL_CONTENT: Record<LiveFeatureTopic, LiveFeatureModalContent> = {
  tracking: {
    title: 'Live Call Tracking',
    subtitle: 'Keep active calls visible on your Lock Screen while a call is in progress.',
    steps: [
      'Open iPhone Settings, then tap Verity Protect.',
      'Turn on Live Activities for Verity Protect.',
      'When a trusted call connects, the live card appears automatically.',
    ],
    actionLabel: 'Open settings',
  },
  widgets: {
    title: 'Add Home Screen Widgets',
    subtitle: 'Use widgets to quickly check Needs Attention and History counts.',
    steps: [
      'Touch and hold your Home Screen, then tap + in the top corner.',
      'Search for Verity Protect and pick a widget size.',
      'Tap Add Widget, then Done.',
    ],
  },
  siri: {
    title: 'Try Siri Shortcuts',
    subtitle: 'Ask Siri to jump directly to alerts views.',
    steps: [
      '“Show alerts in Verity Protect.”',
      '“Show needs attention in Verity Protect.”',
      '“Show history in Verity Protect.”',
    ],
  },
};

export default function LiveFeaturesSection({
  style,
  showTitle = true,
}: {
  style?: StyleProp<ViewStyle>;
  showTitle?: boolean;
}) {
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createLiveFeaturesStyles(theme, mode), [theme, mode]);
  const [activeTopic, setActiveTopic] = useState<LiveFeatureTopic | null>(null);

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      setActiveTopic('tracking');
    }
  };

  const handleCardPress = (topic: LiveFeatureTopic) => {
    if (topic === 'tracking') {
      void openSettings();
      return;
    }
    setActiveTopic(topic);
  };

  const modalContent = activeTopic ? FEATURE_MODAL_CONTENT[activeTopic] : null;

  return (
    <View style={[styles.section, style]}>
      {showTitle ? <Text style={styles.sectionTitle}>Live features</Text> : null}
      {FEATURE_CARDS.map((card) => (
        <View key={card.key} style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name={card.icon} size={20} color={theme.colors.accent} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.rowTitle}>{card.title}</Text>
            <Text style={styles.rowSubtitle}>{card.description}</Text>
          </View>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => handleCardPress(card.key)}
            activeOpacity={0.9}
          >
            <Text style={styles.ctaText}>{card.cta}</Text>
          </TouchableOpacity>
        </View>
      ))}

      <Modal
        visible={Boolean(modalContent)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveTopic(null)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setActiveTopic(null)}>
            <View style={styles.modalBackdrop}>
              <LinearGradient
                colors={
                  mode === 'dark'
                    ? ['rgba(39, 128, 255, 0.10)', 'rgba(2, 10, 22, 0.84)']
                    : ['rgba(39, 128, 255, 0.06)', 'rgba(8, 24, 46, 0.34)']
                }
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.modalBackdropGradient}
              />
            </View>
          </TouchableWithoutFeedback>
          {modalContent ? (
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modalContent.title}</Text>
                <Pressable onPress={() => setActiveTopic(null)} style={styles.modalClose}>
                  <Ionicons name="close" size={18} color={theme.colors.text} />
                </Pressable>
              </View>
              <Text style={styles.modalSubtitle}>{modalContent.subtitle}</Text>
              <View style={styles.modalSteps}>
                {modalContent.steps.map((step, index) => (
                  <View key={`${modalContent.title}-${index}`} style={styles.modalStepRow}>
                    <View style={styles.modalStepDot}>
                      <Text style={styles.modalStepDotText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.modalStepText}>{step}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={styles.modalPrimary}
                onPress={() => {
                  if (activeTopic === 'tracking') {
                    void openSettings();
                  }
                  setActiveTopic(null);
                }}
              >
                <Text style={styles.modalPrimaryText}>{modalContent.actionLabel ?? 'Done'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const createLiveFeaturesStyles = (theme: AppTheme, mode: 'light' | 'dark') =>
  StyleSheet.create({
    section: {
      gap: 12,
      marginTop: 2,
    },
    sectionTitle: {
      fontSize: 11,
      letterSpacing: 1.8,
      color: theme.colors.textMuted,
      fontWeight: '700',
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    row: {
      minHeight: 90,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
    },
    copy: {
      flex: 1,
      paddingRight: 10,
    },
    rowTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      textTransform: 'capitalize',
    },
    rowSubtitle: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    ctaButton: {
      borderRadius: 999,
      backgroundColor: withOpacity(theme.colors.accent, 0.15),
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.3),
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    ctaText: {
      color: theme.colors.accent,
      fontWeight: '700',
      fontSize: 12,
      letterSpacing: 0.2,
      textTransform: 'capitalize',
    },
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: mode === 'dark' ? 'rgba(2, 10, 22, 0.7)' : 'rgba(8, 24, 46, 0.2)',
    },
    modalBackdropGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    modalCard: {
      width: '100%',
      borderRadius: 28,
      padding: 22,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.08),
      backgroundColor: theme.colors.surface,
      gap: 10,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalTitle: {
      flex: 1,
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.text,
    },
    modalClose: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.text, 0.08),
    },
    modalSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 4,
    },
    modalSteps: {
      gap: 10,
      marginBottom: 10,
    },
    modalStepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    modalStepDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      backgroundColor: withOpacity(theme.colors.accent, 0.2),
    },
    modalStepDotText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    modalStepText: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
    modalPrimary: {
      borderRadius: 16,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      paddingHorizontal: 14,
    },
    modalPrimaryText: {
      color: theme.colors.surface,
      fontSize: 15,
      fontWeight: '700',
    },
  });
