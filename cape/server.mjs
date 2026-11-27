import { createServer, request as http } from 'node:http';
import { request as https } from 'node:https';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeRuleStore, RuleError } from './rules-store.mjs';
import { normalizeHost } from './outpost.js';

const assets = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/album-guest.js', ['album-guest.js', 'text/javascript']],
  ...['app', 'data', 'icons', 'chart', 'outpost'].map(name => [`/${name}.js`, [`${name}.js`, 'text/javascript']]),
]);
const getPaths = new Set(['/api/status', '/api/all', '/api/history', '/api/backup', '/api/backup-file', '/api/restore', '/api/flights']);
const postPaths = new Set([
  '/api/login', '/api/pin-login', '/api/passkey-login', '/api/pin', '/api/passkey', '/api/sessions', '/api/peer', '/api/pair-admin',
  '/api/rename', '/api/traffic', '/api/telegram', '/api/links', '/api/self', '/api/update', '/api/reboot', '/api/backup', '/api/restore-upload',
  '/api/restore-run', '/api/download', '/api/sec', '/api/notes', '/api/album', '/api/adblock', '/api/adblock-profile',
  '/api/opensky', '/api/cloud-open', '/api/adguard-open', '/api/keepalive', '/api/fly-share', '/api/fly-claim',
]);
const security = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-origin',
};
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https:";
const signedSession = cookie => (cookie || '').split(';').map(part => part.trim()).find(part => /^vs_sess=vss_[\w-]{16,300}$/.test(part)) || '';
const json = (response, status, value) => response.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(value));

function origin(value, label) {
  if (!value) return null;
  const link = new URL(value);
  if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password || link.pathname !== '/' || link.search || link.hash) {
    throw new Error(label + ' must be an HTTP(S) origin');
  }
  return link;
}

function proxy(upstream, path, method, publicOrigin, headers = {}) {
  const connect = upstream.protocol === 'https:' ? https : http;
  return connect(upstream, {
    path, method, headers: { ...headers, Host: publicOrigin.host, 'X-Forwarded-Proto': publicOrigin.protocol.slice(0, -1) },
  });
}

function boundedJSON(upstream, path, publicOrigin, { cookie, token, body } = {}) {
  return new Promise((resolve, reject) => {
    const encoded = body == null ? null : JSON.stringify(body);
    const headers = { Accept: 'application/json', 'X-Requested-With': '1' };
    if (cookie) headers.Cookie = cookie;
    if (token) headers['X-Token'] = token;
    if (encoded) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(encoded);
    }
    const req = proxy(upstream, path, encoded ? 'POST' : 'GET', publicOrigin, headers);
    req.setTimeout(12000, () => req.destroy(new Error('Timed out')));
    req.on('error', reject);
    req.on('response', async response => {
      try {
        if (response.statusCode !== 200) { response.resume(); throw new RuleError('無法驗證哨站工作區。', response.statusCode === 401 ? 401 : 502); }
        const parts = [];
        let total = 0;
        for await (const part of response) {
          total += part.length;
          if (total > 12 * 1024 * 1024) throw new Error('Upstream response is too large');
          parts.push(part);
        }
        resolve(JSON.parse(Buffer.concat(parts)));
      } catch (error) { reject(error); }
    });
    req.end(encoded || undefined);
  });
}

async function readJSON(request) {
  const length = Number(request.headers['content-length']);
  if (!Number.isSafeInteger(length) || length < 2 || length > 8192 || request.headers['transfer-encoding']) {
    throw new RuleError('請求大小不合法。', 413);
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw new RuleError('請求需使用 JSON。', 415);
  const chunks = [];
  for await (const data of request) chunks.push(data);
  try {
    const result = JSON.parse(Buffer.concat(chunks));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw new RuleError('請求格式不合法。'); }
}

export function createCapeServer({ outpostUrl, publicUrl, monitorToken, dataDir, log = console } = {}) {
  const upstream = origin(outpostUrl, 'OUTPOST_URL');
  const configured = origin(publicUrl, 'CAPE_PUBLIC_ORIGIN');
  const store = makeRuleStore(resolve(dataDir || '.cape-data', 'workspace.json'));
  const diskRetention = 7 * 86400000;
  const monitor = Boolean(upstream && monitorToken);
  let health = 0;
  let tickRunning = false;
  let timer;

  const server = createServer(async (req, res) => {
    let host;
    let url;
    try {
      if (!req.headers.host || req.url[0] !== '/' || req.url.startsWith('//') || req.url.includes('\\')) throw new Error();
      host = origin('http://' + req.headers.host, 'Host');
      url = new URL(req.url, host);
    } catch { return json(res, 400, { error: '請求網址不合法。' }); }
    const publicOrigin = configured || host;
    if (configured && configured.host !== host.host) return json(res, 421, { error: '請使用設定的 Cape 網址。' });
    const path = url.pathname;
    const method = req.method;
    if (path === '/cape' && method === 'GET') return res.writeHead(308, { ...security, Location: '/cape/' }).end();
    const albumPage = /^\/a\/[a-z0-9]{10}$/i.test(path);
    const asset = albumPage ? ['album-guest.html', 'text/html'] : assets.get(path.startsWith('/cape/') ? path.slice(5) : path);
    if (asset && (method === 'GET' || method === 'HEAD')) {
      try {
        const [file, mime] = asset;
        const bytes = await readFile(new URL(file, import.meta.url));
        res.writeHead(200, { ...security, 'Content-Security-Policy': csp, 'Content-Type': mime + '; charset=utf-8' });
        return res.end(method === 'HEAD' ? undefined : bytes);
      } catch { return json(res, 500, { error: '無法載入介面檔案。' }); }
    }

    const cape = path === '/api/cape/workspace' && method === 'GET' ||
      path === '/api/cape/disk-history' && method === 'GET' || path === '/api/cape/rules' && method === 'POST';
    const albumProtocol = method === 'GET' && (path === '/a/sw.js' || /^\/a\/[a-z0-9]{10}\/(?:m|k|music|i\/[a-f0-9]{12}\/[slqovmaxdy])$/i.test(path))
      || method === 'POST' && /^\/a\/[a-z0-9]{10}\/(?:open|talk|snap)$/i.test(path);
    const proxied = method === 'GET' && getPaths.has(path) || method === 'POST' && postPaths.has(path) || albumProtocol;
    if (!cape && !proxied) return json(res, 404, { error: '找不到服務。' });
    if (!upstream) return json(res, 503, { error: '尚未設定哨站連線。' });
    if (method === 'POST' && (req.headers['x-requested-with'] !== '1'
      || req.headers.origin && req.headers.origin !== publicOrigin.origin
      || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site']))) {
      return json(res, 403, { error: '請從 Cape 工作區送出操作。' });
    }
    const cookie = signedSession(req.headers.cookie);
    if (cape) {
      try {
        if (!cookie) throw new RuleError('請登入哨站。', 401);
        const session = await boundedJSON(upstream, '/api/sessions', publicOrigin, { cookie, body: { action: 'list' } });
        if (!Array.isArray(session.list) || !session.list.some(device => device.me === true)) throw new RuleError('登入工作階段已失效。', 401);
        if (path === '/api/cape/rules') {
          const fields = await readJSON(req);
          const snapshots = fields.action === 'save' && fields.serverId
            ? await boundedJSON(upstream, '/api/all', publicOrigin, { cookie }) : [];
          if (!Array.isArray(snapshots)) throw new RuleError('無法讀取主機。', 502);
          const hosts = new Set(snapshots.map(item => item.node || '@self'));
          return json(res, 200, { ok: true, rules: await store.mutate(fields, hosts) });
        }
        const snapshot = await store.snapshot();
        if (path === '/api/cape/disk-history') {
          const id = url.searchParams.get('node') || '@self';
          const stored = Object.hasOwn(snapshot.disk, id) ? snapshot.disk[id] : [];
          const points = stored.filter(([time]) => time >= Date.now() - diskRetention);
          return json(res, 200, { t: points.map(([time]) => time / 1000), disk: points.map(([, disk]) => disk) });
        }
        return json(res, 200, { rules: snapshot.rules, events: snapshot.events, monitor: monitor && Date.now() - health < 90000 });
      } catch (error) {
        return json(res, error instanceof RuleError ? error.status : 503, { error: error instanceof RuleError ? error.message : '暫時無法讀取 Cape 工作區。' });
      }
    }

    const contentLength = Number(req.headers['content-length'] || 0);
    const limit = path === '/api/restore-upload' ? 1024 ** 3 : 512 * 1024;
    if (method === 'POST' && (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > limit || req.headers['transfer-encoding'])) {
      return json(res, 413, { error: '請求大小不合法。' });
    }
    const headers = { Accept: req.headers.accept || 'application/json' };
    if (albumProtocol) {
      headers.Cookie = (req.headers.cookie || '').split(';').map(part => part.trim())
        .filter(part => /^vsa[a-z]*_[a-z0-9]+=[A-Za-z0-9._~-]+$/i.test(part)).join('; ');
      for (const key of ['range','sec-fetch-site','sec-fetch-mode','sec-fetch-dest']) if (req.headers[key]) headers[key] = req.headers[key];
    } else if (cookie) headers.Cookie = cookie;
    if (path === '/api/flights' && /^fs_[a-z0-9]{8}:[\w-]{16,160}$/i.test(req.headers['x-share'] || '')) {
      headers['X-Share'] = req.headers['x-share'];
    }
    for (const key of ['content-type', 'content-length', 'origin', 'x-requested-with', 'x-recheck', 'x-restore-code']) {
      if (req.headers[key]) headers[key] = req.headers[key];
    }
    const outbound = proxy(upstream, path + url.search, method, publicOrigin, headers);
    outbound.setTimeout(path.startsWith('/api/backup') || path.startsWith('/api/restore') ? 600000 : 25000, () => outbound.destroy());
    outbound.on('error', () => {
      if (!res.headersSent) json(res, 502, { error: '暫時無法連線至哨站。' });
      else res.destroy();
    });
    outbound.on('response', response => {
      const output = { ...security };
      for (const key of ['content-type', 'content-length', 'content-disposition', 'set-cookie','content-range','accept-ranges','x-alb-e','x-alb-t']) {
        if (response.headers[key]) output[key] = response.headers[key];
      }
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        return json(res, 502, { error: '哨站送出意外重新導向。' });
      }
      res.writeHead(response.statusCode, output);
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    res.on('close', () => { if (!res.writableEnded) outbound.destroy(); });
    req.pipe(outbound);
  });

  async function sample() {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const raw = await boundedJSON(upstream, '/api/all', configured || upstream, { token: monitorToken });
      if (!Array.isArray(raw) || !raw.length) throw new Error('Invalid snapshot');
      await store.evaluate(raw.filter(item => item && typeof item === 'object').map(normalizeHost));
      health = Date.now();
    } catch {
      if (health !== -1) log.warn('Cape alert collector could not sample Outpost.');
      health = -1;
    } finally { tickRunning = false; }
  }
  server.on('listening', () => {
    if (monitor) { void sample(); timer = setInterval(sample, 30000); timer.unref(); }
  });
  server.on('close', () => clearInterval(timer));
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 4173);
  const server = createCapeServer({
    outpostUrl: process.env.OUTPOST_URL, publicUrl: process.env.CAPE_PUBLIC_ORIGIN,
    monitorToken: process.env.OUTPOST_MONITOR_TOKEN, dataDir: process.env.CAPE_DATA_DIR,
  });
  const socket = process.env.CAPE_SOCKET;
  if (socket) server.listen(socket, () => console.log('Cape 規則服務已啟動'));
  else server.listen(port, '127.0.0.1', () => console.log(`Cape http://127.0.0.1:${port}`));
}
