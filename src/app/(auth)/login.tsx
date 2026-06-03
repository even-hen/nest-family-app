import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { AppAlert } from '../../utils/alert';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Spacing, Radius, ThemeColors } from '../../constants/colors';
import { useAppTheme } from '../../contexts/ThemeContext';

export default function LoginScreen() {
  const { Colors } = useAppTheme();
  const styles = getStyles(Colors);
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      AppAlert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (e: any) {
      AppAlert.alert('Login Failed', e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      AppAlert.alert('Reset Password', 'Please enter your email address in the field above first, then tap "Forgot password?" again.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim());
      AppAlert.alert('Success', 'Password reset email sent! Please check your inbox.');
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'Could not send reset email');
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
        {/* Logo / Header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🏠</Text>
          </View>
          <Text style={styles.appName}>Nest</Text>
          <Text style={styles.tagline}>Group task balance, simplified</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />
          </View>

          <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.linkText}>
              {"Don't have an account? "}
              <Text style={styles.linkAccent}>Create one</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.primary, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
  },
  logoEmoji: { fontSize: 36 },
  appName: { fontSize: 36, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 1 },
  tagline: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border,
  },
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: Spacing.lg },
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Colors.border,
  },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm,
    shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  forgotBtn: { alignItems: 'flex-end', marginBottom: Spacing.md },
  forgotText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, marginHorizontal: Spacing.sm, fontSize: 13 },
  linkBtn: { alignItems: 'center' },
  linkText: { color: Colors.textSecondary, fontSize: 14 },
  linkAccent: { color: Colors.primary, fontWeight: '600' },
});
