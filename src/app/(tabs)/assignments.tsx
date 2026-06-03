import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing, ThemeColors } from '../../constants/colors';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../contexts/ThemeContext';
import { syncLocalNotifications } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import { Assignment, AssignmentStatus } from '../../types';
import { AppAlert } from '../../utils/alert';
import { formatDate, getTodayISO, getYesterdayISO } from '../../utils/date';
import { mapAssignment, mapTask, mapUser } from '../../utils/supabaseMappers';

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
  emoji,
  showAssignee,
  assigneeName,
  canMarkDone,
  onMarkDone,
}: {
  assignment: Assignment;
  emoji?: string | null;
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
        <View style={styles.iconContainer}>
          {emoji ? (
            <Text style={styles.cardEmoji}>{emoji}</Text>
          ) : (
            <View style={[styles.activeIndicator, { backgroundColor: Colors.success }]} />
          )}
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, !showAssignee && { marginBottom: 0 }]}>{assignment.title}</Text>
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
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(Colors, insets), [Colors, insets]);
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [taskEmojis, setTaskEmojis] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dateLabel = useMemo(() => formatDate(new Date()), []);
  const today = useMemo(() => getTodayISO(), []);
  const yesterday = useMemo(() => getYesterdayISO(), []);

  const loadData = useCallback(async () => {
    if (!user?.groupId) return;
    try {
      const todayISO = getTodayISO();

      // Sweep: mark any past-pending assignments as skipped (client-side, timezone-aware)
      // Runs fire-and-forget so it never blocks the UI
      (async () => {
        try {
          await supabase
            .from('assignments')
            .update({ status: 'skipped', skipped_at: new Date().toISOString() })
            .eq('group_id', user.groupId)
            .eq('status', 'pending')
            .lt('date', todayISO);
        } catch (_) { /* non-critical */ }
      })();

      const [assignmentsRes, usersRes, tasksRes] = await Promise.all([
        supabase
          .from('assignments')
          .select('*')
          .eq('group_id', user.groupId)
          .in('date', [todayISO, getYesterdayISO()]),
        supabase
          .from('users')
          .select('*')
          .eq('group_id', user.groupId),
        supabase
          .from('tasks')
          .select('*')
          .eq('group_id', user.groupId),
      ]);

      if (assignmentsRes.error) throw assignmentsRes.error;
      if (usersRes.error) throw usersRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const assignmentsList = (assignmentsRes.data || []).map(mapAssignment);
      setAssignments(assignmentsList);

      const nameMap: Record<string, string> = {};
      (usersRes.data || []).forEach((row) => {
        const u = mapUser(row);
        nameMap[u.id] = u.name;
      });
      setUsers(nameMap);

      const emojiMap: Record<string, string> = {};
      (tasksRes.data || []).forEach((row) => {
        const t = mapTask(row);
        if (t.emoji) {
          emojiMap[t.id] = t.emoji;
        }
      });
      setTaskEmojis(emojiMap);
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
      AppAlert.alert('Permission Denied', 'Only adults can mark other members\' tasks as completed.');
      return;
    }
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ status: 'done', done_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      setAssignments((prev) =>
        prev.map((a) => a.id === id ? { ...a, status: 'done', doneAt: new Date() } : a)
      );

      // Update scheduled local notifications on device
      if (user) {
        syncLocalNotifications(user.id, user.groupId, user.type, user.notificationTime);
      }
    } catch (e) {
      AppAlert.alert('Error', 'Could not update task');
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
          <Text style={styles.greeting}>{"Today's Assignments"}</Text>
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
                key={a.id} assignment={a}
                emoji={taskEmojis[a.taskId] || null}
                showAssignee={showAll}
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
                key={a.id} assignment={a}
                emoji={taskEmojis[a.taskId] || null}
                showAssignee={showAll}
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
                key={a.id} assignment={{ ...a, status: 'skipped' }}
                emoji={taskEmojis[a.taskId] || null}
                showAssignee={showAll}
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

const getStyles = (Colors: ThemeColors, insets?: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg, paddingTop: insets?.top > 0 ? insets.top + 16 : 24, paddingBottom: Spacing.md,
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
    paddingLeft: 10, paddingRight: Spacing.md, paddingVertical: 10, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center', borderWidth: 1,
    borderColor: Colors.border,
  },
  cardPending: { borderColor: Colors.border },
  cardLeft: { flexDirection: 'row', flex: 1, gap: Spacing.sm, alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary, marginBottom: 6 },
  cardEmoji: {
    fontSize: 22,
    alignSelf: 'center',
  },
  activeIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  iconContainer: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  typeBadge: { backgroundColor: Colors.bgInput, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  cardType: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  assigneeBadge: { backgroundColor: Colors.bgInput, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  cardAssignee: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  cardRight: { gap: 8, marginLeft: Spacing.sm, flexDirection: 'row', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  doneBtn: {
    backgroundColor: Colors.success, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  doneBtnText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
});
