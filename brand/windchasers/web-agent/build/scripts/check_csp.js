const http = require('http');
const options = {
  hostname: 'localhost',
  port: 4003,
  path: '/widget',
  method: 'HEAD'
};

const req = http.request(options, res => {
  console.log('StatusCode:', res.statusCode);
  console.log('Content-Security-Policy:', res.headers['content-security-policy'] || '<none>');
  process.exit(0);
});
req.on('error', error => {
  console.error('Request error:', error.message);
  process.exit(2);
});
req.end();
