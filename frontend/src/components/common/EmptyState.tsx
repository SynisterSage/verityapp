import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  ctaLabel?: string;
  onPress?: () => void;
};

export default function EmptyState({ icon, title, body, ctaLabel, onPress }: EmptyStateProps) {
  return (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={20} color="#8ab4ff" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {ctaLabel && onPress ? (
        <TouchableOpacity style={styles.cta} onPress={onPress} activeOpacity={0.85}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0b111b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#1b2634',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    color: '#f5f7fb',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    color: '#8aa0c6',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  cta: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#1c2a43',
    borderWidth: 1,
    borderColor: '#263551',
  },
  ctaText: {
    color: '#d8e5ff',
    fontWeight: '600',
    fontSize: 12,
  },
});
