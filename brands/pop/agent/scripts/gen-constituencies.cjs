const fs = require('fs');
const path = require('path');
const g = require(path.join(__dirname, '..', 'src', 'data', 'punjab-ac.json'));

const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
// Trailing parenthetical on a constituency name is always the SC/ST reservation
// marker (and the source GeoJSON truncates a few, e.g. "(S"). Strip from "(".
const cleanName = (s) => s.replace(/\s*\(.*$/, '').replace(/\s+/g, ' ').trim();
const cleanDistrict = (s) => title(s.replace(/\s*\*+\s*$/, '').trim());

const MAJHA = new Set(['GURDASPUR', 'PATHANKOT', 'AMRITSAR', 'TARN TARAN']);
const DOABA = new Set(['JALANDHAR', 'HOSHIARPUR', 'KAPURTHALA', 'NAWANSHAHR', 'SBS NAGAR', 'SHAHID BHAGAT SINGH NAGAR', 'SHAHEED BHAGAT SINGH NAGAR']);
const regionFor = (rawDistrict) => {
  const d = rawDistrict.replace(/\s*\*+\s*$/, '').trim().toUpperCase();
  if (MAJHA.has(d)) return 'Majha';
  if (DOABA.has(d)) return 'Doaba';
  return 'Malwa';
};

const seats = g.features
  .map((f) => ({
    no: f.properties.no,
    name: cleanName(f.properties.name),
    district: cleanDistrict(f.properties.district),
    region: regionFor(f.properties.district),
  }))
  .sort((a, b) => a.no - b.no);

const body = seats.map((s) => `  C(${JSON.stringify(s.name)}, ${JSON.stringify(s.district)}, '${s.region}', ${s.no}),`).join('\n');

const ts = `// 117 Punjab Vidhan Sabha constituencies — generated from src/data/punjab-ac.json
// (authoritative ECI geometry) by scripts/gen-constituencies.cjs. Read-only.
export type Region = 'Majha' | 'Doaba' | 'Malwa';
export interface Constituency { id: string; name: string; district: string; region: Region; no: number; }
const C = (name: string, district: string, region: Region, no: number): Constituency => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), name, district, region, no,
});
export const CONSTITUENCIES: Constituency[] = [
${body}
];
export const DISTRICTS: string[] = Array.from(new Set(CONSTITUENCIES.map((c) => c.district))).sort();
export const CONSTITUENCY_NAMES: string[] = CONSTITUENCIES.map((c) => c.name);
export const TOTAL_SEATS = CONSTITUENCIES.length;
// Normalize for matching GeoJSON feature names to data names (strip (SC)/(ST), punctuation, case).
export const normName = (s: string): string =>
  (s || '').toLowerCase().replace(/\\((?:sc|st)\\)/g, '').replace(/[^a-z0-9]/g, '');
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'lib', 'war-room', 'constituencies.ts'), ts);
fs.writeFileSync(
  path.join(__dirname, '..', '..', 'supabase', '_seats.json'),
  JSON.stringify(seats.map((s) => ({ name: s.name, district: s.district, region: s.region })), null, 0),
);
const byR = seats.reduce((a, s) => ((a[s.region] = (a[s.region] || 0) + 1), a), {});
console.log(`wrote ${seats.length} seats; regions ${JSON.stringify(byR)}; districts ${new Set(seats.map((s) => s.district)).size}`);
console.log('sample:', seats.filter((s) => /Hargobindpur|Nagar|Nihal|Nawan|Banga/.test(s.name)).map((s) => `${s.name} [${s.district}/${s.region}]`).join(', '));
