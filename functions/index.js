const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// ─── Helper: get Monday of a given date ────────────────────────────────────
function getMondayISO(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function getTodayISO() {
  return new Date().toISOString().split('T')[0];
}


// ─── CRON 2: Run every hour — auto-distribute tasks based on group timezone ─
exports.weeklyDistribution = onSchedule('0 * * * *', async () => {
  const weekStart = getMondayISO(new Date());
  const groupsSnap = await db.collection('groups').where('autoDistribution', '==', true).get();

  const getDateForWeekday = (weekStartStr, dayIndex) => {
    const d = new Date(weekStartStr);
    const offset = dayIndex === 0 ? 6 : dayIndex - 1;
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  };

  const getTaskWeeklyCost = (t) => t.complexity * (t.weekDays ? t.weekDays.length : 0);

  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id;

    // Get adults to find timezone
    const adultsSnap = await db.collection('users')
      .where('groupId', '==', groupId)
      .where('type', '==', 'Adult')
      .get();
      
    let tz = 'UTC';
    if (!adultsSnap.empty) {
      tz = adultsSnap.docs[0].data().timezone || 'UTC';
    }

    let groupLocalHour;
    let groupLocalDay;
    try {
      const timeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false });
      let formattedHour = timeFormatter.format(new Date());
      if (formattedHour === '24') formattedHour = '00';
      groupLocalHour = formattedHour + ':00';

      const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
      groupLocalDay = weekdayFormatter.format(new Date());
    } catch (e) {
      groupLocalHour = new Date().getUTCHours().toString().padStart(2, '0') + ':00';
      groupLocalDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date());
    }

    // Run distribution at 01:00 local time on Monday
    if (groupLocalDay !== 'Mon' || groupLocalHour !== '01:00') continue;

    // Prevent double execution for the same weekStart
    const existingSnap = await db.collection('assignments')
      .where('groupId', '==', groupId)
      .where('weekStart', '==', weekStart)
      .limit(1)
      .get();
    
    if (!existingSnap.empty) continue;

    const [tasksSnap, usersSnap] = await Promise.all([
      db.collection('tasks').where('groupId', '==', groupId).where('isActive', '==', true).get(),
      db.collection('users').where('groupId', '==', groupId).get(),
    ]);

    const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const users = usersSnap.docs.map((d) => ({ id: d.id, type: d.data().type, resource: d.data().resource }));

    if (users.length === 0 || tasks.length === 0) continue;

    // Auto-distribute (proportional by resource)
    const totalResource = users.reduce((s, u) => s + Number(u.resource || 0), 0);
    const totalCost = tasks.reduce((s, t) => s + getTaskWeeklyCost(t), 0);
    const capacity = {};
    users.forEach((u) => { capacity[u.id] = totalResource > 0 ? (Number(u.resource || 0) / totalResource) * totalCost : 0; });

    const assignments = [];
    const unassigned = [];

    // Separate tasks: manual (auto = false) and auto (auto = true)
    const manualTasks = tasks.filter((t) => !t.auto);
    const autoTasks = tasks.filter((t) => t.auto);

    // 1. Process manual assignments first (occupy capacities)
    for (const task of manualTasks) {
      if (task.assignedTo) {
        const cost = getTaskWeeklyCost(task);
        capacity[task.assignedTo] = (capacity[task.assignedTo] ?? 0) - cost;
        assignments.push({ task, assignedTo: task.assignedTo });
      } else {
        unassigned.push(task);
      }
    }

    // 2. Sort auto tasks by cost descending (with slight random jitter to prevent static repetition)
    const sortedAutoTasks = [...autoTasks].sort((a, b) => {
      const diff = getTaskWeeklyCost(b) - getTaskWeeklyCost(a);
      return diff + (Math.random() - 0.5) * 10;
    });

    // 3. Process auto assignments
    for (const task of sortedAutoTasks) {
      const eligible = users.filter((u) =>
        task.availableFor.length === 0 || task.availableFor.includes(u.type)
      );
      if (eligible.length === 0) { unassigned.push(task); continue; }

      // Randomize array for exact capacity ties
      eligible.sort(() => Math.random() - 0.5);

      const best = eligible.reduce((p, c) => {
        const capCurr = (capacity[c.id] ?? 0) + (Math.random() - 0.5) * 5;
        const capPrev = (capacity[p.id] ?? 0) + (Math.random() - 0.5) * 5;
        return capCurr > capPrev ? c : p;
      });
      capacity[best.id] -= getTaskWeeklyCost(task);
      assignments.push({ task, assignedTo: best.id });
    }

    // Create assignment documents & update tasks
    const batch = db.batch();

    for (const { task, assignedTo } of assignments) {
      // Update task's assignedTo
      batch.update(db.collection('tasks').doc(task.id), { assignedTo });

      // Create assignments for all scheduled active days
      const activeDays = task.weekDays || [];
      for (const dayIndex of activeDays) {
        const dateISO = getDateForWeekday(weekStart, dayIndex);
        const ref = db.collection('assignments').doc();
        batch.set(ref, {
          taskId: task.id,
          groupId,
          title: task.title,
          complexity: task.complexity,
          weekDays: task.weekDays || [],
          assignedTo,
          status: 'pending',
          weekStart,
          date: dateISO,
          doneAt: null,
          skippedAt: null,
          createdAt: Timestamp.now(),
        });
      }
    }

    await batch.commit();

    // Notify adults about unassigned tasks
    if (unassigned.length > 0) {
      const notifBatch = db.batch();
      adultsSnap.docs.forEach((u) => {
        const ref = db.collection('notifications').doc();
        notifBatch.set(ref, {
          userId: u.id, groupId, isRead: false,
          type: 'unassigned_tasks',
          title: '⚠️ Unassigned Tasks',
          body: `${unassigned.length} task(s) could not be automatically assigned this week: ${unassigned.map((t) => t.title).join(', ')}. Please assign them manually.`,
          createdAt: Timestamp.now(),
        });
      });
      await notifBatch.commit();
    }

    console.log(`Group ${groupId}: ${assignments.length} assigned, ${unassigned.length} unassigned`);
  }
});

// ─── CRON 3: Daily personal summary notifications ──────────────────────────
// Runs every hour, checks which users have notificationTime matching their local current hour
exports.dailySummaryNotifications = onSchedule('0 * * * *', async () => {
  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) return;

  const batch = db.batch();

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const userId = userDoc.id;
    const groupId = data.groupId;
    if (!groupId) continue;

    const tz = data.timezone || 'UTC';
    const notifTime = data.notificationTime || '09:00';

    let userLocalHour;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false });
      let formattedHour = formatter.format(new Date());
      if (formattedHour === '24') formattedHour = '00';
      userLocalHour = formattedHour + ':00';
    } catch (e) {
      userLocalHour = new Date().getUTCHours().toString().padStart(2, '0') + ':00';
    }

    if (userLocalHour !== notifTime) continue;

    let userTodayISO;
    let userYesterdayISO;
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const d = parts.find(p => p.type === 'day').value;
      userTodayISO = `${y}-${m}-${d}`;

      const partsY = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() - 86400000));
      const yY = partsY.find(p => p.type === 'year').value;
      const mY = partsY.find(p => p.type === 'month').value;
      const dY = partsY.find(p => p.type === 'day').value;
      userYesterdayISO = `${yY}-${mY}-${dY}`;
    } catch(e) {
      userTodayISO = getTodayISO();
      userYesterdayISO = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    }

    const assignmentsTodaySnap = await db.collection('assignments')
      .where('assignedTo', '==', userId)
      .where('date', '==', userTodayISO)
      .where('status', '==', 'pending')
      .get();

    if (!assignmentsTodaySnap.empty) {
      const titles = assignmentsTodaySnap.docs.map((d) => d.data().title).slice(0, 5).join(', ');
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        userId, groupId, isRead: false,
        type: 'daily_summary',
        title: '📋 Today\'s Tasks',
        body: `You have ${assignmentsTodaySnap.size} task(s) pending: ${titles}${assignmentsTodaySnap.size > 5 ? '…' : '.'}`,
        createdAt: Timestamp.now(),
      });
    }

    const assignmentsYesterdaySnap = await db.collection('assignments')
      .where('assignedTo', '==', userId)
      .where('date', '==', userYesterdayISO)
      .get();

    const missedYesterday = assignmentsYesterdaySnap.docs
      .map(doc => doc.data())
      .filter(a => a.status !== 'done');

    if (missedYesterday.length > 0) {
      const titles = missedYesterday.map(a => a.title).slice(0, 3).join(', ');
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        userId, groupId, isRead: false,
        type: 'missed_task',
        title: '🕰️ Yesterday\'s Missed Tasks',
        body: `You didn't complete ${missedYesterday.length} task(s) yesterday (${titles}${missedYesterday.length > 3 ? '…' : ''}). Please remember that consistency helps the whole family! Try to catch up today if you can.`,
        createdAt: Timestamp.now(),
      });
    }
  }

  await batch.commit();
});

// ─── CRON 4: Weekly report — missed tasks ─────────────────────────────────
exports.weeklyMissedReport = onSchedule('0 * * * *', async () => {
  const usersSnap = await db.collection('users').where('type', '==', 'Adult').get();
  if (usersSnap.empty) return;

  const batch = db.batch();
  const groupReportsCache = {};
  const lastWeekStart = getMondayISO(new Date(Date.now() - 7 * 86400000));

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const userId = userDoc.id;
    const groupId = data.groupId;
    if (!groupId) continue;

    const tz = data.timezone || 'UTC';
    const notifTime = data.notificationTime || '09:00';

    let userLocalHour;
    let userLocalDay;
    try {
      const timeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false });
      let formattedHour = timeFormatter.format(new Date());
      if (formattedHour === '24') formattedHour = '00';
      userLocalHour = formattedHour + ':00';

      const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
      userLocalDay = weekdayFormatter.format(new Date()); // 'Mon', 'Tue', etc.
    } catch (e) {
      userLocalHour = new Date().getUTCHours().toString().padStart(2, '0') + ':00';
      userLocalDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date());
    }

    if (userLocalDay !== 'Mon' || userLocalHour !== notifTime) continue;

    if (groupReportsCache[groupId] === undefined) {
      const skippedSnap = await db.collection('assignments')
        .where('groupId', '==', groupId)
        .where('weekStart', '==', lastWeekStart)
        .where('status', '==', 'skipped')
        .get();

      if (skippedSnap.empty) {
        groupReportsCache[groupId] = null;
      } else {
        const skippedByUser = {};
        skippedSnap.docs.forEach((d) => {
          const uid = d.data().assignedTo;
          if (!skippedByUser[uid]) skippedByUser[uid] = [];
          skippedByUser[uid].push(d.data().title);
        });

        if (Object.keys(skippedByUser).length === 0) {
          groupReportsCache[groupId] = null;
        } else {
          const groupUsersSnap = await db.collection('users').where('groupId', '==', groupId).get();
          const userNames = {};
          groupUsersSnap.docs.forEach((d) => { userNames[d.id] = d.data().name; });

          const reportLines = Object.entries(skippedByUser).map(
            ([uid, titles]) => `${userNames[uid] ?? uid}: ${titles.join(', ')}`
          );

          groupReportsCache[groupId] = `Last week some tasks were skipped:\n${reportLines.join('\n')}\n\nTip: Consider reducing task complexity or adjusting capacity for members who frequently skip.`;
        }
      }
    }

    const body = groupReportsCache[groupId];
    if (body) {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        userId, groupId, isRead: false,
        type: 'weekly_report',
        title: '📊 Weekly Missed Tasks Report',
        body,
        createdAt: Timestamp.now(),
      });
    }
  }

  await batch.commit();
});
