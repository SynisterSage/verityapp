import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type HowItWorksItem = {
  icon: string;
  color: string;
  text: string;
};

type Props = {
  caption?: string;
  items: HowItWorksItem[];
};

export default function HowItWorksCard({ caption = 'HOW IT WORKS', items }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.caption}>{caption}</Text>
      {items.map((item) => (
        <View key={item.text} style={styles.row}>
          <View style={[styles.icon, { backgroundColor: `${item.color}20` }]}>
            <Ionicons name={item.icon as any} size={20} color={item.color} />
          </View>
          <Text style={styles.text}>{item.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#121a26',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 20,
    marginBottom: 20,
  },
  caption: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#8796b0',
    marginBottom: 12,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#e6ebf5',
    fontSize: 14,
    flex: 1,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
});
