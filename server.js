const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

http.createServer(function(req, res) {
  const file = path.join(__dirname, 'index.html');
  fs.readFile(file, function(err, data) {
    if(err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type'                        : 'text/html; charset=utf-8',
      /* Required for FFmpeg.wasm SharedArrayBuffer support */
      'Cross-Origin-Opener-Policy'          : 'same-origin',
      'Cross-Origin-Embedder-Policy'        : 'require-corp',
      /* Security headers */
      'X-Content-Type-Options'              : 'nosniff',
      'X-Frame-Options'                     : 'SAMEORIGIN',
      'Referrer-Policy'                     : 'strict-origin-when-cross-origin',
    });
    res.end(data);
  });
}).listen(PORT, function() {
  console.log('Creator OS frontend running on port ' + PORT);
});
