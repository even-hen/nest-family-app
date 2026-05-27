export type UserType = 'Adult' | 'Teen' | 'Child';

export type AssignmentStatus = 'pending' | 'done' | 'skipped';

export interface User {
  id: string;
  email: string;
  name: string;
  type: UserType;
  resource: number; // 0-100
  groupId: string | null;
  timezone: string;
  notificationTime: string; // e.g. "09:00"
  language: 'en' | 'ru';
  theme?: 'light' | 'dark';
  createdAt: Date;
}

export interface Group {
  id: string;
  name: string;
  createdBy: string; // userId
  createdAt: Date;
  autoDistribution: boolean;
  inviteLinks: InviteLink[];
}

export interface InviteLink {
  token: string;
  createdAt: Date;
  expiresAt: Date;
  usedBy: string[]; // userIds who used this link
}

export interface Task {
  id: string;
  groupId: string;
  title: string;
  emoji?: string | null;
  complexity: number; // 1-100
  weekDays: number[]; // 0=Sun..6=Sat (active weekdays for scheduling)
  availableFor: UserType[]; // which user types can be assigned
  assignedTo: string | null; // userId or null (unassigned)
  auto: boolean; // true if auto assignee is enabled, false if manually assigned
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface Assignment {
  id: string;
  taskId: string;
  groupId: string;
  title: string;
  complexity: number;
  weekDays: number[];
  assignedTo: string; // userId
  status: AssignmentStatus;
  weekStart: string; // ISO date of week's Monday (for weekly grouping)
  date: string; // ISO date of the specific day
  doneAt: Date | null;
  skippedAt: Date | null;
}

export interface Notification {
  id: string;
  userId: string;
  groupId: string;
  title: string;
  body: string;
  type: 'daily_summary' | 'missed_task' | 'weekly_report';
  isRead: boolean;
  createdAt: Date;
}

export interface WeekStats {
  userId: string;
  userName: string;
  weekStart: string;
  totalAssigned: number;
  totalDone: number;
  totalSkipped: number;
  resourceUsed: number; // sum of complexity of done tasks
  resourceCapacity: number; // user's resource %
}
