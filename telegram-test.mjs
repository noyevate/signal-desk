import { monitorConfig, TelegramSignalMonitor } from './telegram-monitor.mjs';

try {
  const config = monitorConfig();
  if (!config.enabled) throw Error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID before sending a test message.');
  const monitor = new TelegramSignalMonitor(config);
  await monitor.send('Signal Desk Telegram test: delivery is working. No trade was placed.');
  console.log('Telegram test message sent.');
} catch (error) {
  console.error('Telegram test failed: ' + error.message);
  process.exitCode = 1;
}
