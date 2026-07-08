/** Typed access to the bundled datasets. These ship in the app and are also
 *  mirrored by the API layer (src/lib/api.ts) so a real backend can replace them. */

import constituenciesRaw from './constituencies.json';
import resultsRaw from './results-2022.json';
import frameworkRaw from './framework.json';
import pincodesRaw from './pincodes.json';
import geoRaw from './punjab-ac.json';

export type Constituency = {
  no: number;
  name: string;
  district: string;
  reserved: 'SC' | null;
  lha: string;
};

export type Winner = { winner: string; party: string };
export type Party = { id: string; name: string; seats: number; votePct: number; color: string };
export type Results = {
  election: string;
  totalSeats: number;
  parties: Party[];
  winners: Record<string, Winner>;
};

export type GeoFeature = {
  type: 'Feature';
  properties: { no: number; name: string; district: string };
  geometry: { type: 'Polygon'; coordinates: number[][][] };
};
export type GeoCollection = { type: 'FeatureCollection'; features: GeoFeature[] };

export const constituencies = constituenciesRaw as Constituency[];
export const results = resultsRaw as Results;
export const framework = frameworkRaw as any;
export const pincodes = pincodesRaw as Record<string, { no: number } | string>;
export const geo = geoRaw as unknown as GeoCollection;

export const byNo: Record<number, Constituency> = Object.fromEntries(
  constituencies.map((c) => [c.no, c]),
);

export const districts = [...new Set(constituencies.map((c) => c.district))].sort();
