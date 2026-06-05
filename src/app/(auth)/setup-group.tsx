import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { AppAlert } from '../../utils/alert';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Spacing, Radius, ThemeColors } from '../../constants/colors';
import { useAppTheme } from '../../contexts/ThemeContext';

export default function SetupGroupScreen() {
  const { Colors } = useAppTheme();
  const styles = getStyles(Colors);
  const { user, refreshUser } = useAuth();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [groupName, setGroupName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const ALL_ROLES = ['Adult', 'Teen', 'Child'];

  // Default tasks to pre-populate for a new group
  const defaultTasks = [
    { title: 'Clean fridge', complexity: 40, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Clean microwave', complexity: 15, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Clean stove top', complexity: 20, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Clear the table', complexity: 5, availableFor: ALL_ROLES, weekDays: ALL_DAYS },
    { title: 'Make breakfast', complexity: 15, availableFor: ALL_ROLES, weekDays: ALL_DAYS },
    { title: 'Make dinner', complexity: 30, availableFor: ALL_ROLES, weekDays: ALL_DAYS },
    { title: 'Make lunch', complexity: 30, availableFor: ALL_ROLES, weekDays: ALL_DAYS },
    { title: 'Set the table', complexity: 5, availableFor: ALL_ROLES, weekDays: ALL_DAYS },
    { title: 'Wash dishes', complexity: 15, availableFor: ALL_ROLES, weekDays: ALL_DAYS },
    { title: 'Dust rooms', complexity: 30, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Vacuum rooms', complexity: 10, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Change bed sheets', complexity: 25, availableFor: ALL_ROLES, weekDays: [0] },
    { title: 'Make double bed', complexity: 5, availableFor: ALL_ROLES, weekDays: ALL_DAYS },
    { title: 'Make single bed', complexity: 5, availableFor: ALL_ROLES, weekDays: ALL_DAYS },
    { title: 'Clean mirrors', complexity: 30, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Clean bathroom sink', complexity: 10, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Clean shower', complexity: 30, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Clean toilet', complexity: 25, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Mop floor', complexity: 50, availableFor: ALL_ROLES, weekDays: [0] },
    { title: 'Do laundry', complexity: 10, availableFor: ALL_ROLES, weekDays: [0] },
    { title: 'Hang the laundry', complexity: 15, availableFor: ALL_ROLES, weekDays: [0] },
    { title: 'Clean trash cans', complexity: 25, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Take out trash', complexity: 15, availableFor: ALL_ROLES, weekDays: ALL_DAYS },
    { title: 'Grocery shopping', complexity: 40, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Put groceries away', complexity: 15, availableFor: ALL_ROLES, weekDays: [6] },
    { title: 'Clean patio', complexity: 35, availableFor: ALL_ROLES, weekDays: [0] },
  ];

  const changeMode = (newMode: 'choose' | 'create' | 'join') => {
    setMode(newMode);
    setErrorMsg('');
  };

  const handleCreate = async () => {
    setErrorMsg('');
    if (!groupName.trim()) {
      setErrorMsg('Please enter a group name');
      AppAlert.alert('Error', 'Please enter a group name');
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      // Create group
      const { data: newGroup, error: groupErr } = await supabase
        .from('groups')
        .insert({
          name: groupName.trim(),
          created_by: user.id,
          auto_distribution: true,
        })
        .select()
        .single();

      if (groupErr) throw groupErr;
      if (!newGroup) throw new Error('Could not retrieve new group ID');

      const groupId = newGroup.id;

      // Assign user to group
      const { error: userErr } = await supabase
        .from('users')
        .update({ group_id: groupId })
        .eq('id', user.id);

      if (userErr) throw userErr;

      // Create default tasks
      const tasksToInsert = defaultTasks.map((t) => ({
        group_id: groupId,
        title: t.title,
        complexity: t.complexity,
        week_days: t.weekDays,
        available_for: t.availableFor,
        assigned_to: null,
        auto: true,
        is_active: true,
        created_by: user.id,
      }));

      const { error: tasksErr } = await supabase
        .from('tasks')
        .insert(tasksToInsert);

      if (tasksErr) throw tasksErr;

      await refreshUser();
      router.replace('/(tabs)/assignments');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not create group');
      AppAlert.alert('Error', e?.message ?? 'Could not create group');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setErrorMsg('');
    if (!inviteToken.trim()) {
      setErrorMsg('Please enter an invite code');
      AppAlert.alert('Error', 'Please enter an invite code');
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      // Find invite link with this token
      const { data: inviteLink, error: linkErr } = await supabase
        .from('invite_links')
        .select('*')
        .eq('token', inviteToken.trim())
        .single();

      if (linkErr || !inviteLink) {
        setErrorMsg('Invalid invite code');
        AppAlert.alert('Error', 'Invalid invite code');
        setLoading(false);
        return;
      }

      const expiresAt = new Date(inviteLink.expires_at);
      if (expiresAt < new Date()) {
        setErrorMsg('This invite code has expired');
        AppAlert.alert('Error', 'This code link has expired');
        setLoading(false);
        return;
      }

      const foundGroupId = inviteLink.group_id;

      // Assign user to group
      const { error: userErr } = await supabase
        .from('users')
        .update({ group_id: foundGroupId })
        .eq('id', user.id);

      if (userErr) throw userErr;

      // Update used_by array in invite_links
      const usedBy = inviteLink.used_by || [];
      if (!usedBy.includes(user.id)) {
        await supabase
          .from('invite_links')
          .update({ used_by: [...usedBy, user.id] })
          .eq('token', inviteToken.trim());
      }

      await refreshUser();
      router.replace('/(tabs)/assignments');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not join group');
      AppAlert.alert('Error', e?.message ?? 'Could not join group');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'choose') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.emoji}>🏡</Text>
            <Text style={styles.title}>Set Up Your Home</Text>
            <Text style={styles.subtitle}>
              Create a new group or join an existing one
            </Text>
          </View>

          <TouchableOpacity style={styles.optionCard} onPress={() => changeMode('create')}>
            <View style={[styles.optionIcon, { backgroundColor: Colors.primary + '20' }]}>
              <Text style={styles.optionEmoji}>✨</Text>
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Create a Group</Text>
              <Text style={styles.optionDesc}>
                Start fresh and invite your group members
              </Text>
            </View>
            <Text style={styles.optionArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionCard} onPress={() => changeMode('join')}>
            <View style={[styles.optionIcon, { backgroundColor: Colors.success + '20' }]}>
              <Text style={styles.optionEmoji}>🔗</Text>
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Join a Group</Text>
              <Text style={styles.optionDesc}>
                Enter an invite code from a group member
              </Text>
            </View>
            <Text style={styles.optionArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => changeMode('choose')} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {mode === 'create' ? (
        <>
          <Text style={styles.title}>Create Group</Text>
          <Text style={styles.subtitle}>Give your group a name</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Group Name</Text>
              <TextInput
                style={styles.input} value={groupName}
                onChangeText={(text) => { setGroupName(text); setErrorMsg(''); }} placeholder="e.g. The Smiths"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <Text style={styles.hint}>
              {"🎉 We'll add common household tasks to get you started!"}
            </Text>
            {errorMsg ? (
              <Text style={styles.errorText}>{errorMsg}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleCreate} disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Group</Text>}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.title}>Join Group</Text>
          <Text style={styles.subtitle}>Enter the invite code you received</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Invite Code</Text>
              <TextInput
                style={styles.input} value={inviteToken}
                onChangeText={(text) => { setInviteToken(text); setErrorMsg(''); }} placeholder="Paste your invite code"
                placeholderTextColor={Colors.textMuted} autoCapitalize="none"
              />
            </View>
            {errorMsg ? (
              <Text style={styles.errorText} testID="error-text">{errorMsg}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleJoin} disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Join Group</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const getStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  emoji: { fontSize: 60, marginBottom: Spacing.md },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  optionIcon: { width: 48, height: 48, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  optionEmoji: { fontSize: 22 },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  optionDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  optionArrow: { fontSize: 18, color: Colors.textMuted },
  back: { marginBottom: Spacing.lg },
  backText: { color: Colors.primary, fontSize: 16, fontWeight: '600' },
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.lg },
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6, fontWeight: '500' },
  input: { backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md, color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.border },
  hint: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center',
    shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  errorText: { color: Colors.accent, fontSize: 14, fontWeight: '600', marginTop: Spacing.xs, marginBottom: Spacing.md, textAlign: 'center' },
});
