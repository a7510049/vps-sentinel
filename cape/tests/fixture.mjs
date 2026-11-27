import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCapeServer } from '../server.mjs';

export const sessionCookie = 'vs_sess=vss_0123456789abcdefghijklmnopqrstuv';
export const guestCookie = 'vsa_abcdef123456=test-guest-cookie';
export const testShare = 'fs_Ab12cd34';
const guestAlbum = '/a/Ab123cd456';
const flightTicket = 'fixture-flight-device-01';
const thumbnail = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64');
const tick = Math.floor(Date.now() / 1000);
const day = 86400;
const cpu = [24,38,53,16,28,18];
const ram = [48,61,86,32,39,42];
const disk = [37,42,74,23,30,31];
const regions = ['台北','東京','新加坡','舊金山','台北','法蘭克福'];
const ids = ['edge-tpe-01','api-tok-01','db-sgp-01','worker-sfo-01','cache-tpe-01','staging-fra-01'];
const ip = ['203.0.113.12','198.51.100.28','192.0.2.46','198.51.100.83','203.0.113.32','192.0.2.93'];
const kinds = ['warning','bad','ok','info','ok'];
const titles = ['記憶體使用率偏高','伺服器連線中斷','備份已完成','監控代理已更新','伺服器已恢復連線'];
const eventHost = [2,5,0,1,3];
const eventAge = [240,1380,3360,6120,day + 10800];
const salt = '00112233445566778899aabbccddeeff';

function history(index, seconds = 1800) {
  const points = Math.floor(seconds / (seconds > day ? 1800 : seconds === day ? 300 : 10));
  const t = Array.from({ length: points }, (_, at) => tick - seconds + Math.round(seconds / points * (at + 1)));
  return {
    t, cpu: t.map((_, at) => cpu[index] + 6 * Math.sin(at / 3)),
    mem: t.map((_, at) => ram[index] + 4 * Math.cos(at / 5)),
    rx: t.map((_, at) => 2000000 + at * 367), tx: t.map((_, at) => 1000000 + at * 532),
    rd: t.map(() => 1250000), wr: t.map(() => 1750000), ld: t.map(() => 1.1), cn: t.map(() => 48),
  };
}

export function fakeOutpost() {
  const calls = [];
  let signedIn = false;
  const hosts = ids.map((name, at) => ({
    name, node: at ? name : '', geo: { city: regions[at], ip: ip[at] }, os: 'Ubuntu 24.04', version: '5.58',
    online: at !== 5, level: at === 2 ? 'warn' : 'ok', time: tick, cpu: cpu[at], cores: 4, uptime: 14 * day,
    mem: { pct: ram[at], total: 8 * 1024 ** 3 }, disks: [{ path: '/', pct: disk[at], total: 120 * 1024 ** 3 }],
    net: { rx: 3000000, tx: 1000000 }, services: [{ name: 'ssh', state: 'active' }], containers: [], top: [{ name: 'sshd', cpu: 2, rss: 1000000 }],
    traffic: { used: 1200000, limit: 20000000000, daily: [{ d: '11/27', rx: 1000000, tx: 200000 }] },
    up30: [null, 98, 100], hist: at === 5 ? null : history(at),
    events: eventHost.flatMap((host, index) => host !== at ? [] : [{ t: tick - eventAge[index], kind: kinds[index], text: titles[index] }]),
    links: [], load: [1.1], conns: 48, cpum: 'Test vCPU', cloud: { pct: 12 },
  }));
  const backend = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    let body = {};
    if (raw.length && req.headers['content-type']?.startsWith('application/json')) body = JSON.parse(raw);
    calls.push({ path, query: url.searchParams, body, headers: req.headers });
    const send = (status, data, headers = {}) => res.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(data));
    if (path === '/a/sw.js') {
      res.writeHead(200, { 'Content-Type':'text/javascript' });
      return res.end('self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));');
    }
    if (path === guestAlbum + '/open') {
      return body.pw === 'album-fixture' ? send(200, { ok: true }, { 'Set-Cookie': guestCookie + '; Path=' + guestAlbum + '; HttpOnly; SameSite=Strict' })
        : send(401, { ok: false, message: '密碼不對' });
    }
    if (path.startsWith(guestAlbum + '/')) {
      if (req.headers.cookie !== guestCookie) return send(401, { ok: false, pw: true });
      if (path === guestAlbum + '/m') return send(200, { ok: true, name: 'Cape 測試相簿', dl: 0,
        photos: [{ i: '123456abcdef', n: '山景', w: 1920, h: 1080 }, { i: '234567abcdef', n: '海邊', w: 1920, h: 1080 }] });
      if (path.endsWith('/o')) return send(403, { ok:false });
      if (path.includes('/i/')) {
        res.writeHead(200, { 'Content-Type':'image/png' });
        return res.end(thumbnail);
      }
    }
    if (path === '/api/fly-claim') {
      return body.code === testShare ? send(200, { ok: true, dev: flightTicket, left: 7200, ap: 'TPE' }) : send(403, { ok: false, error: '連結已失效' });
    }
    if (path === '/api/flights' && req.headers['x-share'] === testShare + ':' + flightTicket) {
      return send(200, { ok:true, ap:{ name:'桃園' }, dep:[{ id:'BR887' }] });
    }
    if (path === '/api/passkey-login' && body.action === 'has') return send(200, { has: false, pin: true, temp: false });
    if (path === '/api/pin-login' && body.action === 'begin') return send(200, { pin: true, salt, n: 200000, nonce: '0123456789abcdef' });
    if (path === '/api/login' || path === '/api/pin-login') {
      if (body.pw !== 'cape-fixture' && !/^[a-f0-9]{64}$/.test(body.pin?.proof || '')) return send(401, { ok: false, message: '密碼不對，再試一次' });
      signedIn = true;
      return send(200, { ok: true, token: sessionCookie.split('=')[1] }, { 'Set-Cookie': sessionCookie + '; Path=/; HttpOnly; SameSite=Strict' });
    }
    const admin = req.headers.cookie === sessionCookie && signedIn;
    if (!admin && !(path === '/api/all' && req.headers['x-token'] === 'fixture-sampler')) return send(401, { error: '密碼錯誤' });
    if (path === '/api/all' || path === '/api/status') return send(200, path === '/api/all' ? hosts : hosts[0]);
    if (path === '/api/history') return send(200, history(Math.max(0, ids.indexOf(url.searchParams.get('node'))), url.searchParams.get('range') === '7d' ? 7 * day : day));
    if (path === '/api/sessions') {
      if (body.action === 'out') {
        signedIn = false;
        return send(200, { ok: true, list: [] }, { 'Set-Cookie': 'vs_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' });
      }
      return send(200, { ok: true, list: [{ id: 'fixture-device', dev: 'Cape Browser', me: true, seen: tick }] });
    }
    if (path === '/api/pin') return send(200, { ok: true, on: true, temp: false });
    if (path === '/api/passkey') return send(200, { ok: true, keys: [] });
    if (path === '/api/peer' && body.action === 'add' && body.code === 'VS-fixture') {
      const extra = { ...hosts[0], name: 'qa-new', node: 'qa-new', online: false, hist: null, events: [] };
      if (!hosts.some(host => host.node === extra.node)) hosts.push(extra);
      return send(200, { ok: true });
    }
    if (path === '/api/peer' && body.action === 'remove') {
      const index = hosts.findIndex(host => host.node === body.name);
      if (index > 0) hosts.splice(index, 1);
      return send(200, { ok: true });
    }
    if (path === '/api/rename') {
      const target = hosts.find(host => host.node === (url.searchParams.get('node') || ''));
      if (!target) return send(404, { ok:false });
      target.name = body.name;
      return send(200, { ok: true });
    }
    if (path === '/api/backup' && req.method === 'GET') return send(200, { on: true, last: { t: tick } });
    if (path === '/api/backup-file') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="test.vsbk"' });
      return res.end('fixture backup');
    }
    if (path === '/api/restore-upload') return send(200, { ok: raw.length > 0 });
    if (path === '/api/telegram' && body.action === 'save' && !req.headers['x-recheck']) return send(403, { ok: false, recheck: true, message: '要先確認是你' });
    if (path === '/api/flights') {
      if (url.searchParams.has('geo')) return send(200, { ok:true, coast:'M0 0L10 20L20 0Z' });
      return send(200, { ok:true, ap:{ name:'桃園' }, dep:[{ id:'BR887', x:10, y:15, alt:2500, gs:148 }] });
    }
    if (path === '/api/fly-share') {
      return body.op === 'list' || body.op === 'del' ? send(200, { ok: true, list: [] }) : send(200, { ok:true, code:testShare });
    }
    const tools = {
      '/api/telegram': { on: true, chat: 'test', keep: 6 },
      '/api/pair-admin': { keys: [], code: 'VS-fixture' },
      '/api/self': { has: false, cloud: { has: false } },
      '/api/sec': { sec: { sshpw: true, guard: true, autoupd: true } },
      '/api/download': { list: [] },
      '/api/notes': { on: false, user: 'notes' },
      '/api/adblock': { on: false, doh: '' },
      '/api/album': { list: [] },
      '/api/opensky': { on: false },
      '/api/reboot': { mode: 'tg' },
      '/api/cloud-open': { ticket: 'test-ticket', login: 'https://outpost.example/cloud-sso' },
      '/api/adguard-open': { ticket: 'test-ticket', login: 'https://outpost.example/adguard-sso' },
      '/api/update': {}, '/api/traffic': {}, '/api/links': {}, '/api/backup': {}, '/api/restore-run': {},
    };
    if (Object.hasOwn(tools, path)) return send(200, { ok: true, ...tools[path] });
    return send(404, { error: '找不到服務' });
  });
  return { backend, calls };
}

export async function listen(server, port = 0) {
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
}

export async function fixture(port) {
  const { backend, calls } = fakeOutpost();
  const upstream = await listen(backend);
  const directory = await mkdtemp(join(tmpdir(), 'cape-tests-'));
  const server = createCapeServer({ outpostUrl: upstream, dataDir: directory });
  const url = await listen(server, port);
  return { url, calls, async close() {
    await Promise.all([server, backend].map(instance => new Promise(resolve => instance.close(resolve))));
    await rm(directory, { recursive: true, force: true });
  } };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const service = await fixture(Number(process.env.CAPE_TEST_PORT || 4196));
  console.log('Cape test fixture ' + service.url);
}
