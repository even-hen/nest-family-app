import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDTJn1Ua9qrrzHiUVLlDoMIM2PPzACVKD8",
  authDomain: "nest-bee94.firebaseapp.com",
  projectId: "nest-bee94",
  storageBucket: "nest-bee94.firebasestorage.app",
  messagingSenderId: "362190377540",
  appId: "1:362190377540:web:d00950882d8dae77ab2211"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);

// UNCOMMENT below to connect to local Emulators for free testing (no credit card required!)
/*
if (__DEV__) {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('Connected to Firebase Local Emulators');
  } catch (e) {
    console.warn('Could not connect to Firebase Emulators:', e);
  }
}
*/

export default app;
