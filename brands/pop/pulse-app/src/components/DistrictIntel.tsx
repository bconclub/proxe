/** Data-rich district context for the detail panel - real Census 2011 demographics,
 *  ECI 2022 turnout, region, issues, economy and the 2024 Lok Sabha MP. */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Txt } from './ui';
import { districtIntel, lokSabhaFor, ISSUE_LABEL } from '../lib/insights';
import { party as PARTY, colors, radius } from '../theme';

function StatCell({ v, k }: { v: string; k: string }) {
  return (
    <View style={styles.cell}>
      <Txt size={15} weight="bold">
        {v}
      </Txt>
      <Txt size={9.5} faint style={{ letterSpacing: 0.3, marginTop: 1 }}>
        {k.toUpperCase()}
      </Txt>
    </View>
  );
}

export default function DistrictIntel({ district, lha }: { district: string; lha: string }) {
  const intel = districtIntel(district);
  if (!intel) return null;
  const dm = intel.demographics;
  const ls = lokSabhaFor(lha);
  const pop = dm ? `${(dm.population / 100000).toFixed(1)}L` : '-';

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Txt size={11} weight="bold" dim style={{ letterSpacing: 0.6 }}>
          DISTRICT INTELLIGENCE
        </Txt>
        <View style={[styles.regionPill, { backgroundColor: intel.regionColor + '26', borderColor: intel.regionColor }]}>
          <Txt size={10.5} weight="bold" color={intel.regionColor}>
            {intel.region.toUpperCase()}
          </Txt>
        </View>
      </View>

      <View style={styles.grid}>
        <StatCell v={pop} k="Population" />
        <StatCell v={dm?.literacyPct != null ? `${dm.literacyPct}%` : '-'} k="Literacy" />
        <StatCell v={dm ? String(dm.sexRatio) : '-'} k="Sex ratio" />
        <StatCell v={dm ? `${dm.urbanPct}%` : '-'} k="Urban" />
        <StatCell v={dm?.scPct != null ? `${dm.scPct}%` : '-'} k="SC share" />
        <StatCell v={`${intel.turnout2022}%`} k="2022 turnout" />
      </View>

      <View style={styles.chips}>
        {intel.topIssues.map((i) => (
          <View key={i} style={styles.chip}>
            <View style={[styles.dot, { backgroundColor: intel.regionColor }]} />
            <Txt size={11.5} dim>
              {ISSUE_LABEL[i] || i}
            </Txt>
          </View>
        ))}
      </View>

      <Txt size={12} dim style={{ marginTop: 10, lineHeight: 18 }}>
        {intel.economy}
      </Txt>

      {ls && (
        <View style={styles.ls}>
          <Feather name="award" size={13} color={colors.textDim} />
          <Txt size={11.5} dim>
            2024 LS ({lha}):{' '}
            <Txt size={11.5} weight="semibold" color={colors.text}>
              {ls.winner}
            </Txt>{' '}
            <Txt size={11.5} weight="semibold" color={PARTY[ls.party] || colors.text}>
              ({ls.party})
            </Txt>
          </Txt>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  regionPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: '31.5%',
    flexGrow: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 9,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  ls: {
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
});
