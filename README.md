# Hypertrophy Tracker (Expo + SQLite)

Offline-first workout logger focused on hypertrophy progression. See `PRD.md` for the current spec.

## Setup
- Install deps: `npm install`
- Run dev server: `npx expo start` (Expo Go, simulator, or dev build)

## App structure
- `app/` screens (Expo Router): home, log workout, exercises, settings/dev tools
- `lib/` SQLite setup + repo layer
- `context/SettingsContext.tsx` simple app settings (weight jump)

## Dev tools (in-app)
- Home → “Settings & Dev Tools”
- Reset database: drops all tables, recreates, reseeds default exercises
- Reseed defaults: seeds exercises without wiping workouts
- Reset settings: restores weight jump to default

## Notes
- Pounds only in v1; KG toggle later.
- Data is local SQLite; no login or cloud sync in this version.
