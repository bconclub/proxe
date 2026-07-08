import React, { useMemo, useState } from 'react';
import { View, TextInput, FlatList, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Txt } from './ui';
import { constituencies, districts } from '../data';
import { winnerOf } from '../lib/geo';
import { useHorizontalScroll } from '../lib/useHorizontalScroll';
import { party as PARTY, colors, radius } from '../theme';

export default function SeatList({
  onSelect,
  activeNo,
}: {
  onSelect: (no: number) => void;
  activeNo?: number | null;
}) {
  const [q, setQ] = useState('');
  const [dist, setDist] = useState('');
  const distRef = useHorizontalScroll();

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    return constituencies.filter((c) => {
      if (dist && c.district !== dist) return false;
      if (!query) return true;
      return `${c.no} ${c.name} ${c.district} ${c.lha} ${c.reserved || ''}`
        .toLowerCase()
        .includes(query);
    });
  }, [q, dist]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.faint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name, district or PIN…"
          placeholderTextColor={colors.faint}
          style={styles.input}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10}>
            <Feather name="x-circle" size={16} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={distRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.distScroll}
        contentContainerStyle={styles.distRow}
      >
        <DistChip label="All" active={dist === ''} onPress={() => setDist('')} />
        {districts.map((d) => (
          <DistChip key={d} label={d} active={dist === d} onPress={() => setDist(d)} />
        ))}
      </ScrollView>

      <Txt size={11} faint style={styles.count}>
        {items.length} OF {constituencies.length} SHOWN
      </Txt>

      <FlatList
        data={items}
        keyExtractor={(c) => String(c.no)}
        contentContainerStyle={{ paddingBottom: 120 }}
        renderItem={({ item: c }) => {
          const w = winnerOf(c.no);
          const active = c.no === activeNo;
          return (
            <Pressable style={[styles.row, active && styles.rowActive]} onPress={() => onSelect(c.no)}>
              <View style={[styles.partyDot, { backgroundColor: w ? PARTY[w.party] : colors.faint }]} />
              <View style={styles.numWrap}>
                <Txt size={11} weight="semibold" color={colors.textDim}>
                  {c.no}
                </Txt>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Txt size={14.5} weight="medium">
                    {c.name}
                  </Txt>
                  {c.reserved ? (
                    <View style={styles.sc}>
                      <Txt size={9} weight="bold" color={colors.azure}>
                        SC
                      </Txt>
                    </View>
                  ) : null}
                </View>
                <Txt size={11.5} faint style={{ marginTop: 1 }}>
                  {c.district} · {c.lha}
                </Txt>
              </View>
              <Feather name="chevron-right" size={18} color={colors.faint} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function DistChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.distChip, active && styles.distChipActive]}>
      <Txt size={12} weight={active ? 'semibold' : 'medium'} color={active ? colors.bg : colors.textDim}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 4,
  },
  input: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 11, fontFamily: 'Inter_400Regular' },
  distScroll: { flexGrow: 0, flexShrink: 0 },
  distRow: { gap: 7, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  distChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  distChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  count: { letterSpacing: 0.6, marginLeft: 16, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowActive: { backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 13 },
  partyDot: { width: 9, height: 9, borderRadius: 5 },
  numWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sc: { backgroundColor: colors.azureDim, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
});
