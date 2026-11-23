import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TelegramSignalMonitor } from '../telegram-monitor.mjs';

const quiet = [100, 101, 99, 100];
const signalRows = [...Array(94).fill(quiet), [100,105,99,101], quiet, quiet,
  [101,107,100,106], [105.4,106.8,104.6,106.4], [106.4,106.4,106.4,106.4]]
  .map((bar, index) => [index * 900, ...bar, 0, 1]);
const baselineRows = [...Array(99).fill(quiet)].map((bar, index) => [index * 900, ...bar, 0, 1]);

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function monitorFor({ rows, now, statePath, telegram }) {
  const fetch = async (url, options = {}) => {
    if (url.startsWith('https://api.kraken.com/')) return response({ error: [], result: { XXBTZUSD: rows() } });
    assert.match(url, /^https:\/\/api\.telegram\.org\/botsecret\/sendMessage$/);
    telegram.push(JSON.parse(options.body));
    return response({ ok: true, result: { message_id: telegram.length } });
  };
  return new TelegramSignalMonitor({ token: 'secret', chatId: '42', timeframes: [15], strategies: ['price-action'], statePath, pollMs: 30_000 }, {
    fetch, now, log: { warn() {} }
  });
}

test('sends one fresh new setup after the silent first observation', async () => {
  const statePath = join(await mkdtemp(join(tmpdir(), 'signal-desk-')), 'state.json');
  const telegram = [];
  const first = monitorFor({ rows: () => baselineRows, now: () => 88_201, statePath, telegram });
  await first.poll();
  const second = monitorFor({ rows: () => signalRows, now: () => 89_101, statePath, telegram });
  await second.poll();
  assert.equal(telegram.length, 1);
  assert.match(telegram[0].text, /BTC\/USD Buy paper setup/);
  assert.match(telegram[0].text, /Kraken spot paper levels only — not HFM\/MT5 execution prices/);
});

test('suppresses duplicate polling and survives a process restart', async () => {
  const statePath = join(await mkdtemp(join(tmpdir(), 'signal-desk-')), 'state.json');
  const telegram = [];
  const first = monitorFor({ rows: () => baselineRows, now: () => 88_201, statePath, telegram });
  await first.poll();
  const active = monitorFor({ rows: () => signalRows, now: () => 89_101, statePath, telegram });
  await active.poll();
  await active.poll();
  const restarted = monitorFor({ rows: () => signalRows, now: () => 89_102, statePath, telegram });
  await restarted.poll();
  assert.equal(telegram.length, 1);
});

test('does not alert from stale Kraken data', async () => {
  const statePath = join(await mkdtemp(join(tmpdir(), 'signal-desk-')), 'state.json');
  const telegram = [];
  const monitor = monitorFor({ rows: () => signalRows, now: () => 90_001, statePath, telegram });
  await monitor.poll();
  assert.equal(telegram.length, 0);
});
