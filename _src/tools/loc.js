// Prints strings from a Unity Localization table in ca/en/es, as JSON.
//
//   node _src/tools/loc.js <GameId> [keyRegex]      a game's table (SkeepGames/<GameId>/Localization)
//   node _src/tools/loc.js SkeepMain [keyRegex]     the app's main table
//
// A game's How to play text is GAME_TITLE, GAME_DESCRIPTION and GAME_DESCRIPTION_SP:
//   node _src/tools/loc.js Amunt "^GAME_(TITLE|DESCRIPTION|DESCRIPTION_SP)$"
'use strict';

var path = require('path');
var u = require('./unity.js');

var args = process.argv.slice(2);
if (!args[0]) {
  console.error('usage: node _src/tools/loc.js <GameId|SkeepMain> [keyRegex]');
  process.exit(1);
}
var main = args[0] === 'SkeepMain';
var dir = main
  ? u.unityPath('Assets/Skeep/Localization/SkeepMain')
  : u.unityPath('Assets/SkeepGames', args[0], 'Localization');
var table = main ? 'SkeepMain' : args[0] + '_Loc';
var keyFilter = args[1] ? new RegExp(args[1]) : null;

// Unity writes YAML scalars plain, single-quoted or double-quoted (with \xNN escapes).
function unquote(v) {
  v = v.trim();
  if (v.charAt(0) === '"') {
    return JSON.parse(v.replace(/\\x([0-9A-Fa-f]{2})/g, '\\u00$1').replace(/\\\//g, '/').replace(/\\ /g, ' '));
  }
  if (v.charAt(0) === "'") return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

// id → raw value of `field`, joining YAML's folded continuation lines.
function entries(file, field) {
  var lines = u.read(file).split(/\r?\n/);
  var out = {};
  var id = null;
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^\s*- m_Id: (\d+)/);
    if (m) { id = m[1]; continue; }
    m = lines[i].match(new RegExp('^(\\s*)' + field + ': ?(.*)$'));
    if (!m || !id) continue;
    var value = m[2];
    var indent = m[1].length;
    while (i + 1 < lines.length && lines[i + 1].match(/^\s*/)[0].length > indent && !/^\s*(m_|- )/.test(lines[i + 1])) {
      var next = lines[++i].trim();
      value += next === '' ? '\n' : (/\n$/.test(value) ? '' : ' ') + next;
    }
    out[id] = value;
  }
  return out;
}

var keys = entries(path.join(dir, table + ' Shared Data.asset'), 'm_Key');
var result = {};
['ca', 'en', 'es'].forEach(function (lang) {
  var values = entries(path.join(dir, table + '_' + lang + '.asset'), 'm_Localized');
  Object.keys(keys).forEach(function (id) {
    var key = keys[id].trim();
    if (keyFilter && !keyFilter.test(key)) return;
    (result[key] = result[key] || {})[lang] = values[id] !== undefined ? unquote(values[id]) : null;
  });
});
console.log(JSON.stringify(result, null, 1));
