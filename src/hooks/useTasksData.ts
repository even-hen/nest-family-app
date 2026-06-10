// src/hooks/useTasksData.ts
import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { mapTask, mapUser } from '../utils/supabaseMappers';
import { Task, UserType } from '../types';


// Simplify the mapped user structure returned by our hook
type GroupUserMap = Record<string, string>;

/**
 * Custom hook to manage all task data fetching and local state related to tasks.
 */
export const useTasksData = ({ groupId }: { groupId?: string }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groupUsers, setGroupUsers] = useState<GroupUserMap>({});
  const [fullUsersList, setFullUsersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isRefreshing = false) => {
    if (!groupId) return;

    if (!isRefreshing) setLoading(true);
    try {
      // Fetch Tasks and Users in parallel for both groups (global/subgroup)
      const [tasksRes, usersRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('group_id', groupId),
        supabase.from('users').select('id, name, type, resource, group_id').eq('group_id', groupId), // Explicitly select needed fields for simplicity here
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (usersRes.error) throw usersRes.error;

      const nameMap: GroupUserMap = {};
      const listData: { id: string; name: string }[] = [];
      const fullList: any[] = [];
      
      (usersRes.data || []).forEach((row) => {
        const uData = mapUser(row);
        const uName = uData.name ? `${uData.name} (${uData.type})` : `User ${uData.id}`;
        nameMap[uData.id] = uName;

        listData.push({ id: uData.id, name: uName });
        fullList.push(uData);
      });

      setGroupUsers(nameMap);
      setFullUsersList(fullList);

      const loadedTasks = (tasksRes.data || []).map((t) => {
        // Map the raw task record to our internal Task type structure
        return mapTask({
          ...t, 
          complexity: parseInt(t.complexity as string), // Ensure complexity is number
          weekDays: t['week_days'] ?? [], // Use snake_case if mapper needs it
          assignedTo: t['assigned_to'] ?? null,
        } as any); // Casting temporarily for type safety since mapTask definition might need refinement based on implementation detail
      });

      // Complex sorting logic (Active first, then by points descending)
      const sortedTasks = [...loadedTasks].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;

        const aDays = a.weekDays?.length || 0;
        const bDays = b.weekDays?.length || 0;
        const aPoints = a.complexity * aDays;
        const bPoints = b.complexity * bDays;

        if (bPoints !== aPoints) return bPoints - aPoints;
        return a.title.localeCompare(b.title);
      });

      setTasks(sortedTasks);
    } catch (e: any) {
      console.error('Error loading tasks data:', e);
      // Optionally throw or handle errors more gracefully in the UI
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData(true);
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  return { tasks, groupUsers, fullUsersList, loading, refreshing, loadData, refresh };
};