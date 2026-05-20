import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Switch, ActivityIndicator,
} from 'react-native';
import {
  collection, doc, updateDoc, addDoc, getDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import * as Clipboard from 'expo-clipboard';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, Radius } from '../../constants/colors';

const NOTIFICATION_TIMES = ['07:00', '08:00', '09:00', '10:00', '12:00', '18:00', '20:00'];
const LANGUAGES = [
  { code: 'en', label: '🇺🇸 English' },
  { code: 'ru', label: '🇷🇺 Русский' },
];

export default function SettingsScreen() {
  const { user, refreshUser, signOut } = useAuth();
  const [generatingLink, setGeneratingLink] = useState(false);
  const [savingTime, setSavingTime] = useState(false);
  const [savingLang, setSavingLang] = useState(false);
  const [autoDistrib, setAutoDistrib] = useState(true);
  const [loadingAutoDistrib, setLoadingAutoDistrib] = useState(false);

  const isAdult = user?.type === 'Adult';

  const generateInviteLink = async () => {
    if (!user?.groupId) return;
    setGeneratingLink(true);
    try {
      const token = Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const groupRef = doc(db, 'groups', user.groupId);
      const groupSnap = await getDoc(groupRef);
      const existing = groupSnap.data()?.inviteLinks ?? [];

      await updateDoc(groupRef, {
        inviteLinks: [
          ...existing,
          { token, createdAt: Timestamp.now(), expiresAt: Timestamp.fromDate(expiresAt), usedBy: [] },
        ],
      });

      await Clipboard.setStringAsync(token);
      Alert.alert(
        'Invite Link Generated! 🎉',
        `Code: ${token}\n\nCopied to clipboard. Valid for 24 hours.`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not generate link');
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleNotifTime = async (time: string) => {
    if (!user) return;
    setSavingTime(true);
    try {
      await updateDoc(doc(db, 'users', user.id), { notificationTime: time });
      await refreshUser();
    } catch (e) {
      Alert.alert('Error', 'Could not update notification time');
    } finally {
      setSavingTime(false);
    }
  };

  const handleLanguage = async (lang: string) => {
    if (!user) return;
    setSavingLang(true);
    try {
      await updateDoc(doc(db, 'users', user.id), { language: lang });
      await refreshUser();
    } catch (e) {
      Alert.alert('Error', 'Could not update language');
    } finally {
      setSavingLang(false);
    }
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this family group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave', style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await updateDoc(doc(db, 'users', user.id), { groupId: null });
            await refreshUser();
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your preferences</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitial}>{user?.name?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <View>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={[styles.roleBadge, { backgroundColor: getRoleColor(user?.type) + '20' }]}>
              <Text style={[styles.roleText, { color: getRoleColor(user?.type) }]}>
                {user?.type} · {user?.resource}% capacity
              </Text>
            </View>
          </View>
        </View>

        {/* Notification Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔔 Notification Time</Text>
          <Text style={styles.sectionDesc}>When to receive your daily reminders</Text>
          <View style={styles.timeGrid}>
            {NOTIFICATION_TIMES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.timeBtn, user?.notificationTime === t && styles.timeBtnActive]}
                onPress={() => handleNotifTime(t)}
                disabled={savingTime}
              >
                <Text style={[styles.timeBtnText, user?.notificationTime === t && styles.timeBtnTextActive]}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Language */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌐 Language</Text>
          <View style={styles.langRow}>
            {LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l.code}
                style={[styles.langBtn, user?.language === l.code && styles.langBtnActive]}
                onPress={() => handleLanguage(l.code)}
                disabled={savingLang}
              >
                <Text style={[styles.langBtnText, user?.language === l.code && styles.langBtnTextActive]}>
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Adult-only: Invite & Auto-distribution */}
        {isAdult && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🔗 Invite Members</Text>
              <Text style={styles.sectionDesc}>Generate a 24-hour invite code for family members</Text>
              <TouchableOpacity
                style={[styles.actionBtn, generatingLink && styles.btnDisabled]}
                onPress={generateInviteLink}
                disabled={generatingLink}
              >
                {generatingLink
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.actionBtnText}>✨ Generate Invite Code</Text>
                }
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Danger Zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={[styles.sectionTitle, { color: Colors.accent }]}>⚠️ Danger Zone</Text>

          <TouchableOpacity style={styles.dangerBtn} onPress={handleLeaveGroup}>
            <Text style={styles.dangerBtnText}>Leave Group</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.dangerBtn, { marginTop: 8 }]} onPress={handleSignOut}>
            <Text style={styles.dangerBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Nest v1.0.0 · Built with ❤️</Text>
      </ScrollView>
    </View>
  );
}

function getRoleColor(type?: string) {
  if (type === 'Adult') return Colors.adult;
  if (type === 'Teen') return Colors.teen;
  return Colors.child;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  profileAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  profileInitial: { fontSize: 22, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  profileEmail: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  roleBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  roleText: { fontSize: 11, fontWeight: '600' },
  section: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  sectionDesc: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  timeBtn: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  timeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  timeBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  timeBtnTextActive: { color: Colors.primary },
  langRow: { flexDirection: 'row', gap: Spacing.sm },
  langBtn: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  langBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  langBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  langBtnTextActive: { color: Colors.primary },
  actionBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.md,
    alignItems: 'center', shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 10, elevation: 5,
  },
  btnDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  dangerSection: { borderColor: Colors.accent + '30' },
  dangerBtn: {
    backgroundColor: Colors.accent + '15', borderRadius: Radius.md, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.accent + '30',
  },
  dangerBtnText: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
  version: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm },
});
