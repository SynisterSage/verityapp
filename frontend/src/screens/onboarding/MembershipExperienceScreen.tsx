import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Asset } from 'expo-asset';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { logEvent } from '../../services/sentry';

type SceneId =
  | 'problem'
  | 'threat'
  | 'intercept'
  | 'detection'
  | 'shield'
  | 'family'
  | 'result';

type StoryScene = {
  id: SceneId;
  label: string;
  title: string;
  subtitle?: string;
  mockup?: Exclude<SceneId, 'problem' | 'result'>;
  result?: boolean;
};

const STORY_SCENES: StoryScene[] = [
  {
    id: 'problem',
    label: 'THE PROBLEM',
    title: 'Ruth gets calls every day.',
    subtitle: "She can't tell which ones are safe.",
  },
  {
    id: 'threat',
    label: 'THE THREAT',
    title: 'An unknown number calls.',
    subtitle: "Flagged critical. Ruth doesn't know it yet.",
    mockup: 'threat',
  },
  {
    id: 'intercept',
    label: 'THE INTERCEPT',
    title: 'Verity answers first.',
    subtitle: 'The transcript reveals everything. Ruth never hears a word.',
    mockup: 'intercept',
  },
  {
    id: 'detection',
    label: 'THE DETECTION',
    title: 'The fraud engine flags it instantly.',
    subtitle: '100% risk score. Critical alert sent to you.',
    mockup: 'detection',
  },
  {
    id: 'shield',
    label: 'THE SHIELD',
    title: 'The people Ruth trusts always get through.',
    subtitle: 'Family, doctors, friends — verified and never screened.',
    mockup: 'shield',
  },
  {
    id: 'family',
    label: 'THE FAMILY',
    title: 'Your whole family stays informed.',
    subtitle: 'Caregivers and family members manage everything together.',
    mockup: 'family',
  },
  {
    id: 'result',
    label: 'THE RESULT',
    title: "Ruth never heard a word. You handled it in seconds. That's Verity.",
    result: true,
  },
];

const AUTO_ADVANCE_MS = 5000;
const TRANSITION_MS = 600;
const EXIT_MS = 420;
const SPRING_FRICTION = 12;
const SPRING_TENSION = 80;
const ENTRANCE_EASING = Easing.bezier(0.32, 1, 0.2, 1);
const MOCKUP_IMAGE_BY_SCENE: Record<Exclude<SceneId, 'problem' | 'result'>, number> = {
  threat: require('../../../assets/screenshots/how-it-works/recent.png'),
  intercept: require('../../../assets/screenshots/how-it-works/details.png'),
  detection: require('../../../assets/screenshots/how-it-works/alerts.png'),
  shield: require('../../../assets/screenshots/how-it-works/trusted.png'),
  family: require('../../../assets/screenshots/how-it-works/members.png'),
};

function StoryPhoneMockup({
  sceneId,
  styles,
}: {
  sceneId: Exclude<SceneId, 'problem' | 'result'>;
  styles: ReturnType<typeof createStyles>;
}) {
  const source = MOCKUP_IMAGE_BY_SCENE[sceneId];

  return (
    <View style={styles.mockupImageFrame}>
      <Image
        source={source}
        defaultSource={source}
        style={styles.mockupImage}
        resizeMode="contain"
        fadeDuration={0}
      />
    </View>
  );
}

function StoryScenePanel({
  scene,
  theme,
  mode,
  styles,
  phoneEntrance,
  onFinalCtaPress,
}: {
  scene: StoryScene;
  theme: AppTheme;
  mode: 'light' | 'dark';
  styles: ReturnType<typeof createStyles>;
  phoneEntrance: Animated.Value;
  onFinalCtaPress: () => void;
}) {
  const phoneAnimatedStyle = {
    opacity: phoneEntrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
    transform: [
      {
        translateY: phoneEntrance.interpolate({
          inputRange: [0, 1],
          outputRange: [188, 116],
        }),
      },
      {
        scale: phoneEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }),
      },
    ],
  };

  const resultTextColor = mode === 'light' ? theme.colors.surface : theme.colors.text;
  const isIntroScene = !scene.mockup && !scene.result;
  const isResultScene = Boolean(scene.result);
  const resultLines = scene.result ? scene.title.split('\n') : [];

  return (
    <View style={[styles.scenePanel, isIntroScene && styles.scenePanelIntro, isResultScene && styles.scenePanelResult]}>
      <View
        style={[
          styles.copyWrap,
          scene.mockup && styles.copyWrapMockup,
          isIntroScene && styles.copyWrapIntro,
          isResultScene && styles.copyWrapResult,
        ]}
      >
        <Text style={[styles.sceneLabel, scene.result && { color: withOpacity(resultTextColor, 0.78) }]}>
          {scene.label}
        </Text>
        {!scene.result ? <Text style={styles.sceneTitle}>{scene.title}</Text> : null}
        {scene.subtitle && !scene.result ? (
          <Text style={[styles.sceneSubtitle, scene.result && { color: withOpacity(resultTextColor, 0.82) }]}>
            {scene.subtitle}
          </Text>
        ) : null}
      </View>

      {scene.mockup ? (
        <Animated.View style={[styles.mockupWrap, phoneAnimatedStyle]}>
          <StoryPhoneMockup sceneId={scene.mockup} styles={styles} />
        </Animated.View>
      ) : null}

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
            <Text style={[styles.resultBadgeText, { color: resultTextColor }]}>Shield Active</Text>
          </View>
          <View style={styles.resultTitleWrap}>
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

          <Pressable style={styles.resultButton} onPress={onFinalCtaPress}>
            <Text style={styles.resultButtonText}>View Plans</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
          </Pressable>
          <Text style={[styles.resultMeta, { color: withOpacity(resultTextColor, 0.86) }]}>
            7-day free trial · Cancel anytime
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function MembershipExperienceScreen() {
  const navigation = useNavigation<
    NativeStackNavigationProp<RootStackParamList, 'MembershipExperience'>
  >();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { theme, mode } = useTheme();
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
  const phoneEntrance = useRef(new Animated.Value(1)).current;
  const staticPhoneValue = useRef(new Animated.Value(1)).current;
  const backgroundProgress = useRef(new Animated.Value(0)).current;

  const activeScene = STORY_SCENES[activeIndex] ?? STORY_SCENES[0];
  const isResultScene = Boolean(activeScene.result);
  const carouselTokens = useMemo(() => {
    const resultForeground = mode === 'light' ? theme.colors.surface : theme.colors.text;
    return {
      defaultTrack: withOpacity(theme.colors.textMuted, 0.24),
      defaultFill: theme.colors.accent,
      resultTrack: withOpacity(resultForeground, 0.26),
      resultFill: resultForeground,
    };
  }, [mode, theme.colors.accent, theme.colors.surface, theme.colors.text, theme.colors.textMuted]);

  const segmentInactiveWidth = theme.onboarding.progress.segmentInactiveWidth;
  const segmentActiveWidth = Math.max(30, theme.onboarding.progress.segmentActiveWidth * 3);
  const segmentGap = theme.spacing.xs;

  const progressMaxWidth = useMemo(() => {
    const horizontalPadding = theme.spacing.xl * 2;
    const totalGap = segmentGap * (STORY_SCENES.length - 1);
    const available = windowWidth - horizontalPadding - totalGap;
    const maxAllowed = Math.floor(available / STORY_SCENES.length);
    return Math.max(segmentActiveWidth, Math.min(42, maxAllowed));
  }, [segmentActiveWidth, segmentGap, theme.spacing.xl, windowWidth]);

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
    void Asset.loadAsync(Object.values(MOCKUP_IMAGE_BY_SCENE)).catch(() => null);
  }, []);

  useEffect(() => {
    if (hasLoggedViewRef.current) {
      return;
    }
    hasLoggedViewRef.current = true;
    logEvent('membership_experience_viewed', { screen: 'MembershipExperienceScreen' });
  }, []);

  useEffect(() => {
    const scene = STORY_SCENES[activeIndex];
    logEvent('membership_experience_scene_viewed', {
      screen: 'MembershipExperienceScreen',
      extra: {
        sceneId: scene.id,
        sceneLabel: scene.label,
        sceneIndex: activeIndex + 1,
        totalScenes: STORY_SCENES.length,
      },
    });
  }, [activeIndex]);

  useEffect(() => {
    phoneEntrance.stopAnimation();
    if (activeScene.mockup) {
      phoneEntrance.setValue(0);
      Animated.spring(phoneEntrance, {
        toValue: 1,
        friction: SPRING_FRICTION,
        tension: SPRING_TENSION,
        useNativeDriver: true,
      }).start();
      return;
    }
    phoneEntrance.setValue(1);
  }, [activeScene.mockup, phoneEntrance]);

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
      phoneEntrance.stopAnimation();
      backgroundProgress.stopAnimation();
    },
    [backgroundProgress, incomingProgress, outgoingProgress, phoneEntrance, progressAnim]
  );

  const backgroundColor = backgroundProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.bg, theme.colors.accent],
  });

  const onFinalCtaPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    logEvent('membership_experience_completed', {
      screen: 'MembershipExperienceScreen',
    });
    navigation.goBack();
  };

  const renderSceneLayer = (
    scene: StoryScene,
    layerStyle: { opacity: Animated.AnimatedInterpolation<string | number>; transform: { translateX: Animated.AnimatedInterpolation<string | number> }[] },
    phoneAnim: Animated.Value
  ) => (
    <Animated.View style={[styles.sceneLayer, layerStyle]} renderToHardwareTextureAndroid>
      <StoryScenePanel
        scene={scene}
        theme={theme}
        mode={mode}
        styles={styles}
        phoneEntrance={phoneAnim}
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

  const tapZoneTop = Math.max(insets.top, 12) + 74;
  const tapZoneBottom = isResultScene ? Math.max(insets.bottom, 20) + 142 : Math.max(insets.bottom, 18);

  return (
    <Animated.View style={[styles.root, { backgroundColor }]}>
      <SafeAreaView style={styles.screen} edges={[]}>
        <View style={[styles.headerWrap, { paddingTop: Math.max(insets.top, 12) }]}>
          <View style={styles.progressRow}>
            {STORY_SCENES.map((scene, index) => {
              const isComplete = index < activeIndex;
              const isActive = index === activeIndex;
              const animatedFillWidth = isActive
                ? progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, progressMaxWidth],
                })
                : isComplete
                  ? progressMaxWidth
                  : 0;

              const animatedFillColor = isActive
                ? progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                      withOpacity(isResultScene ? carouselTokens.resultFill : carouselTokens.defaultFill, 0.62),
                      isResultScene ? carouselTokens.resultFill : carouselTokens.defaultFill,
                    ],
                  })
                : isComplete
                  ? (isResultScene ? carouselTokens.resultFill : carouselTokens.defaultFill)
                  : (isResultScene ? carouselTokens.resultFill : carouselTokens.defaultFill);

              return (
                <View
                  key={scene.id}
                  style={[
                    styles.progressSegmentTrack,
                    {
                      width: progressMaxWidth,
                      backgroundColor: isResultScene
                        ? carouselTokens.resultTrack
                        : carouselTokens.defaultTrack,
                    },
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.progressSegmentFill,
                      {
                        width: animatedFillWidth,
                        backgroundColor: animatedFillColor,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>

          <View style={styles.navRow}>
            <Pressable
              style={[
                styles.iconButton,
                {
                  borderColor: isResultScene
                    ? withOpacity(theme.colors.surface, 0.36)
                    : mode === 'light'
                      ? withOpacity(theme.colors.text, 0.2)
                      : withOpacity(theme.colors.border, 0.95),
                  backgroundColor: isResultScene
                    ? withOpacity(theme.colors.surface, 0.14)
                    : mode === 'light'
                      ? withOpacity(theme.colors.text, 0.06)
                      : withOpacity(theme.colors.surface, 0.38),
                },
              ]}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => null);
                navigation.goBack();
              }}
            >
              <Ionicons
                name="chevron-down"
                size={20}
                color={isResultScene ? (mode === 'light' ? theme.colors.surface : theme.colors.text) : theme.colors.text}
              />
            </Pressable>
            <View style={styles.iconButtonPlaceholder} />
          </View>
        </View>

        <View style={styles.viewport}>
          <View style={styles.sceneViewport}>
            {outgoingIndex != null
              ? (
                  <>
                    {renderSceneLayer(STORY_SCENES[outgoingIndex], outgoingLayerStyle, staticPhoneValue)}
                    {renderSceneLayer(activeScene, incomingLayerStyle, phoneEntrance)}
                  </>
                )
              : (
                  <View style={styles.sceneLayerStatic} renderToHardwareTextureAndroid>
                    <StoryScenePanel
                      scene={activeScene}
                      theme={theme}
                      mode={mode}
                      styles={styles}
                      phoneEntrance={phoneEntrance}
                      onFinalCtaPress={onFinalCtaPress}
                    />
                  </View>
                )}
          </View>
        </View>

        <View
          pointerEvents="box-none"
          style={[
            styles.tapZoneLayer,
            {
              top: tapZoneTop,
              bottom: tapZoneBottom,
            },
          ]}
        >
          <Pressable
            style={styles.tapZone}
            onPress={() => transitionToIndex(activeIndexRef.current - 1, 'tap')}
          />
          <Pressable
            style={styles.tapZone}
            onPress={() => transitionToIndex(activeIndexRef.current + 1, 'tap')}
          />
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    screen: {
      flex: 1,
    },
    headerWrap: {
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.md,
      zIndex: 4,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    progressSegmentTrack: {
      height: 4,
      borderRadius: 999,
      overflow: 'hidden',
    },
    progressSegmentFill: {
      height: 4,
      borderRadius: 999,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.border, 0.95),
      backgroundColor: withOpacity(theme.colors.surface, 0.38),
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonPlaceholder: {
      width: 34,
      height: 34,
    },
    viewport: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
    },
    sceneViewport: {
      flex: 1,
      overflow: 'visible',
    },
    sceneLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    sceneLayerStatic: {
      flex: 1,
    },
    scenePanel: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: theme.spacing.lg,
    },
    scenePanelIntro: {
      justifyContent: 'center',
      paddingBottom: theme.spacing.xxl,
    },
    scenePanelResult: {
      justifyContent: 'flex-start',
      paddingTop: theme.spacing.sm,
    },
    copyWrap: {
      alignItems: 'center',
      gap: theme.spacing.sm,
      width: '100%',
      paddingHorizontal: theme.spacing.md,
      maxWidth: 360,
      minHeight: 256,
      zIndex: 2,
    },
    copyWrapIntro: {
      minHeight: 0,
      maxWidth: 320,
    },
    copyWrapResult: {
      minHeight: 0,
      maxWidth: 320,
      marginBottom: theme.spacing.xs,
    },
    copyWrapMockup: {
      minHeight: 292,
    },
    sceneLabel: {
      fontSize: theme.typography.captionStrong.size,
      lineHeight: theme.typography.captionStrong.lineHeight,
      fontWeight: '800',
      letterSpacing: 2.6,
      textTransform: 'uppercase',
      color: withOpacity(theme.colors.textMuted, 0.86),
      textAlign: 'center',
    },
    sceneTitle: {
      fontSize: 38,
      lineHeight: 44,
      fontWeight: '700',
      color: theme.colors.text,
      letterSpacing: -1.1,
      textAlign: 'center',
      marginBottom: theme.spacing.sm,
    },
    sceneSubtitle: {
      marginTop: 0,
      fontSize: theme.typography.body.size,
      lineHeight: theme.typography.body.lineHeight,
      fontWeight: '500',
      color: withOpacity(theme.colors.textMuted, 0.96),
      textAlign: 'center',
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.xl,
    },
    mockupWrap: {
      width: '100%',
      flex: 1,
      alignItems: 'center',
      paddingTop: 56,
      justifyContent: 'flex-end',
      zIndex: 1,
    },
    mockupImageFrame: {
      width: '72%',
      maxWidth: 268,
      aspectRatio: 0.567,
      borderRadius: theme.radii.lg,
      overflow: 'visible',
    },
    mockupImage: {
      width: '100%',
      height: '100%',
    },
    resultWrap: {
      marginTop: 0,
      width: '100%',
      alignItems: 'center',
      paddingBottom: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    resultIconWrap: {
      width: 128,
      height: 128,
      borderRadius: 64,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    resultBadge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
    },
    resultBadgeText: {
      fontSize: theme.typography.caption.size,
      lineHeight: theme.typography.caption.lineHeight,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    resultTitleWrap: {
      alignItems: 'center',
      gap: theme.spacing.xs,
      maxWidth: 320,
    },
    resultTitleLine: {
      fontSize: 38,
      lineHeight: 44,
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: -0.7,
    },
    resultTitleLineMiddle: {
      opacity: 0.96,
    },
    resultButton: {
      width: '100%',
      maxWidth: 260,
      minHeight: 60,
      borderRadius: 30,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    resultButtonText: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '700',
      color: theme.colors.accent,
      letterSpacing: -0.3,
    },
    resultMeta: {
      fontSize: theme.typography.caption.size,
      lineHeight: theme.typography.caption.lineHeight,
      fontWeight: '500',
      textAlign: 'center',
    },
    tapZoneLayer: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      zIndex: 3,
    },
    tapZone: {
      flex: 1,
    },
  });
