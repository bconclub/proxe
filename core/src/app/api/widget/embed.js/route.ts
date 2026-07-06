import { getBrandConfig, getCurrentBrandId } from '@/configs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Widget Embed Endpoint
 * Returns JavaScript that creates an iframe pointing to /widget/bubble
 *
 * Phase 4 of the Unified Agent Architecture.
 * Rewritten from the old iframe-to-external-web-agent approach.
 * Now uses same-origin: the widget is served from this dashboard app.
 *
 * Usage: <script src="https://your-domain.com/api/widget/embed.js"></script>
 */
// Kill switch history: disabled globally 2026-07-06 after the widget
// rendered broken/cut-off live. First fix (91e3e89c, an open/resize race)
// did NOT resolve it. Real root cause: our collapsed iframe was too short
// for lokazen's button offset (fixed in 0687451b, collapsedHeight -> 165px)
// -- confirmed working on windchasers.in. STILL broken on lokazen.in/scout
// specifically because that site's own HTML has a hardcoded inline
// <style>#wc-chat-widget{width:125px!important;height:125px!important;}</style>
// baked in from before our sizing fixes -- it overrides ANY size our script
// sets, no matter what we ship here. That's on lokazen.in's own page code,
// not this repo; we can't patch it from here. Disabling lokazen ONLY (not
// the other 4 brands, which are unaffected) until whoever maintains
// lokazen.in removes/updates that rule.
const DISABLED_BRANDS = ['lokazen'];

export async function GET() {
  if (DISABLED_BRANDS.includes(getCurrentBrandId())) {
    return new NextResponse('// Chat widget temporarily disabled for this brand', {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const embedCode = `
(function() {
  if (document.getElementById('wc-chat-widget')) return;

  var iframe = document.createElement('iframe');
  iframe.id = 'wc-chat-widget';
  // Resolve base URL from the script's own src so it works on external sites
  var scriptEl = document.currentScript || document.querySelector('script[src*="embed.js"]');
  var scriptSrc = scriptEl ? scriptEl.src : '';
  var baseUrl = scriptSrc ? scriptSrc.replace(/\\/api\\/widget\\/embed\\.js.*$/, '') : (window.location.protocol + '//' + window.location.host);
  iframe.src = baseUrl + '/widget/bubble';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('allow', 'microphone; camera; autoplay; clipboard-write');
  iframe.setAttribute('allowusermedia', '');

  // Widget shows immediately on page load. Collapsed WIDTH is sized to the
  // bubble button itself (48-56px) plus offset + shadow bleed, not a fixed
  // 125px — a bigger box than the button left a dead margin that read as a
  // stray dark box behind the circle on brands without a solid page bg.
  // Collapsed HEIGHT has to stay generous: lokazen's button sits at
  // bottom:96px (clears the site's own mobile footer nav) + 56px tall, so a
  // short box (previously 100px) clipped almost the entire button, leaving
  // only a sliver visible -- the actual "black box" bug, not a resize race.
  // 165px covers every brand's offset with room to spare; harmless since the
  // extra space is transparent.
  var isMobileInit = window.innerWidth <= 768;
  var collapsedWidth = isMobileInit ? 88 : 100;
  var collapsedHeight = 165;
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:' + collapsedWidth + 'px;height:' + collapsedHeight + 'px;border:none;background:transparent;z-index:2147483647;';

  // Check for pre-loaded lead context from host page
  var leadContext = window.__proxe_lead || null;
  
  // Also check URL params for lead context (fallback)
  if (!leadContext) {
    var urlParams = new URLSearchParams(window.location.search);
    var leadId = urlParams.get('leadId') || urlParams.get('lead_id');
    var name = urlParams.get('name');
    var service = urlParams.get('service') || urlParams.get('solution');
    var brand = urlParams.get('brand');
    if (leadId || name) {
      leadContext = {
        lead_id: leadId,
        name: name,
        service: service,
        brand: brand || getCurrentBrandId()
      };
    }
  }

  // Listen for messages from widget to resize iframe
  window.addEventListener('message', function(e) {
    if (e.data === 'wc-chat-open') {
      // Expand for chat modal
      var isMobile = window.innerWidth <= 768;
      if (isMobile) {
        // Mobile: fullscreen
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
      } else {
        // Desktop: chat modal size
        iframe.style.width = '450px';
        iframe.style.height = '760px';
      }
      // Tell widget whether parent is mobile
      iframe.contentWindow.postMessage({ type: 'wc-viewport', isMobile: isMobile }, '*');
    } else if (e.data === 'wc-chat-close') {
      // Shrink back to bubble size
      iframe.style.top = 'auto';
      iframe.style.left = 'auto';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = (window.innerWidth <= 768 ? 88 : 100) + 'px';
      iframe.style.height = '165px';
    }
  });

  document.body.appendChild(iframe);

  // Pass lead context to widget when it's ready
  if (leadContext) {
    // Wait for iframe to load, then send lead context
    var sendLeadContext = function() {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'proxe_lead_context',
          lead: leadContext
        }, '*');
      }
    };
    
    // Send lead context to widget
    sendLeadContext();
  }
})();
  `;

  return new NextResponse(embedCode, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
