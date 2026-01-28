# Web Agent Preview Iframe URL Analysis

## Location

**File**: `brand/windchasers/dashboard/build/src/app/dashboard/settings/web-agent/WebAgentSettingsClient.tsx`

**Component**: `WebAgentSettingsClient`

---

## Iframe Source Logic

### Primary Iframe Element (Lines 243-265)

```tsx
<iframe
  ref={iframeRef}
  src={process.env.NEXT_PUBLIC_WEB_AGENT_URL 
    ? `${process.env.NEXT_PUBLIC_WEB_AGENT_URL}/widget`
    : typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:4003/widget'
    : 'https://widget.proxe.windchasers.in/widget'}
  className="w-full h-full border-0"
  style={{
    width: '100%',
    height: '100%',
    border: 'none',
  }}
  title="Widget Preview"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
  allow="microphone; camera"
  onError={(e) => {
    console.error('Widget iframe error:', e)
  }}
  onLoad={(e) => {
    console.log('Widget iframe loaded')
  }}
/>
```

### URL Resolution Logic (Ternary Chain)

The iframe `src` attribute uses a **three-tier fallback system**:

1. **Priority 1** (Highest): `NEXT_PUBLIC_WEB_AGENT_URL` environment variable
   - If set: `${process.env.NEXT_PUBLIC_WEB_AGENT_URL}/widget`
   - **Type**: Absolute URL (concatenated with `/widget`)

2. **Priority 2**: Localhost detection
   - If `window.location.hostname === 'localhost'`: `http://localhost:4003/widget`
   - **Type**: Absolute URL
   - **Port**: 4003 (Windchasers web-agent dev port)

3. **Priority 3** (Fallback): Production default
   - Default: `https://widget.proxe.windchasers.in/widget`
   - **Type**: Absolute URL

---

## Additional URL Logic Locations

### 1. useEffect Hook (Lines 12-24)

```tsx
useEffect(() => {
  // Determine widget URL - use environment variable or default to localhost in development
  const widgetUrl = process.env.NEXT_PUBLIC_WEB_AGENT_URL 
    ? `${process.env.NEXT_PUBLIC_WEB_AGENT_URL}/widget`
    : typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:4003/widget'
    : 'https://widget.proxe.windchasers.in/widget'
  
  // Ensure iframe loads when component mounts
  if (iframeRef.current) {
    iframeRef.current.src = widgetUrl
  }
}, [])
```

**Purpose**: Sets initial iframe `src` when component mounts.

### 2. handleResetWidget Function (Lines 47-52)

```tsx
// Determine widget URL
const widgetUrl = process.env.NEXT_PUBLIC_WEB_AGENT_URL 
  ? `${process.env.NEXT_PUBLIC_WEB_AGENT_URL}/widget`
  : typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:4003/widget'
  : 'https://widget.proxe.windchasers.in/widget'
```

**Purpose**: Resets iframe `src` when "Reset Widget" button is clicked.

---

## Environment Variable Configuration

### Production Environment Variable Status

**Finding**: `NEXT_PUBLIC_WEB_AGENT_URL` is **NOT set** in production deployment.

**Evidence**:

1. **Deployment Workflow** (`.github/workflows/deploy-windchasers-dashboard.yml`):
   - Only sets Supabase-related environment variables
   - Does not set `NEXT_PUBLIC_WEB_AGENT_URL`
   - Lines 82-102 only verify Supabase variables

2. **Production Environment Template** (`brand/windchasers/dashboard/build/env.production.example`):
   - Does not include `NEXT_PUBLIC_WEB_AGENT_URL`
   - Only includes Supabase, Claude API, Google Calendar, and PORT variables

3. **Web-Agent Environment Template** (`brand/windchasers/web-agent/build/env.production.example`):
   - Line 30: `NEXT_PUBLIC_WEB_AGENT_URL=https://your-domain.com`
   - This is for the **web-agent** app, not the dashboard

---

## URL Type Analysis

### ✅ Confirmed: Using Absolute URLs

**Not using relative paths** (`/widget`). All URL resolutions produce **absolute URLs**:

1. **If `NEXT_PUBLIC_WEB_AGENT_URL` is set**:
   - Example: `https://widget.proxe.windchasers.in/widget`
   - **Absolute URL** (includes protocol and domain)

2. **If on localhost**:
   - `http://localhost:4003/widget`
   - **Absolute URL** (includes protocol, hostname, and port)

3. **Production fallback**:
   - `https://widget.proxe.windchasers.in/widget`
   - **Absolute URL** (includes protocol and domain)

---

## Final Resolved URL in Production

### Production URL Resolution

Since `NEXT_PUBLIC_WEB_AGENT_URL` is **not set** in production:

1. ✅ Check: `process.env.NEXT_PUBLIC_WEB_AGENT_URL` → **undefined/falsy**
2. ✅ Check: `window.location.hostname === 'localhost'` → **false** (production domain)
3. ✅ Result: Uses fallback → **`https://widget.proxe.windchasers.in/widget`**

### Final Production URL

```
https://widget.proxe.windchasers.in/widget
```

**Breakdown**:
- **Protocol**: `https://`
- **Domain**: `widget.proxe.windchasers.in`
- **Path**: `/widget`
- **Type**: Absolute URL

---

## Related Configuration

### Widget Embed Script URL

**File**: `brand/windchasers/dashboard/build/src/app/api/widget/embed.js/route.ts`

**Line 16**:
```typescript
const baseUrl = process.env.NEXT_PUBLIC_WEB_AGENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://proxe.windchasers.in'
```

**Note**: The embed script uses a different fallback (`https://proxe.windchasers.in`), but the iframe preview uses `https://widget.proxe.windchasers.in`.

---

## Summary

| Aspect | Value |
|--------|-------|
| **Component** | `WebAgentSettingsClient.tsx` |
| **Iframe Location** | Lines 243-265 |
| **URL Type** | **Absolute URL** (not relative) |
| **Production URL** | `https://widget.proxe.windchasers.in/widget` |
| **Environment Variable** | `NEXT_PUBLIC_WEB_AGENT_URL` (not set in production) |
| **Fallback Logic** | Three-tier: Env var → localhost → production default |
| **Development URL** | `http://localhost:4003/widget` |

---

## Recommendations

### To Use a Different Production URL

1. **Set environment variable** in `.env.local` on VPS:
   ```bash
   NEXT_PUBLIC_WEB_AGENT_URL=https://your-custom-domain.com
   ```

2. **Or update deployment workflow** to set it:
   ```yaml
   - name: Set environment variables
     run: |
       echo "NEXT_PUBLIC_WEB_AGENT_URL=https://widget.proxe.windchasers.in" >> .env.local
   ```

### Current Behavior

✅ **Working as designed**: Production uses `https://widget.proxe.windchasers.in/widget` as the fallback URL, which is correct for the current infrastructure setup.
