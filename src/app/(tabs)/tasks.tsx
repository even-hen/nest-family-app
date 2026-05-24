import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Radius, Spacing, ThemeColors } from '../../constants/colors';
import { ALL_WEEK_DAYS, DAYS_OF_WEEK, USER_TYPES } from '../../constants/domain';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../contexts/ThemeContext';
import { autoDistributeTasks } from '../../lib/distribution';
import { db } from '../../lib/firebase';
import { syncLocalNotifications } from '../../lib/notifications';
import { Assignment, Task, User, UserType } from '../../types';
import { getTypeColor } from '../../utils/colors';
import { getMondayISO } from '../../utils/date';

function TaskCard({
  task, users, onEdit, canEdit,
}: {
  task: Task; users: Record<string, string>;
  onEdit: (t: Task) => void; canEdit: boolean;
}) {
  const { Colors } = useAppTheme();
  const styles = useMemo(() => getStyles(Colors), [Colors]);
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
};

const CHORE_EMOJIS = ['🍳', '🍲', '🥗', '🍽️', '🪞', '🚽', '🛁', '🚿', '🪠', '🧻', '🧹', '🗑️', '🧤', '💡', '🌱', '🌻', '🛒', '🛏️', '🧸'];

export default function TasksScreen() {
  const { Colors } = useAppTheme();
  const styles = useMemo(() => getStyles(Colors), [Colors]);
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groupUsers, setGroupUsers] = useState<Record<string, string>>({});
  const [usersList, setUsersList] = useState<{ id: string; name: string }[]>([]);
  const [fullUsersList, setFullUsersList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isAdult = user?.type === 'Adult';

  const loadData = useCallback(async () => {
    if (!user?.groupId) return;
    const [tasksSnap, usersSnap] = await Promise.all([
      getDocs(query(collection(db, 'tasks'), where('groupId', '==', user.groupId))),
      getDocs(query(collection(db, 'users'), where('groupId', '==', user.groupId))),
    ]);
    const nameMap: Record<string, string> = {};
    const list: { id: string; name: string }[] = [];
    const fullList: User[] = [];
    usersSnap.docs.forEach((d) => {
      const uData = { id: d.id, ...d.data() } as User;
      nameMap[d.id] = uData.name;
      list.push({ id: d.id, name: uData.name });
      fullList.push(uData);
    });
    setGroupUsers(nameMap);
    setUsersList(list);
    setFullUsersList(fullList);

    const loadedTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
    loadedTasks.sort((a, b) => {
      // 1. Active tasks at the top, deactivated at the bottom
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }

      // 2. Sort descending by total points (complexity * weekDays count)
      const aDays = a.weekDays ? a.weekDays.length : 0;
      const bDays = b.weekDays ? b.weekDays.length : 0;
      const aPoints = a.complexity * aDays;
      const bPoints = b.complexity * bDays;

      if (bPoints !== aPoints) {
        return bPoints - aPoints; // Descending
      }

      // 3. Fallback to title alphabetically
      return a.title.localeCompare(b.title);
    });
    setTasks(loadedTasks);
  }, [user?.groupId]);

  useFocusEffect(
    useCallback(() => {
      setSearchQuery('');
      loadData().finally(() => setLoading(false));
    }, [loadData])
  );

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const openCreate = () => { setEditingTask(null); setForm({ ...EMPTY_FORM }); setModalVisible(true); };
  const openEdit = (t: Task) => {
    setEditingTask(t);
    setForm({
      title: t.title, emoji: t.emoji || null, complexity: String(t.complexity),
      weekDays: t.weekDays || [], availableFor: t.availableFor,
      assignedTo: t.auto ? null : t.assignedTo, isActive: t.isActive,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    const c = parseInt(form.complexity, 10);
    if (isNaN(c) || c < 1 || c > 100) { Alert.alert('Error', 'Complexity must be 1–100'); return; }
    if (!user?.groupId) return;
    setSaving(true);
    try {
      const auto = form.assignedTo === null;
      let finalAssignedTo = form.assignedTo;

      const activeDays = form.weekDays.length === 0 ? [...ALL_WEEK_DAYS] : form.weekDays;

      if (auto && form.isActive) {
        // Construct temporary list of active tasks including this one to run distribution
        const tempTaskId = editingTask ? editingTask.id : 'temp-new-task';
        const otherActiveTasks = tasks
          .filter((t) => t.isActive && (editingTask ? t.id !== editingTask.id : true))
          .map((t) => ({ ...t }));

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

      const data = {
        title: form.title.trim(),
        emoji: form.emoji,
        complexity: c,
        weekDays: activeDays,
        availableFor: form.availableFor.length === 0 ? [...USER_TYPES] : form.availableFor,
        assignedTo: finalAssignedTo,
        auto,
        isActive: form.isActive,
      };

      let savedTaskId = '';
      if (editingTask) {
        savedTaskId = editingTask.id;
        await updateDoc(doc(db, 'tasks', editingTask.id), data);
      } else {
        const docRef = await addDoc(collection(db, 'tasks'), {
          ...data,
          groupId: user.groupId,
          createdBy: user.id,
          createdAt: serverTimestamp(),
        });
        savedTaskId = docRef.id;
      }

      // Sync weekly assignments for today and future days
      const weekStartStr = getMondayISO(new Date());
      const assignmentsSnap = await getDocs(
        query(
          collection(db, 'assignments'),
          where('taskId', '==', savedTaskId),
          where('weekStart', '==', weekStartStr)
        )
      );
      const existingAssignments = assignmentsSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Assignment)
      );

      const todayDayIndex = new Date().getDay();
      const getWeekDayOrderIndex = (idx: number) => (idx === 0 ? 6 : idx - 1);
      const todayOrder = getWeekDayOrderIndex(todayDayIndex);

      const getDateForWeekday = (weekStart: string, idx: number) => {
        const d = new Date(weekStart);
        const offset = idx === 0 ? 6 : idx - 1;
        d.setDate(d.getDate() + offset);
        return d.toISOString().split('T')[0];
      };

      if (form.isActive) {
        // We only create/update assignments for today and future days
        for (const dayIndex of activeDays) {
          const dateISO = getDateForWeekday(weekStartStr, dayIndex);
          const isTodayOrFuture = getWeekDayOrderIndex(dayIndex) >= todayOrder;

          if (isTodayOrFuture) {
            const existing = existingAssignments.find((a) => a.date === dateISO);

            if (existing) {
              // Update only pending assignments
              if (existing.status === 'pending') {
                await updateDoc(doc(db, 'assignments', existing.id), {
                  assignedTo: finalAssignedTo,
                  title: form.title.trim(),
                  complexity: c,
                  weekDays: activeDays,
                });
              }
            } else {
              // Create new assignment
              await addDoc(collection(db, 'assignments'), {
                taskId: savedTaskId,
                groupId: user.groupId,
                title: form.title.trim(),
                complexity: c,
                weekDays: activeDays,
                assignedTo: finalAssignedTo,
                status: 'pending',
                weekStart: weekStartStr,
                date: dateISO,
                doneAt: null,
                skippedAt: null,
                createdAt: serverTimestamp(),
              });
            }
          }
        }

        // Delete any pending assignments for days that are today/future but are NO LONGER in activeDays
        for (const existing of existingAssignments) {
          const dayIdx = new Date(existing.date).getDay();
          const isTodayOrFuture = getWeekDayOrderIndex(dayIdx) >= todayOrder;
          const isNotActiveAnymore = !activeDays.includes(dayIdx);

          if (isTodayOrFuture && isNotActiveAnymore && existing.status === 'pending') {
            await deleteDoc(doc(db, 'assignments', existing.id));
          }
        }
      } else {
        // If task is inactive, delete all pending assignments for today/future
        for (const existing of existingAssignments) {
          const dayIdx = new Date(existing.date).getDay();
          const isTodayOrFuture = getWeekDayOrderIndex(dayIdx) >= todayOrder;
          if (isTodayOrFuture && existing.status === 'pending') {
            await deleteDoc(doc(db, 'assignments', existing.id));
          }
        }
      }

      await loadData();
      setModalVisible(false);
      if (user) {
        syncLocalNotifications(user.id, user.groupId, user.type, user.notificationTime);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Task', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'tasks', id));

            // Delete pending assignments for today/future
            const weekStartStr = getMondayISO(new Date());
            const todayDateISO = new Date().toISOString().split('T')[0];
            const snap = await getDocs(query(
              collection(db, 'assignments'),
              where('taskId', '==', id),
              where('weekStart', '==', weekStartStr)
            ));

            const deletePromises = snap.docs
              .map((d) => ({ id: d.id, ...d.data() } as Assignment))
              .filter((a) => a.status === 'pending' && a.date >= todayDateISO)
              .map((a) => deleteDoc(doc(db, 'assignments', a.id)));

            await Promise.all(deletePromises);

            setTasks((prev) => prev.filter((t) => t.id !== id));
            setModalVisible(false);
            if (user) {
              syncLocalNotifications(user.id, user.groupId, user.type, user.notificationTime);
            }
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not delete task');
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
        // 1. Fetch latest active tasks and users
        const [tasksSnap, usersSnap] = await Promise.all([
          getDocs(query(collection(db, 'tasks'), where('groupId', '==', user.groupId))),
          getDocs(query(collection(db, 'users'), where('groupId', '==', user.groupId))),
        ]);

        const fetchedTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
        const fetchedUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as User));

        const assignableUsers = fetchedUsers.map((u) => ({
          id: u.id,
          type: u.type,
          resource: u.resource,
        }));

        // 2. Run distribution
        const { assignments: distResult } = autoDistributeTasks(fetchedTasks, assignableUsers, true);

        // 3. Apply changes via a batch
        const batch = writeBatch(db);

        // Load current week assignments to update pending ones
        const weekStartStr = getMondayISO(new Date());
        const assignmentsSnap = await getDocs(
          query(
            collection(db, 'assignments'),
            where('groupId', '==', user.groupId),
            where('weekStart', '==', weekStartStr)
          )
        );

        const currentWeekAssignments = assignmentsSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Assignment)
        );

        const todayDateISO = new Date().toISOString().split('T')[0];

        const getDateForWeekday = (weekStart: string, idx: number) => {
          const d = new Date(weekStart);
          const offset = idx === 0 ? 6 : idx - 1;
          d.setDate(d.getDate() + offset);
          return d.toISOString().split('T')[0];
        };

        for (const item of distResult) {
          const task = fetchedTasks.find((t) => t.id === item.taskId);
          if (!task || !task.auto) continue; // Only mix auto-assigned tasks

          // Update Task in Firestore
          batch.update(doc(db, 'tasks', task.id), { assignedTo: item.assignedTo });

          // Update/Create weekly pending assignments for today and future days
          const activeDays = task.weekDays || [];
          for (const dayIndex of activeDays) {
            const dateISO = getDateForWeekday(weekStartStr, dayIndex);

            // Only update/create today or in the future
            if (dateISO >= todayDateISO) {
              const existing = currentWeekAssignments.find(
                (a) => a.taskId === task.id && a.date === dateISO
              );

              if (existing) {
                if (existing.status === 'pending') {
                  batch.update(doc(db, 'assignments', existing.id), {
                    assignedTo: item.assignedTo,
                  });
                }
              } else {
                // Create new pending assignment
                const newRef = doc(collection(db, 'assignments'));
                batch.set(newRef, {
                  taskId: task.id,
                  groupId: user.groupId,
                  title: task.title,
                  complexity: task.complexity,
                  weekDays: task.weekDays,
                  assignedTo: item.assignedTo,
                  status: 'pending',
                  weekStart: weekStartStr,
                  date: dateISO,
                  doneAt: null,
                  skippedAt: null,
                  createdAt: serverTimestamp(),
                });
              }
            }
          }
        }

        await batch.commit();
        await loadData();
        if (user) {
          syncLocalNotifications(user.id, user.groupId, user.type, user.notificationTime);
        }
        if (Platform.OS === 'web') {
          window.alert('Auto-assigned tasks shuffled successfully!');
        } else {
          Alert.alert('Success', 'Auto-assigned tasks shuffled successfully!');
        }
      } catch (e: any) {
        if (Platform.OS === 'web') {
          window.alert(e?.message ?? 'Could not shuffle tasks');
        } else {
          Alert.alert('Error', e?.message ?? 'Could not shuffle tasks');
        }
      } finally {
        setMixing(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to re-shuffle all auto-assigned tasks for this week?')) {
        runShuffle();
      }
    } else {
      Alert.alert(
        'Shuffle Tasks',
        'Are you sure you want to re-shuffle all auto-assigned tasks for this week?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Shuffle', onPress: runShuffle },
        ]
      );
    }
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
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

const getStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
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
    paddingBottom: 100,
    gap: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardInactive: { opacity: 0.5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  activeIndicator: { width: 8, height: 8, borderRadius: 4 },
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
});
