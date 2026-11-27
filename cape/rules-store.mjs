import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const metrics = new Set(['cpu', 'ram', 'disk', 'rx', 'tx', 'offline']);
const numeric = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const fresh = () => ({ rules: [], events: [], disk: {} });
const DAY = 86400000;
const BUCKET = 5 * 60000;
const timeout = 90000;

export class RuleError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function asRule(input, previous) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const scope = input.serverId;
  const type = input.metric;
  if (!name || name.length > 48 || !metrics.has(type) || typeof scope !== 'string' || scope.length > 256 ||
      !Number.isInteger(input.duration) || !numeric(input.duration, 1, 1440) ||
      (type !== 'offline' && !numeric(input.threshold, 1, type === 'rx' || type === 'tx' ? 1000000 : 100))) {
    throw new RuleError('請確認規則名稱、監控範圍、門檻與持續時間。');
  }
  return { id: previous?.id || randomUUID(), name, serverId: scope, metric: type,
    threshold: type === 'offline' ? 0 : input.threshold, duration: input.duration, enabled: previous?.enabled ?? true };
}

export function makeRuleStore(file) {
  let state = fresh();
  let queued = Promise.resolve();
  const conditions = new Map();
  const loaded = readFile(file, 'utf8').then(text => {
    const saved = JSON.parse(text);
    if (!Array.isArray(saved.rules) || !Array.isArray(saved.events) || !saved.disk || typeof saved.disk !== 'object') {
      throw new Error('Cape rule store has invalid data');
    }
    state = saved;
  }, error => { if (error.code !== 'ENOENT') throw error; });
  loaded.catch(() => {});

  function transaction(fn) {
    const next = queued.then(async () => {
      await loaded;
      const updated = structuredClone(state);
      if (fn(updated)) {
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        const staging = file + '.next';
        await writeFile(staging, JSON.stringify(updated), { encoding: 'utf8', mode: 0o600 });
        await rename(staging, file);
        state = updated;
      }
      return structuredClone(state);
    });
    queued = next.catch(() => {});
    return next;
  }

  return {
    snapshot: () => transaction(() => false),
    async mutate(payload, scopeExists) {
      const action = payload.action;
      const result = await transaction(next => {
        const index = next.rules.findIndex(rule => rule.id === payload.id);
        const previous = next.rules[index];
        if (action !== 'save' && action !== 'toggle' && action !== 'remove') throw new RuleError('未知的規則動作。');
        if ((payload.id || action !== 'save') && !previous) throw new RuleError('找不到這條警報規則。', 404);
        if (action === 'save') {
          const saved = asRule(payload, previous);
          if (saved.serverId && !scopeExists?.has(saved.serverId)) throw new RuleError('監控範圍已變更，請重新選擇主機。');
          if (next.rules.some(rule => rule.id !== saved.id && rule.name.toLowerCase() === saved.name.toLowerCase())) {
            throw new RuleError('已有同名警報規則。', 409);
          }
          if (!previous && next.rules.length >= 100) throw new RuleError('已達工作區的規則數量上限。');
          if (previous) next.rules[index] = saved;
          else next.rules.push(saved);
        }
        if (action === 'toggle') previous.enabled = !previous.enabled;
        if (action === 'remove') next.rules.splice(index, 1);
        return true;
      });
      return result.rules;
    },
    async evaluate(servers, now = Date.now()) {
      const sampler = new Map(conditions);
      const result = await transaction(next => {
        let changed = false;
        const valid = new Set();
        const t = Math.floor(now / BUCKET) * BUCKET;
        const hosts = new Set(servers.map(host => host.id));
        for (const host of Object.keys(next.disk)) {
          if (!hosts.has(host)) { delete next.disk[host]; changed = true; }
        }
        for (const host of servers) {
          if (host.status === 'offline' || !numeric(host.disk, 0, 100)) continue;
          const points = Object.hasOwn(next.disk, host.id) ? next.disk[host.id] : [];
          if (points.at(-1)?.[0] >= t) continue;
          Object.defineProperty(next.disk, host.id, { configurable: true, enumerable: true, writable: true,
            value: [...points.filter(([when]) => when >= t - 7 * DAY), [t, host.disk]] });
          changed = true;
        }
        for (const rule of next.rules.filter(item => item.enabled)) {
          for (const host of servers.filter(item => !rule.serverId || item.id === rule.serverId)) {
            const key = JSON.stringify([rule.id, host.id]);
            valid.add(key);
            const value = rule.metric === 'cpu' ? host.raw?.cpu ?? host.cpu
              : rule.metric === 'ram' ? host.raw?.mem?.pct ?? host.ram : host[rule.metric];
            const exceeds = rule.metric === 'offline' ? host.status === 'offline'
              : host.status !== 'offline' && Number.isFinite(value) && value >= rule.threshold;
            if (!exceeds) { sampler.delete(key); continue; }
            const version = JSON.stringify(rule);
            const previous = sampler.get(key);
            const same = previous?.version === version && now - previous.last <= timeout;
            const state = same ? { ...previous, last: now } : { version, started: now, last: now, fired: false };
            if (!state.fired && now - state.started >= rule.duration * 60000) {
              state.fired = true;
              const id = randomUUID();
              next.events.unshift({ id, serverId: host.id, serverName: host.name, time: now,
                kind: rule.metric === 'offline' ? 'offline' : 'warning', title: rule.name,
                detail: rule.metric === 'offline' ? `主機已離線至少 ${rule.duration} 分鐘。`
                  : `監控數值達 ${value.toFixed(1)}，至少持續 ${rule.duration} 分鐘達到設定門檻。` });
              changed = true;
            }
            sampler.set(key, state);
          }
        }
        for (const key of sampler.keys()) if (!valid.has(key)) sampler.delete(key);
        if (next.events.length > 500) next.events.length = 500;
        return changed;
      });
      conditions.clear();
      for (const entry of sampler) conditions.set(...entry);
      return result;
    },
  };
}
