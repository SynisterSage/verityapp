import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

import { useTheme } from '../../context/ThemeContext';

type ActionFooterProps = {
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  secondaryIcon?: ReactNode;
  helperPrefix?: string;
  helperActionLabel?: string;
  onHelperPress?: () => void;
  style?: ViewStyle;
};

export default function ActionFooter({
  primaryLabel,
  onPrimaryPress,
  primaryLoading,
  secondaryLabel,
  onSecondaryPress,
  secondaryIcon,
  helperPrefix,
  helperActionLabel,
  onHelperPress,
  style,
}: ActionFooterProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: theme.colors.surface,
          shadowColor: theme.colors.border,
        },
        theme.shadows.card,
        style,
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          {
            backgroundColor: theme.colors.accent,
            transform: [{ scale: pressed ? 0.98 : 1 }],
            ...theme.shadows.bottomAction,
          },
        ]}
        onPress={onPrimaryPress}
      >
        <Text style={[styles.primaryButtonText, { fontFamily: theme.typography.fontFamily }]}>
          {primaryLoading ? 'Working…' : primaryLabel}
        </Text>
      </Pressable>

      {secondaryLabel && onSecondaryPress ? (
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          onPress={onSecondaryPress}
        >
          {secondaryIcon ? <View style={styles.secondaryIcon}>{secondaryIcon}</View> : null}
          <Text
            style={[
              styles.secondaryButtonText,
              { fontFamily: theme.typography.fontFamily, color: theme.colors.text },
            ]}
          >
            {secondaryLabel}
          </Text>
        </Pressable>
      ) : null}

      {helperPrefix && helperActionLabel && onHelperPress ? (
        <View style={styles.helperRow}>
          <Text
            style={[
              styles.helperText,
              { color: theme.colors.textMuted, fontFamily: theme.typography.fontFamily },
            ]}
          >
            {helperPrefix}
          </Text>
          <TouchableOpacity onPress={onHelperPress}>
            <Text
              style={[
                styles.helperLink,
                { color: theme.colors.accent, fontFamily: theme.typography.fontFamily },
              ]}
            >
              {helperActionLabel}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    borderRadius: 28,
    paddingVertical: 24,
    paddingHorizontal: 32,
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: -12 },
    shadowRadius: 40,
    elevation: 16,
    alignSelf: 'stretch',
    width: '100%',
    paddingBottom: 32,
    transform: [{ translateY: 95 }],
  },
  primaryButton: {
    height: 60,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 12,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  helperRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  helperText: {
    fontSize: 14,
    marginRight: 4,
  },
  helperLink: {
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryIcon: {
    marginRight: 8,
  },
});
