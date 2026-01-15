# How to Run the Dashboards

Each dashboard (PROXe and Windchasers) is a standalone Next.js application that can be run independently.

## Quick Start

### PROXe Dashboard

```bash
# Navigate to PROXe folder
cd proxe

# Install dependencies (first time only)
npm install

# Run development server
npm run dev
```

The PROXe dashboard will be available at: **http://localhost:4000**

### Windchasers Dashboard

```bash
# Navigate to Windchasers folder
cd windchasers

# Install dependencies (first time only)
npm install

# Run development server
npm run dev
```

The Windchasers dashboard will be available at: **http://localhost:4001**

## Running Both Simultaneously

Since both dashboards default to port 3000, you'll need to run them on different ports:

### Option 1: Use Different Ports

**Terminal 1 - PROXe:**
```bash
cd proxe
npm run dev
```

**Terminal 2 - Windchasers:**
```bash
cd windchasers
npm run dev
```

- PROXe: http://localhost:4000
- Windchasers: http://localhost:4001

### Option 2: Use npm scripts with port flags

You can also modify the `package.json` scripts to use different ports:

**proxe/package.json:**
```json
"scripts": {
  "dev": "next dev -p 4000",
  ...
}
```

**windchasers/package.json:**
```json
"scripts": {
  "dev": "next dev -p 4001",
  ...
}
```

## Environment Setup

Before running, make sure you have the correct environment variables:

1. **Copy environment template:**
   ```bash
   # For PROXe
   cd proxe
   cp env.example.txt .env.local
   
   # For Windchasers
   cd windchasers
   cp env.example.txt .env.local
   ```

2. **Update `.env.local` with your Supabase credentials:**
   - PROXe dashboard → PROXe Supabase project
   - Windchasers dashboard → Windchasers Supabase project

## Production Build

### PROXe Dashboard
```bash
cd proxe
npm run build
npm start
```

### Windchasers Dashboard
```bash
cd windchasers
npm run build
npm start
```

## Troubleshooting

### Port Already in Use
If ports 4000 or 4001 are already in use:
```bash
# Kill the process using the port
lsof -ti:4000 | xargs kill -9  # For PROXe
lsof -ti:4001 | xargs kill -9  # For Windchasers

# Or use a different port
PORT=4002 npm run dev  # For additional brands
```

### Missing Dependencies
If you get module errors:
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Environment Variables Not Loading
- Make sure `.env.local` exists in the correct folder
- Restart the dev server after changing `.env.local`
- Check that variable names start with `NEXT_PUBLIC_` for client-side access
