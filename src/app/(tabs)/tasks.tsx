import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, ActivityIndicator, Switch, RefreshControl,
} from 'react-native';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, Radius } from '../../constants/colors';
import { Task, UserType } from '../../types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const USER_TYPES: UserType[] = ['Adult', 'Teen', 'Child'];
const TYPE_COLORS: Record<UserType, string> = {
  Adult: Colors.adult,
  Teen: Colors.teen,
  Child: Colors.child,
};

function TaskCard({
  task, users, onEdit, onDelete, canEdit,
}: {
  task: Task; users: Record<string, string>;
  onEdit: (t: Task) => void; onDelete: (id: string) => void; canEdit: boolean;
}) {
  return (
    <View style={[styles.card, !task.isActive && styles.cardInactive]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={[styles.activeIndicator, { backgroundColor: task.isActive ? Colors.success : Colors.textMuted }]} />
          <Text style={[styles.cardTitle, !task.isActive && styles.textMuted]}>{task.title}</Text>
        </View>
        {canEdit && (
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={() => onEdit(task)} style={styles.actionBtn}>
              <Text style={styles.actionEdit}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(task.id)} style={styles.actionBtn}>
              <Text style={styles.actionDelete}>🗑️</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.cardMeta}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>⚡ {task.complexity}pts</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: Colors.primary + '20' }]}>
          <Text style={[styles.badgeText, { color: Colors.primary }]}>
            {task.type === 'daily' ? '📅 Daily' : '📆 Weekly'}
          </Text>
        </View>
        {task.assignedTo && (
          <View style={[styles.badge, { backgroundColor: Colors.success + '20' }]}>
            <Text style={[styles.badgeText, { color: Colors.success }]}>
              👤 {users[task.assignedTo] ?? 'Unknown'}
            </Text>
          </View>
        )}
      </View>
      {task.type === 'weekly' && task.weekDays.length > 0 && (
        <View style={styles.daysRow}>
          {DAYS.map((d, i) => (
            <View key={i} style={[styles.dayChip, task.weekDays.includes(i) && styles.dayChipActive]}>
              <Text style={[styles.dayText, task.weekDays.includes(i) && styles.dayTextActive]}>{d}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.availRow}>
        {task.availableFor.map((t) => (
          <View key={t} style={[styles.typePill, { backgroundColor: TYPE_COLORS[t] + '20' }]}>
            <Text style={[styles.typePillText, { color: TYPE_COLORS[t] }]}>{t}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const EMPTY_FORM = {
  title: '', complexity: '10', type: 'daily' as 'daily' | 'weekly',
  weekDays: [] as number[], availableFor: ['Adult', 'Teen', 'Child'] as UserType[],
  assignedTo: null as string | null, isActive: true,
};

export default function TasksScreen() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groupUsers, setGroupUsers] = useState<Record<string, string>>({});
  const [usersList, setUsersList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const isAdult = user?.type === 'Adult';

  const loadData = useCallback(async () => {
    if (!user?.groupId) return;
    const [tasksSnap, usersSnap] = await Promise.all([
      getDocs(query(collection(db, 'tasks'), where('groupId', '==', user.groupId))),
      getDocs(query(collection(db, 'users'), where('groupId', '==', user.groupId))),
    ]);
    setTasks(tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)));
    const nameMap: Record<string, string> = {};
    const list: { id: string; name: string }[] = [];
    usersSnap.docs.forEach((d) => { nameMap[d.id] = d.data().name; list.push({ id: d.id, name: d.data().name }); });
    setGroupUsers(nameMap);
    setUsersList(list);
  }, [user?.groupId]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const openCreate = () => { setEditingTask(null); setForm({ ...EMPTY_FORM }); setModalVisible(true); };
  const openEdit = (t: Task) => {
    setEditingTask(t);
    setForm({
      title: t.title, complexity: String(t.complexity), type: t.type,
      weekDays: t.weekDays, availableFor: t.availableFor,
      assignedTo: t.assignedTo, isActive: t.isActive,
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
      const data = {
        title: form.title.trim(), complexity: c, type: form.type,
        weekDays: form.type === 'weekly' ? form.weekDays : [],
        availableFor: form.availableFor, assignedTo: form.assignedTo,
        isActive: form.isActive,
      };
      if (editingTask) {
        await updateDoc(doc(db, 'tasks', editingTask.id), data);
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...data, groupId: user.groupId, createdBy: user.id, createdAt: serverTimestamp(),
        });
      }
      await loadData();
      setModalVisible(false);
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
          await deleteDoc(doc(db, 'tasks', id));
          setTasks((prev) => prev.filter((t) => t.id !== id));
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Chore List</Text>
          <Text style={styles.subtitle}>{tasks.length} tasks · {tasks.filter((t) => t.isActive).length} active</Text>
        </View>
        {isAdult && (
          <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {tasks.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyTitle}>No tasks yet</Text>
            {isAdult && <Text style={styles.emptyDesc}>Tap "+ Add" to create your first chore</Text>}
          </View>
        )}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} users={groupUsers} onEdit={openEdit} onDelete={handleDelete} canEdit={isAdult} />
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

            <Text style={styles.label}>Type</Text>
            <View style={styles.segRow}>
              {(['daily', 'weekly'] as const).map((t) => (
                <TouchableOpacity
                  key={t} style={[styles.segBtn, form.type === t && styles.segBtnActive]}
                  onPress={() => setForm((p) => ({ ...p, type: t }))}
                >
                  <Text style={[styles.segText, form.type === t && styles.segTextActive]}>
                    {t === 'daily' ? '📅 Daily' : '📆 Weekly'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.type === 'weekly' && (
              <>
                <Text style={styles.label}>Active Days</Text>
                <View style={styles.daysRow}>
                  {DAYS.map((d, i) => (
                    <TouchableOpacity
                      key={i} style={[styles.dayChip, form.weekDays.includes(i) && styles.dayChipActive]}
                      onPress={() => toggleDay(i)}
                    >
                      <Text style={[styles.dayText, form.weekDays.includes(i) && styles.dayTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>Available For</Text>
            <View style={styles.typeRow}>
              {USER_TYPES.map((t) => (
                <TouchableOpacity
                  key={t} style={[styles.typePillBtn, form.availableFor.includes(t) && { backgroundColor: TYPE_COLORS[t] + '30', borderColor: TYPE_COLORS[t] }]}
                  onPress={() => toggleType(t)}
                >
                  <Text style={[styles.typePillBtnText, form.availableFor.includes(t) && { color: TYPE_COLORS[t] }]}>{t}</Text>
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
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  addBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardInactive: { opacity: 0.5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  activeIndicator: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  textMuted: { color: Colors.textMuted },
  cardActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 4 },
  actionEdit: { fontSize: 16 },
  actionDelete: { fontSize: 16 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  badge: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  daysRow: { flexDirection: 'row', gap: 4, marginBottom: 8, flexWrap: 'wrap' },
  dayChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm,
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.border,
  },
  dayChipActive: { backgroundColor: Colors.primary + '30', borderColor: Colors.primary },
  dayText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  dayTextActive: { color: Colors.primary },
  availRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  typePill: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  typePillText: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60, marginBottom: Spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  modal: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalClose: { fontSize: 18, color: Colors.textSecondary, padding: 4 },
  modalBody: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 60 },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.border,
  },
  segRow: { flexDirection: 'row', gap: Spacing.sm },
  segBtn: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  segBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  segText: { color: Colors.textSecondary, fontWeight: '600' },
  segTextActive: { color: Colors.primary },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typePillBtn: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  typePillBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  assigneeList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  assigneeItem: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  assigneeItemActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  assigneeText: { color: Colors.textSecondary, fontWeight: '600' },
  assigneeTextActive: { color: Colors.primary },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginTop: 16,
    shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
