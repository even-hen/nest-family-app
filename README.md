# 🪺 Nest — Premium Family Task & Productivity App

<div align="center">
  <img src="./assets/images/logo-glow.png" width="120" height="120" alt="Nest Logo" />
  <h3>Coordinated, Proportional, and Stress-Free Family Task Distribution</h3>
  <p>Built with Expo (SDK 55), React Native, NativeWind, and Firebase V2 Cloud Functions.</p>
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

### 2. ⏰ Timezone-Aware Weekly Cron Cloud Function
Located in [`functions/index.js`](file:///d:/Google%20Antigravity/Nest-your-family-team/nest-app/functions/index.js), this background engine manages auto-distribution:
* **Local Time Trigger**: Runs every hour to check active groups.
* **Administrator-Aligned Clock**: Resolves the exact local timezone of the group's `Adult` administrator.
* **Midnight Transition**: Triggers task generation and fresh distributions precisely at **Monday, 01:00 AM** in their local timezone.
* **Failure Alerts**: Sends active system notifications to adult members if a distribution fails due to capacity overruns or unfulfilled constraints.

### 3. 🔔 Rolling Local Push Notification Synchronizer
Located in [`src/lib/notifications.ts`](file:///d:/Google%20Antigravity/Nest-your-family-team/nest-app/src/lib/notifications.ts):
* Automatically clears outdated pending device alerts to prevent clutter.
* Schedules daily morning/evening summaries for upcoming tasks over a rolling 7-day window.
* Schedules a **Weekly Missed Tasks Report** for adult administrators every Monday morning to review skipped items from the prior week.

### 4. 🎨 Premium Dynamic Theme System
Built on React Context & NativeWind:
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
* **Database & Auth**: Firebase SDK `^12.13.0` & Firebase Firestore
* **Backend Functions**: Firebase Functions V2 (Node.js runtime environment)
* **Animations**: `react-native-reanimated` `4.2.1` & `react-native-worklets`

---

## 🏗️ Project Architecture Map

The application code is cleanly partitioned into a modern, easy-to-navigate layout:

```
nest-app/
├── assets/                 # App icons, splash screens, and image assets
├── functions/              # Backend Firebase Functions V2 Environment
│   ├── index.js            # Main weekly task auto-distribution cron
│   └── package.json        # Cloud functions dependencies
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
    ├── lib/                # core algorithms & third-party connectors (Firebase, Distribution)
    ├── types/              # TypeScript interface and type declarations
    └── utils/              # Pure utility helpers (calendar functions, color translators)
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
Ensure you have Node.js (v18+) and the Firebase CLI installed globally:
```bash
npm install -g firebase-tools
```

### 2. Install Project Dependencies
Run `npm install` inside the root `/nest-app` directory to set up the Expo project:
```bash
npm install
```

### 3. Environment Configuration
Create a local `.env` file in the root directory by copying the example template:
```bash
cp .env.example .env
```
Open `.env` and enter your Firebase web configuration keys retrieved from the [Firebase Console](https://console.firebase.google.com/):
```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain_url
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket_url
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
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

### 5. Running Firebase Local Emulators
To run and debug Cloud Functions and Firestore locally during development:
1. Navigate to the functions directory: `cd functions`
2. Install functions dependencies: `npm install`
3. Launch emulators:
   ```bash
   firebase emulators:start
   ```
> **Note**: Connection logic in `src/lib/firebase.ts` will automatically detect if a local emulator suite is running and route development database requests there.

---

## 🚨 Key Architecture & Developer Gotchas

Before making changes, please keep the following critical implementations in mind:

1. **Authentication Session Persistence**: Standard Firebase `getAuth()` will lose authentication states across app reloads on mobile devices. Ensure you use the optimized platform-specific initialization inside [`src/lib/firebase.ts`](file:///d:/Google%20Antigravity/Nest-your-family-team/nest-app/src/lib/firebase.ts), which uses an `AsyncStorage` backend on iOS/Android.
2. **Thread Safe Reanimated Updates**: When executing React state updates inside a `react-native-reanimated` callback (such as triggering dynamic icons or sliders), always wrap the update using `scheduleOnRN` from `react-native-worklets` to transition work off the UI thread and onto the JS main thread safely.
3. **Optimizing Database Hits**: Always execute major state changes (such as weekly task auto-allocations or deleting active rosters) utilizing **Firestore Batches** (`writeBatch(db)`) to keep database access atomic and extremely cost-efficient.
4. **Tab Focus Lifecycle**: The main application tabs reload data dynamically upon gaining active focus. If you are adding data-fetching methods, hook them into `useFocusEffect` combined with `useCallback` to prevent stale UI screens.
