const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs } = require('firebase/firestore');
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

async function run() {
  console.log("Config project ID:", firebaseConfig.projectId);
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  // 1. Get user zaidenberg@mail.ru
  console.log("\n--- Querying User ---");
  const usersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', 'zaidenberg@mail.ru')));
  if (usersSnap.empty) {
    console.log("User not found!");
    return;
  }
  const userDoc = usersSnap.docs[0];
  const userData = userDoc.data();
  const userId = userDoc.id;
  console.log(`User found: ID=${userId}, Name=${userData.name}, GroupID=${userData.groupId}, Type=${userData.type}`);

  if (!userData.groupId) {
    console.log("User has no GroupID!");
    return;
  }

  // 2. Query Group Members
  console.log("\n--- Group Members ---");
  const membersSnap = await getDocs(query(collection(db, 'users'), where('groupId', '==', userData.groupId)));
  membersSnap.forEach(d => {
    console.log(`- Member: ID=${d.id}, Name=${d.data().name}, Email=${d.data().email}, Type=${d.data().type}, Resource=${d.data().resource}`);
  });

  // 3. Query Active Tasks in Group
  console.log("\n--- Tasks in Group ---");
  const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('groupId', '==', userData.groupId)));
  tasksSnap.forEach(d => {
    console.log(`- Task: ID=${d.id}, Title=${d.data().title}, Complexity=${d.data().complexity}, Type=${d.data().type}, Active=${d.data().isActive}, AssignedTo=${d.data().assignedTo}`);
  });

  // 4. Query Assignments for today
  const today = new Date().toISOString().split('T')[0];
  console.log(`\n--- Assignments in Group for Today (${today}) ---`);
  const assignmentsSnap = await getDocs(query(collection(db, 'assignments'), where('groupId', '==', userData.groupId), where('date', '==', today)));
  if (assignmentsSnap.empty) {
    console.log("No assignments found for today!");
  } else {
    assignmentsSnap.forEach(d => {
      console.log(`- Assignment: ID=${d.id}, Title=${d.data().title}, AssignedTo=${d.data().assignedTo}, Status=${d.data().status}, Type=${d.data().type}, Date=${d.data().date}`);
    });
  }

  // 5. Query All Assignments in Group (to see if they exist for other days/weeks)
  console.log(`\n--- All Assignments in Group ---`);
  const allAssignmentsSnap = await getDocs(query(collection(db, 'assignments'), where('groupId', '==', userData.groupId)));
  if (allAssignmentsSnap.empty) {
    console.log("No assignments exist at all for this group!");
  } else {
    allAssignmentsSnap.forEach(d => {
      const data = d.data();
      console.log(`- Assignment: ID=${d.id}, Title=${data.title}, AssignedTo=${data.assignedTo}, Status=${data.status}, Type=${data.type}, Date=${data.date}, weekDays=${JSON.stringify(data.weekDays)}`);
    });
  }
}

run().catch(console.error);
