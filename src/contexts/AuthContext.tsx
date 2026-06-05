import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { syncLocalNotifications } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { User, UserType } from '../types';
import { mapUser } from '../utils/supabaseMappers';

interface AuthContextType {
  user: User | null;
  authUid: string | null;
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
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const checkUnreadNotifications = useCallback(async (uid: string, groupId: string | null) => {
    if (!groupId) return;
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('is_read', false);

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (e) {
      console.error('Error checking unread notifications:', e);
    }
  }, []);

  const fetchUser = useCallback(async (uid: string) => {
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', uid)
        .single();

      if (userError) {
        if (userError.code === 'PGRST116') {
          // Gracefully return if the public.users profile row has not been inserted yet
          // (occurs during the signup process before insert completes)
          return;
        }
        throw userError;
      }

      if (userData) {
        const mappedUser = mapUser(userData);
        setUser(mappedUser);

        // Synchronize local notifications on the device
        syncLocalNotifications(mappedUser.id, mappedUser.groupId, mappedUser.type, mappedUser.notificationTime);

        // Fetch unread count on app start
        checkUnreadNotifications(mappedUser.id, mappedUser.groupId);
      }
    } catch (e) {
      console.error('Error fetching user metadata:', e);
    }
  }, [checkUnreadNotifications]);

  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // 1. Check initial active session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        if (session?.user) {
          setAuthUid(session.user.id);
        } else {
          setAuthUid(null);
          setUser(null);
        }
        setIsAuthChecking(false);
      })
      .catch((err) => {
        console.error('[AuthContext] Error getting initial session:', err);
        if (isMounted) {
          setAuthUid(null);
          setUser(null);
          setIsAuthChecking(false);
        }
      });

    // 2. Subscribe to auth state updates
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        setAuthUid(session.user.id);
      } else {
        setAuthUid(null);
        setUser(null);
      }
      setIsAuthChecking(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 3. Fetch user profile when authUid changes, decoupled from the auth callbacks to avoid client deadlocks
  useEffect(() => {
    if (isAuthChecking) return;

    if (!authUid) {
      setUser(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetchUser(authUid)
      .catch((err) => {
        console.error('[AuthContext] Error fetching user profile:', err);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authUid, isAuthChecking, fetchUser]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (!data.user) throw new Error('Sign in failed: No user returned');
    setAuthUid(data.user.id);
    await fetchUser(data.user.id);
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    type: UserType,
    resource: number
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    if (!data.user) throw new Error('Sign up failed: No user created');

    const uid = data.user.id;

    // Create user profile document in public.users table
    const { error: dbError } = await supabase.from('users').insert({
      id: uid,
      email,
      name,
      type,
      resource,
      group_id: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      notification_time: '09:00',
      language: 'en',
    });

    if (dbError) throw dbError;

    setAuthUid(uid);
    await fetchUser(uid);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setAuthUid(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  };

  const refreshUser = async () => {
    if (authUid) {
      await fetchUser(authUid);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authUid,
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
