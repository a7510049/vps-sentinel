const design = document.body.dataset.design;
const app = document.querySelector('#app');
const dialog = document.querySelector('#action-dialog');
const state = {
  host: design === 'monitor' ? 'taipei' : 'tokyo', period: '30m', metric: 'cpu',
  view: 'home', filter: 'all', query: '', event: 'memory', eventFilter: 'all', reviewed: new Set(),
};
const paths = {
  logo: '<path d="M12 3 21 8v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
  chart: '<path d="M3 4v16h18M6 15l4-5 4 3 6-7"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
  tools: '<path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="m9 6 6 6-6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16m-8-8c4 5 4 11 0 16-4-5-4-11 0-16z"/>',
  alert: '<path d="M12 3 2.7 20h18.6L12 3Zm0 6v4m0 3v.1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  power: '<path d="M12 3v8m5-5a8 8 0 1 1-10 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m10 3-1 3-3 1-3 3v4l3 3 3 1 1 3h4l1-3 3-1 3-3v-4l-3-3-3-1-1-3z"/>',
};

const icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
const brand = () => `<a class="brand" href="index.html" title="返回原型選單"><span class="brand-symbol">${icon('logo')}</span><span>哨站<small>OUTPOST</small></span></a>`;
const preview = () => '<span class="preview">示範資料</span>';
const badge = (status) => `<span class="status ${status}"><i></i>${statusLabels[status]}</span>`;
const selectedHost = () => hosts.find(({ id }) => id === state.host);
const currentEvent = () => events.find(({ id }) => id === state.event);
const hostById = (id) => hosts.find((host) => host.id === id);
const percentage = (value) => value === null ? '—' : `${value}%`;
const button = (label, action, value, options = {}) => `<button type="button" class="${options.className ?? ''}" data-action="${action}" data-value="${value}"${options.active === undefined ? '' : ` aria-pressed="${options.active}"`}>${options.icon ? icon(options.icon) : ''}${label}</button>`;
const range = () => `<div class="segmented" aria-label="趨勢時間範圍">${Object.entries(periods).map(([key, { label }]) => button(label, 'period', key, { active: state.period === key })).join('')}</div>`;
const menu = (entries) => entries.map(([key, label, symbol]) => button(label, 'view', key, { icon: symbol, active: state.view === key })).join('');
const figure = (host, metric, mode) => host[metric] === null && mode !== 'compare'
  ? '<p class="no-signal">這台主機目前失聯，沒有可用的示範趨勢。</p>'
  : `<canvas class="plot ${mode}" role="img" aria-label="${mode === 'compare' ? '主機比對，' : ''}${host.name} ${metrics[metric]}，${periods[state.period].label}趨勢，目前 ${percentage(host[metric])}" data-host="${host.id}" data-metric="${metric}" data-mode="${mode}"></canvas>`;

function hostDetails(host) {
  return `<dl class="host-facts"><div><dt>作業系統</dt><dd>${host.system}</dd></div><div><dt>資源規格</dt><dd>${host.spec}</dd></div><div><dt>連續運行</dt><dd>${host.uptime}</dd></div><div><dt>受監控服務</dt><dd>${host.services.join('、')}</dd></div></dl>`;
}

function inventoryRows() {
  const query = state.query.trim().toLowerCase();
  const results = hosts.filter((host) => (state.filter === 'all' || host.state === state.filter) &&
    [host.name, host.region, host.code, host.ip].some((value) => value.toLowerCase().includes(query)));
  return results.map((host) => `<tr class="${host.id === state.host ? 'selected' : ''}">
    <th scope="row"><button class="host-link" data-action="host" data-value="${host.id}" aria-pressed="${host.id === state.host}"><span class="server-icon">${icon('server')}</span><span>${host.name}<small>${host.code}</small></span></button></th>
    <td class="location"><strong>${host.region}</strong><small>${host.ip}</small></td><td>${badge(host.state)}</td>
    ${Object.keys(metrics).map((key) => `<td class="meter-cell"><span>${percentage(host[key])}</span><meter min="0" max="100" value="${host[key] ?? 0}" aria-label="${metrics[key]} ${percentage(host[key])}" ${host[key] === null ? 'hidden' : ''}></meter></td>`).join('')}
    <td class="row-arrow"><button data-action="host" data-value="${host.id}" aria-label="查看${host.name}">${icon('arrow')}</button></td></tr>`).join('') || '<tr><td class="empty" colspan="7">沒有符合條件的主機。試試其他名稱或狀態。</td></tr>';
}

function inventoryScreen() {
  const host = selectedHost();
  return `<header class="inv-header"><div class="inv-width">${brand()}<nav aria-label="主要導覽">${menu([
    ['home', '主機清冊', 'server'], ['history', '事件紀錄', 'bell'], ['tools', '工具', 'tools'],
  ])}</nav><div class="shell-end">${preview()}${button('設定', 'view', 'settings', { icon: 'settings', className: 'quiet settings-link' })}</div></div></header>
  <main class="inv-width inv-main">${state.view === 'home' ? `<div class="inv-intro"><div><h1>主機清冊</h1><p>管理各機房的主機、資源與連線狀態。</p></div>${button('新增主機', 'action', 'pair', { className: 'primary', icon: 'add' })}</div>
    <div class="inv-summary" aria-label="主機狀態篩選">
      ${[['all', '全部主機'], ...Object.entries(statusLabels)].map(([key, label]) => `<button data-action="filter" data-value="${key}" aria-pressed="${state.filter === key}"><span>${key === 'all' ? icon('server') : `<i class="dot ${key}"></i>`}${label}</span><strong>${key === 'all' ? hosts.length : hosts.filter((entry) => entry.state === key).length}</strong></button>`).join('')}
    </div>
    <div class="inv-work"><section class="inventory-list" aria-label="主機列表"><div class="table-tools"><h2>主機列表</h2><label class="search">${icon('search')}<input type="search" aria-label="搜尋主機" placeholder="搜尋名稱、地區或 IP"></label></div>
    <table><thead><tr><th scope="col">主機</th><th class="location" scope="col">機房 / IP</th><th scope="col">狀態</th><th class="meter-cell" scope="col">處理器</th><th class="meter-cell" scope="col">記憶體</th><th class="meter-cell" scope="col">磁碟</th><th class="row-arrow" scope="col"><span class="sr">查看</span></th></tr></thead><tbody>${inventoryRows()}</tbody></table></section>
    <aside id="host-inspector" class="inspector" aria-label="主機詳情"><div class="inspector-head"><span class="server-icon">${icon('server')}</span>${badge(host.state)}</div>
    <h2>${host.name}</h2><p class="subtle mono">${host.code}</p><div class="inspector-chart"><h3>處理器趨勢</h3><strong>${percentage(host.cpu)}</strong>${figure(host, 'cpu', 'area')}${range()}</div>
    <dl class="mobile-resources">${Object.entries(metrics).map(([key, label]) => `<div><dt>${label}</dt><dd>${percentage(host[key])}</dd></div>`).join('')}</dl>${hostDetails(host)}<div class="inspector-actions">${button('查看服務', 'action', 'services', { className: 'secondary' })}${button('重新開機', 'action', 'reboot', { className: 'quiet', icon: 'power' })}</div></aside></div>
    <p class="inv-foot">${icon('clock')} 11 月 27 日 14:32 更新 <span>亞洲區域 · 4 個機房</span></p>` : utilityScreen()}</main>`;
}

function monitorScreen() {
  const host = selectedHost();
  return `<div class="monitor-shell"><aside class="mon-rail">${brand()}<nav aria-label="工作區導覽">${menu([
    ['home', '監測', 'chart'], ['history', '紀錄', 'bell'], ['tools', '工具', 'tools'], ['settings', '設定', 'settings'],
  ])}</nav><a class="rail-return" href="index.html" aria-label="原型選單">${icon('tools')}</a></aside>
  <header class="mon-header"><span class="mon-context">${icon('globe')} 亞洲區域 <span>/</span> ${state.view === 'home' ? '監測' : viewLabels[state.view]}</span><div class="shell-end">${preview()}<span class="sample-time">${icon('clock')} 14:32</span></div></header>
  <main class="mon-main">${state.view === 'home' ? `<div class="mon-intro"><div><h1>即時監測</h1><p>比較主機負載，找出資源異常。</p></div>${range()}</div>
  <section class="mon-chart" aria-label="主機趨勢比對"><header><div><h2>${metrics[state.metric]}使用率</h2><p>${host.name} <span> / </span> ${host.region}</p></div><div class="metric-switch" aria-label="趨勢指標">${Object.entries(metrics).map(([key, label]) => button(label, 'metric', key, { active: state.metric === key })).join('')}</div></header>
  ${figure(host, state.metric, 'compare')}<div class="chart-legend">${hosts.filter((item) => item.cpu !== null).map((item, index) => `<span class="series-${index}"><i></i>${item.name}</span>`).join('')}<span class="legend-current">${host[state.metric] === null ? '選定主機失聯' : `目前 ${percentage(host[state.metric])}`}</span></div></section>
  <div class="mon-work"><section class="signal-matrix"><div class="section-head"><h2>主機訊號</h2><span>4 台主機</span></div><table><thead><tr><th scope="col">主機 / 機房</th><th scope="col">狀態</th>${Object.values(metrics).map((key) => `<th scope="col">${key}</th>`).join('')}</tr></thead><tbody>
  ${hosts.map((item) => `<tr class="${item.id === state.host ? 'selected' : ''}"><th scope="row"><button class="matrix-host" data-action="host" data-value="${item.id}" aria-pressed="${item.id === state.host}">${item.code}<small>${item.region}</small></button></th><td>${badge(item.state)}</td>${Object.keys(metrics).map((key) => `<td class="heat ${item[key] >= 85 ? 'hot' : item[key] >= 60 ? 'mid' : ''}"><span>${percentage(item[key])}</span></td>`).join('')}</tr>`).join('')}</tbody></table></section>
  <aside class="mon-focus"><div class="section-head"><h2>選定主機</h2>${badge(host.state)}</div><strong>${host.name}</strong><p class="mono">${host.ip}</p>
  <dl><div><dt>連續運行</dt><dd>${host.uptime}</dd></div><div><dt>資源規格</dt><dd>${host.spec}</dd></div></dl><div>${button('查看服務', 'action', 'services', { className: 'secondary' })}${button('重新開機', 'action', 'reboot', { className: 'quiet', icon: 'power' })}</div></aside></div>` : utilityScreen()}</main></div>`;
}

function eventsList(entries, current = '') {
  return entries.map((event) => `<li><div class="timeline-time"><time>${event.time}</time></div><button class="event-row" data-action="event" data-value="${event.id}" aria-pressed="${current === event.id}"><span class="event-symbol ${event.level}">${icon(event.level === 'ok' ? 'check' : 'alert')}</span><span><strong>${event.title}</strong><small>${hostById(event.host).region} · ${state.reviewed.has(event.id) ? '已檢視' : event.level === 'ok' ? '已完成' : statusLabels[event.level]}</small></span>${icon('arrow')}</button></li>`).join('') || '<li class="empty">目前沒有符合條件的事件。</li>';
}

function incidentsScreen() {
  const event = currentEvent();
  const host = hostById(event.host);
  const urgent = events.filter((item) => item.level !== 'ok' && !state.reviewed.has(item.id));
  const shown = state.eventFilter === 'open' ? urgent : events;
  return `<header class="inc-header"><div class="inc-width">${brand()}<div class="shell-end"><span class="incident-date">11 月 27 日　星期五</span>${preview()}<button class="quiet drawer-toggle" data-action="drawer" data-value="nav" aria-expanded="${state.drawer === 'nav'}">${icon('tools')}選單</button></div></div></header>
  <div class="inc-width inc-shell"><aside class="inc-nav ${state.drawer === 'nav' ? 'mobile-open' : ''}"><nav aria-label="工作區導覽">${menu([
    ['home', '事件中心', 'bell'], ['fleet', '主機與機房', 'server'], ['tools', '工具', 'tools'], ['settings', '設定', 'settings'],
  ])}</nav><section class="region-list"><h2>機房狀態</h2>${hosts.map((item) => `<button data-action="region" data-value="${item.id}"><span><b>${item.zone}</b>${item.region}</span><i class="dot ${item.state}" title="${statusLabels[item.state]}"></i></button>`).join('')}</section></aside>
  <main class="inc-main">${state.view === 'home' ? `<div class="inc-intro"><h1>事件中心</h1><p>追蹤主機異常、備份與系統更新。</p></div>
  <section class="triage"><div class="triage-icon">${icon(urgent.length ? 'bell' : 'check')}</div><div><h2>${urgent.length ? `${urgent.length} 件事件待檢視` : '待檢視事件已清空'}</h2><p>${urgent.length ? urgent.map((item) => item.title).join('、') : '可在全部事件查看先前紀錄。'}</p></div>
  ${button(urgent.length ? '只看待檢視' : '查看全部', 'event-filter', urgent.length ? 'open' : 'all', { className: 'primary' })}</section>
  <div class="inc-work"><section class="timeline"><div class="section-head"><h2>今天</h2><div class="text-tabs" aria-label="事件篩選">${button('全部', 'event-filter', 'all', { active: state.eventFilter === 'all' })}${button('待檢視', 'event-filter', 'open', { active: state.eventFilter === 'open' })}</div></div><ol>${eventsList(shown, event.id)}</ol></section>
  <aside id="event-inspector" class="event-inspector ${state.drawer === 'event' ? 'mobile-open' : ''}" aria-label="事件詳情">${shown.length ? `<div class="section-head"><span class="event-meta">${icon('clock')} ${event.time}　${host.region}</span>${button('關閉', 'drawer', 'close', { className: 'quiet drawer-toggle', icon: 'close' })}</div>
  <h2>${event.title}</h2><p>${event.note}</p>
  <div class="event-chart"><div class="section-head"><h3>記憶體樣本</h3><strong>${percentage(host.ram)}</strong></div>${figure(host, 'ram', 'bars')}${range()}</div>
  <div class="event-actions">${event.level !== 'ok' && !state.reviewed.has(event.id) ? button('標記已檢視', 'review', event.id, { className: 'primary', icon: 'check' }) : ''}${button('查看主機', 'region', host.id, { className: 'secondary', icon: 'arrow' })}</div>` : '<p class="empty">待檢視事件已清空。</p>'}</aside></div>
  <section class="fleet-strip" aria-label="機房資源概況"><h2>機房資源</h2><div>${hosts.map(regionCard).join('')}</div></section>` : utilityScreen()}</main></div>`;
}

function regionCard(host) {
  return `<button class="region-card" data-action="region" data-value="${host.id}"><span><strong>${host.region}</strong>${badge(host.state)}</span><small>${host.code}</small><span class="resource-steps" aria-label="記憶體 ${percentage(host.ram)}">${Array.from({ length: 12 }, (_, index) => `<i class="${host.ram !== null && index < Math.round(host.ram * 0.12) ? 'used' : ''} ${host.state}"></i>`).join('')}</span><span class="resource-label">記憶體 <b>${percentage(host.ram)}</b></span></button>`;
}

const viewLabels = { history: '事件紀錄', tools: '工具', settings: '設定', fleet: '主機與機房' };
const tools = [['traffic', '網路流量', '月用量與每日明細'], ['backup', '備份與還原', '備份狀態與檔案'], ['download', '遠端下載', '下載到雲端硬碟'], ['cloud', '雲端硬碟', '開啟前驗證身分'], ['notes', '加密筆記', '管理同步狀態'], ['album', '相簿分享', '管理相簿與分享連結'], ['flights', '機場起降', '看板、雷達與分享'], ['dns', '廣告攔截', '管理 DNS 設定'], ['links', '常用連結', '管理捷徑與連線狀態']];
const settings = [['pair', '主機配對', '新增主機或管理配對'], ['auth', '登入與裝置', 'PIN 碼、手機金鑰與工作階段'], ['telegram', 'Telegram 通知', '通知對象與項目'], ['security', '主機安全', '安全檢查、SSH 與自動更新'], ['update', '哨站更新', '查看版本與更新進度'], ['appearance', '外觀', '主題與文字大小']];

function utilityScreen() {
  const host = selectedHost();
  let body;
  if (state.view === 'history') body = `<ol class="utility-events">${eventsList(events)}</ol>`;
  else if (state.view === 'fleet') body = `<div class="utility-fleet">${hosts.map(regionCard).join('')}</div><section class="fleet-detail"><h2>${host.name} ${badge(host.state)}</h2>${hostDetails(host)}<h3>記憶體趨勢</h3>${figure(host, 'ram', 'bars')}${range()}<div class="event-actions">${button('查看服務', 'action', 'services', { className: 'secondary' })}${button('重新開機', 'action', 'reboot', { className: 'quiet', icon: 'power' })}</div></section>`;
  else body = `<ul class="utility-list">${(state.view === 'tools' ? tools : settings).map(([key, name, description]) => `<li><button data-action="action" data-value="${key}"><span><strong>${name}</strong><small>${description}</small></span>${icon('arrow')}</button></li>`).join('')}</ul>`;
  return `<div class="utility-screen"><h1>${viewLabels[state.view]}</h1>${body}</div>`;
}

const screens = { inventory: inventoryScreen, monitor: monitorScreen, incidents: incidentsScreen };
function render(focus) {
  app.innerHTML = screens[design]();
  const search = app.querySelector('input[type="search"]');
  if (search) search.value = state.query;
  requestAnimationFrame(drawCharts);
  if (focus) app.querySelector(`[data-action="${focus.action}"][data-value="${focus.value}"]`)?.focus({ preventScroll: true });
}

function drawCharts() {
  document.querySelectorAll('canvas.plot').forEach((canvas) => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const { mode, metric, host: id } = canvas.dataset;
    const host = hostById(id);
    const colors = { area: ['#3c50a0'], bars: ['#176855'], compare: ['#84b8ff', '#a5edbd', '#bfafea'] }[mode];
    const legendColor = mode === 'compare' ? '#adbdcf' : '#566375';
    const gridColor = mode === 'compare' ? '#344657' : '#dce3e9';
    const left = 34, top = 13, bottom = h - 26, right = w - 12;
    const rangeWidth = right - left;
    const y = (value) => bottom - value * (bottom - top) / 100;
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = legendColor;
    ctx.textAlign = 'right';
    const levels = h > 160 ? [0, 25, 50, 75, 100] : [0, 50, 100];
    levels.forEach((value) => {
      ctx.fillText(`${value}%`, left - 6, y(value) + 4);
      ctx.strokeStyle = gridColor;
      ctx.beginPath(); ctx.moveTo(left, y(value)); ctx.lineTo(right, y(value)); ctx.stroke();
    });
    const ticks = periods[state.period].ticks;
    ticks.forEach((tick, index) => {
      if (w < 380 && index % 2) return;
      ctx.textAlign = index === 0 ? 'left' : index === ticks.length - 1 ? 'right' : 'center';
      ctx.fillText(tick, left + rangeWidth * index / (ticks.length - 1), h - 6);
    });
    if (mode === 'bars') {
      const values = samples(host, metric, state.period, 18);
      const step = rangeWidth / values.length;
      values.forEach((value, index) => {
        ctx.fillStyle = index === values.length - 1 ? colors[0] : '#95bead';
        ctx.fillRect(left + index * step + 1, y(value), Math.max(1, step - 3), bottom - y(value));
      });
      return;
    }
    const series = mode === 'compare' ? hosts.filter((item) => item[metric] !== null) : [host];
    const ordered = [...series].sort((a, b) => Number(a.id === id) - Number(b.id === id));
    ordered.forEach((item) => {
      const values = samples(item, metric, state.period, mode === 'area' ? 26 : 56);
      const coords = values.map((value, index) => [left + rangeWidth * index / (values.length - 1), y(value)]);
      const color = colors[series.indexOf(item)];
      const line = () => { ctx.beginPath(); coords.forEach(([x, yValue], index) => index ? ctx.lineTo(x, yValue) : ctx.moveTo(x, yValue)); };
      if (item.id === id) {
        line(); ctx.lineTo(right, bottom); ctx.lineTo(left, bottom); ctx.closePath();
        ctx.fillStyle = mode === 'area' ? '#e3e7fa' : '#a5edbd16'; ctx.fill();
      }
      line(); ctx.strokeStyle = color; ctx.lineWidth = item.id === id ? 2.4 : 1.4; ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(right, y(item[metric]), 3.2, 0, Math.PI * 2); ctx.fill();
    });
  });
}

let noticeTimer;
function notify(message) {
  const notice = document.querySelector('#notice');
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 3100);
}

function openAction(key) {
  const host = selectedHost();
  const entry = [...tools, ...settings].find(([id]) => id === key);
  const title = { pair: '新增主機', reboot: '重新開機', services: '受監控服務' }[key] ?? entry?.[1];
  const content = {
    pair: '<label>配對暗號<input name="code" placeholder="VS-…" required pattern="VS-.+"></label><p class="subtle">可用 VS-DEMO 試走流程。</p>',
    reboot: host.state === 'down' ? '<p>主機目前失聯，請先確認連線。</p>' : `<p>即將模擬重新開機：<strong>${host.name}</strong>。</p><label>示範驗證碼<input name="code" inputmode="numeric" pattern="123456" title="輸入示範驗證碼 123456" placeholder="123456" required></label>`,
    services: `<p>${host.name}</p><ul class="service-list">${host.services.map((name) => `<li>${name}${host.state === 'down' ? '<span>未收到狀態</span>' : `<span class="status ok"><i></i>運作中</span>`}</li>`).join('')}</ul>`,
  }[key] ?? `<p>${entry?.[2] ?? ''}</p><p class="subtle">此區只展示功能入口。</p>`;
  const submit = key === 'pair' || (key === 'reboot' && host.state !== 'down');
  dialog.innerHTML = `<form method="dialog"><header><h2 id="dialog-title">${title}</h2><button aria-label="關閉" value="close" formnovalidate>${icon('close')}</button></header><div class="dialog-content">${content}</div><footer><button value="cancel" formnovalidate class="secondary">${submit ? '取消' : '關閉'}</button>${submit ? `<button class="primary" value="${key}">${key === 'pair' ? '模擬配對' : '模擬重新開機'}</button>` : ''}</footer></form>`;
  dialog.returnValue = '';
  dialog.showModal();
}

dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'pair') notify('已完成配對示範。');
  if (dialog.returnValue === 'reboot') notify('已完成重新開機示範。');
});

app.addEventListener('input', (event) => {
  if (event.target.type !== 'search') return;
  state.query = event.target.value;
  app.querySelector('tbody').innerHTML = inventoryRows();
});

app.addEventListener('click', (event) => {
  const control = event.target.closest('button[data-action]');
  if (!control) return;
  const { action, value } = control.dataset;
  switch (action) {
    case 'action': openAction(value); return;
    case 'view': state.view = value; state.drawer = ''; break;
    case 'host': state.host = value; break;
    case 'period': state.period = value; break;
    case 'metric': state.metric = value; break;
    case 'filter': state.filter = value; break;
    case 'region': state.host = value; state.view = 'fleet'; state.drawer = ''; break;
    case 'event':
      if (state.view === 'history') {
        const entry = events.find((item) => item.id === value);
        dialog.innerHTML = `<form method="dialog"><header><h2 id="dialog-title">${entry.title}</h2></header><div class="dialog-content"><p>${entry.note}</p></div><footer><button class="secondary" value="close">關閉</button></footer></form>`;
        dialog.returnValue = ''; dialog.showModal(); return;
      }
      state.event = value; state.drawer = 'event'; break;
    case 'event-filter': {
      state.eventFilter = value;
      const open = events.filter((entry) => entry.level !== 'ok' && !state.reviewed.has(entry.id));
      if (value === 'open' && open.length && !open.some((entry) => entry.id === state.event)) state.event = open[0].id;
      break;
    }
    case 'review': {
      state.reviewed.add(value);
      if (state.eventFilter === 'open') {
        const next = events.find((entry) => entry.level !== 'ok' && !state.reviewed.has(entry.id));
        if (next) state.event = next.id;
        else state.drawer = '';
      }
      notify('已標記為已檢視。');
      break;
    }
    case 'drawer': state.drawer = state.drawer === value || value === 'close' ? '' : value; break;
  }
  render({ action, value });
  if (action === 'review') {
    const focusTarget = app.querySelector('#event-inspector .event-actions button') ?? app.querySelector('.text-tabs [data-value="open"]');
    focusTarget?.focus({ preventScroll: true });
  }
  if (action === 'view') window.scrollTo(0, 0);
  if (action === 'region') {
    window.scrollTo(0, 0);
    const heading = app.querySelector('main h1');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  if (action === 'drawer' && value === 'close') app.querySelector(`[data-action="event"][data-value="${state.event}"]`)?.focus();
  if (action === 'host' && design === 'inventory' && matchMedia('(max-width: 840px)').matches) {
    document.querySelector('#host-inspector').scrollIntoView({ block: 'start' });
  }
  if (action === 'event' && design === 'incidents' && matchMedia('(max-width: 760px)').matches) {
    const inspector = document.querySelector('#event-inspector');
    inspector.scrollIntoView({ block: 'start' });
    inspector.querySelector('.drawer-toggle').focus({ preventScroll: true });
  }
});

window.addEventListener('resize', drawCharts);
render();
