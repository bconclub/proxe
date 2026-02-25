# Windchasers Dashboard

Standalone Windchasers brand dashboard application with aviation-specific features.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in your Windchasers Supabase credentials
2. Install dependencies: `npm install`
3. (Optional) Set up Google Calendar integration - see [GOOGLE_CALENDAR_SETUP.md](./GOOGLE_CALENDAR_SETUP.md)
4. Run development server: `npm run dev`
5. Build for production: `npm run build`

## Brand Configuration

- **Brand**: Windchasers
- **Theme**: Gold (#C9A961, #1A0F0A, #E8D5B7)
- **Logo**: Windchasers logo
- **Supabase**: Windchasers project credentials

## Aviation-Specific Features

The Windchasers dashboard includes aviation-specific fields in the LeadsTable:

- **User Type**: Student, Parent, Professional
- **Course Interest**: DGCA, Flight, Heli, Cabin, Drone
- **Timeline**: ASAP, 1-3 Months, 6+ Months, 1 Year+
- **Additional Filters**: User Type and Course Interest filters

These fields are stored in `unified_context.windchasers` in the database.

## Google Calendar Integration

The dashboard includes Google Calendar integration for managing bookings:
- Sync bookings from the database to Google Calendar
- View real-time availability
- Create, update, and delete calendar events

See [GOOGLE_CALENDAR_SETUP.md](./GOOGLE_CALENDAR_SETUP.md) for setup instructions.

## Deployment

Deploy independently from PROXe dashboard:

```bash
npm run build
npm start
```
