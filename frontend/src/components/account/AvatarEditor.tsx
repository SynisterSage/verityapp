import { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context/ThemeContext';
import { authorizedFetch } from '../../services/backend';
import ImagePickerModal from '../common/ImagePickerModal';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';

type AvatarEditorProps = {
  userId: string;
  currentAvatarUrl?: string | null;
  userName: string;
  onAvatarUpdated?: (newAvatarUrl: string | null) => void;
  size?: 'small' | 'medium' | 'large';
  editable?: boolean;
};

export default function AvatarEditor({
  userId,
  currentAvatarUrl,
  userName,
  onAvatarUpdated,
  size = 'medium',
  editable = true,
}: AvatarEditorProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createAvatarEditorStyles(theme, size), [theme, size]);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const getInitials = useCallback(() => {
    const names = userName.trim().split(/\s+/);
    if (names.length === 0) return '?';
    if (names.length === 1) return names[0][0]?.toUpperCase() || '?';
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  }, [userName]);

  const handleImageSelected = async (imageData: {
    base64: string;
    uri: string;
    width: number;
    height: number;
    mimeType: string;
  }) => {
    try {
      setIsUploading(true);

      // Call backend to upload avatar
      const response = await authorizedFetch(`/users/${userId}/avatar`, {
        method: 'POST',
        body: JSON.stringify({
          imageData: imageData.base64,
          mimeType: imageData.mimeType,
        }),
      });

      if (response.avatar_url) {
        onAvatarUpdated?.(response.avatar_url);
        setShowImagePicker(false);
        Alert.alert('Success', 'Profile picture updated');
      } else {
        Alert.alert('Error', 'Failed to update profile picture');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to upload avatar: ${error}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!currentAvatarUrl) {
      Alert.alert('Info', 'No profile picture to delete');
      return;
    }

    Alert.alert('Delete Profile Picture?', 'This action cannot be undone', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsDeleting(true);
            await authorizedFetch(`/users/${userId}/avatar`, {
              method: 'DELETE',
            });
            onAvatarUpdated?.(null);
            Alert.alert('Success', 'Profile picture deleted');
          } catch (error) {
            Alert.alert('Error', `Failed to delete avatar: ${error}`);
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  const sizeMap = { small: 64, medium: 128, large: 180 };
  const avatarSize = sizeMap[size];

  return (
    <>
      <View style={styles.container}>
        {/* Avatar Display */}
        <View style={styles.avatarWrapper}>
          <View style={[styles.avatarContainer, { width: avatarSize, height: avatarSize }]}>
            {currentAvatarUrl ? (
              <Image
                source={{ uri: currentAvatarUrl }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.initialsContainer}>
                <Text style={styles.initials}>{getInitials()}</Text>
              </View>
            )}

            {/* Loading Overlay */}
            {(isUploading || isDeleting) && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={theme.colors.text} />
              </View>
            )}
          </View>

          {/* Edit Button - Camera at bottom right (outside container) */}
          {editable && !isUploading && !isDeleting && (
            <Pressable
              style={styles.editButton}
              onPress={() => setShowImagePicker(true)}
            >
              <Ionicons name="camera" size={18} color={theme.colors.text} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Image Picker Modal */}
      <ImagePickerModal
        visible={showImagePicker}
        onImageSelected={handleImageSelected}
        onCancel={() => setShowImagePicker(false)}
        isLoading={isUploading}
      />
    </>
  );
}

function createAvatarEditorStyles(theme: AppTheme, size: 'small' | 'medium' | 'large') {
  const sizeMap = { small: 64, medium: 128, large: 180 };
  const avatarSize = sizeMap[size];
  const editButtonSize = size === 'small' ? 28 : size === 'medium' ? 36 : 44;
  const editIconSize = size === 'small' ? 14 : size === 'medium' ? 18 : 22;

  return StyleSheet.create({
    container: {
      alignItems: 'center',
      gap: 0,
    },
    avatarWrapper: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarContainer: {
      borderRadius: avatarSize / 2,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    avatar: {
      width: '100%',
      height: '100%',
    },
    initialsContainer: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.accent,
    },
    initials: {
      fontSize: avatarSize * 0.4,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    editButton: {
      position: 'absolute',
      bottom: -4,
      right: -4,
      width: editButtonSize,
      height: editButtonSize,
      borderRadius: editButtonSize / 2,
      backgroundColor: theme.colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 8,
    },
  });
}
