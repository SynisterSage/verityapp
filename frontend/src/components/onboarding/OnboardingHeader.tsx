import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

type Props = {
  title: string;
};

export default function OnboardingHeader({ title }: Props) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 14) }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#0b111b',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: '#0b111b',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1f2a3a',
    backgroundColor: '#121a26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#f5f7fb',
    fontSize: 18,
    fontWeight: '600',
  },
  backButtonPlaceholder: {
    width: 36,
    height: 36,
  },
});
