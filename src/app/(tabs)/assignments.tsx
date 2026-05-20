import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { collection, query, where, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, Radius } from '../../constants/colors';
import { Assignment, AssignmentStatus } from '../../types';

const STATUS_COLORS: Record<AssignmentStatus, string> = {
  pending: Colors.pending,
  done: Colors.done,
  skipped: Colors.skipped,
};

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  pending: 'Pending',
  done: 'Done ✓',
  skipped: 'Skipped',
};

function AssignmentCard({
  assignment,
  showAssignee,
  assigneeName,
  onMarkDone,
}: {
  assignment: Assignment;
  showAssignee: boolean;
  assigneeName: string;
  onMarkDone: (id: string) => void;
}) {
  const isPending = assignment.status === 'pending';
  return (
    <View style={[styles.card, isPending && styles.cardPending]}>
      <View style={styles.cardLeft}>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[assignment.status] }]} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{assignment.title}</Text>
          <View style={styles.cardMeta}>
            <View style={styles.complexityBadge}>
              <Text style={styles.complexityText}>⚡ {assignment.complexity}pts</Text>
            </View>
            <Text style={styles.cardType}>{assignment.type === 'daily' ? '📅 Daily' : '📆 Weekly'}</Text>
            {showAssignee && (
              <Text style={styles.cardAssignee}>👤 {assigneeName}</Text>
            )}
          </View>
        </View>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[assignment.status] + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[assignment.status] }]}>
            {STATUS_LABELS[assignment.status]}
          </Text>
        </View>
        {isPending && (
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => onMarkDone(assignment.id)}
            activeOpacity={0.8}
          >
            <Text style={styles.doneBtnText}>Mark Done</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function AssignmentsScreen() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    if (!user?.groupId) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'assignments'), where('groupId', '==', user.groupId), where('date', '==', today))
      );
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          doneAt: data.doneAt?.toDate?.() ?? null,
          skippedAt: data.skippedAt?.toDate?.() ?? null,
        } as Assignment;
      });
      setAssignments(list);

      // Load user names
      const usersSnap = await getDocs(query(collection(db, 'users'), where('groupId', '==', user.groupId)));
      const nameMap: Record<string, string> = {};
      usersSnap.docs.forEach((d) => { nameMap[d.id] = d.data().name; });
      setUsers(nameMap);
    } catch (e) {
      console.error(e);
    }
  }, [user?.groupId, today]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleMarkDone = async (id: string) => {
    try {
      await updateDoc(doc(db, 'assignments', id), { status: 'done', doneAt: Timestamp.now() });
      setAssignments((prev) =>
        prev.map((a) => a.id === id ? { ...a, status: 'done', doneAt: new Date() } : a)
      );
    } catch (e) {
      Alert.alert('Error', 'Could not update task');
    }
  };

  const displayed = showAll
    ? assignments
    : assignments.filter((a) => a.assignedTo === user?.id);

  const pending = displayed.filter((a) => a.status === 'pending').sort((a, b) => a.complexity - b.complexity);
  const done = displayed.filter((a) => a.status === 'done').sort((a, b) => a.complexity - b.complexity);
  const skipped = displayed.filter((a) => a.status === 'skipped').sort((a, b) => a.complexity - b.complexity);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good {getTimeOfDay()}, {user?.name?.split(' ')[0]} 👋</Text>
          <Text style={styles.date}>{formatDate(new Date())}</Text>
        </View>
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleBtn, !showAll && styles.toggleBtnActive]}
            onPress={() => setShowAll(false)}
          >
            <Text style={[styles.toggleText, !showAll && styles.toggleTextActive]}>Mine</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, showAll && styles.toggleBtnActive]}
            onPress={() => setShowAll(true)}
          >
            <Text style={[styles.toggleText, showAll && styles.toggleTextActive]}>All</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary chips */}
      <View style={styles.summaryRow}>
        <View style={[styles.chip, { backgroundColor: Colors.pending + '20' }]}>
          <Text style={[styles.chipNum, { color: Colors.pending }]}>{pending.length}</Text>
          <Text style={styles.chipLabel}>Pending</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: Colors.done + '20' }]}>
          <Text style={[styles.chipNum, { color: Colors.done }]}>{done.length}</Text>
          <Text style={styles.chipLabel}>Done</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: Colors.skipped + '20' }]}>
          <Text style={[styles.chipNum, { color: Colors.skipped }]}>{skipped.length}</Text>
          <Text style={styles.chipLabel}>Skipped</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {pending.length === 0 && done.length === 0 && skipped.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🎉</Text>
            <Text style={styles.emptyTitle}>All clear!</Text>
            <Text style={styles.emptyDesc}>No assignments for today.</Text>
          </View>
        )}

        {pending.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>⏳ Pending</Text>
            {pending.map((a) => (
              <AssignmentCard
                key={a.id} assignment={a} showAssignee={showAll}
                assigneeName={users[a.assignedTo] ?? '—'}
                onMarkDone={handleMarkDone}
              />
            ))}
          </>
        )}

        {done.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>✅ Completed</Text>
            {done.map((a) => (
              <AssignmentCard
                key={a.id} assignment={a} showAssignee={showAll}
                assigneeName={users[a.assignedTo] ?? '—'}
                onMarkDone={handleMarkDone}
              />
            ))}
          </>
        )}

        {skipped.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>⏭️ Skipped</Text>
            {skipped.map((a) => (
              <AssignmentCard
                key={a.id} assignment={a} showAssignee={showAll}
                assigneeName={users[a.assignedTo] ?? '—'}
                onMarkDone={handleMarkDone}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  greeting: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  date: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  toggleContainer: {
    flexDirection: 'row', backgroundColor: Colors.bgInput,
    borderRadius: Radius.full, padding: 3,
  },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full },
  toggleBtnActive: { backgroundColor: Colors.primary },
  toggleText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  toggleTextActive: { color: '#fff' },
  summaryRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  chip: { flex: 1, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  chipNum: { fontSize: 22, fontWeight: '800' },
  chipLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 100 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, marginTop: Spacing.md, marginBottom: 4 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    padding: Spacing.md, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', borderWidth: 1, borderColor: Colors.border,
  },
  cardPending: { borderColor: Colors.pending + '40' },
  cardLeft: { flexDirection: 'row', flex: 1, gap: Spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 6 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  complexityBadge: { backgroundColor: Colors.primary + '20', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  complexityText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  cardType: { fontSize: 11, color: Colors.textMuted },
  cardAssignee: { fontSize: 11, color: Colors.textMuted },
  cardRight: { alignItems: 'flex-end', gap: 8, marginLeft: Spacing.sm },
  statusBadge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  doneBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  doneBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60, marginBottom: Spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
});
