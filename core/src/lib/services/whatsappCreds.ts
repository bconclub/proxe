/**
 * services/whatsappCreds.ts - single source of truth for WhatsApp Cloud API
 * credentials.
 *
 * Resolution order:
 *   1. Active row in `whatsapp_connections` (created by the dashboard's
 *      embedded-signup "Connect WhatsApp" flow - Agents → WhatsApp).
 *   2. META_WHATSAPP_* env vars (legacy per-brand wiring). Brands that never
 *      run the connect flow keep working exactly as before.
 *
 * The DB lookup is cached for 60s so per-message sends don't add a query.
 * Call invalidateWhatsAppCreds() after connect/disconnect.
 */

import { getServiceClient } from './supabase';
import { getCurrentBrandId } from '@/configs';

export type WhatsAppCreds = {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string | null;
  source: 'connection' | 'env';
};

const CACHE_TTL_MS = 60_000;
let cached: { creds: WhatsAppCreds | null; at: number } | null = null;

function envCreds(): WhatsAppCreds | null {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return {
    phoneNumberId,
    accessToken,
    wabaId:
      process.env.META_WHATSAPP_WABA_ID ||
      process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID ||
      null,
    source: 'env',
  };
}

async function connectionCreds(): Promise<WhatsAppCreds | null> {
  try {
    const supabase = getServiceClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .select('phone_number_id, access_token, waba_id')
      .eq('brand', getCurrentBrandId())
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    // Table missing (migration not run) or any read error → env fallback.
    if (error || !data?.phone_number_id || !data?.access_token) return null;
    return {
      phoneNumberId: data.phone_number_id,
      accessToken: data.access_token,
      wabaId: data.waba_id || null,
      source: 'connection',
    };
  } catch {
    return null;
  }
}

/** Resolve WhatsApp send credentials: dashboard connection first, env fallback. */
export async function getWhatsAppCreds(): Promise<WhatsAppCreds | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.creds;
  const creds = (await connectionCreds()) || envCreds();
  cached = { creds, at: Date.now() };
  return creds;
}

/** Drop the cache - call after connect/disconnect so sends pick up the change. */
export function invalidateWhatsAppCreds(): void {
  cached = null;
}
