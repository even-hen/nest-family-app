import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, Radius } from '../../constants/colors';

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
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export default function StatsScreen() {
  const { user } = useAuth();
  const [stats, setStats] = useState<WeekStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

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

    assignmentsSnap.docs.forEach((d) => {
      const data = d.data();
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

    setStats(Object.values(statsMap).sort((a, b) => b.done - a.done));
  }, [user?.groupId, weekOffset]);

  useEffect(() => { loadStats().finally(() => setLoading(false)); }, [loadStats]);
  const onRefresh = async () => { setRefreshing(true); await loadStats(); setRefreshing(false); };

  const weekLabel = weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Last Week' : `${weekOffset} Weeks Ago`;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Stats</Text>
        <View style={styles.weekNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setWeekOffset((w) => w + 1)}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.weekLabel}>{weekLabel}</Text>
          <TouchableOpacity
            style={[styles.navBtn, weekOffset === 0 && styles.navBtnDisabled]}
            onPress={() => setWeekOffset((w) => Math.max(0, w - 1))}
            disabled={weekOffset === 0}
          >
            <Text style={[styles.navBtnText, weekOffset === 0 && styles.navBtnTextDisabled]}>›</Text>
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
                <Text style={styles.memberName}>{s.userName}</Text>
                {isMe && <View style={styles.youBadge}><Text style={styles.youText}>You</Text></View>}
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
                <View style={[styles.pill, { backgroundColor: Colors.done + '20' }]}>
                  <Text style={styles.pillNum}>{s.done}</Text>
                  <Text style={[styles.pillLabel, { color: Colors.done }]}>Done</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: Colors.skipped + '20' }]}>
                  <Text style={styles.pillNum}>{s.skipped}</Text>
                  <Text style={[styles.pillLabel, { color: Colors.skipped }]}>Skipped</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: Colors.pending + '20' }]}>
                  <Text style={styles.pillNum}>{s.pending}</Text>
                  <Text style={[styles.pillLabel, { color: Colors.pending }]}>Pending</Text>
                </View>
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
            <Text style={styles.emptyEmoji}>📊</Text>
            <Text style={styles.emptyTitle}>No data yet</Text>
            <Text style={styles.emptyDesc}>Stats will appear once tasks are assigned</Text>
          </View>
        )}
      </ScrollView>
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
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  navBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgInput,
    justifyContent: 'center', alignItems: 'center',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { fontSize: 18, color: Colors.textPrimary, fontWeight: '700' },
  navBtnTextDisabled: { color: Colors.textMuted },
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
  rankText: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  memberName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  youBadge: {
    backgroundColor: Colors.primary + '20', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  youText: { fontSize: 11, color: Colors.primary, fontWeight: '700' },
  completion: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  barRow: { marginBottom: Spacing.md },
  barBg: { height: 6, backgroundColor: Colors.bgInput, borderRadius: Radius.full, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  pillsRow: { flexDirection: 'row', gap: Spacing.sm },
  pill: { flex: 1, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center' },
  pillNum: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  pillLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60, marginBottom: Spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
});
