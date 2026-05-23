import { Task, UserType } from '../types';

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
  users: AssignableUser[],
  randomize: boolean = false
): { assignments: TaskAssignment[]; unassigned: Task[] } {
  if (users.length === 0) {
    return {
      assignments: [],
      unassigned: tasks.filter((t) => t.isActive),
    };
  }

  const activeTasks = tasks.filter((t) => t.isActive);

  // Calculate total resource units across all users
  const totalResource = users.reduce((sum, u) => sum + Number(u.resource || 0), 0);

  // Remaining capacity for each user (in complexity points)
  const totalWeeklyCost = activeTasks.reduce((sum, t) => sum + getTaskWeeklyCost(t), 0);

  const userCapacity: Record<string, number> = {};
  for (const user of users) {
    userCapacity[user.id] =
      totalResource > 0 ? (Number(user.resource || 0) / totalResource) * totalWeeklyCost : 0;
  }

  const assignments: TaskAssignment[] = [];
  const unassigned: Task[] = [];

  // Separate tasks: manual (auto = false) and auto (auto = true)
  const manualTasks = activeTasks.filter((t) => !t.auto);
  const autoTasks = activeTasks.filter((t) => t.auto);

  // 1. Process manual assignments first (occupy capacities)
  for (const task of manualTasks) {
    if (task.assignedTo) {
      const cost = getTaskWeeklyCost(task);
      userCapacity[task.assignedTo] = (userCapacity[task.assignedTo] ?? 0) - cost;
      assignments.push({ taskId: task.id, assignedTo: task.assignedTo });
    } else {
      unassigned.push(task);
    }
  }

  // 2. Sort auto tasks by cost descending (with slight jitter if mixing)
  const sortedAutoTasks = [...autoTasks].sort((a, b) => {
    const diff = getTaskWeeklyCost(b) - getTaskWeeklyCost(a);
    return randomize ? diff + (Math.random() - 0.5) * 10 : diff;
  });

  // 3. Process auto assignments
  for (const task of sortedAutoTasks) {
    // Filter eligible users by task availability constraints
    const eligibleUsers = users.filter(
      (u) => task.availableFor.length === 0 || task.availableFor.includes(u.type)
    );

    if (eligibleUsers.length === 0) {
      unassigned.push(task);
      continue;
    }

    if (randomize) {
      eligibleUsers.sort(() => Math.random() - 0.5); // Randomize array for exact capacity ties
    }

    // Pick the eligible user with the most remaining capacity
    const best = eligibleUsers.reduce((prev, curr) => {
      const capCurr = (userCapacity[curr.id] ?? 0) + (randomize ? (Math.random() - 0.5) * 5 : 0);
      const capPrev = (userCapacity[prev.id] ?? 0) + (randomize ? (Math.random() - 0.5) * 5 : 0);
      return capCurr > capPrev ? curr : prev;
    });

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
  const totalResource = allUsers.reduce((s, u) => s + Number(u.resource || 0), 0);
  const userShare = totalResource > 0 ? (Number(userResource || 0) / totalResource) * totalCost : 0;

  if (userShare === 0) return 0;
  return Math.round((assignedCost / userShare) * 100);
}
