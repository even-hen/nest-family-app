import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
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
          tabBarIcon: ({ focused }) => <TabIcon emoji="✅" label="Tasks" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" label="Chores" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="👨‍👩‍👧" label="Family" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" label="Stats" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔔" label="Alerts" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" label="Settings" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bgCard,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 70,
    paddingBottom: 8,
    paddingTop: 4,
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabEmoji: { fontSize: 20 },
  tabLabel: { fontSize: 10, color: Colors.tabInactive, fontWeight: '500' },
  tabLabelActive: { color: Colors.tabActive },
});
