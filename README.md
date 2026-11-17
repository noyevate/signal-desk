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

   The launcher uses Node.js 18 or newer and its built-in modules. No package installation, API key, or configuration file is required. If `node` or `npm` is unavailable, install a Node.js LTS version compatible with your macOS release, then reopen Terminal. If you already have Python 3, you can also run this dashboard with `python3 -m http.server 8000 --bind 127.0.0.1 --directory dist` from the project folder.

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
| `licenses/` | Font licenses |

## Run the tests

From the project folder, run `npm test`. The tests use bundled market data and can run offline.
