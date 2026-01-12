// context/SettingsContext.tsx
// Settings aligned with PRD v1 + onboarding state
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

type Settings = {
  weightJumpLb: number; // default 5 per PRD §3G
  hasCompletedOnboarding: boolean; // Feature 1: first-launch detection
  activeRoutineId: string | null; // Feature 2: selected routine
};

type Ctx = Settings & {
  setWeightJumpLb: (n: number) => void;
  completeOnboarding: () => void;
  setActiveRoutineId: (id: string | null) => void;
  isLoading: boolean; // Prevent flash of wrong screen
};

const DEFAULTS: Settings = {
  weightJumpLb: 5,
  hasCompletedOnboarding: false,
  activeRoutineId: null,
};

const KEY = 'ht_settings_v3'; // Bumped version for new fields

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Settings>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        try { setState({ ...DEFAULTS, ...JSON.parse(raw) }); } catch {}
      }
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
    }
  }, [state, isLoading]);

  const value: Ctx = {
    ...state,
    isLoading,
    setWeightJumpLb: (n) => setState((s) => ({ ...s, weightJumpLb: Math.max(0, Math.round(n)) })),
    completeOnboarding: () => setState((s) => ({ ...s, hasCompletedOnboarding: true })),
    setActiveRoutineId: (id) => setState((s) => ({ ...s, activeRoutineId: id })),
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
