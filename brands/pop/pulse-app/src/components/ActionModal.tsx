/** ActionModal — when the leader taps ACT (a grievance) or Push to team, they
 *  pick WHAT the team should do: Observe / Monitor / Coordinate / Response /
 *  Escalate. Each choice becomes a directive in the Feed with live status. */
import React from 'react';
import { Modal, View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Txt } from './ui';
import { colors, radius } from '../theme';
import { ACTIONS, type ActionKind } from '../lib/api';

export default function ActionModal({
  visible,
  target,
  onClose,
  onPick,
  busy,
}: {
  visible: boolean;
  target: string | null;
  onClose: () => void;
  onPick: (kind: ActionKind) => void;
  busy?: ActionKind | null;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* swallow taps on the card so they don't close the sheet */}
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Txt size={16} weight="display">What should the team do?</Txt>
              {target ? (
                <Txt size={12.5} dim numberOfLines={2} style={{ marginTop: 4, lineHeight: 18 }}>
                  {target}
                </Txt>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={{ padding: 2 }}>
              <Feather name="x" size={20} color={colors.textDim} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 440, marginTop: 12 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
            {ACTIONS.map((a) => (
              <Pressable
                key={a.kind}
                disabled={!!busy}
                onPress={() => onPick(a.kind)}
                style={({ pressed }) => [styles.item, { borderLeftColor: a.color }, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.ic, { backgroundColor: a.color + '22' }]}>
                  <Feather name={a.icon as any} size={16} color={a.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt size={14} weight="semibold">{a.label}</Txt>
                  <Txt size={11.5} dim style={{ marginTop: 2, lineHeight: 16 }}>{a.desc}</Txt>
                </View>
                {busy === a.kind ? (
                  <Txt size={10} weight="bold" color={colors.accent}>SENDING…</Txt>
                ) : (
                  <Feather name="chevron-right" size={16} color={colors.faint} />
                )}
              </Pressable>
            ))}
          </ScrollView>

          <Txt size={10.5} faint style={{ marginTop: 12, textAlign: 'center', lineHeight: 15 }}>
            Every action lands in your Feed with live status.
          </Txt>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,10,18,0.66)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    padding: 12,
  },
  ic: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
