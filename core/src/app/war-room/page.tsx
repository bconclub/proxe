import { redirect } from 'next/navigation';
import { brandConfig } from '@/configs';
import WarRoomClient from './WarRoomClient';

// READ-ONLY war-room view, now rendered inside the dashboard shell (sidebar +
// artifact switcher) via app/war-room/layout.tsx. Auth lives in the layout; the
// page keeps the feature gate + an isolated error fallback so a war-room failure
// can't take PROXe core down.
export const dynamic = 'force-dynamic';

export default async function WarRoomPage() {
  try {
    // Feature-gated: needs the vw_war_room_* views in the brand's Supabase.
    if (!brandConfig.features?.warRoom) redirect('/dashboard');
    return <WarRoomClient />;
  } catch (e) {
    if ((e as any)?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    return (
      <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <p>War room failed to load. The rest of PROXe is unaffected. {(e as Error)?.message}</p>
      </div>
    );
  }
}
