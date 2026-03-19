/**
 * Business Crawler - Lightweight background intel on leads
 * Checks if their website is live, has SSL, finds social links, page title.
 * Runs asynchronously after the 3rd message (first real engagement).
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface BusinessIntel {
  website_live: boolean;
  has_ssl: boolean;
  social_links: string[];
  page_title: string | null;
  crawled_at: string;
}

/**
 * Crawl a lead's business presence and store results in unified_context.business_intel.
 * Non-blocking - catches all errors internally.
 */
export async function crawlBusiness(leadId: string, supabase: SupabaseClient): Promise<void> {
  const { data: lead } = await supabase
    .from('all_leads')
    .select('id, unified_context, customer_name')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead) return;

  const ctx = lead.unified_context || {};

  // Already crawled? Skip
  if (ctx.business_intel?.crawled_at) return;

  let websiteUrl: string | null = ctx.website_url || null;
  const brandName: string | null = ctx.company || ctx.form_data?.brand_name || null;

  // If no website URL but we have a brand name, try common domains
  if (!websiteUrl && brandName) {
    const slug = brandName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const candidates = [
      `https://${slug}.com`,
      `https://www.${slug}.com`,
      `https://${slug}.in`,
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          websiteUrl = url;
          break;
        }
      } catch {
        // try next
      }
    }
  }

  if (!websiteUrl) {
    // Store minimal result so we don't retry
    await saveIntel(supabase, leadId, ctx, {
      website_live: false,
      has_ssl: false,
      social_links: [],
      page_title: null,
      crawled_at: new Date().toISOString(),
    });
    return;
  }

  // Normalize URL
  if (!websiteUrl.startsWith('http')) {
    websiteUrl = `https://${websiteUrl}`;
  }

  const intel: BusinessIntel = {
    website_live: false,
    has_ssl: websiteUrl.startsWith('https'),
    social_links: [],
    page_title: null,
    crawled_at: new Date().toISOString(),
  };

  try {
    const res = await fetch(websiteUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'PROXe-BusinessCrawler/1.0' },
    });

    intel.website_live = res.ok;
    intel.has_ssl = res.url.startsWith('https');

    if (res.ok) {
      const html = await res.text();
      // Limit to first 50KB to avoid memory issues
      const snippet = html.substring(0, 50000);

      // Extract page title
      const titleMatch = snippet.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        intel.page_title = titleMatch[1].trim().substring(0, 200);
      }

      // Extract social media links
      const socialPatterns = [
        /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?twitter\.com\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?x\.com\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>]+/gi,
      ];

      const socialLinks = new Set<string>();
      for (const pattern of socialPatterns) {
        const matches = snippet.match(pattern);
        if (matches) {
          for (const m of matches) {
            socialLinks.add(m.replace(/['">\s]+$/, ''));
          }
        }
      }
      intel.social_links = [...socialLinks].slice(0, 10);
    }
  } catch (err: any) {
    console.log(`[BusinessCrawler] Fetch failed for ${websiteUrl}: ${err?.message}`);
  }

  await saveIntel(supabase, leadId, ctx, intel, websiteUrl);
  console.log(`[BusinessCrawler] Crawled ${websiteUrl} for lead ${leadId}: live=${intel.website_live}, ssl=${intel.has_ssl}, socials=${intel.social_links.length}`);
}

async function saveIntel(
  supabase: SupabaseClient,
  leadId: string,
  existingCtx: Record<string, any>,
  intel: BusinessIntel,
  websiteUrl?: string | null
): Promise<void> {
  const updates: Record<string, any> = {
    ...existingCtx,
    business_intel: intel,
  };
  if (websiteUrl && !existingCtx.website_url) {
    updates.website_url = websiteUrl;
  }

  await supabase
    .from('all_leads')
    .update({ unified_context: updates })
    .eq('id', leadId);
}
