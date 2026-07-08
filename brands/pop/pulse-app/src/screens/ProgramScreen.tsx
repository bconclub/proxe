import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Txt } from '../components/ui';
import { framework } from '../data';
import { phase as PHASE, colors, radius } from '../theme';

export default function ProgramScreen() {
  const f = framework;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Txt size={24} weight="display">
        {f.program.name}
      </Txt>
      <Txt size={12.5} dim style={{ marginTop: 6, lineHeight: 18 }}>
        {f.program.tagline}
      </Txt>

      <SectionTitle>Priorities</SectionTitle>
      {f.priorities.map((p: any) => (
        <View key={p.id} style={[styles.prio, { borderLeftColor: p.color }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt size={13} weight="bold" color={p.color}>
              {p.id}
            </Txt>
            <Txt size={15} weight="semibold">
              {p.name}
            </Txt>
          </View>
          <Txt size={12.5} dim style={{ marginTop: 5, lineHeight: 18 }}>
            {p.goal}
          </Txt>
          <Txt size={11} faint style={{ marginTop: 7 }}>
            Modules: {p.modules.join(', ')}
          </Txt>
        </View>
      ))}

      <SectionTitle>7-month timeline</SectionTitle>
      {f.timeline.map((t: any) => (
        <View key={t.month} style={styles.tl}>
          <View style={[styles.tlBadge, { backgroundColor: (PHASE[t.focus] || colors.faint) + '22' }]}>
            <Txt size={11} weight="bold" color={PHASE[t.focus] || colors.faint}>
              M{t.month} · {t.focus}
            </Txt>
          </View>
          <Txt size={12.5} dim style={{ flex: 1, lineHeight: 18 }}>
            {t.label}
          </Txt>
        </View>
      ))}

      <SectionTitle>Knowledge base</SectionTitle>
      {f.knowledgeBase.taxonomy.map((n: any) => (
        <View key={n.node} style={styles.kb}>
          <Txt size={13.5} weight="semibold">
            {n.node}
          </Txt>
          <Txt size={11.5} faint style={{ marginTop: 3 }}>
            {n.items.join(' · ')}
          </Txt>
        </View>
      ))}

      <SectionTitle>WhatsApp funnel</SectionTitle>
      <View style={styles.flow}>
        {f.whatsappFlow.steps.map((s: string, i: number) => (
          <React.Fragment key={i}>
            <View style={styles.node}>
              <Txt size={11.5} dim>
                {s}
              </Txt>
            </View>
            {i < f.whatsappFlow.steps.length - 1 && (
              <Feather name="arrow-down" size={13} color={colors.faint} />
            )}
          </React.Fragment>
        ))}
      </View>
    </ScrollView>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Txt size={12} weight="bold" color={colors.accent} style={{ marginTop: 22, marginBottom: 10, letterSpacing: 0.4 }}>
      {children}
    </Txt>
  );
}

const styles = StyleSheet.create({
  prio: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    padding: 13,
    marginBottom: 10,
  },
  tl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 11,
    marginBottom: 8,
  },
  tlBadge: { borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 5, minWidth: 76, alignItems: 'center' },
  kb: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  flow: { gap: 6, alignItems: 'flex-start' },
  node: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
  },
});
