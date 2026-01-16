// Quick test script to diagnose Supabase connection
const https = require('https');
const { readFileSync } = require('fs');
const { join } = require('path');

// Read .env.local
const envPath = join(__dirname, '.env.local');
let supabaseUrl = '';

try {
  const envContent = readFileSync(envPath, 'utf8');
  const urlMatch = envContent.match(/^NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL=(.+)$/m);
  if (urlMatch) {
    supabaseUrl = urlMatch[1].trim();
  }
} catch (err) {
  console.log('❌ Cannot read .env.local');
  process.exit(1);
}

if (!supabaseUrl) {
  console.log('❌ NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL not found in .env.local');
  process.exit(1);
}

console.log('🔍 Testing Supabase connection...');
console.log('URL:', supabaseUrl);
console.log('');

// Test 1: DNS Resolution
const domain = supabaseUrl.replace('https://', '').split('/')[0];
console.log('1. Testing DNS resolution for:', domain);

const req = https.get(supabaseUrl + '/rest/v1/', { 
  timeout: 10000,
  headers: {
    'User-Agent': 'Node.js-Diagnostic'
  }
}, (res) => {
  console.log('✅ SUCCESS!');
  console.log('   Status:', res.statusCode);
  console.log('   Headers:', Object.keys(res.headers).join(', '));
  console.log('');
  console.log('→ Supabase is reachable. The issue might be:');
  console.log('  - Environment variables not loaded in Next.js');
  console.log('  - Dev server needs restart');
  console.log('  - Different error in the application code');
  process.exit(0);
});

req.on('error', (err) => {
  console.log('❌ CONNECTION FAILED');
  console.log('   Error:', err.message);
  console.log('   Code:', err.code);
  console.log('');
  
  if (err.code === 'ENOTFOUND') {
    console.log('→ DNS cannot resolve the domain.');
    console.log('');
    console.log('Possible causes:');
    console.log('1. Supabase project is PAUSED (most common)');
    console.log('   → Go to https://supabase.com/dashboard');
    console.log('   → Check if project is paused');
    console.log('   → Resume the project if paused');
    console.log('');
    console.log('2. Project was deleted');
    console.log('   → Check Supabase dashboard');
    console.log('   → Verify project still exists');
    console.log('');
    console.log('3. DNS propagation delay');
    console.log('   → Wait a few minutes');
    console.log('   → Try: sudo systemd-resolve --flush-caches');
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
    console.log('→ Connection timeout or refused.');
    console.log('   Check firewall or network settings.');
  } else {
    console.log('→ Unknown network error.');
    console.log('   Check network connectivity.');
  }
  
  process.exit(1);
});

req.on('timeout', () => {
  console.log('❌ TIMEOUT');
  console.log('→ Connection timed out after 10 seconds');
  req.destroy();
  process.exit(1);
});

