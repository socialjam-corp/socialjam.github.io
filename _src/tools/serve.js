// Serves the site locally for testing, as GitHub Pages would (minus its caching):
//
//   node _src/tools/serve.js [port]          default 8731 → http://localhost:8731/ca/play
//
// ES modules need a real server: they do not load from file://.
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var root = path.resolve(__dirname, '../..');
var port = +process.argv[2] || 8731;
var TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain'
};

http.createServer(function (req, res) {
  var file = path.join(root, decodeURIComponent(url.parse(req.url).pathname));
  if (file.indexOf(root) !== 0) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  // GitHub Pages serves /ca/play.html for /ca/play.
  else if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, function () {
  console.log('site on http://localhost:' + port + '/ca/play');
});
