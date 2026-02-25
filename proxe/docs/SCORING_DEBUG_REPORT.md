# PROXe Lead Scoring Debug Report

## Issues Identified

### 1. **CRITICAL: Trigger Function Parameter Mismatch** ✅ FIXED
**Location**: `supabase/migrations/011_lead_scoring_system.sql` line 372

**Problem**: 
- The trigger function `trigger_update_lead_score()` calls `update_lead_score_and_stage(NEW.lead_id)` with only one parameter
- But `update_lead_score_and_stage()` requires two parameters: `lead_uuid` and `user_uuid`
- Triggers don't have user context, so `user_uuid` should be NULL

**Fix**: Created migration `017_fix_scoring_trigger.sql` that:
- Updates trigger to call `update_lead_score_and_stage(NEW.lead_id, NULL)`
- Updates `update_lead_score_and_stage` to handle NULL `user_uuid` gracefully
- Only logs stage changes when `user_uuid` is provided

### 2. **Scoring Function Exists** ✅ VERIFIED
- Function: `calculate_lead_score(UUID)` exists in migration 011
- Function: `update_lead_score_and_stage(UUID, UUID)` exists
- Function: `determine_lead_stage(INTEGER, BOOLEAN, BOOLEAN)` exists

### 3. **Trigger Setup** ⚠️ NEEDS VERIFICATION
- Trigger: `trigger_messages_update_score` should fire on `messages` INSERT
- Location: `supabase/migrations/011_lead_scoring_system.sql` lines 378-382
- **Action Required**: Run migration 017 to fix the trigger

### 4. **Database Columns** ✅ VERIFIED
- `all_leads.lead_score` - exists
- `all_leads.lead_stage` - exists
- `all_leads.sub_stage` - exists
- `all_leads.stage_override` - exists
- `all_leads.is_manual_override` - exists (from migration 015)

### 5. **Webhook Endpoint** ✅ EXISTS
- Location: `src/app/api/webhooks/message-created/route.ts`
- Calls: `/api/leads/score` endpoint
- **Note**: The webhook calls `/api/leads/score` but the actual endpoint is `/api/dashboard/leads/[id]/score`

### 6. **API Endpoint Issues** ⚠️ FOUND
**Location**: `src/app/api/webhooks/message-created/route.ts` line 25

**Problem**: 
- Webhook calls `${appUrl}/api/leads/score` 
- But actual endpoint is `/api/dashboard/leads/[id]/score`
- This will cause 404 errors

**Fix Needed**: Update webhook to use correct endpoint path

## Test Endpoint Created

**Location**: `src/app/api/test-scoring/route.ts`

**Usage**:
```bash
POST /api/test-scoring
Body: { "lead_id": "uuid-here" }
```

**Output**: Comprehensive debug information including:
- Lead existence check
- Column existence verification
- Message count and statistics
- Scoring function test results
- Update function test results
- Session data (web, whatsapp, voice, social)
- Before/after scoring comparison
- Sample leads with scores
- All errors encountered

## Action Items

### Immediate (Run These Migrations):
1. ✅ **Migration 016**: Fix RLS policies for updates
2. ✅ **Migration 017**: Fix trigger function parameter issue

### Code Fixes Needed:
1. ⚠️ **Fix webhook endpoint path** in `src/app/api/webhooks/message-created/route.ts`
   - Change `/api/leads/score` to `/api/dashboard/leads/${lead_id}/score`

### Testing Steps:
1. Run migration 017 in Supabase
2. Test trigger manually:
   ```sql
   -- Insert a test message
   INSERT INTO messages (lead_id, channel, sender, content, message_type)
   VALUES ('your-lead-id', 'web', 'customer', 'Test message', 'text');
   
   -- Check if lead_score was updated
   SELECT id, name, lead_score, lead_stage, last_scored_at 
   FROM all_leads 
   WHERE id = 'your-lead-id';
   ```

3. Use test endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/test-scoring \
     -H "Content-Type: application/json" \
     -d '{"lead_id": "your-lead-id"}'
   ```

4. Check for leads with scores:
   ```sql
   SELECT COUNT(*) FROM all_leads WHERE lead_score > 0;
   SELECT id, name, lead_score, lead_stage FROM all_leads WHERE lead_score > 0 LIMIT 10;
   ```

## Expected Behavior After Fixes

1. **When a message is inserted**:
   - Trigger `trigger_messages_update_score` fires
   - Calls `update_lead_score_and_stage(lead_id, NULL)`
   - Calculates new score using `calculate_lead_score()`
   - Determines new stage using `determine_lead_stage()`
   - Updates `all_leads` with new score and stage
   - Does NOT log to `lead_stage_changes` (no user_uuid)

2. **When webhook is called**:
   - Webhook receives `lead_id`
   - Calls `/api/dashboard/leads/[id]/score`
   - API calls `update_lead_score_and_stage(lead_id, user_id)`
   - Updates score and stage
   - Logs to `lead_stage_changes` (has user_uuid)

## Scoring Algorithm Summary

**Components**:
- **AI Analysis (60%)**: Engagement quality (20%), Intent signals (20%), Question depth (20%)
- **Activity (30%)**: Response rate, Days inactive, Touchpoints
- **Business (10%)**: Booking made (+50), Re-engaged (+20)

**Stage Assignment**:
- Score >= 86 OR has_booking → "Booking Made"
- Score >= 61 → "High Intent"
- Score >= 31 → "Qualified"
- is_active_chat → "Engaged"
- Score < 61 → "In Sequence" or "Cold"

