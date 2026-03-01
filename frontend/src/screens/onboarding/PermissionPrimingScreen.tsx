import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { CommonActions, useNavigation } from '@react-navigation/native';

import { useTheme } from '../../context/ThemeContext';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';

type PermState = 'idle' | 'granted' | 'denied';

type PermRow = {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  reason: string;
  isInfoOnly?: boolean;
};

const PERMISSIONS: PermRow[] = [
  {
    key: 'microphone',
    icon: 'mic-outline',
    title: 'Microphone',
    reason: 'Needed to screen and connect your calls.',
  },
  {
    key: 'notifications',
    icon: 'notifications-outline',
    title: 'Notifications',
    reason: 'So you hear about calls and circle activity right away.',
  },
  {
    key: 'location',
    icon: 'location-outline',
    title: 'Location',
    reason: 'Helps find nearby care providers in Doctor Lookup.',
  },
  {
    key: 'contacts',
    icon: 'people-outline',
    title: 'Contacts',
    reason: "We'll ask when you add your first trusted contact.",
    isInfoOnly: true,
  },
];

const STAGGER_DELAY = 80; // ms between each row fade-in

// ─── Permission Row ────────────────────────────────────────────────────────────

type PermRowProps = {
  row: PermRow;
  state: PermState;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
  isActive: boolean;
  entryAnim: Animated.Value;
};

function PermissionRow({ row, state, styles, theme, isActive, entryAnim }: PermRowProps) {
  const checkScale = useRef(new Animated.Value(0)).current;
  const rowBg = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(1)).current;

  // Checkmark springs in when granted
  useEffect(() => {
    if (state === 'granted') {
      Animated.spring(checkScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 180,
        friction: 10,
      }).start();
    } else {
      checkScale.setValue(0);
    }
  }, [state, checkScale]);

  // Active row: highlight background + icon pulse
  useEffect(() => {
    Animated.timing(rowBg, {
      toValue: isActive ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
      easing: Easing.out(Easing.quad),
    }).start();

    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(iconScale, { toValue: 1.12, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(iconScale, { toValue: 1, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ])
      ).start();
    } else {
      iconScale.stopAnimation();
      Animated.timing(iconScale, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [isActive, rowBg, iconScale]);

  const isInfoOnly = row.isInfoOnly;

  const iconColor =
    state === 'granted'
      ? theme.colors.success
      : state === 'denied'
      ? theme.colors.danger
      : isActive
      ? theme.colors.accent
      : isInfoOnly
      ? withOpacity(theme.colors.textMuted, 0.7)
      : theme.colors.textMuted;

  const iconBg =
    state === 'granted'
      ? withOpacity(theme.colors.success, 0.13)
      : state === 'denied'
      ? withOpacity(theme.colors.danger, 0.1)
      : isActive
      ? withOpacity(theme.colors.accent, 0.13)
      : withOpacity(theme.colors.text, 0.05);

  const statusIcon: React.ComponentProps<typeof Ionicons>['name'] =
    state === 'granted'
      ? 'checkmark-circle'
      : state === 'denied'
      ? 'close-circle'
      : isInfoOnly
      ? 'time-outline'
      : 'ellipse-outline';

  const statusColor =
    state === 'granted'
      ? theme.colors.success
      : state === 'denied'
      ? theme.colors.danger
      : isInfoOnly
      ? withOpacity(theme.colors.textMuted, 0.5)
      : withOpacity(theme.colors.text, 0.15);

  const rowBgColor = rowBg.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', withOpacity(theme.colors.accent, 0.06)],
  });

  const entryStyle = {
    opacity: entryAnim,
    transform: [
      {
        translateY: entryAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[styles.rowWrap, { backgroundColor: rowBgColor }, entryStyle]}>
      <View style={styles.row}>
        <Animated.View
          style={[
            styles.rowIconBox,
            { backgroundColor: iconBg, transform: [{ scale: iconScale }] },
          ]}
        >
          <Ionicons name={row.icon} size={21} color={iconColor} />
        </Animated.View>

        <View style={styles.rowText}>
          <Text
            style={[
              styles.rowTitle,
              {
                color: isInfoOnly ? theme.colors.textMuted : theme.colors.text,
                fontFamily: theme.typography.fontFamily,
              },
            ]}
          >
            {row.title}
          </Text>
          <Text
            style={[
              styles.rowDesc,
              {
                color: isInfoOnly
                  ? withOpacity(theme.colors.textMuted, 0.7)
                  : theme.colors.textMuted,
                fontFamily: theme.typography.fontFamily,
              },
            ]}
          >
            {row.reason}
          </Text>
        </View>

        <Animated.View
          style={
            state === 'granted'
              ? { transform: [{ scale: checkScale }] }
              : undefined
          }
        >
          <Ionicons name={statusIcon} size={21} color={statusColor} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PermissionPrimingScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [states, setStates] = useState<Record<string, PermState>>({
    microphone: 'idle',
    notifications: 'idle',
    location: 'idle',
    contacts: 'idle',
  });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Entry animations
  const heroAnim = useRef(new Animated.Value(0)).current;
  const rowAnims = useRef(PERMISSIONS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Hero fades in first
    Animated.spring(heroAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 12,
      delay: 80,
    }).start();

    // Rows stagger in after hero
    rowAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 340,
        delay: 220 + i * STAGGER_DELAY,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start();
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const goToApp = useCallback(() => {
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'AppTabs' as never }] })
    );
  }, [navigation]);

  const setPermState = useCallback((key: string, state: PermState) => {
    setStates(prev => ({ ...prev, [key]: state }));
  }, []);

  const handleAllow = useCallback(async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // 1. Microphone
    setActiveKey('microphone');
    try {
      const { status } = await Audio.requestPermissionsAsync();
      const granted = status === 'granted';
      setPermState('microphone', granted ? 'granted' : 'denied');
      if (granted) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      setPermState('microphone', 'denied');
    }

    // 2. Notifications
    setActiveKey('notifications');
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      const granted = status === 'granted';
      setPermState('notifications', granted ? 'granted' : 'denied');
      if (granted) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      setPermState('notifications', 'denied');
    }

    // 3. Location
    setActiveKey('location');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setPermState('location', granted ? 'granted' : 'denied');
      if (granted) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      setPermState('location', 'denied');
    }

    setActiveKey(null);

    // Brief pause so user sees results, then navigate
    await new Promise(r => setTimeout(r, 700));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(false);
    goToApp();
  }, [goToApp, setPermState]);

  const heroEntryStyle = {
    opacity: heroAnim,
    transform: [
      {
        translateY: heroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
      {
        scale: heroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
        }),
      },
    ],
  };

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <OnboardingHeader chapter="permissions" activeStep={9} showBack={false} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 200 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero */}
        <Animated.View style={[styles.hero, heroEntryStyle]}>
          <View style={[styles.heroIconWrap, { backgroundColor: withOpacity(theme.colors.accent, 0.1) }]}>
            <Ionicons name="shield-checkmark-outline" size={38} color={theme.colors.accent} />
          </View>
          <Text style={[styles.heroTitle, { color: theme.colors.text, fontFamily: theme.typography.fontFamily }]}>
            One last thing
          </Text>
          <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted, fontFamily: theme.typography.fontFamily }]}>
            To protect you, we need a few permissions. We only ask for what's necessary and will never share your data.
          </Text>
        </Animated.View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {PERMISSIONS.map((row, index) => (
            <View key={row.key}>
              {index > 0 && (
                <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              )}
              <PermissionRow
                row={row}
                state={states[row.key]}
                styles={styles}
                theme={theme}
                isActive={activeKey === row.key}
                entryAnim={rowAnims[index]}
              />
            </View>
          ))}
        </View>

        <Animated.Text
          style={[
            styles.footnote,
            { color: theme.colors.textMuted, fontFamily: theme.typography.fontFamily },
            {
              opacity: rowAnims[PERMISSIONS.length - 1].interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              }),
            },
          ]}
        >
          You can update these any time in Settings → Data & Privacy.
        </Animated.Text>
      </ScrollView>

      <ActionFooter
        primaryLabel="Allow All"
        onPrimaryPress={handleAllow}
        primaryLoading={loading}
        secondaryLabel="Set up later"
        onSecondaryPress={goToApp}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      paddingTop: 28,
      paddingHorizontal: 20,
      gap: 18,
    },
    // Hero
    hero: {
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 8,
      paddingBottom: 4,
    },
    heroIconWrap: {
      width: 76,
      height: 76,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    heroTitle: {
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.5,
      textAlign: 'center',
    },
    heroSubtitle: {
      fontSize: 15,
      fontWeight: '500',
      lineHeight: 23,
      textAlign: 'center',
    },
    // Card
    card: {
      borderRadius: 32,
      borderWidth: 1,
      overflow: 'hidden',
    },
    rowWrap: {
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 14,
    },
    rowIconBox: {
      width: 46,
      height: 46,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    rowText: {
      flex: 1,
      gap: 3,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: '700',
    },
    rowDesc: {
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: 16,
    },
    footnote: {
      fontSize: 12,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: 16,
    },
  });
