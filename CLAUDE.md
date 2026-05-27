# 🚀 CLAUDE.md — Agent & Developer Guide for Nest App

Welcome! This guide is designed for **LLM agents** (and human developers) to quickly understand the architecture, commands, code style, and algorithms of **Nest** — a premium family productivity and task coordination app built with Expo, React Native, and Firebase.

---

## ⚠️ CRITICAL RULES & ENVIRONMENT STACK

> [!IMPORTANT]
> **Expo SDK v55 is required.**
> The Expo platform has significant version-specific updates. You **MUST** read and adhere to the exact versioned docs at [https://docs.expo.dev/versions/v55.0.0/](https://docs.expo.dev/versions/v55.0.0/) before writing, modifying, or refactoring any code.

### Tech Stack
- **Frontend Framework**: Expo SDK `~55.0.25` (React Native `0.83.6` & React `19.2.0`)
- **Routing**: `expo-router` `~55.0.15` (file-based navigation)
- **Styling**: `nativewind` `^4.2.4` (Tailwind CSS v3 utility classes with Tailwind CSS config presets) and dynamically themed stylesheets
- **State & Context**: Context API (`AuthContext`, `ThemeContext`) and `zustand`
- **Database / Auth**: Firebase SDK `^12.13.0` & Firebase Firestore
- **Backend / Scheduler**: Firebase Functions V2 (Cloud Functions)
- **Animation**: `react-native-reanimated` `4.2.1` and `react-native-worklets`

---

## 💻 CLI CHEAT SHEET

### Frontend Commands (Run in the root `/nest-app` directory)
- **Install Dependencies**: `npm install`
- **Start Expo Dev Server**: `npx expo start` (or `npm start`)
- **Run on Android Emulator**: `npm run android` (or `npx expo start --android`)
- **Run on iOS Simulator**: `npm run ios` (or `npx expo start --ios`)
- **Run on Web Browser**: `npm run web` (or `npx expo start --web`)
- **Run ESLint/Linting**: `npm run lint` (or `npx expo lint`)
- **Reset Project Starter Code**: `npm run reset-project`

### Firebase Functions Commands (Run in `/nest-app/functions` directory)
- **Run Local Emulators**: `firebase emulators:start` (highly recommended for local testing; see connection setup in `src/lib/firebase.ts`)
- **Deploy Cloud Functions**: `firebase deploy --only functions`

---

## 🏗️ DIRECTORY & ARCHITECTURE MAP

```
nest-app/
├── app.json                # Expo config (custom plugins, package identifier com.even_hen.nestapp)
├── babel.config.js         # Babel presets (NativeWind plugin configuration)
├── tailwind.config.js      # Tailwind configuration with NativeWind preset
├── functions/              # Firebase Functions V2 environment
│   ├── index.js            # Main background cron for weekly auto-distribution
│   └── package.json        # Cloud functions dependencies
└── src/                    # Primary application codebase
    ├── app/                # File-based routing (expo-router)
    │   ├── _layout.tsx     # App root layout, context wrappers
    │   ├── index.tsx       # Authentication-aware dynamic entry redirector
    │   ├── (auth)/         # Unauthenticated group: login, register, setup-group
    │   └── (tabs)/         # Authenticated tab-bar: assignments, notifications, settings, stats, tasks
    ├── components/         # Shared UI components
    │   ├── ui/             # Atomic/modular UI components (e.g., collapsible)
    │   ├── animated-icon.tsx# React Native Reanimated web-safe custom loader
    │   └── themed-text.tsx # Base components honoring current theme styles
    ├── constants/          # Predefined configurations
    │   └── colors.ts       # Central theme colors (lightColors and darkColors), Radii, Spacing
    ├── contexts/           # React context wrappers
    │   ├── AuthContext.tsx # Firebase Authentication & local device sync
    │   └── ThemeContext.tsx# Dynamic light/dark styling toggles & DB persistence
    ├── hooks/              # Standard utility hooks
    │   └── use-theme.ts    # Easy access to app colors & theme status
    ├── lib/                # Core libraries & engine logic
    │   ├── firebase.ts     # Platform-optimized Firebase initialization
    │   ├── distribution.ts # Greedy proportional task allocation engine
    │   └── notifications.ts# Local push/device notification synchronizer
    ├── types/              # TypeScript typings
    │   └── index.ts        # Database schemas and shared system interfaces
    └── utils/              # Utility helpers
        ├── colors.ts       # Shared user type to badge color mappings
        └── date.ts         # Centralized time-aware calendar algorithms (e.g. getMondayISO)
```

---

## 🎨 CODE STYLE & CONVENTIONS

### 1. TypeScript & Structural Standards
- **Use TypeScript Strict Mode**: Never use `any` unless absolutely unavoidable. Add correct typings for all variables, props, and callbacks.
- **Interfaces vs Types**:
  - Use `interface` for Firestore schemas, model definitions, and React component props (e.g., `interface User`, `interface Task`).
  - Use `type` for unions, simple aliases, and enums (e.g., `type UserType = 'Adult' | 'Teen' | 'Child'`).
- **Path Aliasing**: Always use `@/` to import files from the `/src` directory (e.g., `import { db } from '@/lib/firebase'`).

### 2. Styling Standards (NativeWind & Custom Themes)
- **Dynamic Theming**: Always consume colors from the `useAppTheme()` hook to ensure light/dark support.
  ```tsx
  const { Colors } = useAppTheme();
  ```
- **Combine Tailwind & Stylesheets**:
  - Prefer Tailwind CSS classes via `className` for quick visual controls and responsive structures.
  - Fall back to standard React Native `StyleSheet.create` combined with `useMemo` when calculating dynamic layout dimensions or using custom system colors that Tailwind cannot resolve directly.
- **Typography**: Utilize Outfit font family as configured in `src/global.css`.

### 3. Component & Focus State Pattern
- **Page Transitions**: Tab screens use `useFocusEffect` combined with `useCallback` to trigger data re-fetching upon gain of focus:
  ```tsx
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );
  ```

---

## 🔄 CORE ALGORITHMS & ENGINES

### 1. The Greedy Proportional Task Distribution Engine (`src/lib/distribution.ts`)
- **Rules**:
  1. Only active tasks are automatically distributed.
  2. Tasks with restriction types (`availableFor`) are strictly assigned to matching member types (`Adult` | `Teen` | `Child`).
  3. Cost of task = `complexity * number of scheduled active weekDays` (e.g., 10 complexity * 3 days active = 30 pts/week).
  4. Distribution is proportional to each user's `resource` capacity percentage (e.g., higher resource % gets a proportionally larger share of total week-cost).
- **Strategy**:
  - Sort manual tasks (`auto = false`) first and reserve capacity.
  - Sort auto tasks (`auto = true`) descending by cost.
  - Sequentially assign each auto-task to the eligible member who has the **highest remaining proportional capacity** (greedy choice).

### 2. Hourly Timezone-Aware Weekly Cron (`functions/index.js`)
- Cloud Function runs hourly (`0 * * * *`).
- Iterates over all active groups that have `autoDistribution` enabled.
- Resolves the local timezone of the group's `Adult` administrator.
- Triggers weekly task generation and distribution exactly at **Monday, 01:00 AM local time** for each group's individual timezone.
- Creates daily `pending` assignments for each scheduled day and updates task assignments.
- Sends notifications to all adults if any tasks could not be assigned (capacity overrun or constraint mismatches).

### 3. Local Push Notification Synchronizer (`src/lib/notifications.ts`)
- Schedules rolling local notifications directly on the user's mobile device.
- Standard flow:
  1. Cancels all past pending device notifications to prevent duplicates.
  2. Parses the user's notification time preference (e.g., `"09:00"`).
  3. Schedules **Daily Summaries** for the next 7 days indicating the specific tasks due today.
  4. For `Adult` members, compiles a **Weekly Missed Tasks Report** detailing skipped tasks from the previous week and schedules it for next Monday at their preferred time.
  5. Schedules **Yesterday's Skipped Tasks** alert only if the trigger time is in the future. This avoids sending immediate push notification banners on every app start, relying on the **Alerts tab** for inside-the-app notification delivery.

---

## 🚨 KEY GOTCHAS & SOLUTIONS

### 1. Platform-Specific Firebase Persistence
Directly calling `getAuth()` on mobile platforms will not persist sessions across app reloads.
- **Web**: Defaults to standard browserLocalPersistence.
- **Mobile (iOS/Android)**: Must initialize authentication explicitly with an `AsyncStorage` backend inside `src/lib/firebase.ts`.

### 2. Batch Firestore Updates
When modifying many documents simultaneously (such as creating weekly assignments or shuffling task distributions), always use Firestore **batches** (`writeBatch(db)`) to ensure atomic completions and minimal network overhead.

### 3. React Native Worklets for Animating UI
When scheduling state updates inside a Native React Native Reanimated callback, you must invoke `scheduleOnRN` from `react-native-worklets` to transition state safely off the UI thread and onto the JS main thread (see `src/components/animated-icon.tsx`).

### 4. GitHub Pages Asset Block (node_modules Paths)
GitHub Pages CDN explicitly blocks and returns a `404` for any path containing a `/node_modules/` folder segment. The default `@expo/vector-icons` web build exports font assets under `assets/node_modules/...`, causing blank icon placeholders on the live site.
- **Solution**: Copy the required `.ttf` font files into a local folder (e.g., `assets/fonts/`), and register them explicitly in `useFonts` inside the root layout (using both uppercase and lowercase aliases, e.g. `'Ionicons'` and `'ionicons'`). This bundles the asset into `/assets/assets/fonts/...`, bypassing the CDN block.

