import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, pbkdf2Sync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleBackup, normalizeEvents, normalizeHistory, normalizeHost, pinProof } from '../outpost.js';
import { createCapeServer } from '../server.mjs';
import { makeRuleStore } from '../rules-store.mjs';
import { fixture, guestCookie, listen, sessionCookie, testShare } from './fixture.mjs';

const write = (base, path, body, cookie, extra = {}) => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': '1',
    ...(cookie && { Cookie: cookie }), ...extra }, body: JSON.stringify(body),
});
const read = (base, path, cookie, extra = {}) => fetch(base + path, {
  headers: { ...(cookie && { Cookie: cookie }), ...extra },
});

test('normalizes Outpost v5.58 statuses and missing metrics without synthesizing samples', () => {
  const raw = { node: '', name: '主控', online: true, level: 'warn', time: 123,
    cpu: 25.9, mem: { pct: 55, total: 8 * 1024 ** 3 }, disks: [{ path: '/', pct: 9 }],
    net: { rx: 1000000, tx: 500000 }, events: [{ t: 123, kind: 'bad', text: '事件' }],
    hist: { t: [121, 122], cpu: [10, 25], mem: [40, 42], rx: [500000], rd: [2000000] } };
  const host = normalizeHost(raw);
  assert.deepEqual([host.id,host.status,host.cpu,host.ram,host.disk,host.rx,host.tx,host.memory], ['@self','warning',26,55,9,8,4,8]);
  assert.equal(host.history[0].rd, 2);
  assert.equal(host.history[1].rx, null);
  assert.equal(host.history[1].disk, null);
  assert.equal(normalizeEvents([host,host])[0].time, 123000);
  assert.equal(normalizeEvents([host,host]).length, 1);
  assert.equal(normalizeHost({ online: false }).cpu, null);
  assert.deepEqual(normalizeHistory({ t: ['invalid', -1] }), []);
});

test('PIN challenge matches the archived PBKDF2/HMAC contract', async () => {
  const original = globalThis.fetch;
  const salt = '00112233445566778899aabbccddeeff';
  const nonce = 'aabb0011';
  globalThis.fetch = async (_, options) => {
    assert.deepEqual(JSON.parse(options.body), { action: 'begin' });
    assert.equal(options.credentials, 'same-origin');
    return Response.json({ nonce, salt, n: 200000 });
  };
  try {
    const k = pbkdf2Sync('871029', Buffer.from(salt,'hex'), 200000, 32, 'sha256').toString('hex');
    assert.deepEqual(await pinProof('871029'), { nonce, proof: createHmac('sha256',k).update(nonce).digest('hex') });
  } finally { globalThis.fetch = original; }
});

test('orders complete split backups and refuses missing or duplicate parts', async () => {
  const first = new File(['一'], '主機 第1／2段.vsbk');
  const second = new File(['二'], '主機 第2／2段.vsbk');
  assert.equal(await assembleBackup([second, first]).text(), '一二');
  assert.throws(() => assembleBackup([first]), /分段/);
  assert.throws(() => assembleBackup([first,first]), /分段/);
  assert.throws(() => assembleBackup([new File(['test'],'unknown.txt')]), /\.vsbk/);
});

test('gateway uses an allowlist and refuses to substitute sample hosts without an upstream', async t => {
  const server = createCapeServer();
  const url = await listen(server);
  t.after(() => new Promise(resolve => server.close(resolve)));
  const page = await read(url, '/cape/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await read(url, '/cape/outpost.js')).status, 200);
  for (const path of ['/data.js/../package.json','/.cape-data/workspace.json','/api/cloud-ticket','/api/ab-probe']) {
    assert.equal((await read(url, path)).status, 404);
  }
  assert.equal((await read(url,'/api/all')).status,503);
});

test('user authentication, pairing, history, scope, and native second-factor errors through the gateway', async t => {
  const { url, calls, close } = await fixture();
  t.after(close);
  assert.equal((await read(url, '/api/all')).status, 401);
  assert.equal((await read(url, '/api/cape/workspace', undefined, {'X-Token':'fixture-sampler'})).status, 401);
  assert.equal((await write(url, '/api/cape/rules', {action:'remove',id:'anything'}, undefined)).status,401);
  assert.equal((await write(url,'/api/login',{pw:'wrong'})).status,401);
  const login = await write(url, '/api/login', { pw: 'cape-fixture' });
  assert.equal(login.status,200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await read(url, '/api/all', sessionCookie, {'X-Token':'must-not-forward'})).status, 200);
  assert.equal(calls.at(-1).headers['x-token'], undefined);
  assert.equal((await write(url,'/api/peer',{action:'add',code:'VS-fixture'},sessionCookie, {Origin:'https://foreign.example'})).status,403);
  assert.equal((await write(url,'/api/peer',{action:'add',code:'VS-fixture'},sessionCookie, {'X-Requested-With':'0'})).status,403);
  assert.equal((await write(url,'/api/peer',{action:'add',code:'VS-fixture'},sessionCookie)).status,200);
  assert.equal((await (await read(url,'/api/all',sessionCookie)).json()).length,7);
  const hist = await read(url,'/api/history?node=api-tok-01&range=7d',sessionCookie);
  assert.equal(hist.status,200);
  assert.ok((await hist.json()).t.length > 5);
  assert.equal(calls.at(-1).query.get('node'),'api-tok-01');
  const invalid = {action:'save', name:'測試', metric:'cpu', threshold:85, duration:5, serverId:'wrong-host'};
  assert.equal((await write(url,'/api/cape/rules',invalid,sessionCookie)).status,400);
  const saved = await write(url,'/api/cape/rules',{...invalid,serverId:'@self'},sessionCookie);
  assert.equal(saved.status,200);
  const { rules:[rule] } = await saved.json();
  assert.equal((await write(url,'/api/cape/rules',{action:'toggle',id:rule.id},sessionCookie)).status,200);
  assert.equal((await (await read(url,'/api/cape/workspace',sessionCookie)).json()).rules[0].enabled,false);
  const denied = await write(url,'/api/telegram',{action:'save',chat:'testing'},sessionCookie);
  assert.equal(denied.status,403);
  assert.equal((await denied.json()).recheck,true);
  assert.equal((await write(url,'/api/telegram',{action:'save',chat:'testing'},sessionCookie, {'X-Recheck':'test-only'})).status,200);
  const download = await read(url,'/api/backup-file',sessionCookie);
  assert.match(download.headers.get('content-disposition'),/attachment/);
  assert.equal(await download.text(),'fixture backup');
  assert.equal((await write(url,'/api/sessions',{action:'out'},sessionCookie)).status,200);
  assert.equal((await read(url,'/api/cape/workspace',sessionCookie)).status,401);
});

test('server-side rule state persists, honors duration and resets after recovery or missing observations', async t => {
  const directory = await mkdtemp(join(tmpdir(),'cape-rule-test-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const file = join(directory,'rules.json');
  const store = makeRuleStore(file);
  const hosts = new Set(['@self']);
  const [rule] = await store.mutate({action:'save',name:'高 CPU',metric:'cpu',threshold:60,duration:1,serverId:'@self'},hosts);
  const node = { id:'@self',name:'維運',status:'online',cpu:80,disk:50 };
  const now = Date.now();
  assert.equal((await store.evaluate([node],now)).events.length,0);
  assert.equal((await store.evaluate([node],now+59000)).events.length,0);
  assert.equal((await store.evaluate([node],now+60000)).events.length,1);
  assert.equal((await store.evaluate([node],now+70000)).events.length,1);
  await store.evaluate([{...node,cpu:0}],now+71000);
  assert.equal((await store.evaluate([node],now+72000)).events.length,1);
  assert.equal((await store.evaluate([node],now+172000)).events.length,1);
  assert.equal((await store.evaluate([node],now+232000)).events.length,2);
  await store.mutate({action:'toggle',id:rule.id});
  const restored = await makeRuleStore(file).snapshot();
  assert.equal(restored.rules[0].enabled,false);
  assert.equal(restored.events.length,2);
  assert.ok(restored.disk['@self'].length);
});

test('preserves flight admission and isolates album guest cookies from admin cookies', async t => {
  const { url, calls, close } = await fixture();
  t.after(close);
  const album = '/a/Ab123cd456';
  assert.match(await (await read(url,album)).text(), /album-guest\.js/);
  assert.equal((await read(url,album+'/m')).status,401);
  const unlock = await write(url,album+'/open',{pw:'album-fixture'});
  assert.equal(unlock.status,200);
  assert.match(unlock.headers.get('set-cookie'), /Path=\/a\/Ab123cd456; HttpOnly/);
  assert.equal((await read(url,album+'/m',guestCookie+'; '+sessionCookie)).status,200);
  assert.equal(calls.at(-1).headers.cookie,guestCookie);
  assert.equal((await read(url,album+'/i/123456abcdef/o',guestCookie)).status,403);
  assert.equal((await read(url,'/api/cape/workspace',guestCookie)).status,401);
  const claim = await write(url,'/api/fly-claim',{code:testShare});
  assert.equal(claim.status,200);
  const { dev } = await claim.json();
  assert.equal((await read(url,'/api/flights?ap=TPE',undefined,{'X-Share':testShare+':'+dev})).status,200);
  assert.equal((await read(url,'/api/all',undefined,{'X-Share':testShare+':'+dev})).status,401);
  assert.equal(calls.at(-1).headers['x-share'],undefined);
});
