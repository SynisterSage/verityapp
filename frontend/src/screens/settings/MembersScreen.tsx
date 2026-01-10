import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
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
import { useAuth } from '../../context/AuthContext';

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
};

const avatarColors = ['#4c7dff', '#6e60f8', '#00c2ff', '#47d6a5'];
const ROLE_DISPLAY_NAMES: Record<MemberRole, string> = {
  editor: 'Family',
  admin: 'Caretaker',
};
const MENU_WIDTH = 140;
const MENU_HEIGHT = 90;

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
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [inviteRole, setInviteRole] = useState<MemberRole>('editor');
  const [inviteError, setInviteError] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const highlightInviteEntry = route.params?.highlightInviteEntry ?? false;
  const { session } = useAuth();
  const [activeMemberMenuId, setActiveMemberMenuId] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const sessionUserId = session?.user?.id ?? null;
  const currentMembership = members.find((member) => member.user_id === sessionUserId);
  const currentUserIsAdmin = Boolean(
    currentMembership && (currentMembership.is_caretaker || currentMembership.role === 'admin')
  );
  const currentUserIsCaretaker = Boolean(currentMembership?.is_caretaker);
  const rowRefs = useRef<Map<string, View>>(new Map());
  const [menuAnchor, setMenuAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [menuMember, setMenuMember] = useState<Member | null>(null);
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `member-skeleton-${i}`), []);
  const showMembersSkeleton = loadingMembers && members.length === 0;
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
    fetchMembers();
    fetchInvites();
    setInviteError('');
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

  const copyInviteCode = async (invite: Invite) => {
    const code = invite.short_code ?? invite.id ?? '';
    if (!code) {
      return;
    }
    await Clipboard.setStringAsync(code);
    Alert.alert('Code copied', 'Paste it into the Enter invite code screen.');
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

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      closeMemberMenu();
    });
    return unsubscribe;
  }, [navigation, closeMemberMenu]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      closeMemberMenu();
    });
    return unsubscribe;
  }, [navigation, closeMemberMenu]);

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

  const windowWidth = Dimensions.get('window').width;
  const windowHeight = Dimensions.get('window').height;
  const menuPosition =
    menuAnchor === null
      ? null
      : {
          top: Math.min(
            Math.max(16, menuAnchor.y + menuAnchor.height / 2 - MENU_HEIGHT / 2),
            windowHeight - MENU_HEIGHT - 16
          ),
          left: Math.max(
            16,
            Math.min(
              menuAnchor.x + menuAnchor.width - MENU_WIDTH,
              Math.max(16, windowWidth - MENU_WIDTH - 16)
            )
          ),
        };

  const handleChangeMemberRole = (member: Member, role: MemberRole) => {
    if (member.role === role) {
      return;
    }
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

  const updateMemberRole = async (member: Member, role: MemberRole) => {
    if (!activeProfile) {
      return;
    }
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

  const confirmRemoveMember = (member: Member) => {
    Alert.alert(
      'Remove member',
      `Remove ${member.display_name ?? 'this member'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => handleRemoveMember(member),
        },
      ],
      { cancelable: true }
    );
  };
  const handleRemoveMember = async (member: Member) => {
    if (!activeProfile) {
      return;
    }
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
    if (inviteRole === 'admin') {
      Alert.alert(
        'Admin invite warning',
        'Admins have full control and can remove or update members. Continue?',
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

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#f5f7fb" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Members</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        scrollEnabled={!menuMember}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.sectionCard, highlightInviteEntry && styles.highlightCard]}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.headerLabel}>
              <Ionicons name="people-outline" size={18} color="#7d9dff" />
              <Text style={styles.sectionTitle}>Current Members</Text>
            </View>
          </View>
          <Text
            style={[
              styles.sectionDescription,
              styles.sectionDescriptionSpacing,
              styles.headerDescription,
            ]}
          >
            Every trusted member with access to this profile.
          </Text>
          <View style={styles.membersList}>
            {showMembersSkeleton ? (
              skeletonRows.map((key) => (
                <Animated.View
                  key={key}
                  style={[styles.memberRow, styles.memberRowSkeleton, { opacity: shimmer }]}
                >
                  <View style={styles.skeletonAvatar} />
                  <View style={styles.skeletonContent}>
                    <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                    <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
                  </View>
                </Animated.View>
              ))
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
                    <View style={styles.memberItem}>
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
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Invite Someone</Text>
            <Text style={[styles.sectionDescription, styles.sectionDescriptionSpacing]}>
              Tap Create Invite to send a Verity Protect link.
            </Text>
          </View>
          <View style={[styles.roleRow, styles.roleRowSpacing]}>
            {(['editor', 'admin'] as MemberRole[]).map((role) => (
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
                  {ROLE_DISPLAY_NAMES[role] ?? role}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {inviteError ? <Text style={styles.error}>{inviteError}</Text> : null}
          <TouchableOpacity
            style={[styles.button, styles.inviteButton, isInviting && styles.disabledButton]}
            onPress={handleCreateInvite}
            disabled={isInviting}
          >
            <Text style={styles.buttonText}>{isInviting ? 'Creating…' : 'Create invite'}</Text>
          </TouchableOpacity>
        </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pending invites</Text>
          <Text style={styles.sectionDescription}>
            Manage your sent invitations below.
          </Text>
        </View>
        <View style={styles.invitesList}>
          {loadingInvites ? (
            <Text style={styles.placeholder}>Checking invites…</Text>
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
              const statusLabel = formatStatus(invite.status);
              return (
                <View key={invite.id} style={styles.pendingInviteRow}>
                  <Text style={styles.pendingInviteLabel}>
                    {roleLabel} • {statusLabel}
                  </Text>
                  <View style={styles.codeRow}>
                    <View style={styles.codePill}>
                      <Text style={styles.codeText}>{shortCode}</Text>
                    </View>
                    <View style={styles.codeActions}>
                      <TouchableOpacity
                        onPress={() => shareInvite(invite)}
                        style={styles.actionIcon}
                      >
                        <Ionicons name="share-social-outline" size={18} color="#7d9dff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => shareViaSMS(invite)}
                        style={styles.actionIcon}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={18} color="#7d9dff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => copyInviteCode(invite)}
                        style={styles.actionIcon}
                      >
                        <Ionicons name="copy-outline" size={18} color="#7d9dff" />
                      </TouchableOpacity>
                      {currentUserIsCaretaker && (
                        <TouchableOpacity
                          onPress={() => confirmRevokeInvite(invite)}
                          style={styles.actionIcon}
                          disabled={revokingInviteId === invite.id}
                        >
                          {revokingInviteId === invite.id ? (
                            <ActivityIndicator size="small" color="#7d9dff" />
                          ) : (
                            <Ionicons name="trash-outline" size={18} color="#ff6d6d" />
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
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
    </ScrollView>
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
                onPress={() => handleChangeMemberRole(menuMember, option)}
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
            onPress={() => {
              if (menuMember) {
                confirmRemoveMember(menuMember);
              }
            }}
            disabled={removingMemberId === menuMember.id}
          >
            <Text style={styles.menuItemText}>Remove member</Text>
          </TouchableOpacity>
        </View>
      </View>
    )}
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  sectionCard: {
    backgroundColor: '#121a26',
    borderWidth: 1,
    borderColor: '#202c3c',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
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
  sectionHeader: {
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
  headerDescription: {
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subhead: {
    color: '#8aa0c6',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  membersList: {
    gap: 6,
  },
  memberItem: {
    position: 'relative',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#181f2e',
    gap: 12,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  memberRowSkeleton: {
    borderBottomColor: '#1f2735',
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
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberMenu: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#0f1523',
    borderRadius: 14,
    borderColor: '#1f2735',
    borderWidth: 1,
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
  },
  placeholder: {
    color: '#95a2bd',
    fontSize: 13,
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
  roleRowSpacing: {
    marginTop: 6,
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
  inviteButton: {
    marginTop: 12,
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
  menuPortal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  invitesList: {
    gap: 10,
  },
  pendingInviteRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#1b2333',
    paddingBottom: 12,
    marginBottom: 12,
  },
  pendingInviteLabel: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 14,
  },
  codePill: {
    borderWidth: 1,
    borderColor: '#7d9dff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#0f1523',
  },
  codeText: {
    color: '#f5f7fb',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  codeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2735',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  enterCodeButton: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2735',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  enterCodeText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
});
