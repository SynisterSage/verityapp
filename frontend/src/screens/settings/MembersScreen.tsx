import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { authorizedFetch } from '../../services/backend';
import { supabase } from '../../services/supabase';
import { useProfile } from '../../context/ProfileContext';
import { SettingsStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import SettingsHeader from '../../components/common/SettingsHeader';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';

import * as Clipboard from 'expo-clipboard';

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

const MENU_WIDTH = 140;
const MENU_HEIGHT = 90;

const avatarColors = ['#4c7dff', '#6e60f8', '#00c2ff', '#47d6a5'];
const ROLE_DISPLAY_NAMES: Record<MemberRole, string> = {
  editor: 'Family',
  admin: 'Caretaker',
};

const roleHelperItems = [
  {
    icon: 'shield-checkmark',
    color: '#4ade80',
    text: 'Family members (Full access) can manage the protected profile and alerts.',
  },
  {
    icon: 'eye',
    color: '#2d6df6',
    text: 'Caretakers just monitor activity and receive recordings.',
  },
  {
    icon: 'refresh',
    color: '#64748b',
    text: 'Roles can be updated anytime via the menu next to each member.',
  },
];

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

export default function MembersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'Members'>>();
  const route = useRoute<RouteProp<SettingsStackParamList, 'Members'>>();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const { session } = useAuth();
  const sessionUserId = session?.user?.id ?? null;

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [inviteRole, setInviteRole] = useState<MemberRole>('editor');
  const [inviteError, setInviteError] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [activeMemberMenuId, setActiveMemberMenuId] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [menuMember, setMenuMember] = useState<Member | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectedInvite, setSelectedInvite] = useState<Invite | null>(null);
  const rowRefs = useRef<Map<string, View>>(new Map());
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const actionAnim = useRef(new Animated.Value(0)).current;
  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `member-${i}`), []);
  const showMembersSkeleton = loadingMembers && members.length === 0;
  const currentMembership = members.find((member) => member.user_id === sessionUserId);
  const currentUserIsAdmin = Boolean(
    currentMembership && (currentMembership.is_caretaker || currentMembership.role === 'admin')
  );
  const canCreateInvite = currentUserIsAdmin;

  const availableInviteRoles = useMemo<MemberRole[]>(() => {
    if (currentUserIsAdmin) {
      return ['editor', 'admin'];
    }
    return ['editor'];
  }, [currentUserIsAdmin]);

  const highlightInviteEntry = route.params?.highlightInviteEntry ?? false;

  const closeMemberMenu = useCallback(() => {
    setActiveMemberMenuId(null);
    setMenuAnchor(null);
    setMenuMember(null);
  }, []);

  const canManageMember = (member: Member) =>
    currentUserIsAdmin &&
    !member.is_caretaker &&
    member.role !== 'admin' &&
    member.user_id !== sessionUserId;

  const toggleMemberMenu = useCallback(
    (member: Member) => {
      if (activeMemberMenuId === member.id) {
        closeMemberMenu();
        return;
      }
      setActiveMemberMenuId(member.id);
      setMenuMember(member);
      const ref = rowRefs.current.get(member.id);
      if (!ref) {
        setMenuAnchor(null);
        return;
      }
      ref.measureInWindow((x, y, width, height) => {
        setMenuAnchor({ x, y, width, height });
      });
    },
    [activeMemberMenuId, closeMemberMenu]
  );

  const fetchMembers = useCallback(async () => {
    if (!activeProfile) {
      setMembers([]);
      return;
    }
    setLoadingMembers(true);
    try {
      const data = await authorizedFetch(`/profiles/${activeProfile.id}/members`);
      setMembers(data?.members ?? []);
      setActiveMemberMenuId(null);
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
    if (!activeProfile) return;
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
        async () => {
          await fetchMembers();
          await fetchInvites();
        }
      )
      .subscribe();

    fetchMembers();
    fetchInvites();

    return () => {
      channel.unsubscribe();
    };
  }, [activeProfile, fetchInvites, fetchMembers]);

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

  useFocusEffect(
    useCallback(() => {
      if (!activeProfile) {
        return;
      }
      const interval = setInterval(() => {
        fetchMembers();
        fetchInvites();
      }, 60_000);
      return () => clearInterval(interval);
    }, [activeProfile, fetchMembers, fetchInvites])
  );

  const windowWidth = Dimensions.get('window').width;
  const windowHeight = Dimensions.get('window').height;
  const menuPosition =
    menuAnchor === null
      ? null
      : {
          top: Math.min(
            Math.max(16, menuAnchor.y + menuAnchor.height / 2 - 60),
            windowHeight - 90 - 16
          ),
          left: Math.max(
            16,
            Math.min(
              menuAnchor.x + menuAnchor.width - 140,
              Math.max(16, windowWidth - 140 - 16)
            )
          ),
        };

  const shareInvite = async (invite: Invite) => {
    const message = `Join my Verity Protect Circle.\nTap verityprotect://invite/${invite.id} or use code ${
      invite.short_code ?? invite.id
    } to join.`;
    try {
      await Share.share({ title: 'Verity Protect invite', message });
    } catch (err) {
      console.error(err);
    }
    closeInviteActions();
  };

  const openInviteActions = useCallback(
    (invite: Invite) => {
      setSelectedInvite(invite);
      Animated.timing(actionAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    },
    [actionAnim]
  );

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

  const shareViaSMS = async (invite: Invite) => {
    const code = invite.short_code ?? invite.id ?? '';
    const message = `Join my Verity Protect Circle.\nTap verityprotect://invite/${invite.id} or use code ${code} to join.`;
    const encoded = encodeURIComponent(message);
    try {
      await Linking.openURL(`sms:?body=${encoded}`);
    } catch (err) {
      Alert.alert('Unable to open SMS', 'Please share the invite manually.');
    }
  };

  const copyInviteCode = async (invite: Invite) => {
    const code = invite.short_code ?? invite.id ?? '';
    if (!code) return;
    await Clipboard.setStringAsync(code);
    Alert.alert('Code copied', 'Paste it into the Enter invite code screen.');
    closeInviteActions();
  };

  const revokePendingInvite = async (invite: Invite) => {
    if (!activeProfile) return;
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
        { text: 'Revoke', style: 'destructive', onPress: () => revokePendingInvite(invite) },
      ],
      { cancelable: true }
    );
  };

  const createInvite = async () => {
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
  };

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

  const updateMemberRole = async (member: Member, role: MemberRole) => {
    if (!activeProfile) return;
    setUpdatingMemberId(member.id);
    try {
      await authorizedFetch(`/profiles/${activeProfile.id}/members/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await fetchMembers();
    } catch (err) {
      console.error(err);
      Alert.alert('Unable to update role', 'Try again later.');
    } finally {
      setUpdatingMemberId(null);
      closeMemberMenu();
    }
  };

  const confirmChangeRole = (member: Member, role: MemberRole) => {
    if (member.role === role) return;
    const name = resolveDisplayName(member);
    Alert.alert(
      'Change role',
      `Set ${name} as ${role}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => updateMemberRole(member, role),
        },
      ],
      { cancelable: true }
    );
  };

  const handleRemoveMember = async (member: Member) => {
    if (!activeProfile) return;
    setRemovingMemberId(member.id);
    try {
      await authorizedFetch(`/profiles/${activeProfile.id}/members/${member.id}`, {
        method: 'DELETE',
      });
      await fetchMembers();
    } catch (err) {
      console.error(err);
      Alert.alert('Unable to remove member', 'Try again later.');
    } finally {
      setRemovingMemberId(null);
      closeMemberMenu();
    }
  };

  const confirmRemoveMember = (member: Member) => {
    Alert.alert(
      'Remove member',
      `Remove ${member.display_name ?? 'this member'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => handleRemoveMember(member) },
      ],
      { cancelable: true }
    );
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => closeMemberMenu());
    return unsubscribe;
  }, [navigation, closeMemberMenu]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => closeMemberMenu());
    return unsubscribe;
  }, [navigation, closeMemberMenu]);

  return (
    <View style={styles.outer}>
      <SafeAreaView style={styles.screen} edges={[]}>
        <SettingsHeader title="Account Members" />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 32), paddingTop: Math.max(insets.top, 12 + 0) }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!menuMember}
          keyboardShouldPersistTaps="handled"
        >

          <View style={[styles.sectionCard, highlightInviteEntry && styles.highlightCard]}>
            <Text style={styles.sectionLabel}>Active Members</Text>
            <Text style={[styles.sectionDescription, styles.sectionDescriptionSpacing]}>
              Every trusted member with access to this profile.
            </Text>
            {showMembersSkeleton ? (
              <View style={styles.skeletonWrapper}>
                {skeletonRows.map((key) => (
                  <Animated.View key={key} style={[styles.memberCard, { opacity: shimmer }]}>
                    <View style={styles.memberRow}>
                      <View style={styles.skeletonAvatar} />
                      <View style={styles.skeletonContent}>
                        <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                        <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
                      </View>
                    </View>
                  </Animated.View>
                ))}
              </View>
            ) : members.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color="#7d9dff" />
                <Text style={styles.emptyStateTitle}>No members yet</Text>
              </View>
            ) : (
              members.map((member, index) => {
                const safeName =
                  (member.is_caretaker && activeProfile
                    ? `${activeProfile.first_name} ${activeProfile.last_name}`
                    : resolveDisplayName(member)) ?? 'Member';
                const roleLabel = member.is_caretaker
                  ? 'Owner'
                  : ROLE_DISPLAY_NAMES[member.role] ??
                    member.role.charAt(0).toUpperCase() + member.role.slice(1);
                const avatarColor = avatarColors[index % avatarColors.length];
                const isCurrentUser = sessionUserId === member.user_id;
                return (
                  <View
                    key={`${member.id}-${member.user_id}`}
                    ref={(element) => {
                      if (element) {
                        rowRefs.current.set(member.id, element);
                      } else {
                        rowRefs.current.delete(member.id);
                      }
                    }}
                    collapsable={false}
                  >
                    <View style={styles.memberCard}>
                      <View style={styles.memberRow}>
                        <View style={[styles.memberAvatar, { backgroundColor: avatarColor }]}>
                          <Text style={styles.memberAvatarText}>
                            {safeName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.memberContent}>
                          <View style={styles.memberNameRow}>
                            <Text style={styles.memberName}>{safeName}</Text>
                            {isCurrentUser && <Text style={styles.youBadge}>You</Text>}
                          </View>
                          <Text style={styles.memberRole}>{roleLabel}</Text>
                        </View>
                        {canManageMember(member) && (
                          <TouchableOpacity
                            style={styles.menuButton}
                            onPress={() => toggleMemberMenu(member)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="ellipsis-vertical" size={18} color="#7d9dff" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Role Type</Text>
            <Text style={[styles.sectionDescription, styles.sectionDescriptionSpacing]}>
              Choose who you want to trust for this profile.
            </Text>
            <View style={styles.roleRow}>
              {availableInviteRoles.map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.rolePill,
                    inviteRole === role ? styles.rolePillActive : styles.rolePillInactive,
                  ]}
                  onPress={() => setInviteRole(role)}
                >
                  <Text
                    style={[
                      styles.roleLabel,
                      inviteRole === role ? styles.roleLabelActive : styles.roleLabelInactive,
                    ]}
                  >
                    {ROLE_DISPLAY_NAMES[role] ?? role}
                  </Text>
                  <Text
                    style={[
                      styles.roleSubLabel,
                      inviteRole === role
                        ? styles.roleSubLabelActive
                        : styles.roleSubLabelInactive,
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
              <Text style={styles.buttonText}>{isInviting ? 'Creating…' : 'Create invite'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.pendingHeader}>
              <Text style={styles.sectionLabel}>Pending invites</Text>
              <Text style={styles.pendingCount}>{invites.length} active</Text>
            </View>
            <Text style={[styles.sectionDescription, styles.sectionDescriptionSpacing]}>
              Manage your sent invitations below.
            </Text>
            <View style={styles.invitesList}>
              {loadingInvites && invites.length === 0 ? (
                <View style={styles.inviteSkeletonList}>
                  {skeletonRows.map((key) => (
                    <Animated.View key={key} style={[styles.inviteSkeletonRow, { opacity: shimmer }]}>
                      <View style={styles.inviteSkeletonLineShort} />
                      <View style={styles.inviteSkeletonLineLong} />
                    </Animated.View>
                  ))}
                </View>
              ) : invites.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="mail-open-outline" size={40} color="#7d9dff" />
                  <Text style={styles.emptyStateTitle}>No pending invites</Text>
                </View>
              ) : (
                <View style={loadingInvites ? styles.faded : undefined}>
                  {invites.map((invite) => {
                    const shortCode = invite.short_code ?? invite.id ?? '';
                    const roleLabel =
                      ROLE_DISPLAY_NAMES[invite.role] ??
                      invite.role.charAt(0).toUpperCase() + invite.role.slice(1);
                    const statusLabel = formatStatus(invite.status);
                    return (
                      <View key={invite.id} style={styles.pendingCard}>
                        <View style={styles.pendingInfo}>
                          <Text style={styles.pendingRole}>{roleLabel}</Text>
                          <Text style={styles.pendingCode}>{shortCode}</Text>
                          <Text style={styles.pendingStatus}>{statusLabel}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.pendingActions}
                          onPress={() => openInviteActions(invite)}
                        >
                          <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.enterCodeButton}
              onPress={() => navigation.navigate('EnterInviteCode')}
            >
              <Text style={styles.enterCodeText}>Enter invite code</Text>
              <Ionicons name="chevron-forward" size={18} color="#7d9dff" />
            </TouchableOpacity>
          </View>

          <HowItWorksCard caption="HOW IT WORKS" items={roleHelperItems} />
          <View style={{ height: Math.max(insets.bottom, 32) }} />
        </ScrollView>
      </SafeAreaView>
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
              onPress={() => selectedInvite && confirmRevokeInvite(selectedInvite)}
              disabled={revokingInviteId === selectedInvite?.id}
            >
              {revokingInviteId === selectedInvite?.id ? (
                <ActivityIndicator size="small" color="#f97316" />
              ) : (
                <Text style={styles.actionDangerText}>Revoke invite</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
      {menuMember && menuPosition && (
        <View style={styles.menuPortal} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={closeMemberMenu}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>
          <View
            style={[
              styles.memberMenu,
              styles.memberMenuPortal,
              { top: menuPosition.top, left: menuPosition.left },
            ]}
          >
            {(['editor'] as MemberRole[]).map((option) => {
              const optionLabel =
                ROLE_DISPLAY_NAMES[option] ?? option.charAt(0).toUpperCase() + option.slice(1);
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.menuItem,
                    menuMember.role === option && styles.menuItemDisabled,
                  ]}
                  onPress={() => confirmChangeRole(menuMember, option)}
                  disabled={menuMember.role === option || updatingMemberId === menuMember.id}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      menuMember.role === option && styles.menuItemTextDisabled,
                    ]}
                  >
                    Set as {optionLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => menuMember && confirmRemoveMember(menuMember)}
              disabled={removingMemberId === menuMember?.id}
            >
              <Text style={styles.menuItemText}>Remove member</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  screen: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  heroSection: {
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#f5f7fb',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#8aa0c6',
  },
  sectionCard: {
    backgroundColor: '#0f1724',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 20,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: '#8796b0',
    marginBottom: 8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  sectionDescription: {
    color: '#95a2bd',
    fontSize: 13,
    marginBottom: 6,
  },
  sectionDescriptionSpacing: {
    marginBottom: 12,
  },
  pendingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  pendingCount: {
    color: '#7d9dff',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  membersList: {
    gap: 12,
  },
  memberCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1f2735',
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: '#0f1724',
    marginBottom: 2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: '#fff',
    fontWeight: '600',
  },
  memberContent: {
    flex: 1,
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
  youBadge: {
    backgroundColor: '#131c30',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2b46',
    paddingHorizontal: 8,
    paddingVertical: 2,
    color: '#7d9dff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  memberMenu: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#0f1523',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2735',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    zIndex: 2,
  },
  memberMenuPortal: {
    position: 'absolute',
    minWidth: MENU_WIDTH,
    maxWidth: MENU_WIDTH,
    zIndex: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  menuItemText: {
    color: '#f5f7fb',
    fontWeight: '500',
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuItemTextDisabled: {
    color: '#95a2bd',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#1b2333',
    marginVertical: 6,
  },
  placeholder: {
    color: '#95a2bd',
    fontSize: 13,
  },
  highlightCard: {
    borderColor: '#5d9dff',
    borderWidth: 1,
    shadowColor: '#5d9dff',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  skeletonWrapper: {
    gap: 12,
    marginBottom: 8,
  },
  skeletonAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1f2735',
  },
  skeletonContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#1f2735',
  },
  skeletonLineShort: {
    width: '65%',
  },
  skeletonLineTiny: {
    width: '40%',
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
    marginTop: 12,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2d6df6',
  },
  inviteButton: {},
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
  },
  invitesList: {
    gap: 12,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f1724',
    borderWidth: 1,
    borderColor: '#1b2534',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 6,
    shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 8,
  elevation: 4,
  },
  pendingInfo: {
    flex: 1,
    gap: 4,
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
  pendingStatus: {
    color: '#64748b',
    fontSize: 12,
  },
  pendingActions: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d2f47',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f1724',
  },
  enterCodeButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#1f2735',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  enterCodeText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  inviteSkeletonList: {
    gap: 10,
  },
  inviteSkeletonRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e2837',
    padding: 12,
    gap: 6,
  },
  inviteSkeletonLineShort: {
    height: 12,
    width: '40%',
    borderRadius: 6,
    backgroundColor: '#1f2735',
  },
  inviteSkeletonLineLong: {
    height: 12,
    width: '70%',
    borderRadius: 6,
    backgroundColor: '#1f2735',
  },
  menuPortal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  faded: {
    opacity: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  emptyStateTitle: {
    color: '#f5f7fb',
    fontSize: 16,
    fontWeight: '600',
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    backgroundColor: '#121a26',
  },
  trayHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1f2937',
    alignSelf: 'center',
    marginBottom: 16,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  actionCode: {
    color: '#8aa0c6',
    marginTop: 4,
  },
  actionClose: {
    padding: 6,
  },
  actionButton: {
    backgroundColor: '#1f2534',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  actionDanger: {
    backgroundColor: '#211122',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3f1627',
  },
  actionDangerText: {
    color: '#f97316',
    fontWeight: '600',
  },
});
