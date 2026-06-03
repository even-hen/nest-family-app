# Product Requirement Document (PRD): Nest
## Proportional Family Task Coordinator & Productivity Platform

---

## 1. Executive Summary & Overview

### 1.1 Product Vision
**Nest** is a premium, next-generation family productivity application designed to eliminate household conflict ("chore wars") through smart automation. Instead of rigid chore wheels or chaotic messaging threads, Nest implements a **capacity-aware task distribution system** that assigns household duties proportionally based on each family member's defined time capacity, age-based eligibility constraints, and task complexity.

### 1.2 Core Philosophy
Nest is structured around a few key guidelines:
1. **Proportional Load-Balancing**: Workload is distributed relative to available time (e.g., a member with 100% capacity takes double the task complexity of a member with 50% capacity).
2. **Age-Appropriate Safeguards**: Tasks are strictly filtered so children or teens are not assigned tasks meant for adults (e.g., driving or using heavy tools).
3. **Greedy Proportional Allocation**: Tasks are dynamically rotated each week using a greedy allocation strategy that ensures even distribution.
4. **Timezone-Aware Automation**: Background execution aligns task generation and distribution exactly to the local timezone of the group. The group's timezone is determined by the timezone of the group's creator (the user specified in `groups.created_by`).

---

## 2. Target Audience & Roles

The system supports three user types under the `UserType` definition, each with distinct access controls and interface capabilities:

| Role / User Type | Access & Actions Permitted | Visual Style |
| :--- | :--- | :--- |
| **Adult** | - Full administrative control.<br>- Create groups.<br>- Add, edit, deactivate, or delete tasks.<br>- Manually assign tasks or toggle automatic assignment.<br>- Edit any member's name, role, and capacity.<br>- Remove members from the group.<br>- Toggle group-wide auto-distribution setting.<br>- Generate member invitation codes.<br>- Complete any member's assignment.<br>- Run manual chore re-shuffling. | Sleek Indigo (`#6366F1`) |
| **Teen** | - View today's assignments (Filter: "Mine" or "All").<br>- Complete own assignments.<br>- Edit own name and capacity. | Refined Teal (`#0D9488`) |
| **Child** | - View today's assignments (Filter: "Mine" or "All").<br>- Complete own assignments.<br>- Edit own name and capacity. | Premium Rose (`#F43F5E`) |

---

## 3. Product Architecture & Technical Stack

Nest is developed as a cross-platform mobile application targeting iOS, Android, and Web browsers, with a serverless backend.

```
                  ┌─────────────────────────────────────────┐
                   │          Expo React Native App          │
                   │         (File Routing, Supabase)        │
                   └────────────────────┬────────────────────┘
                                       │
                         Supabase SDK (Auth & Database)
                                       │
                  ┌────────────────────▼────────────────────┐
                  │            Supabase Database            │
                  │  (PostgreSQL, Realtime, pg_cron Job)    │
                  └─────────────────────────────────────────┘
```

### 3.1 Technology Stack
- **Frontend Framework**: Expo SDK v55 (React Native `0.83.6` & React `19.2.0`)
- **Routing**: `expo-router` v55 (file-based tab bar and stack navigation)
- **Styling**: Customized React Native `StyleSheet.create()` with a centralized design token system (`colors.ts`) for spacing, radii, and theme palettes.
- **Database & Auth**: Supabase JS SDK & Supabase PostgreSQL database
- **Storage/Persistence**: Local AsyncStorage on mobile (iOS/Android) to persist the Supabase authentication session across app reloads.
- **Push Notifications**: Server-side push notification trigger utilizing the Expo Push API and stored `expo_push_token` to deliver Daily Summaries, Missed Task warnings, and Weekly Reports directly to user devices.
- **Backend Scheduler**: Supabase `pg_cron` & PostgreSQL PL/pgSQL database functions for weekly auto-distribution.

---

## 4. Database Schema & Data Models

The database schema matches the following PostgreSQL entities. All tables support real-time subscriptions where needed (especially `notifications`).

### 4.1 Users Table (`users`)
Stores profile metadata, authentication link, settings, and timezone settings.
- `id` (UUID, primary key): References Auth ID.
- `email` (Text): Member's email address.
- `name` (Text): Display name.
- `type` (Text: `'Adult' | 'Teen' | 'Child'`): Member's role.
- `resource` (Integer: `0–100`): Capacity percentage.
- `group_id` (UUID, nullable): Foreign key referencing `groups(id)`.
- `timezone` (Text): Current IANA timezone string (e.g. `'America/New_York'`).
- `notification_time` (Text): Formatted time string (e.g. `'09:00'`).
- `language` (Text: `'en' | 'ru'`): User's selected language.
- `theme` (Text: `'light' | 'dark'`): Chosen color theme.
- `expo_push_token` (Text, nullable): Device token for push messages.
- `created_at` (Timestamp): Record creation date.

### 4.2 Groups Table (`groups`)
Defines the family unit grouping.
- `id` (UUID, primary key): Unique group ID.
- `name` (Text): Household name (e.g. "The Smiths").
- `created_by` (UUID): Reference to the creator user ID.
- `auto_distribution` (Boolean): Global switch to rotate tasks weekly.
- `created_at` (Timestamp): Creation timestamp.

### 4.3 Invite Links Table (`invite_links`)
Allows joining groups via a temporary 8-character code.
- `token` (Text, primary key): 8-character uppercase token (e.g. `'A1B2C3D4'`).
- `group_id` (UUID): Group to join.
- `created_at` (Timestamp): Generation timestamp.
- `expires_at` (Timestamp): Code expiration threshold (24 hours).
- `used_by` (Array of UUIDs): List of user IDs who redeemed this token.

### 4.4 Tasks Table (`tasks`)
The master list of chores.
- `id` (UUID, primary key): Unique task ID.
- `group_id` (UUID): Group reference.
- `title` (Text): Task title.
- `emoji` (Text, nullable): Emoji icon.
- `complexity` (Integer, `1–100`): Cost weight.
- `week_days` (Array of Integers, `0=Sun, 1=Mon, ..., 6=Sat`): Active weekdays.
- `available_for` (Array of Text): Allowed roles (subset of `'Adult' | 'Teen' | 'Child'`).
- `assigned_to` (UUID, nullable): Current assignee.
- `auto` (Boolean): If `true`, the task is auto-distributed; if `false`, manually assigned.
- `is_active` (Boolean): Toggle status.
- `created_by` (UUID): Creator user ID.
- `created_at` (Timestamp): Creation timestamp.

### 4.5 Assignments Table (`assignments`)
The daily generated instances of tasks.
- `id` (UUID, primary key): Assignment ID.
- `task_id` (UUID): Reference to master task.
- `group_id` (UUID): Group reference.
- `title` (Text): Snapshotted task title.
- `complexity` (Integer): Snapshotted complexity.
- `week_days` (Array of Integers): Snapshotted week_days.
- `assigned_to` (UUID): Assigned member ID.
- `status` (Text: `'pending' | 'done' | 'skipped'`): Status of the task.
- `week_start` (Text): ISO date of Monday starting the week (e.g., `'2026-06-01'`).
- `date` (Text): ISO date of the specific day (e.g., `'2026-06-03'`).
- `done_at` (Timestamp, nullable): Completion timestamp.
- `skipped_at` (Timestamp, nullable): Expiration/skipping timestamp.

### 4.6 Notifications Table (`notifications`)
Tracks real-time alerts.
- `id` (UUID, primary key): Notification ID.
- `user_id` (UUID): Target user ID.
- `group_id` (UUID): Group ID.
- `title` (Text): Header text.
- `body` (Text): Description text.
- `type` (Text: `'daily_summary' | 'missed_task' | 'weekly_report'`): Category.
- `is_read` (Boolean): Read state.
- `created_at` (Timestamp): Alert time.

---

## 5. Functional Requirements & Core Flows

### 5.1 Onboarding & Authentication Flow

```
                      Onboarding Entry (index.tsx)
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
             Not Authenticated              Authenticated
                      │                           │
               [Login / Register]         Has groupId?
                 (+ Forgot Password)       ┌──────┴──────┐
              [Create / Join Group]        No           Yes
                      │                    │             │
                      └──────────────► Setup Group   Go to Tab bar
```

#### 5.1.1 Register & Login Screens
- **Form Fields**: Full name, Email, Password, User Type (Adult, Teen, Child), Capacity Slider (0–100).
- **Validation**: Email format validation (regex), Password min-length 6 characters, Name min-length 2 characters.
- **Forgot Password**: Login screen includes a "Forgot password?" link that triggers `supabase.auth.resetPasswordForEmail()` to send a reset email.
- **Capacity Custom Slider**:
  - Implemented using a native gesture handler (`PanResponder`) to allow dragging across a track.
  - Value changes in increments of 10.
  - Dynamically changes color based on range:
    - `0–30`: Coral Accent (`#FF6B6B`)
    - `31–70`: Mint Success (`#4ECDC4`)
    - `71–100`: Brand Violet (`#7C5CFC`)
- **Device Timezone Tracking**: During registration, detects local IANA timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone` and records it on the user profile.

#### 5.1.2 Group Setup (Create vs Join Group)
Upon signing up, if a user has no `group_id`, they are redirected to a Group Setup dashboard:
- **Option A: Create a Group**
  - Prompt user for a Group Name.
  - Automatically initializes the group in database.
  - Updates creator's profile with `group_id`.
  - **Auto-populate Default Tasks**: Inserts 26 standard household chores (e.g. vacuuming, washing dishes, setting table) with default complexities, active days, and age eligibility set to all roles.
- **Option B: Join a Group**
  - Prompt user for an invite code.
  - Validates token against active `invite_links`.
  - Checks if code is expired (within 24 hours).
  - Associates user with the group, registers user ID in the link's `used_by` log.

---

### 5.2 Today's Assignments Screen ("To Do" Tab)

The default dashboard showing chores assigned for today and yesterday.

#### 5.2.1 View Modes & Filters
- **Filter Switch**: A toggle bar with "Mine" and "All".
  - **Mine**: Lists only assignments where `assigned_to` matches current user ID.
  - **All**: Lists all assignments for the group. Shows assignee names.
- **Timeframes Displayed**:
  - **Pending**: Today's assignments with `status = 'pending'`, sorted by complexity ascending.
  - **Completed**: Today's assignments with `status = 'done'`, sorted by complexity ascending.
  - **Skipped**: Yesterday's assignments with `status = 'skipped' | 'pending'` (automatically marked as skipped).

#### 5.2.2 Actions & Permissions
- **Mark Done**:
  - Regular members (Teen/Child) can only tap "Mark Done" on their own assignments.
  - Adults can tap "Mark Done" on any member's assignments.
  - Action updates `status = 'done'` and records `done_at` timestamp.
- **Focus Refetching**: Uses `useFocusEffect` to reload tasks when the user returns to the screen.
- **Pull-to-Refresh**: All tab screens support pull-to-refresh via React Native `RefreshControl` for manual data re-fetching.
- **Server-Side Sweep**: A scheduled server-side database job sweeps and updates any past assignments where `date < today` and `status = 'pending'` to `status = 'skipped'`, setting `skipped_at = now()` directly in the database.

---

### 5.3 Members & Stats Screen ("Members" Tab)

Provides family logs, performance charts, and capacity management tools.

#### 5.3.1 Week Navigation
- A week selector allows browsing current and past weeks: "This Week" (offset=0), "Last Week" (offset=1), or "X Weeks Ago".

#### 5.3.2 Member Status Cards
Each group member is rendered in a status card:
- Displays member name (Title Case), role badge (color-coded), and a "You" badge if the member matches the current user.
- **Capacity Load Progress Bar**: Shows a relative usage bar based on current week assigned cost:
  - `Load % = (Assigned Task Cost / Proportional Resource Share) * 100`
  - Only rendered for the current week (`weekOffset === 0`).
- **Interactive Status Pills**: Four touchable pills displaying numbers:
  1. **Done** (Mint background) - Opens detail modal listing completed assignments.
  2. **Skipped** (Coral background) - Opens detail modal listing skipped assignments.
  3. **Pending** (Amber background) - Opens detail modal listing pending assignments.
  4. **Points** (Indigo background) - Displays total complexity score earned (`totalComplexityDone`).
- **Bottom Statistics**: Displays numeric capacity value and Load percentage.

#### 5.3.3 Detail Modal
- Triggered by clicking Done, Skipped, or Pending pills.
- Displays assignments grouped by day of the week, with date headers showing weekday, month, and day.
- Displays task title and complexity points.

#### 5.3.4 Member Configuration Modal
Accessed by clicking the edit icon (Adults edit anyone; Teens/Children only edit themselves):
- **Inputs**: Edit Name, User Role (Adults only can select Adult/Teen/Child), Capacity Slider.
- **Danger Action**: "Remove from Group" button (only visible to Adults editing other members). Clears the target's `group_id` in database.

---

### 5.4 Tasks / Schedule Screen ("Tasks" Tab)

A search-enabled control panel for setting up weekly household schedules.

#### 5.4.1 Task Search & Filters
- Contains a search input filtering tasks by title or current assignee's name.
- **Sorting Hierarchy**:
  1. Active tasks at the top, deactivated at the bottom.
  2. Descending order of total weekly cost (`complexity * active days count`).
  3. Alphabetical order by title.

#### 5.4.2 Task Management Modal
Adults can add or edit tasks:
- **Title**: String text input.
- **Complexity**: Input limiting values between 1 and 100.
- **Active Days**: Weekday selector (Mon–Sun chips). Highlights selected days.
- **Available For**: Select roles allowed to do this task.
- **Assigned To**: Selector allowing specific member assignment (static/manual assignment) or choosing "Auto" (automatic distribution).
- **Icon Selector**: Horizontal selection grid of 19 emojis (e.g. 🍳, 🧹, 🛒) with a green check dot fallback.
- **Active Switch**: Toggle switch to enable/disable the task.
- **Delete Task**: Triggers confirmation dialog. Deleting removes the task and automatically deletes any today/future pending assignments.

#### 5.4.3 Automatic Shuffling
- Adults can trigger a manual "Re-Shuffle" on the main schedule.
- Invokes the proportional task allocation engine on all active, auto-assigned tasks, and updates assignments in database for today/future.

---

### 5.5 Alerts & Notifications Screen ("Alerts" Tab)

A history log synced in real-time with database alerts.

- **Real-Time Synchronization**: Uses PostgreSQL channel subscriptions (`postgres_changes`) to instantly update unread counts and insert new alerts without polling.
- **Display Limit**: Requests and displays no more than the 20 most recent notifications to optimize load times and prevent list clutter.
- **Unread Badges**: Tab bar icon displays red dot if unread notifications exist.
- **Notification Types**:
  1. **Daily Summary**: Lists today's assigned tasks.
  2. **Missed Task**: Lists yesterday's skipped tasks.
  3. **Weekly Report**: Summarizes weekly performance metrics (Adults only).
- **Controls**: Tapping a notification marks it as read. Contains a "Mark all read" header button.
- **Auto-Scroll**: On initial load the list auto-scrolls to the bottom (most recent notifications), preserving the user's scroll position on subsequent updates.

---

### 5.6 Settings Screen ("Settings" Tab)

Allows toggling configuration options and group rules.

- **Profile Card**: Displays user avatar, name, email, role, and capacity details.
- **Notification Time Dropdown**: 24-hour selector (`00:00` to `23:00` in hourly increments) to configure morning/evening notification schedules.
- **Timezone Selector**: Dropdown of 27 standard timezones allowing manual override.
- **Group Settings (Adults Only)**: Toggle switch for `auto_distribution` to manage weekly cron task rotations.
- **Invite Code Generator (Adults Only)**: Generates a random 8-character uppercase code copied to clipboard, valid for 24 hours.
- **Theme Toggle**: Light vs Dark mode theme switch.
- **Danger Zone**:
  - **Leave Group**: Clears `group_id` association.
  - **Sign Out**: Logs user out of the application.

---

## 6. Core Algorithms & Engines

### 6.1 Proportional Task Allocation Engine
The core algorithm distributing tasks (`src/lib/distribution.ts` and Supabase SQL function) operates as follows:

1. **Calculate Weekly Task Cost**:
   $$\text{Cost} = \text{Complexity} \times \text{Number of Active Weekdays}$$
2. **Determine Target Capacities**:
   $$\text{Total Resource} = \sum_{u \in \text{Users}} u.\text{resource}$$
   $$\text{Total Weekly Cost} = \sum_{t \in \text{Tasks}} \text{Cost}(t)$$
   $$\text{User Target Capacity} = \left(\frac{u.\text{resource}}{\text{Total Resource}}\right) \times \text{Total Weekly Cost}$$
3. **Phase 1: Reserve Manual Assignments**:
   - For all active, manually assigned tasks, subtract the cost from the assignee's remaining capacity.
4. **Phase 2: Distribute Auto-Tasks**:
   - Filter active, auto-assigned tasks. Sort them by weekly cost in descending order.
   - When triggered as a manual "Re-Shuffle", a `randomize` parameter adds jitter to the sorting order, preventing identical distributions across consecutive shuffles.
   - For each task:
     - Identify eligible users matching the role requirements in `availableFor`.
     - Assign the task to the eligible user who holds the **highest remaining capacity** (Greedy Strategy):
       $$\text{Remaining Capacity} = \text{User Target Capacity} - \text{Allocated Points}$$
     - Subtract the task cost from that user's capacity.
     - Save the user as the task's current assignee.

---

### 6.2 Weekly Cron Job (`supabase_setup.sql`)
A weekly PostgreSQL background job runs automatically via pg_cron.

- **Trigger**: Every Monday at 01:00 UTC (running hourly to match local group timezones).
- **Workflow**:
  1. Checks all active groups.
  2. Resolves the group's local timezone by looking up the timezone of the group's creator (`groups.created_by`).
  3. Ensures assignments have not already been generated for the current week start in their local timezone.
  4. Checks if weekly task rotation (`groups.auto_distribution`) is enabled:
     - **If Enabled**: Executes the proportional task allocation algorithm to distribute active, auto-assigned tasks among eligible group members.
     - **If Disabled**: Directly generates assignments for already assigned tasks based on each task's existing static assignee (`tasks.assigned_to`) without mixing or redistributing them. The allocation algorithm is only used as a fallback if a task is set to auto but currently has no assignee.
  5. Generates daily `pending` assignments for each active weekday of tasks in the group.
  6. Inserts in-app notifications (`daily_summary` type) for each user containing their count of scheduled weekly tasks.

---

### 6.3 Server-Side Push Notification System
Maintains device alerts by running entirely on the server side to ensure sync consistency and accuracy across timezone boundaries.

- **Trigger**: Runs on a scheduled background worker/cron job (e.g., hourly).
- **Execution Flow**:
  1. Queries all users whose profile `notification_time` (e.g. `"09:00"`) matches the current local time in their respective `timezone`.
  2. Compiles relevant data for push notifications:
     - **Daily Chores**: Today's pending assignments for the user.
     - **Yesterday's Skipped Chores**: Any assignments for the user that remained 'pending' from yesterday and were swept to 'skipped'.
     - **Weekly Missed Report**: On Monday mornings, compiles group-wide statistics on skipped tasks for `Adult` users.
  3. Sends notification alerts to the user's device via the Expo Push Notification service using their stored `expo_push_token`.
  4. Writes the notifications directly to the `notifications` database table, keeping the in-app Alerts tab fully synchronized with push notifications.

---

### 6.4 Server-Side Assignments Sweep Job
Ensures past pending tasks are marked as skipped in a consistent, timezone-aware manner.

- **Trigger**: Runs on a scheduled background worker/cron job (e.g., daily at midnight or hourly).
- **Execution Flow**:
  1. Identifies all active groups.
  2. Resolves each group's local timezone (based on the user who created the group `groups.created_by`).
  3. Detects if midnight has passed in the group's local timezone.
  4. Runs a database update query on all assignments associated with that group:
     - Updates `status = 'skipped'` and `skipped_at = NOW()` for any records where `status = 'pending'` and the assignment's `date` is strictly prior to today's date in the group's local timezone (`date < today`).

---

## 7. Design System & Aesthetics

### 7.1 Visual Theme Definitions
Nest uses Outfit typography and balanced colors. Theme palettes support Light and Dark modes:

| Color Token | Light Theme Value | Dark Theme Value | Purpose |
| :--- | :--- | :--- | :--- |
| `primary` | `#7C5CFC` | `#7C5CFC` | Main brand color (Deep Violet) |
| `accent` | `#FF6B6B` | `#FF6B6B` | Error / Alert / Skipped status |
| `success` | `#4ECDC4` | `#4ECDC4` | Success / Complete status |
| `warning` | `#FFB347` | `#FFB347` | Pending status |
| `bg` | `#F5F5F7` | `#0F0E1A` | Main page background |
| `bgCard` | `#FFFFFF` | `#1A1828` | Main content card background |
| `bgCardAlt`| `#F0F0F3` | `#221F35` | Alternative/unread container bg |
| `bgInput` | `#EAEAEF` | `#2A2640` | Form input fields |
| `border` | `#D1D1D6` | `#2E2A45` | Structural borders |
| `textPrimary`| `#1C1C1E` | `#F0EEFF` | Main headers and labels |
| `textSecondary`| `#3A3A3C` | `#9B97C0` | Supporting text |
| `textMuted` | `#8E8E93` | `#5E5A80` | Placeholder / Disabled text |

### 7.2 Styling Guidelines
- **Typography**: Outfit font family configured globally (Web via CSS `@import`, native via `expo-font`).
- **Layout Spacing**: Standard spacing tokens: `xs=4`, `sm=8`, `md=16`, `lg=24`, `xl=32`.
- **Border Radii**: Smooth rounded corners: `sm=8`, `md=12`, `lg=16`, `xl=24`, `full=9999`.
- **Safe Area Insets**: Safe area margins applied dynamically on screens using `useSafeAreaInsets` to adjust header padding under hardware notches, status bars, and camera holes on iOS/Android.
- **Web Platform Compatibility**: A cross-platform `AppAlert` utility wraps `Alert.alert` on native and falls back to `window.confirm`/`window.alert` on web, ensuring consistent dialog behavior across all platforms.
