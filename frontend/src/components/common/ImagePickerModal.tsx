import { useState, useCallback } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Platform,
  Alert,
  Pressable,
  Text,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePickerLib from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';

type ImageData = {
  base64: string;
  uri: string;
  width: number;
  height: number;
  mimeType: string;
  fileName: string;
};

type ImagePickerModalProps = {
  visible: boolean;
  onImageSelected: (imageData: ImageData) => void;
  onCancel: () => void;
  isLoading?: boolean;
};

export default function ImagePickerModal({
  visible,
  onImageSelected,
  onCancel,
  isLoading = false,
}: ImagePickerModalProps) {
  const { theme } = useTheme();
  const styles = useCallback(() => createImagePickerStyles(theme), [theme])();
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const processImage = async (result: ImagePickerLib.ImagePickerResult) => {
    if (result.canceled) {
      setIsProcessing(false);
      return;
    }

    try {
      const asset = result.assets[0];

      if (!asset.uri || !asset.width || !asset.height) {
        Alert.alert('Error', 'Failed to process image. Please try again.');
        return;
      }

      // Check file size
      const maxSizeMB = 5;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const fileSizeMB = blob.size / (1024 * 1024);

      if (fileSizeMB > maxSizeMB) {
        Alert.alert(
          'Image Too Large',
          `Please select an image smaller than ${maxSizeMB}MB. Your image is ${fileSizeMB.toFixed(
            2
          )}MB.`
        );
        setIsProcessing(false);
        return;
      }

      // Get base64 directly from picker
      const base64 = asset.base64 || '';

      const imageData: ImageData = {
        base64,
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType || 'image/jpeg',
        fileName: asset.fileName || `photo_${Date.now()}.jpg`,
      };

      setSelectedImage(imageData);
    } catch (error) {
      Alert.alert('Error', `Failed to process image: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      setIsProcessing(true);
      
      // Request camera permission explicitly first
      const { status: cameraStatus } = await ImagePickerLib.requestCameraPermissionsAsync();
      
      if (cameraStatus !== 'granted') {
        setIsProcessing(false);
        Alert.alert(
          'Camera Permission Required',
          'Camera access is needed to take a photo. Please enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openURL('app-settings:com.verityprotect');
                }
              },
            },
          ]
        );
        return;
      }

      const result = await ImagePickerLib.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      await processImage(result);
    } catch (error) {
      setIsProcessing(false);
      Alert.alert(
        'Camera Error',
        'Unable to access camera. Please check your permissions and try again.'
      );
      console.error('Camera error:', error);
    }
  };

  const handleSelectFromLibrary = async () => {
    try {
      setIsProcessing(true);
      
      // Request media library permission explicitly first
      const { status: libraryStatus } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
      
      if (libraryStatus !== 'granted') {
        setIsProcessing(false);
        Alert.alert(
          'Photo Library Permission Required',
          'Photo library access is needed to select a photo. Please enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openURL('app-settings:com.verityprotect');
                }
              },
            },
          ]
        );
        return;
      }

      const result = await ImagePickerLib.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      await processImage(result);
    } catch (error) {
      setIsProcessing(false);
      Alert.alert(
        'Library Error',
        'Unable to access photo library. Please check your permissions and try again.'
      );
      console.error('Library error:', error);
    }
  };

  const handleConfirm = () => {
    if (selectedImage) {
      onImageSelected(selectedImage);
      setSelectedImage(null);
    }
  };

  const handleCancel = () => {
    setSelectedImage(null);
    onCancel();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleCancel} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Select Profile Picture</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {!selectedImage ? (
            <>
              {/* Instructions */}
              <Text style={styles.instructions}>
                Choose a photo for your profile picture
              </Text>

              {/* Action Buttons */}
              <View style={styles.buttonContainer}>
                <Pressable
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleTakePhoto}
                  disabled={isProcessing || isLoading}
                >
                  <Ionicons
                    name="camera"
                    size={24}
                    color="#fff"
                    style={styles.buttonIcon}
                  />
                  <View style={styles.buttonContent}>
                    <Text style={styles.buttonTitle}>Take a Photo</Text>
                    <Text style={styles.buttonSubtitle}>Use your camera</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={[styles.button, styles.secondaryButton]}
                  onPress={handleSelectFromLibrary}
                  disabled={isProcessing || isLoading}
                >
                  <Ionicons
                    name="image"
                    size={24}
                    color={theme.colors.text}
                    style={styles.buttonIcon}
                  />
                  <View style={styles.buttonContent}>
                    <Text style={[styles.buttonTitle, styles.secondaryButtonText]}>
                      Choose from Library
                    </Text>
                    <Text style={[styles.buttonSubtitle, styles.secondaryButtonText]}>
                      Use an existing photo
                    </Text>
                  </View>
                </Pressable>
              </View>

              {/* Info */}
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>JPEG, PNG, HEIC • Max 5MB</Text>
              </View>
            </>
          ) : (
            <>
              {/* Preview */}
              <Text style={styles.previewTitle}>Preview</Text>
              <Image
                source={{ uri: selectedImage.uri }}
                style={styles.previewImage}
              />

              {/* Buttons */}
              <View style={styles.previewButtonContainer}>
                <Pressable
                  style={[styles.button, styles.secondaryButton]}
                  onPress={() => setSelectedImage(null)}
                  disabled={isLoading}
                >
                  <Text style={[styles.buttonTitle, styles.secondaryButtonText]}>
                    Choose Different
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleConfirm}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark"
                        size={24}
                        color="#fff"
                        style={styles.buttonIcon}
                      />
                      <Text style={styles.buttonTitle}>Use This Photo</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          )}

          {isProcessing && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator
                size="large"
                color={theme.colors.accent}
              />
              <Text style={styles.loadingText}>Processing image...</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function createImagePickerStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    closeButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      flex: 1,
      padding: 24,
      justifyContent: 'flex-start',
    },
    instructions: {
      fontSize: 16,
      color: theme.colors.textMuted,
      marginBottom: 32,
      textAlign: 'center',
    },
    buttonContainer: {
      gap: 12,
      marginBottom: 32,
    },
    previewButtonContainer: {
      gap: 12,
      marginTop: 'auto',
    },
    button: {
      flexDirection: 'row',
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderRadius: 12,
      alignItems: 'center',
      gap: 12,
    },
    primaryButton: {
      backgroundColor: theme.colors.accent,
    },
    secondaryButton: {
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    buttonIcon: {
      marginRight: 4,
    },
    buttonContent: {
      flex: 1,
      justifyContent: 'center',
    },
    buttonTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
      marginBottom: 2,
    },
    secondaryButtonText: {
      color: theme.colors.text,
    },
    buttonSubtitle: {
      fontSize: 13,
      color: '#fff',
      opacity: 0.8,
    },
    infoBox: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surfaceAlt,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      color: theme.colors.text,
      lineHeight: 18,
      textAlign: 'center',
    },
    previewTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 16,
    },
    previewImage: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 12,
      marginBottom: 32,
      backgroundColor: theme.colors.surfaceAlt,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
      borderRadius: 12,
    },
    loadingText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '500',
    },
  });
}
