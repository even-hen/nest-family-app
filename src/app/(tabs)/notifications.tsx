import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
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
import { NotificationsScreenSkeleton } from '../../components/skeleton';
import { supabase } from '../../lib/supabase';
import { Notification } from '../../types';

const TYPE_ICONS: Record<string, string> = {
  daily_summary: 'clipboard-outline',
  missed_task: 'alert-circle-outline',
  weekly_report: 'bar-chart-outline',
};

export default function NotificationsScreen() {
  const { Colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => getStyles(Colors, insets), [Colors, insets]);
  const { user, setUnreadCount } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.id || !user.groupId) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const mappedList: Notification[] = (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        groupId: row.group_id,
        title: row.title,
        body: row.body,
        type: row.type,
        isRead: row.is_read,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      })).reverse();

      setNotifications(mappedList);
    } catch (e) {
      console.error('Error fetching notifications:', e);
    }
  }, [user]);

  // Set up real-time postgres change subscription for instant notifications
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      setHasScrolled(false);
      loadNotifications().finally(() => setLoading(false));
    }, [loadNotifications])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    setHasScrolled(false);
    await loadNotifications();
    setRefreshing(false);
  };

  const markRead = async (id: string) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (e) {
      console.error('Error marking as read:', e);
    }
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    try {
      const unread = notifications.filter((n) => !n.isRead);
      if (unread.length === 0) return;

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (!n.isRead ? { ...n, isRead: true } : n))
      );
    } catch (e) {
      console.error('Error marking all as read:', e);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    setUnreadCount(unreadCount);
  }, [unreadCount, setUnreadCount]);

  if (loading) {
    return <NotificationsScreenSkeleton />;
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
        ref={scrollViewRef}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        onContentSizeChange={() => {
          if (!hasScrolled && notifications.length > 0) {
            scrollViewRef.current?.scrollToEnd({ animated: false });
            setHasScrolled(true);
          }
        }}
      >
        {notifications.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={60} color={Colors.textMuted} style={{ marginBottom: Spacing.md }} />
            <Text style={styles.emptyTitle}>All quiet</Text>
            <Text style={styles.emptyDesc}>No notifications yet</Text>
          </View>
        )}

        {notifications.map((n) => {
          const isRead = n.isRead;
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

const getStyles = (Colors: ThemeColors, insets?: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg, paddingTop: insets?.top > 0 ? insets.top + 16 : 24, paddingBottom: Spacing.md,
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
