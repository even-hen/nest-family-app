import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../lib/firebase';
import { User, UserType } from '../types';
import { syncLocalNotifications } from '../lib/notifications';
import { getMondayISO } from '../utils/date';

interface AuthContextType {
  user: User | null;
  firebaseUid: string | null;
  loading: boolean;
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    name: string,
    type: UserType,
    resource: number
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const checkUnreadNotifications = async (uid: string, groupId: string | null, userType: UserType) => {
    if (!groupId) return;
    try {
      const todayISO = new Date().toISOString().split('T')[0];
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayISO = yesterday.toISOString().split('T')[0];
      
      const lastWeekStart = getMondayISO(new Date(Date.now() - 7 * 86400000));

      const [assignmentsSnap, dbNotifsSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'assignments'),
            where('assignedTo', '==', uid),
            where('status', '==', 'pending')
          )
        ),
        getDocs(
          query(
            collection(db, 'notifications'),
            where('userId', '==', uid)
          )
        ),
      ]);

      const storedRead = await AsyncStorage.getItem(`read_notifs_${uid}`);
      const readIds = storedRead ? JSON.parse(storedRead) : [];

      let unread = 0;

      // 1. Missed Yesterday
      const yesterdayMissed = assignmentsSnap.docs.filter((d) => d.data().date === yesterdayISO);
      if (yesterdayMissed.length > 0 && !readIds.includes(`missed_yesterday_${yesterdayISO}`)) {
        unread++;
      }

      // 2. Daily Summary
      const todayPending = assignmentsSnap.docs.filter((d) => d.data().date === todayISO);
      if (todayPending.length > 0 && !readIds.includes(`daily_summary_${todayISO}`)) {
        unread++;
      }

      // 3. Weekly Missed Tasks Report (Adults only)
      if (userType === 'Adult') {
        const skippedSnap = await getDocs(
          query(
            collection(db, 'assignments'),
            where('groupId', '==', groupId),
            where('weekStart', '==', lastWeekStart),
            where('status', '==', 'skipped')
          )
        );
        if (!skippedSnap.empty && !readIds.includes(`weekly_report_${lastWeekStart}`)) {
          unread++;
        }
      }

      // 4. DB Notifications
      dbNotifsSnap.docs.forEach((doc) => {
        if (!readIds.includes(doc.id) && !doc.data().isRead) {
          unread++;
        }
      });

      setUnreadCount(unread);
    } catch (e) {
      console.error('Error checking unread notifications:', e);
    }
  };

  const fetchUser = async (uid: string) => {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data();
      const timezone = data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const notificationTime = data.notificationTime ?? '09:00';
      const type = data.type as UserType;
      const groupId = data.groupId ?? null;

      setUser({
        id: uid,
        email: data.email,
        name: data.name,
        type,
        resource: data.resource,
        groupId,
        timezone,
        notificationTime,
        language: data.language ?? 'en',
        theme: data.theme ?? 'light',
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
      });

      // Synchronize local notifications on the device
      syncLocalNotifications(uid, groupId, type, notificationTime);

      // Fetch unread count on app start
      checkUnreadNotifications(uid, groupId, type);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUid(fbUser.uid);
        await fetchUser(fbUser.uid);
      } else {
        setFirebaseUid(null);
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    setFirebaseUid(cred.user.uid);
    await fetchUser(cred.user.uid);
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    type: UserType,
    resource: number
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    await setDoc(doc(db, 'users', uid), {
      email,
      name,
      type,
      resource,
      groupId: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      notificationTime: '09:00',
      language: 'en',
      createdAt: serverTimestamp(),
    });
    await fetchUser(uid);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setFirebaseUid(null);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const refreshUser = async () => {
    if (firebaseUid) {
      await fetchUser(firebaseUid);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUid,
        loading,
        unreadCount,
        setUnreadCount,
        signIn,
        signUp,
        signOut,
        refreshUser,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
