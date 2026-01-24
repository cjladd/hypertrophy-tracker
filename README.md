# Hypertrophy Tracker (Expo + SQLite)

Offline-first workout logger focused on hypertrophy progression. See `PRD.md` and `prog_engine.md` for the current spec.

## Features
- Log workouts with sets (weight, reps, RPE)
- Templates with exercise ordering
- Preset routines (PPL, Upper/Lower, Full Body, Bro Split)
- Workout history with edit/delete and notes
- Progress charts for top working weight
- Progression suggestions using a triple-progression model

## Tech stack
- Expo + React Native
- TypeScript
- SQLite (expo-sqlite)
- expo-router

## Quick start
- Install deps: `npm install`
- Run dev server: `npx expo start` (Expo Go, simulator, or dev build)

## App structure
- `app/` screens (Expo Router): home, log workout, exercises, settings/dev tools
- `lib/` SQLite setup and repo layer
- `context/SettingsContext.tsx` simple app settings (weight jump)

## Dev tools (in-app)
- Home -> Settings -> Dev tools
- Reset database: drops all tables, recreates, reseeds default exercises
- Reseed defaults: seeds exercises without wiping workouts
- Reset settings: restores weight jump to default

## Data and storage
- Offline-first with local SQLite storage
- No login or cloud sync in v1

## Notes
- Pounds only in v1; KG toggle planned.
