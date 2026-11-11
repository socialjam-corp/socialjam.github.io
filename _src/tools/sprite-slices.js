// Lists the slices of a Unity sprite sheet with top-left pixel rects, ready for sprites.js.
//
//   node _src/tools/sprite-slices.js <path to .png, relative to the Unity project>
//   node _src/tools/sprite-slices.js Assets/SkeepGames/Collapse/Media/Sprites/collapse_vehicle_sprites.png
//
// Unity stores rects from the bottom-left; this flips them. Prints name, internalID (what prefabs
// and icon databases reference as fileID) and [x, y, w, h].
'use strict';

var fs = require('fs');
var u = require('./unity.js');

var rel = process.argv[2];
if (!rel) {
  console.error('usage: node _src/tools/sprite-slices.js <png path in the Unity project>');
  process.exit(1);
}
var png = u.unityPath(rel);
var buf = fs.readFileSync(png);
var width = buf.readUInt32BE(16);
var height = buf.readUInt32BE(20);
console.log(rel + ' ' + width + 'x' + height);

var meta = u.read(png + '.meta');
var re = /- serializedVersion: 2\s+name: (\S+)\s+rect:\s+serializedVersion: 2\s+x: ([\d.]+)\s+y: ([\d.]+)\s+width: ([\d.]+)\s+height: ([\d.]+)[\s\S]*?internalID: (-?\d+)/g;
var m;
while ((m = re.exec(meta))) {
  var x = +m[2], y = +m[3], w = +m[4], h = +m[5];
  console.log(m[1] + '  id ' + m[6] + '  [' + [x, height - y - h, w, h].join(', ') + ']');
}
