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
import { party as PARTY, colors, radius, space, phase } from '../theme';
import type { Pulse } from '../lib/pulse';
import { api } from '../lib/api';

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

  // Leader mobilisation: push a "move these people here" directive to the team.
  const [mob, setMob] = React.useState<Record<string, 'sending' | 'done'>>({});
  const activeWorkforce = (p.volunteers || 0) + (p.cadre ?? 0);
  const workforce = [
    { key: 'vol', label: 'Volunteers', value: p.volunteers || 0, icon: 'users', color: phase.P3 },
    { key: 'sup', label: 'Supporters', value: p.supporters ?? 0, icon: 'heart', color: phase.P2 },
    { key: 'cad', label: 'Cadre', value: p.cadre ?? 0, icon: 'award', color: phase.P1 },
  ];

  async function pushWorkforce(key: string, title: string, body: string) {
    if (no == null || mob[key]) return;
    setMob((s) => ({ ...s, [key]: 'sending' }));
    const res = await api.pushToTeam({ no, title, body });
    setMob((s) => { const n = { ...s }; if (res.ok) n[key] = 'done'; else delete n[key]; return n; });
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
        WORKFORCE YOU CAN MOVE
      </Txt>
      <Txt size={10.5} faint style={{ marginTop: -6, marginBottom: 10 }}>
        {activeWorkforce.toLocaleString()} boots on the ground here. Tap a group to push a mobilise directive to your team.
      </Txt>
      <View style={styles.wfGrid}>
        {workforce.map((wf) => {
          const st = mob[wf.key];
          return (
            <Pressable
              key={wf.key}
              disabled={!!st}
              onPress={() =>
                pushWorkforce(
                  wf.key,
                  `Mobilise ${wf.label} in ${c.name}`,
                  `${wf.value.toLocaleString()} ${wf.label.toLowerCase()} available in ${c.name}. Leader is asking the team to activate them here.`,
                )
              }
              style={({ pressed }) => [styles.wfCard, { borderLeftColor: wf.color }, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.wfTop}>
                <Feather name={wf.icon as any} size={14} color={wf.color} />
                <Feather name={st === 'done' ? 'check-circle' : 'send'} size={12} color={st === 'done' ? '#2FD08A' : colors.faint} />
              </View>
              <Txt size={20} weight="bold">
                {wf.value.toLocaleString()}
              </Txt>
              <Txt size={10} faint style={{ letterSpacing: 0.3, marginTop: 1 }}>
                {wf.label.toUpperCase()}
              </Txt>
              <Txt size={9} weight="bold" color={st === 'done' ? '#2FD08A' : colors.accent} style={{ marginTop: 4 }}>
                {st === 'done' ? 'SENT TO TEAM' : st === 'sending' ? 'SENDING…' : 'PUSH →'}
              </Txt>
            </Pressable>
          );
        })}
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

      <Pressable
        style={[styles.cta, mob.all === 'done' && { backgroundColor: '#2FD08A' }]}
        disabled={mob.all === 'sending'}
        onPress={() =>
          pushWorkforce(
            'all',
            `Mobilise the ground in ${c.name}`,
            `Workforce ready in ${c.name}: ${(p.volunteers || 0).toLocaleString()} volunteers, ${(p.supporters ?? 0).toLocaleString()} supporters, ${(p.cadre ?? 0).toLocaleString()} cadre (${activeWorkforce.toLocaleString()} boots on the ground). Leader requests activation.`,
          )
        }
      >
        <Feather name={mob.all === 'done' ? 'check' : 'send'} size={16} color={colors.bg} />
        <Txt size={14.5} weight="bold" color={colors.bg}>
          {mob.all === 'done' ? 'Pushed to team' : mob.all === 'sending' ? 'Pushing…' : 'Push to team'}
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
