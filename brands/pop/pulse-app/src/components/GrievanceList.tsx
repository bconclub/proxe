/** Top / most-voted citizen grievances for a constituency. Shown in the detail
 *  panel right after the voter age profile. */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Txt } from './ui';
import { grievancesFor, CAT_META, type Grievance } from '../lib/grievances';
import { colors, radius } from '../theme';

const STATUS: Record<Grievance['status'], { label: string; color: string }> = {
  open: { label: 'Open', color: '#F06C18' },
  in_progress: { label: 'In progress', color: '#2E8DE6' },
  resolved: { label: 'Resolved', color: '#2FD08A' },
};
const TREND: Record<Grievance['trend'], { icon: string; color: string }> = {
  up: { icon: 'trending-up', color: '#F2545B' },
  down: { icon: 'trending-down', color: '#2FD08A' },
  flat: { icon: 'minus', color: colors.faint },
};

export default function GrievanceList({ no, district }: { no: number; district: string }) {
  const { total, items } = grievancesFor(no, district);
  const max = items[0]?.votes || 1;

  return (
    <View style={{ marginTop: 16 }}>
      <View style={styles.head}>
        <Txt size={11} weight="bold" dim style={{ letterSpacing: 0.6 }}>
          TOP GRIEVANCES
        </Txt>
        <Txt size={11.5} dim>
          Most voted ·{' '}
          <Txt size={11.5} weight="bold" color={colors.accent}>
            {total.toLocaleString()}
          </Txt>{' '}
          reports
        </Txt>
      </View>

      {items.map((g) => {
        const meta = CAT_META[g.category];
        const st = STATUS[g.status];
        const tr = TREND[g.trend];
        return (
          <View key={g.id} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
              <Feather name={meta.icon as any} size={14} color={meta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Txt size={13} weight="medium" style={{ flex: 1 }} numberOfLines={1}>
                  {g.title}
                </Txt>
                <Feather name={tr.icon as any} size={13} color={tr.color} />
                <Txt size={12.5} weight="bold">
                  {g.votes.toLocaleString()}
                </Txt>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.round((g.votes / max) * 100)}%`, backgroundColor: meta.color }]} />
              </View>
              <View style={styles.metaRow}>
                <Txt size={10.5} faint>
                  {meta.label} · {g.pct}% of reports
                </Txt>
                <View style={[styles.statusPill, { borderColor: st.color + '66', backgroundColor: st.color + '1A' }]}>
                  <Txt size={9.5} weight="bold" color={st.color}>
                    {st.label.toUpperCase()}
                  </Txt>
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTrack: { height: 5, backgroundColor: colors.surface2, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  barFill: { height: '100%', borderRadius: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
  statusPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
});
