/**
 * Shared color utilities for user type badge colors.
 * Eliminates duplication of getTypeColor across tasks.tsx and members.tsx (W-3).
 */
import { UserType } from '../types';
import { ThemeColors } from '../constants/colors';

const TYPE_COLOR_MAP: Record<UserType, keyof ThemeColors> = {
  Adult: 'adult',
  Teen: 'teen',
  Child: 'child',
};

export const getTypeColor = (type: UserType, Colors: ThemeColors): string => {
  return Colors[TYPE_COLOR_MAP[type]] ?? Colors.textMuted;
};
