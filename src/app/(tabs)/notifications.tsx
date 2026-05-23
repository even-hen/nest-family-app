import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Spacing, Radius, ThemeColors } from '../../constants/colors';
import { Notification, Assignment } from '../../types';
import { useAppTheme } from '../../contexts/ThemeContext';
import { getTodayISO, getYesterdayISO, getMondayISO } from '../../utils/date';

const TYPE_ICONS: Record<string, string> = {
  daily_summary: 'clipboard-outline',
  missed_task: 'alert-circle-outline',
  unassigned_tasks: 'help-circle-outline',
  weekly_report: 'bar-chart-outline',
};

export default function NotificationsScreen() {
  const { Colors } = useAppTheme();
  const styles = getStyles(Colors);
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load local read IDs from AsyncStorage
  const loadReadStates = useCallback(async () => {
    if (!user?.id) return;
    try {
      const stored = await AsyncStorage.getItem(`read_notifs_${user.id}`);
      if (stored) {
        setReadIds(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Error loading read states:', e);
    }
  }, [user?.id]);

  const loadNotifications = useCallback(async () => {
    if (!user?.id || !user.groupId) return;
    
    try {
      const todayISO = getTodayISO();
      const yesterdayISO = getYesterdayISO();
      const lastWeekStart = getMondayISO(new Date(Date.now() - 7 * 86400000));

      // Fetch user assignments and group users
      const [assignmentsSnap, groupUsersSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'assignments'),
            where('assignedTo', '==', user.id)
          )
        ),
        getDocs(
          query(
            collection(db, 'users'),
            where('groupId', '==', user.groupId)
          )
        ),
      ]);

      const userAssignments = assignmentsSnap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Assignment)
      );

      const userNames: Record<string, string> = {};
      groupUsersSnap.docs.forEach((doc) => {
        userNames[doc.id] = doc.data().name;
      });

      const generatedNotifs: Notification[] = [];

      // 1. Missed Yesterday
      const yesterdayMissed = userAssignments.filter(
        (a) => a.date === yesterdayISO && a.status === 'pending'
      );
      if (yesterdayMissed.length > 0) {
        const taskBullets = yesterdayMissed
          .slice(0, 3)
          .map((a) => `• ${a.title}`)
          .join('\n');
        const truncationSuffix = yesterdayMissed.length > 3 ? `\n• and ${yesterdayMissed.length - 3} more…` : '';

        generatedNotifs.push({
          id: `missed_yesterday_${yesterdayISO}`,
          userId: user.id,
          groupId: user.groupId,
          isRead: false,
          type: 'missed_task',
          title: `🕰️ Yesterday's Missed Tasks (${yesterdayMissed.length})`,
          body: `You didn't complete your tasks yesterday:\n${taskBullets}${truncationSuffix}\n\nPlease remember that consistency helps the whole family! Try to catch up today if you can.`,
          createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        });
      }

      // 2. Daily Summary
      const todayPending = userAssignments.filter(
        (a) => a.date === todayISO && a.status === 'pending'
      );
      if (todayPending.length > 0) {
        const taskBullets = todayPending
          .slice(0, 5)
          .map((a) => `• ${a.title}`)
          .join('\n');
        const truncationSuffix = todayPending.length > 5 ? `\n• and ${todayPending.length - 5} more…` : '';

        generatedNotifs.push({
          id: `daily_summary_${todayISO}`,
          userId: user.id,
          groupId: user.groupId,
          isRead: false,
          type: 'daily_summary',
          title: `📋 Today's Tasks (${todayPending.length})`,
          body: `You have ${todayPending.length} task(s) pending today:\n${taskBullets}${truncationSuffix}`,
          createdAt: new Date(), // Just now
        });
      }

      // 3. Weekly Missed Tasks Report (Adults only)
      if (user.type === 'Adult') {
        const skippedSnap = await getDocs(
          query(
            collection(db, 'assignments'),
            where('groupId', '==', user.groupId),
            where('weekStart', '==', lastWeekStart),
            where('status', '==', 'skipped')
          )
        );

        const skippedTasks = skippedSnap.docs.map((doc) => doc.data() as Assignment);
        
        if (skippedTasks.length > 0) {
          const skippedByUser: Record<string, string[]> = {};
          skippedTasks.forEach((t) => {
            const uid = t.assignedTo;
            if (uid) {
              if (!skippedByUser[uid]) skippedByUser[uid] = [];
              skippedByUser[uid].push(t.title);
            }
          });

          if (Object.keys(skippedByUser).length > 0) {
            const reportLines = Object.entries(skippedByUser)
              .map(([uid, titles]) => `• ${userNames[uid] ?? uid}: ${titles.join(', ')}`)
              .join('\n');

            generatedNotifs.push({
              id: `weekly_report_${lastWeekStart}`,
              userId: user.id,
              groupId: user.groupId,
              isRead: false,
              type: 'weekly_report',
              title: '📊 Weekly Missed Tasks Report',
              body: `Last week some tasks were skipped:\n${reportLines}\n\nTip: Consider reducing task complexity or adjusting capacity for members who frequently skip.`,
              createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
            });
          }
        }
      }

      // Sort newest first
      setNotifications(generatedNotifs);
    } catch (e) {
      console.error('Error fetching/generating notifications:', e);
    }
  }, [user]);

  const initData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadReadStates(), loadNotifications()]);
    setLoading(false);
  }, [loadReadStates, loadNotifications]);

  useEffect(() => {
    initData();
  }, [initData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const markRead = async (id: string) => {
    if (!user?.id) return;
    try {
      const updated = [...readIds, id];
      setReadIds(updated);
      await AsyncStorage.setItem(`read_notifs_${user.id}`, JSON.stringify(updated));
    } catch (e) {
      console.error('Error marking as read:', e);
    }
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    try {
      const unread = notifications.filter((n) => !readIds.includes(n.id));
      if (unread.length === 0) return;
      const updated = [...readIds, ...unread.map((n) => n.id)];
      setReadIds(updated);
      await AsyncStorage.setItem(`read_notifs_${user.id}`, JSON.stringify(updated));
    } catch (e) {
      console.error('Error marking all as read:', e);
    }
  };

  const unreadCount = notifications.filter((n) => !readIds.includes(n.id)).length;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && <Text style={styles.subtitle}>{unreadCount} unread</Text>}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {notifications.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={60} color={Colors.textMuted} style={{ marginBottom: Spacing.md }} />
            <Text style={styles.emptyTitle}>All quiet</Text>
            <Text style={styles.emptyDesc}>No notifications yet</Text>
          </View>
        )}

        {notifications.map((n) => {
          const isRead = readIds.includes(n.id);
          return (
            <TouchableOpacity
              key={n.id}
              style={[styles.card, !isRead && styles.cardUnread]}
              onPress={() => !isRead && markRead(n.id)}
              activeOpacity={0.8}
            >
              <View style={styles.cardIcon}>
                <Ionicons
                  name={(TYPE_ICONS[n.type] ?? 'notifications-outline') as any}
                  size={22}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{n.title}</Text>
                  {!isRead && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.cardText}>{n.body}</Text>
                <Text style={styles.cardTime}>{formatRelativeTime(n.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

const getStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  markAllBtn: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border,
  },
  markAllText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md,
    flexDirection: 'row', gap: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  cardUnread: { borderColor: Colors.primary + '50', backgroundColor: Colors.bgCardAlt },
  cardIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bgInput,
    justifyContent: 'center', alignItems: 'center',
  },
  cardIconEmoji: { fontSize: 20 },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginLeft: 8 },
  cardText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 6 },
  cardTime: { fontSize: 11, color: Colors.textMuted },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60, marginBottom: Spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
});
