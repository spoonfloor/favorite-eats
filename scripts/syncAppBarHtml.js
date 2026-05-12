#!/usr/bin/env node
'use strict';

/**
 * Inlines fragments/appBar.shell.html into every root *.html that uses the
 * standard app bar. Skips shoppingList.html (custom Cancel/Save row actions).
 *
 * Injects js/chromeBoot.js + Material Symbols preload before css/fonts.css.
 * Injects js/firstPaintAppBar.js immediately after #appBarMount (before main.js).
 * Run after editing fragments/appBar.shell.html: npm run sync:appbar
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const fragmentPath = path.join(projectRoot, 'fragments', 'appBar.shell.html');

const SKIP_APP_BAR_REPLACE = new Set(['shoppingList.html']);

/** Body indent for #appBarMount (matches other top-level body children). */
const BODY_INDENT = '    ';

function stripChromeBootBlock(html) {
  return html.replace(
    /[\t ]*<script src="js\/chromeBoot\.js"><\/script>\s*\n[\t ]*<link\s*\n[\t ]*rel="preload"[\s\S]*?type="font\/woff2"\s*\n[\t ]*crossorigin\s*\n[\t ]*\/>\s*\n?/g,
    '',
  );
}

function injectChromeBootAndPreload(html) {
  html = stripChromeBootBlock(html);
  if (html.includes('js/chromeBoot.js')) return html;

  const key = 'href="css/fonts.css"';
  const hrefIdx = html.indexOf(key);
  if (hrefIdx === -1) {
    throw new Error('Expected css/fonts.css stylesheet link not found');
  }
  const lineStart = html.lastIndexOf('\n', hrefIdx - 1) + 1;
  const lineEnd = html.indexOf('\n', hrefIdx);
  const endExclusive = lineEnd === -1 ? html.length : lineEnd + 1;
  const line = html.slice(lineStart, lineEnd === -1 ? html.length : lineEnd);
  const m = line.match(/^([\t ]*)<link rel="stylesheet" href="css\/fonts\.css" \/>$/);
  if (!m) {
    throw new Error(`Bad fonts.css line: ${JSON.stringify(line)}`);
  }
  const ind = m[1] && m[1].length ? m[1] : '    ';
  const snippet = `${ind}<script src="js/chromeBoot.js"></script>
${ind}<link
${ind}  rel="preload"
${ind}  href="assets/fonts/material-symbols-outlined.woff2"
${ind}  as="font"
${ind}  type="font/woff2"
${ind}  crossorigin
${ind}/>
`;
  const fontsLine = `${ind}<link rel="stylesheet" href="css/fonts.css" />
`;
  return html.slice(0, lineStart) + snippet + fontsLine + html.slice(endExclusive);
}

function stripFirstPaintAppBarScript(html) {
  return html.replace(
    /\n[\t ]*<script src="js\/firstPaintAppBar\.js"><\/script>\n/g,
    '\n',
  );
}

function injectFirstPaintAfterMount(html) {
  html = stripFirstPaintAppBarScript(html);
  const range = findAppBarMountRange(html);
  if (!range) return html;
  const snippet = `\n${BODY_INDENT}<script src="js/firstPaintAppBar.js"></script>\n`;
  return html.slice(0, range.end) + snippet + html.slice(range.end);
}

function findAppBarMountRange(html) {
  const openTagRe = /<div\b[^>]*\bid\s*=\s*["']appBarMount["'][^>]*>/;
  const m = openTagRe.exec(html);
  if (!m) return null;
  const open = m.index;
  const openTagEnd = m.index + m[0].length;
  let depth = 1;
  let i = openTagEnd;
  while (i < html.length && depth > 0) {
    const divOpen = html.indexOf('<div', i);
    const divClose = html.indexOf('</div>', i);
    if (divClose === -1) {
      throw new Error('Unclosed appBarMount div');
    }
    if (divOpen !== -1 && divOpen < divClose) {
      depth += 1;
      i = divOpen + 4;
    } else {
      depth -= 1;
      i = divClose + 6;
    }
  }
  return { open, end: i };
}

function buildStandardMountInner(fragmentSource, mountLineIndent) {
  const pad = `${mountLineIndent}  `;
  return fragmentSource
    .replace(/\r\n/g, '\n')
    .trimEnd()
    .split('\n')
    .map((line) => (line ? pad + line : ''))
    .join('\n');
}

function replaceStandardAppBarMount(html, inner) {
  const range = findAppBarMountRange(html);
  if (!range) return html;
  const { open, end } = range;
  const lineStart = html.lastIndexOf('\n', open - 1) + 1;
  const newBlock = `${BODY_INDENT}<div id="appBarMount" data-app-bar-inline="1">\n${inner}\n${BODY_INDENT}</div>`;
  return html.slice(0, lineStart) + newBlock + html.slice(end);
}

function normalizeRootMainIndent(html) {
  return html.replace(/\n<main class="page-main"/g, '\n    <main class="page-main"');
}

function syncRootHtmlFiles() {
  const fragmentSource = fs.readFileSync(fragmentPath, 'utf8');

  const entries = fs.readdirSync(projectRoot);
  for (const name of entries) {
    if (!name.endsWith('.html')) continue;
    const full = path.join(projectRoot, name);
    let html = fs.readFileSync(full, 'utf8');
    if (!html.includes('css/fonts.css')) continue;

    html = injectChromeBootAndPreload(html);

    if (name === 'index.html') {
      fs.writeFileSync(full, normalizeRootMainIndent(html));
      continue;
    }

    if (!html.includes('id="appBarMount"') && !html.includes("id='appBarMount'")) {
      fs.writeFileSync(full, normalizeRootMainIndent(html));
      continue;
    }

    if (SKIP_APP_BAR_REPLACE.has(name)) {
      html = injectFirstPaintAfterMount(html);
      fs.writeFileSync(full, normalizeRootMainIndent(html));
      continue;
    }

    const range = findAppBarMountRange(html);
    if (!range) {
      fs.writeFileSync(full, normalizeRootMainIndent(html));
      continue;
    }
    const inner = buildStandardMountInner(fragmentSource, BODY_INDENT);
    html = replaceStandardAppBarMount(html, inner);
    html = injectFirstPaintAfterMount(html);
    fs.writeFileSync(full, normalizeRootMainIndent(html));
  }
}

syncRootHtmlFiles();
console.log('syncAppBarHtml: chrome boot, preload, first-paint app bar script, app bar inline.');
