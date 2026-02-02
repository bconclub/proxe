import { NextResponse } from 'next/server';

export async function GET() {
  const embedCode = `
(function() {
  // Prevent duplicate injection
  if (document.getElementById('windchasers-bubble-iframe')) return;
  
  // Create iframe container
  const iframe = document.createElement('iframe');
  iframe.id = 'windchasers-bubble-iframe';
  iframe.src = 'https://agent.windchasers.in/widget/bubble';
  
  // Style the iframe
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:400px;height:100vh;border:none;background:transparent;pointer-events:none;z-index:999999;';
  
  // Allow pointer events for interactive elements
  iframe.style.pointerEvents = 'auto';
  
  // Add allowlist for iframe permissions
  iframe.setAttribute('allow', 'microphone; camera; geolocation');
  iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-forms allow-modals');
  
  // Append to body
  document.body.appendChild(iframe);
  
  // Mobile responsive styles
  const style = document.createElement('style');
  style.textContent = \`
    @media (max-width: 768px) {
      #windchasers-bubble-iframe {
        width: 100% !important;
        height: 100vh !important;
        bottom: 0 !important;
        right: 0 !important;
      }
    }
  \`;
  document.head.appendChild(style);
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