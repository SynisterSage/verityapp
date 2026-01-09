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
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
} as const;

const baseTypography = {
  fontFamily: 'System', // Swap with your brand font if available.
  title: { size: 24, weight: '700', lineHeight: 32 },
  subtitle: { size: 18, weight: '600', lineHeight: 26 },
  body: { size: 16, weight: '400', lineHeight: 24 },
  bodyStrong: { size: 16, weight: '600', lineHeight: 24 },
  caption: { size: 13, weight: '400', lineHeight: 18 },
  captionStrong: { size: 13, weight: '600', lineHeight: 18 },
} as const;

const colors = {
  dark: {
    bg: '#0b111b',
    surface: '#121a26',
    surfaceAlt: '#1a2333',
    text: '#f5f7fb',
    textMuted: '#b5c0d3',
    border: '#243247',
    accent: '#2d6df6',
    accentMuted: '#1f4bbd',
    success: '#16a34a',
    danger: '#e11d48',
    warning: '#f59e0b',
    overlay: 'rgba(0,0,0,0.6)',
  },
  light: {
    bg: '#f6f8fb',
    surface: '#ffffff',
    surfaceAlt: '#e8f0ff',
    text: '#0b111b',
    textMuted: '#4b5565',
    border: '#d7dce5',
    accent: '#2d6df6',
    accentMuted: '#1f4bbd',
    success: '#16a34a',
    danger: '#e11d48',
    warning: '#f59e0b',
    overlay: 'rgba(0,0,0,0.25)',
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
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

const components = {
  button: {
    height: 48,
    radius: baseRadii.sm,
    paddingHorizontal: baseSpacing.md,
  },
  input: {
    height: 48,
    radius: baseRadii.sm,
    paddingHorizontal: baseSpacing.sm,
    borderWidth: 1,
  },
  card: {
    radius: baseRadii.md,
    padding: baseSpacing.md,
  },
  listItem: {
    paddingVertical: baseSpacing.sm,
    paddingHorizontal: baseSpacing.md,
    radius: baseRadii.sm,
  },
} as const;

export const tokens = {
  colors,
  spacing: baseSpacing,
  radii: baseRadii,
  typography: baseTypography,
  shadows,
  components,
};

export type AppTheme = {
  colors: (typeof colors)[ThemeMode];
  spacing: typeof baseSpacing;
  radii: typeof baseRadii;
  typography: typeof baseTypography;
  shadows: typeof shadows;
  components: typeof components;
};

export const getTheme = (mode: ThemeMode): AppTheme => ({
  colors: colors[mode],
  spacing: baseSpacing,
  radii: baseRadii,
  typography: baseTypography,
  shadows,
  components,
});
