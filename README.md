# Command Center - Brand-Based Dashboard Structure

This repository contains standalone Next.js dashboard applications for multiple brands, organized in a brand-based folder structure.

## 📁 Repository Structure

```
Command Center/
├── brand/
│   ├── proxe/
│   │   ├── build/              # Complete PROXe Next.js application
│   │   │   ├── src/            # Source code
│   │   │   ├── public/         # Public assets
│   │   │   ├── package.json    # Dependencies & scripts
│   │   │   └── ...
│   │   ├── supabase/           # Database files
│   │   │   └── migrations/     # SQL migration files
│   │   └── docs/               # Documentation
│   │
│   └── windchasers/
│       ├── build/              # Complete Windchasers Next.js application
│       ├── supabase/           # Database files
│       └── docs/               # Documentation
│
├── BRAND_SEPARATION.md          # Brand separation documentation
├── RUN_DASHBOARDS.md            # How to run both dashboards
├── SUPABASE_ENV_VARIABLES.md   # Environment variable setup
└── CLEANUP_AUDIT_REPORT.md     # Cleanup audit report
```

## 🚀 Quick Start

Each brand dashboard is a **complete, standalone Next.js application** that can be run independently.

### PROXe Dashboard

```bash
# Navigate to PROXe build directory (IMPORTANT: must be in build/ folder)
cd brand/proxe/build

# Install dependencies (first time only)
npm install

# Run development server
npm run dev
```

**⚠️ Important:** You must be inside the `build/` directory. The `package.json` is located at `brand/proxe/build/package.json`, not in the root or `brand/proxe/`.

The PROXe dashboard will be available at: **http://localhost:4000**

### Windchasers Dashboard

```bash
# Navigate to Windchasers build directory (IMPORTANT: must be in build/ folder)
cd brand/windchasers/build

# Install dependencies (first time only)
npm install

# Run development server
npm run dev
```

**⚠️ Important:** You must be inside the `build/` directory. The `package.json` is located at `brand/windchasers/build/package.json`, not in the root or `brand/windchasers/`.

The Windchasers dashboard will be available at: **http://localhost:4001**

## 📦 Brand Structure Details

### `build/` Directory

Each `brand/[brand]/build/` directory contains a **complete Next.js application**:

- **`src/`** - All source code (components, pages, API routes, etc.)
- **`public/`** - Static assets (images, icons, etc.)
- **`package.json`** - Dependencies and npm scripts
- **`next.config.js`** - Next.js configuration
- **`tsconfig.json`** - TypeScript configuration
- **`.env.local`** - Environment variables (create from `env.example.txt`)

**To work on a brand:**
1. `cd brand/[brand]/build`
2. `npm install` (if needed)
3. `npm run dev`

### `supabase/` Directory

Contains database-related files:

- **`migrations/`** - SQL migration files (numbered sequentially)
- **`*-schema.sql`** - Complete schema files (if any)

**To apply migrations:**
1. Use Supabase CLI or dashboard
2. Run migrations in order (001, 002, 003, etc.)

### `docs/` Directory

Contains brand-specific documentation:

- Setup guides
- API documentation
- Deployment instructions
- Brand-specific notes

## 🔧 Environment Setup

### PROXe Dashboard

1. Copy environment template:
   ```bash
   cd brand/proxe/build
   cp env.example.txt .env.local
   ```

2. Edit `.env.local` with PROXe Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-proxe-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-proxe-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-proxe-service-key
   ```

### Windchasers Dashboard

1. Copy environment template:
   ```bash
   cd brand/windchasers/build
   cp env.example.txt .env.local
   ```

2. Edit `.env.local` with Windchasers Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-windchasers-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-windchasers-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-windchasers-service-key
   ```

**Important:** Each brand uses a **separate Supabase project**. Do not share credentials between brands.

## 🏗️ Building for Production

### PROXe Dashboard

```bash
cd brand/proxe/build
npm run build
npm start
```

### Windchasers Dashboard

```bash
cd brand/windchasers/build
npm run build
npm start
```

## 📚 Additional Documentation

- **[BRAND_SEPARATION.md](./BRAND_SEPARATION.md)** - Details about brand separation architecture
- **[RUN_DASHBOARDS.md](./RUN_DASHBOARDS.md)** - Instructions for running both dashboards simultaneously
- **[SUPABASE_ENV_VARIABLES.md](./SUPABASE_ENV_VARIABLES.md)** - Environment variable configuration guide
- **`brand/[brand]/docs/`** - Brand-specific documentation

## 🎯 Key Principles

1. **Complete Separation** - Each brand is a standalone application with no shared code
2. **Independent Deployment** - Each brand can be deployed separately
3. **Brand-Specific Config** - Each brand has its own:
   - Supabase project
   - Environment variables
   - Theme/branding
   - Documentation

## 🔍 Finding Files

- **Source Code:** `brand/[brand]/build/src/`
- **Database Migrations:** `brand/[brand]/supabase/migrations/`
- **Documentation:** `brand/[brand]/docs/`
- **Public Assets:** `brand/[brand]/build/public/`

## ⚠️ Important Notes

- **No shared code** between brands - each `build/` directory is independent
- **Different ports** - PROXe (4000), Windchasers (4001) to run simultaneously
- **Separate Supabase projects** - Each brand has its own database
- **Build artifacts** (`.next/`, `node_modules/`) are in each `build/` directory

---

**Last Updated:** After brand-based restructuring
