/** Citizen grievances per constituency. Seeded + deterministic, but the mix is
 *  weighted by the district's REAL top issues (src/data/insights.json), so the
 *  grievances surfaced for a seat match its on-ground reality. The API layer
 *  (api.getGrievances) swaps this for live data later. */
import { seeded } from './pulse';
import { districtIntel } from './insights';

export type GrievanceCat =
  | 'water' | 'drugs' | 'agriculture' | 'unemployment' | 'migration'
  | 'industry' | 'debt' | 'health' | 'power' | 'roads' | 'education' | 'sanitation';

export type Grievance = {
  id: string;
  category: GrievanceCat;
  title: string;
  votes: number;
  pct: number;
  status: 'open' | 'in_progress' | 'resolved';
  trend: 'up' | 'flat' | 'down';
};

export const CAT_META: Record<GrievanceCat, { label: string; color: string; icon: string }> = {
  water: { label: 'Water', color: '#2E8DE6', icon: 'droplet' },
  drugs: { label: 'Drugs', color: '#F2545B', icon: 'alert-octagon' },
  agriculture: { label: 'Agriculture', color: '#4EB457', icon: 'sun' },
  unemployment: { label: 'Jobs', color: '#F06C18', icon: 'briefcase' },
  migration: { label: 'Migration', color: '#8685EC', icon: 'send' },
  industry: { label: 'Industry', color: '#9AA7BD', icon: 'tool' },
  debt: { label: 'Farm debt', color: '#E0A33E', icon: 'trending-down' },
  health: { label: 'Health', color: '#F074A0', icon: 'activity' },
  power: { label: 'Power', color: '#FCC419', icon: 'zap' },
  roads: { label: 'Roads', color: '#79C7EE', icon: 'navigation' },
  education: { label: 'Education', color: '#62CDA0', icon: 'book-open' },
  sanitation: { label: 'Sanitation', color: '#A78BFA', icon: 'trash-2' },
};

const TITLES: Record<GrievanceCat, string[]> = {
  water: ['Erratic canal water supply', 'Falling groundwater, costly tubewells', 'Contaminated drinking water'],
  drugs: ['Demand for a de-addiction centre', 'Rising chitta abuse among youth', 'Crack down on village drug supply'],
  agriculture: ['Delayed MSP payment on paddy', 'DAP / fertiliser shortage', 'Crop-damage compensation pending'],
  unemployment: ['No local jobs for graduates', 'Stalled govt recruitment', 'Demand for a skill centre'],
  migration: ['Regulate study-visa agents', 'Stop distress youth migration', 'Fraud immigration consultancies'],
  industry: ['Power cuts hitting small units', 'Delayed industrial subsidies', 'GST refund backlog'],
  debt: ['Farm-loan waiver demand', 'Arhtiya debt pressure', 'Crop-insurance claims stuck'],
  health: ['Cancer treatment access', 'Understaffed civil hospital', 'Demand for health camps'],
  power: ['Long unscheduled power cuts', 'High tubewell power bills', 'Transformer not repaired'],
  roads: ['Potholed link roads', 'Streetlights not working', 'No bus connectivity to villages'],
  education: ['Teacher shortage in govt schools', 'Demand for smart classrooms', 'College too far for girls'],
  sanitation: ['Garbage piling in wards', 'Sewerage overflow', 'No drainage in colony'],
};

// Default categories that round out the list beyond a district's top issues.
const FILL: GrievanceCat[] = ['roads', 'power', 'health', 'sanitation', 'water', 'unemployment', 'education'];

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

/** Top grievances for a seat, most-voted first. */
export function grievancesFor(no: number, district: string): { total: number; items: Grievance[] } {
  const intel = districtIntel(district);
  const top = (intel?.topIssues || ['water', 'roads', 'power']) as GrievanceCat[];

  const cats: GrievanceCat[] = [];
  [...top, ...FILL].forEach((c) => {
    if (CAT_META[c] && !cats.includes(c) && cats.length < 6) cats.push(c);
  });

  const raw = cats.map((c, i) => {
    const topRank = top.indexOf(c); // 0..2 if a real top issue, else -1
    const boost = topRank >= 0 ? (top.length - topRank) * 620 : 0;
    const votes = Math.round(140 + seeded(no, 50 + i) * 760 + boost);
    const title = pick(TITLES[c], seeded(no, 62 + i));
    const status = (['open', 'in_progress', 'resolved'] as const)[Math.floor(seeded(no, 74 + i) * 3) % 3];
    const tr = seeded(no, 86 + i);
    const trend: Grievance['trend'] = tr > 0.62 ? 'up' : tr < 0.3 ? 'down' : 'flat';
    return { id: `${c}-${no}`, category: c, title, votes, status, trend };
  });

  const total = raw.reduce((s, x) => s + x.votes, 0);
  const items = raw
    .map((x) => ({ ...x, pct: Math.round((x.votes / total) * 100) }))
    .sort((a, b) => b.votes - a.votes);
  return { total, items };
}

/** Grievance load 0..100 for the map heat mode (more reported issues = hotter).
 *  Per-seat totals fall in ~[4500, 9200]; map that span across the full ramp. */
export function grievanceLoad(no: number, district: string): number {
  const { total } = grievancesFor(no, district);
  return Math.max(0, Math.min(100, Math.round(((total - 4500) / 4700) * 100)));
}
