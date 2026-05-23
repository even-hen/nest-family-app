import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { collection, query, where, getDocs, doc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { useFocusEffect } from 'expo-router';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Spacing, Radius, ThemeColors } from '../../constants/colors';
import { Assignment, AssignmentStatus } from '../../types';
import { useAppTheme } from '../../contexts/ThemeContext';
import { formatDate, getTodayISO, getYesterdayISO } from '../../utils/date';
import { FIRESTORE_COLLECTIONS } from '../../constants/domain';
import { syncLocalNotifications } from '../../lib/notifications';

const getStatusColor = (status: AssignmentStatus, Colors: ThemeColors): string => {
  if (status === 'pending') return Colors.pending;
  if (status === 'done') return Colors.done;
  return Colors.skipped;
};

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  pending: 'Pending',
  done: 'Completed',
  skipped: 'Skipped',
};

function AssignmentCard({
  assignment,
  showAssignee,
  assigneeName,
  canMarkDone,
  onMarkDone,
}: {
  assignment: Assignment;
  showAssignee: boolean;
  assigneeName: string;
  canMarkDone: boolean;
  onMarkDone: (id: string) => void;
}) {
  const { Colors } = useAppTheme();
  const styles = useMemo(() => getStyles(Colors), [Colors]);
  const isPending = assignment.status === 'pending';
  return (
    <View style={[styles.card, isPending && styles.cardPending]}>
      <View style={styles.cardLeft}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{assignment.title}</Text>
          {showAssignee && (
            <View style={styles.cardMeta}>
              <View style={styles.assigneeBadge}>
                <Text style={styles.cardAssignee}>{assigneeName}</Text>
              </View>
            </View>
          )}
        </View>
      </View>
      <View style={styles.cardRight}>
        {(assignment.status !== 'pending' || !canMarkDone) && (
          <View style={styles.statusBadge}>
            <Text style={[styles.statusText, { color: getStatusColor(assignment.status, Colors) }]}>
              {STATUS_LABELS[assignment.status]}
            </Text>
          </View>
        )}
        {isPending && canMarkDone && (
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
  const { Colors } = useAppTheme();
  const styles = useMemo(() => getStyles(Colors), [Colors]);
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dateLabel = useMemo(() => formatDate(new Date()), []);
  const today = useMemo(() => getTodayISO(), []);
  const yesterday = useMemo(() => getYesterdayISO(), []);

  const loadData = useCallback(async () => {
    if (!user?.groupId) return;
    try {
      const today = getTodayISO();

      // Sweep: mark any past-pending assignments as skipped (client-side, timezone-aware)
      // Runs fire-and-forget so it never blocks the UI
      (async () => {
        try {
          const pastSnap = await getDocs(query(
            collection(db, FIRESTORE_COLLECTIONS.ASSIGNMENTS),
            where('groupId', '==', user.groupId),
            where('status', '==', 'pending'),
          ));
          const stale = pastSnap.docs.filter((d) => d.data().date < today);
          if (stale.length > 0) {
            const batch = writeBatch(db);
            stale.forEach((d) => batch.update(d.ref, { status: 'skipped', skippedAt: Timestamp.now() }));
            await batch.commit();
          }
        } catch (_) { /* non-critical */ }
      })();

      const [todaySnap, yesterdaySnap, usersSnap] = await Promise.all([
        getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.ASSIGNMENTS),
          where('groupId', '==', user.groupId),
          where('date', '==', today)
        )),
        getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.ASSIGNMENTS),
          where('groupId', '==', user.groupId),
          where('date', '==', yesterday)
        )),
        getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.USERS),
          where('groupId', '==', user.groupId)
        )),
      ]);

      const assignmentsList = [
        ...todaySnap.docs,
        ...yesterdaySnap.docs
      ].map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          doneAt: data.doneAt?.toDate?.() ?? null,
          skippedAt: data.skippedAt?.toDate?.() ?? null,
        } as Assignment;
      });

      setAssignments(assignmentsList);

      const nameMap: Record<string, string> = {};
      usersSnap.docs.forEach((d) => { nameMap[d.id] = d.data().name; });
      setUsers(nameMap);
    } catch (e) {
      console.error(e);
    }
  }, [user?.groupId]);

  useFocusEffect(
    useCallback(() => {
      loadData().finally(() => setLoading(false));
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleMarkDone = async (id: string) => {
    const assignment = assignments.find((a) => a.id === id);
    if (!assignment) return;
    const canMarkDone = assignment.assignedTo === user?.id || user?.type === 'Adult';
    if (!canMarkDone) {
      Alert.alert('Permission Denied', 'Only adults can mark other members\' tasks as completed.');
      return;
    }
    try {
      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.ASSIGNMENTS, id), { status: 'done', doneAt: Timestamp.now() });
      setAssignments((prev) =>
        prev.map((a) => a.id === id ? { ...a, status: 'done', doneAt: new Date() } : a)
      );
      
      // Update scheduled local notifications on device
      if (user) {
        syncLocalNotifications(user.id, user.groupId, user.type, user.notificationTime);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not update task');
    }
  };

  const displayed = showAll
    ? assignments
    : assignments.filter((a) => a.assignedTo === user?.id);

  const pending = displayed.filter((a) => a.date === today && a.status === 'pending').sort((a, b) => a.complexity - b.complexity);
  const done = displayed.filter((a) => a.date === today && a.status === 'done').sort((a, b) => a.complexity - b.complexity);
  const skipped = displayed.filter((a) => a.date === yesterday && (a.status === 'skipped' || a.status === 'pending')).sort((a, b) => a.complexity - b.complexity);

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
          <Text style={styles.greeting}>Today's Assignments</Text>
          <Text style={styles.date}>{dateLabel}</Text>
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

      {/* Summary stats */}
      <View style={styles.summaryRow}>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: Colors.pending }]}>{pending.length}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={[styles.statBox, styles.statBoxMiddle]}>
          <Text style={[styles.statNum, { color: Colors.done }]}>{done.length}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: Colors.skipped }]}>{skipped.length}</Text>
          <Text style={styles.statLabel}>Skipped</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {pending.length === 0 && done.length === 0 && skipped.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptyDesc}>No assignments for today.</Text>
          </View>
        )}

        {pending.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Pending</Text>
            {pending.map((a) => (
              <AssignmentCard
                key={a.id} assignment={a} showAssignee={showAll}
                assigneeName={users[a.assignedTo] ?? '—'}
                canMarkDone={a.assignedTo === user?.id || user?.type === 'Adult'}
                onMarkDone={handleMarkDone}
              />
            ))}
          </>
        )}

        {done.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Completed</Text>
            {done.map((a) => (
              <AssignmentCard
                key={a.id} assignment={a} showAssignee={showAll}
                assigneeName={users[a.assignedTo] ?? '—'}
                canMarkDone={a.assignedTo === user?.id || user?.type === 'Adult'}
                onMarkDone={handleMarkDone}
              />
            ))}
          </>
        )}

        {skipped.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Skipped Yesterday</Text>
            {skipped.map((a) => (
              <AssignmentCard
                key={a.id} assignment={{ ...a, status: 'skipped' }} showAssignee={showAll}
                assigneeName={users[a.assignedTo] ?? '—'}
                canMarkDone={false}
                onMarkDone={handleMarkDone}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  greeting: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  date: { fontSize: 13, color: Colors.textSecondary, marginTop: 2, fontWeight: '400' },
  toggleContainer: {
    flexDirection: 'row', backgroundColor: Colors.bgInput,
    borderRadius: Radius.md, padding: 3,
  },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.sm },
  toggleBtnActive: { backgroundColor: Colors.primary },
  toggleText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  toggleTextActive: { color: '#fff', fontWeight: '600' },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xs },
  statBoxMiddle: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border },
  statNum: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 100 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.md, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    padding: Spacing.md, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  cardPending: { borderColor: Colors.border },
  cardLeft: { flexDirection: 'row', flex: 1, gap: Spacing.sm },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 6 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  typeBadge: { backgroundColor: Colors.bgInput, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  cardType: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  assigneeBadge: { backgroundColor: Colors.bgInput, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  cardAssignee: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  cardRight: { gap: 8, marginLeft: Spacing.sm, flexDirection: 'row', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  doneBtn: {
    backgroundColor: Colors.success, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  doneBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
});
