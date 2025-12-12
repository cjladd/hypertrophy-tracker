import { useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';

export default function SettingsScreen() {
  const {
    autoIncrementWeight,
    restTimerEnabled,
    plateCalculatorEnabled,
    weightIncrementLbs,
    setAutoIncrementWeight,
    setRestTimerEnabled,
    setPlateCalculatorEnabled,
    setWeightIncrementLbs,
  } = useSettings();

  const [tempInc, setTempInc] = useState(String(weightIncrementLbs));

  return (
    <View style={{ padding: 16, gap: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Settings</Text>

      <Row
        label="Auto-increment Weight"
        value={autoIncrementWeight}
        onChange={setAutoIncrementWeight}
        description="Suggests a small weight increase on the next set."
      />

      <Row
        label="Rest Timer"
        value={restTimerEnabled}
        onChange={setRestTimerEnabled}
        description="Auto-start rest timer after you mark a set complete."
      />

      <Row
        label="Plate Calculator"
        value={plateCalculatorEnabled}
        onChange={setPlateCalculatorEnabled}
        description="Show plate breakdowns for target weight."
      />

      <View>
        <Text style={{ fontWeight: '600' }}>Increment (lbs)</Text>
        <Text style={{ color: '#666', marginBottom: 6 }}>
          Default increase for auto-increment.
        </Text>
        <TextInput
          value={tempInc}
          onChangeText={setTempInc}
          onBlur={() => {
            const n = Number(tempInc);
            if (Number.isFinite(n)) setWeightIncrementLbs(Math.max(0, Math.round(n)));
            setTempInc(String(Number.isFinite(n) ? Math.max(0, Math.round(n)) : weightIncrementLbs));
          }}
          keyboardType="numeric"
          style={{
            borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
            paddingHorizontal: 12, paddingVertical: 8, width: 120
          }}
        />
      </View>
    </View>
  );
}

function Row({
  label, value, onChange, description
}: { label: string; value: boolean; onChange: (v: boolean)=>void; description?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '600' }}>{label}</Text>
        <Switch value={value} onValueChange={onChange} />
      </View>
      {description ? <Text style={{ color: '#666' }}>{description}</Text> : null}
    </View>
  );
}
