import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Widget Embed Endpoint
 * Returns bundled JavaScript that initializes the ChatWidget
 * 
 * This endpoint serves the widget as a standalone script that can be embedded
 * on any website using: <script src="https://proxe.master.in/widget/embed.js"></script>
 */
export async function GET() {
  try {
    // Get the base URL for API calls
    const baseUrl = process.env.NEXT_PUBLIC_WEB_AGENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://proxe.master.in'
    const apiUrl = `${baseUrl}/api/chat`

    // Generate the widget initialization script
    // This script creates a container and loads the widget
    const widgetScript = `
(function() {
  'use strict';
  
  // Prevent multiple initializations
  if (window.MasterWidgetInitialized) {
    return;
  }
  window.MasterWidgetInitialized = true;

  // Widget configuration
  const config = {
    apiUrl: '${apiUrl}',
    brand: 'master',
    name: 'Master',
    colors: {
      primary: '#000000',
      primaryLight: '#FFFFFF',
      primaryDark: '#000000',
      primaryVibrant: '#666666',
    },
    chatStructure: {
      showQuickButtons: true,
      showFollowUpButtons: true,
      maxFollowUps: 3,
      avatar: {
        type: 'image',
        source: '${baseUrl}/star.svg',
      },
    },
    quickButtons: [
      'Get Started',
      'Book a Meeting',
      'Learn More'
    ],
    exploreButtons: [
      'Option 1',
      'Option 2',
      'Option 3',
      'Option 4'
    ],
  };

  // Create widget container
  function createWidgetContainer() {
    // Check if container already exists
    const existingContainer = document.getElementById('master-widget-container');
    if (existingContainer) {
      return existingContainer;
    }

    const container = document.createElement('div');
    container.id = 'master-widget-container';
    container.style.cssText = 'position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999; pointer-events: none;';
    document.body.appendChild(container);
    return container;
  }

  // Create iframe to load widget
  function initializeWidget() {
    const container = createWidgetContainer();
    
    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'master-widget-iframe';
    iframe.src = '${baseUrl}/widget';
    iframe.style.cssText = 'width: 100%; height: 100%; border: none; pointer-events: auto;';
    iframe.setAttribute('allow', 'microphone; camera');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals');
    
    container.appendChild(iframe);

    // Handle messages from iframe
    window.addEventListener('message', function(event) {
      // Verify origin for security
      if (event.origin !== '${baseUrl}') {
        return;
      }
      
      // Handle widget messages if needed
      if (event.data && event.data.type === 'master-widget') {
        // Process widget messages
        console.log('Widget message:', event.data);
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWidget);
  } else {
    initializeWidget();
  }

  // Export widget API for programmatic control
  window.MasterWidget = {
    open: function() {
      const container = document.getElementById('master-widget-container');
      if (container) {
        container.style.display = 'block';
      }
    },
    close: function() {
      const container = document.getElementById('master-widget-container');
      if (container) {
        container.style.display = 'none';
      }
    },
    toggle: function() {
      const container = document.getElementById('master-widget-container');
      if (container) {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
      }
    }
  };
})();
`.trim()

    // Return JavaScript with proper headers
    return new NextResponse(widgetScript, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    console.error('Error generating widget embed script:', error)
    const errorScript = `
console.error('Failed to initialize Master widget:', ${JSON.stringify(error instanceof Error ? error.message : 'Unknown error')});
`.trim()

    return new NextResponse(errorScript, {
      status: 500,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
