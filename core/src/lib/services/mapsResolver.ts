/**
 * services/mapsResolver.ts - turn a shared Google Maps link into a real place.
 *
 * A shared link (especially the maps.app.goo.gl short form) is opaque: the agent
 * saw only a URL, so it could not say "got it, ITPL back gate" and kept asking
 * where the property was even after the owner had sent the pin. We follow the
 * redirect and pull the place name + coordinates out of the resolved URL.
 *
 * Best-effort and non-fatal: callers keep the raw URL regardless.
 */

export interface ResolvedMapsLink {
  name?: string;
  coords?: string;
  resolvedUrl?: string;
}


/**
 * A resolved "name" is only useful if it names a PLACE. Google hands back junk
 * for un-geocoded or consent-gated links - the page title ("Google Search",
 * "Sign in"), or the coordinate pair itself. Storing those would put nonsense
 * into the agent's KNOWN DETAILS (and into property_zone), which is worse than
 * storing nothing.
 */
function isUsablePlaceName(s?: string | null): boolean {
  const t = String(s || '').trim();
  if (!t || t.length < 3 || t.length > 160) return false;
  if (t.startsWith('@')) return false;
  if (/^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(t)) return false; // bare coordinates
  if (/^(google|google maps|google search|maps|sign in|untitled|consent)$/i.test(t)) return false;
  return true;
}

export async function resolveMapsLink(mapsUrl: string): Promise<ResolvedMapsLink> {
  try {
    const res = await fetch(mapsUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PROXe/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    const finalUrl = res.url || mapsUrl;
    const out: ResolvedMapsLink = { resolvedUrl: finalUrl };

    // /maps/place/<Place+Name>/@lat,lng
    const place = finalUrl.match(/\/maps\/place\/([^/@?]+)/);
    if (place?.[1]) {
      const decoded = decodeURIComponent(place[1]).replace(/\+/g, ' ').trim();
      if (isUsablePlaceName(decoded)) out.name = decoded;
    }

    // Coordinates: @lat,lng | !3d<lat>!4d<lng> | ?q=lat,lng
    const at = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
      || finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
      || finalUrl.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (at) out.coords = `${at[1]},${at[2]}`;

    // Fall back to the page title when the URL carries no place segment.
    if (!out.name) {
      const html = await res.text().catch(() => '');
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
        || html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
      if (title) {
        const t = title.replace(/\s*[-–|]\s*Google\s*Maps.*$/i, '').trim();
        if (isUsablePlaceName(t)) out.name = t;
      }
    }
    return out;
  } catch {
    return {};
  }
}
