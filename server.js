const http = require('http');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 8080;


/* ══════════════════════════════════════════════════════════
   DATABASE BACKED BLOG

   Posts written in the admin live in Supabase. They are rendered here,
   server side, and returned as finished HTML. Fetching them in the
   browser instead would mean Google sees an empty page, which defeats
   the point of having a blog.

   Node 18 has fetch built in, so this needs no dependency. It reads
   with the publishable key and RLS only exposes published rows, so
   drafts stay private.
   ══════════════════════════════════════════════════════════ */
const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

/* short cache so a burst of traffic does not hammer the database */
const postCache = new Map();
const CACHE_MS  = 5 * 60 * 1000;

async function sbGet(query){
  if(!SB_URL || !SB_KEY) return null;
  try {
    const r = await fetch(SB_URL + '/rest/v1/blog_posts?' + query, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
    });
    if(!r.ok) return null;
    return await r.json();
  } catch(e){
    console.error('[Blog] Supabase fetch failed:', e.message);
    return null;
  }
}

function cacheGet(k){
  const hit = postCache.get(k);
  if(!hit || hit.until < Date.now()){ postCache.delete(k); return null; }
  return hit.value;
}
function cacheSet(k, v){
  if(postCache.size > 200) postCache.clear();
  postCache.set(k, { value: v, until: Date.now() + CACHE_MS });
}

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

/* Minimal markdown. Deliberately small: headings, bold, italic, links,
   lists, quotes and paragraphs. Everything is escaped first, so a post
   cannot inject script. */
function mdToHtml(md){
  let t = esc(md).replace(/\r\n/g, '\n');

  t = t.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  t = t.replace(/^## (.*)$/gm,  '<h2>$1</h2>');
  t = t.replace(/^# (.*)$/gm,   '<h2>$1</h2>');
  t = t.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
                '<a href="$2">$1</a>');

  const lines = t.split('\n');
  const out = [];
  let inList = false;
  for(const line of lines){
    const li = line.match(/^[-*] (.*)$/);
    if(li){
      if(!inList){ out.push('<ul>'); inList = true; }
      out.push('<li>' + li[1] + '</li>');
      continue;
    }
    if(inList){ out.push('</ul>'); inList = false; }

    const trimmed = line.trim();
    if(!trimmed){ continue; }
    if(/^<(h2|h3|blockquote|ul|li)/.test(trimmed)){ out.push(trimmed); continue; }
    out.push('<p>' + trimmed + '</p>');
  }
  if(inList) out.push('</ul>');
  return out.join('\n');
}

function renderPost(post){
  const url = 'https://crevers.com/blog/' + post.slug;
  const date = (post.published_at || post.updated_at || '').slice(0, 10);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(post.title)} — Crevers</title>
<meta name="description" content="${esc(post.excerpt || '')}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${esc(post.title)}">
<meta property="og:description" content="${esc(post.excerpt || '')}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500&display=swap" rel="stylesheet">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BlogPosting",
"headline":${JSON.stringify(post.title)},
"description":${JSON.stringify(post.excerpt || '')},
"datePublished":"${date}","dateModified":"${(post.updated_at||'').slice(0,10)}",
"url":"${url}",
"author":{"@type":"Organization","name":"Crevers","url":"https://crevers.com"},
"publisher":{"@type":"Organization","name":"Crevers","logo":{"@type":"ImageObject","url":"https://crevers.com/logo.svg"}},
"mainEntityOfPage":{"@type":"WebPage","@id":"${url}"}}
</script>
<link rel="stylesheet" href="/blog.css">
</head>
<body>
<div class="wrap">
<a class="back" href="/blog">&larr; All articles</a>
<div class="meta">${esc(post.read_time || '')}${post.read_time ? ' &middot; ' : ''}Updated ${date}</div>
<h1>${esc(post.title)}</h1>
${post.excerpt ? '<p class="lede">' + esc(post.excerpt) + '</p>' : ''}
${mdToHtml(post.body)}
<div class="cta">
  <h3>Stop starting from nothing</h3>
  <p>Crevers writes the ideas, scripts and captions for the platform you are posting to. Free plan, no card needed.</p>
  <a class="btn" href="/">Try it free</a>
</div>
<footer>
  <p><a href="/">Crevers</a> &middot; <a href="/blog">Blog</a> &middot; <a href="/about">About</a> &middot; <a href="/privacy">Privacy</a></p>
</footer>
</div>
</body>
</html>`;
}

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
    var slug = blogMatch[1];

    function sendPost(html){
      res.writeHead(200, {
        'Content-Type'           : 'text/html; charset=utf-8',
        'X-Content-Type-Options' : 'nosniff',
        'Referrer-Policy'        : 'strict-origin-when-cross-origin',
        'Cache-Control'          : 'public, max-age=600',
      });
      res.end(html);
    }

    /* The four original posts still exist as files. If a slug is not in
       the database we fall back to them, so nothing had to be migrated. */
    function serveStatic(){
      fs.readFile(path.join(__dirname, 'blog', slug + '.html'), function(err, data){
        if(err){
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
    }

    /* Database posts are rendered server side so Google receives real
       HTML rather than an empty shell. */
    (async function(){
      var cached = cacheGet('post:' + slug);
      if(cached){ sendPost(cached); return; }
      var rows = await sbGet('slug=eq.' + encodeURIComponent(slug) +
                             '&published=eq.true&select=*&limit=1');
      if(rows && rows.length){
        var html = renderPost(rows[0]);
        cacheSet('post:' + slug, html);
        sendPost(html);
        return;
      }
      serveStatic();
    })();
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
