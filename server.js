const http = require('http');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

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
  '.json': 'application/json',
};

/* PWA files that need special cache headers */
const NO_CACHE_FILES = ['/sw.js', '/manifest.json'];

http.createServer(function(req, res) {
  /* Serve static files (favicon etc) */
  var urlPath = req.url.split('?')[0];
  var ext     = path.extname(urlPath);

  if(ext && ext !== '.html' && MIME[ext]){
    var filePath = path.resolve(__dirname, '.' + urlPath);

    /* path.join happily resolves ../ so /blog/../server.js served the
       source. Two guards: the resolved path must stay inside this
       directory, and server side files are never public whatever the
       path looks like. */
    var inside = filePath === __dirname || filePath.startsWith(__dirname + path.sep);
    var base   = path.basename(filePath).toLowerCase();
    var BLOCKED = ['server.js', 'package.json', 'package-lock.json', 'railway.json'];

    if(!inside || BLOCKED.indexOf(base) !== -1 || base.charAt(0) === '.'){
      res.writeHead(404); res.end('Not found'); return;
    }

    fs.readFile(filePath, function(err, data){
      if(err){ res.writeHead(404); res.end('Not found'); return; }
      /* Service worker and manifest must not be cached by browser */
      var isNoCacheFile = NO_CACHE_FILES.indexOf(urlPath) !== -1;
      var cacheAge = isNoCacheFile ? 0 : 60 * 60 * 24 * 30;
      var cacheControl = isNoCacheFile
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=' + cacheAge + ', immutable';
      res.writeHead(200, {
        'Content-Type'  : MIME[ext],
        'Cache-Control' : cacheControl,
        'Vary'          : 'Accept-Encoding',
      });
      res.end(data);
    });
    return;
  }

  /* Real pages at real URLs.
     These were previously popups on the homepage, so search engines
     could not index them and API reviewers had no page to open. */
  var LEGAL = {
    '/privacy'   : 'privacy.html',
    '/terms'     : 'terms.html',
    '/about'     : 'about.html',
    '/changelog' : 'changelog.html',
    '/blog'      : 'blog.html',
  };

  /* Blog posts. The slug is whitelisted by checking the file exists,
     and stripped of anything but a-z, 0-9 and dashes, so a crafted URL
     cannot walk out of the blog directory. */
  var blogMatch = urlPath.replace(/\/$/, '').match(/^\/blog\/([a-z0-9-]+)$/);
  if(blogMatch){
    var postFile = path.join(__dirname, 'blog', blogMatch[1] + '.html');
    fs.readFile(postFile, function(err, data){
      if(err){
        /* unknown slug falls through to the blog index rather than a dead end */
        fs.readFile(path.join(__dirname, 'blog.html'), function(e2, idx){
          if(e2){ res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(idx);
        });
        return;
      }
      res.writeHead(200, {
        'Content-Type'           : 'text/html; charset=utf-8',
        'X-Content-Type-Options' : 'nosniff',
        'Referrer-Policy'        : 'strict-origin-when-cross-origin',
        'Cache-Control'          : 'public, max-age=3600',
      });
      res.end(data);
    });
    return;
  }
  var legalKey = urlPath.replace(/\/$/, '') || '/';
  if(LEGAL[legalKey]){
    fs.readFile(path.join(__dirname, LEGAL[legalKey]), function(err, data){
      if(err){ res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type'           : 'text/html; charset=utf-8',
        'X-Content-Type-Options' : 'nosniff',
        'Referrer-Policy'        : 'strict-origin-when-cross-origin',
        'Cache-Control'          : 'public, max-age=3600',
      });
      res.end(data);
    });
    return;
  }

  /* Admin panel route */
  if(urlPath === '/crevers-admin-control' || urlPath === '/crevers-admin-control/'){
    const adminFile = path.join(__dirname, 'admin.html');
    fs.readFile(adminFile, function(err, data){
      if(err){ res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
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
      /* credentialless keeps SharedArrayBuffer available (ffmpeg.wasm threads)
         while allowing cross-origin resources that do not send CORP headers.
         require-corp blocked CDN scripts outright. */
      'Cross-Origin-Embedder-Policy'        : 'credentialless',
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
