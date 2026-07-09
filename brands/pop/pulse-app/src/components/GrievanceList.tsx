/** Top / most-voted citizen grievances for a constituency. Shown in the detail
 *  panel right after the voter age profile. Each grievance is actionable: the
 *  leader taps it to push a directive straight to the war-room team. */
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Txt } from './ui';
import { grievancesFor, CAT_META, type Grievance } from '../lib/grievances';
import { api, type ActionKind } from '../lib/api';
import { colors, radius } from '../theme';
import ActionModal from './ActionModal';

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

export default function GrievanceList({ no, district, seatName }: { no: number; district: string; seatName?: string }) {
  const { total, items } = grievancesFor(no, district);
  const max = items[0]?.votes || 1;
  // Grievances the leader has already acted on this session.
  const [sent, setSent] = React.useState<Record<string, boolean>>({});
  // The grievance whose action sheet is open, and which action is in flight.
  const [active, setActive] = React.useState<Grievance | null>(null);
  const [busy, setBusy] = React.useState<ActionKind | null>(null);

  async function pick(kind: ActionKind) {
    if (!active || busy) return;
    const g = active;
    setBusy(kind);
    const meta = CAT_META[g.category];
    const res = await api.pushAction({
      no,
      kind,
      target: g.title,
      context: `${seatName ? seatName + ' · ' : ''}${meta.label} · ${g.votes.toLocaleString()} reports · currently ${STATUS[g.status].label}.`,
    });
    setBusy(null);
    if (res.ok) {
      setSent((s) => ({ ...s, [g.id]: true }));
      setActive(null);
    }
  }

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
      <Txt size={10.5} faint style={{ marginTop: -4, marginBottom: 12 }}>
        Tap a grievance to push it to your team.
      </Txt>

      {items.map((g) => {
        const meta = CAT_META[g.category];
        const st = STATUS[g.status];
        const tr = TREND[g.trend];
        const state = sent[g.id];
        return (
          <Pressable
            key={g.id}
            onPress={() => setActive(g)}
            disabled={!!state}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}
          >
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
                {state ? (
                  <View style={[styles.statusPill, { borderColor: '#2FD08A66', backgroundColor: '#2FD08A1A', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                    <Feather name="check" size={10} color="#2FD08A" />
                    <Txt size={9.5} weight="bold" color="#2FD08A">SENT TO TEAM</Txt>
                  </View>
                ) : (
                  <View style={styles.actRow}>
                    <View style={[styles.statusPill, { borderColor: st.color + '66', backgroundColor: st.color + '1A' }]}>
                      <Txt size={9.5} weight="bold" color={st.color}>
                        {st.label.toUpperCase()}
                      </Txt>
                    </View>
                    <View style={styles.actBtn}>
                      <Feather name="send" size={10} color={colors.accent} />
                      <Txt size={9.5} weight="bold" color={colors.accent}>ACT</Txt>
                    </View>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        );
      })}

      <ActionModal
        visible={!!active}
        target={active ? active.title : null}
        busy={busy}
        onClose={() => { if (!busy) setActive(null); }}
        onPick={pick}
      />
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
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.accent + '66',
    backgroundColor: colors.accent + '14',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
});
