/* 固定示範資料，三套原型共用同一個營運情境。 */
const hosts = [
  { id: 'tokyo', name: '網站主機', code: 'web-tok-01', region: '東京', zone: 'TYO', ip: '203.0.113.12', state: 'ok', cpu: 24, ram: 42, disk: 38, uptime: '23 天', spec: '4 核心 / 16 GB', system: 'Ubuntu 24.04 LTS', services: ['nginx', 'Docker'] },
  { id: 'taipei', name: '資料庫主機', code: 'db-tpe-01', region: '台北', zone: 'TPE', ip: '203.0.113.24', state: 'warn', cpu: 71, ram: 87, disk: 65, uptime: '42 天', spec: '8 核心 / 32 GB', system: 'Ubuntu 24.04 LTS', services: ['PostgreSQL', 'Redis'] },
  { id: 'hongkong', name: '備援主機', code: 'backup-hkg-01', region: '香港', zone: 'HKG', ip: '198.51.100.18', state: 'ok', cpu: 12, ram: 31, disk: 56, uptime: '7 天', spec: '4 核心 / 16 GB', system: 'Debian 12', services: ['Docker', 'Caddy'] },
  { id: 'singapore', name: '下載主機', code: 'dl-sin-01', region: '新加坡', zone: 'SIN', ip: '192.0.2.26', state: 'down', cpu: null, ram: null, disk: null, uptime: '—', spec: '2 核心 / 8 GB', system: 'Ubuntu 24.04 LTS', services: ['Docker'] },
];

const events = [
  { id: 'lost', host: 'singapore', time: '14:26', level: 'down', title: '下載主機失聯', note: '連續 3 次未收到主機回應。最後一次回應在 14:23。' },
  { id: 'memory', host: 'taipei', time: '14:12', level: 'warn', title: '資料庫主機記憶體偏高', note: '記憶體使用率超過 85% 的告警門檻。' },
  { id: 'backup', host: 'hongkong', time: '13:48', level: 'ok', title: '備援主機完成每日備份', note: '備份已儲存，大小 1.2 GB。' },
  { id: 'update', host: 'tokyo', time: '13:07', level: 'ok', title: '網站主機完成系統更新', note: '更新後所有受監控服務均已恢復運作。' },
];

const statusLabels = { ok: '正常', warn: '注意', down: '失聯' };
const metrics = { cpu: '處理器', ram: '記憶體', disk: '磁碟' };
const periods = {
  '30m': { label: '30 分鐘', ticks: ['14:02', '14:09', '14:17', '14:24', '14:32'] },
  '24h': { label: '24 小時', ticks: ['昨日 14:32', '20:32', '02:32', '08:32', '14:32'] },
  '7d': { label: '7 天', ticks: ['11/21', '11/22', '11/24', '11/25', '11/27'] },
};

function samples(host, metric, period, count) {
  if (host[metric] === null) return [];
  const hostIndex = hosts.indexOf(host);
  const periodIndex = Object.keys(periods).indexOf(period);
  const offset = { cpu: 0, ram: 5, disk: 11 }[metric];
  const amplitude = { cpu: 18, ram: 8, disk: 3 }[metric];
  const values = Array.from({ length: count }, (_, index) => {
    const phase = index * (periodIndex + 2) / 3 + hostIndex + offset + periodIndex * 0.67;
    const ripple = Math.sin(phase) * 0.38 + Math.sin(phase * 2.9) * 0.28;
    const surge = host.id === 'taipei' ? Math.exp(-((index / count - 0.79) ** 2) / 0.018) * 0.7 : 0;
    return Math.max(2, Math.min(98, Math.round(host[metric] - amplitude * (0.35 - ripple - surge))));
  });
  values[count - 1] = host[metric];
  return values;
}
