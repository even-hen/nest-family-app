/**
 * Shared date utilities.
 * Eliminates duplication of getMondayISO across assignments.tsx, functions, and scripts (W-4).
 */

/** Returns ISO date string (YYYY-MM-DD) of the Monday of the week containing the given date, in local timezone. */
export function getMondayISO(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

/** Returns ISO date string (YYYY-MM-DD) for today in the device's local timezone. */
export function getTodayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Returns ISO date string (YYYY-MM-DD) for yesterday in the device's local timezone. */
export function getYesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Returns time-of-day greeting string. */
function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/** Formats a date for display (e.g. "Wednesday, May 21"). */
export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Calculates whether a Monday ISO date string belongs to an 'even' or 'odd' week
 * relative to a fixed epoch Monday: January 5, 2026.
 */
export function getWeekParity(weekStartStr: string): 'even' | 'odd' {
  const baseDate = new Date('2026-01-05T00:00:00.000Z');
  const targetDate = new Date(`${weekStartStr}T00:00:00.000Z`);
  const diffTime = targetDate.getTime() - baseDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.round(diffDays / 7);
  return Math.abs(diffWeeks) % 2 === 0 ? 'even' : 'odd';
}

