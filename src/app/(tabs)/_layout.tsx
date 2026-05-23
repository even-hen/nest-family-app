import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { ThemeColors } from '../../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  iconName,
  focused,
  label,
  badgeCount,
}: {
  iconName: IconName;
  focused: boolean;
  label: string;
  badgeCount?: number;
}) {
  const { Colors } = useAppTheme();
  const styles = getStyles(Colors);

  return (
    <View style={styles.tabItem}>
      <View>
        <Ionicons
          name={iconName}
          size={22}
          color={focused ? Colors.tabActive : Colors.tabInactive}
        />
        {badgeCount !== undefined && badgeCount > 0 && (
          <View style={styles.badge} />
        )}
      </View>
      <Text numberOfLines={1} style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { Colors } = useAppTheme();
  const styles = getStyles(Colors);
  const { user, loading, unreadCount } = useAuth();

  if (!loading && !user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!loading && user && !user.groupId) {
    return <Redirect href="/(auth)/setup-group" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="assignments"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconName={focused ? 'checkbox' : 'checkbox-outline'}
              label="Tasks"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconName={focused ? 'bar-chart' : 'bar-chart-outline'}
              label="Stats"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconName={focused ? 'clipboard' : 'clipboard-outline'}
              label="Plan"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconName={focused ? 'people' : 'people-outline'}
              label="Family"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconName={focused ? 'notifications' : 'notifications-outline'}
              label="Alerts"
              focused={focused}
              badgeCount={unreadCount}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconName={focused ? 'settings' : 'settings-outline'}
              label="Settings"
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const getStyles = (Colors: ThemeColors) => StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bgCard,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 76,
    paddingBottom: 8,
    paddingTop: 12,
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 50 },
  tabLabel: { fontSize: 10, color: Colors.tabInactive, fontWeight: '500' },
  tabLabelActive: { color: Colors.tabActive },
  badge: {
    position: 'absolute',
    right: -4,
    top: -2,
    backgroundColor: '#FF3B30', // Standard iOS red
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: Colors.bgCard, // Match background so it forms a clean cutout
  },
});
