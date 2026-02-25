import React, { ReactNode } from 'react';
import {
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../context/ThemeContext';

type ActionFooterProps = {
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  primaryIcon?: ReactNode;
  primaryBackgroundColor?: string;
  primaryTextColor?: string;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  secondaryIcon?: ReactNode;
  secondaryBackgroundColor?: string;
  secondaryTextColor?: string;
  secondaryTextStyle?: TextStyle;
  secondaryDisabled?: boolean;
  secondaryLoading?: boolean;
  tertiaryLabel?: string;
  onTertiaryPress?: () => void;
  tertiaryIcon?: ReactNode;
  tertiaryBackgroundColor?: string;
  tertiaryTextColor?: string;
  tertiaryDisabled?: boolean;
  tertiaryLoading?: boolean;
  helperPrefix?: string;
  helperActionLabel?: string;
  onHelperPress?: () => void;
  style?: ViewStyle;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export default function ActionFooter({
  primaryLabel,
  onPrimaryPress,
  primaryLoading,
  primaryDisabled,
  primaryIcon,
  primaryBackgroundColor,
  primaryTextColor,
  secondaryLabel,
  onSecondaryPress,
  secondaryIcon,
  secondaryBackgroundColor,
  secondaryTextColor,
  secondaryTextStyle,
  secondaryDisabled,
  secondaryLoading,
  tertiaryLabel,
  onTertiaryPress,
  tertiaryIcon,
  tertiaryBackgroundColor,
  tertiaryTextColor,
  tertiaryDisabled,
  tertiaryLoading,
  helperPrefix,
  helperActionLabel,
  onHelperPress,
  style,
  onLayout,
}: ActionFooterProps) {
  const { theme } = useTheme();
  const colors = theme.colors as { surfaceAlt?: string; surface: string; border: string };
  const insets = useSafeAreaInsets();
  const defaultPrimaryTextColor = '#FFFFFF';

  return (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: colors.surfaceAlt ?? colors.surface,
          shadowColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 24) + 8,
        },
        theme.shadows.card,
        style,
      ]}
      onLayout={onLayout}
    >
      {primaryLabel ? (
        <TouchableOpacity
          activeOpacity={primaryLoading ? 1 : 0.85}
        style={[
          styles.primaryButton,
          {
            backgroundColor: primaryBackgroundColor ?? theme.colors.accent,
            opacity: primaryDisabled || primaryLoading ? 0.5 : 1,
          },
        ]}
        onPress={onPrimaryPress}
        disabled={primaryDisabled || primaryLoading}
      >
        {primaryIcon ? <View style={styles.primaryIcon}>{primaryIcon}</View> : null}
        <Text
          style={[
            styles.primaryButtonText,
            {
              fontFamily: theme.typography.fontFamily,
            color: primaryTextColor ?? defaultPrimaryTextColor,
            },
          ]}
        >
          {primaryLoading ? 'Working…' : primaryLabel}
        </Text>
        </TouchableOpacity>
      ) : null}

      {secondaryLabel && onSecondaryPress ? (
        tertiaryLabel && onTertiaryPress ? (
          <View style={styles.secondaryRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.secondaryButton,
                styles.secondaryButtonHalf,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: secondaryBackgroundColor ?? theme.colors.surfaceAlt,
                  opacity: secondaryDisabled || secondaryLoading ? 0.5 : 1,
                },
              ]}
              onPress={onSecondaryPress}
              disabled={secondaryDisabled || secondaryLoading}
            >
              {secondaryIcon ? <View style={styles.secondaryIcon}>{secondaryIcon}</View> : null}
              <Text
                numberOfLines={1}
                style={[
                  styles.secondaryButtonText,
                  secondaryTextStyle,
                  {
                    fontFamily: theme.typography.fontFamily,
                    color: secondaryTextColor ?? theme.colors.text,
                  },
                ]}
              >
                {secondaryLoading ? 'Working…' : secondaryLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.secondaryButton,
                styles.secondaryButtonHalf,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: tertiaryBackgroundColor ?? theme.colors.surfaceAlt,
                  opacity: tertiaryDisabled || tertiaryLoading ? 0.5 : 1,
                },
              ]}
              onPress={onTertiaryPress}
              disabled={tertiaryDisabled || tertiaryLoading}
            >
              {tertiaryIcon ? <View style={styles.secondaryIcon}>{tertiaryIcon}</View> : null}
              <Text
                numberOfLines={1}
                style={[
                  styles.secondaryButtonText,
                  {
                    fontFamily: theme.typography.fontFamily,
                    color: tertiaryTextColor ?? theme.colors.text,
                  },
                ]}
              >
                {tertiaryLoading ? 'Working…' : tertiaryLabel}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.secondaryButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: secondaryBackgroundColor ?? theme.colors.surfaceAlt,
                opacity: secondaryDisabled || secondaryLoading ? 0.5 : 1,
              },
            ]}
            onPress={onSecondaryPress}
            disabled={secondaryDisabled || secondaryLoading}
          >
            {secondaryIcon ? <View style={styles.secondaryIcon}>{secondaryIcon}</View> : null}
            <Text
              numberOfLines={1}
              style={[
                styles.secondaryButtonText,
                secondaryTextStyle,
                {
                  fontFamily: theme.typography.fontFamily,
                  color: secondaryTextColor ?? theme.colors.text,
                },
              ]}
            >
              {secondaryLoading ? 'Working…' : secondaryLabel}
            </Text>
          </TouchableOpacity>
        )
      ) : null}

      {!secondaryLabel && tertiaryLabel && onTertiaryPress ? (
        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.secondaryButton,
            {
              borderColor: theme.colors.border,
              backgroundColor: tertiaryBackgroundColor ?? theme.colors.surfaceAlt,
              opacity: tertiaryDisabled || tertiaryLoading ? 0.5 : 1,
            },
          ]}
          onPress={onTertiaryPress}
          disabled={tertiaryDisabled || tertiaryLoading}
        >
          {tertiaryIcon ? <View style={styles.secondaryIcon}>{tertiaryIcon}</View> : null}
          <Text
            numberOfLines={1}
            style={[
              styles.secondaryButtonText,
              {
                fontFamily: theme.typography.fontFamily,
                color: tertiaryTextColor ?? theme.colors.text,
              },
            ]}
          >
            {tertiaryLoading ? 'Working…' : tertiaryLabel}
          </Text>
        </TouchableOpacity>
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    minHeight: 120,
    paddingVertical: 24,
    paddingHorizontal: 32,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: -12 },
    shadowRadius: 40,
    elevation: 20,
    alignSelf: 'stretch',
    paddingBottom: 32,
  },
  primaryButton: {
    height: 64,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
  },
  primaryIcon: {
    marginRight: 8,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 64,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 12,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  secondaryButtonHalf: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
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
    marginRight: 6,
  },
  customFooter: {
    marginTop: 12,
    alignItems: 'center',
  },
});
