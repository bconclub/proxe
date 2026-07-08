/** Access layer for the researched district intelligence (src/data/insights.json).
 *  Real figures: Census 2011 demographics, ECI 2022 turnout/seats, 2024 Lok Sabha.
 *  District turnout values are flagged approximations (see _meta.turnoutNote). */
import data from '../data/insights.json';

export type Demographics = {
  population: number;
  literacyPct: number | null;
  sexRatio: number;
  urbanPct: number;
  scPct: number | null;
};
export type DistrictInfo = {
  region: 'Majha' | 'Doaba' | 'Malwa';
  turnout2022: number;
  topIssues: string[];
  economy: string;
};
export type DistrictIntel = DistrictInfo & {
  district: string;
  demographics: Demographics | null;
  regionColor: string;
};

const districts = (data as any).districts as Record<string, DistrictInfo>;
const demographics = (data as any).demographics as Record<string, Demographics>;
const regionColors = (data as any)._meta.regionColors as Record<string, string>;
const lokSabha = (data as any).lokSabha2024 as { name: string; winner: string; party: string }[];

export const overall = (data as any).overall as {
  turnoutPct: number;
  totalElectors: number;
  seats: Record<string, number>;
};

export const ISSUE_LABEL: Record<string, string> = {
  water: 'Groundwater stress',
  drugs: 'Drugs / de-addiction',
  agriculture: 'Agriculture',
  unemployment: 'Unemployment',
  migration: 'Youth migration',
  industry: 'Industry',
  debt: 'Farmer debt',
  power: 'Power',
  roads: 'Roads',
  health: 'Health · cancer belt',
  education: 'Education',
};

export function regionColor(region: string): string {
  return regionColors[region] || '#2E8DE6';
}

/** Full intel for a district, demographics merged in. */
export function districtIntel(district: string): DistrictIntel | null {
  const d = districts[district];
  if (!d) return null;
  return {
    district,
    ...d,
    demographics: demographics[district] || null,
    regionColor: regionColor(d.region),
  };
}

/** 2024 Lok Sabha representative for a constituency's parent LS seat (lha). */
export function lokSabhaFor(lhaName: string) {
  return lokSabha.find((l) => l.name === lhaName) || null;
}
