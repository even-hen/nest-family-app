import { Task, User, UserType } from '../types';

/**
 * Calculates the weekly resource cost of a task.
 * Cost = complexity * number of active weekDays.
 * E.g. complexity=10, active on 3 days → cost=30 points/week.
 */
export function getTaskWeeklyCost(task: Pick<Task, 'weekDays' | 'complexity'>): number {
  return task.complexity * (task.weekDays ? task.weekDays.length : 0);
}

export interface AssignableUser {
  id: string;
  type: UserType;
  resource: number; // 0-100
}

interface TaskAssignment {
  taskId: string;
  assignedTo: string | null;
}

/**
 * Automatically distribute active tasks among group members.
 * Rules:
 * - Only active tasks are distributed.
 * - Tasks with `availableFor` restrictions are only assigned to matching user types.
 * - Distribution is proportional to each user's `resource` percentage.
 * - Uses a greedy approach: assign each task to the user with the highest remaining capacity.
 */
export function autoDistributeTasks(
  tasks: Task[],
  users: AssignableUser[]
): { assignments: TaskAssignment[]; unassigned: Task[] } {
  if (users.length === 0) {
    return {
      assignments: [],
      unassigned: tasks.filter((t) => t.isActive),
    };
  }

  const activeTasks = tasks.filter((t) => t.isActive);

  // Calculate total resource units across all users
  const totalResource = users.reduce((sum, u) => sum + u.resource, 0);

  // Remaining capacity for each user (in complexity points)
  // We'll use a soft cap: each user gets a proportional share of total work
  const totalWeeklyCost = activeTasks.reduce((sum, t) => sum + getTaskWeeklyCost(t), 0);

  const userCapacity: Record<string, number> = {};
  for (const user of users) {
    userCapacity[user.id] =
      totalResource > 0 ? (user.resource / totalResource) * totalWeeklyCost : 0;
  }

  // Sort tasks by cost descending (assign heavier tasks first for better balance)
  const sortedTasks = [...activeTasks].sort(
    (a, b) => getTaskWeeklyCost(b) - getTaskWeeklyCost(a)
  );

  const assignments: TaskAssignment[] = [];
  const unassigned: Task[] = [];

  for (const task of sortedTasks) {
    // Filter eligible users by task availability constraints
    const eligibleUsers = users.filter(
      (u) => task.availableFor.length === 0 || task.availableFor.includes(u.type)
    );

    if (eligibleUsers.length === 0) {
      unassigned.push(task);
      continue;
    }

    // Pick the eligible user with the most remaining capacity
    const best = eligibleUsers.reduce((prev, curr) =>
      (userCapacity[curr.id] ?? 0) > (userCapacity[prev.id] ?? 0) ? curr : prev
    );

    const cost = getTaskWeeklyCost(task);
    userCapacity[best.id] = (userCapacity[best.id] ?? 0) - cost;

    assignments.push({ taskId: task.id, assignedTo: best.id });
  }

  return { assignments, unassigned };
}

/**
 * Calculate how much resource (%) each user is actually using
 * based on their assigned tasks relative to their proportional share of total work.
 */
export function calculateResourceUsage(
  tasks: Task[],
  userId: string,
  userResource: number,
  allUsers: AssignableUser[]
): number {
  const activeTasks = tasks.filter((t) => t.isActive);
  const assignedCost = activeTasks
    .filter((t) => t.assignedTo === userId)
    .reduce((sum, t) => sum + getTaskWeeklyCost(t), 0);

  const totalCost = activeTasks.reduce((sum, t) => sum + getTaskWeeklyCost(t), 0);
  const totalResource = allUsers.reduce((s, u) => s + u.resource, 0);
  const userShare = totalResource > 0 ? (userResource / totalResource) * totalCost : 0;

  if (userShare === 0) return 0;
  return Math.min(100, Math.round((assignedCost / userShare) * 100));
}
