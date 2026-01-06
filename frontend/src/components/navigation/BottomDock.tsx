import { View, TouchableOpacity, StyleSheet, Text, ViewStyle } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

const ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap; }> = {
  HomeTab: { active: 'home', inactive: 'home-outline' },
  CallsTab: { active: 'call', inactive: 'call-outline' },
  AlertsTab: { active: 'alert-circle', inactive: 'alert-circle-outline' },
  SettingsTab: { active: 'settings', inactive: 'settings-outline' },
};

type BottomDockProps = BottomTabBarProps & {
  containerStyle?: ViewStyle;
  dockHeight: number;
};

export default function BottomDock({
  state,
  descriptors,
  navigation,
  dockHeight,
  containerStyle,
}: BottomDockProps) {
  const focusedRoute = state.routes[state.index];
  const nestedState = focusedRoute?.state as { index?: number } | undefined;
  if (nestedState && typeof nestedState.index === 'number' && nestedState.index > 0) {
    return null;
  }
  return (
    <View style={[styles.container, { height: dockHeight }, containerStyle]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };
        const { active, inactive } = ICONS[route.name] ?? {
          active: 'ellipse',
          inactive: 'ellipse',
        };
        const iconName = focused ? active : inactive;
        const label = descriptors[route.key].options.title ?? route.name.replace(/Tab$/, '');

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tabButton}
            onPress={onPress}
            activeOpacity={0.75}
          >
            <Ionicons name={iconName} size={20} color={focused ? '#8ab4ff' : '#51607a'} />
            <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    marginHorizontal: 16,
    backgroundColor: '#101827',
    borderRadius: 22,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 0,
    height: '100%',
  },
  label: {
    marginTop: 4,
    fontSize: 12,
    color: '#51607a',
  },
  labelActive: {
    color: '#8ab4ff',
  },
});
