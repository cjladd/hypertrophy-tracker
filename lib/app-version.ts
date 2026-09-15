// lib/app-version.ts
// The running build's version string.
//
// Read from expo-constants rather than require('../app.json') so it reflects the build that is
// actually executing — including after an expo-updates OTA, where the bundled app.json and the
// running JS can disagree. Used to stamp backups and crash-log entries.

import Constants from 'expo-constants';

export const APP_VERSION: string =
  Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? 'unknown';
