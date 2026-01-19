import { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type DashboardHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export default function DashboardHeader({ title, subtitle, right}: DashboardHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.textStack}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  textStack: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f5f7fb',
    marginBottom: 2,
  },
  subtitle: {
    color: '#8aa0c6',
    fontSize: 15,
    marginTop: 2,
    marginBottom: 4,
  },
  right: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  spacer: {
    width: 40,
    height: 40,
  },
});
