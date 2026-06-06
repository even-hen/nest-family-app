import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleProp, StyleSheet, View, ViewStyle, ScrollView } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { Radius, Spacing, ThemeColors } from '../constants/colors';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 20, borderRadius = 6, style }: SkeletonProps) {
  const { Colors } = useAppTheme();
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: Colors.bgInput,
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
}

// ----------------------------------------------------
// CARD SKELETONS
// ----------------------------------------------------

export function AssignmentCardSkeleton() {
  const { Colors } = useAppTheme();
  const styles = React.useMemo(() => getSkeletonStyles(Colors), [Colors]);

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={styles.iconContainer}>
          <Skeleton width={28} height={28} borderRadius={Radius.sm} />
        </View>
        <View style={styles.cardInfo}>
          <Skeleton width="65%" height={16} style={{ marginBottom: Spacing.xs }} />
          <Skeleton width="35%" height={12} borderRadius={Radius.sm} />
        </View>
      </View>
      <View style={styles.cardRight}>
        <Skeleton width={80} height={28} borderRadius={Radius.sm} />
      </View>
    </View>
  );
}

export function NotificationCardSkeleton() {
  const { Colors } = useAppTheme();
  const styles = React.useMemo(() => getSkeletonStyles(Colors), [Colors]);

  return (
    <View style={styles.card}>
      <View style={styles.cardIcon}>
        <Skeleton width={44} height={44} borderRadius={22} />
      </View>
      <View style={styles.cardBody}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs, alignItems: 'center' }}>
          <Skeleton width="50%" height={14} />
          <Skeleton width={40} height={10} />
        </View>
        <Skeleton width="90%" height={12} style={{ marginBottom: 6 }} />
        <Skeleton width="60%" height={12} />
      </View>
    </View>
  );
}

export function MemberStatCardSkeleton() {
  const { Colors } = useAppTheme();
  const styles = React.useMemo(() => getSkeletonStyles(Colors), [Colors]);

  return (
    <View style={styles.card}>
      <View style={[styles.cardHeader, { marginBottom: Spacing.sm }]}>
        <View style={styles.nameRow}>
          <Skeleton width={90} height={18} />
          <Skeleton width={50} height={18} borderRadius={Radius.sm} />
        </View>
        <Skeleton width={24} height={24} borderRadius={12} />
      </View>
      
      <View style={styles.barRow}>
        <Skeleton width="100%" height={6} borderRadius={Radius.full} />
      </View>
      
      <View style={styles.pillsRow}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.pill, { backgroundColor: Colors.bgInput + '20', borderWidth: 1, borderColor: Colors.border }]}>
            <Skeleton width={18} height={18} style={{ marginBottom: 4 }} />
            <Skeleton width={30} height={10} />
          </View>
        ))}
      </View>
      
      <View style={styles.bottomInfoRow}>
        <Skeleton width={70} height={12} />
        <Skeleton width={60} height={12} />
      </View>
    </View>
  );
}

export function TaskCardSkeleton() {
  const { Colors } = useAppTheme();
  const styles = React.useMemo(() => getSkeletonStyles(Colors), [Colors]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Skeleton width={18} height={18} borderRadius={9} />
          <Skeleton width="55%" height={16} />
          <Skeleton width={40} height={12} />
        </View>
        <Skeleton width={24} height={24} borderRadius={12} />
      </View>
      
      <View style={[styles.daysRow, { marginTop: Spacing.sm, marginBottom: Spacing.sm }]}>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} width={24} height={14} borderRadius={4} />
        ))}
      </View>
      
      <View style={styles.availRow}>
        <Skeleton width={75} height={18} borderRadius={Radius.sm} />
        <Skeleton width={50} height={18} borderRadius={Radius.sm} />
      </View>
    </View>
  );
}

// ----------------------------------------------------
// FULL SCREEN WRAPPER SKELETONS
// ----------------------------------------------------

export function AssignmentsScreenSkeleton() {
  const { Colors } = useAppTheme();
  const styles = React.useMemo(() => getSkeletonStyles(Colors), [Colors]);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Skeleton width={180} height={22} style={{ marginBottom: 6 }} />
            <Skeleton width={110} height={13} />
          </View>
          <View style={{ width: 110, height: 32, borderRadius: Radius.md, backgroundColor: Colors.bgInput, opacity: 0.5 }} />
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.statBox}>
          <Skeleton width={20} height={24} style={{ marginBottom: 4 }} />
          <Skeleton width={45} height={10} />
        </View>
        <View style={[styles.statBox, styles.statBoxMiddle]}>
          <Skeleton width={20} height={24} style={{ marginBottom: 4 }} />
          <Skeleton width={45} height={10} />
        </View>
        <View style={styles.statBox}>
          <Skeleton width={20} height={24} style={{ marginBottom: 4 }} />
          <Skeleton width={45} height={10} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} scrollEnabled={false}>
        <Skeleton width={60} height={13} style={{ marginTop: Spacing.md, marginBottom: 6 }} />
        <AssignmentCardSkeleton />
        <AssignmentCardSkeleton />
        <AssignmentCardSkeleton />
        <AssignmentCardSkeleton />
      </ScrollView>
    </View>
  );
}

export function NotificationsScreenSkeleton() {
  const { Colors } = useAppTheme();
  const styles = React.useMemo(() => getSkeletonStyles(Colors), [Colors]);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Skeleton width={140} height={22} style={{ marginBottom: 6 }} />
            <Skeleton width={60} height={13} />
          </View>
          <View style={{ width: 95, height: 28, borderRadius: Radius.full, backgroundColor: Colors.bgInput, opacity: 0.5 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} scrollEnabled={false}>
        <NotificationCardSkeleton />
        <NotificationCardSkeleton />
        <NotificationCardSkeleton />
        <NotificationCardSkeleton />
      </ScrollView>
    </View>
  );
}

export function StatsScreenSkeleton() {
  const { Colors } = useAppTheme();
  const styles = React.useMemo(() => getSkeletonStyles(Colors), [Colors]);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.header}>
        <Skeleton width={160} height={22} style={{ marginBottom: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgInput, opacity: 0.5 }} />
          <Skeleton width={90} height={14} />
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgInput, opacity: 0.5 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} scrollEnabled={false}>
        <MemberStatCardSkeleton />
        <MemberStatCardSkeleton />
        <MemberStatCardSkeleton />
      </ScrollView>
    </View>
  );
}

export function TasksScreenSkeleton() {
  const { Colors } = useAppTheme();
  const styles = React.useMemo(() => getSkeletonStyles(Colors), [Colors]);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Skeleton width={100} height={22} style={{ marginBottom: 6 }} />
            <Skeleton width={130} height={13} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ width: 85, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.bgInput, opacity: 0.5 }} />
            <View style={{ width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.bgInput, opacity: 0.5 }} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} scrollEnabled={false}>
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.bgInput, opacity: 0.5, marginRight: 8 }} />
            <Skeleton width={120} height={14} />
          </View>
        </View>
        
        <TaskCardSkeleton />
        <TaskCardSkeleton />
        <TaskCardSkeleton />
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------
// STYLES
// ----------------------------------------------------

const getSkeletonStyles = (Colors: ThemeColors) => StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 54, // Matches typical safe area offset padding
    paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  statBoxMiddle: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  list: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardLeft: {
    flexDirection: 'row',
    flex: 1,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  iconContainer: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardRight: {
    gap: 8,
    marginLeft: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bgInput,
  },
  cardBody: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  barRow: {
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  pill: {
    flex: 1,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  bottomInfoRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border + '30',
    paddingTop: Spacing.xs,
    marginTop: Spacing.xs,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  availRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  searchContainer: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    height: 38,
  },
});
