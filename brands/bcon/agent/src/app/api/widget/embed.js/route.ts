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
export async function GET() {
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

  // Scroll-triggered reveal: hidden on load, revealed after first scroll
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:125px;height:125px;border:none;background:transparent;z-index:2147483647;opacity:0;transform:translateY(20px);transition:opacity 0.4s ease,transform 0.4s ease;';

  // Add pulse ring animation styles
  var style = document.createElement('style');
  style.textContent = 
    '@keyframes pulseRing{' +
      '0%{transform:scale(1);opacity:1}' +
      '100%{transform:scale(1.4);opacity:0}' +
    '}' +
    '.wc-pulse-ring{' +
      'position:absolute;' +
      'inset:-8px;' +
      'border:2px solid #8B5CF6;' +
      'border-radius:50%;' +
      'animation:pulseRing 1.5s ease-out;' +
      'pointer-events:none;' +
      'z-index:-1;' +
    '}';
  document.head.appendChild(style);

  var revealed = false;
  var pulseCount = 0;
  var maxPulses = 3;

  function showWidget() {
    if (revealed) return;
    revealed = true;
    iframe.style.opacity = '1';
    iframe.style.transform = 'translateY(0)';
    
    // Add pulse ring effect
    function addPulse() {
      if (pulseCount >= maxPulses) return;
      pulseCount++;
      var ring = document.createElement('div');
      ring.className = 'wc-pulse-ring';
      iframe.parentNode.insertBefore(ring, iframe);
      setTimeout(function() { ring.remove(); }, 1500);
      if (pulseCount < maxPulses) {
        setTimeout(addPulse, 500);
      }
    }
    setTimeout(addPulse, 400);
  }

  // Listen for first scroll event
  window.addEventListener('scroll', showWidget, { passive: true, once: true });
  
  // Fallback: show after 5 seconds if no scroll
  setTimeout(showWidget, 5000);

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
      iframe.style.width = '125px';
      iframe.style.height = '125px';
    }
  });

  document.body.appendChild(iframe);
})();
  `;

  return new NextResponse(embedCode, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
