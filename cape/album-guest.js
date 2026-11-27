import { icon } from './icons.js';

const base = location.pathname;
const main = document.getElementById('content');
const dialog = document.getElementById('photo-dialog');
const sanitize = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const photoId = value => /^[a-f\d]{12}$/i.test(value);
const itemUrl = (photo, size) => base + '/i/' + photo.i + '/' + size + (typeof photo.v === 'string' ? '?v=' + encodeURIComponent(photo.v) : '');
const number = value => Number.isFinite(value) ? value : '—';
const settings = matchMedia('(prefers-color-scheme: dark)');
const setTheme = () => { document.documentElement.dataset.theme = settings.matches ? 'dark' : 'light'; };
setTheme();
settings.addEventListener('change', setTheme);
let manifest;
let visible = [];
let active = 0;
let trigger;
let slideshow;
let workerReady = false;
let protecting = false;
let protectionTimer;

async function albumRequest(suffix, body) {
  const response = await fetch(base + suffix, {
    credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25000),
    ...(body && { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': '1' }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false) {
    const error = new Error(typeof data?.message === 'string' ? data.message : '相簿暫時無法開啟。');
    Object.assign(error, { status: response.status, data });
    throw error;
  }
  return data;
}

function enableWorker() {
  if (!isSecureContext || !navigator.serviceWorker) return Promise.resolve(false);
  if (navigator.serviceWorker.controller?.scriptURL === location.origin + '/a/sw.js') return Promise.resolve(true);
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', done);
      resolve(navigator.serviceWorker.controller?.scriptURL === location.origin + '/a/sw.js');
    };
    const timer = setTimeout(done, 3500);
    navigator.serviceWorker.addEventListener('controllerchange', done);
    navigator.serviceWorker.register('/a/sw.js').catch(done);
  });
}

function buttons(caption, name, dots = '') {
  return `<button type="button" class="btn secondary press" data-album="${name}" ${dots}>${caption}</button>`;
}

function failed(message) {
  main.innerHTML = `<div class="empty"><span class="figure warning">${icon('warning')}</span><strong>無法開啟相簿</strong><span>${sanitize(message)}</span>
    ${buttons('重新讀取','retry')}</div>`;
}

function askPassword(message = '') {
  main.innerHTML = `<section class="panel auth-panel"><div class="profile-summary">
    <span class="brand-mark">${icon('logo',23)}</span><div><h1>開啟相簿</h1><p>請輸入分享者提供的密碼。</p></div></div>
    <form class="inline-form" id="album-password"><label>相簿密碼<input name="pw" type="password" autocomplete="current-password" required maxlength="64"></label>
      <p class="form-error" role="alert" ${message ? '' : 'hidden'}>${sanitize(message)}</p>
      <button type="submit" class="btn primary press">開啟相簿</button>
    </form></section>`;
  main.querySelector('input').focus();
}

function renderAlbum() {
  document.title = (manifest.name || '相簿分享') + ' | 岬角 Cape';
  main.innerHTML = `<header class="page-head"><div><h1>${sanitize(manifest.name || '相簿分享')}</h1><p>${sanitize(manifest.intro || manifest.photos.length + ' 個項目')}</p></div></header>
    <section class="panel"><div class="table-controls"><label class="search-field">${icon('search',18)}<input type="search" id="album-query" aria-label="搜尋照片" placeholder="搜尋照片"></label>
    ${manifest.photos.length ? buttons('播放幻燈片','slideshow') : ''}</div><div id="album-photos"></div></section>
    ${manifest.talk ? `<section class="panel live-extra"><div class="panel-head"><h2>留言簿</h2></div>${comments(manifest.gb)}
      ${commentForm('_gb')}</section>` : ''}`;
  filter();
}

function comments(items) {
  return (Array.isArray(items) ? items : []).map(item => `<div class="setting-row"><span class="figure slate">${icon('user',17)}</span>
    <div class="row-main"><strong>${sanitize(item.n || '訪客')}</strong><small>${sanitize(item.s)}</small></div>
    ${item.me ? buttons('刪除','comment-delete', `data-id="${sanitize(item.id)}" data-photo="${sanitize(item.photo || '')}"`) : ''}</div>`).join('');
}

function commentForm(id) {
  return `<form class="inline-form" data-comment="${id}"><label>名稱<input name="n" required maxlength="24"></label>
    <label>留言<input name="s" required maxlength="180"></label><p class="form-error" role="alert" hidden></p>
    <button type="submit" class="btn primary press">留下留言</button></form>`;
}

const watermark = () => manifest.wmo ? `<span class="album-watermark">${sanitize(manifest.wmo)}</span>` : '';

function filter(term = '') {
  visible = manifest.photos.filter(photo => [photo.n, ...(manifest.loc ? [photo.p?.city || photo.p || ''] : [])]
    .some(value => typeof value === 'string' && value.toLowerCase().includes(term.trim().toLowerCase())));
  main.querySelector('#album-photos').innerHTML = visible.length
    ? `<div class="album-grid">${visible.map((photo, index) => `<button type="button" class="album-tile press" data-album="view" data-index="${index}" aria-label="查看 ${sanitize(photo.n || '照片')}">
      <img src="${itemUrl(photo,'s')}" alt="" loading="lazy" decoding="async" draggable="false">
      ${watermark()}<span class="album-caption">${sanitize(photo.n || '相片')}${photo.vr === 1 ? ' · 影片' : ''}</span></button>`).join('')}</div>`
    : '<div class="empty"><strong>沒有符合的相片</strong></div>';
}

function view(index) {
  if (!visible.length) return;
  active = (index + visible.length) % visible.length;
  const photo = visible[active];
  const media = photo.vr === 1
    ? `<video src="${itemUrl(photo,'v')}" controls playsinline ${manifest.dl ? '' : 'controlslist="nodownload"'}></video>`
    : `<img src="${itemUrl(photo,'l')}" alt="${sanitize(photo.n || '相片')}" draggable="false">`;
  if (!dialog.open) {
    trigger = document.activeElement;
    dialog.showModal();
  }
  dialog.className = 'album-photo-dialog';
  dialog.innerHTML = `<div class="dialog-head"><h2 id="photo-title">${sanitize(photo.n || '相片')}</h2>
    <button type="button" class="icon-btn press" data-album="close" aria-label="關閉">${icon('close',19)}</button></div>
    <div class="album-media">${media}${watermark()}</div>
    <div class="tool-actions">
      ${buttons('上一張','previous')}${buttons('下一張','next')}
      ${photo.lv ? buttons('播放原況','live-photo') : ''}
      ${manifest.dl ? `<a class="btn secondary" href="${itemUrl(photo,'o')}">下載${manifest.dl === 1 ? '壓縮檔' : ''}</a>` : ''}
      ${slideshow ? buttons('停止幻燈片','stop') : ''}
      ${manifest.talk ? buttons(photo.me ? '取消喜歡' : '喜歡', 'like') : ''}
    </div>
    <div class="tool-host">${active + 1}／${visible.length} · ${number(photo.w)} × ${number(photo.h)}${photo.x?.dt ? ' · ' + sanitize(photo.x.dt) : ''}</div>
    ${manifest.talk ? comments((Array.isArray(photo.cm) ? photo.cm : []).map(comment => ({ ...comment, photo: photo.i }))) + commentForm(photo.i) : ''}`;
  dialog.querySelector('[data-album=close]').focus({ preventScroll: true });
}

async function open() {
  try {
    workerReady ||= await enableWorker();
    manifest = await albumRequest('/m' + (workerReady ? '' : '?pl=1'));
    manifest.photos = (Array.isArray(manifest.photos) ? manifest.photos : []).filter(photo => photo && photoId(photo.i));
    renderAlbum();
  } catch (error) {
    if (error.status === 401 && error.data?.pw) askPassword();
    else failed(error.data?.gone ? '分享已過期或已收回。' : error.data?.dev ? '這個分享的裝置名額已滿。' : error.message);
  }
}

document.addEventListener('submit', async event => {
  const isPassword = event.target.id === 'album-password';
  const comment = event.target.dataset.comment;
  if (!isPassword && !comment) return;
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('button');
  if (submit.disabled) return;
  submit.disabled = true;
  try {
    const values = new FormData(form);
    if (isPassword) {
      await albumRequest('/open', { pw: values.get('pw') });
      form.reset();
      await open();
    } else {
      await albumRequest('/talk', { i: comment, n: values.get('n'), s: values.get('s') });
      await reloadComments();
    }
  } catch (error) {
    if (isPassword) askPassword(error.message);
    else {
      const message = form.querySelector('[role=alert]');
      message.hidden = false;
      message.textContent = error.message;
    }
  }
  finally { submit.disabled = false; }
});

async function reloadComments() {
  const query = main.querySelector('#album-query')?.value || '';
  const index = active;
  const showing = dialog.open;
  await open();
  const search = main.querySelector('#album-query');
  if (search) { search.value = query; filter(query); }
  if (showing && search && visible.length) view(Math.min(index, visible.length - 1));
}

async function talkAction(button, body) {
  button.disabled = true;
  try { await albumRequest('/talk', body); await reloadComments(); }
  catch (error) {
    const field = (dialog.open ? dialog : main).querySelector('[data-comment] [role=alert]');
    if (field) { field.textContent = error.message; field.hidden = false; }
  } finally { button.disabled = false; }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-album]');
  if (!button) return;
  const action = button.dataset.album;
  if (action === 'retry') void open();
  if (action === 'view') view(Number(button.dataset.index));
  if (action === 'previous') view(active - 1);
  if (action === 'next') view(active + 1);
  if (action === 'close') dialog.close();
  if (action === 'stop') { clearInterval(slideshow); slideshow = undefined; view(active); }
  if (action === 'slideshow') { slideshow = setInterval(() => view(active + 1), 5000); view(0); }
  if (action === 'like') void talkAction(button, { i: visible[active].i, like: !visible[active].me });
  if (action === 'comment-delete') void talkAction(button, { i: button.dataset.photo || '_gb', del: button.dataset.id });
  if (action === 'live-photo') {
    const video = document.createElement('video');
    video.src = itemUrl(visible[active], 'm');
    video.controls = true;
    video.playsInline = true;
    if (!manifest.dl) video.setAttribute('controlslist', 'nodownload');
    const media = dialog.querySelector('.album-media');
    media.querySelector('img,video').replaceWith(video);
    void video.play().catch(() => {});
  }
});
document.addEventListener('input', event => { if (event.target.id === 'album-query') filter(event.target.value); });
dialog.addEventListener('keydown', event => {
  if (event.target instanceof HTMLMediaElement) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    view(active + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});
dialog.addEventListener('close', () => {
  clearInterval(slideshow);
  slideshow = undefined;
  dialog.innerHTML = '';
  trigger?.focus({ preventScroll: true });
});
document.addEventListener('contextmenu', event => { if (manifest?.dl === 0 && event.target instanceof HTMLImageElement) event.preventDefault(); });

function temporaryCover() {
  document.body.classList.add('album-cover');
  clearTimeout(protectionTimer);
  protectionTimer = setTimeout(() => { if (!document.hidden) document.body.classList.remove('album-cover'); }, 6000);
}

async function captureKey(event) {
  if (!manifest?.snap && !manifest?.shy) return;
  const capture = event.key === 'PrintScreen' || (event.metaKey && event.shiftKey && /^(Digit[345]|KeyS)$/.test(event.code));
  if (!capture) return;
  temporaryCover();
  if (!manifest.snap || protecting) return;
  protecting = true;
  try {
    const result = await albumRequest('/snap', {});
    if (result.lock) {
      navigator.serviceWorker?.controller?.postMessage({ type: 'clear', code: base.split('/').at(-1) });
      if (dialog.open) dialog.close();
      manifest = undefined;
      failed('相簿已依分享者的設定鎖定這台裝置。');
    }
  } catch { /* Keep the cover while the backend is unavailable. */ }
  finally { protecting = false; }
}
addEventListener('keydown', captureKey, true);
addEventListener('keyup', event => { if (event.key === 'PrintScreen') void captureKey(event); }, true);
document.addEventListener('visibilitychange', () => {
  if (!manifest?.shy) return;
  if (document.hidden) temporaryCover();
  else document.body.classList.remove('album-cover');
});
void open();
