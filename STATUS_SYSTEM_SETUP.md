# Custom Status System Setup

## Overview
The system now supports custom lead statuses that can be changed by users. Leads coming from the website chat agent will have initial statuses of "New Lead" or "Call Booked" (if booking is confirmed), and users can click to change them to any of the available statuses.

## Available Statuses
1. **New Lead** - Default status for new leads
2. **Follow Up** - Lead requires follow-up
3. **RNR (No Response)** - No response from lead
4. **Interested** - Lead is interested
5. **Wrong Enquiry** - Not a valid lead
6. **Call Booked** - Call/booking is confirmed
7. **Closed** - Lead is closed

## Setup Steps

### 1. Run Database Migrations

Run these migrations in your Supabase SQL Editor **in order**:

#### Migration 1: Add Status Column
**File:** `supabase/migrations/005_add_status_column.sql`
- Adds `status` column to `sessions` table
- Sets initial statuses based on `booking_status`
- Adds constraint to ensure only valid statuses
- Creates index for filtering

#### Migration 2: Add Update Policy
**File:** `supabase/migrations/006_add_sessions_update_policy.sql`
- Allows authenticated users to update the `status` column
- Required for the click-to-edit functionality

#### Migration 3: Update View
**File:** `create_unified_leads_view.sql`
- Updates the `unified_leads` view to use the new `status` column
- Falls back to "New Lead" or "Call Booked" if status is null

### 2. How It Works

#### Initial Status Assignment
- When a lead comes from the website chat agent:
  - If `booking_status = 'confirmed'` → Status = **"Call Booked"**
  - Otherwise → Status = **"New Lead"**

#### User Status Updates
- Users can click on any status badge in the Leads table
- A dropdown menu appears with all available statuses
- Selecting a status updates it immediately
- Changes are saved to the database and reflected in real-time

### 3. Features

✅ **Click-to-Edit Status** - Click any status badge to change it
✅ **Color-Coded Statuses** - Each status has a unique color for easy identification
✅ **Status Filtering** - Filter leads by any status in the dropdown
✅ **Real-time Updates** - Status changes sync across all users
✅ **Validation** - Only allowed statuses can be set

### 4. API Endpoint

**PATCH** `/api/dashboard/leads/[id]/status`

Updates the status of a lead.

**Request Body:**
```json
{
  "status": "Follow Up"
}
```

**Response:**
```json
{
  "success": true,
  "lead": { ... }
}
```

### 5. Testing

1. Run the migrations in Supabase SQL Editor
2. Refresh your browser
3. Go to the Leads page
4. Click on any status badge
5. Select a new status from the dropdown
6. Verify the status updates immediately

## Notes

- The status column is separate from `booking_status`
- `booking_status` is for booking management (pending, confirmed, cancelled)
- `status` is for lead management (New Lead, Follow Up, etc.)
- Both can coexist and serve different purposes

