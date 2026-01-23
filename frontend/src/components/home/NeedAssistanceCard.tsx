import { Pressable, StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../context/ThemeContext';

type Props = {
  onPress?: () => void;
};

export default function NeedAssistanceCard({ onPress }: Props) {
  const { theme } = useTheme();
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    onPress?.();
  };
  return (
    <Pressable
      onPress={handlePress}
      android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: 'rgba(255,255,255,0.05)',
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={[styles.iconWrapper, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.colors.textMuted} />
      </View>
      <Text style={[styles.title, { color: theme.colors.text }]}>Need Assistance?</Text>
      <Text style={[styles.body, { color: theme.colors.textMuted }]}>Our support team is here for you</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
  },
});
