import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { logEvent } from '../../services/sentry';

type SceneId = 'opportunity' | 'flexible' | 'coverage' | 'result';

type FullCoverageScene = {
  id: SceneId;
  label: string;
  title: string;
  subtitle?: string;
  body?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  result?: boolean;
};

const STORY_SCENES: FullCoverageScene[] = [
  {
    id: 'opportunity',
    label: 'THE OPPORTUNITY',
    title: 'Two phones.',
    subtitle: 'Better peace of mind.',
    body: 'Add a landline alongside your mobile. Call routing can handle both, so your family can reach you however they prefer.',
    icon: 'phone-portrait-outline',
    iconColor: '#4FACFE',
  },
  {
    id: 'flexible',
    label: 'THE FLEXIBILITY',
    title: 'Route calls your way.',
    subtitle: 'Control where calls go.',
    body: 'Set which calls go to your mobile or landline. Each route independently protected. Change your setup anytime in Settings.',
    icon: 'git-branch-outline',
    iconColor: '#4FACFE',
  },
  {
    id: 'coverage',
    label: 'THE COVERAGE',
    title: 'Full protection everywhere.',
    subtitle: 'Every phone line covered.',
    body: 'Whether they call your mobile or landline, Verity is there. No more missed connections—just smarter protection.',
    icon: 'shield-checkmark-outline',
    iconColor: '#34C759',
  },
  {
    id: 'result',
    label: '',
    title: 'One app.\nComplete coverage.\nTotal peace of mind.',
    result: true,
    icon: 'checkmark-circle-outline',
    iconColor: '#4FACFE',
  },
];

const AUTO_ADVANCE_MS = 5000;
const TRANSITION_MS = 1000;
const EXIT_MS = 700;
const SPRING_FRICTION = 12;
const SPRING_TENSION = 80;
const ENTRANCE_EASING = Easing.bezier(0.32, 1, 0.2, 1);

function StoryScenePanel({
  scene,
  theme,
  mode,
  styles,
  isLoggedIn,
  onFinalCtaPress,
}: {
  scene: FullCoverageScene;
  theme: AppTheme;
  mode: 'light' | 'dark';
  styles: ReturnType<typeof createStyles>;
  isLoggedIn: boolean;
  onFinalCtaPress: () => void;
}) {
  // On accent background, use light text for proper contrast
  const resultTextColor = '#ffffff';
  const isResultScene = Boolean(scene.result);
  const resultLines = scene.result ? scene.title.split('\n') : [];

  return (
    <View style={[styles.scenePanel, isResultScene && styles.scenePanelResult]}>
      <View
        style={[
          styles.copyWrap,
          isResultScene && styles.copyWrapResult,
        ]}
      >
        <Text style={[styles.sceneLabel, scene.result && { color: withOpacity(resultTextColor, 0.78) }]}>
          {scene.label}
        </Text>
        {!scene.result ? (
          <>
            <View style={styles.iconWrap}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: withOpacity(scene.iconColor, 0.12) },
                ]}
              >
                <Ionicons name={scene.icon} size={32} color={scene.iconColor} />
              </View>
            </View>
            <Text style={[styles.sceneTitle]}>{scene.title}</Text>
            {scene.subtitle && (
              <Text style={[styles.sceneSubtitle]}>{scene.subtitle}</Text>
            )}
            {scene.body && (
              <Text style={[styles.sceneBody]}>{scene.body}</Text>
            )}
          </>
        ) : null}
      </View>

      {scene.result ? (
        <View style={styles.resultWrap}>
          <View
            style={[
              styles.resultIconWrap,
              { borderColor: withOpacity(resultTextColor, 0.24), backgroundColor: withOpacity(resultTextColor, 0.08) },
            ]}
          >
            <Ionicons name="shield-checkmark-outline" size={54} color={resultTextColor} />
          </View>
          <View
            style={[
              styles.resultBadge,
              {
                backgroundColor: withOpacity(resultTextColor, 0.12),
                borderColor: withOpacity(resultTextColor, 0.26),
              },
            ]}
          >
            <Text style={[styles.resultBadgeText, { color: resultTextColor }]}>Full Coverage Ready</Text>
          </View>
          <View style={[styles.resultTitleWrap, { marginTop: 32 }]}>
            {resultLines.map((line, index) => (
              <Text
                key={`${line}-${index}`}
                style={[
                  styles.resultTitleLine,
                  index === 1 && styles.resultTitleLineMiddle,
                  { color: resultTextColor },
                ]}
              >
                {line}
              </Text>
            ))}
          </View>

          <Pressable 
            style={({ pressed }) => [
              styles.resultButton, 
              {
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
                opacity: pressed ? 0.7 : 1,
              }
            ]} 
            onPress={onFinalCtaPress}
          >
            <Text style={[styles.resultButtonText, { color: '#ffffff' }]}>
              {isLoggedIn ? 'Start Setup' : 'View Plans'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={'#ffffff'} />
          </Pressable>
          <Text style={[styles.resultMeta, { color: withOpacity(resultTextColor, 0.86) }]}>
            {isLoggedIn ? 'Add landline anytime' : 'Sign in to set up'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function FullCoverageScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { theme, mode } = useTheme();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);

  const activeIndexRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const queuedIndexRef = useRef<number | null>(null);
  const hasLoggedViewRef = useRef(false);

  const incomingProgress = useRef(new Animated.Value(1)).current;
  const outgoingProgress = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const backgroundProgress = useRef(new Animated.Value(0)).current;

  const activeScene = STORY_SCENES[activeIndex] ?? STORY_SCENES[0];
  const isResultScene = Boolean(activeScene.result);

  const segmentInactiveWidth = 6;
  const segmentActiveWidth = 26;
  const segmentGap = 6;

  const progressMaxWidth = useMemo(() => {
    const horizontalPadding = 32 * 2;
    const totalGap = segmentGap * (STORY_SCENES.length - 1);
    const available = windowWidth - horizontalPadding - totalGap;
    const maxAllowed = Math.floor(available / STORY_SCENES.length);
    return Math.max(segmentActiveWidth, Math.min(42, maxAllowed));
  }, [windowWidth]);

  const transitionToIndex = useCallback(
    (targetIndex: number, source: 'tap' | 'auto') => {
      const bounded = Math.max(0, Math.min(STORY_SCENES.length - 1, targetIndex));
      const current = activeIndexRef.current;
      if (bounded === current) {
        return;
      }

      if (isTransitioningRef.current) {
        queuedIndexRef.current = bounded;
        return;
      }

      isTransitioningRef.current = true;
      queuedIndexRef.current = null;
      progressAnim.stopAnimation();

      const nextDirection: 1 | -1 = bounded > current ? 1 : -1;
      setDirection(nextDirection);
      setOutgoingIndex(current);
      setActiveIndex(bounded);

      if (source === 'tap') {
        void Haptics.selectionAsync().catch(() => null);
      }

      incomingProgress.stopAnimation();
      outgoingProgress.stopAnimation();
      incomingProgress.setValue(0);
      outgoingProgress.setValue(0);

      Animated.parallel([
        Animated.timing(incomingProgress, {
          toValue: 1,
          duration: TRANSITION_MS,
          easing: ENTRANCE_EASING,
          useNativeDriver: true,
        }),
        Animated.timing(outgoingProgress, {
          toValue: 1,
          duration: EXIT_MS,
          easing: ENTRANCE_EASING,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setOutgoingIndex(null);
        incomingProgress.setValue(1);
        outgoingProgress.setValue(0);
        isTransitioningRef.current = false;

        const queued = queuedIndexRef.current;
        if (queued != null && queued !== activeIndexRef.current) {
          queuedIndexRef.current = null;
          transitionToIndex(queued, 'tap');
        }
      });
    },
    [incomingProgress, outgoingProgress, progressAnim]
  );

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (hasLoggedViewRef.current) {
      return;
    }
    hasLoggedViewRef.current = true;
    logEvent('fullcoverage_viewed', { screen: 'FullCoverageScreen' });
  }, []);

  useEffect(() => {
    const scene = STORY_SCENES[activeIndex];
    logEvent('fullcoverage_scene_viewed', {
      screen: 'FullCoverageScreen',
      extra: {
        sceneId: scene.id,
        sceneLabel: scene.label,
        sceneIndex: activeIndex + 1,
        totalScenes: STORY_SCENES.length,
      },
    });
  }, [activeIndex]);

  useEffect(() => {
    Animated.timing(backgroundProgress, {
      toValue: isResultScene ? 1 : 0,
      duration: TRANSITION_MS,
      easing: ENTRANCE_EASING,
      useNativeDriver: false,
    }).start();
  }, [backgroundProgress, isResultScene]);

  useEffect(() => {
    progressAnim.stopAnimation();
    progressAnim.setValue(0);

    if (activeIndex >= STORY_SCENES.length - 1) {
      return;
    }

    const progressTiming = Animated.timing(progressAnim, {
      toValue: 1,
      duration: AUTO_ADVANCE_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    progressTiming.start(({ finished }) => {
      if (!finished) {
        return;
      }
      if (activeIndexRef.current !== activeIndex) {
        return;
      }
      transitionToIndex(activeIndex + 1, 'auto');
    });

    return () => {
      progressTiming.stop();
    };
  }, [activeIndex, progressAnim, transitionToIndex]);

  useEffect(
    () => () => {
      progressAnim.stopAnimation();
      incomingProgress.stopAnimation();
      outgoingProgress.stopAnimation();
      backgroundProgress.stopAnimation();
    },
    [backgroundProgress, incomingProgress, outgoingProgress, progressAnim]
  );

  const backgroundColor = backgroundProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.bg, theme.colors.accent],
  });

  const onFinalCtaPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    logEvent('fullcoverage_cta_pressed', {
      screen: 'FullCoverageScreen',
      extra: { isLoggedIn, action: isLoggedIn ? 'start_setup' : 'start_setup' },
    });
    if (isLoggedIn) {
      navigation.navigate('Account', { fromFullCoverageSetup: true });
    } else {
      // Show SignIn with login alert
      navigation.navigate('SignIn', { loginAlert: true, fromFullCoverageSetup: true });
    }
  };

  const renderSceneLayer = (
    scene: FullCoverageScene,
    layerStyle: { opacity: Animated.AnimatedInterpolation<string | number>; transform: { translateX: Animated.AnimatedInterpolation<string | number> }[] }
  ) => (
    <Animated.View style={[styles.sceneLayer, layerStyle]} renderToHardwareTextureAndroid>
      <StoryScenePanel
        scene={scene}
        theme={theme}
        mode={mode}
        styles={styles}
        isLoggedIn={isLoggedIn}
        onFinalCtaPress={onFinalCtaPress}
      />
    </Animated.View>
  );

  const incomingLayerStyle = {
    opacity: incomingProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
    transform: [
      {
        translateX: incomingProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [direction === 1 ? 36 : -36, 0],
        }),
      },
    ],
  };

  const outgoingLayerStyle = {
    opacity: outgoingProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [
      {
        translateX: outgoingProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, direction === 1 ? -36 : 36],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[styles.screen, { backgroundColor }]}>
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={[styles.headerWrap, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => null);
              logEvent('fullcoverage_back_pressed', { screen: 'FullCoverageScreen' });
              navigation.goBack();
            }}
          >
            <Ionicons name="chevron-back" size={18} color={isResultScene ? '#ffffff' : theme.colors.text} />
          </Pressable>
        </View>

        <View style={styles.sceneContainer}>
          {activeIndex != null && renderSceneLayer(activeScene, incomingLayerStyle)}
          {outgoingIndex != null && renderSceneLayer(STORY_SCENES[outgoingIndex], outgoingLayerStyle)}
        </View>

        <View style={[styles.progressWrap, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Pressable
            style={({ pressed }) => {
              const baseStyle = {
                opacity: pressed ? 0.8 : 1,
              };
              if (isResultScene) {
                return [
                  styles.continueButton,
                  {
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    borderColor: 'rgba(255, 255, 255, 0.4)',
                  },
                  baseStyle,
                ];
              }
              return [
                styles.continueButton,
                {
                  backgroundColor: withOpacity(theme.colors.text, 0.1),
                },
                baseStyle,
              ];
            }}
            onPress={() => {
              if (activeIndex === STORY_SCENES.length - 1) {
                // Done button - close the screen
                void Haptics.selectionAsync().catch(() => null);
                navigation.goBack();
              } else {
                // Continue button - advance to next scene
                transitionToIndex(activeIndex + 1, 'tap');
              }
            }}
          >
            <Text style={[
              styles.continueButtonText,
              {
                color: isResultScene ? '#ffffff' : theme.colors.text,
              }
            ]}>
              {activeIndex === STORY_SCENES.length - 1 ? '✓ Done' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
      justifyContent: 'space-between',
    },
    headerWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 8,
    },
    backButton: {
      padding: 12,
      marginLeft: -12,
    },
    sceneContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    sceneLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    scenePanel: {
      paddingHorizontal: 24,
      paddingVertical: 40,
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scenePanelResult: {
      // Background handled by parent Animated.View
    },
    copyWrap: {
      alignItems: 'center',
      gap: 12,
    },
    copyWrapResult: {
      gap: 20,
    },
    sceneLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    iconWrap: {
      marginVertical: 8,
    },
    iconCircle: {
      width: 70,
      height: 70,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sceneTitle: {
      fontSize: 28,
      fontWeight: '700',
      textAlign: 'center',
      color: theme.colors.text,
      lineHeight: 36,
    },
    sceneSubtitle: {
      fontSize: 15,
      fontWeight: '500',
      textAlign: 'center',
      color: theme.colors.textMuted,
      lineHeight: 22,
    },
    sceneBody: {
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      color: theme.colors.textMuted,
      marginTop: 6,
    },
    resultWrap: {
      alignItems: 'center',
      gap: 12,
    },
    resultIconWrap: {
      width: 90,
      height: 90,
      borderRadius: 22,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultBadge: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 12,
      borderWidth: 1,
    },
    resultBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    resultTitleWrap: {
        paddingBottom: 12,
      alignItems: 'center',
      marginTop: 8,
      gap: 0,
    },
    resultTitleLine: {
      fontSize: 26,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 34,
    },
    resultTitleLineMiddle: {
      marginVertical: 2,
    },
    resultButton: {
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 24,
    },
    resultButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    resultMeta: {
      fontSize: 12,
      fontWeight: '400',
    },
    progressWrap: {
      paddingHorizontal: 32,
      paddingTop: 20,
      gap: 16,
      alignItems: 'center',
    },
    progressBar: {
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      alignItems: 'center',
    },
    progressSegment: {
      height: 3,
      borderRadius: 2,
    },
    continueButton: {
      paddingVertical: 12,
      paddingHorizontal: 32,
      borderRadius: 12,
      alignItems: 'center',
      width: '100%',
    },
    continueButtonText: {
      fontSize: 15,
      fontWeight: '600',
    },
  });
