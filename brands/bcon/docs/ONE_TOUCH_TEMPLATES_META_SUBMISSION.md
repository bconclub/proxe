# BCON One Touch Templates - Meta Submission Guide

## Overview
These are the 3 One Touch templates for initial outreach (response_count < 2, silent 24-48h).

**Journey Stage:** One Touch  
**Timing:** Day 3, Day 7, Day 30  
**Channel:** WhatsApp  
**Tone:** Soft → Normal  
**Variants:** A, B, C (for A/B/C testing)

---

## Template 1: Day 3 - Initial Follow-up (Soft)

### Variant A: `bcon_onetouch_d3_followup_v1`

**Category:** UTILITY  
**Language:** English (en)  

**Body:**
```
Hi {{1}}, we noticed you checked out BCON recently. Still exploring AI solutions for your business? Happy to answer any questions.
```

**Parameters:**
- {{1}} = customer_name (e.g., "John")

**Sample Values:**
- John, Sarah, Michael

**Purpose:** Initial soft follow-up for low-engagement leads

---

### Variant B: `bcon_onetouch_d3_value_v1`

**Category:** MARKETING  
**Language:** English (en)

**Body:**
```
Hi {{1}}, following up on your interest in BCON. Many businesses like yours save 10+ hours/week with our AI systems. Worth a quick chat?
```

**Parameters:**
- {{1}} = customer_name (e.g., "John")

**Sample Values:**
- John, Sarah, Michael

**Purpose:** Value-focused follow-up variant

---

### Variant C: `bcon_onetouch_d3_question_v1`

**Category:** UTILITY  
**Language:** English (en)

**Body:**
```
Hi {{1}}, saw you were interested in AI for your business. What's your biggest challenge with customer follow-ups right now?
```

**Parameters:**
- {{1}} = customer_name (e.g., "John")

**Sample Values:**
- John, Sarah, Michael

**Purpose:** Question-based engagement

---

## Template 2: Day 7 - Value Reminder (Soft)

### Variant A: `bcon_onetouch_d7_reminder_v1`

**Category:** MARKETING  
**Language:** English (en)

**Body:**
```
Hi {{1}}, wanted to share: our clients typically see 40% faster response times in the first month. Still interested in exploring this for your business?
```

**Parameters:**
- {{1}} = customer_name (e.g., "John")

**Sample Values:**
- John, Sarah, Michael

**Purpose:** Value reminder with social proof

---

### Variant B: `bcon_onetouch_d7_case_study_v1`

**Category:** MARKETING  
**Language:** English (en)

**Body:**
```
Hi {{1}}, a {{2}} business similar to yours just automated 80% of their repetitive tasks with BCON. Curious how it might work for you?
```

**Parameters:**
- {{1}} = customer_name (e.g., "John")
- {{2}} = business_type (e.g., "retail", "service", "consulting")

**Sample Values:**
- John, Sarah, Michael
- retail, service, consulting

**Purpose:** Case study approach

---

### Variant C: `bcon_onetouch_d7_soft_check_v1`

**Category:** UTILITY  
**Language:** English (en)

**Body:**
```
Hi {{1}}, checking in - no pressure at all. If AI automation isn't a priority right now, I understand. Just let me know either way?
```

**Parameters:**
- {{1}} = customer_name (e.g., "John")

**Sample Values:**
- John, Sarah, Michael

**Purpose:** Soft check-in with low pressure

---

## Template 3: Day 30 - Monthly Check-in (Normal)

### Variant A: `bcon_onetouch_d30_monthly_v1`

**Category:** MARKETING  
**Language:** English (en)

**Body:**
```
Hi {{1}}, it's been a few weeks since we connected. A lot has changed with AI capabilities since then - want a quick update on what's possible for {{2}} businesses?
```

**Parameters:**
- {{1}} = customer_name (e.g., "John")
- {{2}} = business_type (e.g., "retail", "service")

**Sample Values:**
- John, Sarah, Michael
- retail, service, consulting

**Purpose:** Monthly check-in with new value

---

### Variant B: `bcon_onetouch_d30_reengagement_v1`

**Category:** MARKETING  
**Language:** English (en)

**Body:**
```
Hi {{1}}, we're wrapping up a busy month helping businesses automate. Still thinking about AI for {{2}}? I have 10 minutes this week if you want to see what's possible.
```

**Parameters:**
- {{1}} = customer_name (e.g., "John")
- {{2}} = business_type (e.g., "retail", "service")

**Sample Values:**
- John, Sarah, Michael
- retail, service, consulting

**Purpose:** Re-engagement with availability

---

### Variant C: `bcon_onetouch_d30_final_v1`

**Category:** UTILITY  
**Language:** English (en)

**Body:**
```
Hi {{1}}, this will be my last message unless you're interested. If AI automation is something you want to explore in the future, just reply and we'll pick up where we left off.
```

**Parameters:**
- {{1}} = customer_name (e.g., "John")

**Sample Values:**
- John, Sarah, Michael

**Purpose:** Final attempt with open door

---

## Submission Checklist

### Before Submission:
- [ ] All 9 templates reviewed by copywriting team
- [ ] Business verification complete in Meta Business Manager
- [ ] WhatsApp Business Account approved
- [ ] Template naming convention confirmed (bcon_onetouch_d{day}_{purpose}_v1)

### Submission Method (choose one):

#### Option A: Meta Business Manager (Manual)
1. Go to business.facebook.com
2. Navigate to WhatsApp Manager
3. Click "Message Templates"
4. Click "Create Template"
5. Submit each template individually

#### Option B: API Submission (Automated)
```bash
curl -X POST \
  "https://graph.facebook.com/v18.0/{business-account-id}/message_templates" \
  -H "Authorization: Bearer {access-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "bcon_onetouch_d3_followup_v1",
    "category": "UTILITY",
    "language": "en",
    "components": [{
      "type": "BODY",
      "text": "Hi {{1}}, we noticed you checked out BCON recently. Still exploring AI solutions for your business? Happy to answer any questions.",
      "example": {
        "body_text": [["John"]]
      }
    }]
  }'
```

### After Submission:
- [ ] Monitor approval status (typically 24-48 hours)
- [ ] Update `follow_up_templates` table with `meta_template_id`
- [ ] Update `meta_status` to 'approved' or 'rejected'
- [ ] If rejected, fix issues and resubmit
- [ ] Test send to admin number before production

---

## Expected Approval Time
- **UTILITY category:** 1-24 hours
- **MARKETING category:** 24-48 hours

## Common Rejection Reasons
1. **Missing opt-out language** (for marketing) - Add "Reply STOP to unsubscribe" if required
2. **Too promotional** - Soften language, focus on value/help
3. **Invalid variable format** - Ensure {{1}}, {{2}} format with no spaces
4. **Missing examples** - Provide sample values for all variables

---

## Next Steps After Approval

1. **Test Templates:**
   ```bash
   node test-template.js bcon_onetouch_d3_followup_v1 "+1234567890" "John"
   ```

2. **Update task-worker.js:**
   - Remove hardcoded template references
   - Use `getTemplateForTask()` from templateLibrary.ts

3. **Monitor Performance:**
   - Track open rates by variant (A/B/C)
   - Adjust rotation based on engagement

4. **Prepare Low Touch Templates:**
   - Day 3: WhatsApp + Voice
   - Day 7: WhatsApp + Voice
   - Tone: Normal

---

## Database Migration

Run this after Meta approval to update template IDs:

```sql
-- Update after Meta approval
UPDATE follow_up_templates 
SET 
  meta_template_id = 'YOUR_TEMPLATE_ID_HERE',
  meta_status = 'approved'
WHERE meta_template_name = 'bcon_onetouch_d3_followup_v1';

-- Repeat for all 9 templates
```

---

## Questions?

Contact: BCON Dev Team  
Slack: #bcon-templates
