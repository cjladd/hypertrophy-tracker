# Hypertrophy Tracker (Expo + SQLite)

An offline-first workout logger focused on hypertrophy progression, built with React Native and Expo.

## Vision
To be the most streamlined, distraction-free workout companion that handles the math of progressive overload for you.

## Features
- **Workout Logging**: Log sets (weight, reps, RPE) with ease.
- **Smart Progression**: "Hypertrophy Engine" suggests weight jumps and progression based on performance.
- **Routines & Templates**: Built-in support for PPL, Upper/Lower, Full Body splits, plus custom templates.
- **History & Analytics**: View workout logs and track strength trends/volume over time.
- **Exercise Management**: Custom exercise database with draggable reordering.
- **Offline First**: All data stored locally using SQLite.

## Tech Stack
- **Framework**: Expo + React Native
- **Language**: TypeScript
- **Navigation**: Expo Router (File-based routing)
- **Database**: `expo-sqlite` (SQLite)
- **Visualization**: `react-native-chart-kit`
- **UI**: `react-native-draggable-flatlist`, `@expo/vector-icons`

## Project Structure

```
cjladd-app/
├── app/                  # Expo Router screens
│   ├── (tabs)/           # Main bottom tab navigation
│   │   ├── index.tsx     # Active workout / Dashboard
│   │   ├── history.tsx   # Workout history
│   │   ├── progress.tsx  # Charts & stats
│   │   └── settings.tsx  # App settings & Dev tools
│   ├── exercises.tsx     # Exercise selection/management
│   ├── routines.tsx      # Routine selection
│   ├── templates.tsx     # Template management
│   ├── log.tsx           # Workout logging interface
│   └── welcome.tsx       # Onboarding
├── components/           # Reusable UI components
├── context/              # React Context (State Management)
├── lib/                  # Core logic
│   ├── db.ts             # Database connection
│   ├── progression.ts    # Progression algorithm
│   └── repo/             # Data access layer (Repositories)
└── assets/               # static assets
```

## Quick Start
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Run the app**
   ```bash
   npx expo start
   ```
   - Press `s` in the terminal to switch between Expo Go and Development Build.
   - Requires Android Studio / Xcode for local simulation, or Expo Go app on device.

## Dev Tools & Debugging
- Located in **Settings > Dev Tools**.
- **Reset Database**: Drops tables and reseeds default data (Exercises, Routines).
- **Reseed Defaults**: Adds default data without deleting existing workouts.
- **Reset Settings**: Restores app preferences.

## Data Model
- The app uses a normalized SQLite database.
- Core relationship: `Workouts` -> `WorkoutExercises` -> `Sets`.
- See `lib/db.ts` and `lib/repo/` for schema details.
