const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

http.createServer(function(req, res) {
  /* Always serve index.html for any route (single page app) */
  const file = path.join(__dirname, 'index.html');
  fs.readFile(file, function(err, data) {
    if(err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}).listen(PORT, function() {
  console.log('Creator OS frontend running on port ' + PORT);
});
