// Exports app sprites for the web: crops and scales them in Chrome and saves the result here.
//
//   node _src/tools/sprites.js <outDir> [port]          serves the Unity project, default port 8736
//
// Open http://localhost:<port>/ in the test browser window and run, in the page:
//   await exportSprites([
//     { src: 'Assets/Skeep/Media/Sprites/Icons/skeep_icons.png', crop: [418, 4, 66, 66],
//       w: 66, h: 66, name: 'howto.png' },
//     { src: '...', w: 480, h: 480, name: 'victory.webp', type: 'image/webp', q: 0.9 },
//   ])
// crop is a top-left rect (sprite-slices.js prints them); without it the whole image is used.
// Files land in <outDir>. The page and the images come from this one server: loading the sprites
// from another origin, or returning the data through the browser tool, does not work.
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');
var u = require('./unity.js');

var outDir = process.argv[2];
var port = +process.argv[3] || 8736;
if (!outDir) {
  console.error('usage: node _src/tools/sprites.js <outDir> [port]');
  process.exit(1);
}
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

var PAGE = [
  '<!doctype html><meta charset="utf-8"><title>sprites</title>',
  '<body style="background:#2d2a2b;color:#e2e3e4;font:14px sans-serif">sprite exporter: call exportSprites([...])',
  '<script>',
  'function load(src) { return new Promise(function (ok, fail) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = fail; i.src = "/" + src; }); }',
  'window.exportSprites = async function (specs) {',
  '  var files = {};',
  '  for (var s of specs) {',
  '    var img = await load(s.src), c = s.crop || [0, 0, img.width, img.height];',
  '    var cv = document.createElement("canvas"); cv.width = s.w; cv.height = s.h;',
  '    var g = cv.getContext("2d"); g.imageSmoothingQuality = "high";',
  '    g.drawImage(img, c[0], c[1], c[2], c[3], 0, 0, s.w, s.h);',
  '    files[s.name] = cv.toDataURL(s.type || "image/png", s.q);',
  '  }',
  '  return (await fetch("/save", { method: "POST", body: JSON.stringify(files) })).text();',
  '};',
  '</script>'
].join('\n');

http.createServer(function (req, res) {
  if (req.method === 'POST') {
    var body = '';
    req.on('data', function (chunk) { body += chunk; });
    req.on('end', function () {
      var files = JSON.parse(body);
      var saved = Object.keys(files).map(function (name) {
        var file = path.join(outDir, path.basename(name));
        fs.writeFileSync(file, new Buffer(files[name].split(',')[1], 'base64'));
        return path.basename(name) + ' ' + fs.statSync(file).size + ' B';
      });
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('saved ' + saved.join(', '));
    });
    return;
  }
  var p = decodeURIComponent(url.parse(req.url).pathname);
  if (p === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(PAGE);
  }
  var file = u.unityPath(p);
  if (file.indexOf(u.UNITY) !== 0 || !/\.png$/i.test(file)) {
    res.writeHead(404);
    return res.end();
  }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(data);
  });
}).listen(port, function () {
  console.log('sprite exporter on http://localhost:' + port + '/ (saving to ' + path.resolve(outDir) + ')');
});
