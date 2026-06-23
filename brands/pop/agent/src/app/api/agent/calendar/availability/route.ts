/**
 * POST /api/agent/calendar/availability - Check available calendar slots
 *
 * Phase 3 of the Unified Agent Architecture.
 * Moved from web-agent/api/calendar/availability/route.ts.
 *
 * Request: { date: string, sessionType?: 'online' | 'offline' } (YYYY-MM-DD format)
 * Response: { date, slots: TimeSlot[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAvailableSlots } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { date, sessionType } = await request.json();

    if (!date) {
      return NextResponse.json(
        { error: 'Date is required' },
        { status: 400 },
      );
    }

    const slots = await getAvailableSlots(date, sessionType);

    return NextResponse.json({
      date,
      sessionType: sessionType === 'offline' ? 'offline' : 'online',
      slots,
      availability: Object.fromEntries(
        slots.map(s => [s.time24, s.available]),
      ),
    });
  } catch (error: any) {
    console.error('[agent/calendar/availability] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check availability' },
      { status: 500 },
    );
  }
}
