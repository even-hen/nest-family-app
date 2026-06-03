import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  PanResponder,
} from 'react-native';
import { AppAlert } from '../../utils/alert';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Spacing, Radius, ThemeColors } from '../../constants/colors';
import { UserType } from '../../types';
import { useAppTheme } from '../../contexts/ThemeContext';

const USER_TYPES: { label: string; value: UserType; emoji: string; desc: string }[] = [
  { label: 'Adult', value: 'Adult', emoji: '👤', desc: 'Full admin access' },
  { label: 'Teen', value: 'Teen', emoji: '🧑', desc: 'Can view & complete tasks' },
  { label: 'Child', value: 'Child', emoji: '🧒', desc: 'Can view & complete tasks' },
];

const getCapacityColor = (val: number, Colors: ThemeColors) => {
  if (val <= 30) return Colors.accent;
  if (val <= 70) return Colors.success;
  return Colors.primary;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const { Colors } = useAppTheme();
  const styles = getStyles(Colors);
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<UserType>('Adult');
  const [resource, setResource] = useState(100);
  const [loading, setLoading] = useState(false);

  const [sliderWidth, setSliderWidth] = useState(200);
  const resourceRef = React.useRef(resource);
  React.useEffect(() => {
    resourceRef.current = resource;
  }, [resource]);
  const startValRef = React.useRef(resource);

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const initialX = evt.nativeEvent.locationX;
      const initialVal = Math.max(0, Math.min(100, Math.round((initialX / sliderWidth) * 10) * 10));
      setResource(initialVal);
      startValRef.current = initialVal;
    },
    onPanResponderMove: (evt, gestureState) => {
      const deltaPercent = (gestureState.dx / sliderWidth) * 100;
      const rawVal = startValRef.current + deltaPercent;
      const steppedVal = Math.max(0, Math.min(100, Math.round(rawVal / 10) * 10));
      setResource(steppedVal);
    },
    onPanResponderRelease: () => {}
  }), [sliderWidth]);

  const handleRegister = async () => {
    if (!email.trim() || !password.trim() || !name.trim()) {
      AppAlert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      AppAlert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (name.trim().length < 2) {
      AppAlert.alert('Error', 'Name must be at least 2 characters');
      return;
    }
    if (password.length < 6) {
      AppAlert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim(), type, resource);
      router.replace('/(auth)/setup-group');
    } catch (e: any) {
      AppAlert.alert('Registration Failed', e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join Nest and balance tasks of your group</Text>
        </View>

        <View style={styles.card}>
          {/* Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input} value={name} onChangeText={setName}
              placeholder="Your name" placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
            />
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input} value={email} onChangeText={setEmail}
              placeholder="your@email.com" placeholderTextColor={Colors.textMuted}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
            />
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input} value={password} onChangeText={setPassword}
              placeholder="••••••••" placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />
          </View>

          {/* User Type */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>I am a...</Text>
            <View style={styles.typeRow}>
              {USER_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeCard, type === t.value && styles.typeCardActive]}
                  onPress={() => setType(t.value)}
                >
                  <Text style={styles.typeEmoji}>{t.emoji}</Text>
                  <Text style={[styles.typeLabel, type === t.value && styles.typeLabelActive]}>
                    {t.label}
                  </Text>
                  <Text style={styles.typeDesc}>{t.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Resource slider */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              My capacity: <Text style={[styles.accent, { color: getCapacityColor(resource, Colors) }]}>{resource}</Text>
            </Text>
            <Text style={styles.hint}>
              How much of the household workload can you handle?
            </Text>
            <View style={styles.sliderContainer}>
              <View 
                style={styles.trackWrapper}
                onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
                {...panResponder.panHandlers}
              >
                <View style={styles.trackBg} />
                <View style={[styles.trackFill, { width: `${resource}%`, backgroundColor: getCapacityColor(resource, Colors) }]} />
                
                {/* Single Thumb Indicator */}
                <View style={[styles.thumbContainer, { left: `${resource}%` }]} pointerEvents="none">
                  <View style={[styles.sliderThumb, { borderColor: getCapacityColor(resource, Colors), shadowColor: getCapacityColor(resource, Colors) }]} />
                </View>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} onPress={() => router.back()}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkAccent}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, padding: Spacing.lg, paddingTop: 60 },
  back: { marginBottom: Spacing.lg },
  backText: { color: Colors.primary, fontSize: 16, fontWeight: '600' },
  header: { marginBottom: Spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border,
  },
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.border,
  },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typeCard: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.sm,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  typeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.bgCardAlt },
  typeEmoji: { fontSize: 22, marginBottom: 4 },
  typeLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  typeLabelActive: { color: Colors.primary },
  typeDesc: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
  hint: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.sm },
  sliderContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  trackWrapper: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    height: 6,
    backgroundColor: Colors.bgInput,
    borderRadius: 3,
    width: '100%',
  },
  trackFill: {
    height: 6,
    backgroundColor: '#009688',
    borderRadius: 3,
    position: 'absolute',
    left: 0,
  },
  thumbContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 24,
    marginLeft: -12,
  },
  sliderThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: '#009688',
    shadowColor: '#009688',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  accent: { color: '#009688' },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm,
    shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkBtn: { alignItems: 'center', marginTop: Spacing.md },
  linkText: { color: Colors.textSecondary, fontSize: 14 },
  linkAccent: { color: Colors.primary, fontWeight: '600' },
});
