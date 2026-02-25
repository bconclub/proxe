# Windchasers Dashboard Deployment

## GitHub Actions Workflow

The deployment workflow is configured at:
`.github/workflows/deploy-windchasers-dashboard.yml`

## How It Works

### Trigger
- **Branch:** `main`
- **Paths:** Only triggers when files in `brand/windchasers/build/` change
- **Manual:** Can also be triggered manually from GitHub Actions tab

### Deployment Process

1. **Checkout Code**
   - Checks out the repository code

2. **Setup SSH**
   - Configures SSH using `VPS_SSH_KEY` secret
   - Adds VPS to known hosts

3. **Rsync Files**
   - Syncs `brand/windchasers/build/` to `/var/www/windchasers-proxe/` on VPS
   - Excludes:
     - `.env.local` (preserved on VPS)
     - `node_modules` (reinstalled)
     - `.next` (rebuilt)
     - `.git`
     - Log files

4. **Build & Deploy on VPS**
   - Runs `npm ci` to install dependencies
   - Runs `npm run build` to build Next.js app
   - Restarts PM2 process `windchasers-proxe` on port 3003
   - Saves PM2 configuration

## Required GitHub Secrets

Configure these in: **Settings > Secrets and variables > Actions**

1. **WINDCHASERS_VPS_HOST**
   - Your VPS server IP or domain for Windchasers
   - Example: `123.45.67.89` or `vps.example.com`

2. **WINDCHASERS_VPS_USER**
   - SSH username for VPS
   - Example: `deploy` or `root`

3. **WINDCHASERS_VPS_SSH_KEY**
   - Private SSH key for authentication
   - Generate with: `ssh-keygen -t ed25519 -C "github-actions-windchasers"`
   - Add public key to VPS: `~/.ssh/authorized_keys`

## VPS Setup

### Initial Setup on VPS

```bash
# 1. Create directory
sudo mkdir -p /var/www/windchasers-proxe
sudo chown $USER:$USER /var/www/windchasers-proxe

# 2. Create .env.local file
cd /var/www/windchasers-proxe
nano .env.local
```

Add to `.env.local`:
```env
NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL=https://flwsyaejscxmattmiskp.supabase.co
NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
PORT=3003
NODE_ENV=production
```

### Install PM2 (if not installed)

```bash
npm install -g pm2
```

### First Manual Deployment

```bash
cd /var/www/windchasers-proxe
npm install
npm run build
PORT=3003 pm2 start npm --name windchasers-proxe -- start
pm2 save
```

## PM2 Configuration

- **Name:** `windchasers-proxe`
- **Port:** `3003`
- **Command:** `npm start`
- **Auto-restart:** Yes (via PM2)

### PM2 Commands

```bash
# Check status
pm2 list

# View logs
pm2 logs windchasers-proxe

# Restart
pm2 restart windchasers-proxe

# Stop
pm2 stop windchasers-proxe

# Delete
pm2 delete windchasers-proxe
```

## Environment Variables

The `.env.local` file on the VPS is **preserved** during deployment (not overwritten).

Make sure it contains:
- `NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL`
- `NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT=3003`
- `NODE_ENV=production`

## Troubleshooting

### Deployment Fails

1. **Check GitHub Actions logs:**
   - Go to Actions tab in GitHub
   - Click on the failed workflow
   - Check error messages

2. **SSH Connection Issues:**
   - Verify `VPS_SSH_KEY` secret is correct
   - Test SSH manually: `ssh -i ~/.ssh/your-key $VPS_USER@$VPS_HOST`
   - Check VPS firewall allows SSH (port 22)

3. **Build Fails on VPS:**
   - SSH into VPS: `ssh $VPS_USER@$VPS_HOST`
   - Check logs: `pm2 logs windchasers-proxe`
   - Verify Node.js version: `node --version` (should be 18+)
   - Check disk space: `df -h`

4. **Application Not Starting:**
   - Check PM2 status: `pm2 list`
   - Check if port 3003 is in use: `lsof -i :3003`
   - Verify .env.local exists and has correct values
   - Check PM2 logs: `pm2 logs windchasers-proxe --lines 50`

### Manual Deployment

If GitHub Actions fails, you can deploy manually:

```bash
# From your local machine
cd brand/windchasers/build
rsync -avz --delete \
  --exclude='.env.local' \
  --exclude='node_modules' \
  --exclude='.next' \
  -e "ssh" \
  ./ \
  $VPS_USER@$VPS_HOST:/var/www/windchasers-proxe/

# Then SSH and build
ssh $VPS_USER@$VPS_HOST
cd /var/www/windchasers-proxe
npm ci
npm run build
PORT=3003 pm2 restart windchasers-proxe
```

## Security Notes

- ✅ `.env.local` is excluded from rsync (preserved on VPS)
- ✅ SSH key authentication (no passwords)
- ✅ Production build (optimized)
- ⚠️  Make sure `.env.local` on VPS has correct permissions: `chmod 600 .env.local`

## Monitoring

After deployment, check:
- Application is running: `pm2 list`
- Port is listening: `lsof -i :3003`
- Application responds: `curl http://localhost:3003/api/status`
- Check logs: `pm2 logs windchasers-proxe`
