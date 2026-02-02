import { NextResponse } from 'next/server';

export async function GET() {
  const embedCode = `
(function() {
  if (document.getElementById('wc-chat-widget')) return;

  var iframe = document.createElement('iframe');
  iframe.id = 'wc-chat-widget';
  iframe.src = 'https://agent.windchasers.in/widget/bubble';
  iframe.setAttribute('allowtransparency', 'true');

  // Responsive sizing - full screen on mobile, fixed size on desktop
  function updateSize() {
    var isMobile = window.innerWidth <= 768;
    if (isMobile) {
      iframe.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border:none;background:transparent;z-index:999999;';
    } else {
      iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:450px;height:650px;border:none;background:transparent;z-index:999999;';
    }
  }

  updateSize();
  window.addEventListener('resize', updateSize);
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