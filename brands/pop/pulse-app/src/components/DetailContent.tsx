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
import { byNo } from '../data';
import { winnerOf } from '../lib/geo';
import { party as PARTY, colors, radius, space, phase } from '../theme';
import type { Pulse } from '../lib/pulse';
import { api, type ActionKind } from '../lib/api';
import ActionModal from './ActionModal';

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

  // Leader mobilisation: pick a team action, which becomes a Feed directive.
  const [done, setDone] = React.useState<Record<string, boolean>>({});
  const [sheet, setSheet] = React.useState<{ key: string; target: string; context: string } | null>(null);
  const [busy, setBusy] = React.useState<ActionKind | null>(null);
  const activeWorkforce = (p.volunteers || 0) + (p.cadre ?? 0);
  const workforce = [
    { key: 'vol', label: 'Volunteers', value: p.volunteers || 0, icon: 'users', color: phase.P3 },
    { key: 'sup', label: 'Supporters', value: p.supporters ?? 0, icon: 'heart', color: phase.P2 },
    { key: 'cad', label: 'Cadre', value: p.cadre ?? 0, icon: 'award', color: phase.P1 },
  ];

  async function pick(kind: ActionKind) {
    if (no == null || !sheet || busy) return;
    setBusy(kind);
    const res = await api.pushAction({ no, kind, target: sheet.target, context: sheet.context });
    setBusy(null);
    if (res.ok) { setDone((s) => ({ ...s, [sheet.key]: true })); setSheet(null); }
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
      <GrievanceList no={c.no} district={c.district} seatName={c.name} />

      <Divider />
      <Txt size={11} weight="bold" dim style={styles.section}>
        FRONTLINE YOU CAN MOVE
      </Txt>
      <Txt size={10.5} faint style={{ marginTop: -6, marginBottom: 10 }}>
        {activeWorkforce.toLocaleString()} boots on the ground here. Tap a group to push a mobilise directive to your team.
      </Txt>
      <View style={styles.wfGrid}>
        {workforce.map((wf) => {
          const st = done[wf.key];
          return (
            <Pressable
              key={wf.key}
              disabled={st}
              onPress={() =>
                setSheet({
                  key: wf.key,
                  target: `Mobilise ${wf.label} in ${c.name}`,
                  context: `${wf.value.toLocaleString()} ${wf.label.toLowerCase()} available in ${c.name}.`,
                })
              }
              style={({ pressed }) => [styles.wfCard, { borderLeftColor: wf.color }, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.wfTop}>
                <Feather name={wf.icon as any} size={14} color={wf.color} />
                <Feather name={st ? 'check-circle' : 'send'} size={12} color={st ? '#2FD08A' : colors.faint} />
              </View>
              <Txt size={20} weight="bold">
                {wf.value.toLocaleString()}
              </Txt>
              <Txt size={10} faint style={{ letterSpacing: 0.3, marginTop: 1 }}>
                {wf.label.toUpperCase()}
              </Txt>
              <Txt size={9} weight="bold" color={st ? '#2FD08A' : colors.accent} style={{ marginTop: 4 }}>
                {st ? 'SENT TO TEAM' : 'PUSH →'}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.cta, done.all && { backgroundColor: '#2FD08A' }]}
        disabled={done.all}
        onPress={() =>
          setSheet({
            key: 'all',
            target: `Mobilise the ground in ${c.name}`,
            context: `Frontline in ${c.name}: ${(p.volunteers || 0).toLocaleString()} volunteers, ${(p.supporters ?? 0).toLocaleString()} supporters, ${(p.cadre ?? 0).toLocaleString()} cadre (${activeWorkforce.toLocaleString()} boots on the ground).`,
          })
        }
      >
        <Feather name={done.all ? 'check' : 'send'} size={16} color={colors.bg} />
        <Txt size={14.5} weight="bold" color={colors.bg}>
          {done.all ? 'Pushed to team' : 'Push to team'}
        </Txt>
      </Pressable>

      <ActionModal
        visible={!!sheet}
        target={sheet ? sheet.target : null}
        busy={busy}
        onClose={() => { if (!busy) setSheet(null); }}
        onPick={pick}
      />
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
  wfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  wfCard: {
    width: '31.5%',
    flexGrow: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    padding: 10,
  },
  wfTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
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
