import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TasksScreenSkeleton } from '../../components/skeleton';
import { Radius, Spacing, ThemeColors } from '../../constants/colors';
import { ALL_WEEK_DAYS, DAYS_OF_WEEK, USER_TYPES } from '../../constants/domain';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useTasksData } from '../../hooks/useTasksData';
import { deletePendingAssignmentsForTask, rebalanceAndSyncBiweeklyTasks, syncWeeklyAssignments } from '../../lib/assignmentService';
import { autoDistributeTasks } from '../../lib/distribution';
import { syncLocalNotifications } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import { Task, UserType } from '../../types';
import { AppAlert } from '../../utils/alert';
import { getTypeColor } from '../../utils/colors';
import { getMondayISO, getWeekParity } from '../../utils/date';
import { mapTask, mapUser } from '../../utils/supabaseMappers';

function TaskCard({
  task, users, onEdit, canEdit,
}: {
  task: Task; users: Record<string, string>;
  onEdit: (t: Task) => void; canEdit: boolean;
}) {
  const { Colors } = useAppTheme();
  const styles = useMemo(() => getStyles(Colors), [Colors]);

  const currentWeekParity = getWeekParity(getMondayISO(new Date()));
  const isBiweekly = task.frequency === 'biweekly';
  const isActiveThisWeek = isBiweekly && task.biweeklyParity === currentWeekParity;

  return (
    <View style={[styles.card, !task.isActive && styles.cardInactive]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          {task.emoji ? (
            <Text style={styles.cardEmoji}>{task.emoji}</Text>
          ) : (
            <View style={[styles.activeIndicator, { backgroundColor: task.isActive ? Colors.success : Colors.textMuted }]} />
          )}
          <Text style={[styles.cardTitle, !task.isActive && styles.textMuted]}>{task.title}</Text>
          <Text style={styles.cardPoints}>{task.complexity} pts</Text>
          {isBiweekly && (
            <View style={[styles.biweeklyBadge, { backgroundColor: isActiveThisWeek ? Colors.success + '15' : Colors.textMuted + '15', borderColor: isActiveThisWeek ? Colors.success + '40' : Colors.textMuted + '40', borderWidth: 1 }]}>
              <Text style={[styles.biweeklyBadgeText, { color: isActiveThisWeek ? Colors.success : Colors.textMuted }]}>
                {isActiveThisWeek ? 'Active this week' : 'Next week'}
              </Text>
            </View>
          )}
        </View>
        {canEdit && (
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={() => onEdit(task)} style={styles.actionIconBtn} activeOpacity={0.7}>
              <Ionicons name="create-outline" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
      {task.weekDays && task.weekDays.length > 0 && (
        <View style={styles.daysRow}>
          {DAYS_OF_WEEK.map((d) => (
            <View key={d.value} style={[styles.dayChip, task.weekDays.includes(d.value) && styles.dayChipActive]}>
              <Text style={[styles.dayText, task.weekDays.includes(d.value) && styles.dayTextActive]}>{d.label}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.availRow}>
        {task.assignedTo && (
          <View style={styles.badge}>
            {task.auto ? (
              <Text style={styles.badgeText}>
                Assignee:{' '}
                <Text style={{ color: 'rgb(255, 179, 71)', fontWeight: '600' }}>
                  {users[task.assignedTo] ?? '—'}
                </Text>
              </Text>
            ) : (
              <Text style={styles.badgeText}>
                Assigned: {users[task.assignedTo] ?? '—'}
              </Text>
            )}
          </View>
        )}
        {task.auto && task.availableFor && task.availableFor.length > 0 && (
          <View style={styles.chipsGroup}>
            {[...task.availableFor].sort((a, b) => USER_TYPES.indexOf(a) - USER_TYPES.indexOf(b)).map((t) => (
              <View key={t} style={[styles.typePill, { backgroundColor: getTypeColor(t, Colors) + '15', borderColor: getTypeColor(t, Colors) + '30', borderWidth: 1 }]}>
                <Text style={[styles.typePillText, { color: getTypeColor(t, Colors) }]}>{t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const EMPTY_FORM = {
  title: '', emoji: null as string | null, complexity: '10',
  weekDays: [...ALL_WEEK_DAYS] as number[], availableFor: [...USER_TYPES] as UserType[],
  assignedTo: null as string | null, isActive: true,
  frequency: 'weekly' as 'weekly' | 'biweekly',
};

const CHORE_EMOJIS = ['🍳', '🍲', '🥗', '🍽️', '🪞', '🚽', '🛁', '🚿', '🪠', '🧻', '🧹', '🗑️', '🧤', '💡', '🌱', '🌻', '🛒', '🛏️', '🧸'];

export default function TasksScreen() {
  const { Colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(Colors, insets), [Colors, insets]);
  const { user } = useAuth();

  const {
    tasks,
    groupUsers,
    fullUsersList,
    loading,
    refreshing,
    loadData,
    refresh
  } = useTasksData({ groupId: user?.groupId ?? undefined });

  const usersList = useMemo(() =>
    fullUsersList.map(u => ({ id: u.id, name: u.name })),
    [fullUsersList]
  );

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isAdult = user?.type === 'Adult';

  useFocusEffect(
    useCallback(() => {
      setSearchQuery('');
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    await refresh();
  };

  const openCreate = () => { setEditingTask(null); setForm({ ...EMPTY_FORM }); setModalVisible(true); };
  const openEdit = (t: Task) => {
    setEditingTask(t);
    setForm({
      title: t.title, emoji: t.emoji || null, complexity: String(t.complexity),
      weekDays: t.weekDays || [], availableFor: t.availableFor,
      assignedTo: t.auto ? null : t.assignedTo, isActive: t.isActive,
      frequency: t.frequency || 'weekly',
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { AppAlert.alert('Error', 'Title is required'); return; }
    const c = parseInt(form.complexity, 10);
    if (isNaN(c) || c < 1 || c > 100) { AppAlert.alert('Error', 'Complexity must be 1–100'); return; }
    if (!user?.groupId) return;
    setSaving(true);
    try {
      const auto = form.assignedTo === null;
      let finalAssignedTo = form.assignedTo;
      const activeDays = form.weekDays.length === 0 ? [...ALL_WEEK_DAYS] : form.weekDays;

      if (auto && form.isActive) {
        const tempTaskId = editingTask ? editingTask.id : 'temp-new-task';
        const currentWeekParity = getWeekParity(getMondayISO(new Date()));

        const isBiweekly = form.frequency === 'biweekly';
        const isCurrentTaskActiveThisWeek = isBiweekly
          ? (editingTask ? editingTask.biweeklyParity === currentWeekParity : true)
          : true;

        if (editingTask && isBiweekly && !isCurrentTaskActiveThisWeek) {
          // If editing an existing biweekly task in its off-week, preserve the current assignee
          finalAssignedTo = editingTask.assignedTo;
        } else {
          // Run distribution normally for weekly tasks, active biweekly tasks, and new biweekly tasks
          const otherActiveTasks = tasks
            .filter((t) => t.isActive && (editingTask ? t.id !== editingTask.id : true))
            .map((t) => ({
              ...t,
              // Biweekly tasks that are in their off-week should not be distributed this week
              isActive: t.frequency === 'biweekly' ? t.biweeklyParity === currentWeekParity : t.isActive,
            }));

          otherActiveTasks.push({
            id: tempTaskId,
            groupId: user.groupId,
            title: form.title.trim(),
            complexity: c,
            weekDays: activeDays,
            availableFor: form.availableFor.length === 0 ? [...USER_TYPES] : form.availableFor,
            assignedTo: null,
            auto: true,
            isActive: true,
            frequency: form.frequency as 'weekly' | 'biweekly',
            createdBy: user.id,
            createdAt: new Date(),
          });

          const assignableUsers = fullUsersList.map((u) => ({
            id: u.id,
            type: u.type,
            resource: u.resource,
          }));

          const { assignments: distResult } = autoDistributeTasks(otherActiveTasks, assignableUsers);
          const matched = distResult.find((a) => a.taskId === tempTaskId);
          finalAssignedTo = matched ? matched.assignedTo : null;
        }
      }

      const data = {
        title: form.title.trim(),
        emoji: form.emoji,
        complexity: c,
        week_days: activeDays,
        available_for: form.availableFor.length === 0 ? [...USER_TYPES] : form.availableFor,
        assigned_to: finalAssignedTo,
        auto,
        is_active: form.isActive,
        frequency: form.frequency,
      };

      let savedTaskId = '';
      let savedBiweeklyParity = editingTask ? editingTask.biweeklyParity : null;
      if (editingTask) {
        savedTaskId = editingTask.id;
        const { error } = await supabase.from('tasks').update(data).eq('id', editingTask.id);
        if (error) throw error;
      } else {
        const { data: newDbTask, error } = await supabase
          .from('tasks')
          .insert({ ...data, group_id: user.groupId, created_by: user.id })
          .select().single();
        if (error) throw error;
        if (!newDbTask) throw new Error('Failed to create task record');
        savedTaskId = newDbTask.id;
        savedBiweeklyParity = newDbTask.biweekly_parity || null;
      }

      await syncWeeklyAssignments({
        taskId: savedTaskId,
        groupId: user.groupId,
        title: data.title,
        complexity: c,
        weekDays: activeDays,
        assignedTo: finalAssignedTo,
        isActive: form.isActive,
        frequency: data.frequency as 'weekly' | 'biweekly',
        biweeklyParity: savedBiweeklyParity,
      });

      // Rebalance all biweekly tasks in the group to maintain complexity parity
      await rebalanceAndSyncBiweeklyTasks(user.groupId);

      await loadData();
      setModalVisible(false);
      if (user) {
        syncLocalNotifications(user.id, user.groupId, user.type, user.notificationTime);
      }
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'Could not save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    AppAlert.alert('Delete Task', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const { error: delTaskErr } = await supabase.from('tasks').delete().eq('id', id);
            if (delTaskErr) throw delTaskErr;

            await deletePendingAssignmentsForTask(id);

            if (user?.groupId) {
              // Rebalance remaining biweekly tasks
              await rebalanceAndSyncBiweeklyTasks(user.groupId);
              await loadData();
              setModalVisible(false);
              syncLocalNotifications(user.id, user.groupId, user.type, user.notificationTime);
            }
          } catch (e: any) {
            AppAlert.alert('Error', e?.message ?? 'Could not delete task');
          }
        },
      },
    ]);
  };

  const toggleType = (t: UserType) => {
    setForm((prev) => ({
      ...prev,
      availableFor: prev.availableFor.includes(t)
        ? prev.availableFor.filter((x) => x !== t)
        : [...prev.availableFor, t],
    }));
  };

  const toggleDay = (d: number) => {
    setForm((prev) => ({
      ...prev,
      weekDays: prev.weekDays.includes(d) ? prev.weekDays.filter((x) => x !== d) : [...prev.weekDays, d],
    }));
  };

  const [mixing, setMixing] = useState(false);

  const handleMixTasks = async () => {
    if (!user?.groupId || user.type !== 'Adult') return;

    const runShuffle = async () => {
      setMixing(true);
      try {
        const [tasksRes, usersRes] = await Promise.all([
          supabase.from('tasks').select('*').eq('group_id', user.groupId),
          supabase.from('users').select('*').eq('group_id', user.groupId),
        ]);

        if (tasksRes.error) throw tasksRes.error;
        if (usersRes.error) throw usersRes.error;

        const fetchedTasks = (tasksRes.data || []).map(mapTask);
        const fetchedUsers = (usersRes.data || []).map(mapUser);
        const assignableUsers = fetchedUsers.map((u) => ({
          id: u.id, type: u.type, resource: u.resource,
        }));

        const currentWeekParity = getWeekParity(getMondayISO(new Date()));
        // Biweekly tasks in their off-week must not be redistributed this week
        const tasksForDistribution = fetchedTasks.map((t) => ({
          ...t,
          isActive: t.frequency === 'biweekly' ? (t.isActive && t.biweeklyParity === currentWeekParity) : t.isActive,
        }));

        const { assignments: distResult } = autoDistributeTasks(tasksForDistribution, assignableUsers, true);

        for (const item of distResult) {
          const task = fetchedTasks.find((t) => t.id === item.taskId);
          if (!task || !task.auto) continue;

          const { error: tErr } = await supabase
            .from('tasks')
            .update({ assigned_to: item.assignedTo })
            .eq('id', task.id);
          if (tErr) throw tErr;

          await syncWeeklyAssignments({
            taskId: task.id,
            groupId: user.groupId!,
            title: task.title,
            complexity: task.complexity,
            weekDays: task.weekDays,
            assignedTo: item.assignedTo,
            isActive: task.isActive,
            frequency: task.frequency,
            biweeklyParity: task.biweeklyParity,
          });
        }

        // Rebalance biweekly tasks after mixing to ensure sync is complete
        await rebalanceAndSyncBiweeklyTasks(user.groupId!);

        await loadData();
        if (user) {
          syncLocalNotifications(user.id, user.groupId, user.type, user.notificationTime);
        }
        AppAlert.alert('Success', 'Auto-assigned tasks shuffled successfully!');
      } catch (e: any) {
        AppAlert.alert('Error', e?.message ?? 'Could not shuffle tasks');
      } finally {
        setMixing(false);
      }
    };

    AppAlert.alert(
      'Shuffle Tasks',
      'Are you sure you want to re-shuffle all auto-assigned tasks for this week?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Shuffle', onPress: runShuffle },
      ]
    );
  };

  const filteredTasks = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return tasks.filter((t) => {
      const titleMatches = t.title.toLowerCase().includes(query);
      const assigneeName = t.assignedTo ? (groupUsers[t.assignedTo] || '').toLowerCase() : '';
      const assigneeMatches = assigneeName.includes(query);
      return titleMatches || assigneeMatches;
    });
  }, [tasks, searchQuery, groupUsers]);

  const currentWeekParity = getWeekParity(getMondayISO(new Date()));

  const totalTasksCount = tasks.filter((t) => {
    if (!t.isActive) return false;
    if (t.frequency === 'biweekly') {
      return t.biweeklyParity === currentWeekParity;
    }
    return true;
  }).length;

  const weeklyPoints = tasks.reduce((sum, t) => {
    if (!t.isActive) return sum;
    const daysCount = t.weekDays?.length || 0;
    if (t.frequency === 'biweekly') {
      const isActiveThisWeek = t.biweeklyParity === currentWeekParity;
      if (isActiveThisWeek) {
        return sum + (t.complexity * daysCount);
      }
    } else {
      return sum + (t.complexity * daysCount);
    }
    return sum;
  }, 0);


  if (loading) {
    return <TasksScreenSkeleton />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Schedule</Text>
          <Text style={styles.subtitle}>{tasks.length} tasks · {tasks.filter((t) => t.isActive).length} active</Text>
        </View>
        <View style={styles.headerActions}>
          {isAdult && (
            <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
              <Text style={styles.addBtnText}>+ Add Task</Text>
            </TouchableOpacity>
          )}
          {isAdult && (
            <TouchableOpacity
              style={styles.mixBtn}
              onPress={handleMixTasks}
              activeOpacity={0.8}
              disabled={mixing}
            >
              {mixing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="shuffle-outline" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search tasks..."
              placeholderTextColor={Colors.textMuted}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {filteredTasks.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No matching tasks' : 'No tasks yet'}
            </Text>
            {isAdult && !searchQuery && <Text style={styles.emptyDesc}>{"Tap \"+ Add Task\" to create your first task"}</Text>}
          </View>
        )}
        {filteredTasks.map((t) => (
          <TaskCard key={t.id} task={t} users={groupUsers} onEdit={openEdit} canEdit={isAdult} />
        ))}

        {/* Bottom Summary Bar */}
        <View style={styles.footerSummary}>
          <View style={styles.footerChip}>
            <Ionicons name="list-outline" size={16} color={Colors.primary} />
            <Text style={styles.footerChipText}>
              Weekly Tasks: <Text style={styles.footerChipValue}>{totalTasksCount}</Text>
            </Text>
          </View>
          <View style={styles.footerChip}>
            <Ionicons name="flash-outline" size={16} color="rgb(255, 179, 71)" />
            <Text style={styles.footerChipText}>
              Weekly Points: <Text style={[styles.footerChipValue, { color: 'rgb(255, 179, 71)' }]}>{weeklyPoints}</Text>
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingTask ? 'Edit Task' : 'New Task'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.label}>Task Name</Text>
            <TextInput
              style={styles.input} value={form.title} onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
              placeholder="e.g. Wash dishes" placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.label}>Complexity (1–100)</Text>
            <TextInput
              style={styles.input} value={form.complexity} onChangeText={(v) => setForm((p) => ({ ...p, complexity: v }))}
              keyboardType="number-pad" placeholder="10" placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.label}>Frequency</Text>
            <View style={styles.segRow}>
              <TouchableOpacity
                style={[styles.segBtn, form.frequency === 'weekly' && styles.segBtnActive]}
                onPress={() => setForm((p) => ({ ...p, frequency: 'weekly' }))}
              >
                <Text style={[styles.segText, form.frequency === 'weekly' && styles.segTextActive]}>Weekly</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segBtn, form.frequency === 'biweekly' && styles.segBtnActive]}
                onPress={() => setForm((p) => ({ ...p, frequency: 'biweekly' }))}
              >
                <Text style={[styles.segText, form.frequency === 'biweekly' && styles.segTextActive]}>Every 2 weeks</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Active Days</Text>
            <View style={styles.daysRow}>
              {DAYS_OF_WEEK.map((d) => (
                <TouchableOpacity
                  key={d.value} style={[styles.dayChip, form.weekDays.includes(d.value) && styles.dayChipActive]}
                  onPress={() => toggleDay(d.value)}
                >
                  <Text style={[styles.dayText, form.weekDays.includes(d.value) && styles.dayTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Available For</Text>
            <View style={styles.typeRow}>
              {USER_TYPES.map((t) => (
                <TouchableOpacity
                  key={t} style={[styles.typePillBtn, form.availableFor.includes(t) && { backgroundColor: getTypeColor(t, Colors) + '15', borderColor: getTypeColor(t, Colors) }]}
                  onPress={() => toggleType(t)}
                >
                  <Text style={[styles.typePillBtnText, form.availableFor.includes(t) && { color: getTypeColor(t, Colors) }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Assigned To</Text>
            <View style={styles.assigneeList}>
              <TouchableOpacity
                style={[styles.assigneeItem, form.assignedTo === null && styles.assigneeItemActive]}
                onPress={() => setForm((p) => ({ ...p, assignedTo: null }))}
              >
                <Text style={[styles.assigneeText, form.assignedTo === null && styles.assigneeTextActive]}>Auto</Text>
              </TouchableOpacity>
              {usersList.map((u) => (
                <TouchableOpacity
                  key={u.id} style={[styles.assigneeItem, form.assignedTo === u.id && styles.assigneeItemActive]}
                  onPress={() => setForm((p) => ({ ...p, assignedTo: u.id }))}
                >
                  <Text style={[styles.assigneeText, form.assignedTo === u.id && styles.assigneeTextActive]}>{u.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Icon</Text>
            <View style={styles.emojiGrid}>
              <TouchableOpacity
                style={[styles.emojiChip, !form.emoji && styles.emojiChipActive]}
                onPress={() => setForm((p) => ({ ...p, emoji: null }))}
              >
                <Text style={styles.emojiText}>🟢</Text>
              </TouchableOpacity>
              {CHORE_EMOJIS.map((emo) => (
                <TouchableOpacity
                  key={emo}
                  style={[styles.emojiChip, form.emoji === emo && styles.emojiChipActive]}
                  onPress={() => setForm((p) => ({ ...p, emoji: emo }))}
                >
                  <Text style={styles.emojiText}>{emo}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.label}>Active</Text>
              <Switch
                value={form.isActive}
                onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
                trackColor={{ true: Colors.primary, false: Colors.bgInput }}
                thumbColor={form.isActive ? Colors.primaryLight : Colors.textMuted}
              />
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && styles.btnDisabled]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Task</Text>}
            </TouchableOpacity>

            {editingTask && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(editingTask.id)}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.accent} />
                <Text style={styles.deleteBtnText}>Delete Task</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (Colors: ThemeColors, insets?: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: insets?.top > 0 ? insets.top + 16 : 24, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mixBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: 16,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardInactive: { opacity: 0.5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  activeIndicator: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
  cardPoints: { fontSize: 13, fontWeight: '600', color: 'rgb(255, 179, 71)', marginLeft: 8 },
  textMuted: { color: Colors.textMuted },
  cardActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  actionIconBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  badge: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border,
  },
  badgeText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  daysRow: { flexDirection: 'row', gap: 4, marginBottom: 8, flexWrap: 'wrap' },
  dayChip: {
    paddingHorizontal: 6, paddingVertical: 4,
    backgroundColor: 'transparent', borderWidth: 0,
  },
  dayChipActive: { backgroundColor: 'transparent', borderWidth: 0 },
  dayText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  dayTextActive: { color: Colors.primary, fontWeight: '600' },
  availRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chipsGroup: { flexDirection: 'row', gap: 6 },
  typePill: { borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 3 },
  typePillText: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  modal: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  modalClose: { fontSize: 18, color: Colors.textSecondary, padding: 4 },
  modalBody: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 60 },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.border,
  },
  segRow: { flexDirection: 'row', gap: Spacing.sm },
  segBtn: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  segBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  segText: { color: Colors.textSecondary, fontWeight: '500' },
  segTextActive: { color: Colors.primary, fontWeight: '600' },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typePillBtn: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  typePillBtnText: { color: Colors.textSecondary, fontWeight: '500', fontSize: 13 },
  assigneeList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  assigneeItem: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  assigneeItemActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  assigneeText: { color: Colors.textSecondary, fontWeight: '500' },
  assigneeTextActive: { color: Colors.primary, fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm, padding: Spacing.md, alignItems: 'center', marginTop: 16,
  },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row', gap: 8, backgroundColor: Colors.accent + '15',
    borderWidth: 1, borderColor: Colors.accent + '30', borderRadius: Radius.sm,
    padding: Spacing.md, alignItems: 'center', justifyContent: 'center', marginTop: 12,
  },
  deleteBtnText: { color: Colors.accent, fontSize: 15, fontWeight: '600' },
  searchContainer: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    height: 38,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    height: '100%',
    padding: 0,
  },
  clearBtn: {
    padding: 4,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  emojiChip: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  emojiText: {
    fontSize: 16,
  },
  cardEmoji: {
    fontSize: 18,
  },
  biweeklyBadge: {
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  biweeklyBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footerSummary: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  footerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footerChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  footerChipValue: {
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
