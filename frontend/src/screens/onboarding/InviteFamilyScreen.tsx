import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { authorizedFetch } from '../../services/backend';
import { supabase } from '../../services/supabase';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import * as Clipboard from 'expo-clipboard';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { Ionicons } from '@expo/vector-icons';
type MemberRole = 'admin' | 'editor';

type Member = {
  id: string;
  user_id: string;
  role: MemberRole;
  is_caretaker?: boolean;
  display_name?: string | null;
  user?: { email?: string; user_metadata?: { full_name?: string } } | null;
};

type Invite = {
  id: string;
  email: string;
  role: MemberRole;
  status: string;
  short_code?: string | null;
  invited_by?: string | null;
};

const avatarColors = ['#4c7dff', '#6e60f8', '#00c2ff', '#47d6a5'];
const ROLE_DISPLAY_NAMES: Record<MemberRole, string> = {
  editor: 'Family',
  admin: 'Caretaker',
};
function resolveDisplayName(member: Member) {
  const base =
    member.display_name ??
    member.user?.user_metadata?.full_name ??
    member.user?.email ??
    member.role.charAt(0).toUpperCase() + member.role.slice(1);
  return base;
}

function formatStatus(status: string) {
  if (!status) return '';
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

type Props = {
  navigation: {
    navigate: (screen: string) => void;
  };
};

export default function InviteFamilyScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const { theme } = useTheme();
  const { session } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [inviteRole, setInviteRole] = useState<MemberRole>('editor');
  const [inviteError, setInviteError] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `member-skeleton-${i}`), []);
  const inviteSkeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `invite-skeleton-${i}`), []);
  const showMembersSkeleton = loadingMembers && members.length === 0;
  const showInvitesSkeleton = loadingInvites && invites.length === 0;
  const sessionUserId = session?.user?.id ?? null;
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const currentMembership = members.find((member) => member.user_id === sessionUserId);
  const currentUserIsAdmin = Boolean(
    currentMembership && (currentMembership.is_caretaker || currentMembership.role === 'admin')
  );
  const availableInviteRoles = useMemo<MemberRole[]>(
    () => (currentUserIsAdmin ? ['editor', 'admin'] : ['editor']),
    [currentUserIsAdmin]
  );
  const canCreateInvite = currentUserIsAdmin;
  const roleHelperItems = useMemo(
    () => [
      {
        icon: 'shield-checkmark',
        color: '#4ade80',
        text: 'Family members (Full access) can manage the protected profile and alerts.',
      },
      {
        icon: 'eye',
        color: '#2d6df6',
        text: 'Caretaker alerts just monitor activity and receive recordings.',
      },
      {
        icon: 'refresh',
        color: '#64748b',
        text: 'You can update roles anytime via the Manage button on each member.',
      },
    ],
    []
  );
  const [selectedInvite, setSelectedInvite] = useState<Invite | null>(null);
  const actionAnim = useRef(new Animated.Value(0)).current;

  const buildInviteLink = (inviteId: string) => `verityprotect://invite/${inviteId}`;
  const buildInviteMessage = (invite: Invite) => {
    const code = invite.short_code ?? invite.id;
    return `Join my Verity Protect Circle.\nTap ${buildInviteLink(invite.id)} or use code ${code} to join.`;
  };

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
    if (availableInviteRoles.length && !availableInviteRoles.includes(inviteRole)) {
      setInviteRole(availableInviteRoles[0]);
    }
  }, [availableInviteRoles, inviteRole]);

  useEffect(() => {
    if (!activeProfile) {
      return;
    }
    const profileId = activeProfile.id;
    const channel = supabase
      .channel(`profile-members-${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profile_members',
          filter: `profile_id=eq.${profileId}`,
        },
        async (payload) => {
          const payloadAny = payload as { [key: string]: any };
          const eventType = payloadAny.eventType ?? payloadAny.type;
          const deletedUserId =
            payloadAny.old?.user_id ?? payloadAny.record?.user_id ?? payloadAny.new?.user_id;
          if (eventType === 'DELETE' && deletedUserId === sessionUserId) {
            await supabase.auth.signOut();
            return;
          }
          await fetchMembers();
        }
      )
      .subscribe();

    fetchMembers();
    fetchInvites();

    return () => {
      channel.unsubscribe();
    };
  }, [activeProfile, fetchInvites, fetchMembers, sessionUserId]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const createInvite = useCallback(async () => {
    if (!activeProfile || !canCreateInvite) {
      setInviteError('You do not have permission to send invites.');
      return;
    }
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
      setInviteRole('editor');
      await fetchInvites();
      if (createdInvite) {
        shareViaSMS(createdInvite);
      }
    } catch (err: any) {
      setInviteError(err?.message || 'Unable to create invite.');
    } finally {
      setIsInviting(false);
    }
  }, [activeProfile, canCreateInvite, fetchInvites, inviteRole]);

  const handleCreateInvite = () => {
    if (!canCreateInvite) {
      return;
    }
    if (inviteRole === 'admin') {
      Alert.alert(
        'Caretaker invite warning',
        'Caretakers have full control and can remove or update members. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: createInvite },
        ],
        { cancelable: true }
      );
      return;
    }
    createInvite();
  };

  const openInviteActions = useCallback((invite: Invite) => {
    setSelectedInvite(invite);
    Animated.timing(actionAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [actionAnim]);

  const closeInviteActions = useCallback(() => {
    Animated.timing(actionAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSelectedInvite(null);
      }
    });
  }, [actionAnim]);

  const shareInvite = async (invite: Invite) => {
    const message = buildInviteMessage(invite);
    try {
      await Share.share({ title: 'Verity Protect invite', message });
    } catch (err) {
      console.error(err);
    }
    closeInviteActions();
  };

  const shareViaSMS = async (invite: Invite) => {
    const message = buildInviteMessage(invite);
    const encoded = encodeURIComponent(message);
    try {
      await Linking.openURL(`sms:?body=${encoded}`);
    } catch (err) {
      Alert.alert('Unable to open SMS', 'Please share the invite manually.');
    }
    closeInviteActions();
  };

  const copyInviteCode = async (invite: Invite) => {
    const code = invite.short_code ?? invite.id ?? '';
    if (!code) {
      return;
    }
    await Clipboard.setStringAsync(code);
    Alert.alert('Code copied', 'Paste it into the Enter invite code screen.');
    closeInviteActions();
  };

  const revokePendingInvite = async (invite: Invite) => {
    if (!activeProfile) {
      return;
    }
    setRevokingInviteId(invite.id);
    try {
      await authorizedFetch(`/profiles/${activeProfile.id}/invites/${invite.id}`, {
        method: 'DELETE',
      });
      setInvites((prev) => prev.filter((item) => item.id !== invite.id));
    } catch (err: any) {
      Alert.alert(err?.message || 'Unable to revoke invite', 'Try again later.');
    } finally {
      setRevokingInviteId(null);
      closeInviteActions();
    }
  };

  const confirmRevokeInvite = (invite: Invite) => {
    Alert.alert(
      'Revoke invite',
      'This invite will no longer be usable once revoked.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => revokePendingInvite(invite),
        },
      ],
      { cancelable: true }
    );
  };

  const renderMemberRow = () => (
    <View>
      {members.map((member) => {
        const name = resolveDisplayName(member);
        const isCurrentUser = member.user_id === sessionUserId;
        return (
          <View key={member.id} style={styles.memberRow}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: avatarColors[member.id.charCodeAt(0) % avatarColors.length] },
              ]}
            >
              <Text style={styles.avatarText}>{name.charAt(0)}</Text>
            </View>
            <View style={styles.memberInfo}>
              <View style={styles.memberNameRow}>
                <Text style={styles.memberName}>{name}</Text>
                {isCurrentUser && <Text style={styles.youBadge}>YOU</Text>}
              </View>
              <Text style={styles.memberMeta}>{member.is_caretaker ? 'Account Owner' : 'Family'}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <OnboardingHeader chapter="Circle" activeStep={7} totalSteps={9} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 32) + 220,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <Text style={styles.title}>Invite Family</Text>
          <Text style={styles.subtitle}>
            Add trusted family members who can review alerts and recordings.
          </Text>
        </View>
        <Text style={styles.sectionLabel}>Active Members</Text>
        {showMembersSkeleton ? (
          <View style={styles.skeletonWrapper}>
            {skeletonRows.map((key) => (
              <Animated.View key={key} style={[styles.skeletonCard, { opacity: shimmer }]}>
                <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
              </Animated.View>
            ))}
          </View>
        ) : (
          renderMemberRow()
        )}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Role Type</Text>
            <Text style={[styles.sectionDescription, styles.sectionDescriptionSpacing]}>
              Choose who you want to trust for this profile.
            </Text>
          </View>
          <View style={styles.roleRow}>
            {availableInviteRoles.map((role) => (
              <TouchableOpacity
                key={role}
                style={[
                  styles.rolePill,
                  inviteRole === role
                    ? styles.rolePillActive
                    : { backgroundColor: theme.colors.surfaceAlt },
                ]}
                onPress={() => setInviteRole(role)}
              >
                <Text
                  style={[
                    styles.roleLabel,
                    inviteRole === role ? styles.roleLabelActive : { color: theme.colors.textDim },
                  ]}
                >
                  {ROLE_DISPLAY_NAMES[role] ?? role}
                </Text>
                <Text
                  style={[
                    styles.roleSubLabel,
                    inviteRole === role
                      ? styles.roleSubLabelActive
                      : { color: theme.colors.textDim },
                  ]}
                >
                  {role === 'admin' ? 'Full access' : 'Alerts only'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {inviteError ? <Text style={styles.error}>{inviteError}</Text> : null}
          <TouchableOpacity
            style={[
              styles.button,
              styles.inviteButton,
              (isInviting || !canCreateInvite) && styles.disabledButton,
            ]}
            onPress={handleCreateInvite}
            disabled={isInviting || !canCreateInvite}
          >
            <Text style={styles.buttonText}>{isInviting ? 'Generating…' : 'Generate link'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.pendingHeader}>
            <Text style={styles.sectionTitle}>Pending links</Text>
            <Text style={styles.pendingCount}>{invites.length} active</Text>
          </View>
          {showInvitesSkeleton ? (
            <View style={styles.inviteSkeletonList}>
              {inviteSkeletonRows.map((key) => (
                <Animated.View
                  key={key}
                  style={[styles.pendingCard, styles.inviteSkeletonRow, { opacity: shimmer }]}
                >
                  <View style={styles.pendingSkeletonBadge} />
                  <View style={styles.pendingSkeletonCode} />
                </Animated.View>
              ))}
            </View>
          ) : invites.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="mail-open-outline" size={40} color="#7d9dff" />
              <Text style={styles.emptyStateTitle}>No pending invites</Text>
            </View>
          ) : (
            invites.map((invite) => {
              const shortCode = invite.short_code ?? invite.id ?? '';
              const roleLabel =
                ROLE_DISPLAY_NAMES[invite.role] ??
                invite.role.charAt(0).toUpperCase() + invite.role.slice(1);
              return (
                <View key={invite.id} style={styles.pendingCard}>
                  <View style={styles.pendingInfo}>
                    <Text style={styles.pendingRole}>{roleLabel}</Text>
                    <Text style={styles.pendingCode}>{shortCode}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.pendingActions}
                    onPress={() => openInviteActions(invite)}
                  >
                    <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
          <TouchableOpacity
            style={styles.enterCodeCard}
            onPress={() => navigation.navigate('OnboardingInviteCode')}
          >
            <View>
              <Text style={styles.sectionTitle}>Have an invite code?</Text>
              <Text style={styles.sectionDescription}>Join another circle</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#2d6df6" />
          </TouchableOpacity>
        </View>
            <HowItWorksCard caption="HOW IT WORKS" items={roleHelperItems} />
        <View style={{ height: Math.max(insets.bottom, 40) }} />
      </ScrollView>
      <ActionFooter
        primaryLabel="Continue"
        onPrimaryPress={() => navigation.navigate('OnboardingAlerts')}
        secondaryLabel="Skip for now"
        onSecondaryPress={() => navigation.navigate('OnboardingAlerts')}
      />
      {selectedInvite && (
        <View style={styles.actionOverlay} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={closeInviteActions}>
            <View style={styles.actionBackdrop} />
          </TouchableWithoutFeedback>
          <Animated.View
            style={[
              styles.tray,
              {
                opacity: actionAnim,
                transform: [
                  {
                    translateY: actionAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [260, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.trayHandle} />
            <View style={styles.actionHeader}>
              <View>
                <Text style={styles.actionTitle}>Invite Link</Text>
                <Text style={styles.actionCode}>
                  Code: {selectedInvite.short_code ?? selectedInvite.id}
                </Text>
              </View>
              <Pressable onPress={closeInviteActions} style={styles.actionClose}>
                <Ionicons name="close" size={20} color="#fff" />
              </Pressable>
            </View>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => shareInvite(selectedInvite)}
            >
              <Text style={styles.actionButtonText}>Send invite link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => copyInviteCode(selectedInvite)}
            >
              <Text style={styles.actionButtonText}>Copy code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionDanger}
              onPress={() => confirmRevokeInvite(selectedInvite)}
            >
              <Text style={styles.actionDangerText}>Revoke invite</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  content: {
    padding: 24,
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#8796b0',
  },
  headerSection: {
    marginBottom: 4,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#f5f7fb',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#8aa0c6',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#0f1724',
    borderWidth: 1,
    borderColor: '#1f2735',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    color: '#f5f7fb',
    fontWeight: '700',
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberMeta: {
    color: '#8aa0c6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  youBadge: {
    backgroundColor: '#25304b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2d6df6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    color: '#7d9dff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f1724',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 12,
    marginBottom: 10,
  },
  cardText: {
    color: '#f1f4fa',
  },
  meta: {
    color: '#8aa0c6',
    fontSize: 12,
    marginTop: 4,
  },
  copyButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#1f2937',
  },
  copyText: {
    color: '#2d6df6',
    fontWeight: '600',
  },
  empty: {
    color: '#8aa0c6',
    textAlign: 'center',
    marginTop: 8,
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
    marginBottom: 6,
  },
  skeletonWrapper: {
    marginBottom: 12,
    gap: 12,
  },
  skeletonCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 12,
    backgroundColor: '#0f1724',
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0f1724',
    marginBottom: 8,
  },
  skeletonLineShort: {
    width: '60%',
  },
  skeletonLineTiny: {
    width: '40%',
  },
  sectionCard: {
    backgroundColor: '#0f1724',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 28,
    padding: 24,
    marginBottom: 16,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionHeaderRow: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#f5f7fb',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionDescription: {
    color: '#95a2bd',
    fontSize: 13,
    marginTop: 4,
  },
  sectionDescriptionSpacing: {
    marginBottom: 6,
  },
  roleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rolePill: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f1724',
  },
  rolePillActive: {
    backgroundColor: '#2d6df6',
  },
  rolePillInactive: {
    backgroundColor: '#192340',
  },
  roleLabel: {
    fontWeight: '700',
    fontSize: 16,
  },
  roleLabelActive: {
    color: '#fff',
  },
  roleLabelInactive: {
    color: '#8aa0c6',
  },
  roleSubLabel: {
    fontSize: 12,
  },
  roleSubLabelActive: {
    color: '#e0e7ff',
  },
  roleSubLabelInactive: {
    color: '#5b657d',
  },
  button: {
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 12,
    width: '100%',
    backgroundColor: '#2d6df6',
  },
  inviteButton: {},
  disabledButton: {
    opacity: .5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  invitesList: {
    gap: 12,
  },
  pendingInviteRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  pendingInviteLabel: {
    color: '#8aa0c6',
    fontSize: 12,
    marginBottom: 8,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  codePill: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#0f1729',
    borderWidth: 1,
    borderColor: '#1b2534',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  codeText: {
    color: '#f5f7fb',
    fontWeight: '700',
  },
  codeActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1b2534',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f1729',
  },
  enterCodeButton: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  enterCodeText: {
    color: '#7d9dff',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyStateTitle: {
    color: '#8aa0c6',
  },
  pendingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  pendingCount: {
    color: '#7d9dff',
    fontSize: 12,
  },
  pendingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f1729',
    borderWidth: 1,
    borderColor: '#1b2534',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  pendingInfo: {
    flex: 1,
  },
  pendingRole: {
    color: '#7d9dff',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  pendingCode: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 2,
  },
  pendingActions: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d2f47',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteSkeletonList: {
    gap: 12,
  },
  pendingSkeletonBadge: {
    width: 40,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1f253a',
    marginBottom: 6,
  },
  pendingSkeletonCode: {
    width: '70%',
    height: 14,
    borderRadius: 6,
    backgroundColor: '#1f253a',
  },
  enterCodeCard: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 16,
    backgroundColor: '#101826',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  actionBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    opacity: 0.5,
  },
  tray: {
    backgroundColor: '#0d1119',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 24,
    borderColor: '#1b2534',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: -12 },
    shadowRadius: 30,
    elevation: 20,
    alignSelf: 'stretch',
  },
  trayHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1b2534',
    alignSelf: 'center',
    marginBottom: 16,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  actionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  actionCode: {
    color: '#8aa0c6',
    marginTop: 4,
  },
  actionClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2534',
  },
  actionButton: {
    backgroundColor: '#1f2534',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  actionDanger: {
    backgroundColor: '#1b0b1b',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionDangerText: {
    color: '#ff6d6d',
    fontWeight: '700',
  },
  inviteSkeletonRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 12,
    backgroundColor: '#121a26',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteSkeletonLineShort: {
    width: '40%',
    height: 10,
    borderRadius: 6,
    backgroundColor: '#1b2735',
  },
  inviteSkeletonLineLong: {
    flex: 1,
    height: 10,
    borderRadius: 6,
    backgroundColor: '#1b2735',
  },
});
