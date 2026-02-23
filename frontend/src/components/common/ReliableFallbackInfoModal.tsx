import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';

type ReliableFallbackInfoModalProps = {
  visible: boolean;
  onClose: () => void;
  theme: AppTheme;
  mode?: 'light' | 'dark' | string;
};

export default function ReliableFallbackInfoModal({
  visible,
  onClose,
  theme,
  mode,
}: ReliableFallbackInfoModalProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <BlurView intensity={65} tint={mode === 'dark' ? 'dark' : 'light'} style={styles.blur} />
        </Pressable>
        <View style={styles.card}>
          <Text style={styles.title}>Reliable fallback number</Text>
          <Text style={styles.body}>
            Verity always tries your in-app call first. This number is only used as a last resort.
          </Text>
          <View style={styles.row}>
            <Ionicons name="call-outline" size={17} color={theme.colors.accent} />
            <Text style={styles.rowText}>If the app cannot connect, Verity dials this fallback number.</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="warning-outline" size={17} color={theme.colors.warning ?? theme.colors.textMuted} />
            <Text style={styles.rowText}>Use a direct number that does not forward back to your Verity line.</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="checkmark-circle-outline" size={17} color={theme.colors.success} />
            <Text style={styles.rowText}>If this field is empty, Verity does not run a fallback phone dial.</Text>
          </View>
          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 28,
      backgroundColor: withOpacity(theme.colors.text, 0.42),
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    blur: {
      ...StyleSheet.absoluteFillObject,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 18,
      paddingVertical: 18,
      gap: 10,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.border, 0.7),
      backgroundColor: withOpacity(theme.colors.surface, 0.55),
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    rowText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.text,
    },
    button: {
      height: 44,
      marginTop: 2,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
    },
    buttonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
