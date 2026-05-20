import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, ActivityIndicator, Switch, RefreshControl,
} from 'react-native';
import {
  collection, query, where, getDocs, doc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, Radius } from '../../constants/colors';
import { User, UserType } from '../../types';

const TYPE_COLORS: Record<UserType, string> = {
  Adult: Colors.adult,
  Teen: Colors.teen,
  Child: Colors.child,
};

const TYPE_EMOJIS: Record<UserType, string> = {
  Adult: '👤',
  Teen: '🧑',
  Child: '🧒',
};

export default function MembersScreen() {
  const { user: currentUser, refreshUser } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<{ assignedTo: string; complexity: number; type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', resource: 100, type: 'Adult' as UserType });
  const [saving, setSaving] = useState(false);

  const isAdult = currentUser?.type === 'Adult';

  const loadData = useCallback(async () => {
    if (!currentUser?.groupId) return;
    const [usersSnap, tasksSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('groupId', '==', currentUser.groupId))),
      getDocs(query(collection(db, 'tasks'), where('groupId', '==', currentUser.groupId), where('isActive', '==', true))),
    ]);
    setMembers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as User)));
    setTasks(tasksSnap.docs.map((d) => ({
      assignedTo: d.data().assignedTo,
      complexity: d.data().complexity,
      type: d.data().type,
    })));
  }, [currentUser?.groupId]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  // Calculate resource usage for a user
  const getResourceUsed = (userId: string) => {
    return tasks
      .filter((t) => t.assignedTo === userId)
      .reduce((sum, t) => sum + (t.type === 'daily' ? t.complexity * 7 : t.complexity), 0);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setForm({ name: u.name, resource: u.resource, type: u.type });
  };

  const handleSave = async () => {
    if (!editingUser) return;
    if (form.name.trim().length < 2) { Alert.alert('Error', 'Name must be at least 2 characters'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', editingUser.id), {
        name: form.name.trim(),
        resource: form.resource,
        type: form.type,
      });
      if (editingUser.id === currentUser?.id) await refreshUser();
      await loadData();
      setEditingUser(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update user');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (userId: string) => {
    Alert.alert('Remove Member', 'Remove this member from the group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await updateDoc(doc(db, 'users', userId), { groupId: null });
          setMembers((prev) => prev.filter((m) => m.id !== userId));
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Family Members</Text>
        <Text style={styles.subtitle}>{members.length} member{members.length !== 1 ? 's' : ''}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {members.map((m) => {
          const usedCost = getResourceUsed(m.id);
          const maxCost = m.resource * 7;
          const usedPct = maxCost > 0 ? Math.min(100, Math.round((usedCost / maxCost) * 100)) : 0;
          const canEdit = isAdult || m.id === currentUser?.id;

          return (
            <TouchableOpacity
              key={m.id}
              style={styles.card}
              onPress={() => canEdit && openEdit(m)}
              activeOpacity={canEdit ? 0.75 : 1}
            >
              <View style={styles.cardTop}>
                <View style={[styles.avatar, { backgroundColor: TYPE_COLORS[m.type] + '30' }]}>
                  <Text style={styles.avatarEmoji}>{TYPE_EMOJIS[m.type]}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.memberName}>{m.name}</Text>
                    {m.id === currentUser?.id && <Text style={styles.youBadge}>You</Text>}
                  </View>
                  <View style={[styles.typePill, { backgroundColor: TYPE_COLORS[m.type] + '20' }]}>
                    <Text style={[styles.typePillText, { color: TYPE_COLORS[m.type] }]}>{m.type}</Text>
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.resourceLabel}>Capacity</Text>
                  <Text style={styles.resourceValue}>{m.resource}%</Text>
                </View>
              </View>

              {/* Resource usage bar */}
              <View style={styles.barContainer}>
                <View style={styles.barBg}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${usedPct}%` as any, backgroundColor: usedPct > 80 ? Colors.accent : Colors.primary },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{usedPct}% load</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={!!editingUser} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Member</Text>
            <TouchableOpacity onPress={() => setEditingUser(null)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input} value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
              placeholder="Full name" placeholderTextColor={Colors.textMuted}
            />

            {isAdult && (
              <>
                <Text style={styles.label}>Role</Text>
                <View style={styles.typeRow}>
                  {(['Adult', 'Teen', 'Child'] as UserType[]).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeBtn, form.type === t && { borderColor: TYPE_COLORS[t], backgroundColor: TYPE_COLORS[t] + '20' }]}
                      onPress={() => setForm((p) => ({ ...p, type: t }))}
                    >
                      <Text style={styles.typeBtnText}>{TYPE_EMOJIS[t]} {t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>Capacity: <Text style={{ color: Colors.primary }}>{form.resource}%</Text></Text>
            <View style={styles.sliderRow}>
              {[25, 50, 75, 100].map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.sliderBtn, form.resource === v && styles.sliderBtnActive]}
                  onPress={() => setForm((p) => ({ ...p, resource: v }))}
                >
                  <Text style={[styles.sliderText, form.resource === v && styles.sliderTextActive]}>{v}%</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && styles.btnDisabled]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>

            {isAdult && editingUser?.id !== currentUser?.id && (
              <TouchableOpacity style={styles.removeBtn} onPress={() => editingUser && handleRemove(editingUser.id)}>
                <Text style={styles.removeBtnText}>Remove from Group</Text>
              </TouchableOpacity>
            )}
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
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  avatarEmoji: { fontSize: 22 },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  memberName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  youBadge: {
    fontSize: 11, color: Colors.primary, fontWeight: '700',
    backgroundColor: Colors.primary + '20', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2,
  },
  typePill: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  typePillText: { fontSize: 11, fontWeight: '600' },
  cardRight: { alignItems: 'flex-end' },
  resourceLabel: { fontSize: 11, color: Colors.textMuted },
  resourceValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  barContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barBg: { flex: 1, height: 6, backgroundColor: Colors.bgInput, borderRadius: Radius.full, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: Radius.full },
  barLabel: { fontSize: 11, color: Colors.textMuted, width: 60, textAlign: 'right' },
  modal: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalClose: { fontSize: 18, color: Colors.textSecondary },
  modalBody: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 60 },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 8 },
  input: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.border,
  },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typeBtn: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  typeBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  sliderRow: { flexDirection: 'row', gap: Spacing.sm },
  sliderBtn: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  sliderBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  sliderText: { color: Colors.textSecondary, fontWeight: '600' },
  sliderTextActive: { color: Colors.primary },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginTop: 16,
    shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  removeBtn: {
    backgroundColor: Colors.accent + '20', borderRadius: Radius.md, padding: Spacing.md,
    alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: Colors.accent + '40',
  },
  removeBtnText: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
});
