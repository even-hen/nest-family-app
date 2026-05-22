import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { ThemeColors } from '../../constants/colors';
import { Ionicons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  iconName,
  focused,
  label,
}: {
  iconName: IconName;
  focused: boolean;
  label: string;
}) {
  const { Colors } = useAppTheme();
  const styles = getStyles(Colors);

  return (
    <View style={styles.tabItem}>
      <Ionicons
        name={iconName}
        size={22}
        color={focused ? Colors.tabActive : Colors.tabInactive}
      />
      <Text numberOfLines={1} style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { Colors } = useAppTheme();
  const styles = getStyles(Colors);

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
              label="Group"
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
});
