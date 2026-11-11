// Sets the play page's temporary password: stores its SHA-256 in src/play/gate.js.
//
//   node _src/tools/play-password.js <password>
//
// Browsers that unlocked the old password are asked for the new one. Written for Node 6.
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var password = process.argv[2];
if (!password) {
  console.error('usage: node _src/tools/play-password.js <password>');
  process.exit(1);
}
var file = path.resolve(__dirname, '../../src/play/gate.js');
var source = fs.readFileSync(file, 'utf8');
var hash = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
var updated = source.replace(/const PASSWORD_SHA256 = '[0-9a-f]*';/, "const PASSWORD_SHA256 = '" + hash + "';");
if (updated === source && source.indexOf(hash) === -1) {
  console.error('PASSWORD_SHA256 not found in ' + file);
  process.exit(1);
}
fs.writeFileSync(file, updated);
console.log('Password set (sha256 ' + hash.slice(0, 8) + '…). Commit src/play/gate.js to publish it.');
