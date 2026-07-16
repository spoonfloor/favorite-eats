#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const mainPath = path.join(projectRoot, 'js', 'main.js');

function extractSnippet(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract snippet between ${startMarker} and ${endMarker}.`);
  }
  return source.slice(start, end);
}

function loadKit() {
  const source = fs.readFileSync(mainPath, 'utf8');
  const snippet = extractSnippet(
    source,
    'function splitShoppingListRowTextToLabelAndDetail(text) {',
    'function joinShoppingListLabelAndDetail(label, detail) {',
  );
  const context = {
    window: {},
    document: {
      createElement(tagName) {
        const el = {
          tagName: String(tagName || '').toUpperCase(),
          className: '',
          classList: {
            _set: new Set(),
            add(cls) {
              this._set.add(cls);
            },
            remove(cls) {
              this._set.delete(cls);
            },
            toggle(cls, on) {
              if (on) this.add(cls);
              else this.remove(cls);
            },
            contains(cls) {
              return this._set.has(cls);
            },
          },
          style: { display: '' },
          textContent: '',
          childNodes: [],
          appendChild(child) {
            this.childNodes.push(child);
            child.parentElement = this;
            return child;
          },
          querySelector() {
            return null;
          },
          closest() {
            return null;
          },
        };
        if (tagName === 'span' || tagName === 'div') {
          el.appendChild = function appendChild(child) {
            this.childNodes.push(child);
            child.parentElement = this;
            return child;
          };
        }
        return el;
      },
      createTextNode(text) {
        return { nodeType: 3, textContent: String(text || '') };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `${snippet}
if (typeof window !== 'undefined') {
  window.__listRowLabelKit = {
    splitShoppingListRowTextToLabelAndDetail,
    splitFoldedListRowLabel,
    formatListRowDetailParenthetical,
    createListRowDetailTail,
    createItemsBrowseSplitRowHeadline,
    applySplitListRowLabelPair,
    truncatePrefixWithEllipsis,
    fitShoppingListSplitRowDisplay,
    parseVariantParentDetailText,
    truncateEndToFitPx,
    truncateInsideForFullLineMeasure,
    fitVariantParentFoldedLine,
    SHOPPING_LIST_DETAIL_DISPLAY_MIN_CHARS,
    SHOPPING_LIST_DISPLAY_ELLIPSIS,
  };
}`,
    context,
    { filename: 'listRowLabelKit.test-snippet.js' },
  );
  const kit = context.window.__listRowLabelKit;
  if (!kit) throw new Error('list row label kit was not attached to window.');
  return kit;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual:   ${actual}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const kit = loadKit();

  assertEqual(
    kit.formatListRowDetailParenthetical('oat'),
    '(oat)',
    'detail parenthetical wrapper',
  );
  assertEqual(
    kit.formatListRowDetailParenthetical(''),
    '',
    'empty detail stays empty',
  );

  assertEqual(
    kit.splitFoldedListRowLabel('mushrooms (a, b)', 'mushrooms').label,
    'mushrooms',
    'folded split keeps base label',
  );
  assertEqual(
    kit.splitFoldedListRowLabel('mushrooms (a, b)', 'mushrooms').detail,
    'a, b',
    'folded split keeps inner detail',
  );

  assertEqual(
    kit.splitFoldedListRowLabel('Milk (oat)', 'Milk').detail,
    'oat',
    'filter hint uses known base name',
  );

  const splitRow = kit.createItemsBrowseSplitRowHeadline();
  assertEqual(splitRow.wrap.childNodes.length, 2, 'headline has primary + tail');
  assertEqual(
    splitRow.wrap.childNodes[1].className,
    'shopping-list-doc-tail',
    'detail tail matches shopping list rows',
  );
  assertEqual(
    splitRow.tail.childNodes[0].textContent,
    '\u00a0',
    'typographic space precedes parenthetical detail',
  );
  assertEqual(
    splitRow.tail.childNodes[1],
    splitRow.detail,
    'detail lives inside tail',
  );

  const primary = { textContent: '', style: { display: '' }, closest: () => wrap };
  const detail = {
    textContent: '',
    style: { display: '' },
    closest(selector) {
      return selector === '.shopping-list-doc-tail' ? tail : null;
    },
    querySelector() {
      return null;
    },
  };
  const tail = {
    style: { display: '' },
    querySelector() {
      return null;
    },
  };
  const wrap = {
    classList: {
      _set: new Set(),
      add(cls) {
        this._set.add(cls);
      },
      remove(cls) {
        this._set.delete(cls);
      },
      toggle(cls, on) {
        if (on) this.add(cls);
        else this.remove(cls);
      },
    },
  };

  kit.applySplitListRowLabelPair(
    primary,
    detail,
    'mushrooms (foo, bar)',
    'mushrooms',
  );
  assertEqual(primary.textContent, 'mushrooms', 'apply keeps full item name');
  assertEqual(detail.textContent, '(foo, bar)', 'apply keeps detail in parens');
  assertEqual(tail.style.display, '', 'tail visible when detail present');

  kit.applySplitListRowLabelPair(primary, detail, 'mushrooms', 'mushrooms');
  assertEqual(detail.textContent, '', 'empty detail clears parens text');
  assertEqual(tail.style.display, 'none', 'tail hidden when detail absent');

  assertEqual(
    kit.truncatePrefixWithEllipsis('abcdefghij', 12),
    'abcdefghij',
    'prefix truncate keeps short strings intact',
  );
  assertEqual(
    kit.truncatePrefixWithEllipsis('abcdefghij', 8),
    'abcdefg…',
    'prefix truncate reserves one ellipsis glyph',
  );

  const charMeasure = (s) => String(s || '').length * 8;
  const shortFit = kit.fitShoppingListSplitRowDisplay({
    detail: '1,792',
    maxPx: 200,
    measure: charMeasure,
    suffixPx: 24,
    detailMinChars: kit.SHOPPING_LIST_DETAIL_DISPLAY_MIN_CHARS,
  });
  assertEqual(shortFit.detailParen, '(1,792)', 'regime 1 keeps full detail parens');
  assertEqual(shortFit.detailTruncated, false, 'regime 1 does not flag truncation');

  const longFit = kit.fitShoppingListSplitRowDisplay({
    detail: '1 + 3 crowns + 3½ lb',
    maxPx: 180,
    measure: charMeasure,
    suffixPx: 24,
    detailMinChars: kit.SHOPPING_LIST_DETAIL_DISPLAY_MIN_CHARS,
  });
  assert(longFit.detailTruncated, 'regime 2 truncates long detail');
  assert(
    longFit.detailParen.startsWith('(1 + 3 crown'),
    `regime 2 keeps at least a 12-char detail prefix (got ${longFit.detailParen})`,
  );
  assert(
    charMeasure(longFit.detailParen) + 24 <= 180,
    'regime 2 detail parens fit within width budget',
  );

  const parts = [
    'Baby Bella',
    'Cremini',
    'Portobello',
    'Shiitake',
    'Oyster',
  ];
  const baseName = 'mushrooms';
  const overheadPx = 120;
  const charMeasureFullLine = (inside) =>
    overheadPx + String(inside || '').length * 8;

  const wideFit = kit.fitVariantParentFoldedLine({
    baseName,
    parts,
    maxPx: 640,
    measureFullLine: charMeasureFullLine,
  });
  assert(wideFit.ready, 'wide budget marks fit ready');
  assertEqual(
    wideFit.detail,
    parts.join(', '),
    'wide budget keeps all variant names',
  );
  assertEqual(wideFit.moreSuffix, '', 'wide budget does not add + n more');

  const suffixFit = kit.fitVariantParentFoldedLine({
    baseName,
    parts,
    maxPx: overheadPx + 'Baby Bella, + 4 more'.length * 8,
    measureFullLine: charMeasureFullLine,
  });
  assert(suffixFit.ready, '+ n more path is ready when suffix fits');
  assertEqual(suffixFit.names, 'Baby Bella', '+ n more keeps full first name');
  assertEqual(suffixFit.moreSuffix, ', + 4 more', '+ n more suffix intact');
  assert(
    !suffixFit.names.includes('…') && !suffixFit.names.includes('...'),
    '+ n more never pairs with truncated names',
  );

  const narrowFit = kit.fitVariantParentFoldedLine({
    baseName,
    parts,
    maxPx: overheadPx + 40,
    measureFullLine: charMeasureFullLine,
  });
  assert(narrowFit.ready, 'narrow budget still returns ready fit');
  assertEqual(narrowFit.moreSuffix, '', 'narrow budget drops + n more');
  assert(
    narrowFit.detail.endsWith('…'),
    'narrow budget end-truncates inside parens',
  );
  assert(
    !narrowFit.detail.includes('+ '),
    'narrow budget never shows partial + n more',
  );

  const deferredFit = kit.fitVariantParentFoldedLine({
    baseName,
    parts,
    maxPx: 0,
    measureFullLine: charMeasureFullLine,
  });
  assert(!deferredFit.ready, 'zero budget defers without guessing');
  assertEqual(
    deferredFit.detail,
    parts.join(', '),
    'deferred fit keeps canonical detail',
  );

  const stableA = kit.fitVariantParentFoldedLine({
    baseName,
    parts,
    maxPx: overheadPx + 56,
    measureFullLine: charMeasureFullLine,
  });
  const stableB = kit.fitVariantParentFoldedLine({
    baseName,
    parts,
    maxPx: overheadPx + 56,
    measureFullLine: charMeasureFullLine,
  });
  assertEqual(
    stableA.fullLine,
    stableB.fullLine,
    'same budget yields identical full line',
  );

  console.log('List row label kit tests passed.');
}

run();
