import { User, Group, Task, Assignment, Notification } from '../types';

export function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    type: row.type,
    resource: row.resource,
    groupId: row.group_id,
    timezone: row.timezone,
    notificationTime: row.notification_time,
    language: row.language,
    theme: row.theme,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  };
}

function mapGroup(row: any): Group {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    autoDistribution: row.auto_distribution,
    inviteLinks: [], // invite links will be fetched separately from the invite_links table if needed
  };
}

export function mapTask(row: any): Task {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    emoji: row.emoji,
    complexity: row.complexity,
    weekDays: row.week_days || [],
    availableFor: row.available_for || [],
    assignedTo: row.assigned_to,
    auto: row.auto,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  };
}

export function mapAssignment(row: any): Assignment {
  return {
    id: row.id,
    taskId: row.task_id,
    groupId: row.group_id,
    title: row.title,
    complexity: row.complexity,
    weekDays: row.week_days || [],
    assignedTo: row.assigned_to,
    status: row.status,
    weekStart: row.week_start,
    date: row.date,
    doneAt: row.done_at ? new Date(row.done_at) : null,
    skippedAt: row.skipped_at ? new Date(row.skipped_at) : null,
  };
}

function mapNotification(row: any): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    groupId: row.group_id,
    title: row.title,
    body: row.body,
    type: row.type,
    isRead: row.is_read,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  };
}
