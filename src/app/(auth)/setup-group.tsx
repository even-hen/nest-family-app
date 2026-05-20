import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import {
  collection, addDoc, doc, updateDoc,
  getDocs, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, Radius } from '../../constants/colors';

export default function SetupGroupScreen() {
  const { user, refreshUser } = useAuth();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [groupName, setGroupName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [loading, setLoading] = useState(false);

  // Default tasks to pre-populate for a new group
  const defaultTasks = [
    { title: 'Wash dishes', complexity: 10, type: 'daily', availableFor: ['Adult', 'Teen'], weekDays: [] },
    { title: 'Vacuum living room', complexity: 20, type: 'weekly', availableFor: ['Adult', 'Teen'], weekDays: [6] },
    { title: 'Take out trash', complexity: 8, type: 'weekly', availableFor: ['Adult', 'Teen', 'Child'], weekDays: [1, 4] },
    { title: 'Clean bathroom', complexity: 25, type: 'weekly', availableFor: ['Adult'], weekDays: [6] },
    { title: 'Make bed', complexity: 5, type: 'daily', availableFor: ['Adult', 'Teen', 'Child'], weekDays: [] },
    { title: 'Feed pets', complexity: 5, type: 'daily', availableFor: ['Adult', 'Teen', 'Child'], weekDays: [] },
    { title: 'Water plants', complexity: 5, type: 'weekly', availableFor: ['Adult', 'Teen', 'Child'], weekDays: [3] },
    { title: 'Grocery shopping', complexity: 30, type: 'weekly', availableFor: ['Adult'], weekDays: [6] },
  ];

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      // Create group
      const groupRef = await addDoc(collection(db, 'groups'), {
        name: groupName.trim(),
        createdBy: user.id,
        createdAt: serverTimestamp(),
        autoDistribution: true,
        inviteLinks: [],
      });

      // Assign user to group
      await updateDoc(doc(db, 'users', user.id), { groupId: groupRef.id });

      // Create default tasks
      for (const t of defaultTasks) {
        await addDoc(collection(db, 'tasks'), {
          groupId: groupRef.id,
          title: t.title,
          complexity: t.complexity,
          type: t.type,
          weekDays: t.weekDays,
          availableFor: t.availableFor,
          assignedTo: null,
          isActive: true,
          createdBy: user.id,
          createdAt: serverTimestamp(),
        });
      }

      await refreshUser();
      router.replace('/(tabs)/assignments');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not create group');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!inviteToken.trim()) {
      Alert.alert('Error', 'Please enter an invite code');
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      // Find group with this invite token
      const groupsSnap = await getDocs(collection(db, 'groups'));
      let foundGroupId: string | null = null;
      let foundLink: any = null;

      for (const groupDoc of groupsSnap.docs) {
        const data = groupDoc.data();
        const links: any[] = data.inviteLinks ?? [];
        const link = links.find((l: any) => l.token === inviteToken.trim());
        if (link) {
          const expiresAt: Timestamp = link.expiresAt;
          if (expiresAt.toDate() < new Date()) {
            Alert.alert('Error', 'This invite link has expired');
            setLoading(false);
            return;
          }
          foundGroupId = groupDoc.id;
          foundLink = link;
          break;
        }
      }

      if (!foundGroupId) {
        Alert.alert('Error', 'Invalid invite code');
        setLoading(false);
        return;
      }

      await updateDoc(doc(db, 'users', user.id), { groupId: foundGroupId });
      await refreshUser();
      router.replace('/(tabs)/assignments');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not join group');
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
              Create a new family group or join an existing one
            </Text>
          </View>

          <TouchableOpacity style={styles.optionCard} onPress={() => setMode('create')}>
            <View style={[styles.optionIcon, { backgroundColor: Colors.primary + '20' }]}>
              <Text style={styles.optionEmoji}>✨</Text>
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Create a Group</Text>
              <Text style={styles.optionDesc}>
                Start fresh and invite your family members
              </Text>
            </View>
            <Text style={styles.optionArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionCard} onPress={() => setMode('join')}>
            <View style={[styles.optionIcon, { backgroundColor: Colors.success + '20' }]}>
              <Text style={styles.optionEmoji}>🔗</Text>
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Join a Group</Text>
              <Text style={styles.optionDesc}>
                Enter an invite code from a family member
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
      <TouchableOpacity onPress={() => setMode('choose')} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {mode === 'create' ? (
        <>
          <Text style={styles.title}>Create Group</Text>
          <Text style={styles.subtitle}>Give your family a name</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Group Name</Text>
              <TextInput
                style={styles.input} value={groupName}
                onChangeText={setGroupName} placeholder="e.g. The Smiths"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <Text style={styles.hint}>
              🎉 We'll add 8 common household tasks to get you started!
            </Text>
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
                onChangeText={setInviteToken} placeholder="Paste your invite code"
                placeholderTextColor={Colors.textMuted} autoCapitalize="none"
              />
            </View>
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

const styles = StyleSheet.create({
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
});
