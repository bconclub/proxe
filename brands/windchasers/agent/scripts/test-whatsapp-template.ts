#!/usr/bin/env tsx
/**
 * test-whatsapp-template.ts
 *
 * Fire one of the Windchasers WhatsApp templates with dummy data to a real
 * phone number, without going through the booking/PAT flow.
 *
 * Usage:
 *   npx tsx scripts/test-whatsapp-template.ts <template> <phone>
 *
 * Where:
 *   <template> = pat_result | demo_offline | demo_online
 *   <phone>    = E.164 format, e.g. +919591004043
 *
 * Reads .env.local for Meta credentials:
 *   META_WHATSAPP_PHONE_NUMBER_ID
 *   META_WHATSAPP_ACCESS_TOKEN
 *
 * Logs the full request payload + response. Exits 0 on success, 1 on failure.
 *
 * Dummy values per template:
 *   pat_result   → name=Test Pilot, score=78, tier=strong
 *   demo_offline → name=Test, date=Tomorrow, time=11:00 AM IST
 *   demo_online  → name=Test, date=Tomorrow, time=11:00 AM IST,
 *                  calendarEventId=MTk0MDQ1MzU2NjAg
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ── .env.local loader (no dependency on dotenv) ─────────────────────────────
function loadDotEnvLocal() {
  const candidates = [
    path.resolve(__dirname, '..', '.env.local'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), 'brands/windchasers/agent/.env.local'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      // Strip surrounding quotes if present
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
    console.log(`[test-wa] Loaded ${file}`);
    return;
  }
  console.warn('[test-wa] No .env.local found in any known location — relying on already-set env vars.');
}

loadDotEnvLocal();

// ── Constants kept in sync with whatsappSender.ts ───────────────────────────
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const TIER_LABELS: Record<string, string> = {
  premium:     'Premium',
  strong:      'Strong',
  moderate:    'Moderate',
  'not-ready': 'Early Stage',
};

const TIER_MESSAGES: Record<string, string> = {
  premium:
    'Strong fit for CPL track. A counsellor can walk you through timeline and next steps.',
  strong:
    "You're well-positioned. Worth a 1:1 to map your training path.",
  moderate:
    'Good foundation. A counsellor can map out the right program for your goals.',
  'not-ready':
    'Strong foundation matters more than first score. Talk to a counsellor about prep options.',
};

// ── Phone normalisation (digits only, what Meta wants) ──────────────────────
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

// ── Builders per template ───────────────────────────────────────────────────
type TemplateChoice = 'pat_result' | 'demo_offline' | 'demo_online';

function buildPayload(template: TemplateChoice, to: string) {
  const normalizedTo = normalizePhone(to);

  if (template === 'pat_result') {
    const firstName = 'Test Pilot'.split(' ')[0];
    const score100 = 78;
    const tierKey = 'strong';
    const tierLabel = TIER_LABELS[tierKey];
    const tierMessage = TIER_MESSAGES[tierKey];

    return {
      templateName: 'windchasers_pat_result_v1',
      body: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedTo,
        type: 'template',
        template: {
          name: 'windchasers_pat_result_v1',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', parameter_name: 'customer_name', text: firstName },
                { type: 'text', parameter_name: 'score',         text: String(score100) },
                { type: 'text', parameter_name: 'tier',          text: tierLabel },
                { type: 'text', parameter_name: 'tier_message',  text: tierMessage },
              ],
            },
          ],
        },
      },
    };
  }

  if (template === 'demo_offline') {
    return {
      templateName: 'windchasers_demo_offline_v1',
      body: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedTo,
        type: 'template',
        template: {
          name: 'windchasers_demo_offline_v1',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', parameter_name: 'customer_name', text: 'Test' },
                { type: 'text', parameter_name: 'date',          text: 'Tomorrow' },
                { type: 'text', parameter_name: 'time',          text: '11:00 AM IST' },
              ],
            },
          ],
        },
      },
    };
  }

  if (template === 'demo_online') {
    // Online template uses the same 3 named body params and (per Meta dashboard)
    // has static buttons — no button component in the send call.
    return {
      templateName: 'windchasers_demo_online_v1',
      body: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedTo,
        type: 'template',
        template: {
          name: 'windchasers_demo_online_v1',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', parameter_name: 'customer_name', text: 'Test' },
                { type: 'text', parameter_name: 'date',          text: 'Tomorrow' },
                { type: 'text', parameter_name: 'time',          text: '11:00 AM IST' },
              ],
            },
          ],
        },
      },
    };
  }

  throw new Error(`Unknown template: ${template}`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/test-whatsapp-template.ts <template> <phone>');
    console.error('  <template> = pat_result | demo_offline | demo_online');
    console.error('  <phone>    = E.164 (e.g. +919591004043)');
    process.exit(1);
  }

  const template = args[0] as TemplateChoice;
  const phone = args[1];
  const allowed: TemplateChoice[] = ['pat_result', 'demo_offline', 'demo_online'];
  if (!allowed.includes(template)) {
    console.error(`Invalid template "${template}". Must be one of: ${allowed.join(', ')}`);
    process.exit(1);
  }

  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    console.error('Missing META_WHATSAPP_PHONE_NUMBER_ID or META_WHATSAPP_ACCESS_TOKEN in env / .env.local');
    process.exit(1);
  }

  const { templateName, body } = buildPayload(template, phone);
  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;

  console.log('\n────────────────────────────────────────────────────────────────────');
  console.log(`Sending template: ${templateName}`);
  console.log(`To phone:         ${normalizePhone(phone)}`);
  console.log(`Endpoint:         ${url}`);
  console.log('────────────────────────────────────────────────────────────────────');
  console.log('Request payload:');
  console.log(JSON.stringify(body, null, 2));
  console.log('────────────────────────────────────────────────────────────────────\n');

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    console.error('Network error calling Meta Graph API:', err?.message || err);
    process.exit(1);
  }

  const responseText = await res.text();
  let responseJson: any = null;
  try { responseJson = JSON.parse(responseText); } catch { /* keep raw */ }

  console.log(`Status: ${res.status} ${res.statusText}`);
  console.log('Response:');
  console.log(responseJson ? JSON.stringify(responseJson, null, 2) : responseText);
  console.log('────────────────────────────────────────────────────────────────────\n');

  if (res.ok) {
    const messageId = responseJson?.messages?.[0]?.id;
    console.log(`✓ Sent. WhatsApp message ID: ${messageId || '(none in response)'}`);
    console.log(`  Check the phone for arrival.`);
    process.exit(0);
  } else {
    console.error('✗ Send failed.');
    const errCode = responseJson?.error?.code;
    const errMsg = responseJson?.error?.message;
    if (errCode === 132001 || /template name/i.test(errMsg || '')) {
      console.error(`  → Looks like the template is not approved yet in Meta, or the name doesn't match.`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
