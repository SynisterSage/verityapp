import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
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
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';
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
  const styles = useMemo(() => createInviteFamilyStyles(theme), [theme]);
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
        color: theme.colors.success,
        text: 'Family members (Full access) can manage the protected profile and alerts.',
      },
      {
        icon: 'eye',
        color: theme.colors.accent,
        text: 'Caretaker alerts just monitor activity and receive recordings.',
      },
      {
        icon: 'refresh',
        color: theme.colors.textDim,
        text: 'You can update roles anytime via the Manage button on each member.',
      },
    ],
    [theme.colors.accent, theme.colors.success, theme.colors.textDim]
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
          <Ionicons name="mail-open-outline" size={40} color={theme.colors.accent} />
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
                  <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.text} />
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
            <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />
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
                <Ionicons name="close" size={20} color={theme.colors.text} />
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
              disabled={revokingInviteId === selectedInvite.id}
            >
              {revokingInviteId === selectedInvite.id ? (
                <ActivityIndicator size="small" color={theme.colors.warning} />
              ) : (
                <Text style={styles.actionDangerText}>Revoke invite</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const createInviteFamilyStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      padding: theme.spacing.xl,
    },
    sectionLabel: {
      marginTop: theme.spacing.xl,
      marginBottom: 8,
      fontSize: 12,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
    headerSection: {
      marginBottom: 4,
    },
    title: {
      fontSize: 34,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 17,
      fontWeight: '500',
      color: theme.colors.textMuted,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 18,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
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
      color: theme.colors.surface,
      fontWeight: '700',
    },
    memberInfo: {
      flex: 1,
    },
    memberNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    memberName: {
      color: theme.colors.text,
      fontWeight: '700',
    },
    memberMeta: {
      color: theme.colors.textMuted,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
    },
    youBadge: {
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      paddingHorizontal: 8,
      paddingVertical: 2,
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    sectionCard: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      padding: 24,
      marginBottom: 16,
    },
    sectionHeader: {
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    sectionDescription: {
      color: theme.colors.textDim,
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
      backgroundColor: theme.colors.surfaceAlt,
    },
    rolePillActive: {
      backgroundColor: theme.colors.accent,
    },
    roleLabel: {
      fontWeight: '700',
      fontSize: 16,
      color: theme.colors.text,
    },
    roleLabelActive: {
      color: theme.colors.surface,
    },
    roleSubLabel: {
      fontSize: 12,
      color: theme.colors.textDim,
      marginTop: 4,
    },
    roleSubLabelActive: {
      color: theme.colors.surface,
    },
    error: {
      color: theme.colors.danger,
      fontSize: 12,
      marginBottom: 6,
      marginTop: 8,
    },
    button: {
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      marginTop: 12,
      width: '100%',
      backgroundColor: theme.colors.accent,
    },
    inviteButton: {},
    disabledButton: {
      opacity: 0.5,
    },
    buttonText: {
      color: theme.colors.surface,
      fontWeight: '600',
    },
    skeletonWrapper: {
      marginBottom: 12,
      gap: 12,
    },
    skeletonCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      backgroundColor: theme.colors.surface,
    },
    skeletonLine: {
      height: 12,
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.12),
      marginBottom: 8,
    },
    skeletonLineShort: {
      width: '60%',
    },
    skeletonLineTiny: {
      width: '40%',
    },
    pendingHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 12,
    },
    pendingCount: {
      color: theme.colors.accent,
      fontSize: 12,
    },
    inviteSkeletonList: {
      gap: 12,
    },
    pendingCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 24,
      paddingVertical: 18,
      paddingHorizontal: 20,
      marginBottom: 6,
    },
    pendingInfo: {
      flex: 1,
    },
    pendingRole: {
      color: theme.colors.accent,
      fontSize: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    pendingCode: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: 2,
    },
    pendingActions: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 24,
      gap: 8,
    },
    emptyStateTitle: {
      color: theme.colors.textMuted,
    },
    enterCodeCard: {
      marginTop: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      backgroundColor: theme.colors.surfaceAlt,
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
      backgroundColor: theme.colors.overlay,
    },
    tray: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radii.lg,
      borderTopRightRadius: theme.radii.lg,
      padding: 24,
      borderColor: theme.colors.border,
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
      backgroundColor: theme.colors.border,
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
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    actionCode: {
      color: theme.colors.textDim,
      marginTop: 4,
    },
    actionClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    actionButton: {
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 12,
    },
    actionButtonText: {
      color: theme.colors.text,
      fontWeight: '600',
    },
    actionDanger: {
      backgroundColor: withOpacity(theme.colors.danger, 0.18),
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
    },
    actionDangerText: {
      color: theme.colors.danger,
      fontWeight: '700',
    },
    inviteSkeletonRow: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    pendingSkeletonBadge: {
      width: 40,
      height: 12,
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.12),
      marginBottom: 6,
    },
    pendingSkeletonCode: {
      width: '70%',
      height: 14,
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.08),
    },
  });
