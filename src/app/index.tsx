import React, { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useAppTheme } from '../contexts/ThemeContext';

export default function Index() {
  const { Colors } = useAppTheme();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!user.groupId) {
    return <Redirect href="/(auth)/setup-group" />;
  }

  return <Redirect href="/(tabs)/assignments" />;
}
