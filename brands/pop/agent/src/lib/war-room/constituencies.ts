// 117 Punjab Vidhan Sabha constituencies, grouped by district (23) and region.
// Reference data ONLY — read-only. Used by the war-room map, filters, and seed.
// Names follow the ECI 2022 AC list; regions: Majha / Doaba / Malwa.

export type Region = 'Majha' | 'Doaba' | 'Malwa';

export interface Constituency {
  id: string;        // slug
  name: string;      // display name
  district: string;  // 1 of 23
  region: Region;
}

const C = (name: string, district: string, region: Region): Constituency => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  name,
  district,
  region,
});

export const CONSTITUENCIES: Constituency[] = [
  // ── MAJHA ──────────────────────────────────────────────────────────────
  C('Sujanpur', 'Pathankot', 'Majha'),
  C('Bhoa', 'Pathankot', 'Majha'),
  C('Pathankot', 'Pathankot', 'Majha'),
  C('Gurdaspur', 'Gurdaspur', 'Majha'),
  C('Dina Nagar', 'Gurdaspur', 'Majha'),
  C('Qadian', 'Gurdaspur', 'Majha'),
  C('Batala', 'Gurdaspur', 'Majha'),
  C('Sri Hargobindpur', 'Gurdaspur', 'Majha'),
  C('Fatehgarh Churian', 'Gurdaspur', 'Majha'),
  C('Dera Baba Nanak', 'Gurdaspur', 'Majha'),
  C('Ajnala', 'Amritsar', 'Majha'),
  C('Raja Sansi', 'Amritsar', 'Majha'),
  C('Majitha', 'Amritsar', 'Majha'),
  C('Jandiala', 'Amritsar', 'Majha'),
  C('Amritsar North', 'Amritsar', 'Majha'),
  C('Amritsar West', 'Amritsar', 'Majha'),
  C('Amritsar Central', 'Amritsar', 'Majha'),
  C('Amritsar East', 'Amritsar', 'Majha'),
  C('Amritsar South', 'Amritsar', 'Majha'),
  C('Attari', 'Amritsar', 'Majha'),
  C('Tarn Taran', 'Tarn Taran', 'Majha'),
  C('Khem Karan', 'Tarn Taran', 'Majha'),
  C('Patti', 'Tarn Taran', 'Majha'),
  C('Khadoor Sahib', 'Tarn Taran', 'Majha'),
  C('Baba Bakala', 'Amritsar', 'Majha'),

  // ── DOABA ──────────────────────────────────────────────────────────────
  C('Bholath', 'Kapurthala', 'Doaba'),
  C('Kapurthala', 'Kapurthala', 'Doaba'),
  C('Sultanpur Lodhi', 'Kapurthala', 'Doaba'),
  C('Phagwara', 'Kapurthala', 'Doaba'),
  C('Phillaur', 'Jalandhar', 'Doaba'),
  C('Nakodar', 'Jalandhar', 'Doaba'),
  C('Shahkot', 'Jalandhar', 'Doaba'),
  C('Kartarpur', 'Jalandhar', 'Doaba'),
  C('Jalandhar West', 'Jalandhar', 'Doaba'),
  C('Jalandhar Central', 'Jalandhar', 'Doaba'),
  C('Jalandhar North', 'Jalandhar', 'Doaba'),
  C('Jalandhar Cantt', 'Jalandhar', 'Doaba'),
  C('Adampur', 'Jalandhar', 'Doaba'),
  C('Mukerian', 'Hoshiarpur', 'Doaba'),
  C('Dasuya', 'Hoshiarpur', 'Doaba'),
  C('Urmar', 'Hoshiarpur', 'Doaba'),
  C('Sham Chaurasi', 'Hoshiarpur', 'Doaba'),
  C('Hoshiarpur', 'Hoshiarpur', 'Doaba'),
  C('Chabbewal', 'Hoshiarpur', 'Doaba'),
  C('Garhshankar', 'Hoshiarpur', 'Doaba'),
  C('Banga', 'SBS Nagar', 'Doaba'),
  C('Nawanshahr', 'SBS Nagar', 'Doaba'),
  C('Balachaur', 'SBS Nagar', 'Doaba'),

  // ── MALWA ──────────────────────────────────────────────────────────────
  C('Anandpur Sahib', 'Rupnagar', 'Malwa'),
  C('Rupnagar', 'Rupnagar', 'Malwa'),
  C('Chamkaur Sahib', 'Rupnagar', 'Malwa'),
  C('Kharar', 'SAS Nagar', 'Malwa'),
  C('SAS Nagar', 'SAS Nagar', 'Malwa'),
  C('Bassi Pathana', 'Fatehgarh Sahib', 'Malwa'),
  C('Fatehgarh Sahib', 'Fatehgarh Sahib', 'Malwa'),
  C('Amloh', 'Fatehgarh Sahib', 'Malwa'),
  C('Khanna', 'Ludhiana', 'Malwa'),
  C('Samrala', 'Ludhiana', 'Malwa'),
  C('Sahnewal', 'Ludhiana', 'Malwa'),
  C('Ludhiana East', 'Ludhiana', 'Malwa'),
  C('Ludhiana South', 'Ludhiana', 'Malwa'),
  C('Atam Nagar', 'Ludhiana', 'Malwa'),
  C('Ludhiana Central', 'Ludhiana', 'Malwa'),
  C('Ludhiana West', 'Ludhiana', 'Malwa'),
  C('Ludhiana North', 'Ludhiana', 'Malwa'),
  C('Gill', 'Ludhiana', 'Malwa'),
  C('Payal', 'Ludhiana', 'Malwa'),
  C('Dakha', 'Ludhiana', 'Malwa'),
  C('Raikot', 'Ludhiana', 'Malwa'),
  C('Jagraon', 'Ludhiana', 'Malwa'),
  C('Nihal Singh Wala', 'Moga', 'Malwa'),
  C('Baghapurana', 'Moga', 'Malwa'),
  C('Moga', 'Moga', 'Malwa'),
  C('Dharamkot', 'Moga', 'Malwa'),
  C('Zira', 'Ferozepur', 'Malwa'),
  C('Ferozepur City', 'Ferozepur', 'Malwa'),
  C('Ferozepur Rural', 'Ferozepur', 'Malwa'),
  C('Guru Har Sahai', 'Ferozepur', 'Malwa'),
  C('Jalalabad', 'Fazilka', 'Malwa'),
  C('Fazilka', 'Fazilka', 'Malwa'),
  C('Abohar', 'Fazilka', 'Malwa'),
  C('Balluana', 'Fazilka', 'Malwa'),
  C('Lambi', 'Sri Muktsar Sahib', 'Malwa'),
  C('Gidderbaha', 'Sri Muktsar Sahib', 'Malwa'),
  C('Malout', 'Sri Muktsar Sahib', 'Malwa'),
  C('Muktsar', 'Sri Muktsar Sahib', 'Malwa'),
  C('Faridkot', 'Faridkot', 'Malwa'),
  C('Kotkapura', 'Faridkot', 'Malwa'),
  C('Jaitu', 'Faridkot', 'Malwa'),
  C('Rampura Phul', 'Bathinda', 'Malwa'),
  C('Bhucho Mandi', 'Bathinda', 'Malwa'),
  C('Bathinda Urban', 'Bathinda', 'Malwa'),
  C('Bathinda Rural', 'Bathinda', 'Malwa'),
  C('Talwandi Sabo', 'Bathinda', 'Malwa'),
  C('Maur', 'Bathinda', 'Malwa'),
  C('Mansa', 'Mansa', 'Malwa'),
  C('Sardulgarh', 'Mansa', 'Malwa'),
  C('Budhlada', 'Mansa', 'Malwa'),
  C('Lehra', 'Sangrur', 'Malwa'),
  C('Dirba', 'Sangrur', 'Malwa'),
  C('Sunam', 'Sangrur', 'Malwa'),
  C('Bhadaur', 'Barnala', 'Malwa'),
  C('Barnala', 'Barnala', 'Malwa'),
  C('Mehal Kalan', 'Barnala', 'Malwa'),
  C('Malerkotla', 'Malerkotla', 'Malwa'),
  C('Amargarh', 'Malerkotla', 'Malwa'),
  C('Dhuri', 'Sangrur', 'Malwa'),
  C('Sangrur', 'Sangrur', 'Malwa'),
  C('Nabha', 'Patiala', 'Malwa'),
  C('Patiala Rural', 'Patiala', 'Malwa'),
  C('Rajpura', 'Patiala', 'Malwa'),
  C('Dera Bassi', 'SAS Nagar', 'Malwa'),
  C('Ghanaur', 'Patiala', 'Malwa'),
  C('Sanaur', 'Patiala', 'Malwa'),
  C('Patiala', 'Patiala', 'Malwa'),
  C('Samana', 'Patiala', 'Malwa'),
  C('Shutrana', 'Patiala', 'Malwa'),
];

export const DISTRICTS: string[] = Array.from(new Set(CONSTITUENCIES.map((c) => c.district))).sort();
export const CONSTITUENCY_NAMES: string[] = CONSTITUENCIES.map((c) => c.name);
export const CONSTITUENCY_BY_ID: Record<string, Constituency> = Object.fromEntries(
  CONSTITUENCIES.map((c) => [c.id, c]),
);

// Sanity: this list is the canonical 117. If it ever drifts, the map still renders
// whatever rows exist; unknown constituencies from data fall into an "Other" bucket.
export const TOTAL_SEATS = CONSTITUENCIES.length;
