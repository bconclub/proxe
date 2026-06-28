# Lead Stages Guide

## Overview

The PROXe lead stage system has 9 distinct stages organized into two categories:
- **Auto-calculated stages**: Determined by AI scoring algorithm
- **Manual/Terminal stages**: Set by human agents or represent final states

---

## Stage Definitions

### Auto-Calculated Stages

These stages are automatically assigned by the AI based on lead score and activity:

| Stage | Score Range | Trigger Condition | Description |
|-------|-------------|-------------------|-------------|
| **New** | 0-30 | Default state | Fresh lead, no significant interaction yet |
| **Engaged** | 0-30 | Active chat/conversation | Lead is actively chatting despite low score |
| **Qualified** | 31-60 | Score threshold | Lead has shown moderate interest |
| **High Intent** | 61-85 | Score threshold | Strong buying signals detected |
| **Booking Made** | 86-100 | Score OR actual booking | Lead has booked a call or score indicates readiness |
| **In Sequence** | < 61 | Score < 61, no active chat | Lead is in automated follow-up sequence |

### Manual/Terminal Stages

These stages are set by human agents or represent end states:

| Stage | When to Use | Description |
|-------|-------------|-------------|
| **Converted** | Manual | Lead became a customer |
| **Closed Lost** | Manual | Lead is no longer viable |
| **Cold** | Manual OR Auto (30 days) | Lead is dormant, no active follow-up |

---

## "In Sequence" vs "Cold" - Key Differences

### In Sequence
- **Purpose**: Active automated follow-up is happening
- **Auto-assigned when**: 
  - Score < 61
  - NOT in active chat
  - NOT in terminal stage (Converted/Closed Lost)
- **Visual indicator**: Purple badge with pulse animation
- **Can be manually overridden**: Yes
- **Typical duration**: Until lead responds or 30 days pass

### Cold
- **Purpose**: Lead is dormant, no active follow-up
- **Auto-assigned when**:
  - 30+ days in "In Sequence" with no response
- **Manually assigned when**:
  - Agent determines lead is no longer engaged
  - Sequence exhausted without response
- **Visual indicator**: Light blue/gray badge with snowflake icon
- **Can be manually overridden**: Yes (moves to "Engaged" or "In Sequence")

### State Transition Flow

```
New → Engaged → Qualified → High Intent → Booking Made → Converted
  ↓                                    ↓
In Sequence (auto)                 Closed Lost (manual)
  ↓
Cold (after 30 days or manual)
  ↓
Re-engagement (if lead responds) → Engaged
```

---

## Stage Override System

### What is Stage Override?

When `stage_override = TRUE`:
- The AI will **NOT** automatically change the lead's stage
- The stage remains locked to the manually selected value
- Score updates still happen, but don't affect stage

### When Override is Ignored

Even with `stage_override = TRUE`, the AI WILL change stage for:

1. **Booking Made**
   - Trigger: Actual booking created OR score >= 86
   - Reason: Business-critical - agent needs to know
   - Override cleared: Yes (returns to AI control)

2. **Re-engagement from Cold**
   - Trigger: Lead responds after being in "Cold" for 30+ days
   - New stage: "Engaged"
   - Reason: Lead is active again
   - Override cleared: Yes (allows AI to continue managing)

### How to Set Override

1. **Via Dashboard**: Select any stage in Lead Details Modal → Activity logged → Override set
2. **Via API**: POST to `/api/dashboard/leads/[id]/override` or `/api/dashboard/leads/[id]/stage`

### How to Clear Override (Return to AI Mode)

```bash
# Via API
DELETE /api/dashboard/leads/[id]/stage

# Or use the function
curl -X POST https://your-domain.com/api/dashboard/leads/[id]/stage \
  -H "Content-Type: application/json" \
  -d '{"action": "clear_override"}'
```

Or in Supabase:
```sql
SELECT clear_stage_override('lead-uuid-here');
```

---

## Sub-Stages (High Intent Only)

When a lead is in "High Intent" stage, you can optionally set a sub-stage:

| Sub-Stage | Description |
|-----------|-------------|
| **proposal** | Proposal sent, awaiting response |
| **negotiation** | Terms being negotiated |
| **on-hold** | Temporarily paused (e.g., waiting for budget approval) |

Sub-stages are cleared when lead moves out of "High Intent".

---

## Best Practices

### When to Manually Override

✅ **DO override when:**
- You have special knowledge the AI doesn't (e.g., verbal commitment)
- Lead is in "In Sequence" but you want to fast-track to "High Intent"
- Need to pause automated sequences for sensitive leads

❌ **DON'T override when:**
- Just testing (use dashboard filters instead)
- Lead is naturally progressing through stages
- You want to temporarily check a different stage

### Stage-Specific Actions

| Stage | Recommended Actions |
|-------|---------------------|
| New | Automated welcome sequence |
| Engaged | Human agent should monitor/chat |
| Qualified | Schedule discovery call |
| High Intent | Assign senior sales rep, set sub-stage |
| Booking Made | Confirm booking, send prep materials |
| In Sequence | Let automation run, monitor open rates |
| Cold | Monthly check-in or archive |
| Converted | Move to customer onboarding |
| Closed Lost | Archive, add to re-engagement campaign in 6 months |

---

## Troubleshooting

### Lead stuck in wrong stage

1. Check `stage_override` - if TRUE, clear it
2. Trigger recalculation: `update_lead_score_and_stage(lead_uuid)`
3. Check `lead_score` - stage is based on score thresholds

### "In Sequence" leads not going to "Cold"

- Auto-transition happens after 30 days of no response
- Verify `last_interaction_at` timestamp
- Check if `stage_override` is blocking

### Can't select stage

- Verify stage name matches allowed list
- Check for typos: "In Sequence" (not "In sequence" or "In_Sequence")
- Database constraint error means invalid stage name

---

## API Reference

### Get Lead Stage
```typescript
GET /api/dashboard/leads/[id]
// Returns: { lead_stage, sub_stage, stage_override, lead_score }
```

### Update Stage (with override)
```typescript
POST /api/dashboard/leads/[id]/override
{
  "new_stage": "High Intent",
  "activity_type": "call",
  "note": "Verbal commitment received",
  "duration_minutes": 30
}
```

### Update Stage Only
```typescript
PATCH /api/dashboard/leads/[id]/stage
{
  "stage": "High Intent",
  "sub_stage": "proposal"  // optional, only for High Intent
}
```

### Clear Override
```typescript
DELETE /api/dashboard/leads/[id]/stage
// Returns: { success, recalculated, result: { new_stage, new_score } }
```

---

## Database Schema Reference

```sql
-- Key columns in all_leads table
lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100)
lead_stage TEXT DEFAULT 'New' CHECK (lead_stage IN (
  'New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made',
  'Converted', 'Closed Lost', 'In Sequence', 'Cold'
))
sub_stage TEXT  -- Only for 'High Intent': proposal, negotiation, on-hold
stage_override BOOLEAN DEFAULT FALSE
```
