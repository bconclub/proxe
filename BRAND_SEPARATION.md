# Dashboard Brand Separation - Complete

The Dashboard has been successfully restructured into independent brand modules, similar to the Website structure.

## New Structure

```
Command Center/
├── proxe/                    # PROXe Dashboard (standalone)
│   ├── src/
│   ├── package.json         # "proxe-dashboard"
│   ├── .env.local           # PROXe Supabase credentials
│   └── README.md
│
└── windchasers/             # Windchasers Dashboard (standalone)
    ├── src/
    ├── package.json         # "windchasers-dashboard"
    ├── .env.local           # Windchasers Supabase credentials
    └── README.md
```

## Brand Configurations

### PROXe Dashboard
- **Package Name**: `proxe-dashboard`
- **Theme**: Purple (#8B5CF6)
- **Logo**: PROXe (sidebar shows "PROXe")
- **Supabase**: PROXe project credentials
- **Features**: Standard lead management

### Windchasers Dashboard
- **Package Name**: `windchasers-dashboard`
- **Theme**: Gold (#C9A961, #1A0F0A, #E8D5B7)
- **Logo**: Windchasers (sidebar shows "Windchasers")
- **Supabase**: Windchasers project credentials
- **Features**: 
  - Aviation-specific fields in LeadsTable
  - User Type, Course Interest, Timeline columns
  - Aviation-specific filters (User Type, Course Interest)

## Key Changes

### 1. Package.json
- `proxe/package.json`: `"name": "proxe-dashboard"`
- `windchasers/package.json`: `"name": "windchasers-dashboard"`

### 2. Theme Colors

**PROXe** (unchanged):
- Accent: #8B5CF6 (purple)
- Dark background: #0D0D0D

**Windchasers**:
- Accent: #C9A961 (gold)
- Dark background: #1A0F0A (dark brown)
- Hover: #2A1F1A
- Border: #3A2F2A

### 3. DashboardLayout
- PROXe: Shows "PROXe" logo, collapsed shows "P"
- Windchasers: Shows "Windchasers" logo, collapsed shows "W"

### 4. LeadsTable (Windchasers Only)
- Added columns: User Type, Course Interest, Timeline
- Added filters: User Type filter, Course Interest filter
- Aviation data from `unified_context.windchasers`

### 5. Next.js Config
- PROXe: CORS for `https://goproxe.com`
- Windchasers: CORS set to `*` (update with domain when available)

## Deployment

Each dashboard can be deployed independently:

```bash
# PROXe Dashboard
cd proxe
npm install
npm run build
npm start

# Windchasers Dashboard
cd windchasers
npm install
npm run build
npm start
```

## Environment Variables

Each brand has its own `.env.local` file:
- `proxe/.env.local` - PROXe Supabase credentials
- `windchasers/.env.local` - Windchasers Supabase credentials

Copy from `env.example.txt` in each folder and update with brand-specific credentials.

## Next Steps

1. Update `windchasers/.env.local` with Windchasers Supabase credentials
2. Update `proxe/.env.local` with PROXe Supabase credentials (if not already done)
3. Update `windchasers/next.config.js` CORS origin when Windchasers domain is available
4. Deploy each dashboard independently to their respective domains
