/** GeoJSON → react-native-maps polygons, plus choropleth fill logic. */

import { geo, byNo, results } from '../data';
import { HEAT_RAMP, YOUTH_RAMP, GRIEV_RAMP, party as PARTY, phase as PHASE, colors } from '../theme';
import type { Pulse } from './pulse';
import { youthPct } from './pulse';
import { grievanceLoad } from './grievances';

export type LatLng = { latitude: number; longitude: number };
export type ACPolygon = { no: number; coords: LatLng[] };

/** Precompute polygon rings once. All features are single-ring Polygons. */
export const polygons: ACPolygon[] = geo.features.map((f) => ({
  no: f.properties.no,
  coords: f.geometry.coordinates[0].map((pt) => ({
    longitude: pt[0],
    latitude: pt[1],
  })),
}));

export type ColorMode = 'engagement' | 'grievances' | 'result2022' | 'youth' | 'priority' | 'reserved';

export const COLOR_MODES: { id: ColorMode; label: string }[] = [
  { id: 'grievances', label: 'Grievances' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'result2022', label: '2022 result' },
  { id: 'youth', label: 'Youth' },
  { id: 'priority', label: 'Priority' },
  { id: 'reserved', label: 'Seat type' },
];

function grievanceColor(no: number): string {
  const d = byNo[no]?.district;
  if (!d) return colors.surface3;
  const t = grievanceLoad(no, d) / 100;
  return GRIEV_RAMP[Math.min(GRIEV_RAMP.length - 1, Math.floor(t * GRIEV_RAMP.length))];
}

function heatColor(v: number): string {
  const i = Math.min(HEAT_RAMP.length - 1, Math.floor((v / 100) * HEAT_RAMP.length));
  return HEAT_RAMP[i];
}

function youthColor(p?: Pulse): string {
  if (!p) return colors.surface3;
  const t = Math.min(1, Math.max(0, (youthPct(p.age) - 20) / 10));
  return YOUTH_RAMP[Math.floor(t * (YOUTH_RAMP.length - 1))];
}

export function partyColor(no: number): string {
  const w = results.winners[String(no)];
  if (!w) return colors.surface3;
  return PARTY[w.party] || colors.surface3;
}

export function winnerOf(no: number) {
  return results.winners[String(no)] || null;
}

/** Resolve a polygon fill for the active color mode. */
export function fillFor(no: number, mode: ColorMode, pulse: Record<number, Pulse>): string {
  const p = pulse[no];
  switch (mode) {
    case 'grievances':
      return grievanceColor(no);
    case 'result2022':
      return partyColor(no);
    case 'youth':
      return youthColor(p);
    case 'priority':
      return PHASE[p?.phase] || colors.surface3;
    case 'reserved':
      return byNo[no]?.reserved === 'SC' ? '#6E8BCB' : '#2A93D6';
    default:
      return heatColor(p?.engagement || 0);
  }
}

export { heatColor };
