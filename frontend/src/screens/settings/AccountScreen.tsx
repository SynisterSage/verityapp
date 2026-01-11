import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { authorizedFetch } from '../../services/backend';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';

export default function AccountScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { activeProfile, setActiveProfile, canManageProfile, refreshProfiles } = useProfile();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeProfile) return;
    setFirstName(activeProfile.first_name ?? '');
    setLastName(activeProfile.last_name ?? '');
    setPhoneNumber(activeProfile.phone_number ?? '');
  }, [activeProfile]);

  const isReadOnly = !canManageProfile;

  const hasChanges = useMemo(() => {
    if (!activeProfile) return false;
    return (
      firstName.trim() !== (activeProfile.first_name ?? '') ||
      lastName.trim() !== (activeProfile.last_name ?? '') ||
      phoneNumber.trim() !== (activeProfile.phone_number ?? '')
    );
  }, [activeProfile, firstName, lastName, phoneNumber]);

  const profileId = activeProfile?.id;

  const fetchProfile = useCallback(async () => {
    if (!profileId) {
      return;
    }
    try {
      const data = await authorizedFetch(`/profiles/${profileId}`);
      if (data?.profile) {
        setActiveProfile(data.profile);
      }
    } catch (err) {
      console.error('Failed to refresh profile', err);
    }
  }, [profileId, setActiveProfile]);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [fetchProfile])
  );

  const saveProfile = async () => {
    if (!activeProfile) return;
    if (!canManageProfile) {
      setError('Only caretakers can update profile details.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    setError('');
    Keyboard.dismiss();
    setIsSaving(true);
    try {
      const data = await authorizedFetch(`/profiles/${activeProfile.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: phoneNumber.trim() || null,
        }),
      });
      if (data?.profile) {
        setActiveProfile(data.profile);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!activeProfile) return;
    Alert.alert(
      'Delete profile?',
      'This will delete all calls, alerts, and settings for this profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Everything will be lost. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete profile',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await authorizedFetch(`/profiles/${activeProfile.id}`, {
                        method: 'DELETE',
                      });
                      await refreshProfiles();
                      await signOut();
                    } catch (err: any) {
                      setError(err?.message || 'Failed to delete profile.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const createdAt = activeProfile?.created_at
    ? new Date(activeProfile.created_at).toLocaleDateString()
    : '—';
  const twilioNumber = activeProfile?.twilio_virtual_number ?? 'Not connected';
  const twilioStatus = activeProfile?.twilio_virtual_number ? 'Connected' : 'Missing';

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.content}
      >
        <Text style={styles.sectionTitle}>Profile basics</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>First name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor="#8aa0c6"
              editable={canManageProfile}
              selectTextOnFocus={canManageProfile}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Last name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor="#8aa0c6"
              editable={canManageProfile}
              selectTextOnFocus={canManageProfile}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Recipient phone</Text>
            <TextInput
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+1 555 555 1234"
              placeholderTextColor="#8aa0c6"
              keyboardType="phone-pad"
              editable={canManageProfile}
              selectTextOnFocus={canManageProfile}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Created</Text>
            <Text style={styles.readonlyText}>{createdAt}</Text>
          </View>
          {!canManageProfile && (
            <Text style={styles.hint}>Only caretakers or admins can update this profile.</Text>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.saveButton, (!hasChanges || isSaving) && styles.saveDisabled]}
            onPress={saveProfile}
            disabled={!hasChanges || isSaving || isReadOnly}
          >
            <Text style={styles.saveText}>{isSaving ? 'Saving…' : 'Save changes'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>SafeCall number</Text>
        <View style={styles.card}>
          <View style={styles.numberRow}>
            <View>
              <Text style={styles.label}>Twilio number</Text>
              <Text style={styles.readonlyText}>{twilioNumber}</Text>
            </View>
            <View
              style={[
                styles.statusPill,
                twilioStatus === 'Connected' ? styles.statusOn : styles.statusOff,
              ]}
            >
              <Text style={styles.statusText}>{twilioStatus}</Text>
            </View>
          </View>
        </View>

      {canManageProfile && (
        <>
          <Text style={styles.sectionTitle}>Account actions</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.actionRow} onPress={confirmDelete}>
              <Text style={[styles.actionText, styles.destructive]}>Delete profile</Text>
              <Ionicons name="trash-outline" size={18} color="#ff9c9c" />
            </TouchableOpacity>
          </View>
        </>
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 0,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121a26',
    borderWidth: 1,
    borderColor: '#1f2a3a',
  },
  headerTitle: {
    color: '#f5f7fb',
    fontSize: 28,
    fontWeight: '700',
    marginLeft: 12,
  },
  content: {
    flex: 1,
    gap: 18,
    paddingBottom: 24,
  },
  sectionTitle: {
    color: '#98a7c2',
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    padding: 16,
    gap: 12,
  },
  fieldRow: {
    gap: 6,
  },
  label: {
    color: '#8aa0c6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#243247',
    borderRadius: 12,
    padding: 12,
    color: '#e6ebf5',
  },
  readonlyText: {
    color: '#e6ebf5',
    fontSize: 16,
  },
  saveButton: {
    marginTop: 6,
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  hint: {
    color: '#9fb0c9',
    fontSize: 12,
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
  },
  numberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusOn: {
    backgroundColor: '#1e2f4d',
    borderColor: '#2d6df6',
  },
  statusOff: {
    backgroundColor: '#1a1f2a',
    borderColor: '#3b4455',
  },
  statusText: {
    color: '#e6ebf5',
    fontSize: 11,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  actionText: {
    color: '#e4ebf7',
    fontSize: 15,
    fontWeight: '600',
  },
  destructive: {
    color: '#ff9c9c',
  },
});
