import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type StatTileProps = {
  label: string;
  value: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export default function StatTile({ label, value, caption, icon, onPress }: StatTileProps) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={18} color="#8ab4ff" />
        </View>
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.caption}>{caption}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#202c3c',
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: '#1b2634',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  label: {
    color: '#f5f7fb',
    fontWeight: '600',
    fontSize: 16,
    flex: 1,
    flexWrap: 'wrap',
  },
  value: {
    color: '#f5f7fb',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  caption: {
    color: '#8aa0c6',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 4,
  },
});
