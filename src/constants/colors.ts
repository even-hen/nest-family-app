import { Platform } from 'react-native';

export const darkColors = {
  // Primary brand - deep indigo/violet
  primary: '#7C5CFC',
  primaryLight: '#9B85FD',
  primaryDark: '#5A3FD4',

  // Accent - warm coral
  accent: '#FF6B6B',
  accentLight: '#FF9A9A',

  // Success - mint green
  success: '#4ECDC4',
  successLight: '#7EDDD6',

  // Warning - amber
  warning: '#FFB347',
  warningLight: '#FFC97A',

  // Background layers
  bg: '#0F0E1A',
  bgCard: '#1A1828',
  bgCardAlt: '#221F35',
  bgInput: '#2A2640',

  // Borders
  border: '#2E2A45',
  borderLight: '#3D3860',

  // Text
  textPrimary: '#F0EEFF',
  textSecondary: '#9B97C0',
  textMuted: '#5E5A80',

  // Status colors
  pending: '#FFB347',
  done: '#4ECDC4',
  skipped: '#FF6B6B',

  // User type badge colors
  adult: '#6366F1', // Sleek Indigo
  teen: '#0D9488',  // Refined Teal
  child: '#F43F5E', // Premium Rose

  // Gradient stops (for LinearGradient)
  gradientStart: '#7C5CFC',
  gradientEnd: '#5A3FD4',

  // Tab bar
  tabActive: '#7C5CFC',
  tabInactive: '#5E5A80',
};

export const Fonts = {
  regular: Platform.OS === 'web' ? 'Outfit, System' : 'Outfit-Regular',
  medium: Platform.OS === 'web' ? 'Outfit, System' : 'Outfit-Medium',
  semibold: Platform.OS === 'web' ? 'Outfit, System' : 'Outfit-SemiBold',
  bold: Platform.OS === 'web' ? 'Outfit, System' : 'Outfit-Bold',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const lightColors = {
  ...darkColors,
  bg: '#F5F5F7',
  bgCard: '#FFFFFF',
  bgCardAlt: '#F0F0F3',
  bgInput: '#EAEAEF',
  border: '#D1D1D6',
  borderLight: '#C7C7CC',
  textPrimary: '#1C1C1E',
  textSecondary: '#3A3A3C',
  textMuted: '#8E8E93',
  tabActive: '#7C5CFC',
  tabInactive: '#8E8E93',
};

export type ThemeColors = typeof darkColors;
export const Colors = darkColors; // Fallback

