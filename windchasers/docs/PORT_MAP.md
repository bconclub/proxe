# Windchasers Port Configuration Map

## Port Usage Summary

| Application | Local Development | Production (VPS) | Notes |
|------------|-------------------|------------------|-------|
| **Web-Agent** | `4003` | `3001` | Next.js dev server vs PM2 production |
| **Dashboard** | `4002` | `3003` | Next.js dev server vs PM2 production |

---

## Detailed Configuration

### Web-Agent (`brand/windchasers/web-agent/build/`)

#### Local Development
- **Script**: `npm run dev`
- **Command**: `next dev -p 4003`
- **Port**: `4003`
- **File**: `package.json` line 6
- **URL**: `http://localhost:4003`

#### Production (VPS)
- **Script**: `npm start`
- **Command**: `next start` (uses PORT env var)
- **Port**: `3001`
- **Configuration Sources**:
  - `ecosystem.config.js` line 22: `PORT: 3001`
  - `.env.production.example` line 35: `PORT=3001`
  - Deployment workflow: `PORT=3001 pm2 start npm --name windchasers-web-agent -- start`
- **PM2 Process**: `windchasers-web-agent`
- **URL**: `http://localhost:3001` (proxied via nginx to `pilot.windchasers.in/widget`)

#### Next.js Default Behavior
- **Default Port**: `3000` (if PORT not set)
- **Actual Port**: `3001` (explicitly set in production)
- **Note**: Next.js `start` command respects `PORT` environment variable

---

### Dashboard (`brand/windchasers/dashboard/build/`)

#### Local Development
- **Script**: `npm run dev:dashboard`
- **Command**: `next dev -p 4002`
- **Port**: `4002`
- **File**: `package.json` line 7
- **URL**: `http://localhost:4002`

#### Production (VPS)
- **Script**: `npm start`
- **Command**: `next start -p ${PORT:-4002}` (fallback to 4002 if PORT not set)
- **Port**: `3003`
- **Configuration Sources**:
  - `ecosystem.config.js` line 24: `PORT: 3003`
  - Deployment workflow: `PORT=3003 pm2 start npm --name windchasers-dashboard -- start`
- **PM2 Process**: `windchasers-dashboard`
- **URL**: `http://localhost:3003` (proxied via nginx to `pilot.windchasers.in`)

#### Next.js Default Behavior
- **Default Port**: `3000` (if PORT not set)
- **Fallback in package.json**: `4002` (if PORT env var not set)
- **Actual Port**: `3003` (explicitly set in production via PM2/env)

---

## Nginx Routing (Production)

**Config File**: `nginx-proxe-windchasers.conf`

| Route | Backend Port | Purpose |
|-------|--------------|---------|
| `/widget` | `3001` (web-agent) | Widget iframe page |
| `/api/chat` | `3001` (web-agent) | Chat API endpoint |
| `/api/calendar/*` | `3001` (web-agent) | Calendar booking API |
| `/_next/static/*` | `3003` (dashboard) → `3001` (web-agent) fallback | Static assets (dashboard first, web-agent fallback) |
| `/` (all other routes) | `3003` (dashboard) | Dashboard application |

**Note**: Nginx proxies external requests to internal localhost ports.

---

## Port Conflict Analysis

### Local Development
- ✅ **No conflicts**: Web-agent (4003) and Dashboard (4002) use different ports
- ✅ **Standard Next.js ports**: Both use 400x range (common for multi-app development)

### Production (VPS)
- ✅ **No conflicts**: Web-agent (3001) and Dashboard (3003) use different ports
- ✅ **Standard production ports**: Both use 300x range (common for production)
- ⚠️ **Note**: Port 3000 (Next.js default) is not used, avoiding conflicts

---

## Environment Variable Usage

### Web-Agent Production `.env.local`
```bash
PORT=3001                    # Explicit port for Next.js start
NODE_ENV=production
NEXT_PUBLIC_WEB_AGENT_URL=https://pilot.windchasers.in
```

### Dashboard Production `.env.local`
```bash
PORT=3003                    # Explicit port for Next.js start
NODE_ENV=production
```

### PM2 Ecosystem Config
Both apps use PM2 ecosystem files that set `PORT` in the `env` section:
- Web-Agent: `PORT: 3001`
- Dashboard: `PORT: 3003`

---

## Deployment Workflow Ports

### Web-Agent Deployment (`.github/workflows/deploy-windchasers-web-agent.yml`)
- Line 144, 148: `PORT=3001 pm2 start npm --name windchasers-web-agent -- start`
- Uses explicit PORT env var before starting

### Dashboard Deployment (`.github/workflows/deploy-windchasers-dashboard.yml`)
- Line 210, 214: `PORT=3003 pm2 start npm --name windchasers-dashboard -- start`
- Uses explicit PORT env var before starting

---

## Quick Reference

### Local Development URLs
- Web-Agent: `http://localhost:4003`
- Dashboard: `http://localhost:4002`
- Widget Page: `http://localhost:4003/widget`

### Production URLs (via Nginx)
- Web-Agent Widget: `https://pilot.windchasers.in/widget`
- Dashboard: `https://pilot.windchasers.in`
- Internal (VPS only):
  - Web-Agent: `http://localhost:3001`
  - Dashboard: `http://localhost:3003`

---

## Troubleshooting

### Port Already in Use (Local)
```bash
# Check what's using the port
netstat -ano | findstr :4002  # Windows
lsof -i :4002                  # Mac/Linux

# Kill process if needed
npm run kill-ports              # Uses kill-build-ports.sh script
```

### Port Already in Use (Production)
```bash
# Check PM2 status
pm2 list

# Check if port is in use
netstat -tlnp | grep :3001     # Linux
ss -tlnp | grep :3001          # Linux alternative

# Restart PM2 process
pm2 restart windchasers-web-agent
pm2 restart windchasers-dashboard
```

### Verify Ports are Correct
```bash
# Local
curl http://localhost:4003/widget    # Web-agent
curl http://localhost:4002           # Dashboard

# Production (on VPS)
curl http://localhost:3001/widget   # Web-agent
curl http://localhost:3003           # Dashboard
```

---

## Summary

| Aspect | Web-Agent | Dashboard |
|--------|-----------|-----------|
| **Local Dev Port** | `4003` | `4002` |
| **Production Port** | `3001` | `3003` |
| **Port Change** | `-4002` (dev to prod) | `-3999` (dev to prod) |
| **Next.js Default** | `3000` (not used) | `3000` (not used) |
| **PM2 Process** | `windchasers-web-agent` | `windchasers-dashboard` |
| **Nginx Route** | `/widget`, `/api/chat`, `/api/calendar` | `/` (default) |

**Key Insight**: Both apps use different port ranges for local (400x) vs production (300x), ensuring no conflicts and clear separation between environments.
