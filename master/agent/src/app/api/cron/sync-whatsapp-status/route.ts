/**
 * WhatsApp Delivery Status Sync Cron Job
 * 
 * Run daily at midnight to sync pending/sent message statuses from Meta API.
 * Handles missed webhooks and stuck messages.
 * 
 * Endpoint: /api/cron/sync-whatsapp-status
 * Method: GET (with CRON_SECRET header) or POST
 * 
 * Environment Variables:
 * - CRON_SECRET: Secret key to prevent unauthorized access
 * - META_WHATSAPP_ACCESS_TOKEN: Meta Graph API token
 * - META_WHATSAPP_BUSINESS_ACCOUNT_ID: WhatsApp Business Account ID
 * 
 * Query Parameters:
 * - dryRun: If 'true', only log what would be updated without making changes
 * - limit: Max messages to process (default: 100, max: 500)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, getClient } from '@/lib/services';

export const dynamic = 'force-dynamic';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface SyncStats {
  processed: number;
  updated: number;
  stillPending: number;
  failed: number;
  errors: string[];
}

/**
 * Fetch message status from Meta Graph API
 */
async function fetchMetaMessageStatus(
  wamid: string,
  accessToken: string,
  businessAccountId: string
): Promise<{ status: string; error?: string } | null> {
  try {
    const url = `${GRAPH_API_BASE}/${businessAccountId}/messages/${wamid}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[sync-whatsapp-status] Meta API error for ${wamid}:`, res.status, errText);
      return null;
    }

    const data = await res.json();
    return {
      status: data.status || 'unknown',
      error: data.errors?.[0]?.message,
    };
  } catch (err) {
    console.error(`[sync-whatsapp-status] Failed to fetch status for ${wamid}:`, err);
    return null;
  }
}

/**
 * Update conversation with new delivery status
 */
async function updateConversationStatus(
  supabase: any,
  conversationId: string,
  status: string,
  error?: string
): Promise<boolean> {
  try {
    const updateData: any = {
      delivery_status: status,
      status_updated_at: new Date().toISOString(),
    };

    if (error) {
      updateData.status_error = error;
    }

    const { error: updateError } = await supabase
      .from('conversations')
      .update(updateData)
      .eq('id', conversationId);

    if (updateError) {
      console.error(`[sync-whatsapp-status] Update failed for ${conversationId}:`, updateError);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[sync-whatsapp-status] Exception updating ${conversationId}:`, err);
    return false;
  }
}

/**
 * Main sync function
 */
async function runStatusSync(
  supabase: any,
  dryRun: boolean,
  limit: number
): Promise<SyncStats> {
  const stats: SyncStats = {
    processed: 0,
    updated: 0,
    stillPending: 0,
    failed: 0,
    errors: [],
  };

  // Get credentials from environment
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const businessAccountId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !businessAccountId) {
    stats.errors.push('Missing META_WHATSAPP_ACCESS_TOKEN or META_WHATSAPP_BUSINESS_ACCOUNT_ID');
    return stats;
  }

  // Fetch pending/sent messages from last 7 days
  const { data: messages, error: queryError } = await supabase
    .from('conversations')
    .select('id, metadata, delivery_status, created_at')
    .in('delivery_status', ['pending', 'sent'])
    .gt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (queryError) {
    stats.errors.push(`Query error: ${queryError.message}`);
    return stats;
  }

  if (!messages || messages.length === 0) {
    console.log('[sync-whatsapp-status] No pending messages found');
    return stats;
  }

  console.log(`[sync-whatsapp-status] Found ${messages.length} messages to sync`);

  for (const msg of messages) {
    stats.processed++;

    const wamid = msg.metadata?.whatsapp_message_id || msg.metadata?.wa_message_id;
    if (!wamid) {
      console.warn(`[sync-whatsapp-status] Message ${msg.id} has no wamid`);
      continue;
    }

    // Fetch current status from Meta
    const metaStatus = await fetchMetaMessageStatus(wamid, accessToken, businessAccountId);

    if (!metaStatus) {
      stats.errors.push(`Failed to fetch status for ${wamid}`);
      continue;
    }

    // Skip if status hasn't changed
    if (metaStatus.status === msg.delivery_status) {
      stats.stillPending++;
      console.log(`[sync-whatsapp-status] ${wamid}: status unchanged (${metaStatus.status})`);
      continue;
    }

    // Update if not dry run
    if (!dryRun) {
      const updated = await updateConversationStatus(
        supabase,
        msg.id,
        metaStatus.status,
        metaStatus.error
      );

      if (updated) {
        stats.updated++;
        console.log(`[sync-whatsapp-status] Updated ${wamid}: ${msg.delivery_status} -> ${metaStatus.status}`);
      } else {
        stats.errors.push(`Failed to update ${msg.id}`);
      }
    } else {
      console.log(`[sync-whatsapp-status] [DRY RUN] Would update ${wamid}: ${msg.delivery_status} -> ${metaStatus.status}`);
      stats.updated++;
    }

    // Count as failed if new status is failed
    if (metaStatus.status === 'failed') {
      stats.failed++;
    }

    // Rate limiting: wait 100ms between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return stats;
}

/**
 * Cleanup old processed entries from status_sync_queue
 */
async function cleanupSyncQueue(supabase: any): Promise<number> {
  const { data, error } = await supabase
    .from('status_sync_queue')
    .delete()
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .not('processed_at', 'is', null)
    .select('count');

  if (error) {
    console.error('[sync-whatsapp-status] Queue cleanup error:', error);
    return 0;
  }

  return data?.length || 0;
}

/**
 * Process unprocessed queue entries (race condition handling)
 */
async function processSyncQueue(supabase: any, dryRun: boolean): Promise<number> {
  const { data: queueEntries, error: queueError } = await supabase
    .from('status_sync_queue')
    .select('*')
    .is('processed_at', null)
    .lt('retry_count', 5)
    .order('created_at', { ascending: true })
    .limit(50);

  if (queueError || !queueEntries || queueEntries.length === 0) {
    return 0;
  }

  let processed = 0;

  for (const entry of queueEntries) {
    // Find matching conversation
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, delivery_status')
      .or(`metadata->>whatsapp_message_id.eq.${entry.whatsapp_message_id},metadata->>wa_message_id.eq.${entry.whatsapp_message_id}`)
      .limit(1);

    if (conversations && conversations.length > 0) {
      const conv = conversations[0];
      
      if (!dryRun) {
        await supabase
          .from('conversations')
          .update({
            delivery_status: entry.status,
            status_updated_at: entry.timestamp,
          })
          .eq('id', conv.id);

        // Mark queue entry as processed
        await supabase
          .from('status_sync_queue')
          .update({ processed_at: new Date().toISOString() })
          .eq('id', entry.id);
      }

      processed++;
      console.log(`[sync-whatsapp-status] Processed queue entry: ${entry.whatsapp_message_id} -> ${entry.status}`);
    } else {
      // Increment retry count
      await supabase
        .from('status_sync_queue')
        .update({ retry_count: entry.retry_count + 1 })
        .eq('id', entry.id);
    }
  }

  return processed;
}

/**
 * GET handler - for cron job schedulers (Vercel Cron, etc.)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== expectedSecret) {
    console.warn('[sync-whatsapp-status] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse options
  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') || '100'),
    500
  );

  console.log(`[sync-whatsapp-status] Starting sync (dryRun=${dryRun}, limit=${limit})`);

  const supabase = getServiceClient() || getClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  try {
    // Process sync queue first (race condition recovery)
    const queueProcessed = await processSyncQueue(supabase, dryRun);

    // Run main sync
    const stats = await runStatusSync(supabase, dryRun, limit);

    // Cleanup old queue entries
    const cleanedUp = await cleanupSyncQueue(supabase);

    const result = {
      success: true,
      dryRun,
      stats: {
        ...stats,
        queueProcessed,
        queueCleaned: cleanedUp,
      },
      timestamp: new Date().toISOString(),
    };

    console.log('[sync-whatsapp-status] Sync complete:', result);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[sync-whatsapp-status] Sync failed:', err);
    return NextResponse.json(
      { error: 'Sync failed', message: (err as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST handler - for manual triggers or alternative schedulers
 */
export async function POST(request: NextRequest) {
  // Verify cron secret from header or body
  let body: any = {};
  try {
    body = await request.json();
  } catch {}

  const cronSecret = request.headers.get('x-cron-secret') || body.secret;
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = body.dryRun === true;
  const limit = Math.min(body.limit || 100, 500);

  const supabase = getServiceClient() || getClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  try {
    const queueProcessed = await processSyncQueue(supabase, dryRun);
    const stats = await runStatusSync(supabase, dryRun, limit);
    const cleanedUp = await cleanupSyncQueue(supabase);

    return NextResponse.json({
      success: true,
      dryRun,
      stats: {
        ...stats,
        queueProcessed,
        queueCleaned: cleanedUp,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[sync-whatsapp-status] Sync failed:', err);
    return NextResponse.json(
      { error: 'Sync failed', message: (err as Error).message },
      { status: 500 }
    );
  }
}
