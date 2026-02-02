import { NextResponse } from 'next/server';

export async function GET() {
  const embedCode = `
(function() {
  if (document.getElementById('wc-chat-widget')) return;

  var iframe = document.createElement('iframe');
  iframe.id = 'wc-chat-widget';
  iframe.src = 'https://agent.windchasers.in/widget/bubble';
  iframe.setAttribute('allowtransparency', 'true');

  // Fixed size iframe - pointer-events handled inside the iframe
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:450px;height:700px;border:none;background:transparent;z-index:999999;pointer-events:none;';

  // Listen for messages from iframe to enable/disable pointer events
  window.addEventListener('message', function(e) {
    if (e.data === 'wc-chat-open') {
      iframe.style.pointerEvents = 'auto';
    } else if (e.data === 'wc-chat-close') {
      iframe.style.pointerEvents = 'none';
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