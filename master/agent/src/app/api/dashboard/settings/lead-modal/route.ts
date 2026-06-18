import { NextRequest, NextResponse } from 'next/server';
import { getLeadModalConfig, saveLeadModalConfig, LEAD_MODAL_TABS, type LeadModalConfig } from '@/lib/leadModalConfig';

export const dynamic = 'force-dynamic';

/** GET → the lead-modal config (tab visibility) + the catalog of tabs for the editor. */
export async function GET() {
  const cfg = (await getLeadModalConfig()) || {};
  return NextResponse.json({
    tabs: cfg.tabs || {},
    catalog: LEAD_MODAL_TABS,
    updatedAt: cfg.updatedAt ?? null,
  });
}

/** PUT → save tab visibility. Body: { tabs: { summary: true, breakdown: false, ... } } */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const tabs = (body && typeof body.tabs === 'object') ? body.tabs : {};
    const cfg: LeadModalConfig = { tabs };
    const ok = await saveLeadModalConfig(cfg);
    if (!ok) return NextResponse.json({ error: 'Failed to save (no service client?)' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Bad request' }, { status: 400 });
  }
}
