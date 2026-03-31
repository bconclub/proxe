/**
 * Meta Template Sync Worker
 * 
 * Polls Meta Business API every 6 hours to sync template approval status
 * Updates follow_up_templates.meta_status in Supabase
 * 
 * Environment variables required:
 * - META_ACCESS_TOKEN (or META_WHATSAPP_ACCESS_TOKEN)
 * - META_WABA_ID (or META_WHATSAPP_WABA_ID)
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * 
 * Scheduling: PM2 cron_restart: "0 */6 * * *"
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Rate limiting: Meta allows 60 calls/minute per WABA
const RATE_LIMIT_DELAY_MS = 1000; // 1 second between calls (60/min max)
const MAX_RETRIES = 1;

// Logging
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, `sync-${new Date().toISOString().split('T')[0]}.log`);

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ============================================================================
// LOGGER
// ============================================================================

function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`;
  
  console.log(logLine);
  
  // Append to log file
  try {
    fs.appendFileSync(LOG_FILE, logLine + '\n');
  } catch (err) {
    // Silent fail for logging errors
  }
}

// ============================================================================
// ENVIRONMENT
// ============================================================================

function getEnvVars() {
  const accessToken = process.env.META_ACCESS_TOKEN || 
                      process.env.META_WHATSAPP_ACCESS_TOKEN ||
                      process.env.WA_TOKEN;
  
  const wabaId = process.env.META_WABA_ID || 
                 process.env.META_WHATSAPP_WABA_ID;
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!accessToken) missing.push('META_ACCESS_TOKEN or META_WHATSAPP_ACCESS_TOKEN');
  if (!wabaId) missing.push('META_WABA_ID or META_WHATSAPP_WABA_ID');
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return { accessToken: accessToken!, wabaId: wabaId!, supabaseUrl: supabaseUrl!, supabaseServiceKey: supabaseServiceKey! };
}

// ============================================================================
// META API CLIENT
// ============================================================================

interface MetaTemplate {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'PENDING_DELETION' | 'DELETED' | 'DISABLED' | 'IN_APPEAL';
  category: string;
  language: string;
  rejection_reason?: string;
}

async function fetchMetaTemplates(
  accessToken: string, 
  wabaId: string, 
  retryCount = 0
): Promise<MetaTemplate[]> {
  const url = `${GRAPH_API_BASE}/${wabaId}/message_templates?limit=100`;
  
  try {
    log('info', 'Fetching templates from Meta API', { wabaId, url: url.replace(accessToken, '***') });
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle rate limiting (429)
      if (response.status === 429) {
        log('warn', 'Rate limited by Meta API, waiting before retry');
        await sleep(60000); // Wait 1 minute
        if (retryCount < MAX_RETRIES) {
          return fetchMetaTemplates(accessToken, wabaId, retryCount + 1);
        }
      }
      
      throw new Error(`Meta API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const templates = data.data || [];
    
    log('info', `Fetched ${templates.length} templates from Meta`);
    return templates.map((t: any) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
      rejection_reason: t.rejection_reason,
    }));
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      log('warn', 'Retrying Meta API call after error', { error: (error as Error).message });
      await sleep(RATE_LIMIT_DELAY_MS * 2);
      return fetchMetaTemplates(accessToken, wabaId, retryCount + 1);
    }
    throw error;
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

interface DbTemplate {
  id: string;
  meta_template_name: string | null;
  meta_status: string;
  meta_template_id: string | null;
  stage: string;
  day: number;
  variant: string;
}

async function fetchDbTemplates(supabase: SupabaseClient): Promise<DbTemplate[]> {
  log('info', 'Fetching templates from Supabase');
  
  const { data, error } = await supabase
    .from('follow_up_templates')
    .select('id, meta_template_name, meta_status, meta_template_id, stage, day, variant')
    .not('meta_template_name', 'is', null);

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  log('info', `Fetched ${data?.length || 0} templates from database`);
  return data || [];
}

async function updateTemplateStatus(
  supabase: SupabaseClient,
  templateId: string,
  metaStatus: string,
  metaTemplateId: string,
  rejectionReason?: string
): Promise<void> {
  const updates: Record<string, any> = {
    meta_status: metaStatus.toLowerCase(),
    meta_template_id: metaTemplateId,
    updated_at: new Date().toISOString(),
  };

  if (rejectionReason) {
    updates.meta_rejection_reason = rejectionReason;
  }

  const { error } = await supabase
    .from('follow_up_templates')
    .update(updates)
    .eq('id', templateId);

  if (error) {
    log('error', `Failed to update template ${templateId}`, { error: error.message });
    throw error;
  }
}

// ============================================================================
// SYNC LOGIC
// ============================================================================

interface SyncResult {
  totalMetaTemplates: number;
  totalDbTemplates: number;
  matched: number;
  updated: number;
  skipped: number;
  errors: number;
  details: Array<{
    templateName: string;
    oldStatus: string;
    newStatus: string;
    action: 'updated' | 'skipped' | 'error';
  }>;
}

function mapMetaStatusToDb(status: string): string {
  // Meta statuses: APPROVED, PENDING, REJECTED, PAUSED, PENDING_DELETION, DELETED, DISABLED, IN_APPEAL
  // DB statuses: pending, approved, rejected
  const statusMap: Record<string, string> = {
    'APPROVED': 'approved',
    'PENDING': 'pending',
    'REJECTED': 'rejected',
    'PAUSED': 'rejected',
    'PENDING_DELETION': 'rejected',
    'DELETED': 'rejected',
    'DISABLED': 'rejected',
    'IN_APPEAL': 'pending',
  };
  
  return statusMap[status] || status.toLowerCase();
}

async function syncTemplates(
  supabase: SupabaseClient,
  accessToken: string,
  wabaId: string
): Promise<SyncResult> {
  const result: SyncResult = {
    totalMetaTemplates: 0,
    totalDbTemplates: 0,
    matched: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // Fetch templates from both sources
  const [metaTemplates, dbTemplates] = await Promise.all([
    fetchMetaTemplates(accessToken, wabaId),
    fetchDbTemplates(supabase),
  ]);

  result.totalMetaTemplates = metaTemplates.length;
  result.totalDbTemplates = dbTemplates.length;

  // Create lookup map for Meta templates
  const metaTemplateMap = new Map<string, MetaTemplate>();
  for (const template of metaTemplates) {
    metaTemplateMap.set(template.name, template);
  }

  // Process each DB template
  for (const dbTemplate of dbTemplates) {
    if (!dbTemplate.meta_template_name) {
      result.skipped++;
      continue;
    }

    const metaTemplate = metaTemplateMap.get(dbTemplate.meta_template_name);
    
    if (!metaTemplate) {
      // Template not found in Meta - might be deleted or name mismatch
      log('warn', `Template not found in Meta: ${dbTemplate.meta_template_name}`, {
        stage: dbTemplate.stage,
        day: dbTemplate.day,
        variant: dbTemplate.variant,
      });
      result.skipped++;
      result.details.push({
        templateName: dbTemplate.meta_template_name,
        oldStatus: dbTemplate.meta_status,
        newStatus: 'not_found',
        action: 'skipped',
      });
      continue;
    }

    result.matched++;

    // Map Meta status to DB status
    const newDbStatus = mapMetaStatusToDb(metaTemplate.status);
    const currentDbStatus = dbTemplate.meta_status?.toLowerCase();

    // Only update if status changed
    if (newDbStatus !== currentDbStatus) {
      try {
        // Rate limiting delay
        await sleep(RATE_LIMIT_DELAY_MS);
        
        await updateTemplateStatus(
          supabase,
          dbTemplate.id,
          newDbStatus,
          metaTemplate.id,
          metaTemplate.rejection_reason
        );

        result.updated++;
        result.details.push({
          templateName: dbTemplate.meta_template_name,
          oldStatus: currentDbStatus,
          newStatus: newDbStatus,
          action: 'updated',
        });

        log('info', `Updated template status`, {
          name: dbTemplate.meta_template_name,
          oldStatus: currentDbStatus,
          newStatus: newDbStatus,
          stage: dbTemplate.stage,
          day: dbTemplate.day,
        });
      } catch (error) {
        result.errors++;
        result.details.push({
          templateName: dbTemplate.meta_template_name,
          oldStatus: currentDbStatus,
          newStatus: newDbStatus,
          action: 'error',
        });
        log('error', `Failed to update template ${dbTemplate.meta_template_name}`, {
          error: (error as Error).message,
        });
      }
    } else {
      result.skipped++;
      result.details.push({
        templateName: dbTemplate.meta_template_name,
        oldStatus: currentDbStatus,
        newStatus: newDbStatus,
        action: 'skipped',
      });
    }
  }

  return result;
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const startTime = Date.now();
  log('info', '=== Meta Template Sync Worker Started ===');

  try {
    // Load environment variables
    const env = getEnvVars();
    log('info', 'Environment loaded', { 
      wabaId: env.wabaId,
      supabaseUrl: env.supabaseUrl.replace(/^(https:\/\/[^/]+).*/, '$1'), // Log only domain
    });

    // Initialize Supabase client
    const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Run sync
    const result = await syncTemplates(supabase, env.accessToken, env.wabaId);

    // Log summary
    const duration = Date.now() - startTime;
    log('info', '=== Sync Complete ===', {
      durationMs: duration,
      totalMetaTemplates: result.totalMetaTemplates,
      totalDbTemplates: result.totalDbTemplates,
      matched: result.matched,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    });

    // Exit successfully
    process.exit(0);
  } catch (error) {
    log('error', 'Sync failed', { 
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { syncTemplates, fetchMetaTemplates, mapMetaStatusToDb };
