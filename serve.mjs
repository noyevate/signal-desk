import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('./dist/', import.meta.url)));
const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be a number from 1 to 65535.');
  process.exit(1);
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf'
};

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const target = await realpath(resolve(root, relative));
    if (!target.startsWith(root + sep)) {
      res.writeHead(404).end();
      return;
    }
    const bytes = await readFile(target);
    res.writeHead(200, {
      'Content-Type': types[extname(target)] ?? 'application/octet-stream',
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404).end();
  }
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE'
    ? 'Port ' + port + ' is already in use. Try PORT=8001 npm start.'
    : err.message);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log('Signal Desk is running at http://' + host + ':' + port + '\nPress Control-C to stop.'));
