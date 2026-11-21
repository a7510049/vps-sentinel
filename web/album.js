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
  zin:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>', zout:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
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
  up:'<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>', sel:'<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16 9.5"/>', ck:'<path d="m6 12.5 4 4 8-9"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
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
let ALL = [], WHO = "";                                      // 全部照片；現在看的分頁（空字串＝主人的，不然是朋友的資料夾）
const TM = new Map();                                        // 照片編號 → 格子（換分頁時重用）
const pickW = () => ALL.filter(p => (p.u || "") === WHO);

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
  ALL = D.photos || [];
  if (!ALL.some(p => !p.u) && ALL.length) WHO = ALL[0].u;
  PH = pickW();
  document.title = D.name;
  if (!PH.length) return gate("photo", "這本相簿還沒有照片", D.up ? `<button type="button" class="btn" data-up>放照片</button>` : "");
  draw();
  if ((D.loc && ALL.some(p => p.g && !p.p)) || ALL.some(p => p.vr === -1)) setTimeout(refresh, 6000);
}
let REF = 0;
async function refresh(){                                  // 地名在主機背景慢慢查：查到了補上去
  try {
    const r = await fetch(BASE + "/m", {credentials:"same-origin", cache:"no-store"});
    if (!r.ok) return;
    const d = await r.json(), by = Object.fromEntries((d.photos || []).map(p => [p.i, p]));
    ALL.forEach(p => { const n = by[p.i]; if (!n) return; p.p = n.p; if (!p.q && n.q) p.q = n.q;
      if (n.vr !== p.vr || n.lv !== p.lv || n.gf !== p.gf) { p.vr = n.vr; p.lv = n.lv; p.gf = n.gf; const k = PH.indexOf(p); if (k >= 0) { badge(k); if (LB && LB.i === k) LB.chrome(); } } });
    D.places = d.places;
    const ch = $(".hmeta [data-pl]");
    if (ch && D.places.length) ch.lastChild.textContent = D.places.slice(0, 3).join("・");
    else if (!ch && D.places.length) $(".hmeta").insertAdjacentHTML("beforeend", `<span class="chip" data-pl>${I("pin")}<span>${esc(D.places.slice(0, 3).join("・"))}</span></span>`);
    document.querySelectorAll(".dh[data-day]").forEach(h => { const s = h.querySelector("span"), t = dayPlaces(h.dataset.day); if (s && t) s.textContent = t; });
    if (ALL.some(p => p.vr === -1) ? ++REF < 90 : ALL.some(p => p.g && !p.p) && ++REF < 5) setTimeout(refresh, 8000);
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
let GROUPS = [], YR = false;
/* 照片牆的大小：0 大格、1 一般、2 小方格、3 按月份的小方格（兩指捏、Ctrl＋滾輪、＋－鍵） */
const ZMUL = [1.7, 1, .62, .36];
let ZL = Math.min(3, Math.max(0, +store.get("vsa-zoom") || 1));
function groupsOf(z){
  const days = [...new Set(PH.map(p => (pd(p.x.dt) || {}).k).filter(Boolean))];
  if (z === 3) {                                             // 按月份
    const by = {};
    PH.forEach((p, i) => { const d = pd(p.x.dt), k = d ? `${d.y}${String(d.mo).padStart(2, "0")}` : "0"; (by[k] = by[k] || {k, d, m:1, list:[]}).list.push(i); });
    return Object.values(by);
  }
  if (days.length > 1 && PH.length >= 6) {
    const by = {};
    PH.forEach((p, i) => { const d = pd(p.x.dt), k = d ? d.k : "0"; (by[k] = by[k] || {k, d, list:[]}).list.push(i); });
    return Object.values(by);
  }
  return [{k:"", list:PH.map((_, i) => i)}];
}
function sections(){
  GROUPS = groupsOf(ZL);
  const w = $(".wall"); w.dataset.z = ZL;
  w.innerHTML = GROUPS.map((g, gi) => `<section class="day" data-g="${gi}">${g.k && g.d ? g.m
    ? `<div class="dh" data-k="m${g.k}"><b>${g.d.y}年${g.d.mo}月</b><span class="num">${g.list.length}</span></div>`
    : `<div class="dh" data-day="${g.k}" data-k="d${g.k}"><b>${fday(g.d, YR)}</b><span>${esc(dayPlaces(g.k))}</span></div>` : ""}<div class="rows"></div></section>`).join("");
}
function wallRects(){                                         // 現在畫面上每張的位置（動畫中、手指捏著的也算）
  const vis = new Map(), H = innerHeight;
  TILES.forEach((t, i) => { const r = t.getBoundingClientRect(); if (r.bottom > -60 && r.top < H + 60) vis.set(i, r); });
  return vis;
}
const ZDUR = 520;
const zEase = t => 1 - Math.pow(1 - t, 3.2);                  // 跟手指放開一樣的減速
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);   // iPhone 的捏常被 Safari 搶走，上面多放大小鈕
function zbSync(){ document.querySelectorAll("[data-zb]").forEach(b => { b.disabled = ZL + +b.dataset.zb < 0 || ZL + +b.dataset.zb > 3; }); }
function zoomWall(z, fx, fy, pre){                            // 換大小：每張從現在的位置連續長大／縮小過去，照片不壓扁
  z = Math.min(3, Math.max(0, z));
  if (z === ZL || !$(".wall")) return false;
  const vis = pre || wallRects(), H = innerHeight;
  let anc = -1, best = 1e9;                                   // 手指下面那張留在手指下面
  vis.forEach((r, i) => { const d = Math.hypot(r.left + r.width / 2 - fx, r.top + r.height / 2 - fy); if (d < best) { best = d; anc = i; } });
  const a0 = anc >= 0 ? vis.get(anc) : null;
  TILES.forEach(t => { t.getAnimations().forEach(a => a.cancel()); t.querySelectorAll("img,.bdg").forEach(x => x.getAnimations().forEach(a => a.cancel())); });
  document.querySelectorAll(".dh").forEach(h => h.getAnimations().forEach(a => a.cancel()));
  const OUT = [".mems", ".msec", ".foot"].map(q => $(q)).filter(Boolean);       // 照片牆上下的回憶、地圖、結尾也跟著滑
  OUT.forEach(e => e.getAnimations().forEach(a => a.cancel()));
  const o0 = OUT.map(e => e.getBoundingClientRect().top), h0 = new Map();
  document.querySelectorAll(".dh[data-k]").forEach(h => h0.set(h.dataset.k, h.getBoundingClientRect().top));
  const w = $(".wall"); w.style.transform = ""; w.style.transformOrigin = "";
  ZL = z; store.set("vsa-zoom", z);
  zbSync();
  sections(); layout(true);
  if (a0) { const r1 = TILES[anc].getBoundingClientRect(); scrollBy(0, (r1.top + r1.height / 2) - (a0.top + a0.height / 2)); }
  if (!anim()) return true;
  const N = 14, fr = Array.from({length:N + 1}, (_, k) => zEase(k / N));
  TILES.forEach((t, i) => {
    const r0 = vis.get(i), r1 = t.getBoundingClientRect();
    if (r1.bottom < -60 || r1.top > H + 60) return;
    t.classList.add("in");
    if (!r0) { t.animate([{opacity:0, transform:"scale(.96)"}, {opacity:1, transform:"none"}], {duration:ZDUR * .8, easing:DEC}); return; }   // 原本不在畫面上的：馬上開始淡入（以前先空白一下再出來，像閃一下）
    const tk = [], ik = [];
    fr.forEach(e => {
      const x = r0.left + (r1.left - r0.left) * e, y = r0.top + (r1.top - r0.top) * e, ww = r0.width + (r1.width - r0.width) * e, hh = r0.height + (r1.height - r0.height) * e;
      const sx = ww / r1.width, sy = hh / r1.height, c = Math.max(sx, sy);
      tk.push({transform:`translate(${(x - r1.left).toFixed(2)}px,${(y - r1.top).toFixed(2)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`});
      ik.push({transform:`translate(${((ww - r1.width * c) / 2 / sx).toFixed(2)}px,${((hh - r1.height * c) / 2 / sy).toFixed(2)}px) scale(${(c / sx).toFixed(4)},${(c / sy).toFixed(4)})`});
    });
    t.animate(tk, {duration:ZDUR, easing:"linear"});
    t.querySelectorAll("img").forEach(im => im.animate(ik, {duration:ZDUR, easing:"linear"}));   // 照片反著縮回來，看起來是等比例變大變小
    const b = t.querySelector(".bdg"); if (b) b.animate([{opacity:0}, {opacity:0, offset:.6}, {opacity:1}], {duration:ZDUR, easing:"linear"});
  });
  document.querySelectorAll(".dh").forEach(h => {
    const y0 = h0.get(h.dataset.k), y1 = h.getBoundingClientRect().top;
    if (y0 != null) h.animate([{transform:`translateY(${y0 - y1}px)`}, {transform:"none"}], {duration:ZDUR, easing:DEC});   // 同一天的標題滑過去
    else h.animate([{opacity:0, transform:"translateY(6px)"}, {opacity:1, transform:"none"}], {duration:ZDUR, delay:ZDUR * .3, easing:DEC, fill:"backwards"});
  });
  OUT.forEach((e, k) => { const d = o0[k] - e.getBoundingClientRect().top; if (Math.abs(d) > 1) e.animate([{transform:`translateY(${d}px)`}, {transform:"none"}], {duration:ZDUR, easing:DEC}); });
  return true;
}
function dayPlaces(k){
  const c = {};
  PH.forEach(p => { const d = pd(p.x.dt); if (d && d.k === k && p.p) c[p.p.n] = (c[p.p.n] || 0) + 1; });
  return Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 2).join("・");
}
/* 最上面一排「回憶」：一天一個圓圈（只有一天就照地點），點了像限時動態一張一張看 */
let MEMS = [];
const SEEN = new Set(store.get("vsa-seen-" + CODE).split(",").filter(Boolean));
function memsOf(){
  const ok = i => !PH[i].broken && (!isVid(PH[i]) || PH[i].vr === 1);
  const by = {}, order = [];
  PH.forEach((p, i) => { const d = pd(p.x.dt); if (!d) return; if (!by[d.k]) { by[d.k] = {k:d.k, d, list:[]}; order.push(d.k); } by[d.k].list.push(i); });
  let gs = order.map(k => by[k]);
  const dn = d => Date.UTC(d.y, d.mo - 1, d.d) / 864e5;
  if (gs.length > 1 && dn(gs[gs.length - 1].d) - dn(gs[0].d) <= 30)   // 一趟旅行：第幾天
    gs = gs.map(g => ({...g, t:`第${dn(g.d) - dn(gs[0].d) + 1}天`, s:`${g.d.mo}月${g.d.d}日`}));
  else if (gs.length > 1) gs = gs.map(g => ({...g, t:`${g.d.mo}月${g.d.d}日`, s:YR ? `${g.d.y}` : dayPlaces(g.k).split("・")[0]}));
  else {                                                     // 只有一天：照地點分
    const pl = {}, po = [];
    PH.forEach((p, i) => { if (!p.p) return; const n = p.p.n; if (!pl[n]) { pl[n] = {k:"p" + n, list:[], t:n, s:""}; po.push(n); } pl[n].list.push(i); });
    gs = po.length > 1 ? po.map(n => pl[n]) : [];
  }
  return gs.map(g => {
    let list = g.list.filter(ok);
    if (list.length > 12) { const st = list.length / 12; list = Array.from({length:12}, (_, k) => list[Math.floor(k * st)]); }
    const cv = list.slice().sort((a, b) => (PH[b].lk || 0) - (PH[a].lk || 0))[0];
    return {...g, list, cv:(PH[cv] && PH[cv].lk) ? cv : list.find(i => !isVid(PH[i])) ?? list[0]};
  }).filter(g => g.list.length).slice(0, 40);
}
function mems(){
  const box = $(".mems"); if (!box) return;
  MEMS = WHO ? [] : memsOf();                                // 回憶、地圖只給主人的照片
  box.hidden = MEMS.length < 2;
  box.innerHTML = MEMS.length < 2 ? "" : `<div class="mrw">${MEMS.map((g, n) => `<button class="mem${SEEN.has(g.k) ? " seen" : ""}" data-mem="${n}" aria-label="${esc(g.t)}">
    <span class="mring"><img alt="" loading="lazy" draggable="false" src="${src(PH[g.cv], "s")}"></span><b>${esc(g.t)}</b>${g.s ? `<small class="num">${esc(g.s)}</small>` : ""}</button>`).join("")}</div>`;
}
function draw(){
  const ds = PH.map(p => pd(p.x.dt)).filter(Boolean), real = PH.filter(p => !p.x.dtf).map(p => pd(p.x.dt)).filter(Boolean);
  const rd = real.length ? real : ds, a = rd[0], b = rd[rd.length - 1];
  const cover = PH.find(p => p.w > p.h * 1.15 && !p.raw) || PH[0];
  YR = a && b && a.y !== b.y;
  const pl = (D.places || []).slice(0, 3).join("・");
  $("#app").innerHTML = `
    <header class="hero"><div class="cv">${cover.q ? `<img class="lq" alt="" src="data:image/jpeg;base64,${cover.q}">` : ""}<img class="hi" alt="" src="${src(cover, "l")}"></div>
      <div class="hcap">${a ? `<div class="eyebrow num">${esc(frange(a, b))}</div>` : ""}<h1>${esc(D.name)}</h1>
        <div class="hmeta"><button class="chip go" data-ss>${I("play")}<span>播放</span></button><span class="chip">${I("photo")}<span class="num">${cntTxt()}</span></span>${pl ? `<span class="chip" data-pl>${I("pin")}<span>${esc(pl)}</span></span>` : ""}
        ${D.dl ? `<a class="chip" href="${BASE}/zip" download>${I("dl")}<span>全部下載</span></a><button class="chip" data-sel>${I("sel")}<span>選取</span></button>` : ""}${D.up ? `<button class="chip" data-up>${I("up")}<span>放照片</span></button>` : ""}</div></div>
      <button class="cue" aria-label="往下看"><i></i></button></header>
    <div class="bar"><b>${esc(D.name)}<small class="num">${cntTxt()}</small></b>${IOS ? `<span class="chip zb"><button data-zb="-1" aria-label="放大">${I("zin")}</button><button data-zb="1" aria-label="縮小">${I("zout")}</button></span>` : ""}${D.up ? `<button class="chip" data-up aria-label="放照片">${I("up")}</button>` : ""}${D.dl ? `<button class="chip" data-sel aria-label="選取">${I("sel")}</button>` : ""}<button class="chip go" data-ss aria-label="播放">${I("play")}</button></div>
    <nav class="who" hidden></nav><div class="mems"></div><main class="wall" data-z="${ZL}"></main>
    ${D.loc && ALL.some(p => p.g && !p.u) ? `<section class="msec"${WHO ? " hidden" : ""}><div class="mh"><b>旅程</b><span class="num" data-km>${ALL.filter(p => p.g && !p.u).length} 個地點</span></div><div class="map" data-map></div></section>` : ""}
    <footer class="foot"><div class="fin">${esc(D.name)}</div>${D.exp ? `<span>${I("clock")}${left(D.exp)}</span>` : ""}</footer>`;
  const hi = $(".hero .hi");
  const hok = () => { hi.classList.add("ok"); setTimeout(() => { const q = $(".hero .lq"); if (q) q.remove(); }, T.slow + 100); };   // 糊的底圖拿掉，捲動時不用一直重畫模糊
  hi.complete ? hok() : hi.addEventListener("load", hok, {once:true});
  heroCycle(cover); zbSync(); tint(cover);
  if (D.wmo) document.documentElement.style.setProperty("--wm", JSON.stringify(D.wmo));
  document.documentElement.classList.toggle("wmo", !!D.wmo);
  TILES = PH.map((p, i) => tile(p, i));
  whoBar();
  sections();
  layout();
  mems();
  bigMap();
  onScroll();
}
/* 朋友放的：每個人一個分頁，不跟主人的照片混在一起 */
function whoBar(){
  const nav = $(".who"); if (!nav) return;
  const ws = [...new Set(ALL.filter(p => p.u).map(p => p.u))];
  nav.hidden = !ws.length;
  if (!ws.length) { nav.innerHTML = ""; return; }
  const cnt = w => ALL.filter(p => (p.u || "") === w).length, mine = w => ALL.some(p => p.u === w && p.um);
  const tabs = [...(ALL.some(p => !p.u) ? [["", "相簿", "photo"]] : []), ...ws.map(w => [w, w, mine(w) ? "up" : ""])];
  nav.innerHTML = `<div class="whr">${tabs.map(([w, l, ic]) => `<button class="chip${w === WHO ? " on" : ""}" data-who="${esc(w)}">${ic ? I(ic) : `<i class="av">${esc([...l][0])}</i>`}<span>${esc(l)}</span><small class="num">${cnt(w)}</small></button>`).join("")}</div>`;
}
let WHOBZ = 0;
async function whoSet(w, keep){
  if (w === WHO && !keep) return;
  if (WHOBZ) return; WHOBZ = 1;
  if (SEL.on) popBack();
  const parts = [".mems", ".wall", ".msec"].map(q => $(q)).filter(Boolean);
  if (anim()) await Promise.all(parts.map(x => x.animate([{opacity:1}, {opacity:0, transform:"translateY(6px)"}], {duration:T.fast, easing:EXIT, fill:"forwards"}).finished.catch(() => {})));
  WHO = w; PH = pickW();
  TILES.forEach(t => t.classList.remove("on"));
  TILES = PH.map((p, i) => { const t = TM.get(p.i); if (t) { t.dataset.i = i; return t; } return tile(p, i); });
  whoBar();
  sections(); layout(true); mems(); bigMap();
  const ms = $(".msec"); if (ms) ms.hidden = !!WHO || !(D.loc && PH.some(p => p.g));
  document.querySelectorAll(".hmeta .chip .num, .bar small").forEach(x => { x.textContent = cntTxt(); });
  const nav = $(".who"), top = nav && !nav.hidden ? nav.getBoundingClientRect().top + scrollY - 70 : 0;
  if (nav && scrollY > top) scrollTo({top, behavior:"auto"});
  parts.forEach(x => { x.getAnimations().forEach(a => a.cancel()); if (anim()) x.animate([{opacity:0, transform:"translateY(6px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC}); });
  WHOBZ = 0;
}
/* 封面每隔幾秒淡淡換成相簿裡隨機一張（捲走、看大圖、背景時先停） */
let HCT = 0;
/* 整頁顏色跟著封面照片：抓照片裡最多、最鮮豔的幾個色相，算成三個顏色（亮度、彩度固定，深淺模式都好讀），換封面時慢慢變過去 */
function oklchOf(r, g, b){
  const f = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
  r = f(r); g = f(g); b = f(b);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const L = .2104542553 * l + .793617785 * m - .0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, B = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}
function tintFrom(px){
  const bins = new Float64Array(36);
  let chroma = 0, n = 0;
  for (let k = 0; k < px.length; k += 4) {
    const [L, C, H] = oklchOf(px[k], px[k + 1], px[k + 2]);
    if (L < .18 || L > .96) continue;                        // 太暗、太亮的不算
    n++; chroma += C;
    if (C < .03) continue;
    const w = C * C * (1 - Math.abs(L - .62));               // 越鮮豔越算數
    bins[Math.floor(H / 10) % 36] += w; bins[(Math.floor(H / 10) + 1) % 36] += w * .5; bins[(Math.floor(H / 10) + 35) % 36] += w * .5;
  }
  const order = [...bins.keys()].sort((a, b) => bins[b] - bins[a]);
  const dist = (a, b) => { const d = Math.abs(a - b) % 36; return Math.min(d, 36 - d); };
  const h1 = order[0] * 10 + 5;
  const b2 = order.find(i => dist(i, order[0]) >= 5 && bins[i] > bins[order[0]] * .12);
  const h2 = b2 != null ? b2 * 10 + 5 : h1 + 40;
  const b3 = order.find(i => dist(i, order[0]) >= 5 && i !== b2 && (b2 == null || dist(i, b2) >= 4) && bins[i] > bins[order[0]] * .08);
  const h3 = b3 != null ? b3 * 10 + 5 : h1 - 45;
  const k = Math.min(1, Math.max(.7, (n ? chroma / n : 0) / .06));   // 照片本身灰灰的，顏色收斂一點（但不會變成灰色）
  return [`oklch(.82 ${(.12 * k).toFixed(3)} ${h2})`, `oklch(.64 ${(.16 * k).toFixed(3)} ${h1})`, `oklch(.56 ${(.15 * k).toFixed(3)} ${h3})`];
}
let TINT = "";
function tint(p){
  if (!p || p.broken || TINT === p.i) return;
  TINT = p.i;
  const im = new Image();
  im.onload = () => {
    if (TINT !== p.i) return;
    try {
      const c = document.createElement("canvas"); c.width = 24; c.height = Math.max(1, Math.round(24 * im.naturalHeight / im.naturalWidth));
      const x = c.getContext("2d", {willReadFrequently:true}); x.drawImage(im, 0, 0, c.width, c.height);
      const [g1, g2, g3] = tintFrom(x.getImageData(0, 0, c.width, c.height).data), st = document.documentElement.style;
      st.setProperty("--g1", g1); st.setProperty("--g2", g2); st.setProperty("--g3", g3);
    } catch (e) {}
  };
  im.src = p.q ? `data:image/jpeg;base64,${p.q}` : src(p, "s");
}
function heroCycle(first){
  clearTimeout(HCT);
  const pool = PH.filter(p => !p.broken && !p.raw && !isVid(p));
  if (pool.length < 2 || !anim()) return;
  let last = first;
  const next = () => {
    HCT = setTimeout(next, 7000);
    const cv = $(".hero .cv");
    if (!cv || document.hidden || LB || SS || SY || scrollY > $(".hero").offsetHeight) return;
    let p; do p = pool[Math.floor(Math.random() * pool.length)]; while (p === last);
    last = p;
    const im = new Image(); im.className = "hi cy"; im.alt = ""; im.src = src(p, "l");   // 新的一張慢慢淡入、一邊往前推近
    const show = () => { if (!im.isConnected) return;
      setTimeout(() => cv.querySelectorAll(".hi").forEach(x => { if (x !== im) x.remove(); }), 3200); };
    im.decode ? im.decode().then(() => { cv.appendChild(im); show(); tint(p); }).catch(() => {}) : (im.onload = () => { cv.appendChild(im); show(); tint(p); });
  };
  HCT = setTimeout(next, 7000);
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
  el.className = "ph"; el.dataset.i = i; el.setAttribute("aria-label", p.n.split("/").pop());
  TM.set(p.i, el);
  el.innerHTML = `${p.q ? `<img class="lq" alt="" src="data:image/jpeg;base64,${p.q}">` : ""}<img class="hi" alt="" loading="lazy" decoding="async" draggable="false" src="${src(p, "s")}"><span class="bdg"></span><span class="ck">${I("ck")}</span>`;
  setTimeout(() => badge(i));
  const hi = el.querySelector(".hi");
  hi.addEventListener("load", () => { hi.decoding = "sync";   /* 換大小時照片會被拿下來再放回去：載好的改同步解碼，放回去那一格不會空白 */ hi.classList.add("ok"); setTimeout(() => { const q = el.querySelector(".lq"); if (q) q.remove(); }, T.mid + 100); }, {once:true});
  hi.addEventListener("error", () => { p.broken = 1; hi.remove(); el.insertAdjacentHTML("beforeend", `<span class="nope">${I("off")}</span>`); }, {once:true});
  if (IO) IO.observe(el); else el.classList.add("in");
  return el;
}
function badge(i){                                          // 格子上的小標：影片長度、原況、愛心
  const t = TILES[i], p = PH[i]; if (!t) return;
  const b = t.querySelector(".bdg");
  b.innerHTML = `${isVid(p) ? `<span class="vt num">${I("play")}${dur(p.vd)}</span>` : p.gf ? `<span class="vt">GIF</span>` : p.lv ? `<span class="lvt">${I("live")}</span>` : ""}${p.lk ? `<span class="lkt num">${I("heart")}${p.lk}</span>` : ""}`;
}
let LW = 0;
function layout(force){
  const wall = $(".wall"); if (!wall) return;
  const cs = getComputedStyle(document.documentElement), rh = (parseFloat(cs.getPropertyValue("--rh")) || 200) * ZMUL[ZL], gap = ZL >= 2 ? 2 : parseFloat(cs.getPropertyValue("--gap")) || 4;
  const W = wall.querySelector(".rows").clientWidth;
  if (!force && Math.abs(W - LW) < 1) return;
  LW = W;
  GROUPS.forEach((g, gi) => {
    const box = wall.querySelector(`[data-g="${gi}"] .rows`), rows = [];
    let cur = [], sum = 0;
    if (ZL >= 2) {                                           // 小方格：一排固定幾張
      const n = Math.max(ZL === 3 ? 6 : 4, Math.round((W + gap) / (rh + gap))), sz = (W - gap * (n - 1)) / n;
      for (let k = 0; k < g.list.length; k += n) rows.push([g.list.slice(k, k + n).map(i => [i, 1]), sz]);
      const frag = document.createDocumentFragment();
      rows.forEach(([list, h]) => { const r = document.createElement("div"); r.className = "row sq"; r.style.height = h.toFixed(2) + "px";
        list.forEach(([i]) => { const t = TILES[i]; t.style.width = t.style.height = h.toFixed(2) + "px"; r.appendChild(t); }); frag.appendChild(r); });
      box.replaceChildren(frag);
      return;
    }
    const big = ZL === 1 && g.list.length >= 5 && PH[g.list[0]].w / PH[g.list[0]].h >= 1.3 && W >= 320 ? g.list[0] : -1;   // 一天的第一張橫的放整排
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
const CSSPAR = window.CSS && CSS.supports && CSS.supports("animation-timeline:scroll()");
function onScroll(){
  if (SCQ) return;
  SCQ = requestAnimationFrame(() => {
    SCQ = 0;
    const hero = $(".hero"); if (!hero) return;
    const y = scrollY, H = hero.offsetHeight;
    if (y < H && anim() && !CSSPAR) {
      $(".hero .cv").style.transform = `translate3d(0,${(y * .38).toFixed(1)}px,0)`;
      const c = $(".hcap"); c.style.opacity = Math.max(0, 1 - y / (H * .55)).toFixed(3); c.style.transform = `translate3d(0,${(y * .18).toFixed(1)}px,0)`;
    }
    $(".bar").classList.toggle("on", y > H - 90);
  });
}
addEventListener("scroll", onScroll, {passive:true});
(() => {                                                     // 兩指捏照片牆
  let p0 = null;
  const mid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2], dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  document.addEventListener("touchstart", e => { if (e.touches.length === 2 && !LB && !SS && !SY && e.target.closest(".wall")) { p0 = {d:dist(e.touches), m:mid(e.touches), k:1}; } }, {passive:true});
  const live = k => {                                        // 捏的時候照片牆跟著手指縮放（越過門檻就有阻力）
    const w = $(".wall"), d = k >= 1 ? 1 + (k - 1) * (ZL > 0 ? .9 : .25) : 1 - (1 - k) * (ZL < 3 ? .9 : .25);
    w.style.transformOrigin = `${p0.m[0]}px ${p0.m[1] + scrollY - w.offsetTop}px`;
    w.style.transform = `scale(${Math.max(.6, Math.min(1.6, d)).toFixed(4)})`;
  };
  document.addEventListener("touchmove", e => {
    if (!p0 || e.touches.length !== 2) return;
    e.preventDefault();
    p0.k = dist(e.touches) / p0.d; p0.m = mid(e.touches);
    const go = p0.k > 1.22 && ZL > 0 ? -1 : p0.k < .82 && ZL < 3 ? 1 : 0;
    if (go) { zoomWall(ZL + go, p0.m[0], p0.m[1], wallRects()); p0.d = dist(e.touches); p0.k = 1; return; }   // 捏到就換，手指不用放開，可以一路捏下去
    live(p0.k);
  }, {passive:false});
  const end = () => {
    if (!p0) return; p0 = null;
    const w = $(".wall"), was = w.style.transform;
    if (!was) return;
    w.style.transform = "";
    if (anim()) w.animate([{transform:was}, {transform:"scale(1)"}], {duration:T.mid, easing:DEC});
  };
  document.addEventListener("touchend", end); document.addEventListener("touchcancel", end);
  /* iPhone 的 Safari 會跟著整頁放大（照片牆、看大圖都是自己縮放），一律擋掉，只讓照片動 */
  ["gesturestart", "gesturechange", "gestureend"].forEach(t => document.addEventListener(t, e => e.preventDefault(), {passive:false}));
  document.addEventListener("touchmove", e => { if (e.touches.length > 1) e.preventDefault(); }, {passive:false});
  let wt = 0;
  addEventListener("wheel", e => {                           // 觸控板捏、Ctrl＋滾輪
    if (!e.ctrlKey || LB || SS || SY || !$(".wall")) return;
    e.preventDefault();
    if (performance.now() - wt < 450 || Math.abs(e.deltaY) < 2) return;
    wt = performance.now(); zoomWall(ZL + (e.deltaY > 0 ? 1 : -1), e.clientX, e.clientY);
  }, {passive:false});
  addEventListener("keydown", e => { if (LB || SS || SY || e.target.closest("input")) return;
    if (e.key === "+" || e.key === "=") zoomWall(ZL - 1, innerWidth / 2, innerHeight / 2); else if (e.key === "-") zoomWall(ZL + 1, innerWidth / 2, innerHeight / 2); });
})();
addEventListener("contextmenu", e => { if (e.target.closest(".ph,.zw,.mk,.hero")) e.preventDefault(); });   // 不能按右鍵、長按另存
addEventListener("dragstart", e => { if (e.target.tagName === "IMG") e.preventDefault(); });
{                                                            // 點照片自己判斷：往下滑關掉大圖後，手機有時不送 click，要等一下才點得開
  let pt = null;                                             // 按住不放：進入選取（可以下載的相簿）
  document.addEventListener("pointerdown", e => { const t = e.isPrimary && e.button === 0 && e.target.closest(".ph"); clearTimeout(pt && pt.lp);
    pt = t ? {t, x:e.clientX, y:e.clientY, at:performance.now()} : null;
    if (pt && D.dl && !SEL.on) { const q = pt; q.lp = setTimeout(() => { if (pt === q) { q.done = 1; selOn(+q.t.dataset.i); } }, 450); } }, true);
  document.addEventListener("pointermove", e => { if (pt && Math.hypot(e.clientX - pt.x, e.clientY - pt.y) >= 10) clearTimeout(pt.lp); }, true);
  document.addEventListener("pointerup", e => { const q = pt; pt = null; if (!q) return; clearTimeout(q.lp);
    if (q.done || e.target.closest(".ph") !== q.t || Math.hypot(e.clientX - q.x, e.clientY - q.y) >= 10) return;
    if (SEL.on) return selFlip(+q.t.dataset.i);
    if (performance.now() - q.at < 500) openLb(+q.t.dataset.i); }, true);
  document.addEventListener("pointercancel", () => { if (pt) clearTimeout(pt.lp); pt = null; }, true);
}
document.addEventListener("click", e => {
  const t = e.target.closest(".ph");
  if (t && SEL.on) { if (!e.detail) selFlip(+t.dataset.i); return; }   // 鍵盤按的才在這裡切換（手指、滑鼠在 pointerup）
  if (t) return openLb(+t.dataset.i);
  if (e.target.closest("[data-up]")) return SEL.on || upPick();
  { const wb = e.target.closest("[data-who]"); if (wb) return whoSet(wb.dataset.who); }
  if (e.target.closest("[data-sel]")) return selOn();
  if (SEL.on && e.target.closest("[data-ss],[data-mem]")) return;
  if (e.target.closest(".cue")) return scrollTo({top:$(".hero").offsetHeight - 8, behavior:anim() ? "smooth" : "auto"});
  { const zb = e.target.closest("[data-zb]"); if (zb) return zoomWall(ZL + +zb.dataset.zb, innerWidth / 2, innerHeight / 2); }
  if (e.target.closest("[data-ss]")) return show(0);
  const mm = e.target.closest("[data-mem]");
  if (mm) return story(+mm.dataset.mem, mm.querySelector(".mring"));
  const m = e.target.closest(".mk");
  if (m) return openLb(+m.dataset.i);
});

/* 全部照片的拍攝地點：一張地圖、照片圓圈，太近的合成一顆＋數字 */
function bigMap(){
  const el = $("[data-map]"); if (!el || WHO) return;
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
  if (LB) { if (LB.closing && LB.kill) LB.kill(); else return; }   // 上一張還在收：直接收完，這次點的照樣打開
  const el = document.createElement("div");
  el.className = "lb";
  el.innerHTML = `<div class="bg"></div><div class="stage"><div class="track"></div></div>
    <div class="lbt"><button class="rb" data-x aria-label="關閉">${I("x")}</button><span class="cnt num"></span><button class="rb lvb" data-lv aria-label="原況">${I("live")}</button><button class="rb" data-ssi aria-label="從這張開始播放">${I("play")}</button><button class="rb" data-inf aria-label="照片資訊">${I("info")}</button><button class="rb" data-del hidden aria-label="刪掉">${I("trash")}</button>${D.dl ? `<a class="rb" data-dl download aria-label="${D.dl > 1 ? "下載原圖" : "下載"}">${I("dl")}</a>` : ""}</div>
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
      + (isVid(p) ? `<video class="vv" playsinline preload="none" disablepictureinpicture></video><span class="vbig">${p.vr === 1 ? I("play") : `<i class="spin"></i>`}</span>` : p.gf === 2 ? `<img class="awp" alt="" draggable="false" src="${src(p, "a")}">` : p.lv ? `<video class="lvv" muted playsinline preload="none"${p.gf ? " loop" : ""}></video>` : "");
    const aw = zw.querySelector(".awp"); if (aw) aw.complete && aw.naturalWidth ? aw.classList.add("ok") : aw.addEventListener("load", () => aw.classList.add("ok"), {once:true});
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
  function live(){                                           // 原況照片：動一下（按住照片、或按上面的原況鈕）
    const p = PH[S.i], v = cur().querySelector(".lvv"); if (!p.lv || !v) return;
    if (!v.src) { v.src = src(p, "m"); v.addEventListener("ended", () => v.closest(".zw").classList.remove("moving")); }
    v.currentTime = 0; v.closest(".zw").classList.add("moving"); v.play().catch(() => v.closest(".zw").classList.remove("moving"));
  }
  function liveOff(){ const v = cur().querySelector(".lvv"); if (v) { v.pause(); v.closest(".zw").classList.remove("moving"); } }
  function heartAt(x, y){                                    // 點兩下：中間跳出大愛心、按讚
    const p = PH[S.i], h = document.createElement("i");
    h.className = "bigh"; h.innerHTML = I("heart");
    h.style.left = x + "px"; h.style.top = y + "px";
    el.appendChild(h); setTimeout(() => h.remove(), T.slow * 2);
    if (!p.me) like(S.i, $("[data-lk]", el), social);
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
    if (moved && p.gf && p.lv) setTimeout(() => { if (LB === S && S.at === S.i && !S.closing) live(); }, anim() ? T.mid : 0);   // 會動的 GIF：自己一直動
    $("[data-lv]", el).classList.toggle("show", !!p.lv && !p.gf);
    social(); vSync();
    $(".cnt", el).textContent = `${S.i + 1} / ${PH.length}`;
    const cam = camName(p.x);
    $(".cap b", el).textContent = p.p ? p.p.n : d ? fdate(d) : p.n;
    $(".cap span", el).textContent = [p.p && d ? `${d.mo}月${d.d}日 ${ftime(d)}` : d ? ftime(d) : "", p.ub ? `${p.ub} 放的` : "", cam].filter(Boolean).join("・");
    const del = $("[data-del]", el); del.hidden = !p.um; if (moved) del.classList.remove("arm");
    const dl = $("[data-dl]", el); if (dl) dl.href = src(p, "o");
    $(".nav.l", el).disabled = S.i === 0; $(".nav.r", el).disabled = S.i === PH.length - 1;
    if (S.info && (moved || !inf.firstChild)) { inf.innerHTML = infoHTML(p); infoMap(); }   // 同一張不重畫：安卓跳出鍵盤會改畫面大小，重畫會把正在打字的留言框收掉
    TILES.forEach((t, k) => t.classList.toggle("gone", k === S.i));
  }
  setAll();
  S.chrome = chrome; S.vToggle = vToggle;
  function toTile(r, f){                                     // 格子的位置：等比例放大到蓋滿格子、多的裁掉（不壓扁）
    const sr = stage.getBoundingClientRect(), k = Math.max(r.width / f.w, r.height / f.h);
    const x = r.left - sr.left + r.width / 2 - f.w * k / 2 - f.l, y = r.top - sr.top + r.height / 2 - f.h * k / 2 - f.t;
    const ix = Math.max(0, (f.w - r.width / k) / 2), iy = Math.max(0, (f.h - r.height / k) / 2), rd = 6 / k;
    return {t:`translate(${x}px,${y}px) scale(${k})`, c:`inset(${iy}px ${ix}px ${iy}px ${ix}px round ${rd}px)`};
  }
  const NOCLIP = "inset(0px 0px 0px 0px round 0px)";

  /* 從格子裡的那張長大 */
  const t0 = TILES[i], r0 = t0.getBoundingClientRect(), f0 = fit(PH[i]);
  if (anim()) {
    const a0 = toTile(r0, f0);
    cur().animate([{transform:a0.t, clipPath:a0.c}, {transform:"translate(0px,0px) scale(1)", clipPath:NOCLIP}], {duration:T.mid + 60, easing:DEC});
    bg.animate([{opacity:0}, {opacity:1}], {duration:T.mid, easing:EASE, fill:"forwards"});
    el.querySelectorAll(".lbt,.lbb,.nav").forEach(x => x.animate([{opacity:0}, {opacity:1}], {duration:T.mid, delay:T.fast, easing:EASE, fill:"backwards"}));
  } else bg.style.opacity = 1;
  bg.style.opacity = 1;
  if (POPSKIP) S.push = 1; else history.pushState({lb:1}, "");   // 上一張的返回還沒處理完：等它處理完再記

  function go(d){
    const n = S.i + d;
    stopAll();
    if (n < 0 || n >= PH.length) return snap();
    finish();
    clearTimeout(S.infT); sl.forEach(s => { s.style.visibility = ""; });
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
    let gone = false;
    const end = () => { if (gone) return; gone = true; el.remove(); TILES.forEach(x => x.classList.remove("gone")); document.documentElement.style.overflow = ""; if (LB === S) LB = null; onScroll(); };
    S.kill = end; el.style.pointerEvents = "none";
    if (!anim()) return end();
    setTimeout(end, T.mid + 200);                              // 安卓返回手勢時動畫有時不會結束：時間到一定收掉
    el.querySelectorAll(".lbt,.lbb,.nav,.inf").forEach(x => { x.style.opacity = 0; });
    S.info = false; el.classList.remove("info");
    const a1 = toTile(r, f);
    zw.animate([{transform:now === "none" ? "translate(0px,0px) scale(1)" : now, clipPath:NOCLIP}, {transform:a1.t, clipPath:a1.c}],
      {duration:T.mid, easing:EASE, fill:"forwards"}).onfinish = end;
    bg.animate([{opacity:getComputedStyle(bg).opacity}, {opacity:0}], {duration:T.mid, easing:EASE, fill:"forwards"});
  }
  S.close = close;
  function setInfo(on){
    S.info = on; el.classList.toggle("info", on);
    $("[data-inf]", el).classList.toggle("on", on);
    if (on) { inf.innerHTML = infoHTML(PH[S.i]); inf.scrollTop = 0; setTimeout(infoMap, 30); }
    [sl[0], sl[2]].forEach(s => { s.style.visibility = "hidden"; });   // 電腦上畫面變窄時，旁邊那張會被排到看得到的地方：換位置的這段先藏起來
    clearTimeout(S.infT); S.infT = setTimeout(() => sl.forEach(s => { s.style.visibility = ""; }), T.mid + 60);
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
    clearTimeout(S.lvT);
    if (ptr.size === 1) { finish(); g = {type:null, x0:e.clientX, y0:e.clientY, t0:performance.now(), lx:e.clientX, ly:e.clientY, lt:performance.now(), vx:0, vy:0, z0:{...S.z}};
      if (PH[S.i].lv && !PH[S.i].gf && S.z.s < 1.02) { const gg = g; S.lvT = setTimeout(() => { if (g === gg && !g.type) { g.type = "live"; live(); } }, 260); } }
    else if (ptr.size === 2) { if (g && g.type === "live") liveOff(); const [a, b] = [...ptr.values()]; g = {type:"pinch", d0:Math.hypot(a.x - b.x, a.y - b.y), m0:{x:(a.x + b.x) / 2, y:(a.y + b.y) / 2}, z0:{...S.z}}; }
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
    if (g.type === "live") return;
    if (!g.type) {
      if (Math.hypot(dx, dy) > 8) clearTimeout(S.lvT);
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
    clearTimeout(S.lvT);
    if (g.type === "live") { g = null; return liveOff(); }
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0, dt = performance.now() - g.t0, type = g.type, vx = g.vx, vy = g.vy;
    g = null;
    if (type === "swipe") {
      if ((dx < -W() * .2 || vx < -.45) && S.i < PH.length - 1) return go(1);
      if ((dx > W() * .2 || vx > .45) && S.i > 0) return go(-1);
      return snap();
    }
    if (type === "down" && !S.info) {
      if (dy > H() * .16 || vy > .6) return lbBack(S);
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
      if (now - lastTap < 300) { clearTimeout(tapT); lastTap = 0; return S.z.s > 1.02 || !D.talk || PH[S.i].broken ? dbl(e.clientX, e.clientY) : heartAt(e.clientX, e.clientY); }
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
    if (e.target.closest("[data-x]")) return lbBack(S);
    { const b = e.target.closest("[data-del]");                // 自己放的才能刪：按兩下才刪
      if (b) { clearTimeout(S.dT); if (!b.classList.contains("arm")) { b.classList.add("arm"); toast("再按一次刪掉"); S.dT = setTimeout(() => b.classList.remove("arm"), 3000); return; }
        b.classList.remove("arm"); return upDel(S.i); } }
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
  {                                                          // 資訊往下拉就關（捲到最上面時才算）
    let d0 = null;
    inf.addEventListener("touchstart", e => { if (e.touches.length === 1 && e.target !== document.activeElement) d0 = {y:e.touches[0].clientY, t:performance.now(), top:inf.scrollTop <= 0, dy:0, on:false}; }, {passive:true});
    inf.addEventListener("touchmove", e => {
      if (!d0 || matchMedia("(min-width:900px)").matches) return;
      const dy = e.touches[0].clientY - d0.y;
      if (!d0.on) { if (d0.top && inf.scrollTop <= 0 && dy > 6) { d0.on = true; d0.y0 = e.touches[0].clientY; inf.style.transition = "none"; } else return; }
      e.preventDefault();
      d0.dy = Math.max(0, e.touches[0].clientY - d0.y0);
      inf.style.transform = `translateY(${d0.dy}px)`;
    }, {passive:false});
    const done = () => {
      if (!d0) return; const q = d0; d0 = null; if (!q.on) return;
      inf.style.transition = ""; inf.style.transform = "";
      const v = q.dy / Math.max(1, performance.now() - q.t);
      if (q.dy > inf.clientHeight * .22 || v > .6) setInfo(false);
      else if (anim()) inf.animate([{transform:`translateY(${q.dy}px)`}, {transform:"none"}], {duration:T.mid, easing:DEC});
    };
    inf.addEventListener("touchend", done); inf.addEventListener("touchcancel", done);
  }
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
    else if (e.key === "Escape") S.info ? setInfo(false) : lbBack(S);
    else if (e.key === "i") setInfo(!S.info);
  };
}
addEventListener("keydown", e => { if (SH) return e.key === "Escape" && popBack();
  if (SY) SY.key(e); else if (SS) SS.key(e); else if (LB) LB.key(e); else if (SEL.on && e.key === "Escape") popBack(); });
/* 自己關大圖（×、往下滑、Esc）時馬上開始收，不等瀏覽器的返回（iPhone 上要等一下，這段時間點別張會沒反應） */
let POPSKIP = 0;
function lbBack(o){ if (o.closing) return; o.close(); POPSKIP++; history.back(); }
addEventListener("popstate", () => {
  if (POPSKIP) { POPSKIP--; if (LB && LB.push) { LB.push = 0; history.pushState({lb:1}, ""); } return; }
  if (SH) SH.close(); else if (SY) SY.close(); else if (SS) SS.close(); else if (LB) LB.close(); else if (SEL.on) selOff(); });

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
/* ═════════ 選幾張一起下載 ═════════ */
const SEL = {on:false, s:new Set()};
const ALBMAX = 500;
function popBack(){ POPSKIP++; if (SH) SH.close(); else if (SEL.on) selOff(); history.back(); }
function selOn(i){
  if (SEL.on || !D.dl || LB || SS || SY) return;
  SEL.on = true; SEL.s.clear();
  document.documentElement.classList.add("selm");
  if (i != null) { selFlip(i); if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} }
  selBar(); history.pushState({sel:1}, "");
}
function selOff(){
  if (!SEL.on) return;
  SEL.on = false; SEL.s.clear();
  document.documentElement.classList.remove("selm");
  TILES.forEach(t => t.classList.remove("on"));
  selBar();
}
function selFlip(i){
  if (SEL.s.has(i)) SEL.s.delete(i);
  else { if (SEL.s.size >= ALBMAX) return toast(`一次最多選 ${ALBMAX} 個`); SEL.s.add(i); }
  TILES[i].classList.toggle("on", SEL.s.has(i));
  selBar();
}
function selBar(){
  let b = $(".selb");
  if (!b) {
    if (!SEL.on) return;
    b = document.createElement("div"); b.className = "selb";
    b.innerHTML = `<button class="sx" data-selx aria-label="不選了">${I("x")}</button><b class="num"></b><button class="chip" data-selall></button><button class="chip go" data-seldl>${I("dl")}<span>下載</span></button>`;
    document.body.appendChild(b);
    b.addEventListener("click", e => {
      if (e.target.closest("[data-selx]")) return popBack();
      if (e.target.closest("[data-selall]")) {
        const all = SEL.s.size === Math.min(ALBMAX, PH.length);
        SEL.s.clear(); if (!all) PH.slice(0, ALBMAX).forEach((_, k) => SEL.s.add(k));
        TILES.forEach((t, k) => t.classList.toggle("on", SEL.s.has(k)));
        return selBar();
      }
      if (e.target.closest("[data-seldl]") && SEL.s.size) {
        const a = document.createElement("a");
        a.href = `${BASE}/zip?ids=${[...SEL.s].sort((x, y) => x - y).map(k => PH[k].i).join(",")}`; a.download = "";
        document.body.appendChild(a); a.click(); a.remove();
        toast(`開始下載 ${SEL.s.size} 個`); popBack();
      }
    });
    void b.offsetWidth;
  }
  const n = SEL.s.size;
  b.classList.toggle("on", SEL.on);
  b.querySelector("b").textContent = n ? `已選 ${n} 個` : "點照片來選";
  b.querySelector("[data-selall]").textContent = n && n === Math.min(ALBMAX, PH.length) ? "全不選" : "全選";
  b.querySelector("[data-seldl]").disabled = !n;
}

/* ═════════ 朋友一起放照片 ═════════ */
let SH = null, UPING = 0;
function nameSheet(then){                                    // 第一次放照片先問名字（照片上會寫是誰放的）
  const bg = document.createElement("div");
  bg.className = "shbg";
  bg.innerHTML = `<form class="sh"><div class="ic">${I("up")}</div><h3>你的名字</h3><p>照片上會寫是你放的</p><input class="field" name="n" maxlength="20" autocomplete="nickname" aria-label="你的名字" required><button class="btn">好</button></form>`;
  document.body.appendChild(bg);
  const f = bg.querySelector("form"), inp = f.querySelector("input");
  inp.value = store.get("vsa-name");
  void bg.offsetWidth; bg.classList.add("on");
  setTimeout(() => inp.focus(), T.fast);
  SH = {close(){ if (SH && SH.bg === bg) SH = null; bg.classList.remove("on"); bg.style.pointerEvents = "none"; setTimeout(() => bg.remove(), T.mid + 50); }, bg};
  history.pushState({sh:1}, "");
  bg.addEventListener("click", e => { if (e.target === bg) popBack(); });
  f.addEventListener("submit", e => {
    e.preventDefault();
    const v = inp.value.trim(); if (!v) return inp.focus();
    store.set("vsa-name", v); popBack(); then();
  });
}
function upPick(){
  if (UPING) return toast("還在放上一批");
  if (!store.get("vsa-name").trim()) return nameSheet(upPick);
  const f = document.createElement("input");
  f.type = "file"; f.multiple = true; f.accept = "image/*,video/*"; f.hidden = true;
  f.addEventListener("change", () => { const fs = [...f.files]; f.remove(); if (fs.length) upGo(fs); }, {once:true});
  document.body.appendChild(f); f.click();
}
const upLim = f => /^video\//.test(f.type) || /\.(mov|mp4|m4v|3gp|webm|mkv)$/i.test(f.name) ? 500 << 20 : 50 << 20;   // 影片 500 MB、照片 50 MB
function upBox(){
  let b = $(".upb");
  if (!b) { b = document.createElement("div"); b.className = "upb"; b.innerHTML = `<div class="ut"><b></b><span class="num"></span></div><div class="ubar"><i></i></div>`; document.body.appendChild(b); void b.offsetWidth; }
  b.classList.add("on");
  return b;
}
function upShow(b, k, n, pr){
  b.querySelector("b").textContent = n > 1 ? `放上去 ${k + 1}／${n}` : "放上去";
  b.querySelector("span").textContent = `${Math.round(pr * 100)}%`;
  b.querySelector("i").style.transform = `scaleX(${((k + pr) / n).toFixed(4)})`;
}
function upOne(f, prog){
  return new Promise(res => {
    const x = new XMLHttpRequest();
    x.open("POST", `${BASE}/up?n=${encodeURIComponent(f.name)}&w=${encodeURIComponent(store.get("vsa-name").trim())}`);
    x.withCredentials = true;
    x.upload.onprogress = e => { if (e.lengthComputable) prog(e.loaded / e.total); };
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch (e) {}
      res({ok:x.status === 200 && !!d.ok, message:d.message, stop:[403, 404, 409, 429, 507].includes(x.status)}); };
    x.onerror = () => res({ok:false, message:"連不上，等一下再試", stop:true});
    x.send(f);
  });
}
async function upGo(files){
  const big = files.filter(f => f.size > upLim(f));
  files = files.filter(f => f.size <= upLim(f));
  if (!files.length) return toast(big.length ? "檔案太大（照片最多 50 MB、影片 500 MB）" : "沒有選到照片");
  UPING = 1;
  const b = upBox();
  let ok = 0, err = "";
  for (let k = 0; k < files.length; k++) {
    upShow(b, k, files.length, 0);
    const r = await upOne(files[k], pr => upShow(b, k, files.length, pr));
    if (r.ok) ok++; else { err = r.message || "沒有放上去"; if (r.stop) break; }
  }
  upShow(b, files.length - 1, files.length, 1);
  setTimeout(() => b.classList.remove("on"), T.mid);
  UPING = 0;
  const miss = files.length + big.length - ok;
  toast(!ok ? err : miss ? `放好 ${ok} 個，${miss} 個沒放上去` : D.up === 1 ? "放好了，主人確認後就會出現" : "放好了");
  if (ok && D.up !== 1) reload();
}
addEventListener("beforeunload", e => { if (UPING) { e.preventDefault(); e.returnValue = ""; } });
async function upDel(i){
  try {
    const r = await fetch(BASE + "/up", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({del:PH[i].i})});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast(d.message || "沒有刪掉，等一下再試");
  } catch (e) { return toast("連不上，等一下再試"); }
  toast("刪掉了");
  if (LB) lbBack(LB);
  setTimeout(reload, T.mid + 260);
}
/* 照片有增減：重拿清單，原本的格子留著、新的長出來、沒了的淡掉，其他的滑到新位置 */
async function reload(){
  let d;
  try { const r = await fetch(BASE + "/m", {credentials:"same-origin", cache:"no-store"}); if (!r.ok) return; d = await r.json(); } catch (e) { return; }
  if (LB || SS || SY) return setTimeout(reload, 1500);
  if (SEL.on) popBack();
  const old = new Map(PH.map((p, k) => [p.i, TILES[k]]));
  const mineB = new Set(ALL.filter(p => p.um).map(p => p.i));
  D = d; ALL = d.photos || [];
  const fresh = ALL.find(p => p.um && !mineB.has(p.i));      // 剛放上去的：跳到自己的分頁
  if (fresh && (fresh.u || "") !== WHO && $(".wall")) { ALL.forEach(p => { const t = TM.get(p.i); if (t) t.dataset.i = -1; }); return whoSet(fresh.u, 1); }
  if (!ALL.some(p => (p.u || "") === WHO) && ALL.length) WHO = ALL.some(p => !p.u) ? "" : ALL[0].u;
  PH = pickW();
  if (!PH.length || !$(".wall")) return PH.length ? draw() : boot();
  whoBar();
  const was = new Map(), H = innerHeight;
  TILES.forEach(t => { const r = t.getBoundingClientRect(); if (r.bottom > -60 && r.top < H + 60) was.set(t, r); });
  TILES = PH.map((p, i) => { const t = old.get(p.i); if (t) { old.delete(p.i); t.dataset.i = i; return t; } return TM.get(p.i) || tile(p, i); });
  const gone = [...old.values()].filter(t => was.has(t));
  if (gone.length && anim()) await Promise.all(gone.map(t => t.animate([{opacity:1, transform:"none"}, {opacity:0, transform:"scale(.9)"}], {duration:T.mid, easing:EXIT, fill:"forwards"}).finished.catch(() => {})));
  sections(); layout(true); mems(); bigMap();
  TILES.forEach((t, i) => { badge(i); const a = was.get(t); if (!a || !anim()) return;
    const r = t.getBoundingClientRect(); if (r.bottom < 0 || r.top > H) return;
    const dx = a.left - r.left, dy = a.top - r.top, sx = a.width / r.width, sy = a.height / r.height;
    if (Math.abs(dx) + Math.abs(dy) < 1 && Math.abs(sx - 1) + Math.abs(sy - 1) < .01) return;
    t.animate([{transformOrigin:"0 0", transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`}, {transformOrigin:"0 0", transform:"none"}], {duration:ZDUR, easing:DEC});
  });
  document.querySelectorAll(".hmeta .chip .num, .bar small").forEach(x => { x.textContent = cntTxt(); });
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

/* ═════════ 回憶：像限時動態，一張幾秒自己往下，點右邊下一張、左邊上一張、按住暫停、往下滑關掉 ═════════ */
const SYD = 4500;
let SY = null;
/* 限時動態的裁切框：有 r 是那個圓圈，沒有是整個畫面（兩頭同一種寫法才能連續變） */
function syClip(r){
  if (!r) return "inset(0px 0px 0px 0px round 0px)";
  const R = r.width / 2;
  return `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round ${R}px)`;
}
function story(n, from){
  if (SY || !MEMS[n]) return;
  const el = document.createElement("div");
  el.className = "sy";
  el.innerHTML = `<div class="syv"></div><div class="syt"><div class="syp"></div><div class="syh"><span class="mring"><img alt=""></span><div><b></b><small class="num"></small></div>
    <button class="rb" data-yx aria-label="關閉">${I("x")}</button></div></div>${D.talk ? `<div class="syb"><button class="sb" data-ylk aria-label="愛心">${I("heart")}<span class="num"></span></button></div>` : ""}`;
  document.body.appendChild(el);
  document.documentElement.style.overflow = "hidden";
  const view = $(".syv", el), bars = $(".syp", el);
  let g = n, at = 0, timer = 0, left = SYD, t0 = 0, held = false, ms = SYD;
  const S = {el}; SY = S;
  function head(){
    const m = MEMS[g];
    bars.innerHTML = m.list.map(() => `<i><b></b></i>`).join("");
    $(".syh img", el).src = src(PH[m.cv], "s");
    $(".syh b", el).textContent = m.t; $(".syh small", el).textContent = m.s || "";
    SEEN.add(m.k); store.set("vsa-seen-" + CODE, [...SEEN].join(","));
    const b = $(`.mem[data-mem="${g}"]`); if (b) b.classList.add("seen");
  }
  function heart(){
    const b = $("[data-ylk]", el); if (!b) return;
    const p = PH[MEMS[g].list[at]]; b.classList.toggle("on", !!p.me); b.querySelector("span").textContent = p.lk || "";
  }
  function bar(k, still){
    bars.querySelectorAll("b").forEach((x, j) => { x.style.transition = "none"; x.style.transform = `scaleX(${j < k ? 1 : 0})`; });
    const cur = bars.children[k] && bars.children[k].firstChild; if (!cur || still) return;
    void cur.offsetWidth; cur.style.transition = `transform ${left}ms linear`; cur.style.transform = "scaleX(1)";
  }
  let seq = 0, ready = false, waitT = 0, pend = null;
  function show(k, dir){
    clearTimeout(timer); clearTimeout(waitT);
    const m = MEMS[g];
    if (k >= m.list.length) return MEMS[g + 1] ? jump(g + 1, 1) : history.back();
    if (k < 0) return MEMS[g - 1] ? jump(g - 1, -1, true) : show(0);
    at = k; ready = false;
    const my = ++seq, i = m.list[at], p = PH[i], old = view.querySelector(".syl:not(.out)");
    view.querySelectorAll(".syl:not(.out) video").forEach(v => v.pause());
    const L = document.createElement("div"), fill = Math.abs(Math.log((p.w / p.h) / (innerWidth / innerHeight))) < .35;
    L.className = "syl";
    L.innerHTML = `<img class="sbg" alt="" src="${p.q ? `data:image/jpeg;base64,${p.q}` : src(p, "s")}"><div class="syf${fill ? " cv" : ""}">${isVid(p) ? `<video playsinline preload="auto" src="${src(p, "v")}"></video>` : `<img alt="" draggable="false" src="${src(p, "l")}">`}</div>`;
    const v = L.querySelector("video"), img = L.querySelector(".syf img");
    if (pend && !pend.isConnected) { pend.pause(); pend.removeAttribute("src"); pend.load(); }   // 上一個還沒載好就被跳過的影片別在背後響
    pend = v;
    ms = v ? Math.min(15000, p.vd * 1000) : SYD; left = ms;
    bar(at, true); heart();
    waitT = setTimeout(() => { if (my === seq) el.classList.add("wait"); }, 250);   // 還沒載好：轉圈，先不倒數
    const go = () => {                                         // 載好了才換上、才開始倒數
      if (my !== seq || S.closing) return;
      clearTimeout(waitT); el.classList.remove("wait");
      view.appendChild(L); void L.offsetWidth; L.classList.add("in");
      if (old) { old.classList.add("out"); setTimeout(() => old.remove(), T.mid + 80); }   // 舊的留著墊底，新的蓋上去才拿掉，不會閃黑
      if (v && isFinite(v.duration) && v.duration > 0) ms = left = Math.min(15000, v.duration * 1000);
      if (anim() && !v) L.querySelector(".syf").animate([{transform:"scale(1)"}, {transform:"scale(1.06)"}], {duration:ms + T.slow, easing:"linear", fill:"forwards"});
      if (anim() && dir) L.animate([{transform:`translateX(${dir * 6}%)`}, {transform:"none"}], {duration:T.mid, easing:DEC});
      ready = true; t0 = performance.now();
      if (held) { if (v) v.pause(); return hold(true); }
      bar(at); timer = setTimeout(() => show(at + 1), ms);
    };
    if (v) {
      v.addEventListener("playing", go, {once:true});
      v.addEventListener("error", () => { if (my === seq) show(at + 1); }, {once:true});
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    } else if (img.complete && img.naturalWidth) requestAnimationFrame(go);
    else { img.addEventListener("load", go, {once:true}); img.addEventListener("error", go, {once:true}); }
    const nx = m.list[at + 1]; if (nx != null && !isVid(PH[nx])) { const im = new Image(); im.src = src(PH[nx], "l"); }
  }
  function jump(k, dir, last){                               // 換到下一天／上一天
    g = k; head();
    if (anim()) view.animate([{opacity:.4, transform:`translateX(${dir * 12}%) scale(.96)`}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC});
    show(last ? MEMS[g].list.length - 1 : 0);
  }
  function hold(on){
    held = on; el.classList.toggle("held", on);
    if (!ready) return;
    const v = view.querySelector(".syl:not(.out) video"), cur = bars.children[at] && bars.children[at].firstChild;
    view.querySelectorAll(".syl:not(.out) .syf").forEach(f => f.getAnimations().forEach(a => on ? a.pause() : a.play()));
    if (on) {
      clearTimeout(timer); left = Math.max(0, left - (performance.now() - t0));
      if (cur) { const k = getComputedStyle(cur).transform; cur.style.transition = "none"; cur.style.transform = k === "none" ? "scaleX(0)" : k; }
      if (v) v.pause();
    } else {
      t0 = performance.now();
      if (cur) { cur.style.transition = `transform ${left}ms linear`; cur.style.transform = "scaleX(1)"; }
      timer = setTimeout(() => show(at + 1), left);
      if (v) v.play().catch(() => {});
    }
  }
  function close(){
    if (S.closing) return; S.closing = 1;
    clearTimeout(timer); clearTimeout(waitT); seq++;
    view.querySelectorAll("video").forEach(v => v.pause()); if (pend) pend.pause();
    const fin = () => { el.remove(); if (!LB && !SS) document.documentElement.style.overflow = ""; SY = null; };
    if (!anim()) return fin();
    const b = $(`.mem[data-mem="${g}"] .mring`), r = b && b.getBoundingClientRect();
    const cur = getComputedStyle(el).transform, t0 = cur === "none" ? "none" : cur;
    // 收回圓圈用裁切不用縮放：安卓縮放整頁大小的圖層，放回原大時會有一格下半部是空的（看得到後面的頁面）
    if (r && r.bottom > 0 && r.top < innerHeight && t0 === "none") el.animate([{clipPath:syClip(), opacity:1}, {clipPath:syClip(r), opacity:0}], {duration:T.mid, easing:EASE, fill:"forwards"}).onfinish = fin;
    else el.animate([{transform:t0, opacity:1}, {transform:"translateY(30%) scale(.8)", opacity:0}], {duration:T.mid, easing:EASE, fill:"forwards"}).onfinish = fin;
  }
  S.close = close;
  S.key = e => {
    if (e.key === "Escape") history.back();
    else if (e.key === "ArrowRight") show(at + 1, 1);
    else if (e.key === "ArrowLeft") show(at - 1, -1);
    else if (e.key === " ") { e.preventDefault(); hold(!held); }
  };
  let p0 = null, ht = 0;
  el.addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;
    p0 = {x:e.clientX, y:e.clientY, t:performance.now(), h:false};
    ht = setTimeout(() => { if (p0) { p0.h = true; hold(true); } }, 220);
  });
  el.addEventListener("pointermove", e => {
    if (!p0) return;
    const dy = e.clientY - p0.y;
    if (dy > 10 && Math.abs(dy) > Math.abs(e.clientX - p0.x)) { p0.dn = true; el.style.transform = `translateY(${dy}px) scale(${1 - Math.min(.2, dy / innerHeight * .4)})`; el.style.borderRadius = "24px"; }
  });
  const up = e => {
    clearTimeout(ht);
    if (!p0) return;
    const q = p0; p0 = null;
    const dx = e.clientX - q.x, dy = e.clientY - q.y;
    if (q.h) hold(false);
    if (q.dn) {
      if (dy > innerHeight * .14) return history.back();
      const now = el.style.transform; el.style.transform = ""; el.style.borderRadius = "";
      if (anim()) el.animate([{transform:now}, {transform:"none"}], {duration:T.mid, easing:DEC});
      return;
    }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? (MEMS[g + 1] ? jump(g + 1, 1) : history.back()) : MEMS[g - 1] && jump(g - 1, -1);
    if (q.h || e.type === "pointercancel" || Math.hypot(dx, dy) > 10) return;
    show(e.clientX < innerWidth * .3 ? at - 1 : at + 1, e.clientX < innerWidth * .3 ? -1 : 1);
  };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("click", e => {
    if (e.target.closest("[data-yx]")) return history.back();
    const lk = e.target.closest("[data-ylk]");
    if (lk) like(MEMS[g].list[at], lk, heart);
  });
  el.addEventListener("contextmenu", e => e.preventDefault());
  history.pushState({sy:1}, "");
  if (anim()) {
    const r = from && from.getBoundingClientRect();
    if (r) el.animate([{clipPath:syClip(r), opacity:.6}, {clipPath:syClip(), opacity:1}], {duration:T.mid + 60, easing:DEC});   // 從圓圈撐開（裁切，不縮放圖層）
    else el.animate([{transform:"scale(.9)", opacity:0}, {transform:"none", opacity:1}], {duration:T.mid + 60, easing:DEC});
  }
  head(); show(0);
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
  kv.push(["檔名", p.n.split("/").pop()]);
  h += `<div class="ibox ikv">${kv.filter(r => r[1]).map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>`;
  if (D.dl) h += `<div class="idl"><a class="pr" href="${src(p, "o")}" download>${I("dl")}${D.dl > 1 ? (isVid(p) ? "下載影片" : "下載原圖") : "下載"}</a></div>`;
  return h;
}

boot();
