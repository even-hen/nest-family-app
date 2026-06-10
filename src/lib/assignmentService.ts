// src/lib/assignmentService.ts
import { supabase } from './supabase';
import { getMondayISO } from '../utils/date';
import { mapAssignment } from '../utils/supabaseMappers';
import { Task, AssignmentStatus } from '../types';

/**
 * Converts JS Date weekday (0=Sun, 1=Mon...6=Sat) 
 * to an order relative to Monday (0=Mon...6=Sun).
 */
const getWeekDayOrderIndex = (idx: number) => (idx === 0 ? 6 : idx - 1);

/**
 * Calculates the ISO date string for a given weekday index (0=Sun...6=Sat)
 * relative to a provided Monday ISO string.
 */
const getDateForWeekday = (weekStart: string, idx: number) => {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  const offset = idx === 0 ? 6 : idx - 1;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().split('T')[0];
};

/**
 * Synchronizes a task's weekly assignments for the current week.
 * Handles creation, updates of pending assignments, and deletion of assignments
 * for days that are no longer active.
 */
export async function syncWeeklyAssignments({
  taskId,
  groupId,
  title,
  complexity,
  weekDays,
  assignedTo,
  isActive,
}: {
  taskId: string;
  groupId: string;
  title: string;
  complexity: number;
  weekDays: number[];
  assignedTo: string | null;
  isActive: boolean;
}) {
  const weekStartStr = getMondayISO(new Date());
  const { data: assignmentsData, error: assErr } = await supabase
    .from('assignments')
    .select('*')
    .eq('task_id', taskId)
    .eq('week_start', weekStartStr);

  if (assErr) throw assErr;

  const existingAssignments = (assignmentsData || []).map(mapAssignment);
  const todayDayIndex = new Date().getDay();
  const todayOrder = getWeekDayOrderIndex(todayDayIndex);

  if (!isActive) {
    // If task is inactive, delete all pending assignments for today and future days
    for (const existing of existingAssignments) {
      const dayIdx = new Date(existing.date).getDay();
      const isTodayOrFuture = getWeekDayOrderIndex(dayIdx) >= todayOrder;
      if (isTodayOrFuture && existing.status === 'pending') {
        const { error } = await supabase.from('assignments').delete().eq('id', existing.id);
        if (error) throw error;
      }
    }
    return;
  }

  // Process active days
  for (const dayIndex of weekDays) {
    const dateISO = getDateForWeekday(weekStartStr, dayIndex);
    const isTodayOrFuture = getWeekDayOrderIndex(dayIndex) >= todayOrder;

    if (isTodayOrFuture) {
      const existing = existingAssignments.find((a) => a.date === dateISO);

      if (existing) {
        // Update only pending assignments
        if (existing.status === 'pending') {
          const { error } = await supabase
            .from('assignments')
            .update({
              assigned_to: assignedTo,
              title: title,
              complexity: complexity,
              week_days: weekDays,
            })
            .eq('id', existing.id);
          if (error) throw error;
        }
      } else {
        // Create new pending assignment
        const { error } = await supabase
          .from('assignments')
          .insert({
            task_id: taskId,
            group_id: groupId,
            title: title,
            complexity: complexity,
            week_days: weekDays,
            assigned_to: assignedTo,
            status: 'pending' as AssignmentStatus,
            week_start: weekStartStr,
            date: dateISO,
            done_at: null,
            skipped_at: null,
          });
        if (error) throw error;
      }
    }
  }

  // Delete pending assignments for days that are today/future but no longer in weekDays
  for (const existing of existingAssignments) {
    const dayIdx = new Date(existing.date).getDay();
    const isTodayOrFuture = getWeekDayOrderIndex(dayIdx) >= todayOrder;
    const isNotActiveAnymore = !weekDays.includes(dayIdx);

    if (isTodayOrFuture && isNotActiveAnymore && existing.status === 'pending') {
      const { error } = await supabase.from('assignments').delete().eq('id', existing.id);
      if (error) throw error;
    }
  }
}

/**
 * Deletes all pending assignments for a task starting from today.
 */
export async function deletePendingAssignmentsForTask(taskId: string) {
  const weekStartStr = getMondayISO(new Date());
  const todayDateISO = new Date().toISOString().split('T')[0];

  const { data: assignmentsData, error: assErr } = await supabase
    .from('assignments')
    .select('*')
    .eq('task_id', taskId)
    .eq('week_start', weekStartStr);

  if (assErr) throw assErr;

  const pendingToDelete = (assignmentsData || [])
    .map(mapAssignment)
    .filter((a) => a.status === 'pending' && a.date >= todayDateISO);

  if (pendingToDelete.length > 0) {
    const deleteIds = pendingToDelete.map((a) => a.id);
    const { error: delAssErr } = await supabase.from('assignments').delete().in('id', deleteIds);
    if (delAssErr) throw delAssErr;
  }
}
