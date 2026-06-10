import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { UserType } from '../types';
import { supabase } from './supabase';
import { getYesterdayISO, getMondayISO } from '../utils/date';

// Setup background/foreground notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Requests local notification permissions if not already granted. */
async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus === 'granted' && Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return finalStatus === 'granted';
}

/**
 * Registers the device for Expo Push Notifications, retrieves the Expo Push Token,
 * saves it to Supabase, and schedules local notifications (daily summaries, yesterday's skipped tasks,
 * and weekly adult reports) while syncing them with the Supabase notifications table.
 */
export async function syncLocalNotifications(
  userId: string,
  groupId: string | null,
  userType: UserType,
  notificationTime: string
): Promise<void> {
  // A. Only register push tokens and schedule native notifications on Mobile (iOS/Android)
  if (Platform.OS !== 'web') {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.log('[Notifications] Permission not granted for push notifications.');
    } else {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
          });
        }

        // Retrieve Expo Push Token utilizing EAS project credentials
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: '8347fdaf-2bfd-4c42-9254-23c66d804d3a',
        });

        const pushToken = tokenData.data;
        if (pushToken) {
          const { error } = await supabase
            .from('users')
            .update({ expo_push_token: pushToken })
            .eq('id', userId);

          if (error) throw error;
          console.log('[Notifications] Expo Push Token synced successfully:', pushToken);
        }
      } catch (error) {
        console.error('[Notifications] Error syncing Expo Push Token to Supabase:', error);
      }
    }
  }

  if (!groupId) return;

  try {
    // 1. Cancel all previously scheduled local notifications to start fresh (Mobile only)
    if (Platform.OS !== 'web') {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('[Notifications] Canceled all scheduled local notifications.');
    }

    // 2. Prepare date strings for query
    const yesterdayStr = getYesterdayISO();
    
    // We want today (day 0) and the next 6 days (days 1 to 6)
    const futureDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      futureDates.push(`${year}-${month}-${dayStr}`);
    }

    // Query assignments for yesterday and the next 7 days (today + next 6 days)
    const queryDates = [yesterdayStr, ...futureDates];
    const { data: assignmentsData, error: assignmentsErr } = await supabase
      .from('assignments')
      .select('*')
      .eq('assigned_to', userId)
      .in('date', queryDates);

    if (assignmentsErr) throw assignmentsErr;

    // 3. Query existing in-app database notifications created today to prevent duplicates
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const { data: existingNotifs, error: notifErr } = await supabase
      .from('notifications')
      .select('type, title')
      .eq('user_id', userId)
      .gte('created_at', startOfToday.toISOString());

    if (notifErr) throw notifErr;

    const hasDailySummaryToday = (existingNotifs || []).some(
      n => n.type === 'daily_summary' && (n.title === "📋 Today's Chores" || n.title === "📋 Daily Chores")
    );
    const hasMissedTaskToday = (existingNotifs || []).some(
      n => n.type === 'missed_task' && (n.title === "⚠️ Yesterday's Skipped Chores" || n.title === "⚠️ Missed Tasks")
    );
    const hasWeeklyReportToday = (existingNotifs || []).some(
      n => n.type === 'weekly_report' && (n.title === "📊 Weekly Missed Tasks Report" || n.title === "📊 Weekly Report")
    );

    // Parse preferred notification time
    const [timeHourStr, timeMinuteStr] = (notificationTime || '09:00').split(':');
    const notifHour = parseInt(timeHourStr, 10);
    const notifMinute = parseInt(timeMinuteStr, 10);

    // 4. Schedule Daily Reminders for the next 7 days
    for (let d = 0; d < 7; d++) {
      const dateISO = futureDates[d];
      const todaysAssignments = (assignmentsData || []).filter(a => a.date === dateISO);

      if (todaysAssignments.length > 0) {
        const triggerDate = new Date();
        triggerDate.setDate(triggerDate.getDate() + d);
        triggerDate.setHours(notifHour, notifMinute, 0, 0);

        const choreTitles = todaysAssignments.map(a => a.title).join(', ');
        const titleText = "📋 Today's Chores";
        const bodyText = `You have ${todaysAssignments.length} chore(s) today: ${choreTitles}`;

        // A. Insert in-app DB notification if it's for today (d === 0) and doesn't exist yet
        if (d === 0 && !hasDailySummaryToday) {
          await supabase
            .from('notifications')
            .insert({
              user_id: userId,
              group_id: groupId,
              title: titleText,
              body: bodyText,
              type: 'daily_summary',
              is_read: false,
            });
          console.log('[Notifications] Inserted daily summary into Supabase.');
        }

        // B. Schedule local device push notification (if trigger is in the future, not on Web, and not already delivered today)
        const isAlreadyDeliveredToday = d === 0 && hasDailySummaryToday;
        if (Platform.OS !== 'web' && triggerDate.getTime() > Date.now() && !isAlreadyDeliveredToday) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: titleText,
              body: bodyText,
              data: { type: 'daily_summary', date: dateISO },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: triggerDate,
            } as any,
          });
          console.log(`[Notifications] Scheduled daily local notification for ${dateISO} at ${notificationTime}`);
        }
      }
    }

    // 5. Schedule Yesterday's Skipped Chores Alert (Status = 'skipped')
    const yesterdayAssignments = (assignmentsData || []).filter(
      a => a.date === yesterdayStr && a.status === 'skipped'
    );

    if (yesterdayAssignments.length > 0) {
      const triggerDateToday = new Date();
      triggerDateToday.setHours(notifHour, notifMinute, 0, 0);

      const choreTitles = yesterdayAssignments.map(a => a.title).join(', ');
      const titleText = "⚠️ Yesterday's Skipped Chores";
      const bodyText = `You skipped ${yesterdayAssignments.length} chore(s) yesterday: ${choreTitles}. Don't forget to catch up!`;

      // A. Insert in-app DB notification if it doesn't exist yet today
      if (!hasMissedTaskToday) {
        await supabase
          .from('notifications')
          .insert({
            user_id: userId,
            group_id: groupId,
            title: titleText,
            body: bodyText,
            type: 'missed_task',
            is_read: false,
          });
        console.log('[Notifications] Inserted yesterday missed task alert into Supabase.');
      }

      // B. Schedule local device push notification (if trigger is in the future, not on Web, and not already delivered today)
      if (Platform.OS !== 'web' && triggerDateToday.getTime() > Date.now() && !hasMissedTaskToday) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: titleText,
            body: bodyText,
            data: { type: 'missed_task', date: yesterdayStr },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDateToday,
          } as any,
        });
        console.log('[Notifications] Scheduled yesterday skipped tasks local notification.');
      }
    }

    // 6. Schedule Weekly report on Mondays (for Adult members)
    if (userType === 'Adult') {
      const todayDate = new Date();
      const currentMondayStr = getMondayISO(todayDate);
      const currentMonday = new Date(currentMondayStr + 'T00:00:00Z');

      // Fetch the count of skipped tasks in the current week (which becomes the completed "last week" next Monday)
      const curWeekEnd = new Date(currentMonday);
      curWeekEnd.setUTCDate(curWeekEnd.getUTCDate() + 6);
      const curWeekEndStr = curWeekEnd.toISOString().split('T')[0];

      const { data: curWeekAssignments, error: curWeekErr } = await supabase
        .from('assignments')
        .select('id')
        .eq('group_id', groupId)
        .eq('status', 'skipped')
        .gte('date', currentMondayStr)
        .lte('date', curWeekEndStr);

      if (curWeekErr) throw curWeekErr;

      const skippedCount = curWeekAssignments ? curWeekAssignments.length : 0;
      if (skippedCount > 0) {
        const titleText = "📊 Weekly Missed Tasks Report";
        const bodyText = `Last week, ${skippedCount} task(s) were skipped in your group. Tap to see full stats.`;

        // A. Insert in-app DB notification if today is Monday and not already inserted today
        const isTodayMonday = todayDate.getDay() === 1;
        if (isTodayMonday && !hasWeeklyReportToday) {
          await supabase
            .from('notifications')
            .insert({
              user_id: userId,
              group_id: groupId,
              title: titleText,
              body: bodyText,
              type: 'weekly_report',
              is_read: false,
            });
          console.log('[Notifications] Inserted weekly missed tasks report into Supabase.');
        }

        // B. Schedule local device push notification for the upcoming Monday (not on Web, and not already delivered today)
        if (Platform.OS !== 'web' && !hasWeeklyReportToday) {
          const nextMondayTrigger = new Date();
          const currentDay = nextMondayTrigger.getDay();
          const daysUntilMonday = (1 - currentDay + 7) % 7;
          nextMondayTrigger.setDate(nextMondayTrigger.getDate() + daysUntilMonday);
          nextMondayTrigger.setHours(notifHour, notifMinute, 0, 0);

          if (nextMondayTrigger.getTime() <= Date.now()) {
            nextMondayTrigger.setDate(nextMondayTrigger.getDate() + 7);
          }

          await Notifications.scheduleNotificationAsync({
            content: {
              title: titleText,
              body: bodyText,
              data: { type: 'weekly_report' },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: nextMondayTrigger,
            } as any,
          });
          console.log(`[Notifications] Scheduled weekly report local notification for next Monday, ${nextMondayTrigger.toISOString().split('T')[0]}`);
        }
      }
    }
  } catch (err) {
    console.error('[Notifications] Error scheduling local notifications:', err);
  }
}
