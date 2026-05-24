#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const modulePath = path.join(projectRoot, 'js', 'favoriteEatsInputSync.js');

function loadModule() {
  const source = fs.readFileSync(modulePath, 'utf8');
  let nextTimerId = 1;
  const timers = new Map();
  const context = {
    console,
    Date,
    setTimeout(fn) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'favoriteEatsInputSync.js' });
  return {
    api: context.favoriteEatsInputSync,
    runTimers() {
      const pending = Array.from(timers.entries());
      timers.clear();
      pending.forEach(([, fn]) => fn());
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const { api, runTimers } = loadModule();
  assert(api, 'favoriteEatsInputSync should attach to globalThis.');

  const applied = [];
  const flushed = [];
  const queue = api.createCoalescedOpQueue({
    flushDelayMs: 10,
    onLocalApply: (op) => applied.push(op),
    flushOp: async (op) => {
      flushed.push(op);
    },
  });

  queue.enqueue({
    surface: 'list',
    entityKey: 'milk',
    field: 'checked',
    value: true,
    clientSeq: 1,
  });
  queue.enqueue({
    surface: 'list',
    entityKey: 'milk',
    field: 'checked',
    value: false,
    clientSeq: 2,
  });
  queue.enqueue({
    surface: 'list',
    entityKey: 'milk',
    field: 'checked',
    value: true,
    clientSeq: 3,
  });

  assert(applied.length === 3, 'Local apply should run for every tap.');
  assert(queue.size() === 1, 'Repeated row/field ops should coalesce to one pending op.');
  assert(
    queue.getPendingOp({
      surface: 'list',
      entityKey: 'milk',
      field: 'checked',
    }).value === true,
    'The latest visible intent should be pending.',
  );

  runTimers();
  await Promise.resolve();
  await Promise.resolve();

  assert(flushed.length === 1, 'Only the latest coalesced op should flush.');
  assert(flushed[0].clientSeq === 3, 'The flushed op should be the latest op.');
  assert(flushed[0].value === true, 'The flushed op should carry latest value.');

  const separate = api.createCoalescedOpQueue({
    flushDelayMs: 0,
    flushOp: async (op) => flushed.push(op),
  });
  separate.enqueue({
    surface: 'list',
    entityKey: 'milk',
    field: 'checked',
    value: false,
  });
  separate.enqueue({
    surface: 'plan',
    entityKey: 'milk',
    field: 'quantity',
    value: 3,
  });
  assert(separate.size() === 2, 'Different surfaces/fields should not coalesce together.');

  console.log('favoriteEatsInputSync tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
