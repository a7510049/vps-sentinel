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
  phone:'<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
  lock:'<rect x="4" y="10.5" width="16" height="10.5" rx="3"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  photo:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  off:'<path d="M3 3l18 18M10.6 5H18a3 3 0 0 1 3 3v8.4M3 7.8V17a3 3 0 0 0 3 3h11.2"/><path d="m21 16-4-4M14 17l-4-4-7 7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  zip:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  play:'<path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8Z" fill="currentColor" stroke="none"/>',
  pause:'<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>',
  heart:'<path d="M12 20.5S3.5 15.3 3.5 9.2A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.5 2.6c0 6.1-8.5 11.3-8.5 11.3Z"/>',
  chat:'<path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l.9-4.1A8 8 0 1 1 20 12Z"/>',
  live:'<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="5.8"/><circle cx="12" cy="12" r="9.2" stroke-dasharray="1.6 2.4"/>',
  snd:'<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.3 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute:'<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  send:'<path d="M4.5 12h13M12.5 6l6 6-6 6"/>', again:'<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5M4 4v4.5h4.5"/>'
};
const I = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;
const src = (p, k) => `${BASE}/i/${p.i}/${k}?v=${p.v}`;
const anim = () => !RM.matches;
const isVid = p => !!p.vd;
const dur = t => { t = Math.max(0, Math.round(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const ago = t => { const s = Date.now() / 1000 - t; return s < 60 ? "剛剛" : s < 3600 ? `${Math.floor(s / 60)} 分鐘前` : s < 86400 ? `${Math.floor(s / 3600)} 小時前` : s < 86400 * 30 ? `${Math.floor(s / 86400)} 天前` : new Date(t * 1000).toLocaleDateString("zh-TW"); };
const store = {get:k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }, set:(k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }};
let D = null, PH = [], TILES = [], SS = null;

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

/* ── 地圖：OpenStreetMap 的圖塊，主機幫忙拿（朋友不用連外面）；高一級的圖塊縮一半放，手機上才清楚 ── */
const lx = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z;
const ly = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
function tiles(el, cx, cy, z, W, H){
  const hi = z < 19 ? 2 : 1, Z = z + (hi > 1 ? 1 : 0), n = 2 ** Z, T = 256 / hi;
  const X = cx * hi, Y = cy * hi, w = W * hi, h0 = H * hi;
  let h = "";
  for (let tx = Math.floor((X - w / 2) / 256); tx <= Math.floor((X + w / 2) / 256); tx++)
    for (let ty = Math.floor((Y - h0 / 2) / 256); ty <= Math.floor((Y + h0 / 2) / 256); ty++) {
      if (ty < 0 || ty >= n) continue;
      const x = ((tx % n) + n) % n;
      h += `<img class="tl" alt="" draggable="false" style="left:${(tx * 256 - X + w / 2) / hi}px;top:${(ty * 256 - Y + h0 / 2) / hi}px;width:${T}px;height:${T}px" src="${BASE}/t/${Z}/${x}/${ty}">`;
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
  if (r.status === 403) { const x = await r.json().catch(() => ({}));
    return gate("phone", x.ban ? "這支手機不能看這本相簿" : "名額已經滿了", "", x.ban ? "" : "這本相簿只給指定的手機看"); }
  if (!r.ok) return gate("off", "這本相簿已經看不到了", "", "連結已經收回或過期");
  D = await r.json();
  PH = D.photos || [];
  document.title = D.name;
  if (!PH.length) return gate("photo", "這本相簿還沒有照片");
  draw();
  if ((D.loc && PH.some(p => p.g && !p.p)) || PH.some(p => p.vr === -1)) setTimeout(refresh, 6000);
}
let REF = 0;
async function refresh(){                                  // 地名在主機背景慢慢查：查到了補上去
  try {
    const r = await fetch(BASE + "/m", {credentials:"same-origin", cache:"no-store"});
    if (!r.ok) return;
    const d = await r.json(), by = Object.fromEntries((d.photos || []).map(p => [p.i, p]));
    PH.forEach((p, k) => { const n = by[p.i]; if (!n) return; p.p = n.p; if (!p.q && n.q) p.q = n.q;
      if (n.vr !== p.vr || n.lv !== p.lv) { p.vr = n.vr; p.lv = n.lv; badge(k); if (LB && LB.i === k) LB.chrome(); } });
    D.places = d.places;
    const ch = $(".hmeta [data-pl]");
    if (ch && D.places.length) ch.lastChild.textContent = D.places.slice(0, 3).join("・");
    else if (!ch && D.places.length) $(".hmeta").insertAdjacentHTML("beforeend", `<span class="chip" data-pl>${I("pin")}<span>${esc(D.places.slice(0, 3).join("・"))}</span></span>`);
    document.querySelectorAll(".dh[data-day]").forEach(h => { const s = h.querySelector("span"), t = dayPlaces(h.dataset.day); if (s && t) s.textContent = t; });
    if (PH.some(p => p.vr === -1) ? ++REF < 90 : PH.some(p => p.g && !p.p) && ++REF < 5) setTimeout(refresh, 8000);
  } catch (e) {}
}
function gate(ic, title, form, sub){
  document.title = title;
  $("#app").innerHTML = `<div class="gate"><div class="glow"></div><form class="card"><div class="ic">${I(ic)}</div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}${form || ""}</form></div>`;
  return $(".card");
}
function askPw(){
  const f = gate("lock", "這本相簿上了鎖", `<input class="field" type="password" autocomplete="current-password" aria-label="密碼" placeholder="密碼" required><button class="btn">打開相簿</button><div class="msg"></div>`);
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
      <div class="hcap">${a ? `<div class="eyebrow num">${esc(frange(a, b))}</div>` : ""}<h1>${esc(D.name)}</h1>
        <div class="hmeta"><button class="chip go" data-ss>${I("play")}<span>播放</span></button><span class="chip">${I("photo")}<span class="num">${cntTxt()}</span></span>${pl ? `<span class="chip" data-pl>${I("pin")}<span>${esc(pl)}</span></span>` : ""}
        ${D.dl ? `<a class="chip" href="${BASE}/zip" download>${I("dl")}<span>全部下載</span></a>` : ""}</div></div>
      <button class="cue" aria-label="往下看"><i></i></button></header>
    <div class="bar"><b>${esc(D.name)}<small class="num">${cntTxt()}</small></b><button class="chip go" data-ss aria-label="播放">${I("play")}</button>${D.dl ? `<a class="chip" href="${BASE}/zip" download aria-label="全部下載">${I("dl")}</a>` : ""}</div>
    <main class="wall">${GROUPS.map((g, gi) => `<section class="day" data-g="${gi}">${g.k && g.d ? `<div class="dh" data-day="${g.k}"><b>${fday(g.d, yr)}</b><span>${esc(dayPlaces(g.k))}</span></div>` : ""}<div class="rows"></div></section>`).join("")}</main>
    ${D.loc && PH.some(p => p.g) ? `<section class="msec"><div class="mh"><b>旅程</b><span class="num" data-km>${PH.filter(p => p.g).length} 個地點</span></div><div class="map" data-map></div></section>` : ""}
    <footer class="foot"><div class="fin">${esc(D.name)}</div>${D.exp ? `<span>${I("clock")}${left(D.exp)}</span>` : ""}</footer>`;
  const hi = $(".hero .hi");
  hi.complete ? hi.classList.add("ok") : hi.addEventListener("load", () => hi.classList.add("ok"), {once:true});
  if (D.wmo) document.documentElement.style.setProperty("--wm", JSON.stringify(D.wmo));
  document.documentElement.classList.toggle("wmo", !!D.wmo);
  TILES = PH.map((p, i) => tile(p, i));
  layout();
  bigMap();
  onScroll();
}
function cntTxt(){
  const v = PH.filter(isVid).length, n = PH.length - v;
  return [n ? `${n} 張` : "", v ? `${v} 段影片` : ""].filter(Boolean).join("・");
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
  el.innerHTML = `${p.q ? `<img class="lq" alt="" src="data:image/jpeg;base64,${p.q}">` : ""}<img class="hi" alt="" loading="lazy" decoding="async" draggable="false" src="${src(p, "s")}"><span class="bdg"></span>`;
  setTimeout(() => badge(i));
  const hi = el.querySelector(".hi");
  hi.addEventListener("load", () => hi.classList.add("ok"), {once:true});
  hi.addEventListener("error", () => { p.broken = 1; hi.remove(); el.insertAdjacentHTML("beforeend", `<span class="nope">${I("off")}</span>`); }, {once:true});
  if (IO) IO.observe(el); else el.classList.add("in");
  return el;
}
function badge(i){                                          // 格子上的小標：影片長度、原況、愛心
  const t = TILES[i], p = PH[i]; if (!t) return;
  const b = t.querySelector(".bdg");
  b.innerHTML = `${isVid(p) ? `<span class="vt num">${I("play")}${dur(p.vd)}</span>` : p.lv ? `<span class="lvt">${I("live")}</span>` : ""}${p.lk ? `<span class="lkt num">${I("heart")}${p.lk}</span>` : ""}`;
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
    const big = g.list.length >= 5 && PH[g.list[0]].w / PH[g.list[0]].h >= 1.3 && W >= 320 ? g.list[0] : -1;   // 一天的第一張橫的放整排
    if (big >= 0) { const ar = Math.min(3, PH[big].w / PH[big].h); rows.push([[[big, W / Math.min(W / ar, innerHeight * .72)]], Math.min(W / ar, innerHeight * .72), 1]); }
    g.list.forEach(i => {
      if (i === big) return;
      const p = PH[i], ar = Math.min(3, Math.max(.4, p.w / p.h));
      cur.push([i, ar]); sum += ar;
      if (sum * rh + gap * (cur.length - 1) >= W) { rows.push([cur, (W - gap * (cur.length - 1)) / sum]); cur = []; sum = 0; }
    });
    if (cur.length) rows.push([cur, Math.min(rh * 1.1, (W - gap * (cur.length - 1)) / sum)]);
    const frag = document.createDocumentFragment();
    rows.forEach(([list, h, feat]) => {
      const r = document.createElement("div"); r.className = feat ? "row feat" : "row"; r.style.height = h.toFixed(2) + "px";
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
addEventListener("contextmenu", e => { if (e.target.closest(".ph,.zw,.mk,.hero")) e.preventDefault(); });   // 不能按右鍵、長按另存
addEventListener("dragstart", e => { if (e.target.tagName === "IMG") e.preventDefault(); });
document.addEventListener("click", e => {
  const t = e.target.closest(".ph");
  if (t) return openLb(+t.dataset.i);
  if (e.target.closest(".cue")) return scrollTo({top:$(".hero").offsetHeight - 8, behavior:anim() ? "smooth" : "auto"});
  if (e.target.closest("[data-ss]")) return show(0);
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
  el.innerHTML = `<span class="attr">© OpenStreetMap</span>`;
  tiles(el, cx, cy, z, W, H);
  const cl = [];
  pts.forEach(([p, i], k) => {
    const x = xs[k] - cx + W / 2, y = ys[k] - cy + H / 2, c = cl.find(c => Math.hypot(c.x - x, c.y - y) < 46);
    if (c) c.n++; else cl.push({x, y, i, n:1});
  });
  el.insertAdjacentHTML("beforeend", cl.map((c, k) => `<button class="mk" data-i="${c.i}" style="left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px;animation-delay:${Math.min(k * 40, 600)}ms"><img alt="" loading="lazy" src="${src(PH[c.i], "s")}">${c.n > 1 ? `<i class="num">${c.n}</i>` : ""}</button>`).join(""));
  route(el, pts.map(([p], k) => ({x:xs[k] - cx + W / 2, y:ys[k] - cy + H / 2, g:p.g, d:pd(p.x.dt)})), W, H);
}

/* 旅程路線：照拍攝時間把地點連起來，捲到時一筆畫出來，再有一個亮點沿著走 */
function route(el, pts, W, H){
  let km = 0;
  for (let k = 1; k < pts.length; k++) {
    const [a1, o1] = pts[k - 1].g, [a2, o2] = pts[k].g, r = Math.PI / 180;
    const h = Math.sin((a2 - a1) * r / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin((o2 - o1) * r / 2) ** 2;
    km += 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const kmEl = $("[data-km]");
  if (kmEl) kmEl.textContent = km >= 1 ? `走了約 ${km >= 100 ? Math.round(km) : +km.toFixed(1)} 公里` : km >= .05 ? `走了約 ${Math.round(km * 1000 / 10) * 10} 公尺` : `${pts.length} 個地點`;
  const r = [];
  pts.forEach(q => { const l = r[r.length - 1]; if (!l || Math.hypot(l.x - q.x, l.y - q.y) > 14) r.push(q); else if (q.d && (!l.d || l.d.k !== q.d.k)) l.d = q.d; });
  if (r.length < 2) return;
  let d = `M${r[0].x.toFixed(1)} ${r[0].y.toFixed(1)}`;
  for (let k = 0; k < r.length - 1; k++) {
    const p0 = r[k - 1] || r[k], p1 = r[k], p2 = r[k + 1], p3 = r[k + 2] || p2;
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  const days = [];
  r.forEach(q => { if (q.d && !days.some(x => x.d.k === q.d.k)) days.push(q); });
  el.insertAdjacentHTML("afterbegin", `<svg class="route" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="rt0" d="${d}"/><path class="rt" d="${d}"/>
    <circle class="rdot" r="5"><animateMotion dur="${Math.max(4, Math.min(14, r.length * 1.4))}s" repeatCount="indefinite" begin="indefinite" path="${d}" rotate="auto"/></circle></svg>
    ${days.length > 1 ? days.map((q, k) => `<span class="dayn num" style="left:${q.x.toFixed(1)}px;top:${q.y.toFixed(1)}px" title="${esc(fday(q.d))}">第 ${k + 1} 天</span>`).join("") : ""}`);
  const path = el.querySelector(".rt"), len = path.getTotalLength();
  el.style.setProperty("--len", len.toFixed(0));
  const go = () => { el.classList.add("drawn"); setTimeout(() => { const m = el.querySelector("animateMotion"); try { m && m.beginElement(); } catch (e) {} }, anim() ? 2400 : 0); };
  if (!anim() || !("IntersectionObserver" in window)) return go();
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, {threshold:.35});
  io.observe(el);
}

/* ═════════ 看大圖 ═════════ */
let LB = null;
const GAPX = 28;
function openLb(i){
  if (LB) return;
  const el = document.createElement("div");
  el.className = "lb";
  el.innerHTML = `<div class="bg"></div><div class="stage"><div class="track"></div></div>
    <div class="lbt"><button class="rb" data-x aria-label="關閉">${I("x")}</button><span class="cnt num"></span><button class="rb lvb" data-lv aria-label="原況">${I("live")}</button><button class="rb" data-ssi aria-label="從這張開始播放">${I("play")}</button><button class="rb" data-inf aria-label="照片資訊">${I("info")}</button>${D.dl ? `<a class="rb" data-dl download aria-label="${D.dl > 1 ? "下載原圖" : "下載"}">${I("dl")}</a>` : ""}</div>
    <button class="rb nav l" aria-label="上一張">${I("l")}</button><button class="rb nav r" aria-label="下一張">${I("r")}</button>
    <div class="lbb"><div class="vbar"><button class="vpp" data-vpp aria-label="播放">${I("play")}</button><span class="vt0 num">0:00</span><div class="vtr" data-vseek><i></i></div><span class="vt1 num"></span><button class="vpp" data-vmu aria-label="聲音">${I("snd")}</button></div>
      <div class="lbr"><div class="cap"><b></b><span></span></div>${D.talk ? `<button class="sb" data-lk aria-label="愛心">${I("heart")}<span class="num"></span></button><button class="sb" data-cm aria-label="留言">${I("chat")}<span class="num"></span></button>` : ""}</div></div><div class="inf"></div>`;
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
    zw.innerHTML = `<img class="s1" alt="" draggable="false" src="${p.q ? `data:image/jpeg;base64,${p.q}` : src(p, "s")}"><img class="s1" alt="" draggable="false" src="${src(p, "s")}"><img class="s2" alt="" draggable="false" src="${src(p, "l")}">`
      + (isVid(p) ? `<video class="vv" playsinline preload="none" disablepictureinpicture></video><span class="vbig">${p.vr === 1 ? I("play") : `<i class="spin"></i>`}</span>` : p.lv ? `<video class="lvv" muted playsinline preload="none"></video>` : "");
    const big = zw.querySelector(".s2");
    big.complete && big.naturalWidth ? big.classList.add("ok") : big.addEventListener("load", () => big.classList.add("ok"), {once:true});
  }
  function place(){ sl.forEach((s, k) => { s.style.transform = `translateX(${(k - 1) * (W() + GAPX)}px)`; }); }
  function setAll(){ fill(sl[0], S.i - 1); fill(sl[1], S.i); fill(sl[2], S.i + 1); place(); chrome(); }
  S.fitAll = () => { const zw = cur(); zw.style.transition = `left ${T.mid}ms ${EASE},top ${T.mid}ms ${EASE},width ${T.mid}ms ${EASE},height ${T.mid}ms ${EASE}`;
    setZoom(1, 0, 0); setAll(); setTimeout(() => { zw.style.transition = ""; }, T.mid + 30); };
  const cur = () => sl[1].firstChild;
  function setZoom(s, x, y){ S.z = {s, x, y}; cur().style.transform = s === 1 && !x && !y ? "" : `translate(${x}px,${y}px) scale(${s})`; }
  const vid = () => cur().querySelector("video");
  function stopAll(){ el.querySelectorAll("video").forEach(v => { if (!v.paused) v.pause(); v.closest(".zw").classList.remove("playing", "moving"); }); }
  function vSync(){                                          // 影片的播放鈕、進度條
    const v = vid(), p = PH[S.i];
    el.classList.toggle("isv", isVid(p));
    if (!isVid(p)) return;
    const vb = $(".vbar", el), pl = v && !v.paused;
    vb.querySelector("[data-vpp]").innerHTML = I(pl ? "pause" : "play");
    vb.querySelector("[data-vmu]").innerHTML = I(v && v.muted ? "mute" : "snd");
    const t = v && v.currentTime || 0, T0 = v && isFinite(v.duration) ? v.duration : p.vd;
    vb.querySelector(".vt0").textContent = dur(t); vb.querySelector(".vt1").textContent = dur(T0);
    vb.querySelector(".vtr i").style.transform = `scaleX(${T0 ? Math.min(1, t / T0) : 0})`;
    const big = cur().querySelector(".vbig"); if (big) big.innerHTML = p.vr === 1 ? I("play") : `<i class="spin"></i>`;
  }
  function vToggle(){
    const v = vid(), p = PH[S.i]; if (!v || !isVid(p)) return;
    if (p.vr !== 1) return toast(p.vr === 0 ? "這段影片放不出來" : "影片還在準備，等一下再看");
    if (!v.src) {
      v.src = src(p, "v");
      v.addEventListener("timeupdate", vSync); v.addEventListener("pause", vSync); v.addEventListener("play", vSync);
      v.addEventListener("ended", () => { v.closest(".zw").classList.remove("playing"); el.classList.remove("bare"); vSync(); });
      v.addEventListener("error", () => toast("這段影片放不出來"), {once:true});
    }
    if (v.paused) { v.closest(".zw").classList.add("playing"); v.play().catch(() => {}); setTimeout(() => { if (!v.paused) el.classList.add("bare"); }, 1200); }
    else v.pause();
    vSync();
  }
  function live(){                                           // 原況照片：動一下
    const p = PH[S.i], v = cur().querySelector(".lvv"); if (!p.lv || !v) return;
    if (!v.src) { v.src = src(p, "m"); v.addEventListener("ended", () => v.closest(".zw").classList.remove("moving")); }
    v.currentTime = 0; v.closest(".zw").classList.add("moving"); v.play().catch(() => v.closest(".zw").classList.remove("moving"));
  }
  function social(){
    const p = PH[S.i], lk = $("[data-lk]", el), cm = $("[data-cm]", el); if (!lk) return;
    lk.classList.toggle("on", !!p.me); lk.querySelector("span").textContent = p.lk || "";
    cm.querySelector("span").textContent = (p.cm || []).length || "";
  }
  function chrome(){
    const p = PH[S.i], d = pd(p.x.dt), moved = S.at !== S.i;
    S.at = S.i;
    if (moved) stopAll();
    $("[data-lv]", el).classList.toggle("show", !!p.lv);
    social(); vSync();
    if (moved && p.lv && anim()) setTimeout(() => { if (LB === S && PH[S.i] === p) live(); }, 350);
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
  S.chrome = chrome; S.vToggle = vToggle;

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
    stopAll();
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
    stopAll();
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
      tapT = setTimeout(() => { if (S.info) setInfo(false); else if (isVid(PH[S.i]) && vid()) { vToggle(); if (vid().paused) el.classList.remove("bare"); } else el.classList.toggle("bare"); }, 300);
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
    if (e.target.closest("[data-lv]")) return live();
    if (e.target.closest("[data-ssi]")) return show(S.i);
    if (e.target.closest("[data-vpp]")) return vToggle();
    if (e.target.closest("[data-vmu]")) { const v = vid(); if (v) { v.muted = !v.muted; vSync(); } return; }
    const sk = e.target.closest("[data-vseek]");
    if (sk) { const v = vid(), r = sk.getBoundingClientRect(); if (v && v.src && isFinite(v.duration)) { v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.duration; vSync(); } return; }
    if (e.target.closest("[data-lk]")) return like(S.i, e.target.closest("[data-lk]"), social);
    if (e.target.closest("[data-cm]")) { if (!S.info) setInfo(true); setTimeout(() => { const t = $(".italk", inf); if (t) t.scrollIntoView({behavior:anim() ? "smooth" : "auto", block:"start"}); }, S.info ? 0 : T.mid); return; }
    if (e.target.closest(".nav.l")) return go(-1);
    if (e.target.closest(".nav.r")) return go(1);
  });
  inf.addEventListener("click", e => {
    const del = e.target.closest("[data-cdel]");
    if (del) talk(S.i, {del:del.dataset.cdel}).then(ok => { if (ok) { inf.querySelector(".italk").outerHTML = talkHTML(PH[S.i]); social(); } });
  });
  inf.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target, nm = f.querySelector("[name=n]"), tx = f.querySelector("[name=s]");
    const name = (nm ? nm.value : store.get("vsa-name")).trim();
    if (!name) { if (nm) nm.focus(); return toast("先寫你的名字"); }
    if (!tx.value.trim()) return tx.focus();
    store.set("vsa-name", name);
    f.querySelector("button").disabled = true;
    talk(S.i, {s:tx.value, n:name}).then(ok => {
      f.querySelector("button").disabled = false;
      if (!ok) return;
      const box = inf.querySelector(".italk"); box.outerHTML = talkHTML(PH[S.i]); social();
      const last = inf.querySelector(".italk .cmt:last-of-type"); if (last && anim()) last.animate([{opacity:0, transform:"translateY(8px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC});
    });
  });
  S.key = e => {
    if (e.target.closest && e.target.closest("input,textarea")) return;
    if (e.key === " " && isVid(PH[S.i])) { e.preventDefault(); return vToggle(); }
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "Escape") S.info ? setInfo(false) : history.back();
    else if (e.key === "i") setInfo(!S.info);
  };
}
addEventListener("keydown", e => SS ? SS.key(e) : LB && LB.key(e));
addEventListener("popstate", () => { if (SS) SS.close(); else if (LB) LB.close(); });

/* ── 愛心、留言 ── */
async function talk(i, body){
  try {
    const r = await fetch(BASE + "/talk", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({i:PH[i].i, ...body})});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d.message || "沒有送出去，等一下再試"); return false; }
    Object.assign(PH[i], {lk:d.lk, me:d.me, cm:d.cm});
    badge(i);
    return true;
  } catch (e) { toast("連不上，等一下再試"); return false; }
}
function like(i, btn, after){
  const p = PH[i], on = !p.me;
  p.me = on; p.lk = Math.max(0, (p.lk || 0) + (on ? 1 : -1)); after(); badge(i);
  if (on && anim()) {
    btn.querySelector("svg").animate([{transform:"scale(1)"}, {transform:"scale(1.45)", offset:.35}, {transform:"scale(.9)", offset:.7}, {transform:"scale(1)"}], {duration:T.slow, easing:EASE});
    btn.insertAdjacentHTML("beforeend", `<i class="burst"></i>`); setTimeout(() => { const b = btn.querySelector(".burst"); if (b) b.remove(); }, T.slow + 100);
  }
  talk(i, {like:on}).then(ok => { if (!ok) { p.me = !on; p.lk = Math.max(0, p.lk + (on ? -1 : 1)); } after(); });
}
function talkHTML(p){
  if (!D.talk) return "";
  const cs = p.cm || [], nm = store.get("vsa-name");
  return `<div class="ibox italk"><div class="th"><b>留言</b>${p.lk ? `<span class="num">${I("heart")}${p.lk}</span>` : ""}</div>
    ${cs.map(c => `<div class="cmt"><div class="av">${esc([...c.n][0] || "?")}</div><div class="cb"><div class="cn"><b>${esc(c.n)}</b><span>${ago(c.t)}</span></div><p>${esc(c.s)}</p></div>${c.me ? `<button class="cx" data-cdel="${esc(c.id)}" aria-label="刪掉">${I("x")}</button>` : ""}</div>`).join("")}
    <form class="cform">${nm ? "" : `<input class="cin nm" name="n" maxlength="20" placeholder="你的名字" autocomplete="nickname">`}<div class="crow"><input class="cin" name="s" maxlength="300" placeholder="${cs.length ? "說點什麼…" : "第一個留言"}" autocomplete="off"><button class="csend" aria-label="送出">${I("send")}</button></div></form></div>`;
}
let TT;
function toast(t){
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = t; el.classList.add("on");
  clearTimeout(TT); TT = setTimeout(() => el.classList.remove("on"), 2400);
}

/* ═════════ 幻燈片：慢慢推近、淡入淡出，資料夾裡有歌就配樂 ═════════ */
const SSD = 6000, SSF = 1400;
function show(start){
  if (SS) return;
  const list = PH.map((p, i) => i).filter(i => !PH[i].broken && (!isVid(PH[i]) || PH[i].vr === 1));
  if (!list.length) return;
  let at = Math.max(0, list.indexOf(start)), timer = 0, paused = false, hideT = 0, t0 = 0, left = SSD;
  const el = document.createElement("div");
  el.className = "ss";
  el.innerHTML = `<div class="ssv"></div><div class="ssp"><i></i></div>
    <div class="ssc"><button class="rb" data-sx aria-label="關閉">${I("x")}</button><span></span>${D.mu ? `<button class="rb" data-smu aria-label="音樂">${I("snd")}</button>` : ""}<button class="rb" data-spp aria-label="暫停">${I("pause")}</button></div>
    <div class="ssn"><button class="rb" data-sp aria-label="上一張">${I("l")}</button><button class="rb" data-sn aria-label="下一張">${I("r")}</button></div>`;
  document.body.appendChild(el);
  document.documentElement.style.overflow = "hidden";
  const view = $(".ssv", el), bar = $(".ssp i", el);
  let wake = null;
  try { navigator.wakeLock && navigator.wakeLock.request("screen").then(w => { wake = w; }).catch(() => {}); } catch (e) {}
  let audio = null;
  if (D.mu) { audio = new Audio(BASE + "/music"); audio.loop = true; audio.volume = 0; audio.play().then(() => fade(audio, .8)).catch(() => {}); }
  function fade(a, to, done){
    const from = a.volume, st = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - st) / 1200); try { a.volume = from + (to - from) * k; } catch (e) {} if (k < 1) requestAnimationFrame(step); else if (done) done(); };
    step();
  }
  function layer(i){
    const p = PH[i], d = pd(p.x.dt), L = document.createElement("div");
    L.className = "ssl";
    const where = p.p ? p.p.n : "", when = d ? `${d.y}年${d.mo}月${d.d}日` : "";
    const fill = Math.abs(Math.log((p.w / p.h) / (innerWidth / innerHeight))) < .22;   // 跟螢幕差不多比例就填滿
    L.innerHTML = `<img class="sbg" alt="" src="${src(p, "s")}"><div class="sfg${fill ? " cv" : ""}">${isVid(p) ? `<video muted playsinline preload="auto" src="${src(p, "v")}"></video>`
      : `<img alt="" src="${src(p, "l")}">`}</div>${where || when ? `<div class="scap"><b>${esc(where || when)}</b>${where && when ? `<span class="num">${esc(when)}</span>` : ""}</div>` : ""}`;
    return L;
  }
  function preload(k){ const i = list[k]; if (i != null && !isVid(PH[i])) { const im = new Image(); im.src = src(PH[i], "l"); } }
  function kb(L, ms){                                        // 慢慢推近，方向每張不同
    const f = L.querySelector(".sfg"); if (!anim()) return;
    const dirs = [[-1.5, -1], [1.5, 1], [1.5, -1], [-1.5, 1], [0, 0]], [x, y] = dirs[list[at] % dirs.length];
    f.animate([{transform:"scale(1.02) translate(0,0)"}, {transform:`scale(1.12) translate(${x}%,${y}%)`}], {duration:ms + SSF, easing:"cubic-bezier(.4,0,.6,1)", fill:"forwards"});
  }
  function go(k, first){
    clearTimeout(timer);
    if (k >= list.length) return end();
    at = Math.max(0, k);
    const old = view.querySelector(".ssl:not(.out)"), L = layer(list[at]);
    view.appendChild(L);
    const p = PH[list[at]], v = L.querySelector("video");
    let ms = SSD;
    if (v) { ms = Math.min(15000, p.vd * 1000); v.play().catch(() => {}); }
    kb(L, v ? 0 : ms);
    const img = L.querySelector(".sfg img");
    const reveal = () => {
      L.classList.add("in");
      if (old) { old.classList.add("out"); setTimeout(() => old.remove(), SSF + 50); }
    };
    if (img && !img.complete) { img.addEventListener("load", reveal, {once:true}); img.addEventListener("error", reveal, {once:true}); } else requestAnimationFrame(reveal);
    $(".ssc span", el).textContent = `${at + 1} / ${list.length}`;
    left = ms; t0 = performance.now();
    bar.style.transition = "none"; bar.style.transform = "scaleX(0)"; void bar.offsetWidth;
    bar.style.transition = `transform ${ms}ms linear`; bar.style.transform = "scaleX(1)";
    if (paused) pause(true);
    else timer = setTimeout(() => go(at + 1), ms);
    preload(at + 1);
  }
  function pause(on){
    paused = on;
    $("[data-spp]", el).innerHTML = I(on ? "play" : "pause");
    const v = view.querySelector(".ssl:not(.out) video");
    view.querySelectorAll(".ssl:not(.out) .sfg").forEach(f => f.getAnimations().forEach(a => on ? a.pause() : a.play()));
    if (on) {
      clearTimeout(timer); left = Math.max(0, left - (performance.now() - t0));
      const k = getComputedStyle(bar).transform; bar.style.transition = "none"; bar.style.transform = k === "none" ? "scaleX(0)" : k;
      if (v) v.pause(); if (audio) audio.pause();
    } else {
      t0 = performance.now(); bar.style.transition = `transform ${left}ms linear`; bar.style.transform = "scaleX(1)";
      timer = setTimeout(() => go(at + 1), left);
      if (v) v.play().catch(() => {}); if (audio && !audio.muted) audio.play().catch(() => {});
    }
    poke();
  }
  function end(){
    clearTimeout(timer);
    const old = view.querySelector(".ssl:not(.out)"); if (old) old.classList.add("out");
    view.insertAdjacentHTML("beforeend", `<div class="ssend"><div class="fin">${esc(D.name)}</div><button class="chip go" data-sa>${I("again")}<span>再看一次</span></button></div>`);
    if (audio) fade(audio, 0, () => audio.pause());
    el.classList.remove("bare");
  }
  function poke(){
    el.classList.remove("bare"); clearTimeout(hideT);
    if (!paused) hideT = setTimeout(() => el.classList.add("bare"), 2600);
  }
  function close(){
    if (S.closing) return; S.closing = 1;
    clearTimeout(timer); clearTimeout(hideT);
    try { wake && wake.release(); } catch (e) {}
    try { document.fullscreenElement && document.exitFullscreen(); } catch (e) {}
    if (audio) fade(audio, 0, () => audio.pause());
    const fin = () => { el.remove(); if (!LB) document.documentElement.style.overflow = ""; SS = null; };
    if (!anim()) return fin();
    el.animate([{opacity:1}, {opacity:0}], {duration:T.mid, easing:EASE, fill:"forwards"}).onfinish = fin;
  }
  const S = {close, key:e => {
    if (e.key === "Escape") history.back();
    else if (e.key === " ") { e.preventDefault(); pause(!paused); }
    else if (e.key === "ArrowRight") { go(at + 1); poke(); }
    else if (e.key === "ArrowLeft") { go(at - 1); poke(); }
  }};
  SS = S;
  el.addEventListener("click", e => {
    if (e.target.closest("[data-sx]")) return history.back();
    if (e.target.closest("[data-spp]")) return pause(!paused);
    if (e.target.closest("[data-sn]")) { go(at + 1); return poke(); }
    if (e.target.closest("[data-sp]")) { go(at - 1); return poke(); }
    if (e.target.closest("[data-sa]")) { const x = view.querySelector(".ssend"); if (x) x.remove(); if (audio) { audio.currentTime = 0; audio.play().then(() => fade(audio, .8)).catch(() => {}); } go(0); return poke(); }
    if (e.target.closest("[data-smu]")) { audio.muted = !audio.muted; if (!audio.muted && !paused) audio.play().catch(() => {}); e.target.closest("[data-smu]").innerHTML = I(audio.muted ? "mute" : "snd"); return poke(); }
    if (el.classList.contains("bare")) poke(); else { clearTimeout(hideT); el.classList.add("bare"); }
  });
  el.addEventListener("pointermove", e => { if (e.pointerType === "mouse") poke(); });
  let sx = null;
  el.addEventListener("pointerdown", e => { sx = {x:e.clientX, y:e.clientY}; });
  el.addEventListener("pointerup", e => {
    if (!sx) return; const dx = e.clientX - sx.x, dy = e.clientY - sx.y; sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { go(at + (dx < 0 ? 1 : -1)); poke(); }
    else if (dy > 90) history.back();
  });
  history.pushState({ss:1}, "");
  if (matchMedia("(pointer:fine)").matches && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  if (anim()) el.animate([{opacity:0}, {opacity:1}], {duration:T.slow, easing:EASE});
  go(at, true);
  poke();
}

/* 照片資訊（越詳細越好）：時間、地點、相機、鏡頭、光圈、快門、ISO… */
function infoHTML(p){
  const x = p.x, d = pd(x.dt), cam = camName(x), lens = lensName(x), ext = (p.n.split(".").pop() || "").toUpperCase().replace("JPG", "JPEG");
  const mp = p.w * p.h / 1e6, f35 = x.f35 || 0, fl = x.fl || 0;
  let h = d ? `<div class="idt">${fdate(d)}</div><div class="itm num">${x.dtf ? "檔案時間 " : ""}${ftime(d)}${x.oz ? `・UTC${x.oz.replace(":00", "")}` : ""}</div>` : "";
  h += talkHTML(p);
  if (p.g) {
    const [lat, lon, alt, dir] = p.g, nm = p.p ? p.p.n : "拍攝地點", sub = p.p && p.p.a ? p.p.a : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    h += `<div class="ibox"><a class="imap" href="${mapUrl(lat, lon, nm)}" target="_blank" rel="noopener noreferrer" aria-label="在地圖上打開">${dir != null ? `<span class="cone" style="transform:rotate(${dir}deg)"></span>` : ""}<span class="pin"></span><span class="attr">© OpenStreetMap</span></a>
      <a class="ipl" href="${mapUrl(lat, lon, nm)}" target="_blank" rel="noopener noreferrer"><span class="pi">${I("pin")}</span><span><b>${esc(nm)}</b><span>${esc(sub)}</span></span><span class="go">${I("ext")}</span></a></div>`;
  }
  const cells = [["ISO", x.iso || ""], ["焦距", f35 ? `${f35} mm` : fl ? `${Math.round(fl)} mm` : ""], ["曝光", x.ev != null ? `${x.ev > 0 ? "+" : ""}${+x.ev.toFixed(1)} ev` : ""],
    ["光圈", x.f ? `ƒ${+x.f.toFixed(2)}` : ""], ["快門", shutter(x.et).replace(" 秒", " s")]];
  h += `<div class="ibox"><div class="icam"><div class="t"><b>${esc(cam || (isVid(p) ? "影片" : "相機資訊"))}</b><span class="tag">${esc(ext)}</span></div>
      ${lens || f35 ? `<div class="l">${esc([f35 ? `${lensKind(f35)}・等效 ${f35} mm` : "", lens].filter(Boolean).join("　"))}</div>` : ""}
      <div class="l2 num">${isVid(p) ? `影片 ${dur(p.vd)}・` : mp >= .1 ? `${mp >= 10 ? Math.round(mp) : mp.toFixed(1)} MP・` : ""}${p.w} × ${p.h}・${size(p.sz)}</div></div>
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
  if (D.dl) h += `<div class="idl"><a class="pr" href="${src(p, "o")}" download>${I("dl")}${D.dl > 1 ? (isVid(p) ? "下載影片" : "下載原圖") : "下載"}</a></div>`;
  return h;
}

boot();
