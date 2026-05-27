import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Spacing, Radius, ThemeColors } from '../../constants/colors';
import { useAppTheme } from '../../contexts/ThemeContext';
import { User, UserType } from '../../types';
import { getTypeColor } from '../../utils/colors';
import { USER_TYPES } from '../../constants/domain';

interface WeekStat {
  userId: string;
  userName: string;
  userType: UserType;
  done: number;
  skipped: number;
  pending: number;
  totalComplexityDone: number;
  resource: number;
  usedPct: number;
}

const getCapacityColor = (val: number, Colors: ThemeColors) => {
  if (val <= 30) return Colors.accent;
  if (val <= 70) return Colors.success;
  return Colors.primary;
};

function getWeekStart(offsetWeeks = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) - offsetWeeks * 7;
  d.setDate(diff);
  // Use local date parts to match how weekStart is stored in Firestore
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function StatsScreen() {
  const { Colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(Colors, insets), [Colors, insets]);
  const { user, refreshUser } = useAuth();
  const [stats, setStats] = useState<WeekStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  // Detail Modal States
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailUser, setDetailUser] = useState<{ id: string; name: string } | null>(null);
  const [detailStatus, setDetailStatus] = useState<'done' | 'skipped' | 'pending' | null>(null);

  // Edit Modal States
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', resource: 100, type: 'Adult' as UserType });
  const [saving, setSaving] = useState(false);

  const [sliderWidth, setSliderWidth] = useState(200);
  const resourceRef = useRef(form.resource);
  useEffect(() => {
    resourceRef.current = form.resource;
  }, [form.resource]);
  const startValRef = useRef(form.resource);

  const panResponder = useMemo(() => PanResponder.create({
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

  const isAdult = user?.type === 'Adult';

  const loadStats = useCallback(async () => {
    if (!user?.groupId) return;
    const weekStart = getWeekStart(weekOffset);

    const [usersSnap, assignmentsSnap, tasksSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('groupId', '==', user.groupId))),
      getDocs(query(
        collection(db, 'assignments'),
        where('groupId', '==', user.groupId),
        where('weekStart', '==', weekStart),
      )),
      getDocs(query(collection(db, 'tasks'), where('groupId', '==', user.groupId), where('isActive', '==', true))),
    ]);

    const userMap: Record<string, { name: string; resource: number; type: UserType }> = {};
    usersSnap.docs.forEach((d) => {
      const data = d.data();
      userMap[d.id] = {
        name: data.name,
        resource: data.resource ?? 100,
        type: data.type ?? 'Child',
      };
    });

    const tasksList = tasksSnap.docs.map((d) => ({
      assignedTo: d.data().assignedTo,
      complexity: d.data().complexity,
      weekDays: d.data().weekDays || [],
    }));

    const getResourceUsed = (userId: string) => {
      return tasksList
        .filter((t) => t.assignedTo === userId)
        .reduce((sum, t) => sum + t.complexity * (t.weekDays ? t.weekDays.length : 0), 0);
    };

    const totalWeeklyCost = tasksList.reduce((sum, t) => sum + t.complexity * (t.weekDays ? t.weekDays.length : 0), 0);
    const totalResource = Object.values(userMap).reduce((sum, m) => sum + m.resource, 0);

    const statsMap: Record<string, WeekStat> = {};
    for (const uid of Object.keys(userMap)) {
      const usedCost = getResourceUsed(uid);
      const userShare = totalResource > 0 ? (userMap[uid].resource / totalResource) * totalWeeklyCost : 0;
      const usedPct = userShare > 0 ? Math.round((usedCost / userShare) * 100) : 0;

      statsMap[uid] = {
        userId: uid,
        userName: userMap[uid].name,
        userType: userMap[uid].type,
        done: 0, skipped: 0, pending: 0,
        totalComplexityDone: 0,
        resource: userMap[uid].resource,
        usedPct: usedPct,
      };
    }

    const loadedAssignments: any[] = [];
    assignmentsSnap.docs.forEach((d) => {
      const data = d.data();
      loadedAssignments.push({ id: d.id, ...data });
      const uid = data.assignedTo;
      if (!statsMap[uid]) return;
      if (data.status === 'done') {
        statsMap[uid].done++;
        statsMap[uid].totalComplexityDone += data.complexity ?? 0;
      } else if (data.status === 'skipped') {
        statsMap[uid].skipped++;
      } else {
        statsMap[uid].pending++;
      }
    });

    setAllAssignments(loadedAssignments);
    const sortedStats = Object.values(statsMap).sort((a, b) => {
      if (a.userId === b.userId) return 0;
      if (a.userId === user?.id) return -1;
      if (b.userId === user?.id) return 1;
      return b.done - a.done;
    });
    setStats(sortedStats);
  }, [user?.groupId, user?.id, weekOffset]);

  useFocusEffect(useCallback(() => { loadStats().finally(() => setLoading(false)); }, [loadStats]));
  const onRefresh = async () => { setRefreshing(true); await loadStats(); setRefreshing(false); };

  const openEdit = (s: WeekStat) => {
    setEditingUser({
      id: s.userId,
      name: s.userName,
      type: s.userType,
      resource: s.resource,
    } as any);
    setForm({ name: s.userName, resource: s.resource, type: s.userType });
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
      if (editingUser.id === user?.id) await refreshUser();
      await loadStats();
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
            await updateDoc(doc(db, 'users', userId), { groupId: null });
            await loadStats();
            setEditingUser(null);
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not remove member');
          }
        },
      },
    ]);
  };

  const formatAssignmentDate = useCallback((dateStr: string): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, []);

  const groupedAssignments = useMemo(() => {
    if (!detailUser || !detailStatus) return [];
    
    const filtered = allAssignments.filter(
      (a) => a.assignedTo === detailUser.id && a.status === detailStatus
    );

    filtered.sort((a, b) => {
      if (detailStatus === 'pending') {
        return a.date.localeCompare(b.date);
      } else {
        return b.date.localeCompare(a.date);
      }
    });

    const groups: { date: string; list: any[] }[] = [];
    filtered.forEach((a) => {
      let group = groups.find((g) => g.date === a.date);
      if (!group) {
        group = { date: a.date, list: [] };
        groups.push(group);
      }
      group.list.push(a);
    });

    // Sort tasks in each day by complexity (points) ascending
    groups.forEach((g) => {
      g.list.sort((a, b) => a.complexity - b.complexity);
    });

    return groups;
  }, [allAssignments, detailUser, detailStatus]);

  const weekLabel = weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Last Week' : `${weekOffset} Weeks Ago`;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Members & Stats</Text>
        <View style={styles.weekNav}>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setWeekOffset((w) => w + 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={16} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.weekLabel}>{weekLabel}</Text>
          <TouchableOpacity
            style={[styles.navBtn, weekOffset === 0 && styles.navBtnDisabled]}
            onPress={() => setWeekOffset((w) => Math.max(0, w - 1))}
            disabled={weekOffset === 0}
            activeOpacity={0.7}
          >
            <Ionicons
              name="chevron-forward"
              size={16}
              color={weekOffset === 0 ? Colors.textMuted : Colors.textPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {stats.map((s) => {
          const isMe = s.userId === user?.id;
          const canEdit = isAdult || s.userId === user?.id;

          return (
            <View key={s.userId} style={[styles.card, isMe && styles.cardMe]}>
              {/* Header row at the top: Name and chips on left, edit icon on right */}
              <View style={[styles.cardHeader, { marginBottom: Spacing.sm }]}>
                <View style={styles.nameRow}>
                  <Text style={styles.memberName}>{toTitleCase(s.userName)}</Text>

                  {/* Role chip displayed after user name */}
                  <View style={[styles.typePill, { backgroundColor: getTypeColor(s.userType, Colors) + '15', borderWidth: 1, borderColor: getTypeColor(s.userType, Colors) + '30' }]}>
                    <Text style={[styles.typePillText, { color: getTypeColor(s.userType, Colors) }]}>{s.userType}</Text>
                  </View>

                  {isMe && (
                    <View style={styles.youBadge}>
                      <Text style={styles.youText}>You</Text>
                    </View>
                  )}
                </View>

                {/* Edit icon displayed on the right side of the card header */}
                {canEdit && (
                  <TouchableOpacity onPress={() => openEdit(s)} style={styles.editIconBtnRight} activeOpacity={0.7}>
                    <Ionicons name="create-outline" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Completion / Load bar in the middle */}
              <View style={styles.barRow}>
                <View style={[styles.barBg, weekOffset > 0 && { backgroundColor: Colors.border }]}>
                  {weekOffset === 0 && (
                    <View style={[styles.barFill, { width: `${Math.min(100, s.usedPct)}%` as any }]} />
                  )}
                </View>
              </View>

              {/* Stat pills */}
              <View style={styles.pillsRow}>
                <TouchableOpacity
                  style={[styles.pill, { backgroundColor: Colors.done + '20' }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setDetailUser({ id: s.userId, name: s.userName });
                    setDetailStatus('done');
                    setModalVisible(true);
                  }}
                >
                  <Text style={styles.pillNum}>{s.done}</Text>
                  <Text style={[styles.pillLabel, { color: Colors.done }]}>Done</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pill, { backgroundColor: Colors.skipped + '20' }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setDetailUser({ id: s.userId, name: s.userName });
                    setDetailStatus('skipped');
                    setModalVisible(true);
                  }}
                >
                  <Text style={styles.pillNum}>{s.skipped}</Text>
                  <Text style={[styles.pillLabel, { color: Colors.skipped }]}>Skipped</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pill, { backgroundColor: Colors.pending + '20' }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setDetailUser({ id: s.userId, name: s.userName });
                    setDetailStatus('pending');
                    setModalVisible(true);
                  }}
                >
                  <Text style={styles.pillNum}>{s.pending}</Text>
                  <Text style={[styles.pillLabel, { color: Colors.pending }]}>Pending</Text>
                </TouchableOpacity>

                <View style={[styles.pill, { backgroundColor: Colors.primary + '20' }]}>
                  <Text style={styles.pillNum}>{s.totalComplexityDone}</Text>
                  <Text style={[styles.pillLabel, { color: Colors.primary }]}>Points</Text>
                </View>
              </View>

              {/* Capacity and Load row at the very bottom of the card (only for current week) */}
              {weekOffset === 0 && (
                <View style={styles.bottomInfoRow}>
                  <Text style={styles.infoText}>
                    Capacity: <Text style={styles.infoValue}>{s.resource}</Text>
                  </Text>
                  <Text style={styles.infoText}>
                    Load: <Text style={styles.infoValue}>{s.usedPct}%</Text>
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        {stats.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={60} color={Colors.textMuted} style={{ marginBottom: Spacing.md }} />
            <Text style={styles.emptyTitle}>No data yet</Text>
            <Text style={styles.emptyDesc}>Stats will appear once tasks are assigned</Text>
          </View>
        )}
      </ScrollView>

      {/* Stats Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>
                {detailUser ? toTitleCase(detailUser.name) : ''}
              </Text>
              <Text style={styles.modalSubtitle}>
                {detailStatus === 'done' ? 'Completed Tasks' : detailStatus === 'skipped' ? 'Skipped Tasks' : 'Pending Tasks'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalList}>
            {groupedAssignments.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons
                  name={detailStatus === 'done' ? 'checkbox-outline' : detailStatus === 'skipped' ? 'close-circle-outline' : 'time-outline'}
                  size={48}
                  color={Colors.textMuted}
                  style={{ marginBottom: Spacing.sm }}
                />
                <Text style={styles.modalEmptyText}>No tasks found</Text>
              </View>
            ) : (
              groupedAssignments.map((g) => (
                <View key={g.date} style={styles.groupContainer}>
                  <View style={styles.dateHeaderContainer}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                    <Text style={styles.dateHeaderText}>{formatAssignmentDate(g.date)}</Text>
                  </View>
                  <View style={styles.groupList}>
                    {g.list.map((a) => (
                      <View key={a.id} style={styles.modalCard}>
                        <View style={styles.modalCardHeader}>
                          <Text style={styles.modalCardTitle}>{a.title}</Text>
                          <Text style={styles.modalCardPoints}>{a.complexity} pts</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Modal (Consolidated from MembersScreen) */}
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

            {isAdult && editingUser?.id !== user?.id && (
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

const getStyles = (Colors: ThemeColors, insets?: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: Spacing.lg, paddingTop: insets?.top > 0 ? insets.top + 16 : 24, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  navBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgInput,
    justifyContent: 'center', alignItems: 'center',
  },
  navBtnDisabled: { opacity: 0.3 },
  weekLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600', flex: 1 },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardMe: { borderColor: Colors.primary + '60' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: 8 },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bgInput,
    justifyContent: 'center', alignItems: 'center',
  },
  rankText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  memberName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  youBadge: {
    height: 20, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.primary + '15', borderRadius: 4,
    paddingHorizontal: 8, borderWidth: 1, borderColor: Colors.primary + '30',
  },
  youText: { fontSize: 10, color: Colors.primary, fontWeight: '700' },
  completion: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  barRow: { marginBottom: Spacing.md },
  barBg: { height: 6, backgroundColor: Colors.bgInput, borderRadius: Radius.full, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  pillsRow: { flexDirection: 'row', gap: Spacing.sm },
  pill: { flex: 1, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center' },
  pillNum: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  pillLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60, marginBottom: Spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  modalContainer: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.lg, paddingTop: 30, borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgInput,
    justifyContent: 'center', alignItems: 'center',
  },
  modalList: { padding: Spacing.lg, paddingBottom: 60 },
  groupContainer: { marginBottom: Spacing.md },
  dateHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingHorizontal: 4,
  },
  dateHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  groupList: { gap: Spacing.sm },
  modalCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalCardTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary, flex: 1, marginRight: Spacing.sm },
  modalCardPoints: { fontSize: 13, fontWeight: '600', color: 'rgb(255, 179, 71)' },
  modalEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  modalEmptyText: { fontSize: 15, color: Colors.textMuted, fontWeight: '500' },

  // Added styles for consolidated Members management and Type Pills
  editIconBtnRight: { padding: 4, justifyContent: 'center', alignItems: 'center' },
  bottomInfoRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border + '30',
  },
  cardHeaderWrapped: { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
  nameRowWrapped: { flexWrap: 'wrap' },
  rightInfoRowWrapped: { alignSelf: 'flex-end', marginTop: 2 },
  rightInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  infoValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  editIconBtn: { marginRight: 4, justifyContent: 'center', alignItems: 'center' },
  typePill: { height: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 4, paddingHorizontal: 8, borderWidth: 1 },
  typePillText: { fontSize: 10, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: Colors.bg },
  modalBody: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 60 },
  modalClose: { fontSize: 18, color: Colors.textSecondary },
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: Spacing.md, color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.border },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typeBtn: { flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  typeBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  sliderContainer: { marginTop: Spacing.sm, marginBottom: Spacing.md },
  trackWrapper: { height: 40, justifyContent: 'center', position: 'relative' },
  trackBg: { height: 6, backgroundColor: Colors.bgInput, borderRadius: 3, width: '100%' },
  trackFill: { height: 6, borderRadius: 3, position: 'absolute', left: 0 },
  thumbContainer: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', width: 24, marginLeft: -12 },
  sliderThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', borderWidth: 4, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.sm, padding: Spacing.md, alignItems: 'center', marginTop: 16 },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  removeBtn: { backgroundColor: Colors.accent + '10', borderRadius: Radius.sm, padding: Spacing.md, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: Colors.accent + '20' },
  removeBtnText: { color: Colors.accent, fontWeight: '600', fontSize: 14 },
});
