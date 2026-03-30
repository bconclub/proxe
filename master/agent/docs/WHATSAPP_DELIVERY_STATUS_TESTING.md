# WhatsApp Delivery Status Testing Checklist

## Pre-Deployment Checklist

### 1. Database Migration (REQUIRED FIRST)
```bash
# Deploy the migration to add delivery_status columns
supabase db push
# OR run manually in Supabase SQL Editor:
cat master/supabase/migrations/019_whatsapp_delivery_status.sql
```

**Verify migration applied:**
```sql
-- Check columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'conversations' 
AND column_name IN ('delivery_status', 'status_updated_at', 'status_error');

-- Check indexes exist
SELECT indexname FROM pg_indexes WHERE tablename = 'conversations';

-- Check all_leads has cooldown column
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'all_leads' AND column_name = 'follow_up_cooldown_until';
```

---

## Testing Scenarios

### Test 1: Basic Message Flow (Happy Path)
**Setup:** Fresh conversation, valid WhatsApp number

| Step | Action | Expected Result | Verify |
|------|--------|-----------------|--------|
| 1.1 | Send WhatsApp message to agent | Message received | Check webhook logs |
| 1.2 | Wait for AI response | Response sent | Check meta/route.ts logs |
| 1.3 | Check database immediately | `delivery_status = 'sent'` | Query conversations table |
| 1.4 | Wait 5-10 seconds for Meta webhook | Status updates to 'delivered' | Check webhook logs + DB |
| 1.5 | Open WhatsApp on customer device | Status updates to 'read' | Check DB + Dashboard |
| 1.6 | Check Dashboard inbox | Green double checkmark shown | Visual verification |

**Database query to verify:**
```sql
SELECT id, content, delivery_status, status_updated_at, metadata->>'whatsapp_message_id' as wamid
FROM conversations 
WHERE channel = 'whatsapp' AND sender = 'agent'
ORDER BY created_at DESC LIMIT 5;
```

---

### Test 2: Failed Message (Invalid Number)
**Setup:** Invalid or blocked WhatsApp number

| Step | Action | Expected Result | Verify |
|------|--------|-----------------|--------|
| 2.1 | Send message to invalid number | Meta returns error | Check sendWhatsAppReply logs |
| 2.2 | Check database | `delivery_status = 'pending'` or `null` | Query DB |
| 2.3 | Wait for webhook (if wamid was returned) | Status = 'failed' | Check DB |
| 2.4 | Check lead record | `follow_up_cooldown_until` set to +24h | Query all_leads table |
| 2.5 | Check Dashboard | Red X icon with error tooltip | Visual verification |

**Database queries:**
```sql
-- Check failed message
SELECT id, delivery_status, status_error, metadata 
FROM conversations 
WHERE delivery_status = 'failed' 
ORDER BY status_updated_at DESC LIMIT 1;

-- Check lead cooldown
SELECT id, follow_up_cooldown_until 
FROM all_leads 
WHERE id = (SELECT lead_id FROM conversations WHERE delivery_status = 'failed' LIMIT 1);
```

---

### Test 3: Race Condition Handling
**Setup:** Webhook arrives before DB write

| Step | Action | Expected Result | Verify |
|------|--------|-----------------|--------|
| 3.1 | Simulate slow DB (add delay in code) | Webhook arrives first | Check logs |
| 3.2 | Check status_sync_queue | Entry created with wamid + status | Query queue table |
| 3.3 | Run cron job manually | Queue entry processed, conv updated | Check cron logs |

**Manual cron trigger:**
```bash
curl -H "x-cron-secret: YOUR_CRON_SECRET" \
  https://your-domain.com/api/cron/sync-whatsapp-status
```

---

### Test 4: Dashboard Real-Time Updates
**Setup:** Open inbox page, have customer on another device

| Step | Action | Expected Result | Verify |
|------|--------|-----------------|--------|
| 4.1 | Open conversation in Dashboard | Messages load with status | Visual check |
| 4.2 | Send message from agent | Amber checkmark appears | Visual check |
| 4.3 | Wait for delivery (customer phone online) | Green single checkmark | Auto-update in 30s or realtime |
| 4.4 | Customer opens WhatsApp | Green double checkmark | Auto-update in 30s or realtime |
| 4.5 | Check network tab | Supabase realtime subscription active | DevTools verification |

---

### Test 5: Cron Job Sync
**Setup:** Messages stuck in 'sent' status for > 1 hour

| Step | Action | Expected Result | Verify |
|------|--------|-----------------|--------|
| 5.1 | Create test message, set status='sent' manually | Test data ready | DB update |
| 5.2 | Trigger cron job (dry run) | Shows what would update | Check response |
| 5.3 | Trigger cron job (live) | Status updated from Meta | Check DB + response |
| 5.4 | Check rate limiting | 100ms between API calls | Logs verification |
| 5.5 | Check limit enforcement | Max 100 messages processed | Response shows count |

**Test commands:**
```bash
# Dry run
curl -H "x-cron-secret: $CRON_SECRET" \
  "https://your-domain.com/api/cron/sync-whatsapp-status?dryRun=true&limit=10"

# Live run
curl -H "x-cron-secret: $CRON_SECRET" \
  "https://your-domain.com/api/cron/sync-whatsapp-status?limit=10"
```

---

### Test 6: 7-Day Status Hiding
**Setup:** Old messages in database

| Step | Action | Expected Result | Verify |
|------|--------|-----------------|--------|
| 6.1 | Find message > 7 days old with status | Verify in DB | Query check |
| 6.2 | Open conversation in Dashboard | Old message shows NO status badge | Visual check |
| 6.3 | Find recent message (< 7 days) | Status badge visible | Visual check |

---

### Test 7: Security & Access Control
**Setup:** Unauthorized access attempts

| Step | Action | Expected Result | Verify |
|------|--------|-----------------|--------|
| 7.1 | Call cron without secret | 401 Unauthorized | HTTP response |
| 7.2 | Call cron with wrong secret | 401 Unauthorized | HTTP response |
| 7.3 | Call cron with correct secret | 200 Success | HTTP response |
| 7.4 | Verify no SQL injection | Special chars handled safely | Code review |

---

## Environment Variables Check

Ensure these are set in production:

```bash
# Required for webhook handler
META_WHATSAPP_ACCESS_TOKEN=your_token
META_WHATSAPP_PHONE_NUMBER_ID=your_phone_id

# Required for cron job
CRON_SECRET=random_secret_key
META_WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_id

# Optional (for local testing)
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

## Rollback Plan

If issues occur in production:

1. **Code rollback:** Revert to previous deployment
2. **Database (safe - columns are nullable):**
   ```sql
   -- Optional: Hide columns from app (don't drop to preserve data)
   ALTER TABLE conversations ALTER COLUMN delivery_status SET DEFAULT NULL;
   ```
3. **Check for stuck messages:**
   ```sql
   SELECT COUNT(*) FROM conversations 
   WHERE delivery_status IN ('pending', 'sent') 
   AND created_at < NOW() - INTERVAL '1 hour';
   ```

---

## Sign-Off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Developer | | | Code reviewed |
| QA | | | All tests passed |
| DevOps | | | Migration applied |
| Product | | | UX verified |
