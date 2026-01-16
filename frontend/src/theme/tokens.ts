export type ThemeMode = 'light' | 'dark';

const baseSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

const baseRadii = {
  sm: 16,
  md: 24,
  lg: 32,
} as const;

const baseTypography = {
  fontFamily: 'System',
  title: { size: 34, weight: '700', lineHeight: 40 },
  subtitle: { size: 18, weight: '600', lineHeight: 26 },
  bodyStrong: { size: 16, weight: '600', lineHeight: 24 },
  body: { size: 16, weight: '400', lineHeight: 24 },
  captionStrong: { size: 13, weight: '900', lineHeight: 18 },
  caption: { size: 13, weight: '400', lineHeight: 18 },
} as const;

const colors = {
  dark: {
    bg: '#0b111b',
    surface: '#121a26',
    surfaceAlt: '#1a2333',
    text: '#f5f7fb',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    border: 'rgba(255, 255, 255, 0.1)',
    accent: '#2d6df6',
    accentMuted: 'rgba(45, 109, 246, 0.3)',
    success: '#16a34a',
    danger: '#e11d48',
    warning: '#f59e0b',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
  light: {
    bg: '#f8fafc',
    surface: '#ffffff',
    surfaceAlt: '#f1f5f9',
    text: '#0f172a',
    textMuted: '#475569',
    textDim: '#94a3b8',
    border: 'rgba(15, 23, 42, 0.1)',
    accent: '#2d6df6',
    accentMuted: 'rgba(45, 109, 246, 0.3)',
    success: '#16a34a',
    danger: '#e11d48',
    warning: '#f59e0b',
    overlay: 'rgba(0, 0, 0, 0.2)',
  },
} as const;

const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  bottomAction: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -12 },
    elevation: 20,
  },
} as const;

const components = {
  button: {
    height: 60,
    radius: baseRadii.md,
    paddingHorizontal: baseSpacing.lg,
  },
  input: {
    height: 60,
    radius: baseRadii.md,
    paddingHorizontal: baseSpacing.lg,
    borderWidth: 1,
  },
  card: {
    radius: baseRadii.lg,
    padding: baseSpacing.lg,
  },
  listItem: {
    paddingVertical: baseSpacing.sm,
    paddingHorizontal: baseSpacing.md,
    radius: baseRadii.sm,
  },
} as const;

const motion = {
  transition: 'cubic-bezier(0.32, 1, 0.2, 1)',
  pulse: 600,
  shake: 400,
} as const;

const onboarding = {
  progress: {
    segmentActiveWidth: 12,
    segmentInactiveWidth: 6,
    segmentHeight: 6,
    gap: 8,
  },
} as const;

export const tokens = {
  colors,
  spacing: baseSpacing,
  radii: baseRadii,
  typography: baseTypography,
  shadows,
  components,
  motion,
  onboarding,
};

export type AppTheme = {
  colors: (typeof colors)[ThemeMode];
  spacing: typeof baseSpacing;
  radii: typeof baseRadii;
  typography: typeof baseTypography;
  shadows: typeof shadows;
  components: typeof components;
  motion: typeof motion;
  onboarding: typeof onboarding;
};

export const getTheme = (mode: ThemeMode): AppTheme => ({
  colors: colors[mode],
  spacing: baseSpacing,
  radii: baseRadii,
  typography: baseTypography,
  shadows,
  components,
  motion,
  onboarding,
});
