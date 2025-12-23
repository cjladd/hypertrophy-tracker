// context/SettingsContext.tsx
// Settings aligned with PRD v1 - only weightJumpLb
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

type Settings = {
  weightJumpLb: number; // default 5 per PRD §3G
};

type Ctx = Settings & {
  setWeightJumpLb: (n: number) => void;
};

const DEFAULTS: Settings = {
  weightJumpLb: 5,
};

const KEY = 'ht_settings_v2';

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        try { setState({ ...DEFAULTS, ...JSON.parse(raw) }); } catch {}
      }
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  const value: Ctx = {
    ...state,
    setWeightJumpLb: (n) => setState((s) => ({ ...s, weightJumpLb: Math.max(0, Math.round(n)) })),
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
