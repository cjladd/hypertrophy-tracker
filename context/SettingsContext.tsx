// context/SettingsContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

type Settings = {
  autoIncrementWeight: boolean;
  restTimerEnabled: boolean;
  plateCalculatorEnabled: boolean;
  weightIncrementLbs: number;
};

type Ctx = Settings & {
  setAutoIncrementWeight: (v: boolean) => void;
  setRestTimerEnabled: (v: boolean) => void;
  setPlateCalculatorEnabled: (v: boolean) => void;
  setWeightIncrementLbs: (n: number) => void;
};

const DEFAULTS: Settings = {
  autoIncrementWeight: true,
  restTimerEnabled: false,
  plateCalculatorEnabled: true,
  weightIncrementLbs: 5,
};

const KEY = 'ht_settings_v1';

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
    setAutoIncrementWeight: (v) => setState((s) => ({ ...s, autoIncrementWeight: v })),
    setRestTimerEnabled: (v) => setState((s) => ({ ...s, restTimerEnabled: v })),
    setPlateCalculatorEnabled: (v) => setState((s) => ({ ...s, plateCalculatorEnabled: v })),
    setWeightIncrementLbs: (n) => setState((s) => ({ ...s, weightIncrementLbs: Math.max(0, Math.round(n)) })),
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
