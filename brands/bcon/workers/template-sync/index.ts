require('dotenv').config();
import { createClient } from '@supabase/supabase-js';

const META_API_VERSION = 'v18.0';
const WABA_ID = process.env.META_WABA_ID!;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function sync() {
  console.log(`[${new Date().toISOString()}] Syncing templates...`);
  
  try {
    const url = `https://graph.facebook.com/${META_API_VERSION}/${WABA_ID}/message_templates?access_token=${ACCESS_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    
    for (const t of data.data || []) {
      const status = mapStatus(t.status);
      await supabase
        .from('follow_up_templates')
        .update({ meta_status: status, updated_at: new Date().toISOString() })
        .eq('meta_template_name', t.name)
        .eq('brand', 'bcon');
      console.log(`Updated ${t.name}: ${status}`);
    }
    
    console.log('Sync complete');
  } catch (e) {
    console.error('Sync failed:', e);
    process.exit(1);
  }
}

function mapStatus(s: string) {
  const m: Record<string, string> = {
    'APPROVED': 'approved',
    'PENDING': 'pending',
    'REJECTED': 'rejected',
    'IN_REVIEW': 'in_review'
  };
  return m[s] || 'pending';
}

sync();
