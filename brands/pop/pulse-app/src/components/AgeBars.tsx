import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Txt } from './ui';
import type { AgeGroups } from '../lib/pulse';
import { youthPct } from '../lib/pulse';
import { AGE_COLORS, colors } from '../theme';

export default function AgeBars({ age }: { age: AgeGroups }) {
  const youth = youthPct(age).toFixed(1);
  return (
    <View style={{ marginTop: 16 }}>
      <View style={styles.head}>
        <Txt size={11} weight="bold" dim style={{ letterSpacing: 0.6 }}>
          VOTER AGE PROFILE
        </Txt>
        <Txt size={11.5} dim>
          ~{Math.round(age.total / 1000)}k · Youth{' '}
          <Txt size={11.5} weight="bold" color={colors.accent}>
            {youth}%
          </Txt>
        </Txt>
      </View>

      <View style={styles.bar}>
        {age.bands.map((b, i) => (
          <View key={b.label} style={{ flex: b.pct, backgroundColor: AGE_COLORS[i] }} />
        ))}
      </View>

      <View style={{ marginTop: 10 }}>
        {age.bands.map((b, i) => (
          <View key={b.label} style={styles.row}>
            <View style={styles.left}>
              <View style={[styles.dot, { backgroundColor: AGE_COLORS[i] }]} />
              <Txt size={12.5} dim>
                {b.label}
              </Txt>
            </View>
            <Txt size={12.5} weight="medium">
              {b.count.toLocaleString()}
            </Txt>
            <Txt size={12.5} weight="medium" color={colors.textDim} style={{ width: 46, textAlign: 'right' }}>
              {b.pct}%
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dot: { width: 9, height: 9, borderRadius: 2 },
});
