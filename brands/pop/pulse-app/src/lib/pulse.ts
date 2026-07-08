/** Per-constituency "pulse" metrics. Deterministic seeded mock - the API layer
 *  swaps this for live backend data without any UI change. Ported from the
 *  original vanilla build so numbers stay stable across the migration. */

export const AGE_BANDS = ['18-19', '20-29', '30-39', '40-49', '50-59', '60-79', '80+'];
const AGE_BASE_PCT = [4.5, 19.0, 23.5, 21.0, 16.5, 13.0, 2.5];

export type AgeBand = { label: string; count: number; pct: number };
export type AgeGroups = { total: number; bands: AgeBand[] };
export type Pulse = {
  interactions: number;
  comments: number;
  volunteers: number;
  // Intensity ladder counts from PROXe (voters → supporters → volunteers →
  // cadre). Optional so the seeded mock (which omits them) still type-checks.
  supporters?: number;
  cadre?: number;
  voters?: number;
  grievances: number;
  resolved: number;
  conversion: number;
  engagement: number;
  phase: 'P1' | 'P2' | 'P3';
  age: AgeGroups;
};

/** Deterministic pseudo-random from a seed (stable mock until backend lands). */
export function seeded(n: number, salt: number): number {
  const x = Math.sin((n + 1) * 999 + salt * 31.7) * 10000;
  return x - Math.floor(x);
}

export function buildAgeGroups(no: number): AgeGroups {
  const totalVoters = 155000 + Math.floor(seeded(no, 20) * 50000);
  const raw = AGE_BASE_PCT.map((base, i) => base + (seeded(no, 30 + i) - 0.5) * 6);
  const sum = raw.reduce((a, b) => a + b, 0);
  const pcts = raw.map((v) => (v / sum) * 100);
  const counts = pcts.map((p) => Math.round((totalVoters * p) / 100));
  const diff = totalVoters - counts.reduce((a, b) => a + b, 0);
  counts[counts.length - 1] += diff;
  return {
    total: totalVoters,
    bands: AGE_BANDS.map((label, i) => ({
      label,
      count: counts[i],
      pct: Math.round(pcts[i] * 10) / 10,
    })),
  };
}

export function buildPulse(no: number): Pulse {
  const base = 40 + Math.floor(seeded(no, 1) * 460);
  const comments = Math.floor(base * (0.2 + seeded(no, 2) * 0.4));
  const volunteers = Math.floor(seeded(no, 3) * 120);
  const grievances = Math.floor(seeded(no, 4) * 60);
  const resolved = Math.floor(grievances * (0.3 + seeded(no, 5) * 0.6));
  const conversion = Math.floor(seeded(no, 6) * 100);
  const engagement = Math.min(100, Math.floor(base / 5 + volunteers * 0.3));
  const phase = (['P1', 'P2', 'P3'] as const)[no % 3];
  return {
    interactions: base,
    comments,
    volunteers,
    grievances,
    resolved,
    conversion,
    engagement,
    phase,
    age: buildAgeGroups(no),
  };
}

export function youthPct(age: AgeGroups): number {
  return age.bands
    .filter((b) => b.label === '18-19' || b.label === '20-29')
    .reduce((s, b) => s + b.pct, 0);
}
