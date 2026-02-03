// lib/theme.ts
// Shared theme constants
// Centralized colors, spacing, and typography for consistency

export const COLORS = {
  // Primary colors
  primary: '#007AFF',        // Buttons, active states, accents, icons
  success: '#34C759',        // Continue workout, positive actions
  destructive: '#FF3B30',    // Delete, reset, destructive actions
  warning: '#FF9500',        // Orange - moderate alerts
  purple: '#8E44AD',         // Special states (max RPE)

  // Text colors
  textPrimary: '#333',       // Headings, primary text
  textSecondary: '#666',     // Subtitles, descriptions
  textTertiary: '#888',      // Notes, hints, placeholders
  textInverse: '#fff',       // Text on colored backgrounds

  // Background colors
  backgroundLight: '#f5f5f5', // Screen backgrounds
  backgroundWhite: '#fff',    // Cards, modals
  backgroundDark: '#f0f0f0',  // Secondary buttons, disabled states

  // Border colors
  borderLight: '#eee',       // Dividers, subtle borders
  borderMedium: '#ddd',      // Input borders, inactive states
  borderDark: '#E5E5EA',     // Tab bar border

  // Tab bar colors
  tabActive: '#007AFF',
  tabInactive: '#8E8E93',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const FONT_SIZES = {
  caption: 12,
  small: 13,
  body: 15,
  bodyLarge: 17,
  subtitle: 18,
  title: 20,
  heading: 28,
  hero: 32,
} as const;

export const FONT_WEIGHTS = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  button: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  active: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
} as const;

// RPE color scale
export function getRPEColorFromTheme(rpe?: number): string {
  if (!rpe) return COLORS.textTertiary;
  if (rpe <= 7) return COLORS.success;    // Green - Moderate
  if (rpe <= 8) return COLORS.warning;    // Orange - Hard
  if (rpe <= 9) return COLORS.destructive; // Red - Very hard
  return COLORS.purple;                    // Purple - Max
}
