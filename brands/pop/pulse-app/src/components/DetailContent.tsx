/** The constituency detail UI body - reused by the mobile modal (DetailSheet)
 *  and the desktop right panel. */
import React from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Txt, Divider } from './ui';
import MetricGrid from './MetricGrid';
import AgeBars from './AgeBars';
import DistrictIntel from './DistrictIntel';
import GrievanceList from './GrievanceList';
import { byNo, framework } from '../data';
import { winnerOf } from '../lib/geo';
import { party as PARTY, colors, radius, space } from '../theme';
import type { Pulse } from '../lib/pulse';
import { api } from '../lib/api';
import { sendLocal } from '../lib/notifications';

const FEATURE_ICON: Record<string, any> = {
  volunteer: 'users',
  stay_updated: 'bell',
  share_voice: 'mic',
  join_events: 'calendar',
  location: 'map-pin',
};

export default function DetailContent({
  no,
  pulse,
  onClose,
}: {
  no: number | null;
  pulse: Record<number, Pulse>;
  onClose?: () => void;
}) {
  const c = no != null ? byNo[no] : null;
  const p = no != null ? pulse[no] : null;
  const w = no != null ? winnerOf(no) : null;

  // Empty state - shown in the desktop right panel before a seat is picked.
  if (!c || !p) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIc}>
          <Feather name="map-pin" size={22} color={colors.faint} />
        </View>
        <Txt size={14} weight="semibold" dim style={{ marginTop: 12 }}>
          Pick a constituency
        </Txt>
        <Txt size={12} faint style={{ marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
          Tap a seat on the map or in the list to see its 2022 result, pulse and voter profile.
        </Txt>
      </View>
    );
  }

  async function notify() {
    if (no == null) return;
    await api.subscribe({ no, channel: 'push' });
    await sendLocal(`${c!.name} · you're subscribed`, 'Constituency updates will reach you here. Demo alert.');
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Txt size={22} weight="display">
            {c.no}. {c.name}
          </Txt>
          <Txt size={12.5} dim style={{ marginTop: 3 }}>
            {c.district} district · {c.lha} (LS)
            {c.reserved ? ` · ${c.reserved} reserved` : ''}
          </Txt>
        </View>
        {onClose && (
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <Feather name="x" size={20} color={colors.textDim} />
          </Pressable>
        )}
      </View>

      {w && (
        <View style={styles.winner}>
          <View style={[styles.partyDot, { backgroundColor: PARTY[w.party] || colors.faint }]} />
          <Txt size={12.5} dim>
            2022 MLA{'  '}
            <Txt size={12.5} weight="semibold" color={colors.text}>
              {w.winner}
            </Txt>{' '}
            <Txt size={12.5} weight="semibold" color={PARTY[w.party] || colors.text}>
              ({w.party})
            </Txt>
          </Txt>
        </View>
      )}

      <DistrictIntel district={c.district} lha={c.lha} />

      <Divider />
      <Txt size={11} weight="bold" dim style={styles.section}>
        CAMPAIGN PULSE
      </Txt>
      <MetricGrid p={p} />
      <AgeBars age={p.age} />

      <Divider />
      <GrievanceList no={c.no} district={c.district} />

      <Divider />
      <Txt size={11} weight="bold" dim style={styles.section}>
        VOTER TOUCHPOINTS
      </Txt>
      <View style={styles.chips}>
        {framework.engagement.features.map((f: any) => (
          <View key={f.id} style={styles.chip}>
            <Feather name={FEATURE_ICON[f.id] || 'circle'} size={14} color={colors.accent} />
            <Txt size={12} weight="medium">
              {f.label}
            </Txt>
          </View>
        ))}
      </View>

      <Txt size={11} weight="bold" dim style={styles.section}>
        GRIEVANCE PIPELINE
      </Txt>
      <View style={styles.flow}>
        {framework.grievancePipeline.stages.map((s: any, i: number) => (
          <React.Fragment key={s.id}>
            <View style={styles.node}>
              <Txt size={11} dim>
                {s.label}
              </Txt>
            </View>
            {i < framework.grievancePipeline.stages.length - 1 && (
              <Feather name="chevron-right" size={13} color={colors.faint} />
            )}
          </React.Fragment>
        ))}
      </View>

      <Pressable style={styles.cta} onPress={notify}>
        <Feather name="bell" size={16} color={colors.bg} />
        <Txt size={14.5} weight="bold" color={colors.bg}>
          Subscribe to updates
        </Txt>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyIc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  close: { padding: 4 },
  winner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  partyDot: { width: 10, height: 10, borderRadius: 5 },
  section: { letterSpacing: 0.6, marginBottom: 10, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  flow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 },
  node: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 13,
    marginTop: space(6),
  },
});
