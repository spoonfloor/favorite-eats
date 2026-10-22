#!/usr/bin/env node
'use strict';

/**
 * Minimal static file server for local previews: node scripts/devStaticServer.js [port]
 * Serves the repo root with caching off. Replaces `python3 -m http.server`,
 * which macOS blocks from reading folders on the Desktop.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 8765);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

http
  .createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let filePath = path.join(root, pathname);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      const body = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type':
          contentTypes[path.extname(filePath).toLowerCase()] ||
          'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch (_) {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(port, () => {
    console.log(`Serving ${root} at http://localhost:${port}`);
  });
