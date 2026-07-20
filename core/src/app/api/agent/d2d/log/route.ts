import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, ensureOrUpdateLead } from '@/lib/services';
import { getCurrentBrandId, BRAND_ID } from '@/configs';

// D2D (door-to-door) field log - POP campaign only.
// One POST per door knocked: worker identity, the person met (optional - a
// knock with nobody home still counts for coverage), the place (constituency/
// booth/photo/geo), the outcome, and any grievance that came up.
//
// A "met" visit with a phone creates/merges a Person (phone = merge key on the
// POP DB) tagged first_touchpoint 'd2d', magnet 'd2d', engagement_type
// 'outreach' - so the People table can count and filter D2D arrivals.
//
// Photos land in the PRIVATE d2d-photos bucket (signed URLs only - the People
// list never surfaces them; access control is a follow-up decision, see
// brands/pop/docs/campaign-model.md).
//
// Auth: x-api-key = INBOUND_API_KEY (same pattern as leads/inbound). Callers:
// the field app, or a form→webhook bridge until that exists.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (getCurrentBrandId() !== 'pop') {
    return NextResponse.json({ error: 'D2D logging is a POP campaign feature' }, { status: 404 });
  }
  const expected = process.env.INBOUND_API_KEY;
  if (!expected || req.headers.get('x-api-key') !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'database unavailable' }, { status: 500 });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      worker_name, worker_phone,
      person, // { name?, phone? } - the citizen met at the door
      constituency, district, booth, address_note,
      photo_base64, photo_url,
      latitude, longitude,
      outcome = 'met', notes,
      grievance_category, grievance_text,
      lean, language,
      survey, survey_version, // household survey answers (026: jsonb on the visit)
      worker_code,            // QR badge code - resolves worker identity from the registry
    } = body || {};

    // Badge code → registry identity (field app sends the code it verified).
    let resolvedWorkerName = worker_name || null;
    let resolvedWorkerPhone = worker_phone || null;
    if (worker_code) {
      const { data: w } = await supabase.from('d2d_workers')
        .select('name, phone')
        .eq('verification_code', String(worker_code).trim().toUpperCase())
        .eq('status', 'active')
        .maybeSingle();
      if (w) { resolvedWorkerName = w.name; resolvedWorkerPhone = w.phone; }
    }

    // 1. Photo → private bucket (path stored, never a public URL).
    let storedPhotoPath: string | null = photo_url || null;
    if (photo_base64) {
      try {
        const buf = Buffer.from(String(photo_base64).replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from('d2d-photos').upload(path, buf, { contentType: 'image/jpeg' });
        if (upErr) console.error('[d2d] photo upload failed:', upErr.message);
        else storedPhotoPath = path;
      } catch (e: any) {
        console.error('[d2d] photo decode failed:', e?.message);
      }
    }

    // 2. Person - only when the visit actually reached someone with a phone.
    let leadId: string | null = null;
    const personPhone = person?.phone ? String(person.phone).replace(/\D/g, '').slice(-10) : null;
    if (outcome === 'met' && personPhone && personPhone.length === 10) {
      leadId = await ensureOrUpdateLead(person?.name || null, null, personPhone, 'web', undefined, supabase);
      if (leadId) {
        // D2D-specific columns - channel union has no 'd2d', so stamp the real
        // origin + campaign fields directly. Never overwrite an existing
        // engagement/grievance from a prior interaction.
        const { data: cur } = await supabase
          .from('all_leads')
          .select('first_touchpoint, engagement_type, grievance_text, constituency, district, booth, language')
          .eq('id', leadId).maybeSingle();
        const cols: Record<string, any> = { magnet: 'd2d' };
        if (!cur?.first_touchpoint || cur.first_touchpoint === 'web') cols.first_touchpoint = 'd2d';
        if (!cur?.engagement_type || cur.engagement_type === 'grievance') {
          // 'grievance' is the column default - treat it as unset unless a real
          // grievance exists on the row.
          if (!cur?.grievance_text) cols.engagement_type = 'outreach';
        }
        if (constituency && !cur?.constituency) cols.constituency = constituency;
        // Location/profile enrichment - fill-if-null (a prior channel's data wins).
        if (district && !cur?.district) cols.district = district;
        if (booth && !cur?.booth) cols.booth = booth;
        if (language && !cur?.language && ['pa', 'hi', 'en'].includes(language)) cols.language = language;
        // Lean - always overwrite: the doorstep read is the freshest signal
        // ("latest canvass wins").
        if (lean && ['supporter', 'leaning', 'undecided', 'opposed'].includes(lean)) cols.lean = lean;
        if (grievance_category) cols.grievance_category = grievance_category;
        if (grievance_text && !cur?.grievance_text) {
          cols.grievance_text = grievance_text;
          cols.engagement_type = 'grievance';
          cols.loop_status = 'raised';
        }
        const { error: updErr } = await supabase.from('all_leads').update(cols).eq('id', leadId);
        if (updErr) console.error('[d2d] lead update failed:', updErr.message);
      }
    }

    // 3. The visit row itself - always recorded (coverage counts every knock).
    const { data: visit, error: insErr } = await supabase
      .from('d2d_visits')
      .insert({
        worker_name: resolvedWorkerName,
        worker_phone: resolvedWorkerPhone,
        lead_id: leadId,
        constituency: constituency || null,
        district: district || null,
        booth: booth || null,
        address_note: address_note || null,
        photo_url: storedPhotoPath,
        latitude: typeof latitude === 'number' ? latitude : null,
        longitude: typeof longitude === 'number' ? longitude : null,
        outcome,
        notes: notes || null,
        survey: survey && typeof survey === 'object' ? survey : null,
        survey_version: survey_version || null,
        brand: BRAND_ID,
      })
      .select('id')
      .single();
    if (insErr) {
      return NextResponse.json({ error: `visit insert failed: ${insErr.message}` }, { status: 500 });
    }

    // 4. Revisit → follow-up reminder on the task board (+2 days, existing
    //    agent_tasks machinery; the follow-up cron / Tasks page surfaces it).
    if (outcome === 'revisit') {
      try {
        await supabase.from('agent_tasks').insert({
          task_type: 'd2d_revisit',
          task_description: `D2D revisit: ${address_note || constituency || 'address on visit'}${resolvedWorkerName ? ` (worker: ${resolvedWorkerName})` : ''}`,
          lead_id: leadId,
          lead_phone: personPhone,
          lead_name: person?.name || null,
          status: 'pending',
          scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(),
          metadata: { source: 'd2d_log', visit_id: visit.id, constituency: constituency || null, booth: booth || null },
          created_at: new Date().toISOString(),
        });
      } catch (e: any) {
        console.error('[d2d] revisit task insert failed:', e?.message);
      }
    }

    return NextResponse.json({ ok: true, visitId: visit.id, leadId });
  } catch (err: any) {
    console.error('[d2d] error:', err?.message);
    return NextResponse.json({ error: err?.message || 'error' }, { status: 500 });
  }
}
