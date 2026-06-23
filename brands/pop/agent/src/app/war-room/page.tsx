import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import WarRoomClient from './WarRoomClient';

// ISOLATED, READ-ONLY war-room view. Separate route tree from /dashboard so a
// failure here cannot affect PROXe core. Guarded behind the existing auth.
export const dynamic = 'force-dynamic';

export default async function WarRoomPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) redirect('/auth/login');
    return <WarRoomClient />;
  } catch (e) {
    if ((e as any)?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#06182E', color: '#EAF1FB' }}>
        <p>War room failed to load. The rest of PROXe is unaffected. {(e as Error)?.message}</p>
      </div>
    );
  }
}
