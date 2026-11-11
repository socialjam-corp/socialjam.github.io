// Shared helpers for the tools that read the Unity project. Written for Node 6, like build.js.
'use strict';

var fs = require('fs');
var path = require('path');

// The Unity project sits next to this repo (D:/Repos/Pimba); SKEEP_UNITY overrides it.
var UNITY = process.env.SKEEP_UNITY || path.resolve(__dirname, '../../../Pimba');

function unityPath() {
  return path.join.apply(path, [UNITY].concat([].slice.call(arguments)));
}

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

module.exports = { UNITY: UNITY, unityPath: unityPath, read: read };
