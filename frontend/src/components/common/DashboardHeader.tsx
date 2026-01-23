import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type DashboardHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  align?: 'left' | 'center';
};

export default function DashboardHeader({ title, subtitle, right, align = 'left' }: DashboardHeaderProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <View style={[styles.textStack, align === 'center' ? styles.centerText : styles.alignLeft]}>
          <Text style={[styles.title, align === 'center' ? styles.titleCenter : styles.titleLeft]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, align === 'center' ? styles.subtitleCenter : styles.subtitleLeft]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : <View style={styles.spacer} />}
      </View>
      <LinearGradient
        colors={['#0f141d', '#0f141d', 'rgba(15,20,29,0)']}
        style={styles.gradient}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'visible',
    zIndex: 2,
  },
  gradient: {
    position: 'absolute',
    left: -24,
    right: -24,
    top: '60%',
    height: 60,
    zIndex: 1,
  },
  header: {
    zIndex: 3,
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
  centerText: {
    alignItems: 'center',
  },
  alignLeft: {
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f5f7fb',
    marginBottom: 2,
  },
  titleCenter: {
    textAlign: 'center',
  },
  titleLeft: {
    textAlign: 'left',
  },
  subtitle: {
    color: '#8aa0c6',
    fontSize: 15,
    marginTop: 2,
    marginBottom: 4,
  },
  subtitleCenter: {
    textAlign: 'center',
  },
  subtitleLeft: {
    textAlign: 'left',
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
