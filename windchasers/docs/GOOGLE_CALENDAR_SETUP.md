# Google Calendar Integration Setup

This guide explains how to set up Google Calendar integration for the Windchasers dashboard.

## Overview

The Google Calendar integration allows you to:
- Sync bookings from the database to Google Calendar
- View real-time availability
- Create, update, and delete calendar events
- Keep bookings synchronized between the dashboard and Google Calendar

## Prerequisites

1. A Google Cloud Project
2. A Google Service Account with Calendar API access
3. A Google Calendar to sync bookings to

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Calendar API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

### 2. Create a Service Account

1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details:
   - **Name**: `windchasers-calendar-service`
   - **Description**: `Service account for Windchasers calendar integration`
4. Click "Create and Continue"
5. Skip the optional steps and click "Done"

### 3. Create and Download Service Account Key

1. Click on the service account you just created
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Select "JSON" format
5. Click "Create" - the JSON file will be downloaded

### 4. Share Calendar with Service Account

1. Open the JSON key file you downloaded
2. Copy the `client_email` value (e.g., `windchasers-calendar-service@your-project.iam.gserviceaccount.com`)
3. Open your Google Calendar (the one you want to sync bookings to)
4. Click the three dots next to the calendar name > "Settings and sharing"
5. Under "Share with specific people", click "Add people"
6. Paste the service account email
7. Set permission to **"Make changes to events"**
8. Click "Send"

### 5. Configure Environment Variables

Add the following environment variables to your `.env.local` file:

```bash
# Google Calendar Integration
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=your-calendar-id@gmail.com
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
```

#### Getting the Private Key

1. Open the JSON key file you downloaded
2. Copy the `private_key` value
3. The private key should include the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers
4. When adding to `.env.local`, you can either:
   - Use escaped newlines: `"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"`
   - Or use actual newlines (if your environment supports it)

#### Finding Your Calendar ID

Your calendar ID is typically your email address (e.g., `your-email@gmail.com`). For shared calendars, you can find it in the calendar settings under "Integrate calendar" > "Calendar ID".

### 6. Restart Your Application

After adding the environment variables, restart your Next.js application:

```bash
npm run dev
```

## Usage

### Syncing Bookings

1. Navigate to the **Bookings** page in the dashboard
2. Click the **"Sync with Google Calendar"** button
3. The system will:
   - Create new calendar events for bookings without Google Event IDs
   - Update existing events if booking details changed
   - Store the Google Event ID in the booking metadata

### API Endpoints

The following API endpoints are available:

#### Sync Calendar
```bash
POST /api/calendar/sync
```
Syncs all bookings from the database to Google Calendar.

#### Check Availability
```bash
POST /api/calendar/availability
Body: { "date": "2024-01-15" }
```
Returns available time slots for a specific date.

#### List Events
```bash
GET /api/calendar/events?startDate=2024-01-01&endDate=2024-01-31
```
Lists calendar events within a date range.

#### Create Event
```bash
POST /api/calendar/events
Body: {
  "date": "2024-01-15",
  "time": "11:00 AM",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890"
}
```

#### Update Event
```bash
PUT /api/calendar/events
Body: {
  "eventId": "event-id-here",
  "date": "2024-01-15",
  "time": "2:00 PM",
  "name": "John Doe"
}
```

#### Delete Event
```bash
DELETE /api/calendar/events?eventId=event-id-here
```

## Troubleshooting

### "Calendar not found or access denied"

- Ensure the calendar is shared with the service account email
- Verify the service account has "Make changes to events" permission
- Check that `GOOGLE_CALENDAR_ID` matches the calendar email

### "Invalid private key format"

- Ensure the private key includes the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers
- Check that newlines are properly escaped or formatted
- Verify the key hasn't been corrupted

### "Failed to authenticate with Google Calendar"

- Verify `GOOGLE_SERVICE_ACCOUNT_EMAIL` matches the service account email
- Check that the Google Calendar API is enabled in your Google Cloud project
- Ensure the service account JSON key is valid

### Events not appearing in Google Calendar

- Run the sync operation manually from the dashboard
- Check the browser console for errors
- Verify the calendar ID is correct
- Ensure the service account has write permissions

## Security Notes

- **Never commit** the service account JSON file or private key to version control
- Store credentials securely using environment variables
- Use a separate service account for production and development
- Regularly rotate service account keys

## Support

For issues or questions, please refer to:
- [Google Calendar API Documentation](https://developers.google.com/calendar/api)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)
