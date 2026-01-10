import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { RootStackParamList } from '../../navigation/types';

export default function OnboardingChoiceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'OnboardingChoice'>>();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.container, { paddingTop: Math.max(insets.top + 28, 32) }]} edges={[]}>
      <View style={styles.buttonGrid}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('OnboardingProfile')}
        >
          <Text style={styles.primaryText}>Create profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('OnboardingInviteCode')}
        >
          <Text style={styles.secondaryText}>Have an invite code?</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonGrid: {
    gap: 16,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#2d6df6',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  primaryText: {
    color: '#f5f7fb',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2d6df6',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  secondaryText: {
    color: '#2d6df6',
    fontSize: 18,
    fontWeight: '600',
  },
});
