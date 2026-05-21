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

// ─── CRON 1: Run at midnight UTC — mark overdue tasks as Skipped ────────────
exports.markSkippedTasks = onSchedule('0 0 * * *', async () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Mark all "pending" assignments from yesterday as skipped
  const pendingSnap = await db
    .collection('assignments')
    .where('status', '==', 'pending')
    .where('date', '==', yesterday)
    .get();

  const batch = db.batch();
  pendingSnap.docs.forEach((d) => {
    batch.update(d.ref, { status: 'skipped', skippedAt: Timestamp.now() });
  });

  await batch.commit();
  console.log(`Marked ${pendingSnap.size} assignments from yesterday (${yesterday}) as skipped`);
});

// ─── CRON 2: Run every Monday at 01:00 UTC — auto-distribute tasks ─────────
exports.weeklyDistribution = onSchedule('0 1 * * 1', async () => {
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
    const [tasksSnap, usersSnap] = await Promise.all([
      db.collection('tasks').where('groupId', '==', groupId).where('isActive', '==', true).get(),
      db.collection('users').where('groupId', '==', groupId).get(),
    ]);

    const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const users = usersSnap.docs.map((d) => ({ id: d.id, type: d.data().type, resource: d.data().resource }));

    if (users.length === 0 || tasks.length === 0) continue;

    // Auto-distribute (proportional by resource)
    const totalResource = users.reduce((s, u) => s + u.resource, 0);
    const totalCost = tasks.reduce((s, t) => s + getTaskWeeklyCost(t), 0);
    const capacity = {};
    users.forEach((u) => { capacity[u.id] = totalResource > 0 ? (u.resource / totalResource) * totalCost : 0; });

    const sorted = [...tasks].sort((a, b) => getTaskWeeklyCost(b) - getTaskWeeklyCost(a));

    const assignments = [];
    const unassigned = [];

    for (const task of sorted) {
      const eligible = users.filter((u) =>
        task.availableFor.length === 0 || task.availableFor.includes(u.type)
      );
      if (eligible.length === 0) { unassigned.push(task); continue; }

      const best = eligible.reduce((p, c) => (capacity[c.id] ?? 0) > (capacity[p.id] ?? 0) ? c : p);
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
      const adultsSnap = await db.collection('users')
        .where('groupId', '==', groupId)
        .where('type', '==', 'Adult')
        .get();

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
// Runs every hour, checks which users have notificationTime matching current hour
exports.dailySummaryNotifications = onSchedule('0 * * * *', async () => {
  const now = new Date();
  const hour = now.getUTCHours().toString().padStart(2, '0') + ':00';
  const today = getTodayISO();

  const usersSnap = await db.collection('users').where('notificationTime', '==', hour).get();
  if (usersSnap.empty) return;

  const batch = db.batch();

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const groupId = userDoc.data().groupId;
    if (!groupId) continue;

    const assignmentsSnap = await db.collection('assignments')
      .where('assignedTo', '==', userId)
      .where('date', '==', today)
      .where('status', '==', 'pending')
      .get();

    if (assignmentsSnap.empty) continue;

    const titles = assignmentsSnap.docs.map((d) => d.data().title).slice(0, 5).join(', ');
    const ref = db.collection('notifications').doc();
    batch.set(ref, {
      userId, groupId, isRead: false,
      type: 'daily_summary',
      title: '📋 Today\'s Tasks',
      body: `You have ${assignmentsSnap.size} task(s) pending: ${titles}${assignmentsSnap.size > 5 ? '…' : '.'}`,
      createdAt: Timestamp.now(),
    });
  }

  await batch.commit();
});

// ─── CRON 4: Weekly report — missed tasks ─────────────────────────────────
exports.weeklyMissedReport = onSchedule('0 9 * * 1', async () => {
  const lastWeekStart = getMondayISO(new Date(Date.now() - 7 * 86400000));
  const groupsSnap = await db.collection('groups').get();

  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id;

    const skippedSnap = await db.collection('assignments')
      .where('groupId', '==', groupId)
      .where('weekStart', '==', lastWeekStart)
      .where('status', '==', 'skipped')
      .get();

    if (skippedSnap.empty) continue;

    // Group skipped by user
    const skippedByUser = {};
    skippedSnap.docs.forEach((d) => {
      const uid = d.data().assignedTo;
      if (!skippedByUser[uid]) skippedByUser[uid] = [];
      skippedByUser[uid].push(d.data().title);
    });

    // Check for users who skipped 2+ daily in a row or skipped a weekly
    const adultsSnap = await db.collection('users')
      .where('groupId', '==', groupId).where('type', '==', 'Adult').get();

    if (Object.keys(skippedByUser).length === 0) continue;

    const usersSnap = await db.collection('users').where('groupId', '==', groupId).get();
    const userNames = {};
    usersSnap.docs.forEach((d) => { userNames[d.id] = d.data().name; });

    const reportLines = Object.entries(skippedByUser).map(
      ([uid, titles]) => `${userNames[uid] ?? uid}: ${titles.join(', ')}`
    );

    const body = `Last week some tasks were skipped:\n${reportLines.join('\n')}\n\nTip: Consider reducing task complexity or adjusting capacity for members who frequently skip.`;

    const batch = db.batch();
    adultsSnap.docs.forEach((u) => {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        userId: u.id, groupId, isRead: false,
        type: 'weekly_report',
        title: '📊 Weekly Missed Tasks Report',
        body,
        createdAt: Timestamp.now(),
      });
    });
    await batch.commit();
  }
});
