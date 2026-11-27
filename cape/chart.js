import { getSamples } from './data.js';
import { icon } from './icons.js';

export const series = {
  cpu: { label: 'CPU', title: 'CPU 使用率', unit: '%', icon: 'cpu' },
  ram: { label: '記憶體', title: '記憶體使用率', unit: '%', icon: 'memory' },
  disk: { label: '磁碟', title: '磁碟使用率', unit: '%', icon: 'disk' },
  rx: { label: '接收', title: '網路流量', unit: ' Mbps', icon: 'network' },
  tx: { label: '傳送', title: '網路流量', unit: ' Mbps', icon: 'network' },
  rd: { label: '讀取', title: '磁碟讀寫', unit: ' MB/s', icon: 'disk' },
  wr: { label: '寫入', title: '磁碟讀寫', unit: ' MB/s', icon: 'disk' },
  ld: { label: '負載', title: '系統負載', unit: '', icon: 'cpu' },
  cn: { label: '連線', title: 'TCP 連線數', unit: ' 條', icon: 'network' },
};
export const rangeLabels = { '1h': '1 小時', '6h': '6 小時', '24h': '24 小時', '7d': '7 天' };
export const formatValue = (value, unit) => !Number.isFinite(value) ? '—' : (unit === '%' || unit === ' 條' ? Math.round(value) : value.toFixed(1)) + unit;

function linePaths(samples, key, x, y, maxGap) {
  const segments = [];
  let segment = [];
  let lastTime;
  samples.forEach((sample, index) => {
    if (sample[key] == null) return;
    if (segment.length && sample.time - lastTime > maxGap) {
      segments.push(segment);
      segment = [];
    }
    segment.push([x(index), y(sample[key])]);
    lastTime = sample.time;
  });
  if (segment.length) segments.push(segment);
  return segments.map(points => {
    const [firstX, firstY] = points[0];
    let curve = `M${firstX},${firstY}`;
    for (let index = 1; index < points.length; index++) {
      const [lastX, lastY] = points[index - 1];
      const [nextX, nextY] = points[index];
      const middle = (lastX + nextX) / 2;
      curve += `C${middle},${lastY} ${middle},${nextY} ${nextX},${nextY}`;
    }
    return { curve, area: `${curve}L${points.at(-1)[0]},180H${firstX}Z`, single: points.length === 1 ? points[0] : null };
  });
}

export function chartMarkup({ nodes, range, end, keys, timezone, id }) {
  const samples = getSamples(nodes, range, end);
  if (samples.every(sample => keys.every(key => sample[key] == null))) {
    return `<div class="chart-empty">${icon('pulse', 30)}<strong>尚無監控樣本</strong><span>主機回報資料後，趨勢會顯示於此。</span></div>`;
  }
  const percent = keys.every(key => series[key].unit === '%');
  const peak = Math.max(...samples.flatMap(sample => keys.map(key => sample[key] || 0)));
  const increment = 10 ** (Math.floor(Math.log10(Math.max(1, peak))) - 1);
  const max = percent ? 100 : Math.max(1, Math.ceil(peak / (4 * increment)) * 4 * increment);
  const x = index => +(640 * index / (samples.length - 1)).toFixed(2);
  const y = value => +(180 - 180 * value / max).toFixed(2);
  const time = new Intl.DateTimeFormat('zh-TW', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const date = new Intl.DateTimeFormat('zh-TW', { timeZone: timezone, month: 'numeric', day: 'numeric' });
  const ticks = [0, .25, .5, .75, 1].map(ratio => (range === '7d' ? date : time).format(samples[Math.round(ratio * (samples.length - 1))].time));
  const windowStep = samples[1].time - samples[0].time;
  const maxGap = Math.max((range === '7d' ? 36 : 6) * 60000, windowStep * 1.5);
  const chart = keys.map(key => linePaths(samples, key, x, y, maxGap).map(({ curve, area, single }) => single
    ? `<path class="trend-line ${key}" stroke-linecap="round" d="M${single[0]},${single[1]}h.01"/>`
    : `<path d="${area}" fill="url(#fill-${id}-${key})"/><path class="trend-line ${key}" d="${curve}"/>`).join('')).join('');
  const fills = keys.map(key => `<linearGradient id="fill-${id}-${key}" x1="0" x2="0" y1="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="var(--${key})" stop-opacity=".16"/><stop offset="1" stop-color="var(--${key})" stop-opacity=".015"/></linearGradient>`).join('');
  return `<div class="chart" data-chart="${id}">
    <div class="chart-y" aria-hidden="true">${[1, .75, .5, .25, 0].map(ratio => `<span>${+(max * ratio).toFixed(2)}${percent ? '%' : ''}</span>`).join('')}</div>
    <div class="chart-right">
      <div class="plot" tabindex="0" role="group" aria-label="${keys.map(key => series[key].label).join('、')} 趨勢圖，使用左右鍵查看樣本">
        <svg viewBox="0 0 640 180" preserveAspectRatio="none" aria-hidden="true">
          <defs>${fills}</defs>
          ${[0, 45, 90, 135, 180].map(line => `<path class="grid-line" d="M0,${line}H640"/>`).join('')}
          ${chart}
        </svg>
        <div class="chart-crosshair" hidden></div>
        <div class="chart-tip" role="status" hidden></div>
      </div>
      <div class="chart-x" aria-hidden="true">${ticks.map(tick => `<span>${tick}</span>`).join('')}</div>
    </div>
  </div>`;
}

export function bindChart(container, { nodes, range, end, keys, timezone }) {
  const plot = container.querySelector('.plot');
  if (!plot) return;
  const cursor = plot.querySelector('.chart-crosshair');
  const tip = plot.querySelector('.chart-tip');
  const samples = getSamples(nodes, range, end);
  const date = new Intl.DateTimeFormat('zh-TW', { timeZone: timezone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let index = samples.length - 1;
  const show = next => {
    index = Math.max(0, Math.min(samples.length - 1, next));
    const sample = samples[index];
    const position = index * 100 / (samples.length - 1);
    cursor.style.left = position + '%';
    tip.style.left = position + '%';
    tip.classList.toggle('from-right', position > 57);
    tip.innerHTML = `<strong>${date.format(sample.time)}</strong>` + keys.map(key =>
      `<span><i class="series-dot ${key}"></i>${series[key].label}<b>${formatValue(sample[key], series[key].unit)}</b></span>`).join('');
    cursor.hidden = tip.hidden = false;
  };
  const hide = () => { cursor.hidden = tip.hidden = true; };
  plot.addEventListener('pointermove', event => {
    const rect = plot.getBoundingClientRect();
    show(Math.round((event.clientX - rect.left) / rect.width * (samples.length - 1)));
  });
  plot.addEventListener('pointerleave', hide);
  plot.addEventListener('focus', () => show(index));
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', event => {
    if (event.key === 'Escape') { hide(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    show({ ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: samples.length - 1 }[event.key]);
  });
}
