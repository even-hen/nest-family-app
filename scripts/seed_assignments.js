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
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0];
}

function getDateForWeekday(weekStartStr, dayIndex) {
  const d = new Date(`${weekStartStr}T00:00:00.000Z`);
  const offset = dayIndex === 0 ? 6 : dayIndex - 1;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().split('T')[0];
}

async function run() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const groupId = "td2sW05VqWYTMuhwRwBp";
  const weekStart = getMondayISO(new Date());

  console.log(`Starting task distribution for Group: ${groupId}, Week Start: ${weekStart}`);

  // 1. Fetch active tasks & users
  const [tasksSnap, usersSnap] = await Promise.all([
    getDocs(query(collection(db, 'tasks'), where('groupId', '==', groupId), where('isActive', '==', true))),
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

  console.log(`Found ${users.length} users and ${tasks.length} active tasks.`);

  // 2. Perform distribution logic
  const getTaskWeeklyCost = (t) => t.complexity * (t.weekDays ? t.weekDays.length : 0);

  const totalResource = users.reduce((s, u) => s + u.resource, 0);
  const totalCost = tasks.reduce((s, t) => s + getTaskWeeklyCost(t), 0);
  const capacity = {};
  users.forEach(u => {
    capacity[u.id] = totalResource > 0 ? (u.resource / totalResource) * totalCost : 0;
  });

  const sortedTasks = [...tasks].sort((a, b) => getTaskWeeklyCost(b) - getTaskWeeklyCost(a));

  const assignments = [];
  const unassigned = [];

  for (const task of sortedTasks) {
    const eligible = users.filter(u =>
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

  // 3. Batch write assignments to Firestore
  console.log(`Generated ${assignments.length} task assignments. Writing to Firestore...`);
  const batch = writeBatch(db);

  for (const { task, assignedTo } of assignments) {
    // Update task assignedTo
    const taskRef = doc(db, 'tasks', task.id);
    batch.update(taskRef, { assignedTo });

    // Create assignments for all scheduled active days
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

  if (unassigned.length > 0) {
    console.log(`Warning: ${unassigned.length} tasks could not be assigned.`);
  }

  await batch.commit();
  console.log("Auto-distribution completed successfully!");
}

run().catch(console.error);
