/** Local feed store — the leader's actions land here INSTANTLY so the Feed and
 *  the bell always show something in the demo, independent of the backend
 *  round-trip. Persisted to localStorage so a refresh keeps them. The backend
 *  push is still attempted (best-effort) so directives also reach the War Room. */
import type { FeedItem } from './api';

const KEY = 'pp_local_feed';
let items: FeedItem[] = load();
let lastSeen = loadSeen();
const subs = new Set<() => void>();

function load(): FeedItem[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as FeedItem[]) : [];
  } catch {
    return [];
  }
}
function loadSeen(): number {
  try {
    return Number(globalThis.localStorage?.getItem(KEY + '_seen') || 0);
  } catch {
    return 0;
  }
}
function persist() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(items.slice(0, 100)));
  } catch {
    /* private mode / no storage — stay in memory */
  }
}
function emit() {
  subs.forEach((fn) => fn());
}

/** Add an action the leader just pushed. Returns the stored item. */
export function addLocalAction(a: { title: string; body: string; constituency?: string | null }): FeedItem {
  const it: FeedItem = {
    id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    title: a.title,
    body: a.body,
    source: 'leader',
    constituency: a.constituency ?? null,
    status: 'new',
    created_by: 'You',
    created_at: new Date().toISOString(),
  };
  items = [it, ...items];
  persist();
  emit();
  return it;
}

/** Locally-pushed items, newest first. */
export function getLocalFeed(): FeedItem[] {
  return items;
}

/** Merge local + server items (local wins on id), newest first. */
export function mergeFeed(server: FeedItem[]): FeedItem[] {
  const seen = new Set(items.map((i) => i.id));
  const merged = [...items, ...server.filter((s) => !seen.has(s.id))];
  return merged.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

/** How many local actions are newer than the last time the Feed was opened. */
export function unreadCount(): number {
  return items.filter((i) => +new Date(i.created_at) > lastSeen).length;
}

/** Call when the Feed is opened — clears the bell badge. */
export function markSeen() {
  lastSeen = Date.now();
  try {
    globalThis.localStorage?.setItem(KEY + '_seen', String(lastSeen));
  } catch {
    /* no-op */
  }
  emit();
}

export function subscribeFeed(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
