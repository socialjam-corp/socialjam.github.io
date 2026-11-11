// Builds the language versions of every page.
//
//   node _src/build.js
//
// Reads  _src/pages/<page>.html      page templates
//        _src/strings/<page>.js      that page's text in every language
//        _src/strings/common.js      text shared by all pages (menu)
//        _src/partials/*.html        shared markup
// Writes /<lang>/<page>.html         one fully translated copy per language
//        /<page>.html                a redirect to the visitor's language
//
// GitHub Pages (Jekyll) does not publish folders starting with "_", so _src/ stays private.
// Written for Node 6 (no async/await, no object spread).
'use strict';

var fs = require('fs');
var path = require('path');

var SITE = 'https://www.skeep.me/';
var LANGS = ['ca', 'en', 'es'];
// Fallback when neither a saved choice nor the browser's languages match a supported one.
var DEFAULT_LANG = 'ca';
var PAGES = ['index.html', 'contact.html', 'privacypolicy.html', 'termsconditions.html'];

var SRC = __dirname;
var OUT = path.resolve(SRC, '..');
var common = require('./strings/common.js');

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

function fail(msg) { throw new Error(msg); }

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The index page is linked as the folder ("/ca/"), the others by file name.
function pageUrl(page) { return page === 'index.html' ? '' : page; }

function hreflangTags(page) {
  return LANGS.map(function (l) {
    return '<link rel="alternate" hreflang="' + l + '" href="' + SITE + l + '/' + pageUrl(page) + '" />';
  }).concat('<link rel="alternate" hreflang="x-default" href="' + SITE + pageUrl(page) + '" />').join('\n');
}

// Re-indents a block of HTML so each top-level block element starts its own line.
function formatBody(html, indent) {
  return html.replace(/\n\s*/g, '')
    .replace(/(<(?:p|h3|ul|ol|table|div class="callout)[ >])/g, '\n$1')
    .replace(/^\n/, '')
    .split('\n').map(function (line) { return indent + line; }).join('\n');
}

function renderToc(items, idPrefix) {
  return items.map(function (label, i) {
    var num = (i < 9 ? '0' : '') + (i + 1);
    return '<li><a href="#' + idPrefix + (i + 1) + '">' + num + ' - ' + label + '</a></li>';
  }).join('\n');
}

function renderSections(sections, idPrefix) {
  return sections.map(function (s, i) {
    var num = (i < 9 ? '0' : '') + (i + 1);
    return '<!-- Section ' + (i + 1) + ' -->\n' +
      '<section id="' + idPrefix + (i + 1) + '">\n' +
      '  <div class="section-header">\n' +
      '    <h2><span class="section-num">' + num + ' -</span> ' + s.title + '</h2>\n' +
      '  </div>\n' +
      formatBody(s.body, '  ') + '\n' +
      '</section>';
  }).join('\n\n');
}

// Template syntax:
//   {{key}}            text, HTML-escaped          {{{key}}}        raw HTML
//   {{> name}}         _src/partials/name.html, indented to the tag's column
//   {{lang}} {{root}} {{pageUrl}} {{active:xx}}   page context
//   {{{hreflang}}}     alternate-language links
//   {{{toc:p}}} {{{sections:p}}}  legal-page TOC / sections, ids prefixed with "p"
//   {{{json:a,b}}}     the listed strings as a JSON object, for page scripts
function render(template, ctx, used) {
  // Partials first, keeping the indentation of the line they sit on.
  template = template.replace(/^([ \t]*)\{\{> *([\w-]+) *\}\}$/gm, function (m, indent, name) {
    var partial = read(path.join(SRC, 'partials', name + '.html')).replace(/\n$/, '');
    return partial.split('\n').map(function (line) { return line ? indent + line : line; }).join('\n');
  });

  function value(key) {
    if (!(key in ctx.strings)) fail(ctx.page + ' [' + ctx.lang + ']: missing string "' + key + '"');
    used[key] = true;
    return ctx.strings[key];
  }

  // Multi-line raw blocks are indented to their placeholder's column too.
  template = template.replace(/^([ \t]*)\{\{\{(toc|sections):(\w+)\}\}\}$/gm, function (m, indent, kind, prefix) {
    var html = kind === 'toc' ? renderToc(value('toc'), prefix) : renderSections(value('sections'), prefix);
    return html.split('\n').map(function (line) { return line ? indent + line : line; }).join('\n');
  });
  template = template.replace(/^([ \t]*)\{\{\{hreflang\}\}\}$/gm, function (m, indent) {
    return hreflangTags(ctx.page).split('\n').map(function (line) { return indent + line; }).join('\n');
  });

  return template.replace(/\{\{\{([\w:,]+)\}\}\}|\{\{([\w:]+)\}\}/g, function (m, raw, text) {
    var key = raw || text;
    var out;
    if (key === 'lang') out = ctx.lang;
    else if (key === 'root') out = '../';
    else if (key === 'pageUrl') out = pageUrl(ctx.page);
    else if (key.indexOf('active:') === 0) out = key.slice(7) === ctx.lang ? ' active' : '';
    else if (key.indexOf('json:') === 0) {
      var obj = {};
      key.slice(5).split(',').forEach(function (k) { obj[k] = value(k); });
      // "</" would end the surrounding <script> early.
      out = JSON.stringify(obj).replace(/<\//g, '<\\/');
    } else out = value(key);
    if (typeof out !== 'string') fail(ctx.page + ' [' + ctx.lang + ']: "' + key + '" is not a string');
    return raw ? out : escapeHtml(out);
  });
}

function banner(source) {
  return '<!-- Generated by _src/build.js from ' + source + '. Edit the source, then run: node _src/build.js -->';
}

function redirectPage(page) {
  var targets = LANGS.map(function (l) {
    return '<a href="' + l + '/' + pageUrl(page) + '" hreflang="' + l + '">' + l.toUpperCase() + '</a>';
  }).join(' · ');
  return [
    '<!doctype html>',
    banner('redirectPage() in _src/build.js'),
    '<html>',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<title>skeep</title>',
    hreflangTags(page),
    '<script>',
    '// Send the visitor to their language: an explicit flag choice first, then the',
    "// browser's preferred languages, then " + DEFAULT_LANG + '. The hash keeps links to a section working.',
    '(function () {',
    '  var supported = ' + JSON.stringify(LANGS) + ';',
    '  var lang = null;',
    "  try { lang = localStorage.getItem('skeep_lang_choice'); } catch (e) {}",
    '  if (supported.indexOf(lang) === -1) {',
    "    lang = '" + DEFAULT_LANG + "';",
    '    var prefs = navigator.languages && navigator.languages.length',
    '      ? navigator.languages',
    '      : [navigator.language || navigator.userLanguage || ""];',
    '    for (var i = 0; i < prefs.length; i++) {',
    '      var code = String(prefs[i]).toLowerCase().slice(0, 2);',
    '      if (supported.indexOf(code) !== -1) { lang = code; break; }',
    '    }',
    '  }',
    "  location.replace(lang + '/" + pageUrl(page) + "' + location.search + location.hash);",
    '})();',
    '</script>',
    '<noscript><meta http-equiv="refresh" content="0; url=' + DEFAULT_LANG + '/' + pageUrl(page) + '" /></noscript>',
    '<style>body { background: #252525; color: #E2E3E4; font-family: sans-serif; text-align: center; padding-top: 30vh; } a { color: #7B9BE0; }</style>',
    '</head>',
    '<body>',
    '<p>' + targets + '</p>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

var written = [];
PAGES.forEach(function (page) {
  var template = read(path.join(SRC, 'pages', page));
  var strings = require('./strings/' + page.replace('.html', '.js'));
  var used = {};

  LANGS.forEach(function (lang) {
    if (!strings[lang]) fail(page + ': no "' + lang + '" strings');
    var merged = {};
    [common[lang], strings[lang]].forEach(function (src) {
      Object.keys(src).forEach(function (k) { merged[k] = src[k]; });
    });
    var html = render(template, { page: page, lang: lang, strings: merged }, used)
      .replace(/^(<!doctype html>)\n/i, '$1\n' + banner('_src/pages/' + page) + '\n');
    var dir = path.join(OUT, lang);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, page), html);
    written.push(lang + '/' + page);
  });

  // A key nobody uses is usually a typo in the template or the strings file.
  LANGS.forEach(function (lang) {
    Object.keys(strings[lang]).forEach(function (k) {
      if (!used[k]) console.warn('warning: ' + page + ' [' + lang + ']: string "' + k + '" is not used');
    });
  });

  fs.writeFileSync(path.join(OUT, page), redirectPage(page));
  written.push(page + ' (redirect)');
});

console.log('Built ' + written.length + ' files:\n  ' + written.join('\n  '));
