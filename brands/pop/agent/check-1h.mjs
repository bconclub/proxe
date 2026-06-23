import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://yvkauaiyranysldubnqv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2a2F1YWl5cmFueXNsZHVibnF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjExODE0OCwiZXhwIjoyMDg3Njk0MTQ4fQ.v5jrGKd28q_uyB2wJo1_WKn5dj_E4HptIkTFwfUVKbE'
);

// Replicate exact 1h cron query
const { data, error } = await supabase
  .from('whatsapp_sessions')
  .select('id, customer_name, customer_phone, booking_date, booking_time, reminder_1h_sent')
  .not('booking_date', 'is', null)
  .not('booking_time', 'is', null)
  .or('reminder_1h_sent.is.null,reminder_1h_sent.eq.false')
  .not('booking_status', 'eq', 'cancelled');

console.log('Total results:', data?.length);
console.log('Error:', error?.message || 'none');

const test = data?.find(s => s.customer_phone === '919353253817');
console.log('Test session found:', Boolean(test));
if (test) {
  console.log('Test:', JSON.stringify(test));
} else {
  console.log('Phone numbers in results:');
  data?.forEach(s => console.log(`  ${s.customer_phone} | ${s.booking_date} ${s.booking_time} | r1h=${s.reminder_1h_sent}`));

  // Without status filter
  const { data: d2 } = await supabase
    .from('whatsapp_sessions')
    .select('id, customer_phone, booking_status, reminder_1h_sent')
    .eq('customer_phone', '919353253817')
    .not('booking_date', 'is', null)
    .not('booking_time', 'is', null)
    .or('reminder_1h_sent.is.null,reminder_1h_sent.eq.false');
  console.log('\nWithout status filter:', JSON.stringify(d2));

  // Without reminder filter
  const { data: d3 } = await supabase
    .from('whatsapp_sessions')
    .select('id, customer_phone, booking_status, reminder_1h_sent')
    .eq('customer_phone', '919353253817')
    .not('booking_date', 'is', null)
    .not('booking_time', 'is', null)
    .not('booking_status', 'eq', 'cancelled');
  console.log('Without reminder filter:', JSON.stringify(d3));
}
