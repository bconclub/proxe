# Network Connectivity Diagnosis

## The Issue

You say the URL is correct, but we're getting `ENOTFOUND` (DNS cannot resolve the domain).

## Quick Checks

### 1. Check Supabase Project Status

**Most Common Issue:** Free tier Supabase projects **pause automatically** after inactivity.

1. Go to https://supabase.com/dashboard
2. Find your project `wflwsyaejscxmattmiskp`
3. Check the status:
   - ✅ **Active** = Project is running
   - ⏸️ **Paused** = Project is paused (needs to be resumed)
   - ❌ **Deleted** = Project no longer exists

**If Paused:**
- Click on the project
- Look for a "Resume" or "Restore" button
- Click it and wait 1-2 minutes for the project to resume
- The DNS will work again once resumed

### 2. Test in Browser

Open this URL in your browser:
```
https://wflwsyaejscxmattmiskp.supabase.co
```

**Expected Results:**
- ✅ **Works** (shows Supabase page or API response) = Project is active, issue is with Node.js/network config
- ❌ **Cannot connect** / **DNS error** = Project is paused or doesn't exist
- 🔒 **SSL error** = Different issue (certificate problem)

### 3. Test DNS Resolution

From your terminal, try:

```bash
# Test DNS
nslookup wflwsyaejscxmattmiskp.supabase.co

# Or with dig (if available)
dig wflwsyaejscxmattmiskp.supabase.co

# Test connectivity
ping wflwsyaejscxmattmiskp.supabase.co
```

**If DNS fails:**
- Project is likely paused or deleted
- Or there's a DNS propagation issue (wait a few minutes)

### 4. Check Network Configuration

If the URL works in browser but not in Node.js:

```bash
# Check if there's a proxy configured
echo $HTTP_PROXY
echo $HTTPS_PROXY
echo $http_proxy
echo $https_proxy

# Check DNS servers
cat /etc/resolv.conf
```

**If proxy is set:**
- Node.js might not be using the proxy
- Configure Node.js to use proxy or disable it for local development

### 5. Flush DNS Cache

Try flushing DNS cache:

```bash
# Linux (systemd-resolved)
sudo systemd-resolve --flush-caches

# Or restart network
sudo systemctl restart systemd-resolved

# Alternative (if using NetworkManager)
sudo systemctl restart NetworkManager
```

## Solutions by Issue

### Issue: Project is Paused

**Solution:**
1. Go to Supabase dashboard
2. Resume the project
3. Wait 1-2 minutes
4. Restart your dev server

### Issue: DNS Cache

**Solution:**
```bash
# Flush DNS cache
sudo systemd-resolve --flush-caches

# Restart dev server
cd brand/windchasers/build
npm run dev
```

### Issue: Proxy Configuration

**Solution:**
If you're behind a proxy, configure Node.js:

```bash
# Set proxy (if needed)
export HTTP_PROXY=http://proxy:port
export HTTPS_PROXY=http://proxy:port

# Or disable proxy for local development
unset HTTP_PROXY
unset HTTPS_PROXY
unset http_proxy
unset https_proxy
```

### Issue: Firewall Blocking

**Solution:**
- Check firewall rules
- Allow outbound HTTPS (port 443)
- Allow connections to `*.supabase.co`

## Still Not Working?

If none of these work:

1. **Double-check the URL:**
   - Go to Supabase dashboard
   - Settings > API
   - Copy the Project URL again
   - Make sure there are no typos

2. **Try a different Supabase project:**
   - Create a test project
   - See if that one works
   - If test project works = original project has issues

3. **Contact Supabase Support:**
   - If project shows as active but DNS fails
   - There might be an infrastructure issue

## Quick Test Script

Run this to test connectivity:

```bash
cd brand/windchasers/build
node -e "
const https = require('https');
const url = 'https://wflwsyaejscxmattmiskp.supabase.co';
console.log('Testing:', url);
const req = https.get(url + '/rest/v1/', { timeout: 5000 }, (res) => {
  console.log('✅ SUCCESS - Status:', res.statusCode);
}).on('error', (err) => {
  console.log('❌ ERROR:', err.message);
  console.log('Code:', err.code);
  if (err.code === 'ENOTFOUND') {
    console.log('→ DNS cannot resolve. Project might be paused.');
  }
});
setTimeout(() => req.destroy(), 10000);
"
```
