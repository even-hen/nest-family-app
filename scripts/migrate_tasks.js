const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, deleteField } = require('firebase/firestore');
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
  console.log("Initializing Firebase with project:", firebaseConfig.projectId);
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("Fetching all tasks from Firestore...");
  const tasksSnap = await getDocs(collection(db, 'tasks'));
  console.log(`Found ${tasksSnap.size} tasks. Commencing migration...`);

  let migratedCount = 0;

  for (const taskDoc of tasksSnap.docs) {
    const data = taskDoc.data();
    const taskRef = doc(db, 'tasks', taskDoc.id);

    console.log(`Processing Task: "${data.title}" (ID: ${taskDoc.id})`);

    const updates = {};

    // If task was 'daily', set weekDays to cover all 7 days
    if (data.type === 'daily') {
      updates.weekDays = [0, 1, 2, 3, 4, 5, 6];
      console.log(`  -> Converting 'daily' task to run every day [0-6].`);
    }

    // Always delete the deprecated 'type' field if it exists
    if ('type' in data) {
      updates.type = deleteField();
      console.log(`  -> Queueing deletion of deprecated 'type' field.`);
    }

    if (Object.keys(updates).length > 0) {
      await updateDoc(taskRef, updates);
      migratedCount++;
      console.log(`  -> Successfully migrated task ID: ${taskDoc.id}`);
    } else {
      console.log(`  -> Task already migrated or no updates needed.`);
    }
  }

  console.log(`\nMigration completed! Successfully updated ${migratedCount} task documents.`);
}

run().catch(console.error);
