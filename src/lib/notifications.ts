import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { getMondayISO } from '../utils/date';
import { Assignment, User, UserType } from '../types';

// Setup background/foreground notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Requests local notification permissions if not already granted. */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  return finalStatus === 'granted';
}

/**
 * Calculates and schedules local device notifications (the next 7 days of daily summaries
 * and next Monday's weekly missed tasks report for adults).
 * Cancels previously scheduled notifications to prevent duplication.
 */
export async function syncLocalNotifications(
  userId: string,
  groupId: string | null,
  userType: UserType,
  notificationTime: string
): Promise<void> {
  if (Platform.OS === 'web' || !groupId) return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.log('[Notifications] Permission not granted for local notifications.');
    return;
  }

  try {
    // 1. Cancel all previously scheduled notifications to start fresh
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Parse user's notification time preference (e.g. "09:00")
    const [hourStr, minuteStr] = notificationTime.split(':');
    const targetHour = parseInt(hourStr, 10) || 9;
    const targetMinute = parseInt(minuteStr, 10) || 0;

    // 2. Fetch user's pending assignments for the next 7 days
    const today = new Date();
    const upcomingDatesISO: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      upcomingDatesISO.push(`${y}-${m}-${dayStr}`);
    }

    const assignmentsSnap = await getDocs(
      query(
        collection(db, 'assignments'),
        where('assignedTo', '==', userId),
        where('status', '==', 'pending')
      )
    );

    const pendingAssignments = assignmentsSnap.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Assignment)
    );

    // Schedule daily summaries for the next 7 days
    for (let i = 0; i < 7; i++) {
      const dateISO = upcomingDatesISO[i];
      const todaysTasks = pendingAssignments.filter((a) => a.date === dateISO);

      if (todaysTasks.length > 0) {
        // Construct target Date
        const triggerDate = new Date(today);
        triggerDate.setDate(today.getDate() + i);
        triggerDate.setHours(targetHour, targetMinute, 0, 0);

        // Ensure trigger date is in the future
        if (triggerDate.getTime() > Date.now()) {
          const taskTitles = todaysTasks.map((t) => t.title).slice(0, 5).join(', ');
          const truncationSuffix = todaysTasks.length > 5 ? '…' : '.';
          
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "📋 Today's Tasks",
              body: `You have ${todaysTasks.length} task(s) pending today: ${taskTitles}${truncationSuffix}`,
              data: { type: 'daily_summary' },
            },
            trigger: {
              type: SchedulableTriggerInputTypes.DATE,
              date: triggerDate,
            },
          });
        }
      }
    }

    // 3. For Adult users, schedule the Weekly Missed Tasks Report
    if (userType === 'Adult') {
      // Find previous Monday's weekStart string to fetch last week's skipped tasks
      const lastWeekStart = getMondayISO(new Date(Date.now() - 7 * 86400000));

      const [skippedSnap, groupUsersSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'assignments'),
            where('groupId', '==', groupId),
            where('weekStart', '==', lastWeekStart),
            where('status', '==', 'skipped')
          )
        ),
        getDocs(
          query(
            collection(db, 'users'),
            where('groupId', '==', groupId)
          )
        ),
      ]);

      const skippedTasks = skippedSnap.docs.map((doc) => doc.data() as Assignment);
      const userNames: Record<string, string> = {};
      groupUsersSnap.docs.forEach((doc) => {
        const u = doc.data() as User;
        userNames[doc.id] = u.name;
      });

      if (skippedTasks.length > 0) {
        const skippedByUser: Record<string, string[]> = {};
        skippedTasks.forEach((t) => {
          const uid = t.assignedTo;
          if (uid) {
            if (!skippedByUser[uid]) skippedByUser[uid] = [];
            skippedByUser[uid].push(t.title);
          }
        });

        const reportLines = Object.entries(skippedByUser)
          .map(([uid, titles]) => `${userNames[uid] ?? 'Unknown'}: ${titles.slice(0, 3).join(', ')}${titles.length > 3 ? '…' : ''}`)
          .join('\n');

        const reportBody = `Last week some tasks were skipped:\n${reportLines}\n\nTip: Consider reducing task complexity or adjusting capacity for members who frequently skip.`;

        // Calculate next Monday at notificationTime
        const nextMonday = new Date();
        const currentDay = nextMonday.getDay();
        const daysTillMonday = (8 - currentDay) % 7 || 7; // If today is Monday, next Monday is 7 days away
        nextMonday.setDate(nextMonday.getDate() + daysTillMonday);
        nextMonday.setHours(targetHour, targetMinute, 0, 0);

        if (nextMonday.getTime() > Date.now()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "📊 Weekly Missed Tasks Report",
              body: reportBody,
              data: { type: 'weekly_report' },
            },
            trigger: {
              type: SchedulableTriggerInputTypes.DATE,
              date: nextMonday,
            },
          });
        }
      }
    }
    
    console.log('[Notifications] Local notifications sync completed successfully.');
  } catch (error) {
    console.error('[Notifications] Error syncing local notifications:', error);
  }
}
