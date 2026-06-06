# 🪺 Nest — Premium Family Task & Productivity App

<div align="center">
  <img src="./assets/images/android-icon-monochrome.png" width="240" height="240" alt="Nest Logo" />
  <h3>Coordinated, Proportional, and Stress-Free Family Task Distribution</h3>
  <p>Built with Expo (SDK 55), React Native, NativeWind, and Supabase (PostgreSQL, pg_cron & PL/pgSQL database functions).</p>
</div>

---

## 📖 Overview

**Nest** is a next-generation family productivity application designed to end the "chore wars." Instead of static chore wheels or messy group chats, Nest uses a smart, **greedy proportional allocation engine** to distribute household tasks fairly based on each family member's available time resource capacity, age constraints, and weekly task complexity.

With full support for high-fidelity animations, automatic timezone-aware weekly distributions, local rolling notifications, and premium light/dark dynamic styling, Nest makes keeping up with home tasks elegant and effortless.

---

## ✨ Core Features & Engines

### 1. 🧮 Proportional Task Allocation Engine
Located in [`src/lib/distribution.ts`](file:///d:/Google%20Antigravity/Nest-your-family-team/nest-app/src/lib/distribution.ts), this engine automates chore balancing across the household:
* **Capacity-Proportional Assignment**: Each member defines their capacity percentage. High-capacity members are systematically allocated a proportionally higher share of task complexity points.
* **Age-Appropriate Filtering**: Tasks can restrict eligibility (e.g., `Adult`, `Teen`, `Child`). The engine strictly honors these constraints.
* **Complexity & Frequency Balance**: Task "cost" is defined as `complexity * scheduled_days_per_week`.
* **Greedy Allocation Strategy**: Manual tasks are locked first, then auto-tasks are sorted by cost descending and allocated to the eligible member who currently holds the highest remaining proportional capacity.

### 2. ⏰ Timezone-Aware Weekly Cron & Notifications
Located in [`scripts/supabase_setup.sql`](file:///d:/Google%20Antigravity/Nest-your-family-team/nest-app/scripts/supabase_setup.sql), server-side weekly task distribution and push notifications run via PostgreSQL functions and `pg_cron`:
* **Local Time Trigger**: Runs every hour to check active groups.
* **Administrator-Aligned Clock**: Resolves the exact local timezone of the group's `Adult` administrator.
* **Midnight Transition**: Triggers task generation and fresh distributions precisely at **Monday, 01:00 AM** in their local timezone.
* **Push Notification Dispatcher**: Sends in-app database alerts and push notifications (via `pg_net` to Expo's Push service) for daily summaries, yesterday's missed tasks, and weekly performance reports at the user's preferred time.
* **Duplicate Prevention**: Incorporates `not exists` validation on insertion to guarantee users never receive duplicate database alerts.

### 3. 🔔 Rolling Local Push Notification Synchronizer
Located in [`src/lib/notifications.ts`](file:///d:/Google%20Antigravity/Nest-your-family-team/nest-app/src/lib/notifications.ts):
* Automatically clears outdated pending device alerts to prevent clutter.
* Schedules daily morning/evening summaries for upcoming tasks over a rolling 7-day window.
* Schedules a **Weekly Missed Tasks Report** for adult administrators every Monday morning to review skipped items from the prior week.
* **Offline-Ready Deduplication**: Compares server-sent notifications to prevent duplicate push banners when the user opens the app, and skips local scheduling for today if a database summary already exists.

### 4. 🎨 Premium Dynamic Theme and Layout System
Built on React Context, NativeWind, and React Native Safe Area Context:
* **Dynamic Safe Area Header Spacing**: Utilizes a root-level `SafeAreaProvider` and `useSafeAreaInsets` to dynamically scale the top padding of main tab headers, ensuring perfect, responsive spacing under hardware notches, status bars, and dynamic islands on iOS/Android, with clean spacious defaults on web.
* Full automatic and manual switching between light and dark visual aesthetics.
* Custom font typography using the premium **Outfit** font family.
* Micro-animations designed using `react-native-reanimated` (including web-safe loaders).

### 5. 🧼 Chore Emojis & Custom Iconography
* **Curated Household Chores Selector**: Allows assigning quick-select custom emojis (such as cooking `🍳`, cleaning `🧹`, gardening `🌱`, pet care `🐕`, and laundry `🧺`) to tasks.
* **Smart Fallbacks**: Automatically maintains clean, type-safe active/inactive status indicator fallback dots if no custom icon emoji is chosen.
* **Unified Layout Alignment**: Coordinated across both **Schedule** and **Today's Assignments (To Do)** lists, complete with vertically centered pixel-perfect margins.

---

## 🛠️ Technology Stack

* **Frontend Framework**: Expo SDK `~55.0.25` (React Native `0.83.6` & React `19.2.0`)
* **Routing**: `expo-router` `~55.0.15` (structured file-based navigation)
* **Styling**: `nativewind` `^4.2.4` (Tailwind CSS v3 engine optimized for React Native rendering)
* **Local State**: Context API & `zustand`
* **Database & Auth**: Supabase JS SDK (`@supabase/supabase-js`) & Supabase Auth
* **Backend Scheduler**: Supabase `pg_cron` & PostgreSQL PL/pgSQL database functions
* **Animations**: `react-native-reanimated` `4.2.1` & `react-native-worklets`

---

## 🏗️ Project Architecture Map

The application code is cleanly partitioned into a modern, easy-to-navigate layout:

```
nest-app/
├── assets/                 # App icons, splash screens, and image assets
├── scripts/                # Database and backend scripts
│   ├── supabase_setup.sql  # Database tables, policies, triggers, and pg_cron triggers
│   └── reset-project.js    # Project reset utility
└── src/                    # Primary Frontend Application Codebase
    ├── app/                # File-based navigation (expo-router)
    │   ├── _layout.tsx     # Application root layout, global context wrappers
    │   ├── index.tsx       # Auth-aware entry redirector
    │   ├── (auth)/         # Unauthenticated onboarding flow (Login, Signup, Group Creation)
    │   └── (tabs)/         # Main Authenticated Tab Navigation:
    │                       #   - Assignments, Members & Stats, Notifications, Settings, Tasks
    ├── components/         # Reusable UI component library (atomic layout blocks)
    ├── constants/          # central styling definitions (Colors, Radius, Spacers)
    ├── contexts/           # React Context providers (AuthContext, ThemeContext)
    ├── hooks/              # Global custom hooks (e.g. use-theme)
    ├── lib/                # core algorithms & third-party connectors (Supabase, Distribution)
    ├── types/              # TypeScript interface and type declarations
    └── utils/              # Pure utility helpers (calendar functions, color translators)
```

---

## 🚀 Quick Start Guide

### 1. Install Project Dependencies
Run `npm install` inside the root `/nest-app` directory to set up the Expo project:
```bash
npm install
```

### 2. Database Migration Setup
1. Log in to your [Supabase Console](https://supabase.com/).
2. Open the **SQL Editor** in your database dashboard.
3. Paste the contents of [`scripts/supabase_setup.sql`](file:///d:/Google%20Antigravity/Nest-your-family-team/nest-app/scripts/supabase_setup.sql) and run it to create tables, indexes, RLS policies, PostgreSQL triggers, and `pg_cron` scheduler jobs.

### 3. Environment Configuration
Create a local `.env` file in the root directory by copying the example template:
```bash
cp .env.example .env
```
Open `.env` and enter your Supabase credentials:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Running the Dev Server
Launch your Expo server to test the app on multiple platforms:
```bash
# General start
npx expo start

# Run directly on your platform of choice
npm run android    # Start Android Emulator
npm run ios        # Start iOS Simulator
npm run web        # Start Web Development Server
```

---

## 🚨 Key Architecture & Developer Gotchas

Before making changes, please keep the following critical implementations in mind:

1. **Authentication Session Persistence**: Standard Supabase `auth` will lose authentication states across app reloads on mobile devices. Ensure you use the optimized client setup in [`src/lib/supabase.ts`](file:///d:/Google%20Antigravity/Nest-your-family-team/nest-app/src/lib/supabase.ts), which uses an `AsyncStorage` backend on iOS/Android.
2. **Thread Safe Reanimated Updates**: When executing React state updates inside a `react-native-reanimated` callback (such as triggering dynamic icons or sliders), always wrap the update using `scheduleOnRN` from `react-native-worklets` to transition work off the UI thread and onto the JS main thread safely.
3. **Tab Focus Lifecycle**: The main application tabs reload data dynamically upon gaining active focus. If you are adding data-fetching methods, hook them into `useFocusEffect` combined with `useCallback` to prevent stale UI screens.
4. **Timezone Offset Defaults**: Avoid `timezone('utc'::text, now())` inside database defaults for `timestamptz` columns. Use `now()` to let Postgres handle timezone-aware UTC mapping natively, protecting against local session parameter overrides.
