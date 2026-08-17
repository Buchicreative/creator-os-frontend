const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.svg' : 'image/svg+xml',
  '.ico' : 'image/x-icon',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
};

http.createServer(function(req, res) {
  /* Serve static files (favicon etc) */
  var urlPath = req.url.split('?')[0];
  var ext     = path.extname(urlPath);

  if(ext && ext !== '.html' && MIME[ext]){
    var filePath = path.join(__dirname, urlPath);
    fs.readFile(filePath, function(err, data){
      if(err){ res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[ext] });
      res.end(data);
    });
    return;
  }

  /* Default: serve index.html */
  const file = path.join(__dirname, 'index.html');
  fs.readFile(file, function(err, data) {
    if(err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type'                        : 'text/html; charset=utf-8',
      'Cross-Origin-Opener-Policy'          : 'same-origin',
      'Cross-Origin-Embedder-Policy'        : 'require-corp',
      'X-Content-Type-Options'              : 'nosniff',
      'X-Frame-Options'                     : 'SAMEORIGIN',
      'Referrer-Policy'                     : 'strict-origin-when-cross-origin',
    });
    res.end(data);
  });
}).listen(PORT, function() {
  console.log('Creator OS frontend running on port ' + PORT);
});
