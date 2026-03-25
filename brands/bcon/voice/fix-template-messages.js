/**
 * One-time migration: fix conversations that were logged with the old
 * bcon_proxe_followup_noengage template body before it was updated to
 * match Meta-approved text. Safe to delete after running once.
 *
 * Usage: node fix-template-messages.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Find agent messages containing the old template text
  const { data: rows, error } = await supabase
    .from('conversations')
    .select('id, lead_id, content, metadata')
    .eq('sender', 'agent')
    .ilike('content', "%we'd love to help you with business growth%");

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  console.log(`Found ${rows.length} conversation(s) to fix.`);
  if (rows.length === 0) return;

  // Collect unique lead IDs to batch-fetch names
  const leadIds = [...new Set(rows.map(r => r.lead_id).filter(Boolean))];
  const nameMap = {};

  if (leadIds.length > 0) {
    const { data: leads, error: leadErr } = await supabase
      .from('leads')
      .select('id, name')
      .in('id', leadIds);

    if (leadErr) {
      console.error('Lead lookup failed:', leadErr.message);
      process.exit(1);
    }
    for (const l of leads) nameMap[l.id] = l.name;
  }

  let updated = 0;
  for (const row of rows) {
    const name = nameMap[row.lead_id] || 'there';
    const newContent = `Hi ${name}, you reached out to us recently about your business. Would you like to know how we can help?`;
    const newMetadata = {
      ...(row.metadata || {}),
      template_name: row.metadata?.template_name || 'bcon_proxe_followup_noengage',
    };

    const { error: upErr } = await supabase
      .from('conversations')
      .update({ content: newContent, metadata: newMetadata })
      .eq('id', row.id);

    if (upErr) {
      console.error(`Failed to update id=${row.id}:`, upErr.message);
    } else {
      updated++;
      console.log(`Updated id=${row.id} (lead: ${name})`);
    }
  }

  console.log(`Done. ${updated}/${rows.length} updated.`);
}

main().catch(err => { console.error(err); process.exit(1); });
