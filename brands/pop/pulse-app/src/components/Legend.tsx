import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Txt } from './ui';
import { type ColorMode } from '../lib/geo';
import { results } from '../data';
import { colors, radius, party, phase, HEAT_RAMP, YOUTH_RAMP, GRIEV_RAMP } from '../theme';

function Row({ color, label, bold }: { color: string; label: string; bold?: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.sw, { backgroundColor: color }]} />
      {bold ? (
        <Txt size={11.5} weight="bold" style={{ minWidth: 22 }}>
          {bold}
        </Txt>
      ) : null}
      <Txt size={11.5} dim>
        {label}
      </Txt>
    </View>
  );
}

export default function Legend({ mode }: { mode: ColorMode }) {
  let title = '';
  let body: React.ReactNode = null;

  if (mode === 'grievances') {
    title = 'Grievance load';
    body = (
      <>
        <View style={styles.ramp}>
          {GRIEV_RAMP.map((c, i) => (
            <View key={i} style={[styles.stop, { backgroundColor: c }]} />
          ))}
        </View>
        <View style={styles.ends}>
          <Txt size={10} faint>
            low
          </Txt>
          <Txt size={10} faint>
            high
          </Txt>
        </View>
      </>
    );
  } else if (mode === 'result2022') {
    title = '2022 result · seats';
    body = results.parties.map((p) => (
      <Row key={p.id} color={party[p.id] || p.color} bold={String(p.seats)} label={p.name} />
    ));
  } else if (mode === 'priority') {
    title = 'Priority focus';
    body = (
      <>
        <Row color={phase.P1} label="P1 · Frontline" />
        <Row color={phase.P2} label="P2 · Mobilization" />
        <Row color={phase.P3} label="P3 · Conversion" />
      </>
    );
  } else if (mode === 'reserved') {
    title = 'Seat type';
    body = (
      <>
        <Row color="#2A93D6" label="General" />
        <Row color="#6E8BCB" label="SC reserved" />
      </>
    );
  } else if (mode === 'youth') {
    title = 'Youth density (18-29)';
    body = (
      <>
        <View style={styles.ramp}>
          {YOUTH_RAMP.map((c, i) => (
            <View key={i} style={[styles.stop, { backgroundColor: c }]} />
          ))}
        </View>
        <View style={styles.ends}>
          <Txt size={10} faint>
            low
          </Txt>
          <Txt size={10} faint>
            high
          </Txt>
        </View>
      </>
    );
  } else {
    title = 'Engagement';
    body = (
      <>
        <View style={styles.ramp}>
          {HEAT_RAMP.map((c, i) => (
            <View key={i} style={[styles.stop, { backgroundColor: c }]} />
          ))}
        </View>
        <View style={styles.ends}>
          <Txt size={10} faint>
            low
          </Txt>
          <Txt size={10} faint>
            high
          </Txt>
        </View>
      </>
    );
  }

  return (
    <View style={styles.box}>
      <Txt size={10.5} weight="bold" dim style={styles.title}>
        {title.toUpperCase()}
      </Txt>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(15,21,33,0.92)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 11,
    minWidth: 140,
  },
  title: { letterSpacing: 0.6, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, marginVertical: 3 },
  sw: { width: 13, height: 13, borderRadius: 3 },
  ramp: { flexDirection: 'row', height: 10, borderRadius: 4, overflow: 'hidden', marginTop: 2 },
  stop: { flex: 1 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
