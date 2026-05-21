/**
 * Centralized domain constants.
 * Single source of truth for user types, weekdays, and Firestore collection names.
 */
import { UserType } from '../types';

export const USER_TYPES: readonly UserType[] = ['Adult', 'Teen', 'Child'] as const;

export const ALL_WEEK_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6] as const;

export const DAYS_OF_WEEK = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
] as const;

export const FIRESTORE_COLLECTIONS = {
  TASKS: 'tasks',
  USERS: 'users',
  ASSIGNMENTS: 'assignments',
  GROUPS: 'groups',
  NOTIFICATIONS: 'notifications',
} as const;
