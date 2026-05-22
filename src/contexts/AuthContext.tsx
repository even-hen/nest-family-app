import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { User, UserType } from '../types';

interface AuthContextType {
  user: User | null;
  firebaseUid: string | null;
  loading: boolean;
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
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async (uid: string) => {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data();
      setUser({
        id: uid,
        email: data.email,
        name: data.name,
        type: data.type,
        resource: data.resource,
        groupId: data.groupId ?? null,
        timezone: data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        notificationTime: data.notificationTime ?? '09:00',
        language: data.language ?? 'en',
        theme: data.theme ?? 'light',
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
      });
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
    await signInWithEmailAndPassword(auth, email, password);
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

  const refreshUser = async () => {
    if (firebaseUid) {
      await fetchUser(firebaseUid);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, firebaseUid, loading, signIn, signUp, signOut, refreshUser }}
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
