# PROXe Lead Scoring and Activity Tracking System

## Overview

This system provides AI-powered lead scoring, activity tracking, and unified summaries for the PROXe Command Center. It automatically scores leads based on conversation analysis, tracks all activities across channels, and provides actionable insights.

## Database Schema

### `all_leads` Table Fields
- `lead_score` (INTEGER, 0-100): AI-generated lead score
- `lead_stage` (TEXT): Current stage (New, Engaged, Qualified, High Intent, Booking Made, etc.)
- `sub_stage` (TEXT, nullable): Sub-stage for High Intent leads
- `last_interaction_at` (TIMESTAMP): Last interaction timestamp
- `response_count` (INTEGER): Number of customer responses
- `days_inactive` (INTEGER): Days since last interaction
- `total_touchpoints` (INTEGER): Total number of touchpoints across channels
- `is_manual_override` (BOOLEAN): Whether stage was manually overridden

### `activities` Table
Tracks all team activities:
- `id` (UUID)
- `lead_id` (UUID, FK to all_leads)
- `activity_type` (TEXT): 'call', 'meeting', 'message', 'note'
- `note` (TEXT, required): Activity description
- `duration_minutes` (INTEGER, optional)
- `next_followup_date` (TIMESTAMP, optional, rounded to 30-min intervals)
- `created_by` (UUID, FK to dashboard_users)
- `created_at` (TIMESTAMP)

### `stage_history` Table
Logs all stage changes:
- `id` (UUID)
- `lead_id` (UUID, FK to all_leads)
- `old_stage` (TEXT)
- `new_stage` (TEXT)
- `score_at_change` (INTEGER)
- `changed_by` (TEXT): 'PROXe AI', 'system', or user_id
- `changed_at` (TIMESTAMP)

## AI Scoring System

### Trigger
Scoring is automatically triggered when a new message is inserted into the `messages` table. The system calls `/api/webhooks/message-created` which then calls `/api/leads/score`.

### Scoring Algorithm

The AI (Claude) analyzes the full conversation thread and generates a score (0-100) based on:

1. **Engagement (20%)**: Response time, message length, questions asked
2. **Intent signals (20%)**: Keywords like pricing, booking, interested, when, how, schedule
3. **Conversation depth (20%)**: Number of turns, topic progression, specificity
4. **Activity metrics (30%)**: Response rate, days since start, touchpoints
5. **Business events (10%)**: 
   - Booking made: +50 points
   - Re-engaged after cold: +20 points

### Stage Assignment

Based on score:
- **0-30**: New or Engaged
- **31-60**: Qualified
- **61-85**: High Intent
- **86-100**: Booking Made
- **Override**: If booking exists in system → force "Booking Made" stage

### First Message Scoring

- Don't default to "New" - score immediately on first conversation message
- Strong intent + booking → straight to "Booking Made"
- Good engagement → "Qualified"
- Weak/generic → "New"

## Unified Summary

### Endpoint
`GET /api/dashboard/leads/[id]/summary`

### Format
"[Time ago] via [channel]. Customer [last action]. Currently [status]. [Key extracted info: interested in X, budget Y, pain points Z]. Next: [recommended action]."

### Attribution
Shows: "Last updated by [PROXe AI/Team Member Name/Customer] [time ago] - [action taken]"

### Error Handling
If API fails, shows: "Unable to load summary"

## Activity Log

### Endpoint
`GET /api/dashboard/leads/[id]/activities`

### Timeline Includes:
1. **PROXe actions** (Purple #8B5CF6): Messages sent, sequences triggered
2. **Team actions** (Blue #3B82F6): Logged activities from activities table
3. **Customer actions** (Green #22C55E): Replies, link clicks, bookings

### Display Format
- Icon + Actor + Action + Timestamp
- Color coded by actor type
- Sorted: newest first
- Empty state: "No activities logged yet"

## Manual Override

### Endpoint
`POST /api/dashboard/leads/[id]/override`

### Process
1. When team changes `lead_stage`, show activity logger modal
2. Required fields:
   - `activity_type` (call/meeting/message/note)
   - `note` (text)
3. Optional fields:
   - `duration_minutes`
   - `next_followup_date` (rounded to 30-min intervals)
4. Saves to `activities` table
5. Updates `lead_stage` and sets `is_manual_override=true`
6. Logs to `stage_history` with `changed_by=user_id`

## Background Job

### Endpoint
`POST /api/leads/rescore-all`

### Authentication
Requires `Authorization: Bearer <CRON_SECRET>` header

### Process
1. Fetches all leads with `lead_stage NOT IN ('converted','closed_lost')`
2. Rescores each lead using AI
3. Calculates `days_inactive` for all active leads
4. Processes in batches of 10 to avoid rate limiting

### Setup
Set up daily cron job to call this endpoint:
```bash
# Example cron job (runs daily at 2 AM)
0 2 * * * curl -X POST https://your-app.com/api/leads/rescore-all \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## API Endpoints

### Scoring
- `POST /api/leads/score` - Score a single lead
- `POST /api/webhooks/message-created` - Webhook handler for new messages
- `POST /api/leads/rescore-all` - Rescore all active leads (background job)

### Lead Details
- `GET /api/dashboard/leads/[id]/summary` - Get unified summary
- `GET /api/dashboard/leads/[id]/activities` - Get activity log
- `POST /api/dashboard/leads/[id]/override` - Manual stage override

## Environment Variables

Required:
- `CLAUDE_API_KEY` - Anthropic Claude API key for AI scoring
- `CRON_SECRET` - Secret for background job authentication
- `NEXT_PUBLIC_APP_URL` - Your app URL for webhook calls

## Frontend Components

### LeadDetailsModal
- Displays unified summary with attribution
- Shows activity log with color-coded timeline
- Shows lead score and stage
- Allows manual stage override via LeadStageSelector

### LeadStageSelector
- Shows activity logger modal when stage is changed
- Requires activity logging for manual overrides
- Updates lead stage and logs to stage_history

### ActivityLoggerModal
- Required fields: activity_type, note
- Optional fields: duration_minutes, next_followup_date
- Time picker with 30-minute intervals

## Error Handling

- **Unified summary fails**: Shows "Error: Failed to fetch lead summary"
- **Scoring fails**: Logs error, keeps current score
- **Activity log empty**: Shows "No activities logged yet"
- **API errors**: Gracefully handled, don't break user experience

## Migration

Run migration `015_proxe_lead_scoring_complete.sql` to set up:
- All required fields in `all_leads`
- `activities` table (renamed from `lead_activities` if exists)
- `stage_history` table
- Database functions for metrics updates
- Triggers for automatic metric updates

## Notes

- AI scoring requires Claude API key to be set
- Scoring is triggered automatically on message insert
- Manual overrides prevent automatic scoring updates
- Background job should run daily to keep scores fresh
- All timestamps are stored in UTC, displayed in IST

