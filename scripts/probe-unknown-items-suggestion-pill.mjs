#!/usr/bin/env node
/**
 * Regression probe: unknown-items suggestion pill must not dismiss the dialog.
 *
 * Loads production js/utils.js, opens ui.unknownItems with "glaric",
 * clicks the garlic suggestion pill, then dialog Save.
 *
 * Usage:
 *   node scripts/probe-unknown-items-suggestion-pill.mjs
 *   node scripts/probe-unknown-items-suggestion-pill.mjs --base-url http://127.0.0.1:8000
 */

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  let baseUrl = process.env.PROBE_BASE_URL || '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base-url' || args[i] === '-b') baseUrl = args[++i] || baseUrl;
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: node scripts/probe-unknown-items-suggestion-pill.mjs [--base-url URL]`);
      process.exit(0);
    }
  }
  return { baseUrl };
}

function contentType(filePath) {
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

function startStaticServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
        const rel = urlPath === '/' ? '/probe-unknown-items-harness.html' : urlPath;
        const filePath = path.join(REPO_ROOT, rel.replace(/^\//, ''));
        if (!filePath.startsWith(REPO_ROOT)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(fs.readFileSync(filePath));
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function runProbe(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('[probe]')) console.log(text);
  });

  await page.goto(`${baseUrl}/probe-unknown-items-harness.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await page.waitForFunction(() => typeof window.__runUnknownItemsProbe === 'function', {
    timeout: 10000,
  });

  const report = await page.evaluate(async () => window.__runUnknownItemsProbe());
  await browser.close();
  return report;
}

function assertReport(report) {
  const errors = [];
  if (report.error) errors.push(report.error);
  if (report.dialogClosedAfterPillClick) {
    errors.push('dialog closed after suggestion-pill click');
  }
  if (report.dialogPromiseResolvedNullAfterPill) {
    errors.push('unknownItems resolved null after pill click only');
  }
  if (report.rowTextAfterPill !== 'garlic') {
    errors.push(`row text after pill expected "garlic", got ${JSON.stringify(report.rowTextAfterPill)}`);
  }
  if (!report.dialogResult || !Array.isArray(report.dialogResult.rows)) {
    errors.push('dialog did not resolve with rows after Save');
  } else {
    const row = report.dialogResult.rows[0];
    if (String(row?.original || '').toLowerCase() !== 'glaric') {
      errors.push(`final original expected glaric, got ${JSON.stringify(row?.original)}`);
    }
    if (String(row?.value || '').toLowerCase() !== 'garlic') {
      errors.push(`final value expected garlic, got ${JSON.stringify(row?.value)}`);
    }
  }
  return errors;
}

async function main() {
  const { baseUrl: argBase } = parseArgs();
  let baseUrl = argBase;
  let server = null;

  if (!baseUrl) {
    const port = 9876 + Math.floor(Math.random() * 200);
    server = await startStaticServer(port);
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`[probe] static server ${baseUrl}`);
  }

  try {
    const report = await runProbe(baseUrl);
    console.log('\n=== probe report (JSON) ===');
    console.log(JSON.stringify(report, null, 2));

    const errors = assertReport(report);
    console.log('\n=== verdict ===');
    if (errors.length) {
      errors.forEach((e) => console.log('FAIL:', e));
      process.exit(1);
    }
    console.log('PASS: pill apply keeps dialog open; Save returns glaric → garlic.');
    if (
      report.backdropBubble?.panelContainsTarget === false &&
      report.backdropBubble?.pathIncludesPanel === true
    ) {
      console.log(
        'NOTE: detached target still makes contains() false; composedPath dismiss guard is required.',
      );
    }
    process.exit(0);
  } finally {
    if (server) server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
