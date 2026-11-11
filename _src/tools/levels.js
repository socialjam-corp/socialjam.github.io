// Copies a game's level packs from Unity into one file the game module loads:
//
//   node _src/tools/levels.js <GameId> <outDir>
//   node _src/tools/levels.js Amunt src/play/games/amunt
//
// Reads SkeepGames/<GameId>/Levels/LevelPack_<Difficulty>_NNN.json and writes <outDir>/levels.json
// as { tutorial: [...], easy: [...], medium: [...], hard: [...] }, every level with its `id`.
// Several packs of one difficulty are concatenated in file order.
'use strict';

var fs = require('fs');
var path = require('path');
var u = require('./unity.js');

var gameId = process.argv[2];
var outDir = process.argv[3];
if (!gameId || !outDir) {
  console.error('usage: node _src/tools/levels.js <GameId> <outDir>');
  process.exit(1);
}

var dir = u.unityPath('Assets/SkeepGames', gameId, 'Levels');
var packs = { tutorial: [], easy: [], medium: [], hard: [] };
fs.readdirSync(dir).sort().forEach(function (file) {
  var m = file.match(/^LevelPack_(Tutorial|Easy|Medium|Hard)_\d+\.json$/);
  if (!m) return;
  var levels = JSON.parse(u.read(path.join(dir, file))).levels || [];
  packs[m[1].toLowerCase()] = packs[m[1].toLowerCase()].concat(levels);
});

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
var out = path.join(outDir, 'levels.json');
fs.writeFileSync(out, JSON.stringify(packs) + '\n');
console.log(out + ': ' + Object.keys(packs).map(function (d) { return d + ' ' + packs[d].length; }).join(', '));
