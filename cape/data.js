import { OutpostError, nodeQuery, normalizeEvents, normalizeHistory, normalizeHost, post, request, sampleKeys } from './outpost.js';

const initial = {
  servers: [], events: [], rules: [], read: [], monitor: false,
  settings: { theme: 'light', refresh: '15', timezone: 'Asia/Taipei', motion: true, live: true, inbox: true },
  profile: { name: '工作區管理員', email: '' },
};

let preferences;
try { preferences = JSON.parse(localStorage.getItem('cape:preferences:v2') || '{}'); }
catch { preferences = {}; }
let state = {
  ...initial, settings: { ...initial.settings, ...preferences?.settings }, profile: { ...initial.profile, ...preferences?.profile },
  read: Array.isArray(preferences?.read) ? preferences.read : [],
};
const listeners = new Set();
const historyCache = new Map();
const liveHistory = new Map();
let pending;
let generation = 0;
let initialized = false;
let ruleRevision = 0;

function change(patch, metadata) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener(structuredClone(state), metadata));
}

function remember(patch, metadata) {
  change(patch, metadata);
  try {
    const { settings, profile, read } = state;
    localStorage.setItem('cape:preferences:v2', JSON.stringify({ settings, profile, read }));
    return true;
  } catch { return false; }
}

function merged(first, last) {
  const byTime = new Map(first.map(point => [point.time, point]));
  last.forEach(point => {
    const previous = byTime.get(point.time);
    byTime.set(point.time, previous ? { ...previous, ...Object.fromEntries(Object.entries(point).filter(([, value]) => value !== null)) } : point);
  });
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function collect(servers) {
  const cutoff = Date.now() - 65 * 60000;
  for (const host of servers) {
    const snapshot = host.status !== 'offline' && host.lastSeen > 0
      ? [{ time: host.lastSeen, cpu: host.cpu, ram: host.ram, disk: host.disk, rx: host.rx, tx: host.tx,
          rd: null, wr: null, ld: host.raw.load?.[0] ?? null, cn: host.raw.conns ?? null }] : [];
    liveHistory.set(host.id, merged(merged(liveHistory.get(host.id) || [], host.history), snapshot).filter(point => point.time >= cutoff));
  }
  for (const id of liveHistory.keys()) if (!servers.some(node => node.id === id)) liveHistory.delete(id);
}

async function getWorkspace(force = false) {
  const current = generation;
  if (pending) {
    if (!force) return pending;
    await pending.catch(() => {});
    if (current !== generation) throw new DOMException('工作區已關閉', 'AbortError');
    return getWorkspace();
  }
  const revision = ruleRevision;
  pending = (async () => {
    const since = Object.fromEntries(state.servers.flatMap(host => {
      const t = host.history.at(-1)?.time;
      return t ? [[host.id, t / 1000]] : [];
    }));
    const query = Object.keys(since).length ? '?' + new URLSearchParams({ since: JSON.stringify(since) }) : '';
    try {
      const [snapshots, additional] = await Promise.all([
        request('/api/all' + query),
        request('/api/cape/workspace').catch(error => {
          if (error.status === 404) return { rules: [], events: [], monitor: false };
          throw error;
        }),
      ]);
      if (!Array.isArray(snapshots)) throw new OutpostError('哨站回傳的主機資料格式不符。', 502);
      if (generation !== current) throw new DOMException('工作區已關閉', 'AbortError');
      const previous = new Map(state.servers.map(node => [node.id, node]));
      const servers = snapshots.filter(raw => raw && typeof raw === 'object').map(raw => {
        const host = normalizeHost(raw);
        if (raw.hist?.part) host.history = merged(previous.get(host.id)?.history || [], host.history).slice(-360);
        if (!host.history.length && host.status === 'offline') host.history = previous.get(host.id)?.history || [];
        return host;
      });
      collect(servers);
      const events = [...normalizeEvents(servers), ...(additional.events || [])].sort((a, b) => b.time - a.time);
      const patch = { servers, events, rules: revision === ruleRevision ? additional.rules || [] : state.rules, monitor: additional.monitor === true };
      if (initialized) change(patch, { type: 'telemetry' });
      else { state = { ...state, ...patch }; initialized = true; }
      return structuredClone(state);
    } finally { if (generation === current) pending = null; }
  })();
  return pending;
}

async function loadHistory(nodes, range) {
  const upstreamRange = range === '7d' ? '7d' : '24h';
  const current = generation;
  const failures = [];
  await Promise.all(nodes.map(async node => {
    const key = node.id + ':' + upstreamRange;
    const prior = historyCache.get(key);
    if (prior && Date.now() - prior.fetched < 60000) return;
    try {
      const suffix = nodeQuery(node.id);
      const [result, disk] = await Promise.all([
        request('/api/history' + (suffix ? suffix + '&' : '?') + new URLSearchParams({ range: upstreamRange })),
        request('/api/cape/disk-history' + suffix).catch(error => {
          if (error.status === 401) throw error;
          return null;
        }),
      ]);
      if (generation === current) historyCache.set(key, { fetched: Date.now(), points: merged(normalizeHistory(result), normalizeHistory(disk)) });
    } catch (error) { failures.push({ id: node.id, error }); }
  }));
  return failures;
}

export const api = {
  getWorkspace,
  loadHistory,
  clear() {
    generation++;
    pending = null;
    initialized = false;
    state = { ...state, servers: [], events: [], rules: [], monitor: false };
    liveHistory.clear();
    historyCache.clear();
  },
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  async pair(code) { const result = await post('/api/peer', { action: 'add', code }); await getWorkspace(true); return result; },
  async saveServer(fields, id) {
    if (!id) throw new Error('新增主機需要一次性配對碼。');
    await post('/api/rename' + nodeQuery(id), { name: fields.name });
    await getWorkspace(true);
    return { id, durable: true };
  },
  async removeServer(id) {
    if (!id || id === '@self') throw new Error('主控主機無法從工作區移除。');
    await post('/api/peer', { action: 'remove', name: id });
    await getWorkspace(true);
    return true;
  },
  async saveRule(fields, id) {
    const result = await post('/api/cape/rules', { action: 'save', ...fields, id });
    ruleRevision++;
    change({ rules: result.rules });
    return true;
  },
  async toggleRule(id) {
    const result = await post('/api/cape/rules', { action: 'toggle', id });
    ruleRevision++;
    change({ rules: result.rules }, { type: 'rule-toggle', id });
    return true;
  },
  async removeRule(id) {
    const result = await post('/api/cape/rules', { action: 'remove', id });
    ruleRevision++;
    change({ rules: result.rules });
    return true;
  },
  read(ids) { return remember({ read: [...new Set([...state.read, ...ids])].slice(-1000) }); },
  updateSettings(fields) { return remember({ settings: { ...state.settings, ...fields } }, { type: 'settings', keys: Object.keys(fields) }); },
  async saveProfile(profile) { return remember({ profile }); },
};

export const ranges = { '1h': 60, '6h': 360, '24h': 1440, '7d': 10080 };

export function getSamples(servers, range, end) {
  const duration = ranges[range] * 60000;
  const start = end - duration;
  const step = duration / 120;
  const upstreamRange = range === '7d' ? '7d' : '24h';
  const buckets = new Map();
  for (const host of servers) {
    const points = merged(historyCache.get(host.id + ':' + upstreamRange)?.points || [], liveHistory.get(host.id) || host.history || []);
    const hostBuckets = new Map();
    for (const point of points) {
      if (point.time < start || point.time > end) continue;
      const index = Math.min(120, Math.round((point.time - start) / step));
      const bucket = hostBuckets.get(index) || {};
      for (const key of sampleKeys) if (Number.isFinite(point[key])) bucket[key] = point[key];
      hostBuckets.set(index, bucket);
    }
    for (const [index, hostBucket] of hostBuckets) {
      const bucket = buckets.get(index) || {};
      for (const key of Object.keys(hostBucket)) (bucket[key] ||= []).push(hostBucket[key]);
      buckets.set(index, bucket);
    }
  }
  return Array.from({ length: 121 }, (_, index) => {
    const bucket = buckets.get(index) || {};
    return { time: start + step * index, ...Object.fromEntries(sampleKeys.map(key => {
      const values = bucket[key];
      return [key, values?.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
    })) };
  });
}
