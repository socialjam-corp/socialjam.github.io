// Prints the meshes of a binary FBX from the Unity project (vertices, polygons, models, links),
// e.g. to rebuild a game's 3D pieces on the canvas. Units are the file's (usually cm); Unity
// flips x on import. Written for Node 6.
//
//   node _src/tools/fbx.js <fbx path in the Unity project>
'use strict';
var u = require('./unity.js');
var fs = require('fs'), zlib = require('zlib');
var buf = fs.readFileSync(u.unityPath(process.argv[2]));
var version = buf.readUInt32LE(23);
var big = version >= 7500;
function readNode(off) {
  var end = big ? buf.readUInt32LE(off) + buf.readUInt32LE(off + 4) * 4294967296 : buf.readUInt32LE(off);
  var numProps = big ? buf.readUInt32LE(off + 8) : buf.readUInt32LE(off + 4);
  var hdr = big ? 24 : 12;
  var nameLen = buf[off + hdr];
  if (end === 0) return null;
  var name = buf.toString('ascii', off + hdr + 1, off + hdr + 1 + nameLen);
  var p = off + hdr + 1 + nameLen, props = [];
  for (var i = 0; i < numProps; i++) {
    var t = String.fromCharCode(buf[p]); p++;
    if (t === 'Y') { props.push(buf.readInt16LE(p)); p += 2; }
    else if (t === 'C') { props.push(buf[p]); p += 1; }
    else if (t === 'I') { props.push(buf.readInt32LE(p)); p += 4; }
    else if (t === 'F') { props.push(buf.readFloatLE(p)); p += 4; }
    else if (t === 'D') { props.push(buf.readDoubleLE(p)); p += 8; }
    else if (t === 'L') { props.push(buf.readInt32LE(p) + buf.readInt32LE(p + 4) * 4294967296); p += 8; }
    else if (t === 'S' || t === 'R') { var l = buf.readUInt32LE(p); props.push(t === 'S' ? buf.toString('utf8', p + 4, p + 4 + l) : '<raw>'); p += 4 + l; }
    else if ('fdlib'.indexOf(t) >= 0) {
      var len = buf.readUInt32LE(p), enc = buf.readUInt32LE(p + 4), clen = buf.readUInt32LE(p + 8); p += 12;
      var data = buf.slice(p, p + clen); p += clen;
      if (enc === 1) data = zlib.inflateSync(data);
      var size = { f: 4, d: 8, l: 8, i: 4, b: 1 }[t], arr = [];
      for (var k = 0; k < len; k++) arr.push(t === 'f' ? data.readFloatLE(k * 4) : t === 'd' ? data.readDoubleLE(k * 8) : t === 'i' ? data.readInt32LE(k * 4) : t === 'l' ? data.readInt32LE(k * 8) : data[k]);
      props.push(arr);
    } else throw new Error('type ' + t + ' at ' + p);
  }
  var children = [];
  while (p < end - (big ? 25 : 13)) { var c = readNode(p); if (!c) break; children.push(c); p = c.end; }
  return { name: name, props: props, children: children, end: end };
}
var off = 27, nodes = [];
while (off < buf.length) { var n = readNode(off); if (!n) break; nodes.push(n); off = n.end; }
var objects = nodes.filter(function (n) { return n.name === 'Objects'; })[0];
objects.children.forEach(function (o) {
  if (o.name === 'Geometry') {
    var v = o.children.filter(function (c) { return c.name === 'Vertices'; })[0].props[0];
    var idx = o.children.filter(function (c) { return c.name === 'PolygonVertexIndex'; })[0].props[0];
    var pts = []; for (var i = 0; i < v.length; i += 3) pts.push([+v[i].toFixed(4), +v[i + 1].toFixed(4), +v[i + 2].toFixed(4)]);
    var polys = [], cur = []; idx.forEach(function (x) { if (x < 0) { cur.push(-x - 1); polys.push(cur); cur = []; } else cur.push(x); });
    console.log(JSON.stringify({ geometry: o.props[1], id: o.props[0], verts: pts, polys: polys }));
  }
  if (o.name === 'Model') {
    var p70 = o.children.filter(function (c) { return c.name === 'Properties70'; })[0];
    var tf = (p70 ? p70.children : []).filter(function (c) { return /Lcl/.test(c.props[0]); }).map(function (c) { return c.props[0] + '=' + c.props.slice(4).join(','); });
    console.log('MODEL', o.props[1], o.props[0], tf.join(' '));
  }
});
var conns = nodes.filter(function (n) { return n.name === 'Connections'; })[0];
console.log('CONN', JSON.stringify(conns.children.map(function (c) { return c.props.slice(1, 3); })));
