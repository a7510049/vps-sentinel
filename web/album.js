"use strict";
/* 相簿分享：朋友打開 /a/十碼 看到的照片牆、看大圖、照片資訊、地圖。只跟這台主機要資料（地圖底圖例外） */
const T = {fast:200, mid:380, slow:620};
const EASE = "cubic-bezier(.2,0,0,1)", DEC = "cubic-bezier(.05,.7,.1,1)", EXIT = "cubic-bezier(.3,0,.8,.15)";
const CODE = location.pathname.split("/")[2] || "", BASE = `/a/${CODE}`;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const RM = matchMedia("(prefers-reduced-motion: reduce)");
const DARK = matchMedia("(prefers-color-scheme: dark)");
const P = {
  x:'<path d="M18 6 6 18M6 6l12 12"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  dl:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', l:'<path d="m15 18-6-6 6-6"/>', r:'<path d="m9 18 6-6-6-6"/>',
  pin:'<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  lock:'<rect x="4" y="10.5" width="16" height="10.5" rx="3"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  photo:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  off:'<path d="M3 3l18 18M10.6 5H18a3 3 0 0 1 3 3v8.4M3 7.8V17a3 3 0 0 0 3 3h11.2"/><path d="m21 16-4-4M14 17l-4-4-7 7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  zip:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'
};
const I = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;
const src = (p, k) => `${BASE}/i/${p.i}/${k}?v=${p.v}`;
const anim = () => !RM.matches;
let D = null, PH = [], TILES = [];

/* ── 日期：EXIF 的「2026:11:03 14:22:10」是拍照當地的時間，照原樣顯示 ── */
const WD = "日一二三四五六";
function pd(s){
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/.exec(s || "");
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return {y, mo, d, h, mi, wd: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(), k: m[1] + m[2] + m[3]};
}
const fdate = d => `${d.y}年${d.mo}月${d.d}日 星期${WD[d.wd]}`;
const fday = (d, yr) => `${yr ? d.y + "年" : ""}${d.mo}月${d.d}日 週${WD[d.wd]}`;
const ftime = d => `${d.h < 12 ? "上午" : "下午"} ${d.h % 12 || 12}:${String(d.mi).padStart(2, "0")}`;
function frange(a, b){
  if (!a) return "";
  if (!b || a.k === b.k) return `${a.y}年${a.mo}月${a.d}日`;
  if (a.y === b.y && a.mo === b.mo) return `${a.y}年${a.mo}月${a.d}日－${b.d}日`;
  if (a.y === b.y) return `${a.y}年${a.mo}月${a.d}日－${b.mo}月${b.d}日`;
  return `${a.y}年${a.mo}月${a.d}日－${b.y}年${b.mo}月${b.d}日`;
}
const size = n => n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : n >= 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB";

/* ── 相機資訊 ── */
const MKS = {apple:"Apple", sony:"Sony", "nikon corporation":"Nikon", nikon:"Nikon", canon:"Canon", fujifilm:"Fujifilm", samsung:"Samsung", google:"Google",
  "olympus imaging corp.":"Olympus", "olympus corporation":"Olympus", "om digital solutions":"OM System", panasonic:"Panasonic", leica:"Leica", "leica camera ag":"Leica",
  xiaomi:"Xiaomi", huawei:"Huawei", oneplus:"OnePlus", oppo:"OPPO", dji:"DJI", hasselblad:"Hasselblad", ricoh:"Ricoh", "pentax corporation":"Pentax", vivo:"vivo", gopro:"GoPro"};
function camName(x){
  const mk = x.mk ? (MKS[x.mk.toLowerCase()] || x.mk.replace(/\s+(corporation|corp\.?|co\.,? ?ltd\.?|imaging)$/i, "")) : "";
  const md = x.md || "";
  if (!md) return mk;
  return md.toLowerCase().startsWith(mk.toLowerCase()) || md.toLowerCase().startsWith((x.mk || "").toLowerCase()) ? md.replace(new RegExp("^" + (x.mk || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "i"), mk + " ").trim() : `${mk} ${md}`.trim();
}
function lensName(x){
  let l = x.ln || "";
  if (!l) return "";
  if (x.md && l.toLowerCase().startsWith(x.md.toLowerCase())) l = l.slice(x.md.length).trim();
  return l.replace(/^back /i, "後").replace(/^front /i, "前").replace(/triple camera/i, "三鏡頭").replace(/dual wide camera/i, "雙廣角鏡頭")
    .replace(/dual camera/i, "雙鏡頭").replace(/ultra wide camera/i, "超廣角鏡頭").replace(/telephoto camera/i, "望遠鏡頭").replace(/wide camera/i, "廣角鏡頭").replace(/camera/i, "鏡頭");
}
const lensKind = f => f < 20 ? "超廣角" : f < 35 ? "廣角" : f < 70 ? "標準" : "望遠";
function shutter(et){
  if (!et) return "";
  const v = et[0] / et[1];
  return v >= 1 ? `${+v.toFixed(1)} 秒` : `1/${Math.round(et[1] / et[0])} 秒`;
}
const EP = ["", "手動", "自動", "光圈優先", "快門優先", "創意", "運動", "人像", "風景"];
const MM = {1:"平均測光", 2:"中央重點", 3:"點測光", 4:"多點測光", 5:"評價測光", 6:"局部測光"};
const SC = ["標準", "風景", "人像", "夜景"];
const DIR8 = ["北", "東北", "東", "東南", "南", "西南", "西", "西北"];
const mapUrl = (lat, lon, q) => /iPhone|iPad|Macintosh/.test(navigator.userAgent) ? `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(q || "照片地點")}`
  : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

/* ── 地圖：CARTO 的底圖（OpenStreetMap 資料），自己算要哪幾格 ── */
const lx = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z;
const ly = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
function tiles(el, cx, cy, z, W, H){
  const sty = DARK.matches ? "dark_all" : "rastertiles/voyager", n = 2 ** z;
  let h = "";
  for (let tx = Math.floor((cx - W / 2) / 256); tx <= Math.floor((cx + W / 2) / 256); tx++)
    for (let ty = Math.floor((cy - H / 2) / 256); ty <= Math.floor((cy + H / 2) / 256); ty++) {
      if (ty < 0 || ty >= n) continue;
      const x = ((tx % n) + n) % n, s = "abcd"[(x + ty) % 4];
      h += `<img class="tl" alt="" draggable="false" style="left:${tx * 256 - cx + W / 2}px;top:${ty * 256 - cy + H / 2}px" src="https://${s}.basemaps.cartocdn.com/${sty}/${z}/${x}/${ty}@2x.png">`;
    }
  el.insertAdjacentHTML("afterbegin", h);
  el.querySelectorAll(".tl").forEach(t => { if (t.complete && t.naturalWidth) return t.classList.add("ok");
    t.addEventListener("load", () => t.classList.add("ok"), {once:true}); t.addEventListener("error", () => t.remove(), {once:true}); });
}

/* ═════════ 進場：讀照片清單（要密碼就先問） ═════════ */
async function boot(){
  let r;
  try { r = await fetch(BASE + "/m", {credentials:"same-origin", cache:"no-store"}); }
  catch (e) { return gate("off", "連不上，等一下再試"); }
  if (r.status === 401) return askPw();
  if (!r.ok) return gate("off", "這本相簿已經收回或過期");
  D = await r.json();
  PH = D.photos || [];
  document.title = D.name;
  if (!PH.length) return gate("photo", "這本相簿還沒有照片");
  draw();
  if (D.loc && PH.some(p => p.g && !p.p)) setTimeout(refresh, 6000);
}
let REF = 0;
async function refresh(){                                  // 地名在主機背景慢慢查：查到了補上去
  try {
    const r = await fetch(BASE + "/m", {credentials:"same-origin", cache:"no-store"});
    if (!r.ok) return;
    const d = await r.json(), by = Object.fromEntries((d.photos || []).map(p => [p.i, p]));
    PH.forEach(p => { if (by[p.i]) { p.p = by[p.i].p; if (!p.q && by[p.i].q) p.q = by[p.i].q; } });
    D.places = d.places;
    const ch = $(".hmeta [data-pl]");
    if (ch && D.places.length) ch.lastChild.textContent = D.places.slice(0, 3).join("・");
    else if (!ch && D.places.length) $(".hmeta").insertAdjacentHTML("beforeend", `<span class="chip" data-pl>${I("pin")}<span>${esc(D.places.slice(0, 3).join("・"))}</span></span>`);
    document.querySelectorAll(".dh[data-day]").forEach(h => { const s = h.querySelector("span"), t = dayPlaces(h.dataset.day); if (s && t) s.textContent = t; });
    if (PH.some(p => p.g && !p.p) && ++REF < 5) setTimeout(refresh, 8000);
  } catch (e) {}
}
function gate(ic, title, form){
  $("#app").innerHTML = `<div class="gate"><form class="card">${`<div class="ic">${I(ic)}</div>`}<h2>${esc(title)}</h2>${form || ""}</form></div>`;
  return $(".card");
}
function askPw(){
  const f = gate("lock", "輸入密碼", `<input class="field" type="password" autocomplete="current-password" aria-label="密碼" required><button class="btn">打開</button><div class="msg"></div>`);
  const inp = f.querySelector("input"), btn = f.querySelector("button"), msg = f.querySelector(".msg");
  setTimeout(() => inp.focus(), 300);
  f.addEventListener("submit", async e => {
    e.preventDefault();
    btn.disabled = true; msg.textContent = "";
    try {
      const r = await fetch(BASE + "/open", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({pw:inp.value})});
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        f.animate([{opacity:1, transform:"none"}, {opacity:0, transform:"scale(.96)"}], {duration:T.fast, easing:EXIT, fill:"forwards"}).onfinish = boot;
        return;
      }
      msg.textContent = d.message || "密碼不對";
      f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
      inp.select();
    } catch (err) { msg.textContent = "連不上，等一下再試"; }
    btn.disabled = false;
  });
}

/* ═════════ 照片牆 ═════════ */
let GROUPS = [];
function dayPlaces(k){
  const c = {};
  PH.forEach(p => { const d = pd(p.x.dt); if (d && d.k === k && p.p) c[p.p.n] = (c[p.p.n] || 0) + 1; });
  return Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 2).join("・");
}
function draw(){
  const ds = PH.map(p => pd(p.x.dt)).filter(Boolean), real = PH.filter(p => !p.x.dtf).map(p => pd(p.x.dt)).filter(Boolean);
  const rd = real.length ? real : ds, a = rd[0], b = rd[rd.length - 1];
  const cover = PH.find(p => p.w > p.h * 1.15 && !p.raw) || PH[0];
  const days = [...new Set(ds.map(d => d.k))];
  const yr = a && b && a.y !== b.y;
  GROUPS = [];
  if (days.length > 1 && PH.length >= 6) {
    const by = {};
    PH.forEach((p, i) => { const d = pd(p.x.dt), k = d ? d.k : "0"; (by[k] = by[k] || {k, d, list:[]}).list.push(i); });
    GROUPS = Object.values(by);
  } else GROUPS = [{k:"", list:PH.map((_, i) => i)}];
  const pl = (D.places || []).slice(0, 3).join("・");
  $("#app").innerHTML = `
    <header class="hero"><div class="cv">${cover.q ? `<img class="lq" alt="" src="data:image/jpeg;base64,${cover.q}">` : ""}<img class="hi" alt="" src="${src(cover, "l")}"></div>
      <div class="hcap"><div class="eyebrow">${esc(frange(a, b))}</div><h1>${esc(D.name)}</h1>
        <div class="hmeta"><span class="chip">${I("photo")}<span class="num">${PH.length} 張</span></span>${pl ? `<span class="chip" data-pl>${I("pin")}<span>${esc(pl)}</span></span>` : ""}
        ${D.dl ? `<a class="chip go" href="${BASE}/zip" download>${I("dl")}<span>全部下載</span></a>` : ""}</div></div></header>
    <div class="bar"><b>${esc(D.name)}<small class="num">${PH.length} 張</small></b>${D.dl ? `<a class="chip go" href="${BASE}/zip" download>${I("dl")}<span>全部下載</span></a>` : ""}</div>
    <main class="wall">${GROUPS.map((g, gi) => `<section class="day" data-g="${gi}">${g.k && g.d ? `<div class="dh" data-day="${g.k}"><b>${fday(g.d, yr)}</b><span>${esc(dayPlaces(g.k))}</span></div>` : ""}<div class="rows"></div></section>`).join("")}</main>
    ${D.loc && PH.some(p => p.g) ? `<section class="msec"><div class="mh"><b>拍攝地點</b><span class="num">${PH.filter(p => p.g).length} 張有地點</span></div><div class="map" data-map></div></section>` : ""}
    <footer class="foot">${D.exp ? `<span>${I("clock")}${left(D.exp)}</span>` : ""}</footer>`;
  const hi = $(".hero .hi");
  hi.complete ? hi.classList.add("ok") : hi.addEventListener("load", () => hi.classList.add("ok"), {once:true});
  TILES = PH.map((p, i) => tile(p, i));
  layout();
  bigMap();
  onScroll();
}
function left(exp){
  const s = exp - Date.now() / 1000;
  return s > 86400 * 2 ? `${Math.round(s / 86400)} 天後失效` : s > 3600 ? `${Math.round(s / 3600)} 小時後失效` : "快要失效了";
}
const IO = "IntersectionObserver" in window ? new IntersectionObserver(es => {
  let n = 0;
  es.forEach(e => { if (!e.isIntersecting) return; const t = e.target; IO.unobserve(t);
    t.style.transitionDelay = anim() ? `${Math.min(n++ * 35, 280)}ms` : "0ms"; t.classList.add("in");
    setTimeout(() => { t.style.transitionDelay = ""; }, T.slow + 300); });
}, {rootMargin:"0px 0px -4% 0px"}) : null;
function tile(p, i){
  const el = document.createElement("button");
  el.className = "ph"; el.dataset.i = i; el.setAttribute("aria-label", p.n);
  el.innerHTML = `${p.q ? `<img class="lq" alt="" src="data:image/jpeg;base64,${p.q}">` : ""}<img class="hi" alt="" loading="lazy" decoding="async" draggable="false" src="${src(p, "s")}">`;
  const hi = el.querySelector(".hi");
  hi.addEventListener("load", () => hi.classList.add("ok"), {once:true});
  hi.addEventListener("error", () => { p.broken = 1; hi.remove(); el.insertAdjacentHTML("beforeend", `<span class="nope">${I("off")}</span>`); }, {once:true});
  if (IO) IO.observe(el); else el.classList.add("in");
  return el;
}
let LW = 0;
function layout(force){
  const wall = $(".wall"); if (!wall) return;
  const cs = getComputedStyle(document.documentElement), rh = parseFloat(cs.getPropertyValue("--rh")) || 200, gap = parseFloat(cs.getPropertyValue("--gap")) || 4;
  const W = wall.querySelector(".rows").clientWidth;
  if (!force && Math.abs(W - LW) < 1) return;
  LW = W;
  GROUPS.forEach((g, gi) => {
    const box = wall.querySelector(`[data-g="${gi}"] .rows`), rows = [];
    let cur = [], sum = 0;
    g.list.forEach(i => {
      const p = PH[i], ar = Math.min(3, Math.max(.4, p.w / p.h));
      cur.push([i, ar]); sum += ar;
      if (sum * rh + gap * (cur.length - 1) >= W) { rows.push([cur, (W - gap * (cur.length - 1)) / sum]); cur = []; sum = 0; }
    });
    if (cur.length) rows.push([cur, Math.min(rh * 1.1, (W - gap * (cur.length - 1)) / sum)]);
    const frag = document.createDocumentFragment();
    rows.forEach(([list, h]) => {
      const r = document.createElement("div"); r.className = "row"; r.style.height = h.toFixed(2) + "px";
      list.forEach(([i, ar]) => { const t = TILES[i]; t.style.width = (ar * h).toFixed(2) + "px"; t.style.height = h.toFixed(2) + "px"; r.appendChild(t); });
      frag.appendChild(r);
    });
    box.replaceChildren(frag);
  });
}
let RZ;
addEventListener("resize", () => { clearTimeout(RZ); RZ = setTimeout(() => { layout(); bigMap(); if (LB) LB.fitAll(); }, 120); });

/* 捲動：封面慢一點往上（視差）、標題淡掉，捲過封面上面浮出一條 */
let SCQ = 0;
function onScroll(){
  if (SCQ) return;
  SCQ = requestAnimationFrame(() => {
    SCQ = 0;
    const hero = $(".hero"); if (!hero) return;
    const y = scrollY, H = hero.offsetHeight;
    if (y < H && anim()) {
      $(".hero .cv").style.transform = `translate3d(0,${(y * .38).toFixed(1)}px,0) scale(${(1 + y / H * .06).toFixed(4)})`;
      const c = $(".hcap"); c.style.opacity = Math.max(0, 1 - y / (H * .55)).toFixed(3); c.style.transform = `translate3d(0,${(y * .18).toFixed(1)}px,0)`;
    }
    $(".bar").classList.toggle("on", y > H - 90);
  });
}
addEventListener("scroll", onScroll, {passive:true});
document.addEventListener("click", e => {
  const t = e.target.closest(".ph");
  if (t) return openLb(+t.dataset.i);
  const m = e.target.closest(".mk");
  if (m) return openLb(+m.dataset.i);
});

/* 全部照片的拍攝地點：一張地圖、照片圓圈，太近的合成一顆＋數字 */
function bigMap(){
  const el = $("[data-map]"); if (!el) return;
  const pts = PH.map((p, i) => [p, i]).filter(([p]) => p.g && !p.broken);
  const W = el.clientWidth, H = el.clientHeight;
  if (!pts.length || !W) return;
  let z = 15;
  for (; z > 2; z--) {
    const xs = pts.map(([p]) => lx(p.g[1], z)), ys = pts.map(([p]) => ly(p.g[0], z));
    if (Math.max(...xs) - Math.min(...xs) <= W - 110 && Math.max(...ys) - Math.min(...ys) <= H - 110) break;
  }
  if (pts.length === 1) z = 13;
  const xs = pts.map(([p]) => lx(p.g[1], z)), ys = pts.map(([p]) => ly(p.g[0], z));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  el.innerHTML = `<span class="attr">© OpenStreetMap © CARTO</span>`;
  tiles(el, cx, cy, z, W, H);
  const cl = [];
  pts.forEach(([p, i], k) => {
    const x = xs[k] - cx + W / 2, y = ys[k] - cy + H / 2, c = cl.find(c => Math.hypot(c.x - x, c.y - y) < 46);
    if (c) c.n++; else cl.push({x, y, i, n:1});
  });
  el.insertAdjacentHTML("beforeend", cl.map((c, k) => `<button class="mk" data-i="${c.i}" style="left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px;animation-delay:${Math.min(k * 40, 600)}ms"><img alt="" loading="lazy" src="${src(PH[c.i], "s")}">${c.n > 1 ? `<i class="num">${c.n}</i>` : ""}</button>`).join(""));
}

/* ═════════ 看大圖 ═════════ */
let LB = null;
const GAPX = 28;
function openLb(i){
  if (LB) return;
  const el = document.createElement("div");
  el.className = "lb";
  el.innerHTML = `<div class="bg"></div><div class="stage"><div class="track"></div></div>
    <div class="lbt"><button class="rb" data-x aria-label="關閉">${I("x")}</button><span class="cnt num"></span><button class="rb" data-inf aria-label="照片資訊">${I("info")}</button>${D.dl ? `<a class="rb" data-dl download aria-label="下載原圖">${I("dl")}</a>` : ""}</div>
    <button class="rb nav l" aria-label="上一張">${I("l")}</button><button class="rb nav r" aria-label="下一張">${I("r")}</button>
    <div class="lbb"><div class="cap"><b></b><span></span></div></div><div class="inf"></div>`;
  document.body.appendChild(el);
  document.documentElement.style.overflow = "hidden";
  const stage = $(".stage", el), track = $(".track", el), bg = $(".bg", el), inf = $(".inf", el);
  const S = {el, i, z:{s:1, x:0, y:0}, info:false, busy:null};
  LB = S;
  const W = () => stage.clientWidth, H = () => stage.clientHeight;
  const mk = () => { const s = document.createElement("div"); s.className = "slide"; s.innerHTML = `<div class="zw"></div>`; track.appendChild(s); return s; };
  let sl = [mk(), mk(), mk()];                               // 上一張、這張、下一張
  function fit(p){ const w = W(), h = H(), k = Math.min(w / p.w, h / p.h);
    const fw = p.w * k, fh = p.h * k; return {l:(w - fw) / 2, t:(h - fh) / 2, w:fw, h:fh}; }
  function fill(s, idx){
    s.dataset.i = idx;
    const zw = s.firstChild, p = PH[idx];
    zw.style.transform = "";
    if (!p) { zw.innerHTML = ""; return; }
    const f = fit(p);
    Object.assign(zw.style, {left:f.l + "px", top:f.t + "px", width:f.w + "px", height:f.h + "px"});
    if (zw.dataset.i === String(idx)) return;
    zw.dataset.i = idx;
    if (p.broken) { zw.innerHTML = `<div class="nope">${I("off")}</div>`; return; }
    zw.innerHTML = `<img class="s1" alt="" draggable="false" src="${p.q ? `data:image/jpeg;base64,${p.q}` : src(p, "s")}"><img class="s1" alt="" draggable="false" src="${src(p, "s")}"><img class="s2" alt="" draggable="false" src="${src(p, "l")}">`;
    const big = zw.querySelector(".s2");
    big.complete && big.naturalWidth ? big.classList.add("ok") : big.addEventListener("load", () => big.classList.add("ok"), {once:true});
  }
  function place(){ sl.forEach((s, k) => { s.style.transform = `translateX(${(k - 1) * (W() + GAPX)}px)`; }); }
  function setAll(){ fill(sl[0], S.i - 1); fill(sl[1], S.i); fill(sl[2], S.i + 1); place(); chrome(); }
  S.fitAll = () => { const zw = cur(); zw.style.transition = `left ${T.mid}ms ${EASE},top ${T.mid}ms ${EASE},width ${T.mid}ms ${EASE},height ${T.mid}ms ${EASE}`;
    setZoom(1, 0, 0); setAll(); setTimeout(() => { zw.style.transition = ""; }, T.mid + 30); };
  const cur = () => sl[1].firstChild;
  function setZoom(s, x, y){ S.z = {s, x, y}; cur().style.transform = s === 1 && !x && !y ? "" : `translate(${x}px,${y}px) scale(${s})`; }
  function chrome(){
    const p = PH[S.i], d = pd(p.x.dt);
    $(".cnt", el).textContent = `${S.i + 1} / ${PH.length}`;
    const cam = camName(p.x);
    $(".cap b", el).textContent = p.p ? p.p.n : d ? fdate(d) : p.n;
    $(".cap span", el).textContent = [p.p && d ? `${d.mo}月${d.d}日 ${ftime(d)}` : d ? ftime(d) : "", cam].filter(Boolean).join("・");
    const dl = $("[data-dl]", el); if (dl) dl.href = src(p, "o");
    $(".nav.l", el).disabled = S.i === 0; $(".nav.r", el).disabled = S.i === PH.length - 1;
    if (S.info) inf.innerHTML = infoHTML(p);
    if (S.info) infoMap();
    TILES.forEach((t, k) => t.classList.toggle("gone", k === S.i));
  }
  setAll();

  /* 從格子裡的那張長大 */
  const t0 = TILES[i], r0 = t0.getBoundingClientRect(), f0 = fit(PH[i]);
  if (anim()) {
    cur().animate([{transform:`translate(${r0.left - f0.l}px,${r0.top - f0.t}px) scale(${r0.width / f0.w},${r0.height / f0.h})`, borderRadius:"12px"}, {transform:"none"}], {duration:T.mid + 60, easing:DEC});
    bg.animate([{opacity:0}, {opacity:1}], {duration:T.mid, easing:EASE, fill:"forwards"});
    el.querySelectorAll(".lbt,.lbb,.nav").forEach(x => x.animate([{opacity:0}, {opacity:1}], {duration:T.mid, delay:T.fast, easing:EASE, fill:"backwards"}));
  } else bg.style.opacity = 1;
  bg.style.opacity = 1;
  history.pushState({lb:1}, "");

  function go(d){
    const n = S.i + d;
    if (n < 0 || n >= PH.length) return snap();
    finish();
    const from = curX(), to = -d * (W() + GAPX);
    setZoom(1, 0, 0);
    const a = track.animate([{transform:`translateX(${from}px)`}, {transform:`translateX(${to}px)`}], {duration:anim() ? T.mid : 1, easing:DEC});
    track.style.transform = `translateX(${to}px)`;
    S.busy = () => { a.cancel(); S.busy = null;
      if (d > 0) sl = [sl[1], sl[2], sl[0]]; else sl = [sl[2], sl[0], sl[1]];
      S.i = n; track.style.transform = ""; fill(sl[d > 0 ? 2 : 0], n + d); place(); chrome(); };
    a.onfinish = () => S.busy && S.busy();
  }
  const finish = () => S.busy && S.busy();
  function curX(){ const m = /translateX\((-?[\d.]+)px\)/.exec(track.style.transform); return m ? +m[1] : 0; }
  function snap(){
    const from = curX();
    track.style.transform = "";
    if (from && anim()) track.animate([{transform:`translateX(${from}px)`}, {transform:"none"}], {duration:T.mid, easing:DEC});
  }
  function close(){
    if (S.closing) return; S.closing = 1;
    finish();
    const p = PH[S.i], t = TILES[S.i];
    let r = t.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) { t.scrollIntoView({block:"center"}); r = t.getBoundingClientRect(); }
    const zw = cur(), f = fit(p), now = getComputedStyle(zw).transform;
    const end = () => { el.remove(); TILES.forEach(x => x.classList.remove("gone")); document.documentElement.style.overflow = ""; LB = null; onScroll(); };
    if (!anim()) return end();
    el.querySelectorAll(".lbt,.lbb,.nav,.inf").forEach(x => { x.style.opacity = 0; });
    S.info = false; el.classList.remove("info");
    zw.animate([{transform:now === "none" ? "none" : now}, {transform:`translate(${r.left - f.l - stage.getBoundingClientRect().left}px,${r.top - f.t - stage.getBoundingClientRect().top}px) scale(${r.width / f.w},${r.height / f.h})`}],
      {duration:T.mid, easing:EASE, fill:"forwards"}).onfinish = end;
    bg.animate([{opacity:getComputedStyle(bg).opacity}, {opacity:0}], {duration:T.mid, easing:EASE, fill:"forwards"});
  }
  S.close = close;
  function setInfo(on){
    S.info = on; el.classList.toggle("info", on);
    $("[data-inf]", el).classList.toggle("on", on);
    if (on) { inf.innerHTML = infoHTML(PH[S.i]); inf.scrollTop = 0; setTimeout(infoMap, 30); }
    S.fitAll();
  }
  function infoMap(){
    const m = $(".imap", inf), p = PH[S.i]; if (!m || !p.g) return;
    const z = 15, W2 = m.clientWidth, H2 = m.clientHeight;
    tiles(m, lx(p.g[1], z), ly(p.g[0], z), z, W2, H2);
  }

  /* 手勢：左右滑換照片、兩指／點兩下放大、往下滑關掉、往上滑看資訊 */
  const ptr = new Map();
  let g = null, lastTap = 0, tapT = 0;
  const L = () => { const f = fit(PH[S.i]); return f; };
  stage.addEventListener("pointerdown", e => {
    if (S.closing) return;
    stage.setPointerCapture(e.pointerId);
    ptr.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (ptr.size === 1) { finish(); g = {type:null, x0:e.clientX, y0:e.clientY, t0:performance.now(), lx:e.clientX, ly:e.clientY, lt:performance.now(), vx:0, vy:0, z0:{...S.z}}; }
    else if (ptr.size === 2) { const [a, b] = [...ptr.values()]; g = {type:"pinch", d0:Math.hypot(a.x - b.x, a.y - b.y), m0:{x:(a.x + b.x) / 2, y:(a.y + b.y) / 2}, z0:{...S.z}}; }
  });
  stage.addEventListener("pointermove", e => {
    if (!ptr.has(e.pointerId) || !g) return;
    ptr.set(e.pointerId, {x:e.clientX, y:e.clientY});
    const sr = stage.getBoundingClientRect(), f = L();
    if (g.type === "pinch" && ptr.size >= 2) {
      const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = {x:(a.x + b.x) / 2, y:(a.y + b.y) / 2};
      let s = g.z0.s * d / g.d0; s = s < 1 ? 1 - (1 - s) * .5 : Math.min(s, 6);
      const ux = (g.m0.x - sr.left - f.l - g.z0.x) / g.z0.s, uy = (g.m0.y - sr.top - f.t - g.z0.y) / g.z0.s;
      setZoom(s, m.x - sr.left - f.l - s * ux, m.y - sr.top - f.t - s * uy);
      return;
    }
    const now = performance.now(), dt = Math.max(1, now - g.lt);
    g.vx = .8 * (e.clientX - g.lx) / dt + .2 * g.vx; g.vy = .8 * (e.clientY - g.ly) / dt + .2 * g.vy; g.lx = e.clientX; g.ly = e.clientY; g.lt = now;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.type) {
      if (S.z.s > 1.02) g.type = "pan";
      else if (Math.hypot(dx, dy) > 8) g.type = Math.abs(dx) > Math.abs(dy) ? "swipe" : dy > 0 ? "down" : "up";
      else return;
    }
    if (g.type === "pan") return setZoom(S.z.s, g.z0.x + dx, g.z0.y + dy);
    if (g.type === "swipe") {
      const edge = (dx > 0 && S.i === 0) || (dx < 0 && S.i === PH.length - 1);
      track.style.transform = `translateX(${edge ? dx * .3 : dx}px)`;
    } else if (g.type === "down" && !S.info) {
      const k = Math.min(1, Math.max(0, dy) / H());
      cur().style.transform = `translate(${dx * .7}px,${Math.max(0, dy)}px) scale(${1 - k * .35})`;
      bg.style.opacity = (1 - k * 1.3).toFixed(3); el.classList.add("bare");
    } else if (g.type === "up" || (g.type === "down" && S.info)) {
      if (!S.info) cur().style.transform = `translateY(${Math.min(0, dy) * .3}px)`;
    }
  });
  const up = e => {
    if (!ptr.has(e.pointerId)) return;
    ptr.delete(e.pointerId);
    if (!g) return;
    if (g.type === "pinch") {
      if (ptr.size === 1) { const [a] = [...ptr.values()]; g = {type:"pan", x0:a.x, y0:a.y, z0:{...S.z}, lx:a.x, ly:a.y, lt:performance.now(), vx:0, vy:0}; return; }
      if (S.z.s < 1.02) zoomTo(1, 0, 0); else clampZoom();
      g = null; return;
    }
    if (ptr.size) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0, dt = performance.now() - g.t0, type = g.type, vx = g.vx, vy = g.vy;
    g = null;
    if (type === "swipe") {
      if ((dx < -W() * .2 || vx < -.45) && S.i < PH.length - 1) return go(1);
      if ((dx > W() * .2 || vx > .45) && S.i > 0) return go(-1);
      return snap();
    }
    if (type === "down" && !S.info) {
      if (dy > H() * .16 || vy > .6) return history.back();
      el.classList.remove("bare"); bg.style.opacity = 1;
      const zw = cur(), now = zw.style.transform; zw.style.transform = "";
      if (anim()) zw.animate([{transform:now}, {transform:"none"}], {duration:T.mid, easing:DEC});
      return;
    }
    if (type === "down" && S.info) { if (dy > 50) setInfo(false); return; }
    if (type === "up") { const zw = cur(), now = zw.style.transform; zw.style.transform = ""; if (now && anim()) zw.animate([{transform:now}, {transform:"none"}], {duration:T.fast, easing:DEC});
      if (dy < -40 || vy < -.5) setInfo(true); return; }
    if (type === "pan") return clampZoom();
    if (!type && dt < 350) {                                   // 點一下：開關上下的按鈕；點兩下：放大縮小
      const now = performance.now();
      if (now - lastTap < 300) { clearTimeout(tapT); lastTap = 0; return dbl(e.clientX, e.clientY); }
      lastTap = now;
      tapT = setTimeout(() => { if (S.info) setInfo(false); else el.classList.toggle("bare"); }, 300);
    }
  };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  function zoomTo(s, x, y){
    const zw = cur(), from = zw.style.transform || "none";
    setZoom(s, x, y);
    if (anim()) zw.animate([{transform:from}, {transform:zw.style.transform || "none"}], {duration:T.mid, easing:DEC});
  }
  function clampZoom(){
    const f = L(), w = W(), h = H(), s = S.z.s;
    const cl = (v, sz, box, off) => { const span = sz * s; if (span <= box) return (box - span) / 2 - off; return Math.min(-off, Math.max(box - off - span, v)); };
    zoomTo(s, cl(S.z.x, f.w, w, f.l), cl(S.z.y, f.h, h, f.t));
  }
  function dbl(cx, cy){
    if (S.z.s > 1.02) return zoomTo(1, 0, 0);
    const sr = stage.getBoundingClientRect(), f = L(), s = Math.max(2.5, Math.min(4, Math.max(W() / f.w, H() / f.h)));
    const ux = cx - sr.left - f.l, uy = cy - sr.top - f.t;
    S.z = {s, x:ux - s * ux, y:uy - s * uy}; const want = S.z;
    setZoom(1, 0, 0); S.z = want; clampZoom();
  }
  stage.addEventListener("wheel", e => {
    e.preventDefault();
    const sr = stage.getBoundingClientRect(), f = L(), k = Math.exp(-e.deltaY * .0025);
    const s = Math.max(1, Math.min(6, S.z.s * k));
    const ux = (e.clientX - sr.left - f.l - S.z.x) / S.z.s, uy = (e.clientY - sr.top - f.t - S.z.y) / S.z.s;
    if (s === 1) return setZoom(1, 0, 0);
    setZoom(s, e.clientX - sr.left - f.l - s * ux, e.clientY - sr.top - f.t - s * uy);
    clearTimeout(S.wt); S.wt = setTimeout(clampZoom, 160);
  }, {passive:false});

  el.addEventListener("click", e => {
    if (e.target.closest("[data-x]")) return history.back();
    if (e.target.closest("[data-inf]")) return setInfo(!S.info);
    if (e.target.closest(".nav.l")) return go(-1);
    if (e.target.closest(".nav.r")) return go(1);
  });
  S.key = e => {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "Escape") S.info ? setInfo(false) : history.back();
    else if (e.key === "i") setInfo(!S.info);
  };
}
addEventListener("keydown", e => LB && LB.key(e));
addEventListener("popstate", () => { if (LB) LB.close(); });

/* 照片資訊（越詳細越好）：時間、地點、相機、鏡頭、光圈、快門、ISO… */
function infoHTML(p){
  const x = p.x, d = pd(x.dt), cam = camName(x), lens = lensName(x), ext = (p.n.split(".").pop() || "").toUpperCase().replace("JPG", "JPEG");
  const mp = p.w * p.h / 1e6, f35 = x.f35 || 0, fl = x.fl || 0;
  let h = d ? `<div class="idt">${fdate(d)}</div><div class="itm num">${x.dtf ? "檔案時間 " : ""}${ftime(d)}${x.oz ? `・UTC${x.oz.replace(":00", "")}` : ""}</div>` : "";
  if (p.g) {
    const [lat, lon, alt, dir] = p.g, nm = p.p ? p.p.n : "拍攝地點", sub = p.p && p.p.a ? p.p.a : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    h += `<div class="ibox"><a class="imap" href="${mapUrl(lat, lon, nm)}" target="_blank" rel="noopener noreferrer" aria-label="在地圖上打開">${dir != null ? `<span class="cone" style="transform:rotate(${dir}deg)"></span>` : ""}<span class="pin"></span><span class="attr">© OpenStreetMap © CARTO</span></a>
      <a class="ipl" href="${mapUrl(lat, lon, nm)}" target="_blank" rel="noopener noreferrer"><span class="pi">${I("pin")}</span><span><b>${esc(nm)}</b><span>${esc(sub)}</span></span><span class="go">${I("ext")}</span></a></div>`;
  }
  const cells = [["ISO", x.iso || ""], ["焦距", f35 ? `${f35} mm` : fl ? `${Math.round(fl)} mm` : ""], ["曝光", x.ev != null ? `${x.ev > 0 ? "+" : ""}${+x.ev.toFixed(1)} ev` : ""],
    ["光圈", x.f ? `ƒ${+x.f.toFixed(2)}` : ""], ["快門", shutter(x.et).replace(" 秒", " s")]];
  h += `<div class="ibox"><div class="icam"><div class="t"><b>${esc(cam || "相機資訊")}</b><span class="tag">${esc(ext)}</span></div>
      ${lens || f35 ? `<div class="l">${esc([f35 ? `${lensKind(f35)}・等效 ${f35} mm` : "", lens].filter(Boolean).join("　"))}</div>` : ""}
      <div class="l2 num">${mp >= .1 ? `${mp >= 10 ? Math.round(mp) : mp.toFixed(1)} MP・` : ""}${p.w} × ${p.h}・${size(p.sz)}</div></div>
    ${cells.some(c => c[1]) ? `<div class="iex num">${cells.map(([k, v]) => `<div><small>${k}</small>${esc(v || "—")}</div>`).join("")}</div>` : ""}</div>`;
  const kv = [];
  if (x.ln) kv.push(["鏡頭", x.lmk && !x.ln.startsWith(x.lmk) ? `${x.lmk} ${x.ln}` : x.ln]);
  if (fl && f35 && Math.round(fl) !== f35) kv.push(["實際焦距", `${+fl.toFixed(2)} mm`]);
  if (x.et) kv.push(["快門", shutter(x.et)]);
  if (x.ep) kv.push(["曝光程式", EP[x.ep] || ""]);
  if (x.em != null) kv.push(["曝光模式", ["自動曝光", "手動曝光", "自動包圍"][x.em] || ""]);
  if (x.mm) kv.push(["測光", MM[x.mm] || ""]);
  if (x.fla != null) kv.push(["閃光燈", x.fla & 1 ? "有閃" : "沒閃"]);
  if (x.wb != null) kv.push(["白平衡", x.wb ? "手動" : "自動"]);
  if (x.sc) kv.push(["場景", SC[x.sc] || ""]);
  if (p.g && p.g[2] != null) kv.push(["海拔", `${Math.round(p.g[2])} 公尺`]);
  if (p.g && p.g[3] != null) kv.push(["拍攝方向", `${DIR8[Math.round(p.g[3] / 45) % 8]}（${p.g[3]}°）`]);
  if (p.g) kv.push(["座標", `${p.g[0].toFixed(5)}, ${p.g[1].toFixed(5)}`]);
  if (x.sw) kv.push(["軟體", x.sw]);
  kv.push(["檔名", p.n]);
  h += `<div class="ibox ikv">${kv.filter(r => r[1]).map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>`;
  if (D.dl) h += `<div class="idl"><a class="pr" href="${src(p, "o")}" download>${I("dl")}下載原圖</a></div>`;
  return h;
}

boot();
