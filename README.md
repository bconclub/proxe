# PROXe COMMAND CENTER

A comprehensive Next.js dashboard application for managing leads, bookings, and metrics from multiple channels (Web Agent, WhatsApp, Voice).

## Features

- 🔐 **Authentication System** - Secure login with Supabase Auth
- 👥 **Leads Management** - Real-time leads dashboard with filtering and export
- 📅 **Bookings Calendar** - View and manage scheduled demos and calls
- 📈 **Metrics Dashboard** - Comprehensive analytics with charts and KPIs
- 🔄 **Real-time Updates** - Live data synchronization using Supabase Realtime
- 🔌 **API Integrations** - Webhooks for WhatsApp and Voice APIs

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Supabase** (Database + Auth + Realtime)
- **Recharts** (Data visualization)
- **Tailwind CSS** (Styling)

## Getting Started

### Quick Setup Guide

For detailed step-by-step instructions, see **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**

### Prerequisites

- Node.js 18+ and npm/yarn
- Supabase account and project
- Environment variables configured

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
   - Copy `.env.local.example` to `.env.local`
   - Fill in your Supabase credentials (see SETUP_GUIDE.md for details)

3. **Set up Supabase:**
   - Create Supabase project
   - Run database migrations (`supabase/migrations/`)
   - Enable Realtime for `all_leads` table
   - Create admin user (see SETUP_GUIDE.md)

4. **Run the development server:**
```bash
npm run dev
```

5. **Access the dashboard:**
   - Open [http://localhost:3000](http://localhost:3000)
   - Login with admin credentials (default: proxeadmin@proxe.com / proxepass)

## Project Structure

```
/dashboard-repo
  /app
    /api          # API routes for data aggregation
    /dashboard    # Dashboard pages
    /auth         # Authentication pages
  /src
    /components   # Dashboard components
    /lib          # Utilities, Supabase client
    /hooks        # Custom hooks for real-time data
    /types        # TypeScript types
  /supabase
    /migrations   # Database schema migrations
```

## Database Schema

The dashboard uses the following main tables:

- `dashboard_users` - User accounts with roles (admin, viewer)
- `user_invitations` - Invitation tokens for adding new users
- `dashboard_settings` - Dashboard configuration
- `all_leads` - Unified lead table across all channels
- `web_sessions`, `whatsapp_sessions`, `voice_sessions`, `social_sessions` - Channel-specific lead data
- `unified_leads` - View combining leads from all sources for dashboard display

## API Routes

### Dashboard APIs
- `GET /api/dashboard/leads` - Fetch leads with filtering and pagination
- `GET /api/dashboard/bookings` - Fetch scheduled bookings
- `GET /api/dashboard/metrics` - Get aggregated metrics

### Authentication APIs
- `POST /api/auth/invite` - Create user invitation (admin only)

### Integration APIs
- `GET/POST /api/integrations/web-agent` - Web Agent API integration
- `POST /api/integrations/whatsapp` - WhatsApp webhook endpoint
- `POST /api/integrations/voice` - Voice API webhook endpoint

## Features in Detail

### Leads Dashboard
- Real-time updates when new leads are added
- Filter by date range, source channel, and status
- Export leads to CSV
- Pagination support

### Bookings Calendar
- View upcoming bookings
- Filter by date
- Display booking details (name, email, phone, time)

### Metrics Dashboard
- Key metrics cards (total conversations, active conversations, conversion rate)
- Charts: Conversations over time, Leads by source, Conversion funnel, Response time trends

### Real-time Updates
- Uses Supabase Realtime subscriptions
- Automatically updates when data changes
- Fallback to polling if Realtime unavailable

## Development

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

### Building for Production
```bash
npm run build
npm start
```

## Deployment

The dashboard can be deployed to:
- **Vercel** (recommended for Next.js)
- **Netlify**
- **Any Node.js hosting platform**

Make sure to:
1. Set environment variables in your hosting platform
2. Run database migrations on your Supabase project
3. Configure CORS settings if needed

## Security

- Row Level Security (RLS) policies protect database access
- Authentication required for all dashboard routes
- Role-based access control (admin/viewer)
- API key verification for webhook endpoints

## Future Enhancements

- [ ] Google Calendar integration
- [ ] Email notifications for new leads
- [ ] Advanced reporting and analytics
- [ ] Lead notes and activity tracking
- [ ] Custom dashboard widgets
- [ ] Mobile app support

## License

[Your License Here]

## Support

For issues and questions, please contact [your support email].

