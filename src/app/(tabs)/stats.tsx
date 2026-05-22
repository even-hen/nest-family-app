import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Spacing, Radius, ThemeColors } from '../../constants/colors';
import { useAppTheme } from '../../contexts/ThemeContext';

interface WeekStat {
  userId: string;
  userName: string;
  done: number;
  skipped: number;
  pending: number;
  totalComplexityDone: number;
  resource: number;
}

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
  const styles = getStyles(Colors);
  const { user } = useAuth();
  const [stats, setStats] = useState<WeekStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  // Detail Modal States
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailUser, setDetailUser] = useState<{ id: string; name: string } | null>(null);
  const [detailStatus, setDetailStatus] = useState<'done' | 'skipped' | 'pending' | null>(null);

  const loadStats = useCallback(async () => {
    if (!user?.groupId) return;
    const weekStart = getWeekStart(weekOffset);

    const [usersSnap, assignmentsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('groupId', '==', user.groupId))),
      getDocs(query(
        collection(db, 'assignments'),
        where('groupId', '==', user.groupId),
        where('weekStart', '==', weekStart),
      )),
    ]);

    const userMap: Record<string, { name: string; resource: number }> = {};
    usersSnap.docs.forEach((d) => {
      userMap[d.id] = { name: d.data().name, resource: d.data().resource };
    });

    const statsMap: Record<string, WeekStat> = {};
    for (const uid of Object.keys(userMap)) {
      statsMap[uid] = {
        userId: uid,
        userName: userMap[uid].name,
        done: 0, skipped: 0, pending: 0,
        totalComplexityDone: 0,
        resource: userMap[uid].resource,
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
    setStats(Object.values(statsMap).sort((a, b) => b.done - a.done));
  }, [user?.groupId, weekOffset]);

  useEffect(() => { loadStats().finally(() => setLoading(false)); }, [loadStats]);
  const onRefresh = async () => { setRefreshing(true); await loadStats(); setRefreshing(false); };

  const formatAssignmentDate = useCallback((dateStr: string): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, []);

  const filteredAssignments = useMemo(() => {
    if (!detailUser || !detailStatus) return [];
    return allAssignments
      .filter((a) => a.assignedTo === detailUser.id && a.status === detailStatus)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allAssignments, detailUser, detailStatus]);

  const weekLabel = weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Last Week' : `${weekOffset} Weeks Ago`;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Stats</Text>
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
        {stats.map((s, idx) => {
          const total = s.done + s.skipped + s.pending;
          const completionPct = total > 0 ? Math.round((s.done / total) * 100) : 0;
          const isMe = s.userId === user?.id;

          return (
            <View key={s.userId} style={[styles.card, isMe && styles.cardMe]}>
              <View style={styles.cardHeader}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{idx + 1}</Text>
                </View>
                <View style={styles.nameRow}>
                  <Text style={styles.memberName}>{toTitleCase(s.userName)}</Text>
                  {isMe && (
                    <View style={styles.youBadge}>
                      <Text style={styles.youText}>You</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.completion}>{completionPct}%</Text>
              </View>

              {/* Completion bar */}
              <View style={styles.barRow}>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${completionPct}%` as any }]} />
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
            {filteredAssignments.length === 0 ? (
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
              filteredAssignments.map((a) => (
                <View key={a.id} style={styles.modalCard}>
                  <View style={styles.modalCardHeader}>
                    <Text style={styles.modalCardTitle}>{a.title}</Text>
                    <Text style={styles.modalCardPoints}>{a.complexity} pts</Text>
                  </View>
                  <View style={styles.modalCardFooter}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.modalCardDate}>{formatAssignmentDate(a.date)}</Text>
                  </View>
                </View>
              ))
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
  modalList: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 60 },
  modalCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalCardTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, flex: 1, marginRight: Spacing.sm },
  modalCardPoints: { fontSize: 13, fontWeight: '600', color: 'rgb(255, 179, 71)' },
  modalCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalCardDate: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  modalEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  modalEmptyText: { fontSize: 15, color: Colors.textMuted, fontWeight: '500' },
});
