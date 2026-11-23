import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { analyze, isFresh, parseCandles } from './dist/engine.mjs';

const KRAKEN_URL = 'https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=';
const DEFAULT_TIMEFRAMES = [15, 60, 240];
const DEFAULT_STRATEGIES = ['price-action', 'crossover'];

function list(value, fallback, allowed) {
  if (!value) return fallback;
  const values = value.split(',').map(item => item.trim()).filter(Boolean);
  if (!values.length || values.some(item => !allowed.includes(item))) {
    throw Error('Invalid monitor configuration.');
  }
  return [...new Set(values)];
}

function timeframes(value) {
  const values = !value ? DEFAULT_TIMEFRAMES : value.split(',').map(item => Number(item.trim()));
  if (!values.length || values.some(item => ![15, 60, 240].includes(item))) {
    throw Error('SIGNAL_TIMEFRAMES must contain only 15, 60, and/or 240.');
  }
  return [...new Set(values)];
}

export function monitorConfig(env = process.env, cwd = process.cwd()) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if ((token && !chatId) || (!token && chatId)) throw Error('Set both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.');
  return {
    enabled: Boolean(token && chatId), token, chatId,
    timeframes: timeframes(env.SIGNAL_TIMEFRAMES),
    strategies: list(env.SIGNAL_STRATEGIES, DEFAULT_STRATEGIES, DEFAULT_STRATEGIES),
    statePath: resolve(cwd, env.TELEGRAM_STATE_FILE || '.signal-desk-telegram-state.json'),
    pollMs: Math.max(5_000, Number(env.SIGNAL_POLL_MS || 30_000) || 30_000)
  };
}

export function formatSignal(plan) {
  const candleTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short', hour12: false
  }).format(new Date(plan.t * 1000));
  const usd = value => '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [
    'BTC/USD ' + plan.side + ' paper setup',
    'Strategy: ' + (plan.strategy === 'crossover' ? 'EMA crossover · Momentum' : 'Breakout + continuation'),
    'Setup: ' + (plan.setupType || 'EMA crossover'),
    'Timeframe: ' + ({ 15: '15m', 60: '1h', 240: '4h' }[plan.minutes] || plan.minutes + 'm'),
    'Direction: ' + plan.side,
    'Candle time: ' + candleTime + ' WAT',
    'Paper entry: ' + usd(plan.entry),
    'Stop loss: ' + usd(plan.sl),
    ...(plan.tp1 == null ? [] : ['TP1: ' + usd(plan.tp1)]),
    'TP2: ' + usd(plan.tp),
    'Kraken spot paper levels only — not HFM/MT5 execution prices.'
  ].join('\n');
}

async function readState(path) {
  try {
    const state = JSON.parse(await readFile(path, 'utf8'));
    return state && typeof state === 'object' && state.scopes && typeof state.scopes === 'object' ? state : { scopes: {} };
  } catch (error) {
    if (error.code === 'ENOENT') return { scopes: {} };
    throw Error('Could not read Telegram monitor state.');
  }
}

async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.tmp';
  await writeFile(temporary, JSON.stringify(state) + '\n', { mode: 0o600 });
  await rename(temporary, path);
}

export class TelegramSignalMonitor {
  constructor(config, { fetch = globalThis.fetch, now = () => Date.now() / 1000, log = console } = {}) {
    this.config = config;
    this.fetch = fetch;
    this.now = now;
    this.log = log;
    this.state = null;
    this.timer = null;
    this.polling = false;
    this.telegramRetryAt = 0;
  }

  async initialise() { this.state = await readState(this.config.statePath); }

  async fetchCandles(minutes) {
    const response = await this.fetch(KRAKEN_URL + minutes, { cache: 'no-store' });
    if (!response.ok) throw Error('Kraken returned HTTP ' + response.status);
    const body = await response.json();
    if (body.error?.length || !body.result?.XXBTZUSD) throw Error('Kraken returned an invalid candle response');
    return parseCandles(body.result.XXBTZUSD, minutes);
  }

  async send(text) {
    const response = await this.fetch('https://api.telegram.org/bot' + this.config.token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: this.config.chatId, text, disable_web_page_preview: true })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      const error = Error('Telegram delivery failed' + (body.description ? ': ' + body.description : ''));
      error.retryAfter = Number(body.parameters?.retry_after) || 0;
      throw error;
    }
  }

  async pollScope(minutes, strategy) {
    const rows = await this.fetchCandles(minutes);
    const result = analyze(rows, minutes, strategy);
    if (!isFresh(result.current, minutes, this.now())) return;
    const key = strategy + ':' + minutes;
    const scope = this.state.scopes[key];
    if (!scope) {
      this.state.scopes[key] = { latestCandle: result.current.t, sent: [] };
      await saveState(this.config.statePath, this.state);
      return;
    }
    if (result.current.t < scope.latestCandle) return;
    if (result.current.t > scope.latestCandle) {
      scope.latestCandle = result.current.t;
      await saveState(this.config.statePath, this.state);
    }
    const plan = result.signal === 'Wait' ? null : result.plans.findLast(item => item.t === result.current.t);
    if (!plan || scope.sent.includes(plan.id)) return;
    if (this.now() < this.telegramRetryAt) return;

    // Reserve before the request: a process crash after Telegram accepts it cannot create a duplicate on restart.
    scope.sent.push(plan.id);
    scope.sent = scope.sent.slice(-200);
    await saveState(this.config.statePath, this.state);
    try {
      await this.send(formatSignal(plan));
    } catch (error) {
      scope.sent = scope.sent.filter(id => id !== plan.id);
      await saveState(this.config.statePath, this.state);
      if (error.retryAfter) this.telegramRetryAt = this.now() + error.retryAfter;
      throw error;
    }
  }

  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      if (!this.state) await this.initialise();
      for (const minutes of this.config.timeframes) for (const strategy of this.config.strategies) {
        try { await this.pollScope(minutes, strategy); }
        catch (error) { this.log.warn('Telegram monitor (' + strategy + ' ' + minutes + 'm): ' + error.message); }
      }
    } finally { this.polling = false; }
  }

  async start() {
    await this.poll();
    this.timer = setInterval(() => this.poll(), this.config.pollMs);
    this.timer.unref?.();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

export async function startTelegramMonitor(env = process.env, options = {}) {
  const config = monitorConfig(env, options.cwd);
  if (!config.enabled) return null;
  const monitor = new TelegramSignalMonitor(config, options);
  await monitor.start();
  console.log('Telegram BTC/USD monitoring is active for ' + config.timeframes.map(value => value + 'm').join(', ') + '.');
  return monitor;
}
