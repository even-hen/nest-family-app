import { initializeApp, getApps } from 'firebase/app';
// @ts-ignore - getReactNativePersistence is missing from default TS definitions but exists in the RN bundle
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Use AsyncStorage-backed persistence on native platforms so users stay logged in
// across app restarts. On web, getAuth() defaults to browserLocalPersistence.
export const auth = Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
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
