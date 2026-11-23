# Signal Desk

A local BTC/USD dashboard for studying paper trades. Version 3 adds a continuation setup to the existing break-and-retest price action strategy. It also includes an EMA crossover strategy, an interactive candlestick chart, and a journal.

## Run on your Mac

1. Save the ZIP in Downloads. Double-click it in Finder to extract the `signal-desk` folder.
2. Open Terminal and run the following commands. Use another path if you extracted the folder elsewhere.

   ```sh
   cd ~/Downloads/signal-desk
   node -v
   npm start
   ```

   The launcher uses Node.js 18 or newer and its built-in modules. No package installation, API key, or configuration file is required for the dashboard. If `node` or `npm` is unavailable, install a Node.js LTS version compatible with your macOS release, then reopen Terminal. If you already have Python 3, you can also run this dashboard with `python3 -m http.server 8000 --bind 127.0.0.1 --directory dist` from the project folder (Telegram monitoring requires `npm start`, not the Python server).

3. Open <http://127.0.0.1:8000> in your browser. Keep Terminal running while using the dashboard. Press Control-C in Terminal to stop the server.

If port 8000 is busy, run `PORT=8001 npm start` and open the URL printed in Terminal. To edit the source, open the extracted folder in VS Code and refresh the page after making changes.

## Use the dashboard

- Choose **Price action · Breakout + continuation** for candle-based entries. The **EMA crossover · Momentum** strategy has its own journal.
- A breakout setup requires a strong candle close past a confirmed swing and a later retest candle closing on the breakout side. A continuation setup follows a valid retest: a pullback holds the broken level, then another strong candle closes beyond the pullback. Both directions are supported. A completed higher timeframe trend check filters entries (15m→1h, 1h→4h, 4h→1d). Click **Strategy rules** in the dashboard for exact timing and cancellation rules.
- Each price action setup shows a paper entry at the next candle's open, a stop at the retest or pullback wick, TP1 at 1R, and TP2 at 2R. TP1 is a reference; simulated outcomes use TP2 or the stop and expire after 12 candles. No partial exits or trailing stops are simulated.
- Choose a timeframe. **Inspect latest setup → Show on chart** displays the setup and its entry, stop and target.
- The browser fetches public Kraken BTC/USD candles every 30 seconds while the dashboard runs. It uses completed candles to evaluate signals. The included historical snapshots let you explore the charts when live data is unavailable. Live alerts pause in snapshot mode.
- Use the bell to enable alerts and leave the tab open to receive them. Browser notifications need the browser's permission.
- Journal data and preferences are saved in that browser for the local URL. Use the same browser, host and port to revisit the same journal. The hosted website and this local copy have separate browser storage.
- All trade outcomes are simulations using Kraken spot data. Spread, commission and slippage are excluded. MT5 is where you can place your own trades; this dashboard does not connect to or execute trades in MT5.

## Telegram signal monitoring

Telegram monitoring runs in the Node server, so it continues when no browser tab is open. It fetches public Kraken BTC/USD candles independently every 30 seconds and uses the same completed-candle analysis as the dashboard. By default it watches both **Breakout + continuation** and **EMA crossover · Momentum** on 15m, 1h and 4h. It sends only a newly confirmed Buy or Sell paper setup, never a cached dashboard snapshot, incomplete candle, stale response, or historical setup at first startup.

1. In Telegram, open **@BotFather**, send `/newbot`, and follow the prompts. Copy the token it provides.
2. Open a chat with your new bot and send it `/start` (or any message). For a group, add the bot and send a message in that group.
3. Find the chat ID by visiting `https://api.telegram.org/botYOUR_TOKEN/getUpdates` in a browser after you have sent the bot a message. In the JSON response, copy `message.chat.id`. Treat the bot token as a password; do not share that URL or commit it.
4. In Terminal, from this project folder, set the two environment values (replace the examples):

   ```sh
   export TELEGRAM_BOT_TOKEN='123456789:your-BotFather-token'
   export TELEGRAM_CHAT_ID='123456789'
   npm run telegram:test
   npm start
   ```

   `npm run telegram:test` sends a harmless delivery test. `npm start` is the command that keeps the dashboard and monitoring active. Keep that Terminal process running. You may copy `.env.example` as a reminder, but Node does not automatically load `.env`; set values in your shell or use your preferred secret manager. `.env` and the local alert state file are ignored by Git.

Optional configuration: `SIGNAL_TIMEFRAMES=15,60,240` and `SIGNAL_STRATEGIES=price-action,crossover`. The state file `.signal-desk-telegram-state.json` prevents repeat alerts across polling and restarts; do not delete it unless you intentionally want to establish a new silent baseline.

Each message states the strategy, setup, timeframe, direction, candle time in West Africa Time, paper entry, stop, TP1 when applicable and TP2. Prices are **Kraken spot paper levels**, not HFM/MT5 execution prices. This project does not connect to MT5 or place trades.

Monitoring stops when the Node process, Terminal session, or Mac stops or sleeps. For continuous monitoring, run the same Node process on an always-on hosted service or server with persistent storage for the state file, environment-managed Telegram secrets, and a process supervisor/health monitoring.

## Project files

| File | Purpose |
| --- | --- |
| `dist/index.html`, `dist/style.css` | Dashboard structure and appearance |
| `dist/app.mjs` | Market data, journal, UI controls and alerts |
| `dist/price-action.mjs` | Swing, breakout, retest and continuation rules |
| `dist/engine.mjs` | Candle validation, EMA strategy and paper outcomes |
| `dist/chart.mjs` | Candlestick chart and setup overlays |
| `dist/data/`, `dist/fonts/` | Historical candles and bundled fonts |
| `tests/price-action.test.mjs` | Strategy regression tests |
| `serve.mjs` | Local web server for the Mac bundle |
| `telegram-monitor.mjs` | Server-side Kraken polling and Telegram delivery |
| `licenses/` | Font licenses |

## Run the tests

From the project folder, run `npm test`. The tests use bundled market data and mocked Kraken/Telegram responses, so they can run offline.
