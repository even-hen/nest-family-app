import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import {
  collection, query, where, getDocs, doc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, Radius } from '../../constants/colors';
import { Notification } from '../../types';

const TYPE_ICONS: Record<string, string> = {
  daily_summary: '📋',
  missed_task: '⚠️',
  unassigned_tasks: '📌',
  weekly_report: '📊',
};

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    const snap = await getDocs(
      query(collection(db, 'notifications'), where('userId', '==', user.id))
    );
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
    } as Notification));
    // Sort newest first, cap at 50
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    setNotifications(list.slice(0, 50));
  }, [user?.id]);

  useEffect(() => { loadNotifications().finally(() => setLoading(false)); }, [loadNotifications]);
  const onRefresh = async () => { setRefreshing(true); await loadNotifications(); setRefreshing(false); };

  const markRead = async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { isRead: true });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { isRead: true }));
    await batch.commit();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

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
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={styles.emptyTitle}>All quiet</Text>
            <Text style={styles.emptyDesc}>No notifications yet</Text>
          </View>
        )}

        {notifications.map((n) => (
          <TouchableOpacity
            key={n.id}
            style={[styles.card, !n.isRead && styles.cardUnread]}
            onPress={() => !n.isRead && markRead(n.id)}
            activeOpacity={0.8}
          >
            <View style={styles.cardIcon}>
              <Text style={styles.cardIconEmoji}>{TYPE_ICONS[n.type] ?? '🔔'}</Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{n.title}</Text>
                {!n.isRead && <View style={styles.unreadDot} />}
              </View>
              <Text style={styles.cardText}>{n.body}</Text>
              <Text style={styles.cardTime}>{formatRelativeTime(n.createdAt)}</Text>
            </View>
          </TouchableOpacity>
        ))}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
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
