/**
 * API layer - the single seam between the app and its backends.
 *
 * Reference data (constituencies, results, framework, insights) stays bundled —
 * it's stable ECI/Census data. The LIVE surfaces (pulse/intensity, grievances,
 * mood, volunteers) come from PROXe's leader API, and citizen intake POSTs to
 * PROXe's agent routes.
 *
 * Going live is env-driven: set EXPO_PUBLIC_API_URL (PROXe origin) and
 * EXPO_PUBLIC_API_KEY (LEADER_API_KEY). With no env set, the app runs fully on
 * bundled/seeded data (offline demo mode).
 *
 * PROXe leader API (all under /api/leader, x-api-key):
 *   GET  /pulse   → { seats:[{ no, constituency, pulse:{voters,supporters,volunteers,cadre,grievances,resolved,conversion,...} }], totals }
 *   GET  /issues  → { issues:[{ category, count7d, trend, topConstituencies }], emerging }
 *   GET  /mood    → { overall, byConstituency }
 *   GET  /volunteers → { totals, energy, byConstituency }
 *   GET  /performance → { seats:[{ constituency, score, ... }] }
 *   POST /recommendations → { ok, id }
 * PROXe intake (under /api/agent, x-api-key = inbound key):
 *   POST /leads/inbound  ← grievance + subscribe
 */

import Constants from 'expo-constants';
import { constituencies, results, framework, byNo } from '../data';
import { buildPulse, buildAgeGroups, type Pulse } from './pulse';
import { grievancesFor } from './grievances';

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as any)?.apiBaseUrl ||
  'https://pop-proxe.vercel.app'; // real PROXe backend default (no env dependency)

// Live only when a backend origin is configured; otherwise bundled/seeded data.
const USE_LOCAL = !API_BASE;

// ── Session token (login-gated) ──
// No secret ships in the bundle. The leader logs in with a passcode, which is
// exchanged server-side for a short-lived token; that token authorizes every
// request. Persisted in localStorage (web) so a refresh stays logged in.
const TOKEN_KEY = 'pp_leader_token';
const TOKEN_EXP_KEY = 'pp_leader_token_exp';
let sessionToken: string | null = null;

function loadToken(): string | null {
  if (sessionToken) return sessionToken;
  try {
    const t = globalThis.localStorage?.getItem(TOKEN_KEY);
    const exp = Number(globalThis.localStorage?.getItem(TOKEN_EXP_KEY) || 0);
    if (t && exp > Date.now()) { sessionToken = t; return t; }
  } catch {}
  return null;
}

export function hasValidSession(): boolean {
  return !!loadToken();
}

export function clearSession() {
  sessionToken = null;
  try { globalThis.localStorage?.removeItem(TOKEN_KEY); globalThis.localStorage?.removeItem(TOKEN_EXP_KEY); } catch {}
}

// Category slugs differ between PROXe (grievance_category) and the app
// (GrievanceCat). Map PROXe → app.
const CAT_MAP: Record<string, string> = {
  jobs: 'unemployment', water: 'water', power: 'power', roads: 'roads',
  drugs: 'drugs', farm_debt: 'debt', health: 'health', education: 'education', other: 'water',
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const token = loadToken();
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// In-memory pulse cache (stable across the session).
const pulseCache: Record<number, Pulse> = {};
function localPulse(): Record<number, Pulse> {
  if (Object.keys(pulseCache).length === 0) {
    constituencies.forEach((c) => (pulseCache[c.no] = buildPulse(c.no)));
  }
  return pulseCache;
}

// Merge a PROXe pulse block into the app's Pulse shape. PROXe supplies the
// campaign numbers; the age model stays bundled (no per-seat age data yet).
function mergePulse(no: number, p: any): Pulse {
  const age = buildAgeGroups(no);
  return {
    interactions: p.interactions ?? 0,
    comments: p.comments ?? 0,
    volunteers: p.volunteers ?? 0,
    supporters: p.supporters ?? 0,
    cadre: p.cadre ?? 0,
    voters: p.voters ?? 0,
    grievances: p.grievances ?? 0,
    resolved: p.resolved ?? 0,
    conversion: p.conversion ?? 0,
    engagement: p.engagement ?? 0,
    phase: (['P1', 'P2', 'P3'] as const)[no % 3],
    age,
  };
}

// State-wide totals cache (leader headline numbers), filled by getPulseAll.
export let stateTotals: {
  voters: number; supporters: number; volunteers: number; cadre: number;
  grievances: number; resolved: number; activeSeats: number;
} | null = null;

export const api = {
  /** Exchange a leader passcode for a session token. Returns true on success. */
  async authenticate(passcode: string): Promise<boolean> {
    if (USE_LOCAL) return true; // mock mode needs no login
    try {
      const res = await fetch(`${API_BASE}/api/leader/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.ok || !data?.token) return false;
      sessionToken = data.token;
      try {
        globalThis.localStorage?.setItem(TOKEN_KEY, data.token);
        globalThis.localStorage?.setItem(TOKEN_EXP_KEY, String(Date.now() + (data.expiresInMs || 12 * 3600 * 1000)));
      } catch {}
      return true;
    } catch {
      return false;
    }
  },

  /** Whether a login is required before data will load. */
  needsLogin(): boolean {
    return !USE_LOCAL && !hasValidSession();
  },

  async getConstituencies() {
    return constituencies; // bundled reference data
  },

  async getResults() {
    return results; // bundled reference data
  },

  async getFramework() {
    return framework; // bundled reference data
  },

  async getPulseAll(): Promise<Record<number, Pulse>> {
    if (USE_LOCAL) return localPulse();
    try {
      const data = await request<{ seats: any[]; totals: any }>('/api/leader/pulse?days=30');
      stateTotals = data.totals || null;
      const map: Record<number, Pulse> = {};
      // Seed every seat so the map is complete, then overlay live data.
      constituencies.forEach((c) => (map[c.no] = mergePulse(c.no, {})));
      (data.seats || []).forEach((s) => {
        if (s.no != null && s.pulse) map[s.no] = mergePulse(s.no, s.pulse);
      });
      return map;
    } catch (e) {
      console.warn('[api] getPulseAll fell back to local:', (e as Error).message);
      return localPulse();
    }
  },

  async getConstituency(no: number) {
    const all = await this.getPulseAll();
    return { ...byNo[no], pulse: all[no] };
  },

  /** Top citizen grievances for a constituency (most-voted first). */
  async getGrievances(no: number) {
    if (USE_LOCAL) return grievancesFor(no, byNo[no]?.district || '');
    try {
      const seat = byNo[no]?.name || '';
      const data = await request<{ issues: any[] }>(`/api/leader/issues?days=30`);
      // issues are state-wide; keep those touching this seat, else top state issues.
      const forSeat = (data.issues || []).filter((i: any) => (i.topConstituencies || []).includes(seat));
      const src = (forSeat.length ? forSeat : (data.issues || [])).slice(0, 8);
      const totalReports = src.reduce((s: number, i: any) => s + (i.count7d || 0), 0) || 1;
      return {
        total: totalReports,
        items: src.map((i: any) => ({
          id: `${i.category}`,
          category: CAT_MAP[i.category] || 'water',
          title: (i.category || 'other').replace('_', ' '),
          votes: i.count7d || 0,
          pct: Math.round((100 * (i.count7d || 0)) / totalReports),
          status: 'in_progress' as const,
          trend: (i.trend > 0 ? 'up' : i.trend < 0 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
        })),
      };
    } catch (e) {
      console.warn('[api] getGrievances fell back to local:', (e as Error).message);
      return grievancesFor(no, byNo[no]?.district || '');
    }
  },

  /** Constituency mood (lean split) — for the leader's mood view. */
  async getMood(no?: number) {
    if (USE_LOCAL) return null;
    const seat = no != null ? byNo[no]?.name : undefined;
    return request<any>(`/api/leader/mood${seat ? `?constituency=${encodeURIComponent(seat)}` : ''}`);
  },

  /** Volunteer energy (signups + knocks trend, per-seat). */
  async getVolunteers() {
    if (USE_LOCAL) return null;
    return request<any>('/api/leader/volunteers');
  },

  /** Submit a grievance from the voter-journey flow → PROXe inbound lead. */
  async submitGrievance(payload: {
    no: number;
    category: string;
    description: string;
    name: string;
    phone: string;
    slot?: string;
  }) {
    if (USE_LOCAL) return { ok: true, id: `local-${Date.now()}`, ...payload };
    const seat = byNo[payload.no];
    const res = await request<{ leadId?: string }>('/api/leader/intake', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name || null,
        phone: payload.phone || null,
        constituency: seat?.name || null,
        district: seat?.district || null,
        grievance_category: payload.category || null,
        grievance_text: payload.description || null,
        engagement_type: 'grievance',
        note: payload.slot ? `Requested callback slot: ${payload.slot}` : undefined,
      }),
    });
    return { ok: true, id: res.leadId || `remote-${Date.now()}` };
  },

  /** Opt a voter into updates → PROXe inbound lead (subscribe/info). */
  async subscribe(payload: { no: number; phone?: string; channel: string }) {
    if (USE_LOCAL) return { ok: true };
    const seat = byNo[payload.no];
    await request('/api/leader/intake', {
      method: 'POST',
      body: JSON.stringify({
        phone: payload.phone || null,
        constituency: seat?.name || null,
        district: seat?.district || null,
        engagement_type: 'info',
        note: `Subscribed to updates via ${payload.channel}`,
      }),
    });
    return { ok: true };
  },

  /** Register a voter action (volunteer / join-event) → PROXe inbound lead. */
  async registerAction(payload: { no: number; action: 'volunteer' | 'event'; phone?: string; name?: string }) {
    if (USE_LOCAL) return { ok: true };
    const seat = byNo[payload.no];
    await request('/api/leader/intake', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name || null,
        phone: payload.phone || null,
        constituency: seat?.name || null,
        district: seat?.district || null,
        engagement_type: payload.action === 'volunteer' ? 'volunteer' : 'event',
        action_intent: payload.action === 'volunteer' ? 'volunteer' : 'rally',
      }),
    });
    return { ok: true };
  },

  /** Register this device's push token with the backend. */
  async registerDevice(payload: { token: string; platform: string; no?: number }) {
    // No PROXe device route yet — no-op until push is wired.
    return { ok: true };
  },

  /**
   * Leader pushes a directive to the war-room team (the "Act on this" action).
   * Lands in the War Room's Directives tab in realtime as a leader
   * recommendation. Used from grievances ("act on this problem") and from the
   * workforce panel ("mobilise these people here").
   */
  async pushToTeam(payload: { no: number; title: string; body?: string }): Promise<{ ok: boolean }> {
    if (USE_LOCAL) return { ok: true };
    const seat = byNo[payload.no];
    try {
      await request('/api/leader/recommendations', {
        method: 'POST',
        body: JSON.stringify({
          title: payload.title,
          body: payload.body || null,
          constituency: seat?.name || null,
          created_by: 'Leader app',
        }),
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },
};

export type Api = typeof api;
