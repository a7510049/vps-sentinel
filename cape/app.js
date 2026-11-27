import { api, getSamples } from './data.js';
import { icon } from './icons.js';
import { bindChart, chartMarkup, formatValue, rangeLabels, series } from './chart.js';
import { assembleBackup, capabilities, makePin, nodeQuery, passkeyProof, pinProof, post, registerPasskey, request, signIn } from './outpost.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const content = $('#content');
const dialog = $('#dialog');
const menu = $('#menu');
const dark = matchMedia('(prefers-color-scheme: dark)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const statuses = { online: '運作正常', warning: '需要留意', offline: '離線' };
const kinds = { warning: ['警告', 'warning'], offline: ['異常', 'offline'], success: ['成功', 'circleCheck'], info: ['資訊', 'info'] };
const labels = { overview: '總覽', servers: '伺服器', events: '事件紀錄', alerts: '警報規則', settings: '系統設定', profile: '個人設定' };
const nav = [
  ['overview', 'grid'], ['servers', 'server'], ['events', 'activity'], ['alerts', 'bell'], ['settings', 'settings'], ['profile', 'user'],
];
const ui = { range: '1h', metric: 'resources', detailTab: 'monitor', serverFilter: 'all', serverQuery: '', eventFilter: 'all', eventServer: '', unreadOnly: false };
let state;
let route = { page: 'overview' };
let frame = Date.now();
let toastTimer;
let refreshTimer;
let dialogTrigger;
let menuTrigger;
let drawer;
let firstPaint = true;
let ready = false;
let auth = {};
let telemetryError = '';
let dataFrame = 0;
let historyEpoch = 0;
let verifyOperation;
let operation;
const airports = [['TPE','桃園'],['TSA','松山'],['RMQ','台中'],['KHH','高雄']];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const slug = page => '#/' + page;
const hostPath = id => 'servers/' + encodeURIComponent(id);
const findNode = id => state.servers.find(node => node.id === id);
const eventName = event => findNode(event.serverId)?.name || event.serverName || '工作區';
const captureDate = (ms, options) => new Intl.DateTimeFormat('zh-TW', { timeZone: state.settings.timezone, ...options }).format(ms);
const clock = ms => captureDate(ms, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const fullDate = ms => captureDate(ms, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const relative = ms => {
  const delta = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (delta < 1) return '剛剛';
  if (delta < 60) return delta + ' 分鐘前';
  if (delta < 1440) return Math.floor(delta / 60) + ' 小時前';
  return Math.floor(delta / 1440) + ' 天前';
};
const unread = () => state.settings.inbox ? state.events.filter(event => !state.read.includes(event.id)).length : 0;
const initials = () => esc(Array.from(state.profile.name).slice(0, 1).join('').toUpperCase());
const iconButton = (name, label, action, extra = '') => `<button type="button" class="icon-btn press" data-action="${action}" aria-label="${label}" title="${label}" ${extra}>${icon(name, 19)}</button>`;
const button = (text, action, name = '', style = 'secondary', extra = '') => `<button type="button" class="btn ${style} press" data-action="${action}" ${extra}>${name ? icon(name, 17) : ''}${text}</button>`;
const badge = status => `<span class="status ${status}"><i></i>${statuses[status]}</span>`;
const figure = (name, color = '', size = 20) => `<span class="figure ${color}">${icon(name, size)}</span>`;
const empty = (name, title, description, action = '') => `<div class="empty">${figure(name)}<strong>${title}</strong><span>${description}</span>${action}</div>`;
const selected = (value, current) => value === current ? 'selected' : '';
const option = (value, title, current) => `<option value="${esc(value)}" ${selected(value, current)}>${esc(title)}</option>`;
const control = (label, id, options, current) => `<label class="select-wrap"><span class="sr-only">${label}</span><select id="${id}">${options.map(([value, text]) => option(value, text, current)).join('')}</select>${icon('down', 15)}</label>`;
const navLink = ([page, name]) => `<a href="${slug(page)}" class="nav-link press" ${route.page === page ? 'aria-current="page"' : ''}>${icon(name, 19)}<span>${labels[page]}</span></a>`;
const menuButton = (label, action, id) => iconButton('more', label, action,
  `popovertarget="menu" aria-haspopup="menu" aria-expanded="false" data-id="${esc(id)}"`);

function theme() {
  const mode = state.settings.theme === 'system' ? (dark.matches ? 'dark' : 'light') : state.settings.theme;
  document.documentElement.dataset.theme = mode;
  document.documentElement.dataset.motion = state.settings.motion ? 'on' : 'off';
}

function sidebar() {
  $('#sidebar').innerHTML = `
    <a class="brand" href="#/overview" aria-label="岬角 Cape 首頁">
      <span class="brand-mark">${icon('logo', 23)}</span><span><strong>岬角 <b>Cape</b></strong><small>VPS 管理中心</small></span>
    </a>
    <div class="side-body">
      <nav aria-label="基礎架構"><div class="nav-heading">基礎架構</div>${nav.slice(0, 4).map(navLink).join('')}</nav>
      <nav aria-label="偏好設定"><div class="nav-heading">偏好設定</div>${nav.slice(4).map(navLink).join('')}</nav>
    </div>
    <div class="side-footer">
      <div class="workspace-label"><span class="workspace-icon">${icon('layers', 15)}</span><span>預設工作區<small>哨站連線</small></span></div>
      <a href="#/profile" class="profile-link press"><span class="avatar">${initials()}</span><span class="profile-name"><strong>${esc(state.profile.name)}</strong><small>工作區管理員</small></span>${icon('chevron', 15)}</a>
    </div>`;
  $('#mobile-nav').innerHTML = [...nav.slice(0, 4), nav[4]].map(navLink).join('');
}

function topbar() {
  const name = findNode(route.id)?.name;
  $('#topbar').innerHTML = `
    <div class="breadcrumb"><a class="brand-mark mobile-brand" href="#/overview" aria-label="岬角 Cape 首頁">${icon('logo', 17)}</a><span class="crumb-root">工作區</span>${icon('chevron', 14)}<a href="${slug(route.page)}">${labels[route.page]}</a>${name ? icon('chevron', 14) + '<strong>' + esc(name) + '</strong>' : ''}</div>
    <div class="top-actions">
      <button class="search-trigger press" data-action="search" aria-label="搜尋伺服器" aria-keyshortcuts="Control+K Meta+K">${icon('search', 17)}<span>搜尋伺服器</span><kbd>Ctrl K</kbd></button>
      ${iconButton(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', '切換淺色或深色主題', 'theme')}
      <button class="icon-btn notification-trigger press" data-action="inbox" aria-label="通知中心${unread() ? '，' + unread() + ' 則未讀' : ''}" title="通知中心">${icon('bell', 19)}${unread() ? '<i></i>' : ''}</button>
      <a href="#/profile" class="avatar top-avatar press" aria-label="個人設定">${initials()}</a>
    </div>`;
}

function head(title, description, action = '') {
  return `<div class="page-head"><div><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${action}</div></div>`;
}

function panelHead(title, description = '', action = '') {
  return `<div class="panel-head"><div><h2>${title}</h2>${description ? `<p>${description}</p>` : ''}</div>${action}</div>`;
}

function health() {
  const servers = state.servers;
  const counts = Object.fromEntries(Object.keys(statuses).map(status => [status, servers.filter(node => node.status === status).length]));
  return `<section class="health" aria-label="伺服器健康狀態">
    ${[
      ['all', 'server', '全部伺服器', servers.length, 'slate'],
      ['online', 'circleCheck', '運作正常', counts.online, 'online'],
      ['warning', 'warning', '需要留意', counts.warning, 'warning'],
      ['offline', 'offline', '離線', counts.offline, 'offline'],
    ].map(([status, name, title, value, color]) => `<a class="health-item press" href="#/servers?status=${status}">${figure(name, color, 19)}<span><small>${title}</small><strong>${value}</strong></span>${icon('chevron', 14)}</a>`).join('')}
  </section>`;
}

function rangeControl() {
  return `<div class="segment time-segment" aria-label="監控時間範圍">${Object.entries(rangeLabels).map(([range, title]) => `<button class="press" data-action="range" data-value="${range}" aria-pressed="${ui.range === range}">${title}</button>`).join('')}</div>`;
}

const chartConfigurations = {
  resources: ['cpu', 'ram'], cpu: ['cpu'], ram: ['ram'], disk: ['disk'], network: ['rx', 'tx'],
};
const metricTabs = [['resources', '整體資源'], ['cpu', 'CPU'], ['ram', '記憶體'], ['disk', '磁碟'], ['network', '網路']];

function graphDefinition(nodes, id, keys) {
  return { nodes, id, keys, range: ui.range, end: frame, timezone: state.settings.timezone };
}

function legend(nodes, keys) {
  const points = getSamples(nodes, ui.range, frame);
  return keys.map(key => {
    const recent = points.findLast(point => point[key] != null);
    return `<span class="legend-item"><i class="series-dot ${key}"></i><span>${series[key].label}</span><strong data-reading="${key}">${formatValue(recent?.[key], series[key].unit)}</strong></span>`;
  }).join('');
}

function graph(nodes, id, keys) {
  return `<div class="graph" data-graph="${id}" data-keys="${keys.join(',')}">
    <div class="legend">${legend(nodes, keys)}</div><div class="plot-slot">${chartMarkup(graphDefinition(nodes, id, keys))}</div></div>`;
}

function overviewTrend() {
  return `<section class="panel trend">
    ${panelHead('資源趨勢', ui.metric === 'network' ? '回報樣本的平均網路速率' : '回報樣本的平均資源使用率', rangeControl())}
    <div class="metric-tabs" aria-label="監控資源">${metricTabs.map(([id, title]) => `<button class="press" data-action="metric" data-value="${id}" aria-pressed="${id === ui.metric}">${title}</button>`).join('')}</div>
    ${graph(state.servers, 'fleet', chartConfigurations[ui.metric])}
    <div class="trend-footer"><span class="live-mark"><i class="${!telemetryError && state.settings.live && ui.range === '1h' ? 'live-dot' : 'static-dot'}"></i>${telemetryError ? '連線暫停' : state.settings.live && ui.range === '1h' ? '即時監控' : '歷史快照'}</span><span data-last-update>更新於 ${clock(dataFrame || frame)}</span>${iconButton('refresh', '重新整理監控資料', 'refresh')}</div>
  </section>`;
}

function eventRow(event, notification = false) {
  const fresh = !state.read.includes(event.id);
  return `<button class="event-row press" data-action="event" data-id="${esc(event.id)}">
    ${figure(kinds[event.kind][1], event.kind, 17)}
    <span class="event-copy"><strong>${esc(event.title)}${notification && fresh ? '<i class="unread-dot" aria-label="未讀"></i>' : ''}</strong><small>${esc(eventName(event))}</small></span>
    <time datetime="${new Date(event.time).toISOString()}">${relative(event.time)}</time>
  </button>`;
}

function recentEvents() {
  return `<section class="panel recent">${panelHead('近期事件', '', `<a class="text-link" href="#/events">查看全部 ${icon('chevron', 15)}</a>`)}
    <div class="events-preview">${state.events.slice(0, 5).map(event => eventRow(event)).join('') || empty('activity', '尚無事件', '工作區事件會顯示於此。')}</div>
  </section>`;
}

function miniMetric(value, status, name) {
  return status === 'offline' || !Number.isFinite(value) ? '<span class="muted">—</span>' : `<span class="mini-metric ${name}"><span class="meter"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></span><span>${value}%</span></span>`;
}

function serverTable(nodes, compact = false) {
  if (!nodes.length) return empty('server', compact ? '尚無伺服器' : '找不到符合的伺服器', compact ? '新增伺服器後即可查看監控狀態。' : '試著調整搜尋關鍵字或清除篩選條件。', compact ? button('新增伺服器', 'server-new', 'plus', 'primary') : button('清除篩選', 'server-clear'));
  const row = node => `<tr data-href="${slug(hostPath(node.id))}">
      <td><a class="host-link press" href="${slug(hostPath(node.id))}">${figure('server', 'host', 18)}<span><strong>${esc(node.name)}</strong><small><span class="mono">${esc(node.ip)}</span><span class="host-region"> · ${esc(node.region)}</span></small></span></a></td>
      <td>${badge(node.status)}</td><td class="region">${esc(node.region)}</td>
      <td class="metric-cell">${miniMetric(node.cpu, node.status, 'cpu')}</td>
      <td class="metric-cell">${miniMetric(node.ram, node.status, 'ram')}</td>
      <td class="metric-cell">${miniMetric(node.disk, node.status, 'disk')}</td>
      <td class="row-action">${menuButton('管理 ' + esc(node.name), 'server-menu', node.id)}</td>
    </tr>`;
  const sections = compact || ui.serverFilter !== 'all'
    ? `<tbody>${nodes.map(row).join('')}</tbody>`
    : ['offline', 'warning', 'online'].map(status => {
        const group = nodes.filter(node => node.status === status);
        if (!group.length) return '';
        return `<tbody aria-labelledby="group-${status}">
          <tr class="table-group ${status}"><th colspan="7" scope="rowgroup" id="group-${status}"><span><i></i>${statuses[status]}<small>${group.length} 台</small></span></th></tr>
          ${group.map(row).join('')}
        </tbody>`;
      }).join('');
  return `<div class="table-wrap"><table class="server-table">
    <thead><tr><th scope="col">伺服器</th><th scope="col">狀態</th><th scope="col">區域</th><th scope="col">CPU</th><th scope="col">記憶體</th><th scope="col">磁碟</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead>
    ${sections}</table></div>`;
}

function overview() {
  return `${head('基礎架構總覽', '掌握伺服器健康狀態、資源用量與近期異常。', button('新增伺服器', 'server-new', 'plus', 'primary'))}
    ${health()}<div class="overview-grid">${overviewTrend()}${recentEvents()}</div>
    <section class="panel fleet">${panelHead('伺服器清單', `管理中的 ${state.servers.length} 台伺服器`, `<a class="text-link" href="#/servers">管理伺服器 ${icon('chevron', 15)}</a>`)}${serverTable(state.servers, true)}</section>`;
}

function filteredNodes(query = ui.serverQuery, status = ui.serverFilter) {
  const term = query.trim().toLowerCase();
  return state.servers.filter(node => (status === 'all' || node.status === status)
    && [node.name, node.ip, node.region, node.group, node.os].some(value => value.toLowerCase().includes(term)));
}

function serverList() {
  return `${head('伺服器', '查看各區域的伺服器與資源使用情形。', button('新增伺服器', 'server-new', 'plus', 'primary'))}
    <section class="panel fleet">
      <div class="table-controls">
        <label class="search-field">${icon('search', 18)}<input type="search" id="server-query" placeholder="搜尋名稱、IP、區域…" aria-label="搜尋伺服器清單" value="${esc(ui.serverQuery)}"></label>
        ${control('伺服器狀態', 'server-filter', [['all', '全部狀態'], ...Object.entries(statuses)], ui.serverFilter)}
      </div>
      <div id="server-results">${serverTable(filteredNodes())}</div>
      <div class="table-footer" id="server-count" aria-live="polite">${filteredNodes().length} 台／共 ${state.servers.length} 台伺服器</div>
    </section>`;
}

function definitionGrid(rows) {
  return `<dl class="specs">${rows.map(([title, value]) => `<div><dt>${title}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

const quantity = (value, unit) => Number.isFinite(value) ? value + ' ' + unit : '—';
const byteLabel = value => Number.isFinite(value) ? new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 1 }).format(value / 1024 ** 3) + ' GB' : '—';
const array = value => Array.isArray(value) ? value : [];

function dataRows(rows, emptyText = '目前沒有資料。') {
  return rows.length ? rows.map(([label, value]) => `<div class="setting-row"><div class="row-main"><strong>${esc(label)}</strong><small>${esc(value)}</small></div></div>`).join('')
    : `<div class="setting-row"><div class="row-main"><small>${esc(emptyText)}</small></div></div>`;
}

function hostSections(node) {
  const raw = node.raw;
  const traffic = raw.traffic || {};
  const services = [...array(raw.services).map(x => [x.name, x.state]), ...array(raw.containers).map(x => [x.name, x.status || x.state])];
  return `<div class="detail-grid live-extra">
    <section class="panel settings-panel">${panelHead('服務與容器')}${dataRows(services, '主機目前沒有回報服務或容器。')}</section>
    <section class="panel settings-panel">${panelHead('流量與用量', '', button('流量設定', 'host-tool', 'settings', 'secondary', `data-id="${esc(node.id)}" data-value="traffic"`))}
      ${definitionGrid([['本期用量', byteLabel(traffic.used)], ['流量上限', traffic.limit ? byteLabel(traffic.limit) : '無上限'], ['期末預估', byteLabel(traffic.projected)], ['剩餘天數', quantity(traffic.days_left, '天')]])}
      ${dataRows(array(traffic.daily).slice().reverse().map(x => [x.d,
        [x.rx, x.tx].every(Number.isFinite) ? '接收 ' + byteLabel(x.rx) + ' · 傳送 ' + byteLabel(x.tx) : '—']))}
    </section>
    <section class="panel settings-panel">${panelHead('高用量程序')}${dataRows(array(raw.top).slice(0, 5).map(x => [x.name || x.comm, [Number.isFinite(x.cpu) ? 'CPU ' + x.cpu + '%' : '', Number.isFinite(x.rss) ? byteLabel(x.rss) : ''].filter(Boolean).join(' · ')]))}</section>
    <section class="panel settings-panel">${panelHead('可用性與健康事件')}${dataRows([
      ...array(raw.problems).map(x => [x, '異常']), ...array(raw.notices).map(x => [x, '需要留意']),
      ...array(raw.up30).slice(-30).reverse().map((value, index) => [
        captureDate((node.lastSeen || Date.now()) - index * 86400000, { month: 'numeric', day: 'numeric' }),
        Number.isFinite(value) ? value + '% 在線' : '無採樣',
      ]),
    ])}</section></div>`;
}

function serverDetail(node) {
  if (!node) return `<a href="#/servers" class="back-link">${icon('back', 17)}伺服器</a>${head('找不到伺服器', '這台伺服器可能已從工作區移除。')}<a class="btn secondary" href="#/servers">返回伺服器清單</a>`;
  const actions = `${button('編輯資料', 'server-edit', 'edit', 'secondary', `data-id="${esc(node.id)}"`)}${menuButton('伺服器選單', 'server-menu', node.id)}`;
  const subline = `${badge(node.status)} <span>${esc(node.region)}</span> <span class="mono">${esc(node.ip)}</span>`;
  const tabs = [['monitor', '資源監控'], ['details', '主機資訊'], ['events', '系統事件']];
  let body;
  if (ui.detailTab === 'details') {
    body = `<section class="panel detail-info">${panelHead('主機規格')}${definitionGrid([
      ['主機名稱', esc(node.name)], ['IP 位址', `<span class="mono">${esc(node.ip)}</span>${iconButton('copy', '複製 IP 位址', 'copy-ip', `data-id="${esc(node.id)}"`)}`],
      ['資料中心區域', esc(node.region)], ['環境', esc(node.group)], ['作業系統', esc(node.os)],
      ['CPU', quantity(node.cores, 'vCPU')], ['記憶體', quantity(node.memory, 'GB')], ['磁碟容量', quantity(node.storage, 'GB')], ['運作時間', esc(node.uptime)],
      ['CPU 型號', esc(node.raw.cpum || '—')], ['核心版本', esc(node.raw.kernel || '—')], ['IPv6', esc(node.raw.ipv6?.addr || '—')],
      ['哨站版本', esc(node.raw.version || '—')],
    ])}</section>${hostSections(node)}`;
  } else if (ui.detailTab === 'events') {
    body = `<section class="panel">${panelHead('系統事件')}${eventGroups(state.events.filter(event => event.serverId === node.id))}</section>`;
  } else {
    body = `<div class="detail-controls"><span class="live-mark"><i class="${node.status !== 'offline' && state.settings.live && ui.range === '1h' ? 'live-dot' : 'static-dot'}"></i>${node.status === 'offline' ? '缺少即時樣本' : state.settings.live && ui.range === '1h' ? '即時監控' : '歷史快照'}</span><div>${rangeControl()}${iconButton('refresh', '重新整理監控資料', 'refresh')}</div></div>
      ${node.status === 'offline' ? `<div class="notice">${icon('info', 18)}<span>目前無法收到主機回報，時間序列會保留可用的歷史樣本。</span></div>` : ''}
      <div class="detail-grid">${[['cpu'], ['ram'], ['disk'], ['rx', 'tx'], ['rd', 'wr'], ['ld'], ['cn']].map(keys => `<section class="panel detail-chart">${panelHead(series[keys[0]].title)}${graph([node], 'host-' + keys[0], keys)}</section>`).join('')}</div>`;
  }
  return `<a href="#/servers" class="back-link">${icon('back', 17)}伺服器</a>
    ${head(esc(node.name), subline, actions)}
    <div class="detail-tabs metric-tabs" aria-label="伺服器詳細頁面">${tabs.map(([id, title]) => `<button class="press" data-action="detail-tab" data-value="${id}" aria-pressed="${ui.detailTab === id}">${title}</button>`).join('')}</div>${body}`;
}

function eventGroups(events) {
  if (!events.length) return empty('activity', '沒有符合的事件', '新的系統活動或警報會顯示於此。');
  const groups = Map.groupBy(events, event => captureDate(event.time, { month: 'long', day: 'numeric' }));
  return Array.from(groups, ([day, items]) => `<div class="event-group"><h3>${day}</h3>${items.map(event => eventRow(event)).join('')}</div>`).join('');
}

function eventsPage() {
  const events = state.events.filter(event => (ui.eventFilter === 'all' || event.kind === ui.eventFilter) && (!ui.eventServer || event.serverId === ui.eventServer));
  return `${head('事件紀錄', '追蹤警報、連線變化與維護活動。')}
    <section class="panel event-panel"><div class="table-controls">
      ${control('事件類型', 'event-filter', [['all', '所有類型'], ...Object.entries(kinds).map(([value, [label]]) => [value, label])], ui.eventFilter)}
      ${control('事件伺服器', 'event-server', [['', '所有伺服器'], ...state.servers.map(node => [node.id, node.name])], ui.eventServer)}
    </div>${eventGroups(events)}<div class="table-footer">${events.length} 筆事件</div></section>`;
}

const alertMetrics = { cpu: 'CPU 使用率', ram: '記憶體使用率', disk: '磁碟使用率', rx: '網路接收速率', tx: '網路傳送速率', offline: '心跳中斷' };
function toggle(label, action, active, extra = '') {
  return `<button type="button" class="switch" role="switch" aria-label="${label}" aria-checked="${active}" data-action="${action}" ${extra}><span></span></button>`;
}

function alertsPage() {
  return `${head('警報規則', '設定資源門檻與主機連線條件。', button('建立規則', 'rule-new', 'plus', 'primary'))}
    <section class="panel settings-panel rule-list">${panelHead('監控規則', `${state.rules.filter(rule => rule.enabled).length} 個啟用中`)}
    ${state.rules.length ? state.rules.map(rule => {
      const threshold = rule.metric === 'offline' ? '心跳中斷' : alertMetrics[rule.metric] + ' ≥ ' + rule.threshold + series[rule.metric].unit;
      const scope = findNode(rule.serverId)?.name || rule.missingScope || '所有伺服器';
      return `<div class="setting-row rule-row">${figure(series[rule.metric]?.icon || 'activity', 'accent', 18)}
        <button class="row-main press" data-action="rule-edit" data-id="${esc(rule.id)}"><strong>${esc(rule.name)}</strong><small>${threshold} · 持續 ${rule.duration} 分鐘 · ${esc(scope)}${rule.missingScope ? '（主機已移除）' : ''}</small></button>
        ${toggle('啟用 ' + esc(rule.name), 'rule-toggle', rule.enabled, `data-id="${esc(rule.id)}" ${rule.missingScope ? 'disabled' : ''}`)}
        ${menuButton('規則選單 ' + esc(rule.name), 'rule-menu', rule.id)}
      </div>`;
    }).join('') : empty('bell', '尚未建立規則', '建立規則以保存資源門檻與觸發條件。', button('建立規則', 'rule-new', 'plus', 'primary'))}
    </section>${state.monitor ? '' : `<div class="notice">${icon('info',18)}<span>伺服器端警報評估尚未連線。已儲存的規則會在監控啟用後執行。</span></div>`}`;
}

function settingRow(name, color, title, subtitle, action) {
  return `<div class="setting-row">${figure(name, color, 18)}<div class="row-main"><strong>${title}</strong><small>${subtitle}</small></div>${action}</div>`;
}
function settingsPage() {
  const settings = state.settings;
  return `${head('系統設定', '調整工作區顯示方式與資料更新頻率。')}
    <div class="form-width settings-stack">
      <section class="panel settings-panel">${panelHead('外觀')}
      ${settingRow('monitor', 'accent', '主題', '選擇淺色、深色或跟隨裝置', control('主題', 'set-theme', [['light', '淺色'], ['dark', '深色'], ['system', '跟隨系統']], settings.theme))}
      ${settingRow('layers', 'slate', '介面動態效果', '轉場與按壓回饋遵循裝置的輔助使用設定', toggle('介面動態效果', 'setting-toggle', settings.motion, 'data-value="motion"'))}</section>
      <section class="panel settings-panel">${panelHead('監控與通知')}
      ${settingRow('activity', 'accent', '即時更新', '在最近 1 小時的圖表定期讀取樣本', toggle('即時更新', 'setting-toggle', settings.live, 'data-value="live"'))}
      ${settingRow('clock', 'slate', '更新間隔', '限制即時圖表重繪的頻率', control('更新間隔', 'set-refresh', [['5', '5 秒'], ['15', '15 秒'], ['30', '30 秒']], settings.refresh))}
      ${settingRow('globe', 'slate', '顯示時區', '套用到圖表與系統事件', control('顯示時區', 'set-timezone', [['Asia/Taipei', '台北'], ['Asia/Tokyo', '東京'], ['UTC', 'UTC'], ['America/Los_Angeles', '洛杉磯']], settings.timezone))}
      ${settingRow('bell', 'warning', '通知收件匣', '在工作區顯示事件通知與未讀提示', toggle('通知收件匣', 'setting-toggle', settings.inbox, 'data-value="inbox"'))}</section>
      <section class="panel settings-panel">${panelHead('哨站工具')}${workspaceTools()}</section>
    </div>`;
}

function profilePage() {
  return `${head('個人設定', '管理工作區使用的名稱與聯絡電子郵件。')}
    <section class="panel form-width profile-panel"><div class="profile-summary"><div class="avatar">${initials()}</div><div><h2>${esc(state.profile.name)}</h2><p>工作區管理員</p></div></div>
    <form id="profile-form" class="inline-form" data-form="profile"><label>顯示名稱<input name="name" required maxlength="32" value="${esc(state.profile.name)}" autocomplete="name"></label>
      <label>電子郵件<input type="email" name="email" maxlength="100" value="${esc(state.profile.email)}" autocomplete="email"></label>
      <p class="form-error" role="alert" hidden></p><button class="btn primary press" type="submit">儲存變更</button>
    </form></section>
    <section class="panel form-width settings-panel live-extra">${panelHead('登入與裝置')}
    ${settingRow('monitor','slate','登入裝置','查看目前登入及其他裝置',button('管理', 'host-tool', '', 'secondary', 'data-value="sessions"'))}
    ${settingRow('user','accent','通行金鑰與 PIN 碼','管理這個工作區的登入方式',button('管理', 'host-tool', '', 'secondary', 'data-value="credentials"'))}
    ${settingRow('user','slate','登出','結束這台裝置的登入',button('登出', 'sign-out'))}</section>`;
}

function closeDialog() { if (dialog.open) dialog.close(); }
function dialogContent(title, body, type = '') {
  if (!dialog.open) {
    dialogTrigger = document.activeElement;
    dialog.showModal();
  }
  dialog.className = type;
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2>${iconButton('close', '關閉', 'close')}</div>${body}`;
  ($('[autofocus]', dialog) || $('.dialog-head button', dialog)).focus();
}
dialog.addEventListener('close', () => {
  drawer = null;
  operation = verifyOperation = undefined;
  if (dialogTrigger?.isConnected) dialogTrigger.focus();
  else if (dialogTrigger?.dataset.action) {
    const { action, id } = dialogTrigger.dataset;
    const replacement = [...document.querySelectorAll('[data-action]')].find(element =>
      !element.closest('dialog, [popover]') && element.dataset.action === action && element.dataset.id === id);
    (replacement || content).focus({ preventScroll: true });
  }
});
dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });

const formError = '<p class="form-error" role="alert" hidden></p>';
const field = (label, key, value = '', attributes = '') => `<label>${label}<input name="${key}" value="${esc(value)}" ${attributes}></label>`;
const fieldSelect = (label, key, choices, current) =>
  `<label>${label}<span class="select-wrap"><select name="${key}">${choices.map(([value, title]) => option(value, title, current)).join('')}</select>${icon('down', 15)}</span></label>`;
const formDialog = (type, id, description, fields, submit, danger = false) => `<form class="dialog-form" data-form="${type}" data-id="${esc(id)}">
  <p>${description}</p>${fields}${formError}
  <div class="dialog-actions">${button('取消', 'close')}<button class="btn ${danger ? 'danger' : 'primary'} press" type="submit">${submit}</button></div>
</form>`;

function serverForm(node) {
  dialogContent(node ? '編輯伺服器資料' : '新增伺服器', node
    ? formDialog('server', node.id, '變更主機在哨站中顯示的名稱。',
      field('伺服器名稱', 'name', node.name, 'required maxlength="40" autofocus'), '儲存變更')
    : formDialog('pair', '', '貼上由新主機產生的一次性配對碼。',
      field('配對碼', 'code', '', 'required maxlength="2048" placeholder="VS-…" autocomplete="off" spellcheck="false" autofocus'), '新增伺服器'));
}

const tools = {
  pair: ['配對管理', '產生一次性配對碼，或查看配對狀態', 'server'],
  telegram: ['Telegram 通知', '管理推播目的地與通知保留時間', 'bell'],
  links: ['常用連結', '查看服務的可用性並編輯連結', 'globe'],
  backup: ['備份與還原', '查看備份、建立備份和還原', 'disk'],
  updates: ['主機更新', '檢查哨站、雲端硬碟與系統更新', 'refresh'],
  keepalive: ['閒置主機管理', '查看這台主機的防回收設定', 'activity'],
  security: ['安全檢查', '查看 SSH 與系統安全設定', 'check'],
  cloud: ['雲端硬碟', '驗證身分後開啟主機的檔案空間', 'disk'],
  downloads: ['遠端下載', '管理主機的下載佇列', 'network'],
  notes: ['加密筆記', '管理 Joplin 的同步服務', 'layers'],
  album: ['相簿分享', '管理雲端硬碟的相簿分享', 'layers'],
  adblock: ['廣告攔截', '管理加密 DNS 與 AdGuard Home', 'globe'],
  flights: ['航班動態', '查看四座機場的即時班機', 'activity'],
  flightShare: ['航班分享', '管理有效期限與裝置數量', 'globe'],
  flightRadar: ['機場雷達', '查看機場附近的班機與飛行資料', 'activity'],
  opensky: ['OpenSky 帳號', '設定航班資料服務的憑證', 'globe'],
  traffic: ['流量設定', '調整流量上限、計算方式與重置日', 'network'],
  sessions: ['登入裝置', '查看目前登入及其他裝置', 'monitor'],
  credentials: ['通行金鑰與 PIN 碼', '管理登入方式', 'user'],
  reboot: ['重新開機', '先取得驗證碼，再確認重新開機', 'refresh'],
};

function workspaceTools() {
  return ['pair', 'telegram', 'links', 'backup', 'updates', 'security', 'cloud', 'downloads', 'notes', 'album', 'adblock', 'flights', 'opensky']
    .map(key => settingRow(tools[key][2], 'slate', tools[key][0], tools[key][1], button('開啟', 'host-tool', '', 'secondary', `data-value="${key}" aria-label="開啟${tools[key][0]}"`))).join('');
}

const toolButton = (label, verb, id = '', style = 'secondary') => button(label, 'tool-command', '', style, `data-value="${verb}" data-id="${esc(id)}"`);
const commandFields = (verb, fields, label, description = '') => `<form class="dialog-form tool-form" data-form="tool" data-id="${verb}">
  ${description ? `<p>${description}</p>` : ''}${fields}${formError}<div class="dialog-actions"><button type="submit" class="btn primary press">${label}</button></div></form>`;
const secret = (label, key, attributes = '') => field(label, key, '', `type="password" autocomplete="off" ${attributes}`);
const actionsBar = (...buttons) => `<div class="tool-actions">${buttons.join('')}</div>`;
const rowStatus = (label, description, action = '') => settingRow('info', 'slate', esc(label), esc(description), action);
const toolTime = value => Number.isFinite(value) && value > 0 && value < 8640000000000 ? fullDate(value * 1000) : '—';
const stateName = on => on ? '已啟用' : '未啟用';
const currentTool = () => operation && tools[operation.key];

function toolFlash(text) {
  const status = $('.tool-output', dialog);
  if (!status) return;
  status.hidden = false;
  status.textContent = text;
}

async function withVerification(run, proof) {
  try { return await run(proof); }
  catch (error) {
    if (!error.recheck) throw error;
    verifyOperation = run;
    verificationDialog(error.message);
    return undefined;
  }
}

function verificationDialog(message = '請驗證身分後繼續。') {
  dialogContent('確認身分', formDialog('verify', '', esc(message),
    fieldSelect('驗證方式', 'method', [['password', '哨站密碼'], ...(auth.pin ? [['pin', 'PIN 碼']] : []), ...(auth.has && globalThis.PublicKeyCredential ? [['passkey', '通行金鑰']] : [])], auth.pin ? 'pin' : 'password')
      + secret('密碼或 PIN 碼', 'proof', 'autofocus'), '驗證並繼續'));
}

function safeLink(value, fixedPath = '') {
  try {
    const url = new URL(value, location.origin);
    if (url.username || url.password || (url.protocol !== 'https:' && url.origin !== location.origin)) return '';
    if (fixedPath && url.pathname !== fixedPath) return '';
    return url.href;
  } catch { return ''; }
}

function albumFields(item = {}) {
  return field('相簿名稱', 'name', item.name || '', 'required maxlength="64"')
    + (item.id ? '' : field('雲端硬碟資料夾', 'dir', '', 'required maxlength="512" placeholder="例如 旅行/台北"'))
    + secret(item.id ? '新分享密碼（留空保留目前密碼）' : '分享密碼（選填）', 'pw', 'minlength="4" maxlength="64"')
    + fieldSelect('下載權限','dl',[['0','不開放'],['1','壓縮圖'],['2','原圖']], String(item.dl ?? 0))
    + fieldSelect('可用裝置數','dev',[['0','不限'],['1','1 台'],['3','3 台']], String(item.dev || 0))
    + fieldSelect('拍攝地點','loc',[['false','隱藏'],['true','顯示']], String(item.loc ?? false))
    + field('浮水印文字','wm',item.wm || '', 'maxlength="24"');
}

const shareAnchor = (label, url) => url ? `<a class="btn secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';

function flightRows(data) {
  const name = flight => flight.flight || flight.callsign || flight.cs || flight.fn || flight.id || '—';
  return ['arr','dep','gnd','cargo'].map((group, index) => `<div class="event-group"><h3>${['抵達','出發','機坪','貨機'][index]}</h3>
    ${dataRows(array(data[group]).slice(0, 100).map(x => [name(x),
      [x.org?.city || x.org?.name || x.from, x.dst?.city || x.dst?.name || x.to, x.gate, x.status || x.st].filter(item => typeof item === 'string').join(' · ')]),
    data.loading ? '航班資料準備中。' : '目前沒有航班。')}</div>`).join('');
}

function flightRadar(data, distance) {
  const geo = data.geo || {};
  const fmt = n => +n.toFixed(2);
  const coast = value => typeof value === 'string' && value.length < 500000 && /^[MLZ\d.\s\-]+$/i.test(value) ? value : '';
  const known = new Map();
  for (const key of ['arr','dep','gnd','over','cargo']) {
    for (const point of array(data[key])) {
      if (!point?.id || known.has(point.id) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      if (Math.abs(point.x) > distance || Math.abs(point.y) > distance) continue;
      known.set(point.id, point);
    }
  }
  const aircraft = [...known.values()].slice(0, 160);
  const size = distance * 2;
  return `<div class="radar">
    <svg viewBox="${-distance} ${-distance} ${size} ${size}" role="img" aria-label="機場附近的班機位置">
      <path class="radar-coast" d="${coast(geo.far)}${coast(geo.coast)}"/>
      ${[.33,.66,.98].map(ring => `<circle class="radar-range" r="${fmt(distance * ring)}"/>`).join('')}
      <circle class="radar-origin" r="${fmt(distance / 45)}"/>
      ${aircraft.map(point => `<circle class="radar-plane" cx="${fmt(point.x)}" cy="${fmt(-point.y)}" r="${fmt(distance / 49)}"><title>${esc(point.flight || point.cs || point.id)}</title></circle>`).join('')}
    </svg><small>中心為機場，每側約 ${distance} 公里</small>
  </div>${dataRows(aircraft.map(point => [point.flight || point.callsign || point.cs || point.id, [
    Number.isFinite(point.alt) ? '高度 ' + point.alt + ' ft' : '',
    Number.isFinite(point.gs) ? '速度 ' + point.gs + ' kt' : '',
    point.gate,
  ].filter(Boolean).join(' · ')]), '目前沒有回報位置的班機。')}`;
}

function handoff(result, path) {
  const target = safeLink(result.login, path);
  if (!target || typeof result.ticket !== 'string' || !result.ticket) throw new Error('哨站回傳的登入票無效。');
  const submit = document.createElement('form');
  submit.method = 'POST';
  submit.action = target;
  const ticket = document.createElement('input');
  ticket.type = 'hidden';
  ticket.name = 't';
  ticket.value = result.ticket;
  submit.append(ticket);
  dialog.append(submit);
  submit.submit();
}

function toolMarkup(key, data, node) {
  switch (key) {
    case 'sessions':
      return array(data.list).map(x => rowStatus(x.dev || '裝置', x.me ? '目前裝置' : `上次使用 ${toolTime(x.seen)}`,
        x.me ? '' : toolButton('登出', 'revoke-session', x.id))).join('') || dataRows([]);
    case 'credentials':
      return rowStatus('PIN 碼', stateName(data.pin?.on), data.pin?.on ? toolButton('關閉', 'pin-off') : '')
        + commandFields('pin-set', secret('新的 PIN 碼', 'pin', 'required inputmode="numeric" minlength="4" maxlength="8"'), '設定 PIN 碼')
        + array(data.passkeys?.keys).map(x => rowStatus(x.name || '通行金鑰', '已登記', toolButton('移除', 'passkey-delete', x.id))).join('')
        + (globalThis.PublicKeyCredential ? commandFields('passkey-add', field('通行金鑰名稱', 'name', '', 'required maxlength="40"'), '登記通行金鑰') : '');
    case 'pair':
      return commandFields('pair-code', field('這台哨站的 HTTPS 網址', 'url', location.protocol === 'https:' ? location.origin : '', 'type="url" required'), '產生配對碼')
        + array(data.peers || data.keys).map(x => rowStatus(x.name || x.url || '配對主機', '已配對', x.id ? toolButton('解除', 'pair-revoke', x.id) : '')).join('');
    case 'telegram':
      return rowStatus('通知投遞', stateName(data.on)) + commandFields('telegram-save',
        secret('機器人憑證', 'token') + field('聊天編號', 'chat', data.chat) + field('保留時數（0 為不刪除）', 'keep', data.keep || 0, 'type="number" min="0" max="47" required'), '儲存通知設定')
        + actionsBar(toolButton('傳送測試', 'telegram-test'), ...(data.on ? [toolButton('關閉通知', 'telegram-off')] : []));
    case 'links': {
      const links = array(node?.raw.links).filter(x => !x.fixed);
      return links.map(x => {
        const href = safeLink(x.url);
        return rowStatus(x.name, x.up === false ? '連線異常' : x.up === true ? '可連線' : '等待檢查',
          `${href ? `<a class="btn secondary" href="${esc(href)}" target="_blank" rel="noopener noreferrer">開啟</a>` : ''}${toolButton('移除', 'link-delete', x.url)}`);
      }).join('') + commandFields('link-add', field('連結名稱', 'name', '', 'required maxlength="40"')
        + field('網址', 'url', '', 'required type="url" maxlength="2048"'), '新增連結');
    }
    case 'traffic': {
      const traffic = node?.raw.traffic || {};
      return commandFields('traffic', field('用量上限（GB）', 'limit_gb', traffic.limit_gb ?? (traffic.limit || 0) / 1024 ** 3, 'type="number" min="0" max="1000000" step="any" required')
        + field('每月重置日', 'reset_day', traffic.reset_day ?? 1, 'type="number" min="1" max="28" required')
        + fieldSelect('計算方式', 'count', [['both','雙向合計'],['out','傳送'],['in','接收'],['max','取較大值']], traffic.count || 'both'), '儲存流量設定');
    }
    case 'backup':
      return rowStatus('每日備份', stateName(data.on ?? data.enabled), toolButton(data.on ?? data.enabled ? '停用排程' : '啟用排程', 'backup-schedule', data.on ?? data.enabled ? 'off' : 'on'))
        + rowStatus('最近備份', toolTime(data.ok_t || data.last?.t))
        + actionsBar(toolButton('立即備份', 'backup-run'), `<a class="btn secondary" href="/api/backup-file${esc(nodeQuery(node?.id))}">下載最新備份</a>`,
          toolButton('顯示解密密碼', 'backup-key'), toolButton('還原備份', 'restore-show'));
    case 'updates':
      return rowStatus('哨站', data.has ? '有新版本' : node?.raw.version || '已檢查', toolButton('更新哨站', 'self-update'))
        + rowStatus('雲端硬碟', data.cloud?.has ? '有新版本' : '查看更新', toolButton('更新雲端硬碟', 'cloud-update'))
        + rowStatus('系統套件', node?.raw.update?.running ? '更新中' : '由主機安裝更新', toolButton('更新系統套件', 'system-update'))
        + actionsBar(toolButton('重新檢查', 'tool-reload'));
    case 'keepalive':
      return rowStatus('防回收', stateName(node?.raw.keep?.on), toolButton(node?.raw.keep?.on ? '停用' : '啟用',
        'keepalive', node?.raw.keep?.on ? 'off' : 'on'));
    case 'security':
      return Object.entries(data.sec || {}).filter(([, value]) => ['boolean', 'number', 'string'].includes(typeof value)).map(([key, value]) => {
        const names = { sshpw: 'SSH 密碼登入限制', root: 'root 登入限制', guard: '登入保護', autoupd: '自動安全更新' };
        return rowStatus(names[key] || key, typeof value === 'boolean' ? stateName(value) : value, names[key] && typeof value === 'boolean' ? toolButton(value ? '調整' : '啟用', value ? 'sec-undo' : 'sec-fix', key) : '');
      }).join('') + commandFields('sec-key', field('系統帳號', 'user', data.me || '', 'required maxlength="64"')
        + field('SSH 公開金鑰', 'key', '', 'required maxlength="2048"'), '加入公開金鑰');
    case 'cloud':
      return rowStatus('雲端硬碟', node?.raw.cloud ? '可驗證並開啟' : '主機沒有回報雲端硬碟', toolButton('驗證並開啟', 'cloud-open'));
    case 'downloads':
      return commandFields('download-add', field('下載網址', 'url', '', 'type="url" required maxlength="2048"'), '開始下載')
        + array(data.list).map(x => rowStatus(x.name || '下載工作', x.st === 'ok' ? '下載完成' : x.err || (x.total ? Math.round(100 * x.done / x.total) + '%' : '排隊或下載中'),
          `${x.st === 'bad' ? toolButton('重試', 'download-retry', x.id) : ''}${toolButton(x.st === 'run' ? '停止' : '移除', 'download-stop', x.id)}`)).join('');
    case 'notes':
      return rowStatus('WebDAV 同步', stateName(data.on)) + rowStatus('同步帳號', data.user || '—')
        + actionsBar(toolButton(data.on ? '暫停同步' : '啟用同步', data.on ? 'notes-off' : 'notes-on'),
          ...(data.on ? [toolButton('顯示同步資料', 'notes-show'), toolButton('更換同步密碼', 'notes-new'), toolButton('清除主機筆記', 'notes-wipe')] : []));
    case 'album':
      return commandFields('album-add', albumFields()
        + fieldSelect('有效期限','secs',[['86400','1 天'],['604800','7 天'],['2592000','30 天'],['0','不限']], '604800'), '建立相簿')
        + array(data.list).map(x => {
          const href = typeof x.code === 'string' && /^[a-z\d_-]{4,40}$/i.test(x.code)
            ? safeLink((data.base || location.origin).replace(/\/$/,'') + '/a/' + encodeURIComponent(x.code)) : '';
          return rowStatus(x.name || x.title || '相簿', [x.dir, x.exp ? '到期 ' + toolTime(x.exp) : '沒有期限'].filter(Boolean).join(' · '),
            shareAnchor('開啟分享', href) + toolButton('編輯', 'album-edit', x.id) + toolButton('收回分享', 'album-delete', x.id));
        }).join('');
    case 'adblock':
      return rowStatus('加密 DNS', stateName(data.on)) + rowStatus('DoH', data.doh || '—')
        + actionsBar(toolButton(data.on ? '停用攔截' : '啟用攔截', data.on ? 'adblock-off' : 'adblock-on'),
          ...(data.on ? [toolButton('開啟 AdGuard Home', 'adguard-open'), toolButton('取得 iPhone 描述檔', 'adguard-profile')] : []))
        + (data.on ? commandFields('adguard-domain', field('網域', 'domain', '', 'required maxlength="253"') +
          fieldSelect('處理方式','choice',[['allow','放行'],['unallow','取消放行']], 'allow'), '儲存網域規則') : '');
    case 'flights':
      return commandFields('flight-airport', fieldSelect('機場', 'airport', airports, operation.airport || 'TPE'), '更新航班')
        + actionsBar(toolButton('機場雷達', 'flight-radar-open'), toolButton('管理分享', 'flight-share-open')) + flightRows(data);
    case 'flightRadar':
      return actionsBar(toolButton('30 公里', 'flight-radar-scale', '30'), toolButton('60 公里', 'flight-radar-scale','60'),
        toolButton('120 公里','flight-radar-scale','120'), toolButton('更新','tool-reload'))
        + flightRadar(data, operation.distance || 60);
    case 'flightShare':
      return commandFields('flight-share-add', field('顯示名稱', 'name', '', 'required maxlength="40"')
        + fieldSelect('機場','ap',[['','四個機場'],...airports], operation.airport || 'TPE')
        + fieldSelect('有效期限','secs',[['3600','1 小時'],['21600','6 小時'],['86400','1 天'],['604800','7 天']], '86400')
        + fieldSelect('允許裝置','devs',[['1','1 台'],['3','3 台'],['0','不限']], '1'), '建立分享連結')
        + array(data.list).map(x => rowStatus(x.name || x.ap || '航班分享', `已使用 ${x.used}／${x.max} 台`, toolButton('收回', 'flight-share-delete', x.id))).join('');
    case 'opensky':
      return rowStatus('OpenSky 帳號', stateName(data.on)) + commandFields('opensky-save', field('用戶端 ID', 'id', data.id || '', 'required maxlength="256"')
        + secret('用戶端密鑰', 'secret'), '儲存帳號') + (data.on ? actionsBar(toolButton('移除帳號', 'opensky-off')) : '');
    case 'reboot':
      return data.mode ? commandFields('reboot-go', data.mode === 'tg'
        ? field('Telegram 驗證碼', 'code', '', 'required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"')
        : fieldSelect('驗證方式','method',[['password','主機密碼'],['pin','主機 PIN 碼']],'password') + secret('密碼或 PIN 碼','code','required'),
      '確認重新開機') : actionsBar(toolButton('取得驗證方式', 'reboot-ask'));
  }
}

async function loadTool() {
  const current = operation;
  const { key, id } = current;
  const node = findNode(id);
  const q = nodeQuery(id);
  dialogContent(tools[key][0], `<div class="dialog-body"><p role="status">正在讀取哨站資料…</p></div>`);
  let data = {};
  try {
    const paths = { sessions: ['/api/sessions', 'list'], pair: ['/api/pair-admin', 'status'], telegram: ['/api/telegram', 'status'],
      updates: ['/api/self', 'check'], security: ['/api/sec', 'info'], downloads: ['/api/download', 'list'], notes: ['/api/notes', 'info'],
      album: ['/api/album', 'list'], adblock: ['/api/adblock', 'info'], opensky: ['/api/opensky', 'status'] };
    if (Object.hasOwn(paths, key)) data = await post(paths[key][0] + q, { action: paths[key][1] });
    if (key === 'backup') data = await request('/api/backup' + q);
    if (key === 'flights') data = await request('/api/flights?' + new URLSearchParams({ ap: current.airport || 'TPE' }));
    if (key === 'flightRadar') {
      const ap = current.airport || 'TPE';
      const [flights, geo] = await Promise.all([
        request('/api/flights?' + new URLSearchParams({ ap })),
        request('/api/flights?' + new URLSearchParams({ geo: ap })),
      ]);
      data = { ...flights, geo };
    }
    if (key === 'flightShare') data = await post('/api/fly-share', { op: 'list' });
    if (key === 'credentials') {
      const [pin, passkeys] = await Promise.all([post('/api/pin', { action: 'status' }), post('/api/passkey', { action: 'list' })]);
      data = { pin, passkeys };
    }
    if (!dialog.open || operation !== current) return;
    current.data = data;
    paintTool(node);
  } catch (error) {
    if (dialog.open && operation === current) dialogContent(tools[key][0], `<div class="dialog-body"><p role="alert" class="form-error">${esc(error.message)}</p>${toolButton('重新讀取','tool-reload')}</div>`);
  }
}

function paintTool(node = findNode(operation.id)) {
  const { key, data } = operation;
  dialogContent(tools[key][0], `<div class="tool-body">${node ? `<p class="tool-host">${esc(node.name)}</p>` : ''}
    ${toolMarkup(key, data, node)}<p class="tool-output" role="status" hidden></p></div>`);
}

function openTool(key, id) {
  if (!Object.hasOwn(tools, key)) return;
  operation = { key, id: id || '@self' };
  void loadTool();
}

function confirmTool(verb, id = '') {
  dialogContent('確認操作', formDialog('tool-confirm', verb, '這項操作會變更哨站或主機的設定。',
    `<input type="hidden" name="id" value="${esc(id)}">`, '確認執行', true));
}

const confirmationRequired = new Set(['revoke-session','pin-off','passkey-delete','pair-revoke','telegram-off','link-delete',
  'backup-schedule','self-update','cloud-update','system-update','sec-fix','sec-undo','notes-off','notes-new','notes-wipe',
  'album-delete','adblock-off','opensky-off','download-stop','flight-share-delete','keepalive']);

async function executeTool(verb, fields = {}, id = '', verified) {
  const context = operation;
  if (!context || !dialog.open) return;
  const q = nodeQuery(context.id);
  const requestTool = (path, body, check = verified) => post(path + q, body, { recheck: check });
  const fixed = {
    'revoke-session': ['/api/sessions', { action: 'del', id }],
    'pin-off': ['/api/pin', { action: 'off' }],
    'passkey-delete': ['/api/passkey', { action: 'delete', id }],
    'pair-revoke': ['/api/pair-admin', { action: 'revoke', id }],
    'telegram-save': ['/api/telegram', { action: 'save', token: fields.token, chat: fields.chat, keep: Number(fields.keep) }],
    'telegram-test': ['/api/telegram', { action: 'test', chat: context.data.chat }],
    'telegram-off': ['/api/telegram', { action: 'save', off: true }],
    'traffic': ['/api/traffic', { limit_gb: Number(fields.limit_gb), reset_day: Number(fields.reset_day), count: fields.count }],
    'backup-run': ['/api/backup', { action: 'run' }],
    'backup-schedule': ['/api/backup', { action: 'set', on: id === 'on' }],
    'self-update': ['/api/self', { action: 'update' }],
    'cloud-update': ['/api/self', { action: 'cloud_update' }],
    'system-update': ['/api/update', {}],
    'keepalive': ['/api/keepalive', { on: id === 'on' }],
    'sec-fix': ['/api/sec', { action: 'fix', item: id }],
    'sec-undo': ['/api/sec', { action: 'undo', item: id }],
    'sec-key': ['/api/sec', { action: 'key', user: fields.user, key: fields.key }],
    'download-add': ['/api/download', { action: 'add', url: fields.url }],
    'download-retry': ['/api/download', { action: 'retry', id }],
    'download-stop': ['/api/download', { action: 'stop', id }],
    'album-add': ['/api/album', { action: 'add', dir: fields.dir, name: fields.name, pw: fields.pw, wm: fields.wm,
      secs: Number(fields.secs), loc: fields.loc === 'true', dl: Number(fields.dl), dev: Number(fields.dev) }],
    'album-save': ['/api/album', { action: 'edit', id, name: fields.name, ...(fields.pw && { pw: fields.pw }), wm: fields.wm,
      loc: fields.loc === 'true', dl: Number(fields.dl), dev: Number(fields.dev) }],
    'album-delete': ['/api/album', { action: 'del', id }],
    'flight-share-delete': ['/api/fly-share', { op: 'del', id }],
    'adguard-domain': ['/api/adblock', { action: fields.choice === 'allow' ? 'allow' : 'unallow', domain: fields.domain }],
    'opensky-save': ['/api/opensky', { action: 'save', id: fields.id, secret: fields.secret }],
    'opensky-off': ['/api/opensky', { action: 'off' }],
  };
  if (verb.startsWith('notes-') && ['on','off','show','new','wipe'].includes(verb.slice(6))) {
    fixed[verb] = ['/api/notes', { action: verb.slice(6) }];
  }
  if (verb === 'adblock-on' || verb === 'adblock-off') fixed[verb] = ['/api/adblock', { action: verb.slice(8) }];
  if (verb === 'tool-reload' || verb === 'flight-airport') {
    if (verb === 'flight-airport') context.airport = fields.airport;
    return loadTool();
  }
  if (verb === 'pair-code') {
    const result = await requestTool('/api/pair-admin', { action: 'code', url: fields.url });
    paintTool();
    toolFlash(result.code);
    return;
  }
  if (verb === 'album-edit') {
    const album = array(context.data.list).find(x => x.id === id);
    if (!album) throw new Error('找不到相簿。');
    dialogContent('編輯相簿', commandFields('album-save', albumFields(album) + `<input type="hidden" name="id" value="${esc(id)}">`, '儲存相簿'));
    return;
  }
  if (verb === 'flight-share-open') {
    operation = { key: 'flightShare', id: '@self', airport: context.airport };
    return loadTool();
  }
  if (verb === 'flight-radar-open') {
    operation = { key: 'flightRadar', id: '@self', airport: context.airport, distance: 60 };
    return loadTool();
  }
  if (verb === 'flight-radar-scale') {
    if ([30,60,120].includes(Number(id))) context.distance = Number(id);
    paintTool();
    return;
  }
  if (verb === 'flight-share-add') {
    const result = await post('/api/fly-share', { ap: fields.ap, name: fields.name, secs: Number(fields.secs), devs: Number(fields.devs) });
    await loadTool();
    if (typeof result.code === 'string' && /^fs_[a-z\d]{8}$/i.test(result.code)) {
      const target = new URL(location.href);
      target.hash = '#/flight-share/' + result.code;
      toolFlash(target.href);
    }
    return;
  }
  if (verb === 'adguard-profile') {
    const result = await post('/api/adblock-profile', { url: context.data.doh, name: findNode(context.id)?.name });
    if (typeof result.k !== 'string' || !result.k) throw new Error('哨站未回傳描述檔。');
    const link = document.createElement('a');
    link.href = '/dns.mobileconfig?' + new URLSearchParams({ k: result.k });
    link.download = 'cape-dns.mobileconfig';
    link.click();
    return;
  }
  if (verb === 'pin-set') {
    await requestTool('/api/pin', { action: 'set', pin: await makePin(fields.pin) });
    auth = await capabilities().catch(() => auth);
  } else if (verb === 'passkey-add') {
    await registerPasskey(fields.name, verified);
    auth = await capabilities().catch(() => auth);
  } else if (verb === 'cloud-open' || verb === 'adguard-open') {
    const isCloud = verb === 'cloud-open';
    if (!verified) {
      verifyOperation = proof => executeTool(verb, fields, id, proof);
      verificationDialog();
      return;
    }
    const result = await post(isCloud ? '/api/cloud-open' : '/api/adguard-open', { ...verified, node: context.id === '@self' ? '' : context.id });
    handoff(result, isCloud ? '/cloud-sso' : '/adguard-sso');
    return;
  } else if (verb === 'reboot-ask') {
    context.data = await requestTool('/api/reboot', { action: 'ask' });
    paintTool();
    return;
  } else if (verb === 'reboot-go') {
    const code = fields.method === 'pin' ? await pinProof(fields.code, '/api/pin' + q) : fields.code;
    const result = await requestTool('/api/reboot', { action: 'go', code });
    closeDialog();
    toast(result.message || '主機已收到重新開機的要求');
    return;
  } else if (verb === 'backup-key') {
    const result = await requestTool('/api/backup', { action: 'show_key' });
    paintTool();
    toolFlash(result.key || '主機未回傳密碼。');
    return;
  } else if (verb === 'restore-show') {
    if (context.id !== '@self') throw new Error('備份還原需在要還原的主機上操作。');
    dialogContent('還原備份', `<form class="dialog-form" data-form="restore" data-id="">
      <p>還原會覆寫主機上備份所含的設定。請確認已選擇正確的備份。</p>
      <label>備份檔（分段檔請一次選齊）<input name="backup" type="file" accept=".vsbk" multiple required></label>${secret('備份密碼','pw','required')}${formError}
      <div class="dialog-actions">${button('取消','close')}<button class="btn danger press" type="submit">開始還原</button></div></form>`);
    return;
  } else if (verb === 'link-add' || verb === 'link-delete') {
    const links = array(findNode(context.id)?.raw.links).filter(x => !x.fixed).map(x => ({ name: x.name, url: x.url }));
    const result = verb === 'link-delete' ? links.filter(x => x.url !== id) : [...links, { name: fields.name, url: fields.url }];
    await requestTool('/api/links', { links: result });
    await api.getWorkspace();
  } else if (Object.hasOwn(fixed, verb)) {
    const result = await requestTool(...fixed[verb]);
    if (verb === 'notes-show' || verb === 'notes-new' || verb === 'notes-on') {
      context.data = result;
      paintTool();
      if (result.pw || result.ek) toolFlash([result.url, result.pw ? '同步密碼 ' + result.pw : '', result.ek ? '加密密碼 ' + result.ek : ''].filter(Boolean).join(' · '));
      return;
    }
    toast(result.message || '哨站已完成操作');
    if (['keepalive','traffic','system-update'].includes(verb)) await api.getWorkspace(true).catch(() => {});
  } else throw new Error('未知的工具操作。');
  if (dialog.open && context === operation) await loadTool();
}

async function handleToolClick(trigger) {
  const verb = trigger.dataset.value;
  const id = trigger.dataset.id;
  if (confirmationRequired.has(verb)) return confirmTool(verb, id);
  trigger.disabled = true;
  try { await withVerification(proof => executeTool(verb, {}, id, proof)); }
  catch (error) { toolFlash(error.message); }
  finally { trigger.disabled = false; }
}

function showLogin(message = '') {
  ready = false;
  firstPaint = true;
  clearInterval(refreshTimer);
  closeDialog();
  api.clear();
  for (const id of ['sidebar', 'topbar', 'mobile-nav']) document.getElementById(id).innerHTML = '';
  document.body.dataset.auth = 'login';
  content.setAttribute('aria-busy', 'false');
  document.title = '登入 | 岬角 Cape';
  content.innerHTML = `<section class="panel auth-panel">
    <div class="profile-summary"><span class="brand-mark">${icon('logo',23)}</span><div><h1>登入岬角 Cape</h1><p>使用哨站的登入方式進入工作區。</p></div></div>
    <form class="inline-form" data-form="login"><p class="form-error" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</p>
      ${fieldSelect('登入方式','method', [['password','哨站密碼'], ...(auth.pin ? [['pin','PIN 碼']] : []), ...(auth.has && globalThis.PublicKeyCredential ? [['passkey','通行金鑰']] : [])], auth.pin ? 'pin' : 'password')}
      ${field('密碼或 PIN 碼','credential','','type="password" required autocomplete="current-password"')}
      <label class="auth-remember"><input type="checkbox" name="keep" checked>在這台裝置保持登入</label>
      <button class="btn primary press" type="submit">登入</button>
    </form></section>`;
}

function setupPin() {
  ready = false;
  document.body.dataset.auth = 'login';
  content.setAttribute('aria-busy', 'false');
  content.innerHTML = `<section class="panel auth-panel">
    <div class="profile-summary"><span class="brand-mark">${icon('logo',23)}</span><div><h1>設定自己的 PIN 碼</h1><p>首次使用前，請先更換哨站提供的臨時 PIN 碼。</p></div></div>
    <form class="inline-form" data-form="setup-pin">${secret('新的 PIN 碼','pin','inputmode="numeric" required minlength="4" maxlength="8"')}${formError}
    <button class="btn primary press" type="submit">設定並繼續</button>${button('登出','sign-out')}</form></section>`;
}

function connectionFailure(message) {
  ready = false;
  document.body.dataset.auth = 'login';
  content.setAttribute('aria-busy', 'false');
  content.innerHTML = empty('warning', '無法連線至哨站', esc(message), button('重新連線','reconnect','refresh','primary'));
}

async function showFlightGuest(code) {
  document.body.dataset.auth = 'login';
  document.title = '航班動態 | 岬角 Cape';
  const key = 'cape:flight:' + code;
  const load = async (ticket, airport, restricted) => {
    const data = await request('/api/flights?' + new URLSearchParams({ ap: airport }), { share: code + ':' + ticket, anonymous: true });
    content.setAttribute('aria-busy', 'false');
    content.innerHTML = `${head('航班動態', esc(data.ap?.name || '即時航班分享'))}
      <section class="panel event-panel"><form class="table-controls" aria-label="更新航班">
        ${restricted ? '' : control('機場','shared-airport',airports,airport)}<button class="btn secondary press" type="submit">更新航班</button>
      </form>${flightRows(data)}</section>`;
    $('form', content).addEventListener('submit', async event => {
      event.preventDefault();
      try { await load(ticket, restricted || $('#shared-airport').value, restricted); }
      catch (error) { failed(error); }
    });
  };
  const failed = error => {
    content.setAttribute('aria-busy', 'false');
    content.innerHTML = empty('warning', '無法開啟航班分享', esc(error.message));
  };
  try {
    let previous = '';
    try { previous = localStorage.getItem(key) || ''; } catch { /* Browser storage is optional. */ }
    const result = await post('/api/fly-claim', { code, dev: previous }, { anonymous: true });
    try { localStorage.setItem(key, result.dev); } catch { /* The page keeps the ticket in memory. */ }
    await load(result.dev, result.ap || 'TPE', result.ap);
  } catch (error) { failed(error); }
}

async function enterWorkspace() {
  try {
    state = await api.getWorkspace();
    auth = await capabilities();
    if (auth.temp) { setupPin(); return; }
    delete document.body.dataset.auth;
    ready = true;
    telemetryError = '';
    dataFrame = frame = Date.now();
    readRoute();
    resetTimer();
    const go = new URLSearchParams(location.search).get('go');
    if (go === 'cloud' || go === 'flights') openTool(go);
  } catch (error) {
    if (error.mustPin) setupPin();
    else if (error.status === 401) {
      try { auth = await capabilities(); showLogin(); }
      catch (failure) { connectionFailure(failure.message); }
    } else connectionFailure(error.message);
  }
}

async function restoreInstall(code) {
  document.body.dataset.auth = 'login';
  content.setAttribute('aria-busy', 'false');
  const headers = { 'X-Requested-With': '1', 'X-Restore-Code': code };
  const client = async (path, options = {}) => {
    const response = await fetch('/api/' + path, { ...options, cache: 'no-store', credentials: 'omit', headers: { ...headers, ...options.headers } });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || data.error || '還原代碼無效。');
    return data;
  };
  content.innerHTML = `<section class="panel auth-panel"><div class="profile-summary">
    <span class="brand-mark">${icon('logo',23)}</span><div><h1>還原備份</h1><p>還原會覆寫備份所含的主機設定。</p></div></div>
    <form id="install-restore" class="inline-form"><label>備份檔（分段檔請一次選齊）<input type="file" name="backup" multiple accept=".vsbk" required></label>
    ${secret('備份密碼','pw','required')}${formError}
    <button type="submit" class="btn danger press">開始還原</button></form>
    <p class="tool-output" role="status"></p></section>`;
  const form = $('#install-restore');
  const status = $('.tool-output', content);
  const error = $('.form-error', form);
  const submit = $('button[type=submit]', form);
  const check = async () => {
    try {
      const data = await client('restore');
      const progress = data.progress || {};
      status.textContent = progress.error || progress.log?.at(-1) || data.message || (data.stage === 'running' ? '主機正在還原。' : '');
      if (data.stage === 'running') setTimeout(check, 2000);
    } catch (failure) { error.textContent = failure.message; error.hidden = false; }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    error.hidden = true;
    try {
      const data = new FormData(form);
      await client('restore-upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: assembleBackup(data.getAll('backup')) });
      await client('restore-run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({pw: data.get('pw')}) });
      form.reset();
      form.hidden = true;
      status.textContent = '主機已開始還原。';
      void check();
    } catch (failure) { error.textContent = failure.message; error.hidden = false; }
    finally { submit.disabled = false; }
  });
  await check();
}

function ruleForm(rule) {
  const scopes = [['', '所有伺服器'], ...state.servers.map(node => [node.id, node.name])];
  if (rule?.missingScope) scopes.push([rule.serverId, rule.missingScope + '（已移除）']);
  dialogContent(rule ? '編輯警報規則' : '建立警報規則', formDialog('rule', rule?.id, '設定要監控的資源、觸發條件和持續時間。',
    `${field('規則名稱', 'name', rule?.name, 'required maxlength="48" placeholder="例如 CPU 負載偏高" autofocus')}
    ${fieldSelect('伺服器範圍', 'serverId', scopes, rule?.serverId || '')}
    ${fieldSelect('監控指標', 'metric', Object.entries(alertMetrics), rule?.metric || 'cpu')}
    <div class="field-pair">${field('門檻（%）', 'threshold', rule?.threshold || 80, 'required type="number" min="1" max="100"')}
    ${field('持續時間（分鐘）', 'duration', rule?.duration ?? 5, 'type="number" min="1" max="1440" required')}</div>`,
    rule ? '儲存變更' : '建立規則'));
  syncRuleForm();
}

function syncRuleForm() {
  const metric = $('[name=metric]', dialog).value;
  const threshold = $('[name=threshold]', dialog);
  const unit = metric === 'rx' || metric === 'tx' ? 'Mbps' : '%';
  const label = threshold.parentElement;
  label.firstChild.textContent = '門檻（' + unit + '）';
  label.hidden = metric === 'offline';
  threshold.disabled = metric === 'offline';
  threshold.max = unit === '%' ? 100 : 1000000;
}

function inbox() {
  drawer = 'inbox';
  const events = state.settings.inbox ? state.events.filter(event => !ui.unreadOnly || !state.read.includes(event.id)) : [];
  dialogContent('通知中心', `<div class="drawer-content">
    <div class="inbox-controls"><div class="segment" aria-label="通知範圍">
      <button class="press" data-action="inbox-filter" data-value="all" aria-pressed="${!ui.unreadOnly}">全部</button>
      <button class="press" data-action="inbox-filter" data-value="unread" aria-pressed="${ui.unreadOnly}">未讀</button></div>
      ${button('全部標為已讀', 'read-all', 'check', 'quiet', unread() ? '' : 'disabled')}</div>
    ${events.map(event => eventRow(event, true)).join('') || (state.settings.inbox
      ? empty('bell', ui.unreadOnly ? '未讀通知已清空' : '尚無通知', '新的工作區事件會顯示於此。')
      : empty('bell', '通知收件匣已關閉', '你可以在系統設定重新開啟。', '<a href="#/settings" class="btn secondary" data-close>前往系統設定</a>'))}
  </div>`, 'drawer');
}

function openEvent(event) {
  if (!event) return;
  const wasInbox = drawer === 'inbox';
  api.read([event.id]);
  drawer = wasInbox ? 'event' : null;
  const [type, name] = kinds[event.kind];
  dialogContent('事件詳情', `<div class="dialog-body">
    ${wasInbox ? button('返回通知', 'inbox', 'back', 'quiet') : ''}
    <div class="event-feature">${figure(name, event.kind, 22)}<div><h3>${esc(event.title)}</h3><p>${esc(event.detail)}</p></div></div>
    ${definitionGrid([['嚴重程度', type], ['發生時間', fullDate(event.time)], ['伺服器', esc(eventName(event))]])}
    ${findNode(event.serverId) ? `<a href="${slug(hostPath(event.serverId))}" class="btn primary" data-close>查看伺服器</a>` : ''}
  </div>`, wasInbox ? 'drawer' : '');
}

function searchDialog() {
  dialogContent('搜尋伺服器', `<div class="search-dialog-body">
    <label class="search-field">${icon('search', 19)}<input type="search" id="global-search" autofocus placeholder="輸入名稱、IP 或區域…" aria-label="搜尋伺服器"></label>
    <div id="search-results"></div>
  </div>`, 'search-dialog');
  updateSearch('');
}

function updateSearch(value) {
  const nodes = filteredNodes(value, 'all');
  $('#search-results').innerHTML = nodes.length ? nodes.map(node => `<a class="search-row press" href="${slug(hostPath(node.id))}" data-close>${figure('server', 'host', 17)}
    <span><strong>${esc(node.name)}</strong><small>${esc(node.region)} · ${esc(node.ip)}</small></span>${badge(node.status)}</a>`).join('') :
    empty('search', '找不到主機', '試試其他名稱或 IP 位址。');
}

function contextual(trigger, items) {
  if (menu.matches(':popover-open')) {
    const same = menuTrigger === trigger;
    menu.hidePopover();
    if (same) return;
  }
  menuTrigger = trigger;
  menu.innerHTML = `<div role="menu" aria-label="${esc(trigger.getAttribute('aria-label'))}">${items.map(([label, glyph, action, id, danger]) =>
    `${danger ? '<div class="menu-divider" role="separator"></div>' : ''}<button type="button" role="menuitem" tabindex="-1" class="press ${danger ? 'danger-text' : ''}" data-action="${action}" data-id="${esc(id)}">${icon(glyph, 17)}${label}</button>`).join('')}</div>`;
  const rect = trigger.getBoundingClientRect();
  menu.showPopover({ source: trigger });
  const { offsetWidth: width, offsetHeight: height } = menu;
  const viewport = visualViewport || { width: innerWidth, height: innerHeight, offsetLeft: 0, offsetTop: 0 };
  const { offsetLeft: left, offsetTop: top } = viewport;
  const bottom = top + viewport.height;
  const below = rect.bottom + height + 14 <= bottom || rect.top - top < bottom - rect.bottom;
  const x = Math.max(left + 8, Math.min(left + viewport.width - width - 8, rect.right - width));
  const y = below ? rect.bottom + 6 : rect.top - height - 6;
  menu.style.left = x + 'px';
  menu.style.top = Math.max(top + 8, Math.min(bottom - height - 8, y)) + 'px';
  menu.style.transformOrigin = `${Math.max(0, Math.min(width, rect.right - x))}px ${below ? 'top' : 'bottom'}`;
  trigger.setAttribute('aria-expanded', 'true');
  menu.querySelector('[role=menuitem]').focus({ preventScroll: true });
}

menu.addEventListener('beforetoggle', event => {
  if (event.newState !== 'closed' || !menuTrigger) return;
  menuTrigger.setAttribute('aria-expanded', 'false');
  menuTrigger = null;
});

function toast(message, glyph = 'circleCheck') {
  clearTimeout(toastTimer);
  $('#toast').innerHTML = `<div class="toast">${icon(glyph, 19)}<span>${esc(message)}</span></div>`;
  toastTimer = setTimeout(() => { $('#toast').innerHTML = ''; }, 3500);
}

function notify(durable, text) {
  toast(durable ? text : text + '（僅保留於目前分頁）', durable ? 'circleCheck' : 'warning');
}

function attachGraphs() {
  const nodes = route.id ? state.servers.filter(node => node.id === route.id) : state.servers;
  content.querySelectorAll('[data-graph]').forEach(graphEl => {
    bindChart(graphEl, graphDefinition(nodes, graphEl.dataset.graph, graphEl.dataset.keys.split(',')));
  });
}

function redrawGraphs(force = false) {
  if (!ready) return;
  const nodes = route.id ? state.servers.filter(node => node.id === route.id) : state.servers;
  content.querySelectorAll('[data-graph]').forEach(graphEl => {
    if (!force && graphEl.querySelector('.plot:is(:hover,:focus)')) return;
    const id = graphEl.dataset.graph;
    const keys = graphEl.dataset.keys.split(',');
    const definition = graphDefinition(nodes, id, keys);
    $('.legend', graphEl).innerHTML = legend(nodes, keys);
    const slot = $('.plot-slot', graphEl);
    slot.innerHTML = chartMarkup(definition);
    bindChart(slot, definition);
  });
  if ($('[data-last-update]')) $('[data-last-update]').textContent = '更新於 ' + clock(dataFrame || frame);
}

async function refresh(force = false) {
  if (!ready || (!force && (!state.settings.live || document.hidden))) return;
  const hadError = Boolean(telemetryError);
  try {
    await api.getWorkspace();
    if (!ready) return;
    dataFrame = Date.now();
    if (ui.range === '1h') frame = dataFrame;
    telemetryError = '';
    if (hadError) render();
    else redrawGraphs();
    if (force) toast('監控資料已更新');
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error.status === 401) { showLogin('登入已到期，請重新登入。'); return; }
    telemetryError = error.message;
    if (!hadError) render();
    if (force) toast(error.message, 'warning');
  }
}

async function refreshHistory() {
  if (!ready || (route.page !== 'overview' && !route.id) || route.id && ui.detailTab !== 'monitor') return;
  const current = ++historyEpoch;
  const nodes = route.id ? state.servers.filter(host => host.id === route.id) : state.servers;
  const failures = await api.loadHistory(nodes, ui.range);
  if (current !== historyEpoch || !ready) return;
  if (failures.some(({error}) => error.status === 401)) { showLogin('登入已到期，請重新登入。'); return; }
  redrawGraphs();
  if (failures.length) toast('部分歷史樣本暫時無法取得。', 'warning');
}

function resetTimer() {
  clearInterval(refreshTimer);
  if (state.settings.live) refreshTimer = setInterval(refresh, Number(state.settings.refresh) * 1000);
}

const pages = { overview, servers: serverList, events: eventsPage, alerts: alertsPage, settings: settingsPage, profile: profilePage };
function render(animate = false, from = '') {
  theme();
  const focused = document.activeElement;
  const focusId = focused?.id;
  const action = focused?.dataset.action;
  const identity = focused?.dataset.id;
  const value = focused?.dataset.value;
  const focusScope = focused?.closest('#topbar') ? $('#topbar') : focused?.closest('#content') ? content : null;
  sidebar();
  topbar();
  content.innerHTML = `<div class="page" data-page="${route.page}" ${animate ? 'data-enter="' + from + '"' : ''}>${route.id ? serverDetail(findNode(route.id)) : pages[route.page]()}</div>`;
  content.setAttribute('aria-busy', 'false');
  document.title = (route.id ? findNode(route.id)?.name || '伺服器' : route.page === 'overview' ? '基礎架構總覽' : labels[route.page]) + ' | 岬角 Cape';
  attachGraphs();
  if (!animate && !dialog.open) {
    const replacement = focusId ? document.getElementById(focusId) : focusScope && action
      ? [...focusScope.querySelectorAll('[data-action]')].find(element => element.dataset.action === action && element.dataset.id === identity && element.dataset.value === value)
      : null;
    if (replacement) replacement.focus({ preventScroll: true });
  }
}

function readRoute() {
  if (!ready) return;
  historyEpoch++;
  const [path, search] = location.hash.replace(/^#\/?/, '').split('?');
  const [page, rawId] = path.split('/');
  const candidate = Object.hasOwn(pages, page) ? page : 'overview';
  let id;
  try { id = candidate === 'servers' && rawId ? decodeURIComponent(rawId) : undefined; } catch { id = undefined; }
  const old = route;
  route = { page: candidate, id };
  if (search && candidate === 'servers') {
    const status = new URLSearchParams(search).get('status');
    ui.serverFilter = Object.hasOwn(statuses, status) ? status : 'all';
    ui.serverQuery = '';
  }
  if (old.id !== id) { ui.detailTab = 'monitor'; ui.range = '1h'; }
  if (dialog.open) closeDialog();
  if (menu.matches(':popover-open')) menu.hidePopover();
  const direction = id ? 'forward' : old.id ? 'backward'
    : nav.findIndex(([key]) => key === candidate) < nav.findIndex(([key]) => key === old.page) ? 'tab-backward' : 'tab-forward';
  render(!firstPaint, direction);
  if (!firstPaint) {
    window.scrollTo(0, 0);
    content.focus({ preventScroll: true });
  }
  firstPaint = false;
  void refreshHistory();
}

function updateServerRows() {
  const nodes = filteredNodes();
  $('#server-results').innerHTML = serverTable(nodes);
  $('#server-count').textContent = `${nodes.length} 台／共 ${state.servers.length} 台伺服器`;
}

const actions = {
  theme: () => api.updateSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }),
  search: searchDialog,
  inbox,
  'inbox-filter': trigger => {
    ui.unreadOnly = trigger.dataset.value === 'unread';
    inbox();
    $('[aria-pressed=true]', dialog).focus();
  },
  'read-all': () => { notify(api.read(state.events.map(event => event.id)), '所有通知已標為已讀'); inbox(); },
  close: closeDialog,
  range: trigger => { ui.range = trigger.dataset.value; frame = Date.now(); render(); void refreshHistory(); },
  metric: trigger => { ui.metric = trigger.dataset.value; render(); },
  'detail-tab': trigger => { ui.detailTab = trigger.dataset.value; render(); void refreshHistory(); },
  refresh: async () => { await refresh(true); await refreshHistory(); },
  reconnect: enterWorkspace,
  'sign-out': async () => {
    try { await post('/api/sessions', { action: 'out' }); showLogin(); }
    catch (error) {
      if (error.status === 401) showLogin();
      else toast(error.message, 'warning');
    }
  },
  'host-tool': trigger => openTool(trigger.dataset.value, trigger.dataset.id),
  'tool-command': handleToolClick,
  event: trigger => openEvent(state.events.find(event => event.id === trigger.dataset.id)),
  'server-new': () => serverForm(),
  'server-edit': trigger => { const node = findNode(trigger.dataset.id); if (node) serverForm(node); },
  'server-clear': () => { ui.serverFilter = 'all'; ui.serverQuery = ''; render(); $('#server-query')?.focus(); },
  'server-menu': trigger => contextual(trigger, [
    ['查看監控', 'activity', 'go-server', trigger.dataset.id], ['編輯資料', 'edit', 'server-edit', trigger.dataset.id],
    ...(findNode(trigger.dataset.id)?.ip !== '—' ? [['複製 IP 位址', 'copy', 'copy-ip', trigger.dataset.id]] : []),
    ['主機工具', 'settings', 'host-tools', trigger.dataset.id],
    ...(trigger.dataset.id === '@self' ? [] : [['移除伺服器', 'trash', 'server-remove', trigger.dataset.id, true]]),
  ]),
  'host-tools': trigger => {
    const host = findNode(trigger.dataset.id);
    if (!host) return;
    const entries = ['traffic','links','backup','updates','keepalive','security','cloud','downloads','notes','album','adblock','reboot'];
    dialogContent('主機工具', `<div class="tool-body"><p class="tool-host">${esc(host.name)}</p>
      ${entries.map(key => settingRow(tools[key][2], 'slate', tools[key][0], tools[key][1],
        button('開啟','host-tool','','secondary',`data-value="${key}" data-id="${esc(host.id)}" aria-label="開啟${tools[key][0]}"`))).join('')}</div>`);
  },
  'go-server': trigger => { location.hash = slug(hostPath(trigger.dataset.id)); },
  'copy-ip': async trigger => {
    const node = findNode(trigger.dataset.id);
    if (!node) return;
    try { await navigator.clipboard.writeText(node.ip); toast('已複製 IP 位址'); }
    catch { dialogContent('複製 IP 位址', `<div class="dialog-body"><input value="${esc(node.ip)}" readonly autofocus aria-label="IP 位址"></div>`); $('input', dialog).select(); }
  },
  'server-remove': trigger => {
    const node = findNode(trigger.dataset.id);
    if (node) dialogContent('移除伺服器', formDialog('remove-server', node.id, `要移除 ${esc(node.name)}？此主機的事件仍可查詢，專用警報會停用。`, '', '移除伺服器', true));
  },
  'rule-new': () => ruleForm(),
  'rule-edit': trigger => ruleForm(state.rules.find(rule => rule.id === trigger.dataset.id)),
  'rule-toggle': async trigger => {
    const enabled = trigger.getAttribute('aria-checked') === 'true';
    if (trigger.getAttribute('aria-busy') === 'true') return;
    trigger.setAttribute('aria-busy', 'true');
    try { notify(await api.toggleRule(trigger.dataset.id), enabled ? '規則已停用' : '規則已啟用'); }
    catch (error) { toast(error.message, 'warning'); }
    finally { trigger.removeAttribute('aria-busy'); }
  },
  'rule-menu': trigger => contextual(trigger, [
    ['編輯規則', 'edit', 'rule-edit', trigger.dataset.id], ['刪除規則', 'trash', 'rule-remove', trigger.dataset.id, true],
  ]),
  'rule-remove': trigger => {
    const rule = state.rules.find(item => item.id === trigger.dataset.id);
    if (rule) dialogContent('刪除警報規則', formDialog('remove-rule', rule.id, `要刪除「${esc(rule.name)}」？`, '', '刪除規則', true));
  },
  'setting-toggle': trigger => {
    const key = trigger.dataset.value;
    notify(api.updateSettings({ [key]: !state.settings[key] }), '設定已更新');
  },
};

document.addEventListener('click', event => {
  if (!ready) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'reconnect' || action === 'sign-out') void actions[action]();
    return;
  }
  if (event.target.closest('.skip')) {
    event.preventDefault();
    content.focus();
    content.scrollIntoView({ block: 'start' });
    return;
  }
  const trigger = event.target.closest('[data-action]');
  if (trigger) {
    if (trigger.hasAttribute('popovertarget')) event.preventDefault();
    if (menu.contains(trigger)) {
      const invoker = menuTrigger;
      menu.hidePopover();
      invoker?.focus({ preventScroll: true });
    }
    actions[trigger.dataset.action]?.(trigger);
    return;
  }
  if (event.target.closest('[data-close]')) closeDialog();
  if (event.target.closest('a, button') || event.metaKey || event.ctrlKey || event.shiftKey) return;
  const row = event.target.closest('[data-href]');
  if (row) location.hash = row.dataset.href;
});

document.addEventListener('input', event => {
  if (event.target.id === 'server-query') { ui.serverQuery = event.target.value; updateServerRows(); }
  if (event.target.id === 'global-search') updateSearch(event.target.value);
});

document.addEventListener('change', event => {
  const { id, value } = event.target;
  if (event.target.name === 'method' && event.target.form?.dataset.form === 'login') {
    const credential = event.target.form.elements.credential;
    credential.required = value !== 'passkey';
    credential.disabled = value === 'passkey';
    credential.closest('label').hidden = value === 'passkey';
  }
  if (id === 'server-filter') { ui.serverFilter = value; updateServerRows(); }
  if (id === 'event-filter') { ui.eventFilter = value; render(); }
  if (id === 'event-server') { ui.eventServer = value; render(); }
  if (id.startsWith('set-')) notify(api.updateSettings({ [id.slice(4)]: value }), '設定已更新');
  if (event.target.name === 'metric' && dialog.open) syncRuleForm();
});

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector('[type=submit]');
  if (submit.disabled) return;
  const raw = new FormData(form);
  const fields = Object.fromEntries([...raw].map(([key, value]) => [key, typeof value === 'string' && !['pw','proof','credential','token','secret'].includes(key) ? value.trim() : value]));
  const error = $('.form-error', form);
  const type = form.dataset.form;
  const id = form.dataset.id || undefined;
  const label = submit.textContent;
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = '處理中…';
  try {
    if ('name' in fields && !fields.name) throw new Error('請輸入名稱。');
    if (type === 'login') {
      await signIn(fields.method, fields.credential, raw.has('keep'));
      form.elements.credential.value = '';
      await enterWorkspace();
    }
    if (type === 'setup-pin') {
      await post('/api/pin', { action: 'set', pin: await makePin(fields.pin) });
      await enterWorkspace();
    }
    if (type === 'verify') {
      const run = verifyOperation;
      if (!run) throw new Error('請重新開啟操作。');
      const proof = fields.method === 'pin' ? { pin: await pinProof(fields.proof) }
        : fields.method === 'passkey' ? await passkeyProof() : { pw: fields.proof };
      await run(proof);
      verifyOperation = undefined;
    }
    if (type === 'tool' || type === 'tool-confirm') {
      await withVerification(proof => executeTool(id, fields, fields.id, proof));
    }
    if (type === 'restore') {
      const upload = await fetch('/api/restore-upload', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'X-Requested-With': '1', 'Content-Type': 'application/octet-stream' }, body: assembleBackup(raw.getAll('backup')) });
      const result = await upload.json();
      if (!upload.ok || !result.ok) throw new Error(result.message || '上傳備份失敗。');
      const started = await post('/api/restore-run', { pw: fields.pw });
      toast(started.message || '主機已開始還原');
      closeDialog();
    }
    if (type === 'pair') {
      if (!fields.code.startsWith('VS-')) throw new Error('請確認配對碼以 VS- 開頭。');
      await api.pair(fields.code);
      closeDialog();
      toast('伺服器已配對');
      if (location.hash === slug('servers')) render();
      else location.hash = slug('servers');
    }
    if (type === 'server') {
      const result = await api.saveServer(fields, id);
      closeDialog();
      notify(result.durable, id ? '伺服器資料已更新' : '伺服器已新增');
      if (!id) location.hash = slug(hostPath(result.id));
      else render();
    }
    if (type === 'rule') {
      fields.threshold = Number(fields.threshold || 0);
      fields.duration = Number(fields.duration);
      const durable = await api.saveRule(fields, id);
      closeDialog();
      notify(durable, id ? '規則已更新' : '規則已建立');
    }
    if (type === 'profile') {
      notify(await api.saveProfile(fields), '個人設定已儲存');
      $('#profile-form button')?.focus();
    }
    if (type === 'remove-server') {
      const durable = await api.removeServer(id);
      closeDialog();
      if (route.id === id) location.hash = slug('servers');
      else render();
      notify(durable, '伺服器已移除');
    }
    if (type === 'remove-rule') {
      const durable = await api.removeRule(id);
      closeDialog();
      notify(durable, '規則已刪除');
    }
  } catch (failure) {
    error.textContent = failure.message || '儲存失敗，請再試一次。';
    error.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = label;
  }
});

document.addEventListener('keydown', event => {
  if (!ready) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (!dialog.open) searchDialog();
  }
  if (event.key === 'Enter' && event.target.id === 'global-search') $('#search-results a')?.click();
  if (!menu.matches(':popover-open')) return;
  if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') event.preventDefault();
    const trigger = menuTrigger;
    menu.hidePopover();
    trigger?.focus({ preventScroll: true });
    return;
  }
  const items = [...menu.querySelectorAll('[role=menuitem]')];
  const index = items.indexOf(document.activeElement);
  const next = { ArrowDown: (index + 1) % items.length, ArrowUp: (index - 1 + items.length) % items.length, Home: 0, End: items.length - 1 };
  if (event.key in next) { event.preventDefault(); items[next[event.key]].focus(); }
});

document.addEventListener('click', event => {
  if (!state?.settings.motion || reduced.matches || !event.detail) return;
  const target = event.target.closest('.press');
  if (!target || target.disabled) return;
  const rect = target.getBoundingClientRect();
  const wave = document.createElement('span');
  wave.className = 'ripple';
  wave.style.left = event.clientX - rect.left + 'px';
  wave.style.top = event.clientY - rect.top + 'px';
  const size = Math.max(rect.width, rect.height) * 2.25;
  wave.style.width = wave.style.height = size + 'px';
  target.append(wave);
  wave.addEventListener('animationend', () => wave.remove(), { once: true });
});

const updateTheme = () => { if (ready) { theme(); topbar(); } };
dark.addEventListener('change', updateTheme);

function syncSwitch(change) {
  if (change?.type === 'rule-toggle') {
    const rule = state.rules.find(item => item.id === change.id);
    const control = content.querySelector(`[data-action="rule-toggle"][data-id="${CSS.escape(change.id)}"]`);
    if (control && rule) {
      control.setAttribute('aria-checked', String(rule.enabled));
      $('.rule-list .panel-head p').textContent = state.rules.filter(item => item.enabled).length + ' 個啟用中';
      return true;
    }
  }
  const key = change?.type === 'settings' && change.keys.length === 1 ? change.keys[0] : '';
  if (!['motion', 'live', 'inbox'].includes(key)) return false;
  const control = content.querySelector(`[data-action="setting-toggle"][data-value="${key}"]`);
  if (!control) return false;
  theme();
  control.setAttribute('aria-checked', String(state.settings[key]));
  if (key === 'inbox') topbar();
  return true;
}

async function start() {
  const restore = new URLSearchParams(location.search).get('restore');
  if (restore) { await restoreInstall(restore); return; }
  const share = /^#\/flight-share\/(fs_[a-z\d]{8})$/i.exec(location.hash);
  if (share) {
    document.addEventListener('click', event => {
      if (!event.target.closest('.skip')) return;
      event.preventDefault();
      content.focus();
    });
    addEventListener('hashchange', () => location.reload());
    await showFlightGuest(share[1]);
    return;
  }
  api.subscribe((next, change) => {
    const previous = state;
    const changedTimer = previous && (previous.settings.refresh !== next.settings.refresh || previous.settings.live !== next.settings.live);
    state = next;
    if (!ready) return;
    if (changedTimer) resetTimer();
    if (change?.type === 'telemetry') {
      const eventChanged = previous.events.length !== next.events.length || previous.events[0]?.id !== next.events[0]?.id;
      const rows = snapshot => snapshot.servers.map(({ id, name, status, cpu, ram, disk, ip, region }) => [id, name, status, cpu, ram, disk, ip, region]);
      const hostsChanged = JSON.stringify(rows(previous)) !== JSON.stringify(rows(next));
      if (eventChanged) topbar();
      if (dialog.open || menu.matches(':popover-open') || $('.plot:is(:hover,:focus)')) return;
      if (route.page === 'servers' && !route.id && document.activeElement?.id === 'server-query') {
        if (hostsChanged) updateServerRows();
        return;
      }
      const wholePanel = route.page === 'overview' && (eventChanged || hostsChanged) ||
        route.page === 'events' && eventChanged || route.page === 'servers' && (hostsChanged || Boolean(route.id && ui.detailTab !== 'monitor')) ||
        route.page === 'alerts' && (previous.monitor !== next.monitor || JSON.stringify(previous.rules) !== JSON.stringify(next.rules));
      if (!wholePanel) return;
    }
    if (!syncSwitch(change)) render();
  });
  addEventListener('hashchange', readRoute);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  await enterWorkspace();
}

start();
