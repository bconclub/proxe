import { NextResponse } from 'next/server';

export async function GET() {
  const embedCode = `
(function() {
  if (document.getElementById('wc-chat-widget')) return;

  var iframe = document.createElement('iframe');
  iframe.id = 'wc-chat-widget';
  iframe.src = 'https://agent.windchasers.in/widget/bubble';
  iframe.setAttribute('allowtransparency', 'true');

  // Start with small iframe just for bubble button (77px + padding)
  // Expands when chat opens via postMessage
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:125px;height:125px;border:none;background:transparent;z-index:2147483647;';

  // Listen for messages from widget to resize iframe
  window.addEventListener('message', function(e) {
    if (e.data === 'wc-chat-open') {
      // Expand for chat modal
      if (window.innerWidth <= 768) {
        // Mobile: fullscreen
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
      } else {
        // Desktop: sized for chatbox + bubble
        iframe.style.width = '450px';
        iframe.style.height = '700px';
      }
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
      'Access-Control-Allow-Origin': '*'
    }
  });
}