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
  '.jpeg': 'image/jpeg',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
  '.xml' : 'application/xml',
  '.txt' : 'text/plain',
  '.webp': 'image/webp',
};

http.createServer(function(req, res) {
  /* Serve static files (favicon etc) */
  var urlPath = req.url.split('?')[0];
  var ext     = path.extname(urlPath);

  if(ext && ext !== '.html' && MIME[ext]){
    var filePath = path.join(__dirname, urlPath);
    fs.readFile(filePath, function(err, data){
      if(err){ res.writeHead(404); res.end('Not found'); return; }
      /* Cache static assets for 30 days */
      var cacheAge = 60 * 60 * 24 * 30; /* 30 days in seconds */
      res.writeHead(200, {
        'Content-Type'  : MIME[ext],
        'Cache-Control' : 'public, max-age=' + cacheAge + ', immutable',
        'Vary'          : 'Accept-Encoding',
      });
      res.end(data);
    });
    return;
  }

  /* Default: serve index.html */
  const file = path.join(__dirname, 'index.html');
  fs.readFile(file, function(err, data) {
    if(err) { res.writeHead(404); res.end('Not found'); return; }
    var headers = {
      'Content-Type'                        : 'text/html; charset=utf-8',
      'Cross-Origin-Opener-Policy'          : 'same-origin',
      'Cross-Origin-Embedder-Policy'        : 'require-corp',
      'X-Content-Type-Options'              : 'nosniff',
      'X-Frame-Options'                     : 'SAMEORIGIN',
      'Referrer-Policy'                     : 'strict-origin-when-cross-origin',
      'Vary'                                : 'Accept-Encoding',
    };
    var acceptEncoding = req.headers['accept-encoding'] || '';
    if(acceptEncoding.includes('br')){
      zlib.brotliCompress(data, function(err, compressed){
        if(err){ res.writeHead(200, headers); res.end(data); return; }
        res.writeHead(200, Object.assign({}, headers, { 'Content-Encoding': 'br' }));
        res.end(compressed);
      });
    } else if(acceptEncoding.includes('gzip')){
      zlib.gzip(data, function(err, compressed){
        if(err){ res.writeHead(200, headers); res.end(data); return; }
        res.writeHead(200, Object.assign({}, headers, { 'Content-Encoding': 'gzip' }));
        res.end(compressed);
      });
    } else {
      res.writeHead(200, headers);
      res.end(data);
    }
  });
}).listen(PORT, function() {
  console.log('Creator OS frontend running on port ' + PORT);
});
