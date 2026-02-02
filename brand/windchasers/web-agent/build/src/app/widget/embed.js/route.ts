import { NextResponse } from 'next/server';

export async function GET() {
  const embedCode = `
(function() {
  if (document.getElementById('wc-chat-widget')) return;

  const iframe = document.createElement('iframe');
  iframe.id = 'wc-chat-widget';
  iframe.src = 'https://agent.windchasers.in/widget/bubble';
  iframe.style.cssText = `
    position: fixed;
    bottom: 0;
    right: 0;
    width: 450px;
    height: 700px;
    border: none;
    background: transparent;
    z-index: 999999;
    pointer-events: auto;
  `;
  iframe.setAttribute('allow', 'microphone; camera');
  iframe.setAttribute('allowfullscreen', '');

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