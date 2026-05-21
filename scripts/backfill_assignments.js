const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, doc, writeBatch, Timestamp } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

// Manually parse .env file
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const processEnv = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    processEnv[match[1]] = value;
  }
});

const firebaseConfig = {
  apiKey: processEnv.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: processEnv.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: processEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: processEnv.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: processEnv.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: processEnv.EXPO_PUBLIC_FIREBASE_APP_ID,
};

function getMondayISO(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function getDateForWeekday(weekStartStr, dayIndex) {
  const d = new Date(weekStartStr);
  const offset = dayIndex === 0 ? 6 : dayIndex - 1;
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

async function run() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const groupId = "td2sW05VqWYTMuhwRwBp";
  const weekStart = getMondayISO(new Date());

  console.log(`Restoring database assignments for Group: ${groupId}, Week Start: ${weekStart}`);

  // 1. Fetch active tasks & users
  const [tasksSnap, usersSnap] = await Promise.all([
    getDocs(query(collection(db, 'tasks'), where('groupId', '==', groupId))),
    getDocs(query(collection(db, 'users'), where('groupId', '==', groupId))),
  ]);

  const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const users = usersSnap.docs.map(d => ({ id: d.id, type: d.data().type, resource: d.data().resource }));

  if (users.length === 0) {
    console.log("No users found in the group!");
    return;
  }
  if (tasks.length === 0) {
    console.log("No active tasks found in the group!");
    return;
  }

  console.log(`Found ${users.length} users and ${tasks.length} total tasks.`);

  // 2. Perform distribution logic using manual pre-occupation rules
  const getTaskWeeklyCost = (t) => t.complexity * (t.weekDays ? t.weekDays.length : 0);

  const totalResource = users.reduce((s, u) => s + u.resource, 0);
  const totalCost = tasks.reduce((s, t) => s + getTaskWeeklyCost(t), 0);
  const capacity = {};
  users.forEach(u => {
    capacity[u.id] = totalResource > 0 ? (u.resource / totalResource) * totalCost : 0;
  });

  const assignments = [];
  const unassigned = [];

  // Separate tasks: manual (auto = false) and auto (auto = true)
  const manualTasks = tasks.filter((t) => t.isActive && !t.auto);
  const autoTasks = tasks.filter((t) => t.isActive && t.auto);

  // 1) Process manual assignments first (occupy capacities)
  for (const task of manualTasks) {
    if (task.assignedTo) {
      const cost = getTaskWeeklyCost(task);
      capacity[task.assignedTo] = (capacity[task.assignedTo] ?? 0) - cost;
      assignments.push({ task, assignedTo: task.assignedTo });
    } else {
      unassigned.push(task);
    }
  }

  // 2) Sort auto tasks by cost descending
  const sortedAutoTasks = [...autoTasks].sort(
    (a, b) => getTaskWeeklyCost(b) - getTaskWeeklyCost(a)
  );

  // 3) Process auto assignments
  for (const task of sortedAutoTasks) {
    const eligible = users.filter((u) =>
      !task.availableFor || task.availableFor.length === 0 || task.availableFor.includes(u.type)
    );
    if (eligible.length === 0) {
      unassigned.push(task);
      continue;
    }

    const best = eligible.reduce((p, c) => (capacity[c.id] ?? 0) > (capacity[p.id] ?? 0) ? c : p);
    capacity[best.id] -= getTaskWeeklyCost(task);
    assignments.push({ task, assignedTo: best.id });
  }

  // 3. Write assignments and update tasks in a batch
  console.log(`Distributions resolved. Writing ${assignments.length} assignments to Firestore...`);
  const batch = writeBatch(db);

  for (const { task, assignedTo } of assignments) {
    // Update task's assignedTo in tasks collection
    batch.update(doc(db, 'tasks', task.id), { assignedTo });

    // Create daily assignments for all scheduled days
    const activeDays = task.weekDays || [];
    for (const dayIndex of activeDays) {
      const dateISO = getDateForWeekday(weekStart, dayIndex);
      const assRef = doc(collection(db, 'assignments'));
      batch.set(assRef, {
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
  console.log(`Assignments completely restored and backfilled!`);
}

run().catch(console.error);
