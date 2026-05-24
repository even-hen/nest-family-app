import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Switch, ActivityIndicator,
} from 'react-native';
import {
  doc, updateDoc, getDoc, Timestamp,
} from 'firebase/firestore';
import * as Clipboard from 'expo-clipboard';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Spacing, Radius, ThemeColors } from '../../constants/colors';
import { useAppTheme } from '../../contexts/ThemeContext';

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');


const TIMEZONES = [
  { iana: 'Pacific/Midway', label: 'UTC−11  Midway Island' },
  { iana: 'Pacific/Honolulu', label: 'UTC−10  Hawaii' },
  { iana: 'America/Anchorage', label: 'UTC−9   Alaska' },
  { iana: 'America/Los_Angeles', label: 'UTC−8   Pacific Time (US)' },
  { iana: 'America/Denver', label: 'UTC−7   Mountain Time (US)' },
  { iana: 'America/Chicago', label: 'UTC−6   Central Time (US)' },
  { iana: 'America/New_York', label: 'UTC−5   Eastern Time (US)' },
  { iana: 'America/Caracas', label: 'UTC−4   Caracas, La Paz' },
  { iana: 'America/Sao_Paulo', label: 'UTC−3   Brasília' },
  { iana: 'Atlantic/South_Georgia', label: 'UTC−2  South Georgia' },
  { iana: 'Atlantic/Azores', label: 'UTC−1   Azores' },
  { iana: 'Europe/London', label: 'UTC+0   London, Dublin' },
  { iana: 'Europe/Paris', label: 'UTC+1   Paris, Berlin, Rome' },
  { iana: 'Europe/Helsinki', label: 'UTC+2   Helsinki, Kyiv' },
  { iana: 'Europe/Moscow', label: 'UTC+3   Moscow, Nairobi' },
  { iana: 'Asia/Dubai', label: 'UTC+4   Dubai, Tbilisi' },
  { iana: 'Asia/Karachi', label: 'UTC+5   Karachi, Islamabad' },
  { iana: 'Asia/Kolkata', label: 'UTC+5:30 Mumbai, New Delhi' },
  { iana: 'Asia/Dhaka', label: 'UTC+6   Dhaka, Almaty' },
  { iana: 'Asia/Yangon', label: 'UTC+6:30 Yangon' },
  { iana: 'Asia/Bangkok', label: 'UTC+7   Bangkok, Jakarta' },
  { iana: 'Asia/Ho_Chi_Minh', label: 'UTC+7   Ho Chi Minh City' },
  { iana: 'Asia/Shanghai', label: 'UTC+8   Beijing, Singapore' },
  { iana: 'Asia/Tokyo', label: 'UTC+9   Tokyo, Seoul' },
  { iana: 'Australia/Adelaide', label: 'UTC+9:30 Adelaide' },
  { iana: 'Australia/Sydney', label: 'UTC+10  Sydney, Melbourne' },
  { iana: 'Pacific/Noumea', label: 'UTC+11  New Caledonia' },
  { iana: 'Pacific/Auckland', label: 'UTC+12  Auckland' },
];

export default function SettingsScreen() {
  const { theme, setTheme, Colors } = useAppTheme();
  const styles = useMemo(() => getStyles(Colors), [Colors]);
  const { user, refreshUser, signOut } = useAuth();
  const [generatingLink, setGeneratingLink] = useState(false);
  const [savingTime, setSavingTime] = useState(false);

  const [savingTimezone, setSavingTimezone] = useState(false);
  const [autoDistrib, setAutoDistrib] = useState(true);
  const [loadingAutoDistrib, setLoadingAutoDistrib] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false);

  useEffect(() => {
    const fetchGroupSettings = async () => {
      if (!user?.groupId) return;
      try {
        const groupSnap = await getDoc(doc(db, 'groups', user.groupId));
        if (groupSnap.exists()) {
          setAutoDistrib(groupSnap.data()?.autoDistribution ?? false);
        }
      } catch (e) {
        console.error('Error fetching group settings:', e);
      }
    };
    fetchGroupSettings();
  }, [user?.groupId]);

  const toggleAutoDistrib = async (value: boolean) => {
    if (!user?.groupId || user.type !== 'Adult') return;
    setLoadingAutoDistrib(true);
    try {
      await updateDoc(doc(db, 'groups', user.groupId), { autoDistribution: value });
      setAutoDistrib(value);
    } catch (e) {
      Alert.alert('Error', 'Could not update auto-distribution setting');
    } finally {
      setLoadingAutoDistrib(false);
    }
  };

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
        'Invite Link Generated',
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



  const handleTimezone = async (iana: string) => {
    if (!user) return;
    setSavingTimezone(true);
    try {
      await updateDoc(doc(db, 'users', user.id), { timezone: iana });
      await refreshUser();
    } catch (e) {
      Alert.alert('Error', 'Could not update timezone');
    } finally {
      setSavingTimezone(false);
    }
  };

  // Resolve display label for current timezone (fallback: device tz)
  const currentTz = user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentTzLabel = TIMEZONES.find((t) => t.iana === currentTz)?.label ?? currentTz;

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
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
            <View style={[styles.roleBadge, { backgroundColor: getRoleColor(user?.type, Colors) + '15', borderWidth: 1, borderColor: getRoleColor(user?.type, Colors) + '30' }]}>
              <Text style={[styles.roleText, { color: getRoleColor(user?.type, Colors) }]}>
                {user?.type} · {user?.resource} capacity
              </Text>
            </View>
          </View>
        </View>

        {/* Notification Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Time</Text>
          <Text style={styles.sectionDesc}>When to receive your daily reminders</Text>

          <TouchableOpacity
            style={styles.dropdownHeader}
            onPress={() => !savingTime && setDropdownOpen(!dropdownOpen)}
            activeOpacity={0.7}
            disabled={savingTime}
          >
            {savingTime ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.dropdownHeaderText, { color: Colors.textSecondary }]}>Saving...</Text>
              </View>
            ) : (
              <Text style={styles.dropdownHeaderText}>
                {user?.notificationTime || '09:00'}
              </Text>
            )}
            {!savingTime && <Text style={styles.dropdownChevron}>{dropdownOpen ? '▲' : '▼'}</Text>}
          </TouchableOpacity>

          {dropdownOpen && (
            <View style={styles.dropdownListContainer}>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                {ALL_HOURS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.dropdownItem,
                      user?.notificationTime === t && styles.dropdownItemActive
                    ]}
                    onPress={() => {
                      handleNotifTime(t);
                      setDropdownOpen(false);
                    }}
                    disabled={savingTime}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        user?.notificationTime === t && styles.dropdownItemTextActive
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Timezone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timezone</Text>
          <Text style={styles.sectionDesc}>Used for scheduling and daily reminders</Text>

          <TouchableOpacity
            style={styles.dropdownHeader}
            onPress={() => !savingTimezone && setTzDropdownOpen(!tzDropdownOpen)}
            activeOpacity={0.7}
            disabled={savingTimezone}
          >
            {savingTimezone ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.dropdownHeaderText, { color: Colors.textSecondary }]}>Saving...</Text>
              </View>
            ) : (
              <Text style={styles.dropdownHeaderText} numberOfLines={1}>
                {currentTzLabel}
              </Text>
            )}
            {!savingTimezone && <Text style={styles.dropdownChevron}>{tzDropdownOpen ? '▲' : '▼'}</Text>}
          </TouchableOpacity>

          {tzDropdownOpen && (
            <View style={styles.dropdownListContainer}>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                {TIMEZONES.map((tz) => (
                  <TouchableOpacity
                    key={tz.iana}
                    style={[
                      styles.dropdownItem,
                      currentTz === tz.iana && styles.dropdownItemActive,
                    ]}
                    onPress={() => { handleTimezone(tz.iana); setTzDropdownOpen(false); }}
                    disabled={savingTimezone}
                  >
                    <Text style={[
                      styles.dropdownItemText,
                      currentTz === tz.iana && styles.dropdownItemTextActive,
                    ]}>
                      {tz.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Auto-distribute setting */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.sectionTitle}>Auto-distribute tasks</Text>
              <Text style={styles.sectionDesc}>Redistribute auto-assigned tasks every week to avoid repetition</Text>
            </View>
            {loadingAutoDistrib ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <Switch
                value={autoDistrib}
                onValueChange={toggleAutoDistrib}
                disabled={user?.type !== 'Adult'}
                trackColor={{ true: Colors.primary, false: Colors.bgInput }}
                thumbColor={autoDistrib ? Colors.primaryLight : Colors.textMuted}
              />
            )}
          </View>
        </View>

        {/* Adult-only: Invite Members */}
        {isAdult && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Invite Members</Text>
            <Text style={styles.sectionDesc}>Generate a 24-hour invite code for group members</Text>
            <TouchableOpacity
              style={[styles.actionBtn, generatingLink && styles.btnDisabled]}
              onPress={generateInviteLink}
              disabled={generatingLink}
            >
              {generatingLink
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.actionBtnText}>Generate Invite Code</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Theme */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme</Text>
          <Text style={styles.sectionDesc}>Choose your visual style</Text>
          <View style={styles.langRow}>
            <TouchableOpacity
              style={[styles.langBtn, theme === 'light' && styles.langBtnActive]}
              onPress={() => setTheme('light')}
            >
              <Text style={[styles.langBtnText, theme === 'light' && styles.langBtnTextActive]}>
                Light
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, theme === 'dark' && styles.langBtnActive]}
              onPress={() => setTheme('dark')}
            >
              <Text style={[styles.langBtnText, theme === 'dark' && styles.langBtnTextActive]}>
                Dark
              </Text>
            </TouchableOpacity>
          </View>
        </View>



        {/* Danger Zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={[styles.sectionTitle, { color: Colors.accent }]}>Danger Zone</Text>

          <TouchableOpacity style={styles.dangerBtn} onPress={handleLeaveGroup}>
            <Text style={styles.dangerBtnText}>Leave Group</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.dangerBtn, { marginTop: 8 }]} onPress={handleSignOut}>
            <Text style={styles.dangerBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Nest v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function getRoleColor(type: string | undefined, Colors: ThemeColors) {
  if (type === 'Adult') return Colors.adult;
  if (type === 'Teen') return Colors.teen;
  return Colors.child;
}

const getStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 100 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  profileAvatar: {
    width: 56, height: 56, borderRadius: Radius.sm, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  profileInitial: { fontSize: 22, fontWeight: '700', color: '#fff' },
  profileName: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  profileEmail: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  roleBadge: { borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  roleText: { fontSize: 11, fontWeight: '600' },
  section: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionDesc: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md },
  dropdownHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  dropdownHeaderText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  dropdownChevron: { color: Colors.textSecondary, fontSize: 12 },
  dropdownListContainer: {
    marginTop: Spacing.xs, backgroundColor: Colors.bgCard, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border, maxHeight: 180, overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 180 },
  dropdownItem: {
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dropdownItemActive: { backgroundColor: Colors.primary + '15' },
  dropdownItemText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '500' },
  dropdownItemTextActive: { color: Colors.primary, fontWeight: '600' },
  langRow: { flexDirection: 'row', gap: Spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  langBtn: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  langBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  langBtnText: { color: Colors.textSecondary, fontWeight: '500', fontSize: 14 },
  langBtnTextActive: { color: Colors.primary, fontWeight: '600' },
  actionBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm, padding: Spacing.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  dangerSection: { borderColor: Colors.accent + '20' },
  dangerBtn: {
    backgroundColor: Colors.accent + '10', borderRadius: Radius.sm, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.accent + '20',
  },
  dangerBtnText: { color: Colors.accent, fontWeight: '600', fontSize: 14 },
  version: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm },
});
