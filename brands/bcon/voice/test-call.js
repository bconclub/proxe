/**
 * Quick test: place an outbound call via Vobiz.
 * Usage: node test-call.js <phone> [lead_name]
 */
require('dotenv').config();
require('dotenv').config({ path: '../agent/.env.local', override: false });

const VOBIZ_AUTH_ID    = process.env.VOBIZ_AUTH_ID;
const VOBIZ_AUTH_TOKEN = process.env.VOBIZ_AUTH_TOKEN;
const VOBIZ_FROM_NUMBER = process.env.VOBIZ_FROM_NUMBER || '918046733388';
const VOBIZ_ANSWER_URL  = process.env.VOBIZ_ANSWER_URL  || 'https://proxe.bconclub.com/api/agent/voice/answer';

const phone     = process.argv[2] || '7259956780';
const leadName  = process.argv[3] || 'Test';
const direction = process.argv[4] || 'outbound'; // outbound | cold_intro
const toPhone   = phone.length === 10 ? `91${phone}` : phone;

if (!VOBIZ_AUTH_ID || !VOBIZ_AUTH_TOKEN) {
  console.error('Missing VOBIZ_AUTH_ID or VOBIZ_AUTH_TOKEN in .env');
  process.exit(1);
}

const phone10 = phone.replace(/\D/g, '').slice(-10);
console.log(`Calling ${toPhone} (${leadName}) — direction: ${direction}`);
console.log(`Answer URL: ${VOBIZ_ANSWER_URL}?direction=${direction}&lead_name=${encodeURIComponent(leadName)}&lead_phone=${phone10}`);

fetch(`https://api.vobiz.ai/api/v1/Account/${VOBIZ_AUTH_ID}/Call/`, {
  method: 'POST',
  headers: {
    'X-Auth-ID': VOBIZ_AUTH_ID,
    'X-Auth-Token': VOBIZ_AUTH_TOKEN,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: VOBIZ_FROM_NUMBER,
    to: toPhone,
    answer_url: `${VOBIZ_ANSWER_URL}?direction=${direction}&lead_name=${encodeURIComponent(leadName)}`,
    caller_name: 'BCON Club',
  }),
})
  .then(async res => {
    const body = await res.text();
    if (!res.ok) {
      console.error(`Vobiz error ${res.status}:`, body);
      process.exit(1);
    }
    console.log('Success:', body);
  })
  .catch(err => {
    console.error('Request failed:', err.message);
    process.exit(1);
  });
