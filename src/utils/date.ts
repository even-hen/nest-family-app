/**
 * Shared date utilities.
 * Eliminates duplication of getMondayISO across assignments.tsx, functions, and scripts (W-4).
 */

/** Returns ISO date string (YYYY-MM-DD) of the Monday of the week containing the given date. */
export function getMondayISO(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

/** Returns ISO date string (YYYY-MM-DD) for today. */
export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns time-of-day greeting string. */
export function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/** Formats a date for display (e.g. "Wednesday, May 21"). */
export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
