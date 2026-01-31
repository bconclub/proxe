import { NextResponse } from 'next/server';

export async function GET() {
  const embedCode = `
(function() {
  // Prevent duplicate injection
  if (document.getElementById('windchasers-chat-widget')) return;
  
  // Create button
  const button = document.createElement('button');
  button.id = 'windchasers-chat-button';
  button.innerHTML = '💬';
  button.title = 'Chat with Windchasers';
  button.onclick = toggleWindchasersWidget;
  Object.assign(button.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: '#FF6B35',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    zIndex: '10000',
    fontSize: '24px',
    transition: 'transform 0.2s'
  });
  
  button.onmouseover = () => button.style.transform = 'scale(1.1)';
  button.onmouseout = () => button.style.transform = 'scale(1)';
  
  // Create iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'windchasers-chat-widget';
  iframe.src = 'https://agent.windchasers.in/widget';
  iframe.allow = 'microphone; camera';
  iframe.title = 'Windchasers Chat Widget';
  Object.assign(iframe.style, {
    position: 'fixed',
    bottom: '90px',
    right: '20px',
    width: '400px',
    height: '600px',
    border: 'none',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    zIndex: '9999',
    display: 'none'
  });
  
  // Append to body
  document.body.appendChild(button);
  document.body.appendChild(iframe);
  
  // Toggle function
  function toggleWindchasersWidget() {
    const widget = document.getElementById('windchasers-chat-widget');
    const btn = document.getElementById('windchasers-chat-button');
    
    if (widget.style.display === 'none' || widget.style.display === '') {
      widget.style.display = 'block';
      btn.innerHTML = '✕';
      btn.style.background = '#333';
    } else {
      widget.style.display = 'none';
      btn.innerHTML = '💬';
      btn.style.background = '#FF6B35';
    }
  }
  
  // Mobile responsive
  const style = document.createElement('style');
  style.textContent = \`
    @media (max-width: 768px) {
      #windchasers-chat-widget {
        width: 100vw !important;
        height: 100vh !important;
        bottom: 0 !important;
        right: 0 !important;
        border-radius: 0 !important;
      }
      #windchasers-chat-button {
        bottom: 15px !important;
        right: 15px !important;
        width: 56px !important;
        height: 56px !important;
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