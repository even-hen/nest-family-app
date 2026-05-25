import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, ActivityIndicator, RefreshControl,
  PanResponder,
} from 'react-native';
import {
  collection, query, where, getDocs, doc, updateDoc,
} from 'firebase/firestore';
import { useFocusEffect } from 'expo-router';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Spacing, Radius, ThemeColors } from '../../constants/colors';
import { User, UserType } from '../../types';
import { useAppTheme } from '../../contexts/ThemeContext';
import { getTypeColor } from '../../utils/colors';
import { USER_TYPES, FIRESTORE_COLLECTIONS } from '../../constants/domain';

const getCapacityColor = (val: number, Colors: ThemeColors) => {
  if (val <= 30) return Colors.accent;
  if (val <= 70) return Colors.success;
  return Colors.primary;
};

export default function MembersScreen() {
  const { Colors } = useAppTheme();
  const styles = useMemo(() => getStyles(Colors), [Colors]);
  const { user: currentUser, refreshUser } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<{ assignedTo: string; complexity: number; weekDays: number[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', resource: 100, type: 'Adult' as UserType });
  const [saving, setSaving] = useState(false);

  const [sliderWidth, setSliderWidth] = useState(200);
  const resourceRef = React.useRef(form.resource);
  React.useEffect(() => {
    resourceRef.current = form.resource;
  }, [form.resource]);
  const startValRef = React.useRef(form.resource);

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const initialX = evt.nativeEvent.locationX;
      const initialVal = Math.max(0, Math.min(100, Math.round((initialX / sliderWidth) * 10) * 10));
      setForm((p) => ({ ...p, resource: initialVal }));
      startValRef.current = initialVal;
    },
    onPanResponderMove: (evt, gestureState) => {
      const deltaPercent = (gestureState.dx / sliderWidth) * 100;
      const rawVal = startValRef.current + deltaPercent;
      const steppedVal = Math.max(0, Math.min(100, Math.round(rawVal / 10) * 10));
      setForm((p) => ({ ...p, resource: steppedVal }));
    },
    onPanResponderRelease: () => {}
  }), [sliderWidth]);

  const isAdult = currentUser?.type === 'Adult';

  const loadData = useCallback(async () => {
    if (!currentUser?.groupId) return;
    const [usersSnap, tasksSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('groupId', '==', currentUser.groupId))),
      getDocs(query(collection(db, 'tasks'), where('groupId', '==', currentUser.groupId), where('isActive', '==', true))),
    ]);
    const sortedMembers = usersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as User))
      .sort((a, b) => {
        if (a.id === b.id) return 0;
        if (a.id === currentUser?.id) return -1;
        if (b.id === currentUser?.id) return 1;
        return a.name.localeCompare(b.name);
      });
    setMembers(sortedMembers);
    setTasks(tasksSnap.docs.map((d) => ({
      assignedTo: d.data().assignedTo,
      complexity: d.data().complexity,
      weekDays: d.data().weekDays || [],
    })));
  }, [currentUser?.groupId, currentUser?.id]);

  useFocusEffect(useCallback(() => { loadData().finally(() => setLoading(false)); }, [loadData]));
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  // Calculate resource usage for a user
  const getResourceUsed = (userId: string) => {
    return tasks
      .filter((t) => t.assignedTo === userId)
      .reduce((sum, t) => sum + t.complexity * (t.weekDays ? t.weekDays.length : 0), 0);
  };

  const totalWeeklyCost = tasks.reduce((sum, t) => sum + t.complexity * (t.weekDays ? t.weekDays.length : 0), 0);
  const totalResource = members.reduce((sum, m) => sum + m.resource, 0);

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
          try {
            await updateDoc(doc(db, FIRESTORE_COLLECTIONS.USERS, userId), { groupId: null });
            setMembers((prev) => prev.filter((m) => m.id !== userId));
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not remove member');
          }
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
        <Text style={styles.title}>Members</Text>
        <Text style={styles.subtitle}>{members.length} member{members.length !== 1 ? 's' : ''}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {members.map((m) => {
          const usedCost = getResourceUsed(m.id);
          const userShare = totalResource > 0 ? (m.resource / totalResource) * totalWeeklyCost : 0;
          const usedPct = userShare > 0 ? Math.round((usedCost / userShare) * 100) : 0;
          const canEdit = isAdult || m.id === currentUser?.id;
          const initial = m.name?.[0]?.toUpperCase() ?? '?';

          return (
            <TouchableOpacity
              key={m.id}
              style={styles.card}
              onPress={() => canEdit && openEdit(m)}
              activeOpacity={canEdit ? 0.75 : 1}
            >
              <View style={styles.cardTop}>
                <View style={[styles.avatar, { backgroundColor: getTypeColor(m.type, Colors) + '15', borderWidth: 1, borderColor: getTypeColor(m.type, Colors) + '30' }]}>
                  <Text style={[styles.avatarText, { color: getTypeColor(m.type, Colors) }]}>{initial}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.memberName}>{m.name}</Text>
                    <View style={[styles.typePill, { backgroundColor: getTypeColor(m.type, Colors) + '15', borderWidth: 1, borderColor: getTypeColor(m.type, Colors) + '30' }]}>
                      <Text style={[styles.typePillText, { color: getTypeColor(m.type, Colors) }]}>{m.type}</Text>
                    </View>
                    {m.id === currentUser?.id && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>You</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.resourceLabel}>Capacity</Text>
                  <Text style={styles.resourceValue}>{m.resource}</Text>
                </View>
              </View>

              {/* Resource usage bar */}
              <View style={styles.barContainer}>
                <View style={styles.barBg}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.min(100, usedPct)}%` as any, backgroundColor: Colors.primary },
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
                  {USER_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeBtn, form.type === t && { borderColor: getTypeColor(t, Colors), backgroundColor: getTypeColor(t, Colors) + '15' }]}
                      onPress={() => setForm((p) => ({ ...p, type: t }))}
                    >
                      <Text style={[styles.typeBtnText, form.type === t && { color: getTypeColor(t, Colors) }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>Capacity: <Text style={{ color: getCapacityColor(form.resource, Colors) }}>{form.resource}</Text></Text>
            <View style={styles.sliderContainer}>
              <View 
                style={styles.trackWrapper}
                onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
                {...panResponder.panHandlers}
              >
                <View style={styles.trackBg} />
                <View style={[styles.trackFill, { width: `${form.resource}%`, backgroundColor: getCapacityColor(form.resource, Colors) }]} />
                
                {/* Single Thumb Indicator */}
                <View style={[styles.thumbContainer, { left: `${form.resource}%` }]} pointerEvents="none">
                  <View style={[styles.sliderThumb, { borderColor: getCapacityColor(form.resource, Colors), shadowColor: getCapacityColor(form.resource, Colors) }]} />
                </View>
              </View>
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

const getStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  avatar: { width: 44, height: 44, borderRadius: Radius.sm, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  avatarText: { fontSize: 18, fontWeight: '700' },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  youBadge: {
    height: 20, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.primary + '15', borderRadius: 4,
    paddingHorizontal: 8, borderWidth: 1, borderColor: Colors.primary + '30',
  },
  youBadgeText: {
    fontSize: 10, color: Colors.primary, fontWeight: '700',
  },
  typePill: {
    height: 20, justifyContent: 'center', alignItems: 'center',
    borderRadius: 4, paddingHorizontal: 8,
    borderWidth: 1,
  },
  typePillText: { fontSize: 10, fontWeight: '600' },
  cardRight: { alignItems: 'flex-end' },
  resourceLabel: { fontSize: 11, color: Colors.textMuted },
  resourceValue: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
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
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  modalClose: { fontSize: 18, color: Colors.textSecondary },
  modalBody: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 60 },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.border,
  },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typeBtn: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  typeBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  sliderContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  trackWrapper: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    height: 6,
    backgroundColor: Colors.bgInput,
    borderRadius: 3,
    width: '100%',
  },
  trackFill: {
    height: 6,
    backgroundColor: '#009688',
    borderRadius: 3,
    position: 'absolute',
    left: 0,
  },
  thumbContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 24,
    marginLeft: -12,
  },
  sliderThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: '#009688',
    shadowColor: '#009688',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm, padding: Spacing.md, alignItems: 'center', marginTop: 16,
  },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  removeBtn: {
    backgroundColor: Colors.accent + '10', borderRadius: Radius.sm, padding: Spacing.md,
    alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: Colors.accent + '20',
  },
  removeBtnText: { color: Colors.accent, fontWeight: '600', fontSize: 14 },
});
