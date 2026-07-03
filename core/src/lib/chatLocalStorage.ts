export type StorageBrandKey = 'proxe' | 'windchasers' | 'bcon';

const getKeys = (brand: StorageBrandKey) => ({
  sessionKey: `${brand}.chat.sessionId`,
  userKey: `${brand}.chat.user`,
});

export interface LocalUserProfile {
  name?: string;
  phone?: string;
  phoneSkipped?: boolean;
  email?: string;
  emailSkipped?: boolean;
  websiteUrl?: string;
  promptedName?: boolean;
  promptedEmail?: boolean;
  promptedPhone?: boolean;
}

export function getStoredSessionId(brand: StorageBrandKey = 'proxe'): string | null {
  if (typeof window === 'undefined') return null;
  const { sessionKey } = getKeys(brand);
  return localStorage.getItem(sessionKey);
}

export function storeSessionId(id: string, brand: StorageBrandKey = 'proxe') {
  if (typeof window === 'undefined') return;
  const { sessionKey } = getKeys(brand);
  localStorage.setItem(sessionKey, id);
}

export function clearSessionId(brand: StorageBrandKey = 'proxe') {
  if (typeof window === 'undefined') return;
  const { sessionKey } = getKeys(brand);
  localStorage.removeItem(sessionKey);
}

export function getStoredUser(brand: StorageBrandKey = 'proxe'): LocalUserProfile | null {
  if (typeof window === 'undefined') return null;
  const { userKey } = getKeys(brand);
  try {
    const raw = localStorage.getItem(userKey);
    if (!raw) return null;
    return JSON.parse(raw) as LocalUserProfile;
  } catch {
    return null;
  }
}

export function storeUserProfile(profile: LocalUserProfile, brand: StorageBrandKey = 'proxe') {
  if (typeof window === 'undefined') return;
  const { userKey } = getKeys(brand);
  localStorage.setItem(userKey, JSON.stringify(profile));
}

export function clearDraftMessages() {
  // no-op retained for backward compatibility
}
