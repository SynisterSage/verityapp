import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { SettingsStackParamList } from '../../navigation/types';

import * as Clipboard from 'expo-clipboard';

type MemberRole = 'admin' | 'editor' | 'viewer';

type Member = {
  id: string;
  user_id: string;
  role: MemberRole;
  is_caretaker?: boolean;
  user?: { email?: string; user_metadata?: { full_name?: string } } | null;
};

type Invite = {
  id: string;
  email: string;
  role: MemberRole;
  status: string;
};

export default function MembersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'Members'>>();
  const route = useRoute<RouteProp<SettingsStackParamList, 'Members'>>();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [inviteRole, setInviteRole] = useState<MemberRole>('viewer');
  const [inviteError, setInviteError] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const highlightInviteEntry = route.params?.highlightInviteEntry ?? false;

  const buildInviteLink = (inviteId: string) => `verityprotect://invite/${inviteId}`;
  const buildInviteMessage = (invite: Invite) =>
    `Join my Verity Protect circle. Tap ${buildInviteLink(invite.id)} or enter code ${invite.id}.`;

  const fetchMembers = useCallback(async () => {
    if (!activeProfile) {
      setMembers([]);
      return;
    }
    setLoadingMembers(true);
    try {
      const data = await authorizedFetch(`/profiles/${activeProfile.id}/members`);
      setMembers(data?.members ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMembers(false);
    }
  }, [activeProfile]);

  const fetchInvites = useCallback(async () => {
    if (!activeProfile) {
      setInvites([]);
      return;
    }
    setLoadingInvites(true);
    try {
      const data = await authorizedFetch(`/profiles/${activeProfile.id}/invites`);
      setInvites(data?.invites ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingInvites(false);
    }
  }, [activeProfile]);

  useEffect(() => {
    fetchMembers();
    fetchInvites();
    setInviteError('');
    setInviteMessage('');
  }, [activeProfile, fetchMembers, fetchInvites]);

  const shareInvite = async (invite: Invite) => {
    const message = buildInviteMessage(invite);
    try {
      await Share.share({ title: 'Verity Protect invite', message });
    } catch (err) {
      console.error(err);
    }
  };

  const shareViaSMS = async (invite: Invite) => {
    const message = buildInviteMessage(invite);
    const encoded = encodeURIComponent(message);
    try {
      await Linking.openURL(`sms:?body=${encoded}`);
    } catch (err) {
      Alert.alert('Unable to open SMS', 'Please share the invite manually.');
    }
  };

  const copyInvite = async (invite: Invite) => {
    await Clipboard.setStringAsync(invite.id);
    Alert.alert('Invite code copied', 'Paste it into the Enter invite code screen.');
  };

  const createInvite = async () => {
    if (!activeProfile) return;
    setInviteError('');
    setIsInviting(true);
    try {
      const data = await authorizedFetch(`/profiles/${activeProfile.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({
          role: inviteRole,
        }),
      });
      const createdInvite: Invite | undefined = data?.invite;
      setInviteRole('viewer');
      setInviteMessage('Invite created—Messages will open automatically.');
      await fetchInvites();
      if (createdInvite) {
        shareViaSMS(createdInvite);
      }
    } catch (err: any) {
      setInviteError(err?.message || 'Unable to create invite.');
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#f5f7fb" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account members</Text>
      </View>
      <View style={[styles.card, highlightInviteEntry && styles.highlightCard]}>
        <Text style={styles.subhead}>Current members</Text>
        <View style={styles.membersList}>
          {loadingMembers ? (
            <Text style={styles.placeholder}>Loading…</Text>
          ) : members.length === 0 ? (
            <Text style={styles.placeholder}>No one else is added yet.</Text>
          ) : (
            members.map((member) => {
              const metadataName = member.user?.user_metadata?.full_name;
              const name =
                metadataName ??
                member.user?.email ??
                member.role.charAt(0).toUpperCase() + member.role.slice(1);
              const roleLabel = member.is_caretaker ? 'Owner' : member.role;
              const displayName =
                member.is_caretaker && activeProfile
                  ? `${activeProfile.first_name} ${activeProfile.last_name}`
                  : name;
              return (
                <View key={member.id + member.user_id} style={styles.memberRow}>
                  <View>
                    <Text style={styles.memberName}>{displayName}</Text>
                    <Text style={styles.memberRole}>{roleLabel}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <Text style={styles.subhead}>Invite someone</Text>
        <Text style={styles.infoText}>
          Tap Create invite and we’ll open Messages with the Verity Protect link ready to send.
        </Text>
        <View style={styles.roleRow}>
          {(['viewer', 'editor', 'admin'] as MemberRole[]).map((role) => (
            <TouchableOpacity
              key={role}
              style={[styles.rolePill, inviteRole === role && styles.rolePillActive]}
              onPress={() => setInviteRole(role)}
            >
              <Text
                style={[
                  styles.roleLabel,
                  inviteRole === role ? styles.roleLabelActive : undefined,
                ]}
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {inviteError ? <Text style={styles.error}>{inviteError}</Text> : null}
        {inviteMessage ? <Text style={styles.hint}>{inviteMessage}</Text> : null}
        <TouchableOpacity
          style={[styles.button, isInviting && styles.disabledButton]}
          onPress={createInvite}
          disabled={isInviting}
        >
          <Text style={styles.buttonText}>{isInviting ? 'Creating…' : 'Create invite'}</Text>
        </TouchableOpacity>

        <Text style={[styles.subhead, { marginTop: 16 }]}>Pending invites</Text>
        <View style={styles.invitesList}>
          {loadingInvites ? (
            <Text style={styles.placeholder}>Checking invites…</Text>
          ) : invites.length === 0 ? (
            <Text style={styles.placeholder}>No invites outstanding.</Text>
          ) : (
            invites.map((invite) => (
              <View key={invite.id} style={styles.inviteRow}>
                <View style={styles.inviteInfo}>
                  <Text style={styles.inviteEmail}>{invite.email}</Text>
                  <Text style={styles.inviteMeta}>
                    {invite.role} • {invite.status}
                  </Text>
                  <Text style={styles.inviteCode}>{invite.id}</Text>
                </View>
                <View style={styles.inviteActions}>
                  <TouchableOpacity onPress={() => shareInvite(invite)} style={styles.iconButton}>
                    <Ionicons name="share-social-outline" size={18} color="#7d9dff" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => shareViaSMS(invite)} style={styles.iconButton}>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color="#7d9dff" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => copyInvite(invite)} style={styles.iconButton}>
                    <Ionicons name="copy-outline" size={18} color="#7d9dff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigation.navigate('EnterInviteCode')}
        >
          <Text style={styles.linkText}>Enter invite code</Text>
          <Ionicons name="chevron-forward" size={18} color="#7d9dff" />
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1d2434',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  headerTitle: {
    marginLeft: 12,
    fontSize: 24,
    fontWeight: '700',
    color: '#f5f7fb',
  },
  card: {
    backgroundColor: '#121a26',
    borderWidth: 1,
    borderColor: '#202c3c',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  subhead: {
    color: '#8aa0c6',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  membersList: {
    borderBottomWidth: 1,
    borderBottomColor: '#1f2735',
    paddingBottom: 12,
    gap: 6,
  },
  memberRow: {
    paddingVertical: 4,
  },
  memberName: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  memberRole: {
    color: '#8aa0c6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  placeholder: {
    color: '#95a2bd',
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#243247',
    borderRadius: 12,
    padding: 12,
    color: '#e6ebf5',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  rolePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2f3a52',
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  rolePillActive: {
    borderColor: '#5d9dff',
    backgroundColor: '#1f2b46',
  },
  roleLabel: {
    color: '#8aa0c6',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  roleLabelActive: {
    color: '#f5f7fb',
  },
  button: {
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
  },
  hint: {
    color: '#98a7c2',
    fontSize: 12,
  },
  infoText: {
    color: '#98a7c2',
    fontSize: 13,
    marginTop: 6,
  },
  highlightCard: {
    borderColor: '#5d9dff',
    borderWidth: 1,
    shadowColor: '#5d9dff',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  invitesList: {
    borderTopWidth: 1,
    borderTopColor: '#1f2735',
    paddingTop: 12,
    gap: 10,
  },
  inviteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inviteInfo: {
    flex: 1,
  },
  inviteEmail: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  inviteMeta: {
    color: '#8aa0c6',
    fontSize: 12,
  },
  inviteCode: {
    color: '#7d9dff',
    fontSize: 12,
    marginTop: 2,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 6,
  },
  linkRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkText: {
    color: '#7d9dff',
    fontWeight: '600',
  },
});
