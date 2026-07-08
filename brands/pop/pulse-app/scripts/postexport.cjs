/* Runs after `expo export -p web`. Expo copies public/ to dist/ but does not
   wire up the PWA, so we inject the manifest link, theme-color, apple meta and
   service-worker registration into the generated dist/index.html. */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('postexport: dist/index.html not found - run `expo export -p web` first.');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

const headInject = `
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#0A0E15" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Pulse PB" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
`;

const swInject = `
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function () {});
        });
      }
    </script>
`;

if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', headInject + '  </head>');
}
if (!html.includes("serviceWorker.register")) {
  html = html.replace('</body>', swInject + '  </body>');
}

fs.writeFileSync(htmlPath, html);
console.log('postexport: PWA manifest + service worker wired into dist/index.html');
