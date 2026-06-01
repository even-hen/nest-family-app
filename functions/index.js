const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// ─── Helper: get Monday of a given date in a UTC-safe way ──────────────────────
function getMondayISO(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0];
}

function getTodayISO() {
  return new Date().toISOString().split('T')[0];
}


// ─── CRON 2: Run every hour — auto-distribute tasks based on group timezone ─
exports.weeklyDistribution = onSchedule('0 * * * *', async () => {
  const groupsSnap = await db.collection('groups').where('autoDistribution', '==', true).get();

  const getDateForWeekday = (weekStartStr, dayIndex) => {
    const d = new Date(`${weekStartStr}T00:00:00.000Z`);
    const offset = dayIndex === 0 ? 6 : dayIndex - 1;
    d.setUTCDate(d.getUTCDate() + offset);
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
    let groupLocalDateStr;
    try {
      const timeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false });
      let formattedHour = timeFormatter.format(new Date());
      if (formattedHour === '24') formattedHour = '00';
      groupLocalHour = formattedHour + ':00';

      const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
      groupLocalDay = weekdayFormatter.format(new Date());

      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const year = parts.find((p) => p.type === 'year').value;
      const month = parts.find((p) => p.type === 'month').value;
      const day = parts.find((p) => p.type === 'day').value;
      groupLocalDateStr = `${year}-${month}-${day}`;
    } catch (e) {
      groupLocalHour = new Date().getUTCHours().toString().padStart(2, '0') + ':00';
      groupLocalDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date());
      groupLocalDateStr = new Date().toISOString().split('T')[0];
    }

    // Run distribution at 01:00 local time on Monday
    if (groupLocalDay !== 'Mon' || groupLocalHour !== '01:00') continue;

    // Resolve current local weekStart specifically for this group
    const groupLocalDate = new Date(`${groupLocalDateStr}T00:00:00.000Z`);
    const weekStart = getMondayISO(groupLocalDate);

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



    console.log(`Group ${groupId}: ${assignments.length} assigned, ${unassigned.length} unassigned`);
  }
});