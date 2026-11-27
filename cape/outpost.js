const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const bytes = value => Uint8Array.from(value.match(/../g) || [], part => parseInt(part, 16));
const toBase64 = value => btoa(Array.from(new Uint8Array(value), byte => String.fromCharCode(byte)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const fromBase64 = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
const authPaths = { password: '/api/login', pin: '/api/pin-login', passkey: '/api/passkey-login' };

export class OutpostError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.recheck = data.recheck === true;
    this.mustPin = data.mustpin === true;
  }
}

export async function request(path, { body, method = body === undefined ? 'GET' : 'POST', recheck, signal, share, anonymous = false } = {}) {
  if (!path.startsWith('/api/') || path.includes('\\')) throw new TypeError('無效的 API 路徑');
  const headers = { Accept: 'application/json', 'X-Requested-With': '1' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (recheck) headers['X-Recheck'] = toBase64(encoder.encode(JSON.stringify(recheck)));
  if (share) headers['X-Share'] = share;
  let response;
  try {
    response = await fetch(path, { method, headers, credentials: anonymous ? 'omit' : 'same-origin', redirect: 'error', cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(25000) });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new OutpostError('無法連線至哨站，請稍後再試。', 0);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.ok === false) {
    const detail = typeof result?.message === 'string' ? result.message : typeof result?.error === 'string' ? result.error : '';
    throw new OutpostError(detail || (response.status === 401 ? '請登入哨站。' : '哨站無法完成這項操作。'), response.status, result || {});
  }
  return result;
}

export const post = (path, body = {}, options = {}) => request(path, { ...options, body });
export const nodeQuery = id => id && id !== '@self' ? '?' + new URLSearchParams({ node: id }) : '';
export const capabilities = () => post(authPaths.passkey, { action: 'has' });

async function pinHash(pin, salt, iterations) {
  if (!globalThis.crypto?.subtle) throw new Error('請使用 HTTPS 開啟 Cape 以使用 PIN 碼。');
  if (!/^\d{4,8}$/.test(pin) || !/^[0-9a-f]{32,128}$/i.test(salt)
      || !Number.isSafeInteger(iterations) || iterations < 10000 || iterations > 1000000) {
    throw new Error('PIN 碼或驗證資料格式不符。');
  }
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes(salt), iterations, hash: 'SHA-256' }, key, 256));
}

export async function pinProof(pin, path = authPaths.pin) {
  const { salt, n, nonce } = await post(path, { action: 'begin' });
  if (typeof nonce !== 'string' || !nonce || nonce.length > 256) throw new Error('這台主機目前沒有可用的 PIN 碼。');
  const hash = await pinHash(pin, salt, n);
  const key = await crypto.subtle.importKey('raw', encoder.encode(hash), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return { nonce, proof: hex(await crypto.subtle.sign('HMAC', key, encoder.encode(nonce))) };
}

export async function makePin(pin) {
  if (new Set(pin).size === 1 || '0123456789'.includes(pin) || '9876543210'.includes(pin)) throw new Error('請選擇較難猜測的 PIN 碼。');
  if (!globalThis.crypto?.subtle) throw new Error('請使用 HTTPS 開啟 Cape。');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const n = 200000;
  return { salt, n, hash: await pinHash(pin, salt, n) };
}

export async function passkeyProof() {
  if (!globalThis.PublicKeyCredential || !globalThis.isSecureContext) throw new Error('此瀏覽器或網址無法使用通行金鑰。');
  const { challenge, rp } = await post(authPaths.passkey, { action: 'begin' });
  const credential = await navigator.credentials.get({ publicKey: {
    challenge: fromBase64(challenge), rpId: rp, timeout: 120000, userVerification: 'required',
  } });
  if (!credential) throw new Error('通行金鑰驗證未完成。');
  const { clientDataJSON, authenticatorData, signature } = credential.response;
  return { id: toBase64(credential.rawId), clientDataJSON: toBase64(clientDataJSON), authenticatorData: toBase64(authenticatorData), signature: toBase64(signature) };
}

export async function registerPasskey(name, recheck) {
  if (!globalThis.PublicKeyCredential || !globalThis.isSecureContext) throw new Error('此瀏覽器或網址無法使用通行金鑰。');
  const start = await post('/api/passkey', { action: 'begin' }, { recheck });
  const credential = await navigator.credentials.create({ publicKey: {
    challenge: fromBase64(start.challenge), rp: { id: start.rp, name: '岬角 Cape' },
    user: { id: fromBase64(start.user), name: start.name || 'Cape', displayName: start.name || 'Cape' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    timeout: 120000, attestation: 'none',
    authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
    excludeCredentials: (start.exclude || []).map(id => ({ type: 'public-key', id: fromBase64(id) })),
  } });
  if (!credential) throw new Error('通行金鑰登記未完成。');
  const { clientDataJSON, attestationObject } = credential.response;
  return post('/api/passkey', { action: 'finish', name, clientDataJSON: toBase64(clientDataJSON), attestationObject: toBase64(attestationObject) });
}

export async function signIn(method, value, keep) {
  if (!Object.hasOwn(authPaths, method)) throw new TypeError('登入方式不適用。');
  const proof = method === 'pin' ? { pin: await pinProof(value) }
    : method === 'passkey' ? { action: 'finish', ...await passkeyProof() } : { pw: value };
  await post(authPaths[method], { ...proof, keep, dev: '岬角 Cape' });
  if (method !== 'pin') await post('/api/pin', { action: 'login' }).catch(() => {});
}

export function assembleBackup(files) {
  const all = [...files];
  if (!all.length || all.some(file => !file.name.toLowerCase().endsWith('.vsbk'))) throw new Error('請選擇 .vsbk 備份。');
  const parts = all.map(file => [file, /^(.*) 第(\d+)／(\d+)段\.vsbk$/.exec(file.name)]);
  let ordered = all;
  if (parts.some(([, match]) => match) || all.length > 1) {
    const first = parts[0][1];
    if (!first || parts.some(([, match]) => !match || match[1] !== first[1] || match[3] !== first[3])) throw new Error('請一起選擇同一份備份的所有分段。');
    const total = Number(first[3]);
    const byNumber = new Map(parts.map(([file, match]) => [Number(match[2]), file]));
    if (total < 1 || total > 256 || total !== all.length || total !== byNumber.size) throw new Error('備份分段不完整或重複。');
    ordered = Array.from({ length: total }, (_, index) => byNumber.get(index + 1));
    if (ordered.some(file => !file)) throw new Error('缺少備份分段。');
  }
  const result = new Blob(ordered, { type: 'application/octet-stream' });
  if (!result.size || result.size > 1024 ** 3) throw new Error('備份檔大小需在 1 GB 以內。');
  return result;
}

const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const int = value => number(value) == null ? null : Math.round(value);
const mbps = value => number(value) == null ? null : value * 8 / 1e6;
const gb = value => number(value) == null ? null : Math.round(value / 1024 ** 3 * 10) / 10;
const list = value => Array.isArray(value) ? value : [];
const clean = value => typeof value === 'string' ? value : '';
export const sampleKeys = ['cpu', 'ram', 'disk', 'rx', 'tx', 'rd', 'wr', 'ld', 'cn'];

export function normalizeHistory(history) {
  const fields = { cpu: 'cpu', ram: 'mem', disk: 'disk', rx: 'rx', tx: 'tx', rd: 'rd', wr: 'wr', ld: 'ld', cn: 'cn' };
  const byTime = new Map();
  list(history?.t).forEach((time, index) => {
    if (number(time) == null || time <= 0 || time > 8640000000000) return;
    const values = Object.fromEntries(Object.entries(fields).map(([key, field]) => {
      const value = number(history[field]?.[index]);
      return [key, value == null ? null : key === 'rx' || key === 'tx' ? mbps(value) : key === 'rd' || key === 'wr' ? value / 1e6 : value];
    }));
    byTime.set(time, { time: time * 1000, ...values });
  });
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function normalizeHost(raw) {
  const id = clean(raw.node) || '@self';
  const disk = list(raw.disks).find(item => item.path === '/') || list(raw.disks)[0];
  const status = raw.online === false ? 'offline' : raw.level === 'warn' || raw.level === 'bad' ? 'warning' : 'online';
  const hours = Math.floor((number(raw.uptime) ?? 0) / 3600);
  return {
    id, name: clean(raw.name) || id, region: clean(raw.geo?.city) || clean(raw.geo?.country) || '—',
    ip: clean(raw.geo?.ip) || '—', status, cpu: int(raw.cpu), ram: int(raw.mem?.pct), disk: int(disk?.pct),
    rx: mbps(raw.net?.rx), tx: mbps(raw.net?.tx), cores: int(raw.cores), memory: gb(raw.mem?.total), storage: gb(disk?.total),
    os: clean(raw.os) || '—', group: id === '@self' ? '主控主機' : '配對主機',
    uptime: number(raw.uptime) !== null ? Math.floor(hours / 24) + ' 天 ' + hours % 24 + ' 小時' : '—',
    lastSeen: (number(raw.last_seen) ?? number(raw.time) ?? 0) * 1000,
    history: normalizeHistory(raw.hist), raw,
  };
}

const eventKinds = { bad: 'offline', error: 'offline', warn: 'warning', warning: 'warning', ok: 'success', good: 'success', success: 'success' };
export function normalizeEvents(servers) {
  const events = new Map();
  for (const node of servers) {
    for (const event of list(node.raw.events)) {
      if (number(event.t) == null || event.t <= 0 || event.t > 8640000000000 || !clean(event.text)) continue;
      const id = JSON.stringify([node.id, event.t, event.kind, event.text]);
      events.set(id, { id, serverId: node.id, serverName: node.name, kind: eventKinds[event.kind] || 'info',
        title: event.text, detail: event.text, time: event.t * 1000 });
    }
  }
  return [...events.values()].sort((a, b) => b.time - a.time);
}
