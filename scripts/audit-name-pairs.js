/**
 * Audits random-name-generator.html: parses LIST_A / LIST_B, checks for
 * unintended duplicates, and verifies each dealRound produces unique pair strings.
 *
 * Usage: node scripts/audit-name-pairs.js
 */

const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "..", "random-name-generator.html");

/**
 * Extract a top-level `[...]` array literal after `const name = `, respecting
 * strings so `];` inside quotes does not truncate.
 */
function extractConstArray(html, constName) {
  const needle = `const ${constName} = `;
  const start = html.indexOf(needle);
  if (start === -1) {
    throw new Error(`Missing ${constName} in ${htmlPath}`);
  }
  let i = start + needle.length;
  while (i < html.length && /\s/.test(html[i])) i++;
  if (html[i] !== "[") {
    throw new Error(`Expected [ after ${constName}`);
  }
  const bracketStart = i;
  let depth = 1;
  i++;
  let strChar = null;
  while (i < html.length && depth > 0) {
    const c = html[i];
    if (strChar) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === strChar) {
        strChar = null;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      strChar = c;
      i++;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") depth--;
    i++;
  }
  if (depth !== 0) {
    throw new Error(`Unclosed array for ${constName}`);
  }
  const lit = html.slice(bracketStart, i);
  return eval(lit);
}

function loadLists() {
  const html = fs.readFileSync(htmlPath, "utf8");
  return {
    LIST_A: extractConstArray(html, "LIST_A"),
    LIST_B: extractConstArray(html, "LIST_B"),
  };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function dealRound(LIST_A, LIST_B) {
  const PAIRS_PER_ROUND = Math.max(LIST_A.length, LIST_B.length);
  const a = shuffleInPlace([...LIST_A]);
  const b = shuffleInPlace([...LIST_B]);
  const pairs = [];
  for (let i = 0; i < PAIRS_PER_ROUND; i++) {
    pairs.push(a[i % a.length] + " " + b[i % b.length]);
  }
  return pairs;
}

function dupIndices(arr) {
  const seen = new Map();
  const dups = [];
  arr.forEach((s, i) => {
    if (seen.has(s)) {
      dups.push({ value: s, first: seen.get(s), duplicateAt: i });
    } else {
      seen.set(s, i);
    }
  });
  return dups;
}

function main() {
  const { LIST_A, LIST_B } = loadLists();
  const pairsPerRound = Math.max(LIST_A.length, LIST_B.length);

  console.log(
    "LIST_A.length",
    LIST_A.length,
    "LIST_B.length",
    LIST_B.length,
    "PAIRS_PER_ROUND",
    pairsPerRound,
  );

  const dA = dupIndices(LIST_A);
  const dB = dupIndices(LIST_B);
  const badA = dA.filter((d) => d.value !== "");
  const badB = dB.filter((d) => d.value !== "");
  const emptyDupA = dA.filter((d) => d.value === "");
  const emptyDupB = dB.filter((d) => d.value === "");

  if (badA.length || badB.length) {
    console.error("Duplicate non-empty entries in a list:", {
      LIST_A: badA,
      LIST_B: badB,
    });
    process.exit(1);
  }
  if (emptyDupA.length || emptyDupB.length) {
    console.log(
      "WARN: duplicate '' placeholders (non-fatal): LIST_A",
      emptyDupA.length,
      "LIST_B",
      emptyDupB.length,
    );
  }

  const pairs = dealRound(LIST_A, LIST_B);
  const unique = new Set(pairs);
  console.log("Sample round: pairs", pairs.length, "unique", unique.size);
  if (unique.size !== pairs.length) {
    const counts = new Map();
    for (const p of pairs) {
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    console.error(
      "FAIL: duplicate pair strings in one round:",
      [...counts.entries()].filter(([, n]) => n > 1),
    );
    process.exit(1);
  }

  const stress = 5000;
  for (let r = 0; r < stress; r++) {
    const p = dealRound(LIST_A, LIST_B);
    if (new Set(p).size !== p.length) {
      console.error("FAIL: duplicate pair strings in round", r);
      process.exit(1);
    }
  }
  console.log(stress + " random rounds: all pair strings unique.");
}

main();
