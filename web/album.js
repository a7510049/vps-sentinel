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
  x:'<path d="M18 6 6 18M6 6l12 12"/>', shr:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  star:'<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
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
  stk:'<rect x="7" y="7" width="13" height="13" rx="2.5"/><path d="M4 16V6.5A2.5 2.5 0 0 1 6.5 4H16"/>',
  smile:'<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  wsun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  wpart:'<path d="M8 4.5v1.2M3.8 9H5M4.9 5.9l.9.9M11.1 5.9l-.9.9"/><path d="M5.6 11.2a3.2 3.2 0 1 1 5.6-3"/><path d="M8 20h9.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 8 20Z"/>',
  wcld:'<path d="M7 19h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 19Z"/>',
  wfog:'<path d="M4 9h16M3 13h18M5 17h14"/>',
  wrain:'<path d="M7 15h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 15Z"/><path d="m9 18-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>',
  wsnow:'<path d="M7 14h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 14Z"/><path d="M9 18h.01M12 20h.01M15 18h.01M12 17h.01"/>',
  wstorm:'<path d="M7 14h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 14Z"/><path d="m12.5 15-2 3.5h3l-2 3.5"/>',
  cam:'<path d="M3.5 8.5a2 2 0 0 1 2-2h2.3l1.5-2.2h5.4l1.5 2.2h2.3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="3.6"/>',
  lens:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 3.5v4.5M19.4 16.3l-3.9-2.3M4.6 16.3l3.9-2.3"/>',
  send:'<path d="M4.5 12h13M12.5 6l6 6-6 6"/>', find:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>', scr:'<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>', pen:'<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>', again:'<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5M4 4v4.5h4.5"/>'
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
let CITY = "";                                               // 只看哪個城市（點城市卡片）
const cityKey = p => p.p && p.p.c ? `${p.p.cc || ""}|${p.p.c}` : "";
let GEAR = "";                                               // 只看哪台相機（c:名稱）或哪顆鏡頭（l:名稱）
const gearOf = (p, k) => k[0] === "c" ? camName(p.x) === k.slice(2) : lensName(p.x) === k.slice(2);
const pickW = () => { const t = SQ ? sqTerms(SQ) : null; return ALL.filter(p => (p.u || "") === WHO && (!CITY || cityKey(p) === CITY) && (!GEAR || gearOf(p, GEAR)) && (!t || sqHit(p, t))); };

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
const lensKind = f => (FOCB.find(b => f >= b[0] && f < b[1]) || FOCB[4])[2];   // 跟器材統計的焦段分法一樣
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
/* 連拍收成一疊：同一台相機、幾秒內連著拍的 3 張以上，照片牆只放第一張（右上角寫幾張），點了才攤開 */
let STK = new Map(), STKOF = new Map(), STKOPEN = new Set();
const dham = (a, b) => { let n = 0; for (let k = 0; k < 16; k += 8) { let x = (parseInt(a.slice(k, k + 8), 16) ^ parseInt(b.slice(k, k + 8), 16)) >>> 0; while (x) { x &= x - 1; n++; } } return n; };   // 兩張的指紋差幾格
const best = list => list.reduce((b, i) => (PH[i].qs ?? -1) > (PH[b].qs ?? -1) ? i : b, list[0]);   // 分數最高的那張（主機算的：清楚、曝光好）
function stackCalc(){
  STK = new Map(); STKOF = new Map();
  const sec = p => { const d = pd(p.x.dt); if (!d || p.x.dtf) return null; const m = /:(\d\d)$/.exec(p.x.dt.slice(0, 19)); return Date.UTC(d.y, d.mo - 1, d.d, d.h, d.mi, m ? +m[1] : 0) / 1000; };
  let run = [], like = 0;                                     // like：這一串是因為長得像才收在一起（兩張就收）
  const end = () => { if (run.length >= 3 || (run.length === 2 && like)) { const c = best(run); STK.set(c, run.slice()); run.forEach(i => STKOF.set(i, c)); } run = []; like = 0; };
  PH.forEach((p, i) => {
    const t = sec(p), q = PH[i - 1], tq = q && sec(q);
    const ok = q && t != null && tq != null && !isVid(p) && !isVid(q) && camName(p.x) === camName(q.x) && (p.w > p.h) === (q.w > q.h) && (p.u || "") === (q.u || "");
    const burst = ok && Math.abs(t - tq) <= 2, sim = ok && !burst && Math.abs(t - tq) <= 120 && p.dh && q.dh && dham(p.dh, q.dh) <= 10;
    if (!burst && !sim) end();
    if (sim) like = 1;
    if (!isVid(p) && t != null) run.push(i); else end();
  });
  end();
  [...STKOPEN].forEach(c => { if (!STK.has(c)) STKOPEN.delete(c); });
}
const tileOf = i => TILES[i] && !TILES[i].isConnected && STKOF.has(i) ? TILES[STKOF.get(i)] : TILES[i];   // 收在一疊裡的：用那疊最上面那張
let STKT = 0;
const stkTap = (i, el) => STK.has(i) && ZL < 2 && (!STKOPEN.has(i) || !!el.closest("[data-stk]"));   // 收著的整張點了攤開；攤開後點右上角收起
const stkHid = i => STKOF.has(i) && STKOF.get(i) !== i && !STKOPEN.has(STKOF.get(i)) && ZL < 2;
function stackToggle(c){                                    // 攤開／收起：照片從原本的位置滑到新位置（跟換大小一樣）
  if (!STK.has(c)) return;
  const vis = wallRects(), h0 = new Map();
  document.querySelectorAll(".dh[data-k],.scn[data-k]").forEach(h => h0.set(h.dataset.k, h.getBoundingClientRect().top));
  const OUT = [".msec", ".foot"].map(q => $(q)).filter(Boolean), o0 = OUT.map(e => e.getBoundingClientRect().top);
  const open = !STKOPEN.has(c);
  if (open && vis.has(c)) STK.get(c).forEach(i => { if (!vis.has(i)) vis.set(i, vis.get(c)); });   // 攤開：從那一疊長出來
  const go = () => {
    if (open) STKOPEN.add(c); else STKOPEN.delete(c);
    STK.get(c).forEach(i => badge(i));
    layout(true);
    if (!anim()) return;
    flyTiles(vis, ZDUR * .8);
    document.querySelectorAll(".dh[data-k]").forEach(h => { const y0 = h0.get(h.dataset.k), y1 = h.getBoundingClientRect().top; if (y0 != null && Math.abs(y0 - y1) > 1) h.animate([{transform:`translateY(${y0 - y1}px)`}, {transform:"none"}], {duration:ZDUR * .8, easing:DEC}); });
    OUT.forEach((e, k) => { const d = o0[k] - e.getBoundingClientRect().top; if (Math.abs(d) > 1) e.animate([{transform:`translateY(${d}px)`}, {transform:"none"}], {duration:ZDUR * .8, easing:DEC}); });
  };
  if (!open && anim()) {                                      // 收起：攤開的那幾張先縮回第一張那裡
    const r0 = TILES[c].getBoundingClientRect();
    Promise.all(STK.get(c).filter(i => i !== c).map(i => { const t = TILES[i], r = t.getBoundingClientRect();
      return t.animate([{opacity:1, transform:"none"}, {opacity:0, transform:`translate(${r0.left - r.left}px,${r0.top - r.top}px) scale(.6)`}], {duration:T.mid, easing:EXIT, fill:"forwards"}).finished.catch(() => {}); }))
      .then(() => { STK.get(c).forEach(i => TILES[i].getAnimations().forEach(a => a.cancel())); go(); });
  } else go();
}
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
    : `<div class="dh" data-day="${g.k}" data-k="d${g.k}"><b>${fday(g.d, YR)}${wxTag(g.k)}</b>${((pl, sm) => `<span>${pl ? `${I("pin")}${esc(sm ? pl.split("・")[0] : pl)}` : ""}</span>${sm ? `<i class="dsum">${esc(sm)}</i>` : ""}`)(dayPlaces(g.k), daySum(g.k))}${g.list.length > 1 ? `<button class="dct num" data-dplay="${g.k}" aria-label="播放這天">${I("play")}${g.list.length}</button>` : `<i class="dct num">${g.list.length}</i>`}${dayClock(g.list)}</div>` : ""}<div class="rows"></div></section>`).join("");
}
/* 那天的天氣：主機照拍照的地點、日期查的（世界氣象組織的天氣代碼） */
function wxIco(c){ return c <= 1 ? "wsun" : c <= 3 ? "wpart" : c <= 48 ? "wfog" : c >= 95 ? "wstorm" : (c >= 71 && c <= 77) || c === 85 || c === 86 ? "wsnow" : c >= 51 ? "wrain" : "wcld"; }
const WXN = {wsun:"晴", wpart:"多雲", wcld:"陰", wfog:"霧", wrain:"雨", wsnow:"雪", wstorm:"雷雨"};
function wxTag(k){
  const w = D.wx && D.wx[k]; if (!w) return "";
  const ic = wxIco(w[0]);
  return `<i class="dwx ${ic}" title="${WXN[ic]}">${I(ic)}<span class="num">${w[1]}°<small>${w[2]}°</small></span></i>`;
}
/* 每天的標題下面一條 24 小時的時間條：拍照的時間點一個點（夜裡暗、白天亮），看得出那天從幾點拍到幾點 */
function dayClock(list){
  const hs = list.map(i => PH[i]).filter(p => !p.x.dtf).map(p => pd(p.x.dt)).filter(Boolean).map(d => d.h + d.mi / 60);
  if (!hs.length) return "";
  const a = Math.min(...hs), b = Math.max(...hs), pc = v => (v / 24 * 100).toFixed(2);
  const dots = [...new Set(hs.map(h => Math.round(h * 4) / 4))];
  return `<i class="dhr" aria-hidden="true"><em style="left:${pc(a)}%;width:${(+pc(b) - +pc(a)).toFixed(2)}%"></em>${dots.map(h => `<b style="left:${pc(h)}%"></b>`).join("")}</i>`;
}
function wallRects(){                                         // 現在畫面上每張的位置（動畫中、手指捏著的也算）
  const vis = new Map(), H = innerHeight;
  TILES.forEach((t, i) => { if (!t.isConnected) return; const r = t.getBoundingClientRect(); if (r.bottom > -60 && r.top < H + 60) vis.set(i, r); });
  return vis;
}
const ZDUR = 520;
const zEase = t => 1 - Math.pow(1 - t, 3.2);                  // 跟手指放開一樣的減速
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);   // iPhone 的捏常被 Safari 搶走，上面多放大小鈕
function zbSync(){ document.querySelectorAll("[data-zb]").forEach(b => { b.disabled = ZL + +b.dataset.zb < 0 || ZL + +b.dataset.zb > 3; }); }
function flyTiles(vis, dur){                                  // 每張從 vis 記的位置連續長大／縮小到現在的位置，照片反著縮回來所以不壓扁
  const H = innerHeight, N = 14, fr = Array.from({length:N + 1}, (_, k) => zEase(k / N));
  TILES.forEach((t, i) => {
    if (!t.isConnected) return;
    const r0 = vis.get(i), r1 = t.getBoundingClientRect();
    if (r1.bottom < -60 || r1.top > H + 60) return;
    t.classList.add("in");
    if (!r0) { t.animate([{opacity:0, transform:"scale(.96)"}, {opacity:1, transform:"none"}], {duration:dur * .8, easing:DEC}); return; }
    const tk = [], ik = [];
    fr.forEach(e => {
      const x = r0.left + (r1.left - r0.left) * e, y = r0.top + (r1.top - r0.top) * e, ww = r0.width + (r1.width - r0.width) * e, hh = r0.height + (r1.height - r0.height) * e;
      const sx = ww / r1.width, sy = hh / r1.height, c = Math.max(sx, sy);
      tk.push({transform:`translate(${(x - r1.left).toFixed(2)}px,${(y - r1.top).toFixed(2)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`});
      ik.push({transform:`translate(${((ww - r1.width * c) / 2 / sx).toFixed(2)}px,${((hh - r1.height * c) / 2 / sy).toFixed(2)}px) scale(${(c / sx).toFixed(4)},${(c / sy).toFixed(4)})`});
    });
    t.animate(tk, {duration:dur, easing:"linear"});
    t.querySelectorAll("img").forEach(im => im.animate(ik, {duration:dur, easing:"linear"}));
    const b = t.querySelector(".bdg"); if (b) b.animate([{opacity:0}, {opacity:0, offset:.6}, {opacity:1}], {duration:dur, easing:"linear"});
  });
}
function zoomWall(z, fx, fy, pre){                            // 換大小：每張從現在的位置連續長大／縮小過去，照片不壓扁
  z = Math.min(3, Math.max(0, z));
  if (z === ZL || !$(".wall")) return false;
  const vis = pre || wallRects(), H = innerHeight;
  let anc = -1, best = 1e9;                                   // 手指下面那張留在手指下面
  vis.forEach((r, i) => { const d = Math.hypot(r.left + r.width / 2 - fx, r.top + r.height / 2 - fy); if (d < best) { best = d; anc = i; } });
  const a0 = anc >= 0 ? vis.get(anc) : null;
  TILES.forEach(t => { t.getAnimations().forEach(a => a.cancel()); t.querySelectorAll("img,.bdg").forEach(x => x.getAnimations().forEach(a => a.cancel())); });
  document.querySelectorAll(".dh,.scn").forEach(h => h.getAnimations().forEach(a => a.cancel()));
  const OUT = [".mems", ".stats", ".msec", ".foot"].map(q => $(q)).filter(Boolean);       // 照片牆上下的回憶、地圖、結尾也跟著滑
  OUT.forEach(e => e.getAnimations().forEach(a => a.cancel()));
  const o0 = OUT.map(e => e.getBoundingClientRect().top), h0 = new Map();
  document.querySelectorAll(".dh[data-k]").forEach(h => h0.set(h.dataset.k, h.getBoundingClientRect().top));
  const w = $(".wall"); w.style.transform = ""; w.style.transformOrigin = "";
  ZL = z; store.set("vsa-zoom", z);
  zbSync();
  sections(); layout(true);
  if (a0) { const r1 = TILES[anc].getBoundingClientRect(); scrollBy(0, (r1.top + r1.height / 2) - (a0.top + a0.height / 2)); }
  if (!anim()) return true;
  flyTiles(vis, ZDUR);
  document.querySelectorAll(".dh,.scn").forEach(h => {
    const y0 = h0.get(h.dataset.k), y1 = h.getBoundingClientRect().top;
    if (y0 != null) h.animate([{transform:`translateY(${y0 - y1}px)`}, {transform:"none"}], {duration:ZDUR, easing:DEC});   // 同一天的標題滑過去
    else h.animate([{opacity:0, transform:"translateY(6px)"}, {opacity:1, transform:"none"}], {duration:ZDUR, delay:ZDUR * .3, easing:DEC, fill:"backwards"});
  });
  OUT.forEach((e, k) => { const d = o0[k] - e.getBoundingClientRect().top; if (Math.abs(d) > 1) e.animate([{transform:`translateY(${d}px)`}, {transform:"none"}], {duration:ZDUR, easing:DEC}); });
  return true;
}
/* 這天一句話：早上在哪、下午到哪、走了幾公里（照拍照的時間和地點自動寫） */
function daySum(k){
  const ps = PH.filter(p => !p.x.dtf && p.p && (pd(p.x.dt) || {}).k === k);
  if (ps.length < 3) return "";
  const SG = ["早上", "中午", "下午", "晚上"], by = [{}, {}, {}, {}];
  ps.forEach(p => { const h = pd(p.x.dt).h, s = h < 5 ? 3 : h < 11 ? 0 : h < 14 ? 1 : h < 18 ? 2 : 3; by[s][p.p.n] = (by[s][p.p.n] || 0) + 1; });
  const parts = [];
  let last = "";
  by.forEach((o, s) => { const n = Object.keys(o).sort((a, b) => o[b] - o[a])[0]; if (!n || n === last) return; parts.push(`${SG[s]}${parts.length ? "到" : "在"}${n}`); last = n; });
  const g = ps.filter(p => p.g);
  let m = 0;
  for (let i = 1; i < g.length; i++) m += gdist(g[i - 1].g, g[i].g);
  const km = m >= 1000 ? `${m < 30000 ? "走了" : "移動了"} ${m < 10000 ? (m / 1000).toFixed(1).replace(/\.0$/, "") : Math.round(m / 1000)} 公里` : "";
  return parts.length > 1 || (parts.length && km) ? [...parts, km].filter(Boolean).join("，") : "";
}
function dayPlaces(k){                                       // 這天的城市＋最常拍的地方，例如「阿雷佐・聖方濟各聖殿」
  const c = {}, cc = {};
  PH.forEach(p => { const d = pd(p.x.dt); if (d && d.k === k && p.p) { c[p.p.n] = (c[p.p.n] || 0) + 1; if (p.p.c) cc[p.p.c] = (cc[p.p.c] || 0) + 1; } });
  const city = Object.keys(cc).sort((a, b) => cc[b] - cc[a])[0] || "";
  return [city, ...Object.keys(c).filter(n => n !== city).sort((a, b) => c[b] - c[a]).slice(0, city ? 1 : 2)].filter(Boolean).join("・");
}
/* ═════════ 智慧：太陽、光線、一張一句話、場景、搜尋 ═════════ */
/* 太陽多高（NOAA 的算法）：要有拍照地點和時區（沒寫時區的，主機用定位附帶的世界標準時間算），缺一個就不寫 */
function sunAlt(p){
  if ("_sa" in p) return p._sa;
  let out = null;
  const d = pd(p.x.dt), m = /^([+-])(\d\d):(\d\d)$/.exec(p.x.oz || "");
  if (d && m && p.g && !p.x.dtf) {
    const r = Math.PI / 180, off = (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]);
    const ms = Date.UTC(d.y, d.mo - 1, d.d, d.h, d.mi, +p.x.dt.slice(17, 19) || 0) - off * 6e4;
    const T = (ms / 864e5 + 2440587.5 - 2451545) / 36525;
    const L0 = ((280.46646 + T * (36000.76983 + T * .0003032)) % 360 + 360) % 360, M = 357.52911 + T * (35999.05029 - .0001537 * T);
    const e = .016708634 - T * (.000042037 + .0000001267 * T);
    const C = Math.sin(M * r) * (1.914602 - T * (.004817 + .000014 * T)) + Math.sin(2 * M * r) * (.019993 - .000101 * T) + Math.sin(3 * M * r) * .000289;
    const om = 125.04 - 1934.136 * T, lam = L0 + C - .00569 - .00478 * Math.sin(om * r);
    const eps = 23 + (26 + (21.448 - T * (46.815 + T * (.00059 - T * .001813))) / 60) / 60 + .00256 * Math.cos(om * r);
    const dec = Math.asin(Math.sin(eps * r) * Math.sin(lam * r)), y = Math.tan(eps * r / 2) ** 2;
    const eot = 4 / r * (y * Math.sin(2 * L0 * r) - 2 * e * Math.sin(M * r) + 4 * e * y * Math.sin(M * r) * Math.cos(2 * L0 * r) - .5 * y * y * Math.sin(4 * L0 * r) - 1.25 * e * e * Math.sin(2 * M * r));
    const tst = ((ms / 6e4 + eot + 4 * p.g[1]) % 1440 + 1440) % 1440, lat = p.g[0] * r;
    const a = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos((tst / 4 - 180) * r)) / r;
    out = {a, am:tst < 720};
  }
  return p._sa = out;
}
function lightOf(p){                                         // 太陽在地平線上 6 度內是黃金時刻、下面 6 度內是藍調時刻
  const s = sunAlt(p); if (!s || s.a > 6 || s.a <= -6) return "";
  return s.a > -.83 ? "黃金時刻" : "藍調時刻";
}
const TOD = h => h < 5 ? "深夜" : h < 8 ? "清晨" : h < 11 ? "早上" : h < 13 ? "中午" : h < 17 ? "下午" : h < 19 ? "傍晚" : "晚上";
function ftod(p, d){
  let w = TOD(d.h); const s = sunAlt(p);
  if (s && w === "傍晚" && s.a < -6) w = "晚上";
  else if (s && !s.am && s.a <= 6 && s.a > -6 && d.h >= 15) w = "傍晚";   // 黃金時刻、藍調時刻的下午算傍晚
  return `${w} ${d.h % 12 || 12}:${String(d.mi).padStart(2, "0")}`;
}
function dayWx(d){ const w = d && D.wx && D.wx[d.k]; return w ? `${WXN[wxIco(w[0])]} ${w[2]}～${w[1]}°` : ""; }
/* 看大圖下面那一句：「傍晚 6:12・黃金時刻・晴 12～18°・L.單色D」 */
function capLine(p){
  const d = p.x.dtf ? null : pd(p.x.dt), md = (GROUPS.length > 1 && GROUPS[0].d) || YR;
  return [d ? `${md ? `${d.mo}月${d.d}日 ` : ""}${ftod(p, d)}` : "", lightOf(p), d ? dayWx(d) : "", p.x.ms && p.x.ms.st, p.ub ? `${p.ub} 放的` : ""].filter(Boolean).join("・") || camName(p.x);
}

/* 一天自動分場景：隔一小時以上、或換了地方（1.5 公里外、隔 15 分鐘以上）就是下一段；太小段的併進前一段 */
function scenesOf(list){
  if (list.length < 8) return null;
  const sc = [];
  let prev = null;
  list.forEach(i => {
    const p = PH[i], d = p.x.dtf ? null : pd(p.x.dt), t = d ? d.h * 60 + d.mi : null;
    let cut = !sc.length;
    if (!cut && prev && t != null && prev.t != null) {
      const gap = t - prev.t;
      cut = gap > 60 || (gap > 15 && ((p.g && prev.g && gdist(p.g, prev.g) > 1500) || (p.p && prev.n && p.p.n !== prev.n)));
    }
    if (cut) sc.push({list:[]});
    sc[sc.length - 1].list.push(i);
    prev = {t, g:p.g || (prev && prev.g), n:p.p ? p.p.n : prev && prev.n};
  });
  for (let k = sc.length - 1; k > 0; k--) if (sc[k].list.length < 3) { sc[k - 1].list.push(...sc[k].list); sc.splice(k, 1); }
  if (sc.length > 1 && sc[0].list.length < 3) { sc[1].list.unshift(...sc[0].list); sc.shift(); }
  return sc.length > 1 ? sc : null;
}
function sceneHead(s, k){
  const ps = s.list.map(i => PH[i]), p0 = ps.find(p => !p.x.dtf && pd(p.x.dt)), d = p0 && pd(p0.x.dt), pl = {};
  ps.forEach(p => { if (p.p) pl[p.p.n] = (pl[p.p.n] || 0) + 1; });
  const name = Object.keys(pl).sort((a, b) => pl[b] - pl[a])[0] || "", lt = {};
  ps.forEach(p => { const l = lightOf(p); if (l) lt[l] = (lt[l] || 0) + 1; });
  const lg = Object.keys(lt).sort((a, b) => lt[b] - lt[a])[0], gold = lg && lt[lg] * 2 >= ps.length ? lg : "";
  const n = ps.reduce((a, p, j) => a + (STK.has(s.list[j]) ? STK.get(s.list[j]).length : 1), 0);
  const el = document.createElement("div");
  el.className = "scn"; el.dataset.k = `s${d ? d.k : ""}${k}`;
  el.innerHTML = `<i class="sdot${gold ? gold === "藍調時刻" ? " blue" : " gold" : ""}"></i><b class="num">${d ? esc(ftod(p0, d)) : `第 ${k + 1} 段`}</b>${name ? `<span>${esc(name)}</span>` : ""}${gold ? `<em class="${gold === "藍調時刻" ? "blue" : ""}">${gold}</em>` : ""}<small class="num">${n}</small>`;
  return el;
}

/* 搜尋：地點、日期、第幾天、早上晚上、黃金時刻、天氣、顏色、相機、風格…（全部在手機上算，不用問主機） */
let SQ = "";
const COLS = [["紅", 0, "#e5484d"], ["橘", 28, "#f08a3c"], ["黃", 55, "#f2c94c"], ["綠", 120, "#46a758"], ["青", 180, "#30b5c4"], ["藍", 222, "#3e7bfa"], ["紫", 275, "#8e5cf7"], ["粉", 330, "#f076b8"]];
const SYN = {晴天:"晴", 下雨:"雨", 雨天:"雨", 陰天:"陰", 雪景:"雪", 下雪:"雪", 夕陽:"日落", 黃昏:"日落", 晚霞:"日落", 朝陽:"日出", 夜晚:"夜景", 半夜:"深夜",
  橙:"橘", 粉紅:"粉", 黑白照:"黑白", 直式:"直", 直的:"直", 橫式:"橫", 橫的:"橫", 動圖:"gif", 喜歡:"愛心", 最愛:"愛心", 金色時刻:"黃金時刻", 魔幻時刻:"黃金時刻", 藍色時刻:"藍調時刻"};
const sqTerms = q => q.toLowerCase().split(/[\s,，、]+/).filter(Boolean).map(t => SYN[t] || (t.length > 1 && /[色天]$/.test(t) && COLS.some(c => c[0] === t[0]) ? t[0] : t));
let DAYN = null;
function srchText(p){
  if (p._st) return p._st;
  if (!DAYN) { DAYN = {}; [...new Set(ALL.filter(q => !q.u && !q.x.dtf).map(q => (pd(q.x.dt) || {}).k).filter(Boolean))].sort().forEach((k, n) => { DAYN[k] = n + 1; }); }
  const d = p.x.dtf ? null : pd(p.x.dt), t = [], ms = p.x.ms || {}, L = lightOf(p), s = sunAlt(p);
  if (p.p) t.push(p.p.n, p.p.c || "", p.p.a || "");
  if (d) t.push(`${d.y}年${d.mo}月${d.d}日`, `${d.mo}月${d.d}日`, `${d.mo}/${d.d}`, `${d.mo}月`, `星期${WD[d.wd]} 週${WD[d.wd]}`, TOD(d.h), DAYN[d.k] ? `第${DAYN[d.k]}天 第 ${DAYN[d.k]} 天` : "", dayWx(d));
  if (L) t.push(L, L === "黃金時刻" ? (s.am ? "日出" : "日落") : "");
  if (s && s.a <= -6) t.push("夜景");
  t.push(camName(p.x), lensName(p.x), ms.st || "", ms.lut || "", (ms.fx || []).join(" "), p.cs || "", p.hdr ? "hdr" : "", p.rw ? `raw ${p.rw}` : "");
  t.push(isVid(p) ? "影片" : p.gf ? "gif" : p.lv ? "原況" : "", p.w > p.h * 1.1 ? "橫" : p.h > p.w * 1.1 ? "直" : "方", p.lk ? "愛心" : "", p.ub || "", (p._co || []).join(" "), p.n);
  return p._st = t.join(" ").toLowerCase();
}
const sqHit = (p, terms) => { const s = srchText(p); return terms.every(t => s.includes(t)); };
/* 顏色：用每張都有的模糊小圖（24 格寬）算，鮮豔的才算；一張最多兩個顏色；幾乎沒顏色的算黑白 */
let COLQ = null;
function colorsAll(){
  if (COLQ) return COLQ;
  const cv = document.createElement("canvas"), cx = cv.getContext("2d", {willReadFrequently:true});
  const one = p => new Promise(res => {
    if (p._co || !p.q || isVid(p)) return res();
    const im = new Image();
    im.onload = () => {
      const w = cv.width = Math.min(24, im.width), h = cv.height = Math.max(1, Math.round(im.height * w / im.width));
      cx.drawImage(im, 0, 0, w, h);
      const px = cx.getImageData(0, 0, w, h).data, wt = COLS.map(() => 0);
      let col = 0, n = 0;
      for (let k = 0; k < px.length; k += 4) {
        const R = px[k] / 255, G = px[k + 1] / 255, B = px[k + 2] / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), c = mx - mn;
        n++;
        if (mx < .18 || c / mx < .28 || c < .12) continue;
        let hu = mx === R ? ((G - B) / c) % 6 : mx === G ? (B - R) / c + 2 : (R - G) / c + 4;
        hu = (hu * 60 + 360) % 360;
        let b = 0, bd = 999;
        COLS.forEach(([, h0], j) => { const dd = Math.min(Math.abs(hu - h0), 360 - Math.abs(hu - h0)); if (dd < bd) { bd = dd; b = j; } });
        wt[b] += c * mx; col++;
      }
      const sum = wt.reduce((a, b) => a + b, 0), out = [];
      if (col / n < .03 || /單色|ACROS|黑白|棕褐/.test((p.x.ms || {}).st || "")) out.push("黑白");
      else if (col / n >= .12) wt.map((v, j) => [v, j]).sort((a, b) => b[0] - a[0]).slice(0, 2).forEach(([v, j]) => { if (v >= sum * .3) out.push(COLS[j][0]); });
      p._co = out; p._st = ""; res();
    };
    im.onerror = () => res();
    im.src = `data:image/jpeg;base64,${p.q}`;
  });
  return COLQ = (async () => { const ps = ALL.filter(p => !p.u); for (let k = 0; k < ps.length; k++) { await one(ps[k]); if (k % 40 === 39) await new Promise(r => setTimeout(r)); } })();
}
function srchSugg(){                                         // 建議：這本真的有的才列（有幾張寫在後面）
  const base = ALL.filter(p => (p.u || "") === WHO), cnt = q => base.filter(p => sqHit(p, sqTerms(q))).length, out = [];
  const top = (f, n) => { const c = {}; base.forEach(p => { const v = f(p); if (v) c[v] = (c[v] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n); };
  const add = (g, list) => { const l = list.map(x => Array.isArray(x) ? x : [x, cnt(x)]).filter(x => x[1] > 0 && x[1] < base.length); if (l.length) out.push([g, l]); };
  const cs = top(p => p.p && p.p.c, 8);
  add("地點", cs.length > 1 ? cs : top(p => p.p && p.p.n, 8));
  add("光線", ["黃金時刻", "日出", "日落", "藍調時刻", "夜景"]);
  add("時間", [...new Set(base.filter(p => !p.x.dtf && pd(p.x.dt)).map(p => TOD(pd(p.x.dt).h)))].sort((a, b) => "清晨早上中午下午傍晚晚上深夜".indexOf(a) - "清晨早上中午下午傍晚晚上深夜".indexOf(b)));
  add("天氣", ["晴", "多雲", "陰", "雨", "雪", "霧"]);
  add("顏色", [...COLS.map(c => c[0]), "黑白"]);
  add("種類", ["影片", "原況", "hdr", "raw", "直", "橫", "愛心"]);
  add("器材", [...top(p => camName(p.x), 4).map(x => x[0]), ...top(p => (p.x.ms || {}).st, 4).map(x => x[0])]);
  return out;
}
const SQL = {hdr:"HDR", raw:"RAW", gif:"GIF"};
function sqChip(q, n){
  const c = COLS.find(x => x[0] === q);
  return `<button class="chip" data-sq="${esc(q)}">${c ? `<i class="cdot" style="background:${c[2]}"></i>` : q === "黑白" ? `<i class="cdot bw"></i>` : ""}<span>${esc(SQL[q] || q)}</span><small class="num">${n}</small></button>`;
}
function srchOpen(){
  if (SH) return;
  const bg = document.createElement("div");
  bg.className = "shbg top";
  bg.innerHTML = `<div class="sh srh"><label class="sqf">${I("find")}<input type="search" enterkeyhint="search" placeholder="地點、日期、黃金時刻、晴天、紅色…" aria-label="搜尋照片" value="${esc(SQ)}"><button class="sqc" type="button" aria-label="清掉"${SQ ? "" : " hidden"}>${I("x")}</button></label>
    <div class="sqr"><div><div class="sqn num"></div><div class="sqt"></div></div></div><div class="sqs"></div></div>`;
  document.body.appendChild(bg);
  const inp = bg.querySelector("input"), sqs = bg.querySelector(".sqs"), sqr = bg.querySelector(".sqr"), clr = bg.querySelector(".sqc");
  void bg.offsetWidth; bg.classList.add("on");
  setTimeout(() => inp.focus(), T.fast);
  SH = {close(){ if (SH && SH.bg === bg) SH = null; bg.classList.remove("on"); bg.style.pointerEvents = "none"; inp.blur(); setTimeout(() => bg.remove(), T.mid + 50); }, bg};
  history.pushState({sh:1}, "");
  let hits = [], shown = "";
  const sugg = () => { sqs.innerHTML = srchSugg().map(([g, l]) => `<div class="sqg"><small>${g}</small><div>${l.map(([q, n]) => sqChip(q, n)).join("")}</div></div>`).join(""); };
  const run = () => {
    const q = inp.value.trim(), terms = sqTerms(q);
    clr.hidden = !q;
    const base = ALL.filter(p => (p.u || "") === WHO);
    hits = q ? base.filter(p => sqHit(p, terms)) : [];
    bg.classList.toggle("has", !!q);
    const key = hits.slice(0, 14).map(p => p.i).join();
    sqr.querySelector(".sqn").innerHTML = q ? (hits.length ? `<b>${hits.length}</b> 張<button class="btn sm" data-sqgo>看這些</button>` : "找不到") : "";
    if (key !== shown) {
      shown = key;
      sqr.querySelector(".sqt").innerHTML = hits.slice(0, 14).map((p, k) => `<button data-sqi="${esc(p.i)}" style="--i:${k}"><img alt="" draggable="false" src="${p.q ? `data:image/jpeg;base64,${p.q}` : src(p, "s")}"><img class="hi" alt="" loading="lazy" draggable="false" src="${src(p, "s")}"></button>`).join("");
      sqr.querySelectorAll(".hi").forEach(im => im.complete && im.naturalWidth ? im.classList.add("ok") : im.addEventListener("load", () => im.classList.add("ok"), {once:true}));
    }
  };
  const go = (q, pid) => { SQ = q.trim(); popBack(); setTimeout(() => whoSet(WHO, true).then(() => {
    if (pid) { const i = PH.findIndex(p => p.i === pid); if (i >= 0) return openLb(i, TILES[i]); }
    const w = $(".cityf"); if (w && !w.hidden) scrollTo({top:w.getBoundingClientRect().top + scrollY - 70, behavior:anim() ? "smooth" : "auto"}); }), anim() ? T.mid : 0); };
  inp.addEventListener("input", run);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (hits.length || !inp.value.trim()) go(inp.value); } });
  clr.addEventListener("click", () => { inp.value = ""; run(); inp.focus(); });
  bg.addEventListener("click", e => {
    if (e.target === bg) return popBack();
    const c = e.target.closest("[data-sq]"); if (c) { inp.value = c.dataset.sq; run(); return; }
    if (e.target.closest("[data-sqgo]")) return go(inp.value);
    const t = e.target.closest("[data-sqi]"); if (t) return go(inp.value, t.dataset.sqi);
  });
  sugg(); run();
  colorsAll().then(() => { if (SH && SH.bg === bg) { sugg(); run(); } });
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
    if (list.length > 12) {                                  // 太多張：一疊只留最好的、再挑分數高的 12 張（照時間排）
      let one = list.filter(i => !STKOF.has(i) || STKOF.get(i) === i);
      if (one.length < 12) one = list;
      if (one.some(i => PH[i].qs != null)) list = one.slice().sort((a, b) => (PH[b].qs ?? 0) - (PH[a].qs ?? 0)).slice(0, 12).sort((a, b) => a - b);
      else { const st = one.length / 12; list = Array.from({length:12}, (_, k) => one[Math.floor(k * st)]); }
    }
    const cv = list.slice().sort((a, b) => (PH[b].lk || 0) - (PH[a].lk || 0))[0], ph = list.filter(i => !isVid(PH[i]));
    return {...g, list, cv:(PH[cv] && PH[cv].lk) ? cv : ph.length ? best(ph) : list[0]};
  }).filter(g => g.list.length).slice(0, 40);
}
function mems(){
  const box = $(".mems"); if (!box) return;
  MEMS = WHO ? [] : memsOf();                                // 回憶、地圖只給主人的照片
  box.hidden = MEMS.length < 2;
  box.innerHTML = MEMS.length < 2 ? "" : `<div class="mrw">${MEMS.map((g, n) => `<button class="mem${SEEN.has(g.k) ? " seen" : ""}" data-mem="${n}" aria-label="${esc(g.t)}">
    <span class="mring"><img alt="" loading="lazy" draggable="false" src="${src(PH[g.cv], "s")}"></span><b>${esc(g.t)}</b>${g.s ? `<small class="num">${esc(g.s)}</small>` : ""}</button>`).join("")}</div>`;
}
/* 封面下面一排數字：幾張、幾天、幾個地點、走了幾公里（捲到時數字往上跳） */
let STIO = null;
function stats(){
  const box = $(".stats"); if (!box) return;
  const days = new Set(), pl = new Set(), ct = new Set(), cc = new Set();
  PH.forEach(p => { const d = pd(p.x.dt); if (d) days.add(d.k); if (p.p) { pl.add(p.p.n); if (cityKey(p)) ct.add(cityKey(p)); if (p.p.cc) cc.add(p.p.cc); } });
  const many = ct.size > 1;
  const v = PH.filter(isVid).length, it = [[PH.length - v, "張照片"], [v, "段影片"], [days.size, "天"], [D.loc && cc.size > 1 ? cc.size : 0, "個國家"], [D.loc ? (many ? ct.size : pl.size) : 0, many ? "個城市" : "個地點"]].filter(x => x[0] > 0);
  box.hidden = !!WHO || it.length < 2;
  const per = {}; PH.forEach(p => { const d = pd(p.x.dt); if (d) per[d.k] = (per[d.k] || 0) + 1; });
  const ks = Object.keys(per).sort(), mx = Math.max(1, ...Object.values(per));
  const gfx = t => t === "天" && ks.length > 1 && ks.length <= 40   // 每天幾張的小長條
      ? `<span class="sgb" aria-hidden="true">${ks.map(k => `<i style="height:${Math.max(12, per[k] / mx * 100).toFixed(0)}%"></i>`).join("")}</span>`
    : t === "個國家" ? `<span class="sgf" aria-hidden="true">${[...cc].slice(0, 5).map(flagImg).join("")}</span>`   // 去過的國家疊成一排國旗
    : t === "段影片" && PH.length > v ? `<span class="sgr" aria-hidden="true"><i style="width:${(v / PH.length * 100).toFixed(1)}%"></i></span>` : "";   // 影片佔多少
  box.innerHTML = it.map(([n, t]) => `<div class="st"><b class="num" data-n="${n}">${n}</b><small>${t}</small>${gfx(t)}</div>`).join("")
    + (D.loc && !WHO ? `<div class="st" data-skm hidden><b class="num" data-n="0">0</b><small>公里</small></div>` : "");
  if (!anim() || !("IntersectionObserver" in window)) return;
  box.querySelectorAll("b").forEach(b => { b.textContent = "0"; });
  if (STIO) STIO.disconnect();
  STIO = new IntersectionObserver(es => { if (!es.some(e => e.isIntersecting)) return; STIO.disconnect(); STIO = null;
    const t0 = performance.now(), bs = [...box.querySelectorAll("b")];
    const step = t => { const k = Math.min(1, (t - t0) / (T.slow * 2)), e = 1 - Math.pow(1 - k, 3);
      bs.forEach(b => { const n = +b.dataset.n, d = String(b.dataset.n).includes(".") ? 1 : 0; b.textContent = (n * e).toFixed(d); });
      if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step); }, {threshold:.6});
  STIO.observe(box);
  flagFix(box);
}
/* 結尾：三張照片疊成一疊（跟標誌一樣），點了播放 */
function finCol(){
  const ok = PH.filter(p => !p.broken && !p.raw && !isVid(p));
  if (ok.length < 3) return "";
  const liked = ok.slice().sort((a, b) => (b.lk || 0) - (a.lk || 0));
  const pick = liked[0].lk ? [liked[0], liked[1], liked[2]] : [ok[0], ok[Math.floor(ok.length / 2)], ok[ok.length - 1]];
  return `<button class="fcol" data-ss aria-label="播放">${pick.map(p => `<span><img alt="" loading="lazy" draggable="false" src="${src(p, "s")}"></span>`).join("")}<i>${I("play")}</i></button>`;
}
function draw(){
  const ds = PH.map(p => pd(p.x.dt)).filter(Boolean), real = PH.filter(p => !p.x.dtf).map(p => pd(p.x.dt)).filter(Boolean);
  const rd = real.length ? real : ds, a = rd[0], b = rd[rd.length - 1];
  const cover = PH.find(p => p.w > p.h * 1.15 && !p.raw) || PH[0];
  YR = a && b && a.y !== b.y;
  DAYN = null; COLQ = null;
  const FIND = ALL.filter(p => !p.u).length >= 12;                // 照片夠多才放搜尋
  const pl = (D.places || []).slice(0, 3).join("・");
  $("#app").innerHTML = `
    <header class="hero"><div class="cv">${cover.q ? `<img class="lq" alt="" src="data:image/jpeg;base64,${cover.q}">` : ""}<img class="hi" alt="" src="${src(cover, "l")}"></div>
      <div class="hcap">${a ? `<div class="eyebrow num">${esc(frange(a, b))}</div>` : ""}<h1 style="--n:${[...D.name].length}">${[...D.name].map((c, k) => c === " " ? " " : `<span class="ch" style="--i:${k}">${esc(c)}</span>`).join("")}</h1>
        <div class="hmeta"><button class="chip go" data-ss>${I("play")}<span>播放</span></button>${FIND ? `<button class="chip" data-find aria-label="搜尋">${I("find")}<span>搜尋</span></button>` : ""}${pl ? `<span class="chip" data-pl>${heroFlags() || I("pin")}<span>${esc(pl)}</span></span>` : ""}
        ${D.dl ? `<button class="chip" data-sel>${I("dl")}<span>下載</span></button>` : ""}${D.up ? `<button class="chip" data-up>${I("up")}<span>放照片</span></button>` : ""}</div></div>
      <button class="cue" aria-label="往下看"><i></i></button></header>
    <div class="bar"><b>${esc(D.name)}<small class="num">${cntTxt()}</small></b>${IOS ? `<span class="chip zb"><button data-zb="-1" aria-label="放大">${I("zin")}</button><button data-zb="1" aria-label="縮小">${I("zout")}</button></span>` : ""}${FIND ? `<button class="chip" data-find aria-label="搜尋">${I("find")}</button>` : ""}${D.up ? `<button class="chip" data-up aria-label="放照片">${I("up")}</button>` : ""}${D.dl ? `<button class="chip" data-sel aria-label="下載">${I("dl")}</button>` : ""}<button class="chip go" data-ss aria-label="播放">${I("play")}</button></div>
    ${D.intro ? `<section class="intro"><p>${esc(D.intro).replace(/\n/g, "<br>")}</p></section>` : ""}<nav class="who" hidden></nav><div class="mems"></div><div class="stats"></div><section class="hl" hidden></section><div class="cityf" hidden></div><div class="wwrap"><main class="wall" data-z="${ZL}"></main><aside class="smap" hidden><div class="smv"></div><div class="smc"></div></aside></div>
    <section class="gear" hidden></section>
    ${D.loc && ALL.some(p => p.g && !p.u) ? `<section class="msec"${WHO ? " hidden" : ""}><div class="mh"><b data-mt>地點</b><span class="num" data-km></span></div><div class="cities"></div><div class="map" data-map></div></section>` : ""}
    <div class="scrub" aria-hidden="true"><div class="stk2"></div><i class="sth"><span class="sbl num"></span></i></div>
    ${D.talk ? `<section class="gbk"></section>` : ""}
    <footer class="foot">${finCol()}<div class="fin">${esc(D.name)}</div>${D.exp ? `<span class="fexp">${expRing()}${left(D.exp)}</span>` : ""}</footer>`;
  const hi = $(".hero .hi");
  const hok = () => { hi.classList.add("ok"); setTimeout(() => { const q = $(".hero .lq"); if (q) q.remove(); }, T.slow + 100); };   // 糊的底圖拿掉，捲動時不用一直重畫模糊
  hi.complete ? hok() : hi.addEventListener("load", hok, {once:true});
  heroCycle(cover); zbSync(); tint(cover); flagFix($(".hero"));
  const hf = $(".hfl"); if (hf) hf.querySelectorAll("img").forEach(f => f.addEventListener("error", () => { if (!hf.querySelector("img")) hf.outerHTML = I("pin"); }));   // 國旗都抓不到就換回圖釘
  if (D.wmo) document.documentElement.style.setProperty("--wm", JSON.stringify(D.wmo));
  document.documentElement.classList.toggle("wmo", !!D.wmo);
  stackCalc();
  TILES = PH.map((p, i) => tile(p, i));
  whoBar();
  stats();
  highlights();
  smapOn();
  sections();
  layout();
  mems();
  bigMap();
  gear();
  gbook();
  smapWatch();
  onScroll();
  deepLink();
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
  const parts = [".mems", ".stats", ".hl", ".cityf", ".wall", ".gear", ".msec", ".smap", ".gbk"].map(q => $(q)).filter(Boolean);
  if (anim()) await Promise.all(parts.map(x => x.animate([{opacity:1}, {opacity:0, transform:"translateY(6px)"}], {duration:T.fast, easing:EXIT, fill:"forwards"}).finished.catch(() => {})));
  if (!keep || w !== WHO) { CITY = ""; GEAR = ""; SQ = ""; }
  WHO = w; PH = pickW(); citybar(); stackCalc();
  TILES.forEach(t => t.classList.remove("on"));
  TILES = PH.map((p, i) => { const t = TM.get(p.i); if (t) { t.dataset.i = i; return t; } return tile(p, i); });
  whoBar();
  const ms = $(".msec"); if (ms) ms.hidden = !!WHO || !!CITY || !!GEAR || !!SQ || !(D.loc && PH.some(p => p.g));   // 先決定要不要顯示，地圖才量得到大小（以前篩選完再回來，地圖還是篩選時那幾張）
  smapOn(); sections(); layout(true); mems(); stats(); highlights(); bigMap(); gear(); gbook(); smapWatch();
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
/* 封面的地點膠囊：去過幾國就疊幾面國旗（最多 3 面），沒有國家才放圖釘 */
function heroFlags(){
  const cc = [...new Set(PH.filter(p => p.p && p.p.cc).map(p => p.p.cc))].filter(c => /^[A-Z]{2}$/.test(c)).slice(0, 3);
  return cc.length ? `<span class="hfl">${cc.map(flagImg).join("")}</span>` : "";
}
function cntTxt(){
  const v = PH.filter(isVid).length, n = PH.length - v;
  return [n ? `${n} 張` : "", v ? `${v} 段影片` : ""].filter(Boolean).join("・");
}
/* 還剩多少時間：一個圈，剩下的那段亮著 */
function expRing(){
  const all = D.exp - (D.es || 0), k = all > 0 ? Math.max(0, Math.min(1, (D.exp - Date.now() / 1000) / all)) : 1, L = 2 * Math.PI * 8;
  return `<svg class="ring" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><circle class="rk" cx="10" cy="10" r="8" stroke-dasharray="${(L * k).toFixed(2)} ${L.toFixed(2)}"/></svg>`;
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
  el.innerHTML = `${p.q ? `<img class="lq" alt="" src="data:image/jpeg;base64,${p.q}">` : ""}<img class="hi" alt="" loading="lazy" decoding="async" draggable="false" src="${src(p, "s")}"><span class="bdg"></span><span class="ck">${I("ck")}</span>${hvTxt(p) ? `<span class="hv">${esc(hvTxt(p))}</span>` : ""}`;
  setTimeout(() => badge(+el.dataset.i));
  const hi = el.querySelector(".hi");
  hi.addEventListener("load", () => { hi.decoding = "sync";   /* 換大小時照片會被拿下來再放回去：載好的改同步解碼，放回去那一格不會空白 */ hi.classList.add("ok"); setTimeout(() => { const q = el.querySelector(".lq"); if (q) q.remove(); }, T.slow * 2); }, {once:true});
  hi.addEventListener("error", () => { p.broken = 1; hi.remove(); el.insertAdjacentHTML("beforeend", `<span class="nope">${I("off")}</span>`); }, {once:true});
  if (IO) IO.observe(el); else el.classList.add("in");
  return el;
}
function hvTxt(p){ const d = pd(p.x.dt); return [d ? `${d.mo}/${d.d} ${ftime(d)}` : "", camName(p.x)].filter(Boolean).join("・"); }   // 電腦滑鼠指著：拍攝時間、相機
function badge(i){                                          // 格子上的小標：影片長度、原況、愛心
  const t = TILES[i], p = PH[i]; if (!t) return;
  const b = t.querySelector(".bdg");
  b.innerHTML = `${isVid(p) ? `<span class="vt num">${I("play")}${dur(p.vd)}</span>` : p.gf ? `<span class="vt">GIF</span>` : p.lv ? `<span class="lvt">${I("live")}</span>` : ""}${rxBadge(p)}${STK.has(i) ? `<span class="stk num${STKOPEN.has(i) ? " op" : ""}" data-stk="${i}" aria-label="${STKOPEN.has(i) ? "收起" : "攤開"}連拍">${I("stk")}${STK.get(i).length}</span>` : ""}`;
}
function rxBadge(p){                                        // 愛心＋其他表情：最多的兩個表情疊在一起，後面是總數
  const rx = Object.entries(p.rx || {}).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]), n = (p.lk || 0) + rx.reduce((a, r) => a + r[1], 0);
  if (!n) return "";
  return `<span class="lkt num">${p.lk ? I("heart") : ""}${rx.slice(0, p.lk ? 1 : 2).map(r => `<i class="rxe">${r[0]}</i>`).join("")}${n}</span>`;
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
    box.parentNode.classList.remove("cov");
    const list = g.list.filter(i => !stkHid(i));
    if (ZL >= 2) {                                           // 小方格：一排固定幾張
      const n = Math.max(ZL === 3 ? 6 : 4, Math.round((W + gap) / (rh + gap))), sz = (W - gap * (n - 1)) / n;
      for (let k = 0; k < list.length; k += n) rows.push([list.slice(k, k + n).map(i => [i, 1]), sz]);
      const frag = document.createDocumentFragment();
      rows.forEach(([list, h]) => { const r = document.createElement("div"); r.className = "row sq"; r.style.height = h.toFixed(2) + "px";
        list.forEach(([i]) => { const t = TILES[i]; t.style.width = t.style.height = h.toFixed(2) + "px"; r.appendChild(t); }); frag.appendChild(r); });
      box.replaceChildren(frag);
      return;
    }
    const wide = list.filter(i => !STK.has(i) && !isVid(PH[i]) && PH[i].w / PH[i].h >= 1.3), top = wide.length && PH[wide[0]].qs != null ? best(wide) : list[0];
    const big = ZL === 1 && list.length >= 3 && !STK.has(top) && PH[top].w / PH[top].h >= 1.3 && W >= 320 ? top : -1;   // 這天拍得最好的橫幅放整排，當這天的封面（沒有分數就用第一張）
    const sec = box.parentNode, dh = sec.querySelector(".dh[data-day]");
    sec.classList.toggle("cov", big >= 0 && !!dh);
    if (big >= 0) { const ar = Math.min(3, PH[big].w / PH[big].h), fh = Math.min(W / ar, innerHeight * .72); sec.style.setProperty("--fh", fh.toFixed(1) + "px"); rows.push([[[big, W / fh]], fh, 1]); }
    const scs = g.d && !g.m ? scenesOf(list) : null;            // 一天分成幾段：每段上面一行「下午 3:40・烏菲茲美術館」
    (scs || [{list}]).forEach((sc, k) => {
      if (scs) rows.push([sceneHead(sc, k)]);
      sc.list.forEach(i => {
        if (i === big) return;
        const p = PH[i], ar = Math.min(3, Math.max(.4, p.w / p.h));
        cur.push([i, ar]); sum += ar;
        if (sum * rh + gap * (cur.length - 1) >= W) { rows.push([cur, (W - gap * (cur.length - 1)) / sum]); cur = []; sum = 0; }
      });
      if (cur.length) rows.push([cur, Math.min(rh * 1.1, (W - gap * (cur.length - 1)) / sum)]);
      cur = []; sum = 0;
    });
    const frag = document.createDocumentFragment();
    rows.forEach(([list, h, feat]) => {
      if (list instanceof HTMLElement) return frag.appendChild(list);
      const r = document.createElement("div"); r.className = feat ? "row feat" : "row"; r.style.height = h.toFixed(2) + "px";
      list.forEach(([i, ar]) => { const t = TILES[i]; t.style.width = (ar * h).toFixed(2) + "px"; t.style.height = h.toFixed(2) + "px"; r.appendChild(t); });
      frag.appendChild(r);
    });
    box.replaceChildren(frag);
  });
}
let RZ;
addEventListener("resize", () => { clearTimeout(RZ); RZ = setTimeout(() => { if (smapOn()) smapWatch(); layout(); bigMap(); smapGo(SMK, true); if (LB) LB.fitAll(); }, 120); });

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
    scrubSync();
  });
}
addEventListener("scroll", onScroll, {passive:true});
/* 右邊的日期捲軸：照片很多時，捲動就浮出來，按住拖可以直接跳到某個月、某一天 */
const SCR = {t:0, drag:false, rows:null};
function scrubRange(){
  const w = $(".wall"); if (!w) return null;
  const a = w.getBoundingClientRect().top + scrollY - 80, b = a + 80 + w.offsetHeight - innerHeight * .6;
  return b - a > innerHeight * 3 ? [a, b] : null;
}
function scrubSync(){
  const sc = $(".scrub"); if (!sc) return;
  const rg = scrubRange(), on = !!rg && !LB && !SS && !SY && scrollY > rg[0] - innerHeight * .5 && scrollY < rg[1] + innerHeight * .5;
  if (!on) { if (!SCR.drag) sc.classList.remove("on"); return; }
  const f = Math.max(0, Math.min(1, (scrollY - rg[0]) / (rg[1] - rg[0])));
  sc.style.setProperty("--f", f.toFixed(4));
  if (!sc.classList.contains("on")) scrubMarks(sc, rg);
  sc.classList.add("on");
  clearTimeout(SCR.t);
  if (!SCR.drag) SCR.t = setTimeout(() => { if (!SCR.drag) sc.classList.remove("on"); }, 1400);
}
function scrubMarks(sc, rg){                                 // 軌道上每個月（只有一個月就每一天）一個小點
  const k = GROUPS.length > 1 ? GROUPS.filter(g => g.d) : [];
  const months = new Set(k.map(g => `${g.d.y}-${g.d.mo}`)), byMonth = months.size > 1, seen = new Set();
  sc.querySelector(".stk2").innerHTML = k.map((g, gi) => {
    const id = byMonth ? `${g.d.y}-${g.d.mo}` : g.k; if (seen.has(id)) return ""; seen.add(id);
    const sec = $(`.wall [data-g="${GROUPS.indexOf(g)}"]`); if (!sec) return "";
    const f = (sec.getBoundingClientRect().top + scrollY - rg[0]) / (rg[1] - rg[0]);
    return f >= 0 && f <= 1 ? `<b style="top:calc(${(f * 100).toFixed(2)}% )"></b>` : "";
  }).join("");
}
function scrubLabel(y){                                      // 那個位置的那一排，第一張的日期
  if (!SCR.rows) SCR.rows = [...document.querySelectorAll(".wall .row")].map(r => [r.getBoundingClientRect().top + scrollY, r.firstElementChild ? +r.firstElementChild.dataset.i : -1]);
  const t = y + innerHeight * .3; let best = SCR.rows[0];
  for (const r of SCR.rows) { if (r[0] > t) break; best = r; }
  const p = best && PH[best[1]], d = p && pd(p.x.dt);
  return d ? ZL === 3 ? `${d.y}年${d.mo}月` : `${YR ? d.y + "年" : ""}${d.mo}月${d.d}日` : "";
}
{
  const at = e => { const sc = $(".scrub"), rg = scrubRange(); if (!sc || !rg) return;
    const r = sc.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)), y = rg[0] + f * (rg[1] - rg[0]);
    scrollTo({top:y, behavior:"auto"}); sc.style.setProperty("--f", f.toFixed(4));
    const l = sc.querySelector(".sbl"), tx = scrubLabel(y); if (l.textContent !== tx) l.textContent = tx; };
  document.addEventListener("pointerdown", e => { const th = e.target.closest(".scrub.on .sth"); if (!th) return;
    e.preventDefault(); SCR.drag = true; SCR.rows = null; clearTimeout(SCR.t);
    const sc = th.closest(".scrub"); sc.classList.add("drag"); th.setPointerCapture(e.pointerId);
    sc.querySelector(".sbl").textContent = scrubLabel(scrollY); });
  document.addEventListener("pointermove", e => { if (SCR.drag) at(e); });
  const up = () => { if (!SCR.drag) return; SCR.drag = false; const sc = $(".scrub"); if (sc) sc.classList.remove("drag"); scrubSync(); };
  document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
}
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
    if (performance.now() - q.at >= 500) return;
    const si = +q.t.dataset.i;
    if (stkTap(si, e.target)) { STKT = performance.now(); return stackToggle(si); }
    openLb(si); }, true);
  document.addEventListener("pointercancel", () => { if (pt) clearTimeout(pt.lp); pt = null; }, true);
}
document.addEventListener("click", e => {
  const t = e.target.closest(".ph");
  if (t && SEL.on) { if (!e.detail) selFlip(+t.dataset.i); return; }   // 鍵盤按的才在這裡切換（手指、滑鼠在 pointerup）
  if (t && performance.now() - STKT < 600) return;
  if (t && stkTap(+t.dataset.i, e.target)) return e.detail ? undefined : stackToggle(+t.dataset.i);   // 滑鼠、手指在 pointerup 已經處理
  if (t) return openLb(+t.dataset.i);
  if (e.target.closest("[data-up]")) return SEL.on || upPick();
  { const wb = e.target.closest("[data-who]"); if (wb) return whoSet(wb.dataset.who); }
  if (e.target.closest("[data-sel]")) return selOn();
  if (SEL.on && e.target.closest("[data-ss],[data-mem]")) return;
  if (e.target.closest(".cue")) return scrollTo({top:$(".hero").offsetHeight - 8, behavior:anim() ? "smooth" : "auto"});
  { const zb = e.target.closest("[data-zb]"); if (zb) return zoomWall(ZL + +zb.dataset.zb, innerWidth / 2, innerHeight / 2); }
  if (e.target.closest("[data-ss]")) return show(0);
  { const dp = e.target.closest("[data-dplay]"); if (dp) return SEL.on || show(0, dp.dataset.dplay); }
  const mm = e.target.closest("[data-mem]");
  if (mm) return story(+mm.dataset.mem, mm.querySelector(".mring"));
  const ct = e.target.closest("[data-city]");
  if (ct) return citySet(ct.dataset.city);
  if (e.target.closest("[data-cityx]")) return citySet("");
  if (e.target.closest("[data-gearx]")) return gearSet("");
  if (e.target.closest("[data-find]")) return SEL.on || srchOpen();
  if (e.target.closest("[data-sqx]")) { SQ = ""; return whoSet(WHO, true); }
  { const gb = e.target.closest(".gear [data-gear]"); if (gb) return gearSet(gb.dataset.gear); }
  const m = e.target.closest(".mk");
  if (m && m.dataset.cl) return placeSheet(m.dataset.cl.split(",").map(Number));   // 好幾張疊在一起：先列出那裡拍的全部
  if (m) return openLb(+m.dataset.i, m.querySelector("img") || m);
  const hc = e.target.closest("[data-hl]");
  if (hc) return openLb(+hc.dataset.hl, hc.querySelector("img"));
});

/* 去過的城市：照片照城市分組（主機從拍攝地點查到的城市、國家） */
function citiesOf(){
  const by = new Map();
  ALL.forEach(p => {
    if (p.u || p.broken || !p.g) return;
    const k = cityKey(p); if (!k) return;
    let c = by.get(k);
    if (!c) { c = {k, c:p.p.c, cc:p.p.cc || "", ps:[], la:0, lo:0}; by.set(k, c); }
    c.ps.push(p); c.la += p.g[0]; c.lo += p.g[1];
  });
  const out = [...by.values()].map(c => {
    const ds = c.ps.map(p => pd(p.x.dt)).filter(Boolean).sort((a, b) => a.k < b.k ? -1 : 1);
    return {...c, la:c.la / c.ps.length, lo:c.lo / c.ps.length, d0:ds[0], d1:ds[ds.length - 1]};
  });
  return out.sort((a, b) => (a.d0 ? a.d0.k : "z") < (b.d0 ? b.d0.k : "z") ? -1 : 1);
}
function cityDates(a, b){
  if (!a) return "";
  const y = YR ? `${a.y}年` : "";
  if (!b || a.k === b.k) return `${y}${a.mo}月${a.d}日`;
  if (a.y === b.y && a.mo === b.mo) return `${y}${a.mo}月${a.d}－${b.d}日`;
  if (a.y === b.y) return `${y}${a.mo}月${a.d}日－${b.mo}月${b.d}日`;
  return `${a.y}年${a.mo}月－${b.y}年${b.mo}月`;
}
/* 同一趟旅行：有定位的照片日期連續（最多隔一天）、前後兩週以內，才畫路線、寫第幾天 */
function isTrip(){
  const ks = [...new Set(ALL.filter(p => p.g && !p.u).map(p => pd(p.x.dt)).filter(Boolean).map(d => Date.UTC(d.y, d.mo - 1, d.d) / 864e5))].sort((a, b) => a - b);
  if (ks.length < 2) return true;
  if (ks[ks.length - 1] - ks[0] > 14) return false;
  return ks.every((v, k) => !k || v - ks[k - 1] <= 2);
}
const flagImg = cc => /^[A-Z]{2}$/.test(cc) ? `<img class="flg" alt="" loading="lazy" src="/flag/${cc.toLowerCase()}.png">` : "";
function flagFix(root){ root.querySelectorAll("img.flg").forEach(f => f.addEventListener("error", () => f.remove(), {once:true})); }
function cityCards(cs){
  const box = $(".msec .cities"); if (!box) return;
  const sig = cs.map(c => `${c.k}${c.ps.length}${c.ps[0].i}`).join();
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.hidden = cs.length < 2;
  const dn = d => d ? Date.UTC(d.y, d.mo - 1, d.d) / 864e5 : null, ns = cs.flatMap(c => [dn(c.d0), dn(c.d1)]).filter(x => x !== null);
  const s0 = Math.min(...ns), sp = Math.max(...ns) - s0;
  // 這個城市在整本相簿的哪幾天（一條細線上的一段）
  const tl = c => sp > 0 && c.d0 ? `<i class="ctl" aria-hidden="true"><em style="left:${((dn(c.d0) - s0) / (sp + 1) * 100).toFixed(1)}%;width:${((dn(c.d1) - dn(c.d0) + 1) / (sp + 1) * 100).toFixed(1)}%"></em></i>` : "";
  box.innerHTML = cs.length < 2 ? "" : cs.map(c => {
    const pick = c.ps.filter(p => !isVid(p)).slice(0, 3), ims = (pick.length ? pick : c.ps.slice(0, 1));
    return `<button class="cty" data-city="${esc(c.k)}"><span class="ctc n${ims.length}">${ims.map(p => `<img alt="" loading="lazy" draggable="false" src="${src(p, "s")}">`).join("")}<i class="num">${I("photo")}${c.ps.length}</i></span>
      <span class="ctt"><b>${flagImg(c.cc)}<span>${esc(c.c)}</span></b><small class="num">${esc(cityDates(c.d0, c.d1))}</small>${tl(c)}</span></button>`;
  }).join("");
  flagFix(box);
}
function citySet(k){
  if (k === CITY) return;
  CITY = k;
  whoSet(WHO, true).then(() => { const w = $(".cityf"); if (w && !w.hidden) scrollTo({top:w.getBoundingClientRect().top + scrollY - 70, behavior:anim() ? "smooth" : "auto"}); });
}
function gearSet(k, keep){
  if (k === GEAR) { if (keep) return; k = ""; }
  GEAR = k;
  whoSet(WHO, true).then(() => { const w = $(".cityf"); if (w && !w.hidden) scrollTo({top:w.getBoundingClientRect().top + scrollY - 70, behavior:anim() ? "smooth" : "auto"}); });
}
/* 器材：這本用了哪幾台相機、哪幾顆鏡頭、常用的焦段（點了只看那台／那顆拍的） */
const FOCB = [[0, 20, "超廣角"], [20, 35, "廣角"], [35, 70, "標準"], [70, 135, "中望遠"], [135, 1e9, "望遠"]];
function gear(){
  const box = $(".gear"); if (!box) return;
  const base = ALL.filter(p => (p.u || "") === WHO && (!CITY || cityKey(p) === CITY) && !isVid(p)), cams = {}, lens = {}, fb = FOCB.map(() => 0), fl = {};
  base.forEach(p => { const c = camName(p.x), l = lensName(p.x), f = p.x.f35 || 0;
    if (c) cams[c] = (cams[c] || 0) + 1; if (l) lens[l] = (lens[l] || 0) + 1;
    if (f) { fb[FOCB.findIndex(b => f >= b[0] && f < b[1])]++; fl[f] = (fl[f] || 0) + 1; } });
  const cs = Object.entries(cams).sort((a, b) => b[1] - a[1]), ls = Object.entries(lens).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const nf = fb.reduce((a, b) => a + b, 0), top = Object.entries(fl).sort((a, b) => b[1] - a[1])[0], mx = Math.max(1, ...fb);
  box.hidden = cs.reduce((a, c) => a + c[1], 0) < 3 || (cs.length < 2 && ls.length < 2 && fb.filter(Boolean).length < 2);   // 只有一台相機、一顆鏡頭、一種焦段：沒得選就不列
  if (box.hidden) { box.innerHTML = ""; return; }
  const n0 = cs[0][1];
  box.innerHTML = `<div class="mh"><b>器材</b><span class="num">${cs.length} 台相機${ls.length ? `・${Object.keys(lens).length} 顆鏡頭` : ""}</span></div>
    <div class="gcams">${cs.slice(0, 6).map(([c, n]) => `<button class="gcam${GEAR === "c:" + c ? " on" : ""}" data-gear="c:${esc(c)}"><i class="gic">${I("cam")}</i><span class="gt2"><b>${esc(c)}</b><small class="num">${n} 張</small></span><span class="gbr"><i style="width:${(n / n0 * 100).toFixed(1)}%"></i></span></button>`).join("")}</div>
    ${ls.length > 1 || (ls.length && cs.length > 1) ? `<div class="glens">${ls.map(([l, n]) => `<button class="chip${GEAR === "l:" + l ? " on" : ""}" data-gear="l:${esc(l)}">${I("lens")}<span>${esc(l)}</span><small class="num">${n}</small></button>`).join("")}</div>` : ""}
    ${nf >= 3 ? `<div class="gfoc"><div class="gfh"><small>常用焦段</small>${top ? `<b class="num">${top[0]} mm</b>` : ""}</div><div class="gfc">${FOCB.map((b, k) => `<div class="${fb[k] === mx ? "top" : ""}"><span><i style="height:${fb[k] ? Math.max(8, fb[k] / mx * 100).toFixed(0) : 0}%"></i></span><b class="num">${fb[k] || ""}</b><small>${b[2]}</small></div>`).join("")}</div></div>` : ""}`;
}
function citybar(){
  const b = $(".cityf"); if (!b) return;
  const c = CITY && citiesOf().find(x => x.k === CITY);
  b.hidden = !c && !GEAR && !SQ;
  b.innerHTML = (SQ ? `<button class="chip on" data-find>${I("find")}<span>${esc(SQ)}</span><small class="num">${PH.length} 張</small></button><button class="chip" data-sqx>${I("x")}<span>全部照片</span></button>` : "") + (c ? `<span class="chip on">${flagImg(c.cc)}<span>${esc(c.c)}</span><small class="num">${c.ps.length} 張</small></span><button class="chip" data-cityx>${I("x")}<span>全部城市</span></button>` : "")
    + (GEAR ? `<span class="chip on">${I(GEAR[0] === "c" ? "cam" : "lens")}<span>${esc(GEAR.slice(2))}</span><small class="num">${PH.length} 張</small></span><button class="chip" data-gearx>${I("x")}<span>全部器材</span></button>` : "");
  flagFix(b);
}

/* 地圖：同一趟旅行畫走過的路線；不是的話每個城市一顆（不連線），只有一個城市就標拍照的點 */
function bigMap(){
  const el = $("[data-map]"); if (!el || WHO) return;
  const cs = citiesOf(), trip = isTrip(), byCity = !trip && cs.length > 1;
  cityCards(cs);
  const mt = $("[data-mt]"); if (mt) mt.textContent = trip ? "旅程" : cs.length > 1 ? "去過的城市" : "拍照的地方";
  const pts = byCity ? cs.map(c => [{g:[c.la, c.lo]}, ALL.indexOf(c.ps[0]), c]) : PH.map((p, i) => [p, i]).filter(([p]) => p.g && !p.broken);
  const W = el.clientWidth, H = el.clientHeight;
  if (!pts.length || !W) return;
  // 手機上下捲時網址列縮放會觸發 resize：大小、內容都沒變就不重畫（以前整張地圖、城市卡片重新淡入，看起來在閃）
  const sig = `${W}x${H}|${byCity ? cs.map(c => c.k + c.ps.length).join() : pts.map(([p, i]) => i).join()}|${trip}`;
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  let z = byCity ? 12 : 15;
  for (; z > 2; z--) {
    const xs = pts.map(([p]) => lx(p.g[1], z)), ys = pts.map(([p]) => ly(p.g[0], z));
    if (Math.max(...xs) - Math.min(...xs) <= W - 130 && Math.max(...ys) - Math.min(...ys) <= H - 130) break;
  }
  if (pts.length === 1) z = byCity ? 10 : 13;
  const xs = pts.map(([p]) => lx(p.g[1], z)), ys = pts.map(([p]) => ly(p.g[0], z));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  el.innerHTML = `<span class="attr">© OpenStreetMap</span>`;
  el.classList.toggle("bycity", byCity);
  tiles(el, cx, cy, z, W, H);
  if (byCity) {
    const ps = pts.map((x, k) => ({x:xs[k] - cx + W / 2, y:ys[k] - cy + H / 2}));
    for (let n = 0; n < 40; n++) {             // 靠太近的城市互相推開，泡泡和名字不疊在一起
      let mv = 0;
      ps.forEach((a, i) => ps.forEach((b, j) => {
        if (j <= i) return;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, need = 96;
        if (d >= need) return;
        const f = (need - d) / 2, ux = d > .02 ? dx / d : 1, uy = d > .02 ? dy / d : 0;
        a.x -= ux * f; a.y -= uy * f; b.x += ux * f; b.y += uy * f; mv = 1;
      }));
      ps.forEach(q => { q.x = Math.max(40, Math.min(W - 40, q.x)); q.y = Math.max(36, Math.min(H - 50, q.y)); });
      if (!mv) break;
    }
    el.insertAdjacentHTML("beforeend", pts.map(([, , c], k) => `<button class="mk cmk" data-city="${esc(c.k)}" style="left:${ps[k].x.toFixed(1)}px;top:${ps[k].y.toFixed(1)}px;animation-delay:${Math.min(k * 60, 600)}ms"><img alt="" loading="lazy" src="${src(c.ps[0], "s")}"><i class="num">${c.ps.length}</i><em>${esc(c.c)}</em></button>`).join(""));
    const kmEl = $("[data-km]"); if (kmEl) kmEl.textContent = `${cs.length} 個城市`;
    el.parentNode.querySelectorAll(".tmac").forEach(x => x.remove());
    return;
  }
  const cl = [];
  pts.forEach(([p, i], k) => {
    const x = xs[k] - cx + W / 2, y = ys[k] - cy + H / 2, c = cl.find(c => Math.hypot(c.x - x, c.y - y) < 46);
    if (c) { c.n++; c.ids.push(i); } else cl.push({x, y, i, n:1, ids:[i]});
  });
  el.insertAdjacentHTML("beforeend", cl.map((c, k) => `<button class="mk" data-i="${c.i}"${c.n > 1 ? ` data-cl="${c.ids.join(",")}"` : ""} style="left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px;animation-delay:${Math.min(k * 40, 600)}ms"><img alt="" loading="lazy" src="${src(PH[c.i], "s")}">${c.n > 1 ? `<i class="num">${c.n}</i>` : ""}</button>`).join(""));
  if (trip) route(el, pts.map(([p, i], k) => ({x:xs[k] - cx + W / 2, y:ys[k] - cy + H / 2, g:p.g, d:pd(p.x.dt), i})), W, H);
  else { el.parentNode.querySelectorAll(".tmac").forEach(x => x.remove()); const kmEl = $("[data-km]"); if (kmEl) kmEl.textContent = `${cl.length} 個地方`; }
}

/* 旅程路線：照拍攝時間把地點連起來，捲到時一筆畫出來，再有一個亮點沿著走 */
function route(el, pts, W, H){
  let km = 0;
  for (let k = 1; k < pts.length; k++) {
    const [a1, o1] = pts[k - 1].g, [a2, o2] = pts[k].g, r = Math.PI / 180;
    const h = Math.sin((a2 - a1) * r / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin((o2 - o1) * r / 2) ** 2;
    km += 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const sk = $("[data-skm]");
  if (sk && km >= 1) { sk.hidden = false; const b = sk.querySelector("b"); b.dataset.n = km >= 100 ? Math.round(km) : +km.toFixed(1); if (!STIO) b.textContent = b.dataset.n; }
  const kmEl = $("[data-km]");
  if (kmEl) kmEl.textContent = km >= 1 ? `走了約 ${km >= 100 ? Math.round(km) : +km.toFixed(1)} 公里` : km >= .05 ? `走了約 ${Math.round(km * 1000 / 10) * 10} 公尺` : `${pts.length} 個地點`;
  const r = [];
  pts.forEach(q => { const l = r[r.length - 1]; if (!l || Math.hypot(l.x - q.x, l.y - q.y) > 14) r.push(q); else if (q.d && (!l.d || l.d.k !== q.d.k)) l.d = q.d; q.ri = r.length - 1; });
  if (r.length < 2) { el.parentNode.querySelectorAll(".tmac").forEach(x => x.remove()); return; }
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
  /* 照片、第幾天等線畫到那裡才跳出來（線是 cubic-bezier(.45,0,.2,1) 畫 2.4 秒，反推到那一點的時間） */
  const smp = []; for (let k = 0; k <= 160; k++) { const q = path.getPointAtLength(len * k / 160); smp.push([q.x, q.y, k / 160]); }
  const fracAt = (x, y) => smp.reduce((b, q) => { const d = Math.hypot(q[0] - x, q[1] - y); return d < b[0] ? [d, q[2]] : b; }, [1e9, 0])[1];
  const bz = t => { const u = 1 - t; return [3 * u * u * t * .45 + 3 * u * t * t * .2 + t ** 3, 3 * u * t * t + t ** 3]; };   // 回傳 [x(時間), y(進度)]
  const tAt = f => { let lo = 0, hi = 1; for (let n = 0; n < 24; n++) { const m = (lo + hi) / 2; if (bz(m)[1] < f) lo = m; else hi = m; } return bz(lo)[0]; };
  el.classList.add("trip");
  el.querySelectorAll(".mk").forEach(m => { m.style.animationDelay = `${Math.max(0, tAt(fracAt(parseFloat(m.style.left), parseFloat(m.style.top))) * 2.4 - .12).toFixed(2)}s`; });
  el.querySelectorAll(".dayn").forEach(m => { m.style.transitionDelay = `${(tAt(fracAt(parseFloat(m.style.left), parseFloat(m.style.top))) * 2.4).toFixed(2)}s`; });
  el.insertAdjacentHTML("beforeend", `<button class="rplay" data-replay aria-label="重播旅程">${I("again")}</button>`);
  const go = () => { el.classList.add("drawn"); setTimeout(() => { const m = el.querySelector("animateMotion"); try { m && m.beginElement(); } catch (e) {} }, anim() ? 2400 : 0); };
  if (pts.length >= 5) tmac(el, pts, r, path, len); else el.parentNode.querySelectorAll(".tmac").forEach(x => x.remove());
  el.querySelector("[data-replay]").addEventListener("click", () => {   // 重播：線收回去、照片縮回去，再畫一次
    if (el.tmReset) el.tmReset();
    el.classList.remove("drawn");
    el.querySelectorAll(".mk").forEach(m => { m.style.animationName = "none"; });
    void el.offsetWidth;
    el.querySelectorAll(".mk").forEach(m => { m.style.animationName = ""; });
    requestAnimationFrame(() => requestAnimationFrame(go));
  });
  if (!anim() || !("IntersectionObserver" in window)) return go();
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, {threshold:.35});
  io.observe(el);
}

/* 旅程時光機：地圖下面一條時間軸，拖到哪路線就畫到哪、那時候拍的照片浮在地圖上；也可以按播放自己走一遍 */
function tmac(el, pts, r, path, len){
  const sec = el.parentNode, n = pts.length;
  sec.querySelectorAll(".tmac").forEach(x => x.remove());
  const svg = el.querySelector(".route"), seg = document.createElementNS("http://www.w3.org/2000/svg", "path"), cum = [0];
  svg.appendChild(seg);
  for (let k = 0; k < r.length - 1; k++) {                    // 每一段的長度：跟路線一樣的曲線，加起來就是走到第幾個點時畫到哪
    const p0 = r[k - 1] || r[k], p1 = r[k], p2 = r[k + 1], p3 = r[k + 2] || p2;
    seg.setAttribute("d", `M${p1.x} ${p1.y} C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`);
    cum.push(cum[k] + seg.getTotalLength());
  }
  seg.remove();
  const tot = cum[cum.length - 1] || 1, fr = pts.map(q => cum[q.ri] / tot);
  const ord = new Map(pts.map((q, k) => [q.i, k])), mks = [...el.querySelectorAll(".mk")].map(m => [m, Math.min(...(m.dataset.cl ? m.dataset.cl.split(",") : [m.dataset.i]).map(i => ord.get(+i) ?? 1e9))]);
  const days = [];
  pts.forEach((q, k) => { if (q.d && (!days.length || days[days.length - 1].d.k !== q.d.k)) days.push({d:q.d, k}); });
  el.insertAdjacentHTML("beforeend", `<button class="tmb" aria-label="看這張"><img alt="" draggable="false"><img alt="" draggable="false"></button>`);
  el.insertAdjacentHTML("afterend", `<div class="tmac"><button class="tmp" aria-label="播放旅程">${I("play")}</button>
    <div class="tmt" role="slider" tabindex="0" aria-label="旅程時間" aria-valuemin="1" aria-valuemax="${n}"><div class="tmr"><i class="tmf"></i></div>${days.length > 1 ? days.map((x, j) => `<span class="tmd num" style="left:${(x.k / (n - 1) * 100).toFixed(2)}%">${j + 1}</span>`).join("") : ""}<i class="tmh"></i></div>
    <div class="tml"><b class="num"></b><span></span></div></div>`);
  const box = el.nextElementSibling, bar = box.querySelector(".tmt"), fill = box.querySelector(".tmf"), hd = box.querySelector(".tmh"), lab = box.querySelector(".tml"), play = box.querySelector(".tmp");
  const bub = el.querySelector(".tmb"), ims = bub.querySelectorAll("img");
  let at = n - 1, shown = -1, run = 0, flip = 0;
  const DN = {};
  days.forEach((x, j) => { DN[x.d.k] = j + 1; });
  function set(k, from){
    at = Math.max(0, Math.min(n - 1, k));
    const a = Math.floor(at), b = Math.min(n - 1, a + 1), f = fr[a] + (fr[b] - fr[a]) * (at - a), idx = Math.round(at), q = pts[idx], p = PH[q.i];
    if (!el.classList.contains("tm")) { el.classList.add("tm"); }
    path.style.strokeDashoffset = (len * (1 - f)).toFixed(1);
    const pt = path.getPointAtLength(len * f);
    bub.style.transform = `translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px)`;
    fill.style.transform = `scaleX(${n > 1 ? at / (n - 1) : 1})`; hd.style.left = `${(n > 1 ? at / (n - 1) * 100 : 100).toFixed(2)}%`;
    bar.setAttribute("aria-valuenow", idx + 1);
    if (idx !== shown) {
      shown = idx; flip ^= 1;
      const nx = ims[flip], od = ims[flip ^ 1];
      nx.classList.remove("ok"); nx.src = src(p, "s");
      const on = () => { nx.classList.add("ok"); od.classList.remove("ok"); };
      nx.complete && nx.naturalWidth ? on() : nx.onload = on;
      mks.forEach(([m, o]) => m.classList.toggle("fut", o > idx));
      const d = p.x.dtf ? null : pd(p.x.dt);
      lab.querySelector("b").textContent = d ? `${days.length > 1 ? `第 ${DN[d.k] || 1} 天・` : ""}${ftod(p, d)}` : "";
      lab.querySelector("span").textContent = p.p ? p.p.n : "";
      if (from !== "play" && anim()) lab.animate([{opacity:.4}, {opacity:1}], {duration:T.fast, easing:DEC});
    }
  }
  function stop(){ run = 0; play.innerHTML = I("play"); play.setAttribute("aria-label", "播放旅程"); box.classList.remove("run"); }
  function go(){                                              // 自己走一遍：一張大約 0.35 秒，最短 6 秒、最長 24 秒
    if (run) return stop();
    if (at >= n - 1) set(0, "play");
    const t0 = performance.now(), k0 = at, D0 = Math.max(6000, Math.min(24000, n * 350)) * (1 - k0 / (n - 1 || 1)), me = run = Math.random() + 1;
    play.innerHTML = I("pause"); play.setAttribute("aria-label", "暫停"); box.classList.add("run");
    const step = now => {
      if (run !== me || !el.isConnected) return;
      const u = Math.min(1, (now - t0) / (D0 || 1));
      set(k0 + (n - 1 - k0) * u, "play");
      if (u < 1) requestAnimationFrame(step); else stop();
    };
    requestAnimationFrame(step);
  }
  const kx = e => { const b = bar.getBoundingClientRect(); return (e.clientX - b.left) / b.width * (n - 1); };
  bar.addEventListener("pointerdown", e => {
    stop(); bar.setPointerCapture(e.pointerId); box.classList.add("drag");
    const target = kx(e), k0 = at, t0 = performance.now();
    if (anim() && Math.abs(target - k0) > 1) {                  // 點一下：滑過去，不直接跳
      const me = run = -Math.random() - 1;
      const step = now => { if (run !== me) return; const u = Math.min(1, (now - t0) / T.mid), ez = 1 - (1 - u) ** 3; set(k0 + (target - k0) * ez); if (u < 1) requestAnimationFrame(step); else run = 0; };
      requestAnimationFrame(step);
    } else set(target);
  });
  bar.addEventListener("pointermove", e => { if (!bar.hasPointerCapture(e.pointerId)) return; run = 0; set(kx(e)); });
  const up = e => { if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId); box.classList.remove("drag"); };
  bar.addEventListener("pointerup", up); bar.addEventListener("pointercancel", up);
  bar.addEventListener("keydown", e => { const d = {ArrowRight:1, ArrowUp:1, ArrowLeft:-1, ArrowDown:-1}[e.key]; if (d) { e.preventDefault(); stop(); set(Math.round(at) + d); } });
  play.addEventListener("click", go);
  bub.addEventListener("click", () => openLb(pts[Math.round(at)].i, bub.querySelector("img.ok") || bub));
  el.tmReset = () => { stop(); el.classList.remove("tm"); path.style.strokeDashoffset = ""; mks.forEach(([m]) => m.classList.remove("fut")); shown = -1; at = n - 1; fill.style.transform = ""; hd.style.left = ""; lab.querySelector("b").textContent = ""; lab.querySelector("span").textContent = ""; };
}

/* ═════════ 看大圖 ═════════ */
let LB = null;
const GAPX = 28;
function openLb(i, from){
  if (LB) { if (LB.closing && LB.kill) LB.kill(); else return; }   // 上一張還在收：直接收完，這次點的照樣打開
  const el = document.createElement("div");
  el.className = "lb";
  const STRIP = matchMedia("(pointer:fine) and (min-width:900px)").matches && PH.length > 1;
  el.className = STRIP ? "lb strip" : "lb";
  el.innerHTML = `<div class="bg"></div><div class="stage"><div class="track"></div></div>
    <div class="lbt"><button class="rb" data-x aria-label="關閉">${I("x")}</button><span class="cnt num"></span><button class="rb lvb" data-lv aria-label="原況">${I("live")}</button><button class="rb" data-ssi aria-label="從這張開始播放">${I("play")}</button><button class="rb" data-shr aria-label="分享這張">${I("shr")}</button><button class="rb" data-inf aria-label="照片資訊">${I("info")}</button><button class="rb" data-del hidden aria-label="刪掉">${I("trash")}</button>${D.dl ? `<a class="rb" data-dl download aria-label="${D.dl > 1 ? "下載原圖" : "下載"}">${I("dl")}</a>` : ""}</div>
    <button class="rb nav l" aria-label="上一張">${I("l")}</button><button class="rb nav r" aria-label="下一張">${I("r")}</button>
    <div class="lbb"><div class="vbar"><button class="vpp" data-vpp aria-label="播放">${I("play")}</button><span class="vt0 num">0:00</span><div class="vtr" data-vseek><i></i></div><span class="vt1 num"></span><button class="vpp" data-vmu aria-label="聲音">${I("snd")}</button></div>
      <div class="lbr"><div class="cap"><b></b><span></span></div>${D.talk ? `<button class="sb" data-lk aria-label="愛心（按住選其他表情）">${I("heart")}<span class="num"></span></button><button class="sb rxb" data-rx aria-label="其他表情" hidden>${I("smile")}<span class="num"></span></button><button class="sb" data-cm aria-label="留言">${I("chat")}<span class="num"></span></button>` : ""}</div></div><div class="inf"></div>${STRIP ? `<div class="lbs"><div class="lbsr">${PH.map((p, k) => `<button class="lbst" data-go="${k}" aria-label="第 ${k + 1} 張"><img alt="" loading="lazy" draggable="false" src="${src(p, "s")}"></button>`).join("")}</div></div>` : ""}`;
  document.body.appendChild(el);
  document.documentElement.style.overflow = "hidden";
  const stage = $(".stage", el), track = $(".track", el), bg = $(".bg", el), inf = $(".inf", el);
  const S = {el, i, z:{s:1, x:0, y:0}, info:false, busy:null, from:from && from.isConnected ? from : null, fi:i};
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
    const rb = $("[data-rx]", el), rn = Object.values(p.rx || {}).reduce((a, b) => a + b, 0);
    rb.classList.toggle("on", !!p.mr); rb.querySelector("svg, .rxe").outerHTML = p.mr ? `<i class="rxe">${p.mr}</i>` : I("smile");
    rb.querySelector(".num").textContent = rn || "";
    if (rb.hidden !== !rn && !(rb.out && !rn)) {              // 其他表情：有人按過才出現（平常按住愛心選），拿掉時縮小淡出
      if (rb.out) { rb.out.cancel(); rb.out = null; }
      if (rn || !anim()) { rb.hidden = !rn; if (rn && anim()) rb.animate([{opacity:0, transform:"scale(.6)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC}); }
      else { rb.out = rb.animate([{opacity:1}, {opacity:0, transform:"scale(.6)"}], {duration:T.fast, easing:EXIT, fill:"forwards"}); rb.out.finished.then(() => { rb.hidden = true; rb.out.cancel(); rb.out = null; }, () => {}); }
    } else if (rn && rb.out) { rb.out.cancel(); rb.out = null; }
    cm.querySelector("span").textContent = (p.cm || []).length || "";
    const th = $(".italk .th", el), h = talkHead(p);           // 資訊裡的「誰按了愛心」跟著換（文字變了才換、淡入）
    if (th && th.dataset.v !== h) { const was = th.dataset.v != null; th.innerHTML = h; th.dataset.v = h; if (was && anim()) [...th.children].slice(1).forEach(x => x.animate([{opacity:0, transform:"translateY(3px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC})); }
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
    const cl = capLine(p);
    $(".cap span", el).textContent = cam && !cl.includes(cam) ? `${cl}${cl ? "・" : ""}${cam}` : cl;
    if (moved && S.at0 && anim()) $(".cap", el).animate([{opacity:.25, transform:"translateY(3px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC});
    const del = $("[data-del]", el); del.hidden = !p.um; if (moved) del.classList.remove("arm");
    const dl = $("[data-dl]", el); if (dl) dl.href = src(p, "o");
    $(".nav.l", el).disabled = S.i === 0; $(".nav.r", el).disabled = S.i === PH.length - 1;
    if (S.info && (moved || !inf.firstChild)) { inf.innerHTML = infoHTML(p); infoMap(); }   // 同一張不重畫：安卓跳出鍵盤會改畫面大小，重畫會把正在打字的留言框收掉
    TILES.forEach((t, k) => t.classList.toggle("gone", k === S.i));
    if (moved) { amb(p); stripAt(); }
  }
  function amb(p){                                           // 後面透出這張的顏色：糊開的小圖，換張時慢慢變過去
    if (p.broken) return;
    const im = document.createElement("img"); im.className = "amb"; im.alt = ""; im.src = p.q ? `data:image/jpeg;base64,${p.q}` : src(p, "s");
    bg.appendChild(im);
    const old = [...bg.querySelectorAll(".amb")].slice(0, -1);
    const on = () => { im.classList.add("ok"); setTimeout(() => old.forEach(o => o.remove()), T.slow + 100); };
    im.complete && im.naturalWidth ? requestAnimationFrame(on) : im.addEventListener("load", on, {once:true});
  }
  function stripAt(){                                        // 下面那排小圖：這張亮起來、捲到中間
    const r = $(".lbsr", el); if (!r) return;
    r.querySelectorAll(".on").forEach(x => x.classList.remove("on"));
    const b = r.children[S.i]; if (!b) return;
    b.classList.add("on");
    const box = r.parentNode, x = b.offsetLeft + b.offsetWidth / 2 - box.clientWidth / 2;
    box.scrollTo({left:x, behavior:S.at0 && anim() ? "smooth" : "auto"}); S.at0 = 1;
  }
  function jump(n){                                          // 點小圖直接跳過去：淡一下換好
    if (n === S.i || n < 0 || n >= PH.length) return;
    finish(); stopAll(); setZoom(1, 0, 0);
    S.i = n; setAll();
    if (anim()) sl[1].animate([{opacity:0, transform:"scale(.97)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC});
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
  const t0 = S.from || tileOf(i), r0 = t0.getBoundingClientRect(), f0 = fit(PH[i]);
  if (anim()) {
    const a0 = toTile(r0, f0);
    cur().animate([{transform:a0.t, clipPath:a0.c}, {transform:"translate(0px,0px) scale(1)", clipPath:NOCLIP}], {duration:T.mid + 60, easing:DEC});
    bg.animate([{opacity:0}, {opacity:1}], {duration:T.mid, easing:EASE, fill:"forwards"});
    el.querySelectorAll(".lbt,.lbb,.nav,.lbs").forEach(x => x.animate([{opacity:0}, {opacity:1}], {duration:T.mid, delay:T.fast, easing:EASE, fill:"backwards"}));
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
    const p = PH[S.i], back = S.from && S.i === S.fi && S.from.isConnected, t = back ? S.from : tileOf(S.i);   // 從精選、地圖打開的：同一張就縮回原本那裡
    let r = t.getBoundingClientRect();
    if (!back && (r.bottom < 0 || r.top > innerHeight)) { t.scrollIntoView({block:"center"}); r = t.getBoundingClientRect(); }
    const zw = cur(), f = fit(p), now = getComputedStyle(zw).transform;
    stopAll();
    let gone = false;
    const end = () => { if (gone) return; gone = true; el.remove(); TILES.forEach(x => x.classList.remove("gone")); document.documentElement.style.overflow = ""; if (LB === S) LB = null; onScroll(); };
    S.kill = end; el.style.pointerEvents = "none";
    if (!anim()) return end();
    setTimeout(end, T.mid + 200);                              // 安卓返回手勢時動畫有時不會結束：時間到一定收掉
    el.querySelectorAll(".lbt,.lbb,.nav,.inf,.lbs").forEach(x => { x.style.opacity = 0; });
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
    const p = PH[S.i], pb = $("[data-pal]", inf);
    if (pb && !p.pal) palette(p).then(() => { if (pb.isConnected && PH[S.i] === p) { pb.innerHTML = palHTML(p); const hg = pb.querySelector(".ihist svg"); if (hg && anim()) hg.animate([{opacity:0, transform:"scaleY(.2)"}, {opacity:1, transform:"none"}], {duration:T.slow, easing:DEC}); if (anim()) pb.querySelectorAll(".pbar i").forEach((x, k) => x.animate([{opacity:0, transform:"scaleX(.4)"}, {opacity:1, transform:"none"}], {duration:T.slow, delay:k * 50, easing:DEC, fill:"backwards"})); } });
    const m = $(".imap", inf); if (!m || !p.g) return;
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

  {                                                          // 按住愛心：跳出其他表情
    let ht = 0;
    el.addEventListener("pointerdown", e => { const b = e.target.closest("[data-lk]"); if (!b) return; clearTimeout(ht); ht = setTimeout(() => { S.rxHold = performance.now(); rxPick(S.i, b, social); }, 420); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(t => el.addEventListener(t, () => clearTimeout(ht)));
  }
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
    if (e.target.closest("[data-lk]")) return performance.now() - (S.rxHold || 0) < 800 ? undefined : like(S.i, e.target.closest("[data-lk]"), social);
    if (e.target.closest("[data-rx]")) return rxPick(S.i, e.target.closest("[data-rx]"), social);
    if (e.target.closest("[data-cm]")) { if (!S.info) setInfo(true); setTimeout(() => { const t = $(".italk", inf); if (t) t.scrollIntoView({behavior:anim() ? "smooth" : "auto", block:"start"}); }, S.info ? 0 : T.mid); return; }
    if (e.target.closest(".nav.l")) return go(-1);
    if (e.target.closest(".nav.r")) return go(1);
    const gb = e.target.closest("[data-go]"); if (gb) return jump(+gb.dataset.go);
    if (e.target.closest("[data-shr]")) return shareOne(PH[S.i]);
  });
  inf.addEventListener("click", e => {
    const gb = e.target.closest("[data-gear]");                // 點相機、鏡頭：關掉大圖，照片牆只看那台拍的
    if (gb) { lbBack(S); setTimeout(() => gearSet(gb.dataset.gear, true), anim() ? T.mid + 60 : 0); return; }
    const rp = e.target.closest("[data-crep]");                // 回覆：輸入框上面寫「回覆 某某」
    if (rp) { const f = $(".cform", inf), b = $(".cre", f); cOpen(f, 1); f.dataset.re = rp.dataset.crep; b.querySelector("span").textContent = `回覆 ${rp.dataset.cn}`; b.hidden = false;
      if (anim()) b.animate([{opacity:0, transform:"translateY(4px)"}, {opacity:1, transform:"none"}], {duration:T.fast, easing:DEC});
      const tx = f.querySelector("[name=s]"); tx.placeholder = `回覆 ${rp.dataset.cn}…`; tx.focus(); return; }
    const cm = e.target.closest(".cmt");                       // 點一則留言才露出「回覆」
    if (cm && !e.target.closest("button")) { inf.querySelectorAll(".cmt.on").forEach(x => { if (x !== cm) x.classList.remove("on"); }); cm.classList.toggle("on"); return; }
    if (e.target.closest("[data-crex]")) { const f = $(".cform", inf); delete f.dataset.re; $(".cre", f).hidden = true; f.querySelector("[name=s]").placeholder = "說點什麼…"; return; }
    const del = e.target.closest("[data-cdel]");
    if (del) talk(S.i, {del:del.dataset.cdel}).then(async ok => {    // 刪掉的那則（連同回覆）收起來，再換上新的
      if (!ok) return;
      const box = inf.querySelector(".italk"), gone = [...box.querySelectorAll(".cmt")].filter(c => !(PH[S.i].cm || []).some(x => x.id === c.dataset.cid));
      if (anim() && gone.length) await Promise.all(gone.map(c => (c.style.overflow = "hidden", c).animate([{opacity:1, height:c.offsetHeight + "px"}, {opacity:0, height:"0px", paddingTop:0, paddingBottom:0}], {duration:T.mid, easing:EXIT, fill:"forwards"}).finished.catch(() => {})));
      box.outerHTML = talkHTML(PH[S.i], !box.querySelector(".cform.fold")); social();
    });
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
    const sb = f.querySelector(".csend"); if (sb.disabled) return;
    sb.disabled = true;
    const re = f.dataset.re || "";
    talk(S.i, re ? {s:tx.value, n:name, re} : {s:tx.value, n:name}).then(ok => {
      sb.disabled = false;
      if (!ok) return;
      const box = inf.querySelector(".italk"); box.outerHTML = talkHTML(PH[S.i], 1); social();   // 剛留完：輸入框留著，可以接著寫
      const cm = PH[S.i].cm || [], nw = cm[cm.length - 1];
      const last = nw && inf.querySelector(`.italk .cmt[data-cid="${nw.id}"]`); if (last && anim()) last.animate([{opacity:0, transform:"translateY(8px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC});
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
    Object.assign(PH[i], {lk:d.lk, me:d.me, cm:d.cm, rx:d.rx || {}, mr:d.mr || "", lkn:d.lkn || []});
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
/* 愛心以外的表情：一支手機一個，再按一次同一個就拿掉（跟主機的 ALB_RX 一樣） */
const RXS = ["😂", "😮", "👍", "🥹"];
let RXP = null;
function rxPick(i, btn, after){
  if (RXP && RXP.box.isConnected) return RXP.close();
  RXP = null;
  const p = PH[i], box = document.createElement("div");
  box.className = "rxp"; box.setAttribute("role", "menu");
  box.innerHTML = RXS.map((e, k) => `<button class="${p.mr === e ? "on" : ""}" data-rxe="${e}" style="--i:${k}" aria-label="${e}">${e}</button>`).join("");
  btn.closest(".lb").appendChild(box);
  const r = btn.getBoundingClientRect(), bw = box.offsetWidth;
  box.style.left = Math.max(8, Math.min(innerWidth - bw - 8, r.left + r.width / 2 - bw / 2)) + "px";
  box.style.top = Math.max(8, r.top - box.offsetHeight - 10) + "px";
  if (anim()) box.animate([{opacity:0, transform:"translateY(8px) scale(.9)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC});
  const away = e => { if (!box.contains(e.target)) close(); };
  const close = () => { if (RXP !== o) return; RXP = null; document.removeEventListener("pointerdown", away, true);
    if (!anim()) return box.remove();
    box.animate([{opacity:1}, {opacity:0, transform:"translateY(6px) scale(.94)"}], {duration:T.fast, easing:EXIT, fill:"forwards"}).finished.then(() => box.remove(), () => box.remove()); };
  const o = RXP = {close, box};
  setTimeout(() => document.addEventListener("pointerdown", away, true));
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-rxe]"); if (!b) return;
    const em = b.dataset.rxe, was = {rx:{...(p.rx || {})}, mr:p.mr || ""};
    const rx = p.rx = {...(p.rx || {})};
    if (p.mr) { rx[p.mr] = Math.max(0, (rx[p.mr] || 1) - 1); if (!rx[p.mr]) delete rx[p.mr]; }
    p.mr = p.mr === em ? "" : em; if (p.mr) rx[p.mr] = (rx[p.mr] || 0) + 1;
    after(); badge(i);
    if (p.mr && anim()) { const f = document.createElement("i"); f.className = "rxfly"; f.textContent = em; const r2 = b.getBoundingClientRect(); f.style.left = r2.left + r2.width / 2 + "px"; f.style.top = r2.top + "px"; document.body.appendChild(f);
      f.animate([{opacity:1, transform:"translate(-50%,0) scale(1)"}, {opacity:0, transform:"translate(-50%,-90px) scale(1.8)"}], {duration:T.slow * 1.4, easing:DEC}).finished.then(() => f.remove(), () => f.remove()); }
    close();
    talk(i, {rx:em}).then(ok => { if (!ok) Object.assign(p, was); after(); badge(i); });
  });
}
function lkWho(p){                                             // 「小明、小美 等 5 人」：沒留過名字的只算人數
  const ns = (p.lkn || []).slice(0, 2), n = p.lk || 0;
  if (!ns.length) return String(n);
  return esc(ns.join("、")) + (n > ns.length ? ` 等 ${n} 人` : "");
}
/* 留言的輸入框平常收著，按了「留言」才展開（要用的時候才出現） */
function cOpen(f, nofocus){
  if (!f || !f.classList.contains("fold")) return;
  const b = f.previousElementSibling;
  f.classList.remove("fold");
  if (b && b.matches("[data-cadd]")) b.hidden = true;
  if (anim()) f.animate([{opacity:0, transform:"translateY(-6px) scale(.98)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC});
  if (nofocus) return;
  const nm = f.querySelector("[name=n]");
  (nm && !nm.value ? nm : f.querySelector("[name=s]")).focus();
}
document.addEventListener("click", e => { const b = e.target.closest("[data-cadd]"); if (b) cOpen(b.nextElementSibling); });
/* 留言簿：在最後給整本留一句話 */
const GB = "_gb", GBSEEN = new Set();                           // GBSEEN：看過的留言不再重播進場動畫
function gbook(open){
  const box = $(".gbk"); if (!box) return;
  if (open === undefined) open = !!box.querySelector(".gbf:not(.fold)");   // 本來打開著就留著
  const cs = D.gb || [], nm = store.get("vsa-name"), sig = cs.map(c => c.id).join() + "|" + !!nm;
  box.hidden = !!WHO;
  if (box.dataset.sig === sig || (box.dataset.sig && (box.querySelector(".gbf:not(.fold) [name=s]") || {}).value)) return;   // 沒有新留言就不重畫；打到一半的字留著
  box.dataset.sig = sig;
  const r0 = new Map([...box.querySelectorAll(".gbc[data-id]")].map(c => [c.dataset.id, c.getBoundingClientRect()]));   // 換之前每張卡的位置（刪一張時其他的滑過去）
  box.innerHTML = `<div class="mh"><b>留言簿</b><span class="num">${cs.length ? `${cs.length} 則` : ""}</span></div>
    <div class="gbl">${cs.length ? cs.slice().reverse().map((c, k) => `<div class="gbc${GBSEEN.has(c.id) ? " old" : ""}" data-id="${esc(c.id)}" style="--i:${Math.min(k, 8)}"><p>${esc(c.s)}</p><div class="gbn"><i class="av">${esc([...c.n][0] || "?")}</i><b>${esc(c.n)}</b><span>${ago(c.t)}</span>${c.me ? `<button class="cx" data-gbdel="${esc(c.id)}" aria-label="刪掉">${I("x")}</button>` : ""}</div></div>`).join("") : `<div class="gbe">${I("chat")}<span>看完了嗎？留一句話給${esc(D.name)}</span></div>`}</div>
    <button type="button" class="cadd" data-cadd${open ? " hidden" : ""}>${I("pen")}<span>留一句話</span></button><form class="cform gbf${open ? "" : " fold"}">${nm ? "" : `<input class="cin nm" name="n" maxlength="20" placeholder="你的名字" autocomplete="nickname">`}<div class="crow"><input class="cin" name="s" maxlength="300" placeholder="寫一句話…" autocomplete="off"><button class="csend" aria-label="送出">${I("send")}</button></div></form>`;
  cs.forEach(c => GBSEEN.add(c.id));
  if (!anim() || !r0.size) return;
  box.querySelectorAll(".gbc[data-id]").forEach(c => { const a = r0.get(c.dataset.id); if (!a) return; const b = c.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) + Math.abs(dy) > 1) c.animate([{transform:`translate(${dx}px,${dy}px)`}, {transform:"none"}], {duration:T.slow, easing:DEC}); });
}
async function gbPost(body){
  try {
    const r = await fetch(BASE + "/talk", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({i:GB, ...body})});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d.message || "沒有送出去，等一下再試"); return false; }
    D.gb = d.cm || []; return true;
  } catch (e) { toast("連不上，等一下再試"); return false; }
}
document.addEventListener("submit", e => {
  const f = e.target.closest(".gbf"); if (!f) return;
  e.preventDefault();
  const nm = f.querySelector("[name=n]"), tx = f.querySelector("[name=s]"), name = (nm ? nm.value : store.get("vsa-name")).trim();
  if (!name) { if (nm) nm.focus(); return toast("先寫你的名字"); }
  if (!tx.value.trim()) return tx.focus();
  store.set("vsa-name", name);
  const sb = f.querySelector(".csend"); if (sb.disabled) return;
  sb.disabled = true;
  gbPost({s:tx.value, n:name}).then(ok => {
    sb.disabled = false;
    if (!ok) return;
    tx.value = ""; gbook(1);
  });
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-gbdel]"); if (!b) return;
  const c = b.closest(".gbc");
  gbPost({del:b.dataset.gbdel}).then(ok => { if (!ok) return;
    if (c && anim()) c.animate([{opacity:1}, {opacity:0, transform:"scale(.96)"}], {duration:T.fast, easing:EXIT, fill:"forwards"}).finished.then(() => gbook(), () => gbook()); else gbook(); });
});
function talkOrder(cs){                                        // 回覆排在那一則下面（那一則被刪了就照時間放）
  const ids = new Set(cs.map(c => c.id)), top = cs.filter(c => !c.r || !ids.has(c.r)), out = [];
  top.forEach(c => { out.push(c); cs.forEach(x => { if (x.r === c.id) out.push(x); }); });
  return out;
}
const talkHead = p => `<b>留言</b>${p.lk ? `<span class="num lkw">${I("heart")}${lkWho(p)}</span>` : ""}${Object.entries(p.rx || {}).filter(r => r[1] > 0).map(([e, n]) => `<span class="num"><i class="rxe">${e}</i>${n}</span>`).join("")}`;
function talkHTML(p, open){
  if (!D.talk) return "";
  const cs = p.cm || [], nm = store.get("vsa-name");
  return `<div class="ibox italk"><div class="th">${talkHead(p)}</div>
    ${talkOrder(cs).map(c => `<div class="cmt${c.r ? " rep" : ""}" data-cid="${esc(c.id)}"><div class="av">${esc([...c.n][0] || "?")}</div><div class="cb"><div class="cn"><b>${esc(c.n)}</b><span>${ago(c.t)}</span></div><p>${esc(c.s)}</p><button class="crep" data-crep="${esc(c.id)}" data-cn="${esc(c.n)}">回覆</button></div>${c.me ? `<button class="cx" data-cdel="${esc(c.id)}" aria-label="刪掉">${I("x")}</button>` : ""}</div>`).join("")}
    <button type="button" class="cadd" data-cadd${open ? " hidden" : ""}>${I("chat")}<span>${cs.length ? "留言" : "第一個留言"}</span></button><form class="cform${open ? "" : " fold"}"><div class="cre" hidden><span></span><button type="button" data-crex aria-label="不回覆了">${I("x")}</button></div>${nm ? "" : `<input class="cin nm" name="n" maxlength="20" placeholder="你的名字" autocomplete="nickname">`}<div class="crow"><input class="cin" name="s" maxlength="300" placeholder="說點什麼…" autocomplete="off"><button class="csend" aria-label="送出">${I("send")}</button></div></form></div>`;
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
        a.href = SEL.s.size >= PH.length && !ALL.some(p => p.u) ? `${BASE}/zip` : `${BASE}/zip?ids=${[...SEL.s].sort((x, y) => x - y).map(k => PH[k].i).join(",")}`; a.download = "";   // 全選：整本一起打包
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
function placeSheet(ids){                                     // 地圖上一顆泡泡裡的全部照片
  if (SH) return;
  const p0 = PH[ids[0]], d0 = pd(p0.x.dt), d1 = pd(PH[ids[ids.length - 1]].x.dt);
  const bg = document.createElement("div");
  bg.className = "shbg";
  bg.innerHTML = `<div class="sh shp"><div class="shh"><b>${esc(p0.p ? p0.p.n : "這裡")}</b><span class="num">${ids.length} 張${d0 && d1 ? `・${esc(frange(d0, d1))}` : ""}</span></div>
    <div class="shg">${ids.map((k, n) => `<button data-shi="${k}" style="--i:${Math.min(n, 12)}"><img alt="" loading="lazy" draggable="false" src="${src(PH[k], "s")}">${isVid(PH[k]) ? `<i>${I("play")}</i>` : ""}</button>`).join("")}</div></div>`;
  document.body.appendChild(bg);
  void bg.offsetWidth; bg.classList.add("on");
  SH = {close(){ if (SH && SH.bg === bg) SH = null; bg.classList.remove("on"); bg.style.pointerEvents = "none"; setTimeout(() => bg.remove(), T.mid + 50); }, bg};
  history.pushState({sh:1}, "");
  bg.addEventListener("click", e => {
    if (e.target === bg) return popBack();
    const b = e.target.closest("[data-shi]"); if (!b) return;
    popBack(); setTimeout(() => openLb(+b.dataset.shi), anim() ? T.mid : 0);
  });
}
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
  PH = pickW(); stackCalc();
  if (!PH.length || !$(".wall")) return PH.length ? draw() : boot();
  whoBar();
  const was = new Map(), H = innerHeight;
  TILES.forEach(t => { if (!t.isConnected) return; const r = t.getBoundingClientRect(); if (r.bottom > -60 && r.top < H + 60) was.set(t, r); });
  TILES = PH.map((p, i) => { const t = old.get(p.i); if (t) { old.delete(p.i); t.dataset.i = i; return t; } return TM.get(p.i) || tile(p, i); });
  const gone = [...old.values()].filter(t => was.has(t));
  if (gone.length && anim()) await Promise.all(gone.map(t => t.animate([{opacity:1, transform:"none"}, {opacity:0, transform:"scale(.9)"}], {duration:T.mid, easing:EXIT, fill:"forwards"}).finished.catch(() => {})));
  sections(); layout(true); mems(); bigMap(); gear(); gbook();
  TILES.forEach((t, i) => { badge(i); const a = was.get(t); if (!a || !anim() || !t.isConnected) return;
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
const SSD = 6000, SSF = 1400, SSCH = 3000;
function show(start, day){
  if (SS) return;
  const list = PH.map((p, i) => i).filter(i => !PH[i].broken && (!isVid(PH[i]) || PH[i].vr === 1) && (!day || (pd(PH[i].x.dt) || {}).k === day));
  if (!list.length) return;
  /* 換天的時候先放一張章節卡：第幾天、日期、城市、天氣（只有一天就不放） */
  const dk = i => (pd(PH[i].x.dt) || {}).k || "", allDays = [...new Set(PH.map((p, i) => dk(i)).filter(Boolean))].sort();
  const seq = []; let prev = null;
  list.forEach(i => { const k = dk(i); if ((allDays.length > 1 || day) && k && k !== prev) seq.push({ch:k, i}); prev = k; seq.push({i}); });
  const nph = list.length, phAt = k => seq.slice(0, k + 1).filter(x => !x.ch).length;
  let at = start ? Math.max(0, seq.findIndex(x => !x.ch && x.i === start)) : 0, timer = 0, paused = false, hideT = 0, t0 = 0, left = SSD;
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
  function layer(it){
    const i = it.i, p = PH[i], d = pd(p.x.dt), L = document.createElement("div");
    L.className = "ssl";
    if (it.ch) {
      const n = allDays.indexOf(it.ch) + 1, sm = daySum(it.ch), pl = sm ? dayPlaces(it.ch).split("・")[0] : dayPlaces(it.ch);   // 有一句話時地點只寫城市（不重複）
      L.classList.add("sch");
      L.innerHTML = `<img class="sbg" alt="" src="${src(p, "s")}"><div class="sct">${allDays.length > 1 ? `<i class="num">第 ${n} 天</i>` : ""}<b>${d ? fday(d, YR) : ""}</b>${pl ? `<span>${I("pin")}${esc(pl)}</span>` : ""}${wxTag(it.ch)}${sm ? `<em class="dsum">${esc(sm)}</em>` : ""}</div>`;
      return L;
    }
    const where = p.p ? p.p.n : "", when = d ? `${d.y}年${d.mo}月${d.d}日` : "";
    const fill = Math.abs(Math.log((p.w / p.h) / (innerWidth / innerHeight))) < .22;   // 跟螢幕差不多比例就填滿
    L.innerHTML = `<img class="sbg" alt="" src="${src(p, "s")}"><div class="sfg${fill ? " cv" : ""}">${isVid(p) ? `<video muted playsinline preload="auto" src="${src(p, "v")}"></video>`
      : `<img alt="" src="${src(p, "l")}">`}</div>${where || when ? `<div class="scap"><b>${esc(where || when)}</b>${where && when ? `<span class="num">${esc(when)}</span>` : ""}</div>` : ""}`;
    return L;
  }
  function preload(k){ const it = seq[k] && seq[k].ch ? seq[k + 1] : seq[k], i = it && it.i; if (i != null && !isVid(PH[i])) { const im = new Image(); im.src = src(PH[i], "l"); } }
  function kb(L, ms){                                        // 慢慢推近，方向每張不同
    const f = L.querySelector(".sfg"); if (!anim()) return;
    const dirs = [[-1.5, -1], [1.5, 1], [1.5, -1], [-1.5, 1], [0, 0]], [x, y] = dirs[seq[at].i % dirs.length];
    if (!f) { const t = L.querySelector(".sct"); if (t) t.animate([{opacity:0, transform:"translateY(14px)", filter:"blur(6px)"}, {opacity:1, transform:"none", filter:"none"}], {duration:T.slow * 1.6, delay:SSF * .4, easing:DEC, fill:"backwards"}); return; }
    f.animate([{transform:"scale(1.02) translate(0,0)"}, {transform:`scale(1.12) translate(${x}%,${y}%)`}], {duration:ms + SSF, easing:"cubic-bezier(.4,0,.6,1)", fill:"forwards"});
  }
  function go(k, first){
    clearTimeout(timer);
    if (k >= seq.length) return end();
    at = Math.max(0, k);
    const old = view.querySelector(".ssl:not(.out)"), L = layer(seq[at]);
    view.appendChild(L);
    const p = PH[seq[at].i], v = L.querySelector("video");
    let ms = seq[at].ch ? SSCH : SSD;
    if (v) { ms = Math.min(15000, p.vd * 1000); v.play().catch(() => {}); }
    kb(L, v ? 0 : ms);
    const img = L.querySelector(".sfg img");
    const reveal = () => {
      L.classList.add("in");
      if (old) { old.classList.add("out"); setTimeout(() => old.remove(), SSF + 50); }
    };
    if (img && !img.complete) { img.addEventListener("load", reveal, {once:true}); img.addEventListener("error", reveal, {once:true}); } else requestAnimationFrame(reveal);
    $(".ssc span", el).textContent = `${phAt(at) || 1} / ${nph}`;
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
/* 照片資訊的小圖：光圈開多大、快門多久、ISO 多高、焦距看多寬、曝光補償偏哪邊 */
const lg = (v, a, b) => Math.max(0, Math.min(1, (Math.log(v) - Math.log(a)) / (Math.log(b) - Math.log(a))));
/* ── 精選：最多愛心的幾張（還沒人按愛心就平均挑幾張橫的），封面下面左右滑 ── */
function highlights(){
  const box = $(".hl"); if (!box) return;
  const ok = PH.map((p, i) => [p, i]).filter(([p]) => !p.broken && !p.raw);
  let pick = ok.filter(([p]) => p.lk > 0).sort((a, b) => b[0].lk - a[0].lk).slice(0, 8);
  const liked = pick.length >= 3;
  if (!liked && ok.length >= 10 && ok.some(([p]) => p.qs != null)) {   // 沒什麼人按愛心：挑拍得最好的（一疊只算一張、一天最多兩張）
    const day = {}, n = Math.min(8, Math.max(3, Math.round(ok.length / 8)));
    pick = ok.filter(([p, i]) => !isVid(p) && (!STKOF.has(i) || STKOF.get(i) === i)).sort((a, b) => (b[0].qs ?? 0) - (a[0].qs ?? 0))
      .filter(([p]) => { const k = (pd(p.x.dt) || {}).k || ""; day[k] = (day[k] || 0) + 1; return day[k] <= 2; }).slice(0, n).sort((a, b) => a[1] - b[1]);
  } else if (!liked && ok.length >= 10) {
    const land = ok.filter(([p]) => p.w > p.h && !isVid(p)), from = land.length >= 6 ? land : ok, n = Math.min(6, from.length);
    pick = Array.from({length:n}, (_, k) => from[Math.floor((k + .5) * from.length / n)]);
  } else if (!liked) pick = [];
  box.hidden = !!WHO || !!CITY || pick.length < 3;
  box.innerHTML = box.hidden ? "" : `<div class="hlh"><b>${I(liked ? "heart" : "star")}精選</b></div><div class="hlr">${pick.map(([p, i], k) =>
    `<button class="hlc" data-hl="${i}" style="--ar:${Math.max(.6, Math.min(1.8, p.w / p.h)).toFixed(3)};animation-delay:${k * 70}ms"><img alt="" loading="lazy" draggable="false" src="${src(p, "l")}">${p.lk ? `<i class="num">${I("heart")}${p.lk}</i>` : ""}${isVid(p) ? `<em>${I("play")}</em>` : ""}</button>`).join("")}</div>`;
  const r = box.querySelector(".hlr"); if (r) requestAnimationFrame(() => { r.scrollLeft = 0; });
}

/* ── 分享單張：連結打開就直接看那張（#p=編號） ── */
async function shareOne(p){
  const url = `${location.origin}${BASE}#p=${encodeURIComponent(p.i)}`;
  if (navigator.share && matchMedia("(pointer:coarse)").matches) { try { await navigator.share({title:D.name, url}); } catch (e) {} return; }
  try { await navigator.clipboard.writeText(url); toast("連結複製好了"); }
  catch (e) { prompt("複製這個連結", url); }
}
let DEEP = 1;
function deepLink(){
  if (!DEEP) return; DEEP = 0;
  const m = /^#p=(.+)$/.exec(location.hash); if (!m) return;
  history.replaceState(history.state, "", location.pathname + location.search);
  const id = decodeURIComponent(m[1]), a = ALL.find(p => String(p.i) === id); if (!a) return;
  const open = () => { const k = PH.indexOf(a); if (k >= 0) { tileOf(k).scrollIntoView({block:"center"}); setTimeout(() => openLb(k), 60); } };
  if ((a.u || "") !== WHO) whoSet(a.u || "").then(() => setTimeout(open, T.mid)); else setTimeout(open, anim() ? T.slow : 0);
}

/* ── 電腦上地圖跟著捲動：右邊固定一張地圖，捲到哪一天就飛到那天拍照的地方 ── */
let SMK = "", SMIO = null;
function smapOn(){
  const wr = $(".wwrap"), a = $(".smap"); if (!wr || !a) return false;
  const on = innerWidth >= 1200 && D.loc && !WHO && PH.some(p => p.g && pd(p.x.dt));
  const was = wr.classList.contains("side");
  wr.classList.toggle("side", !!on); a.hidden = !on;
  if (!on && SMIO) { SMIO.disconnect(); SMIO = null; }
  return !!on !== was;
}
function smapWatch(){
  if (SMIO) SMIO.disconnect(); SMIO = null; SMK = "";
  if (!$(".wwrap.side") || !("IntersectionObserver" in window)) return;
  const vis = new Map();
  SMIO = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) vis.set(e.target, e.target.getBoundingClientRect().top); else vis.delete(e.target); });
    const sec = [...vis.keys()].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    const dh = sec && sec.querySelector(".dh[data-day]"); if (dh) smapGo(dh.dataset.day);
  }, {rootMargin:"-35% 0px -55% 0px"});
  document.querySelectorAll(".wall .day").forEach(d => SMIO.observe(d));
  const first = $(".wall .dh[data-day]"); smapGo(first ? first.dataset.day : "", true);
}
function smapGo(k, force){
  const box = $(".smap:not([hidden]) .smv"); if (!box) return;
  if (k === SMK && !force) return;
  let ps = PH.map((p, i) => [p, i]).filter(([p]) => p.g && !p.broken && (!k || (pd(p.x.dt) || {}).k === k));
  if (!ps.length) return;
  SMK = k;
  ps.sort((a, b) => (a[0].x.dt || "") < (b[0].x.dt || "") ? -1 : 1);
  const W = box.clientWidth, H = box.clientHeight; if (!W) return;
  let z = 16;
  for (; z > 2; z--) { const xs = ps.map(([p]) => lx(p.g[1], z)), ys = ps.map(([p]) => ly(p.g[0], z));
    if (Math.max(...xs) - Math.min(...xs) <= W - 140 && Math.max(...ys) - Math.min(...ys) <= H - 180) break; }
  if (ps.length === 1) z = 14;
  const xs = ps.map(([p]) => lx(p.g[1], z)), ys = ps.map(([p]) => ly(p.g[0], z));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2 - 20;
  const ly2 = document.createElement("div"); ly2.className = "sml";
  tiles(ly2, cx, cy, z, W, H);
  const cl = [];
  ps.forEach(([p, i], n) => { const x = xs[n] - cx + W / 2, y = ys[n] - cy + H / 2, c = cl.find(c => Math.hypot(c.x - x, c.y - y) < 40);
    if (c) { c.n++; c.ids.push(i); } else cl.push({x, y, i, n:1, ids:[i]}); });
  const pts = cl.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  ly2.insertAdjacentHTML("beforeend", (cl.length > 1 ? `<svg class="smr" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}"/></svg>` : "")
    + cl.map((c, n) => `<button class="mk" data-i="${c.i}"${c.n > 1 ? ` data-cl="${c.ids.join(",")}"` : ""} style="left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px;animation-delay:${Math.min(n * 50, 500)}ms"><img alt="" loading="lazy" src="${src(PH[c.i], "s")}">${c.n > 1 ? `<i class="num">${c.n}</i>` : ""}</button>`).join(""));
  const old = [...box.querySelectorAll(".sml")];
  box.appendChild(ly2);
  if (anim()) {
    ly2.animate([{opacity:0, transform:"scale(1.06)"}, {opacity:1, transform:"none"}], {duration:T.slow, easing:DEC});
    old.forEach(o => o.animate([{opacity:1}, {opacity:0, transform:"scale(.96)"}], {duration:T.mid, easing:EASE, fill:"forwards"}).onfinish = () => o.remove());
  } else old.forEach(o => o.remove());
  const d = k && pd(ps[0][0].x.dt), c = $(".smap .smc");
  if (c) {
    const days = [...new Set(PH.map(p => (pd(p.x.dt) || {}).k).filter(Boolean))].sort(), n = days.indexOf(k) + 1;
    const html = d ? `${isTrip() && days.length > 1 ? `<i class="num">第 ${n} 天</i>` : ""}<b>${esc(fday(d, YR))}${wxTag(k)}</b>${dayPlaces(k) ? `<span>${I("pin")}${esc(dayPlaces(k))}</span>` : ""}` : "";
    if (c.dataset.k !== k) { c.dataset.k = k; c.innerHTML = html; if (anim()) c.animate([{opacity:0, transform:"translateY(6px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC}); }
  }
}

const SV = (b, cls = "") => `<svg class="gx ${cls}" viewBox="0 0 32 32" aria-hidden="true">${b}</svg>`;
function gIris(f){                       // 光圈葉片：ƒ1.4 開最大、ƒ22 只剩一個小洞（相機上的光圈符號）
  const k = 1 - lg(f, 1.2, 22), r = 2.6 + 8.2 * k, R = 13, P = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; P.push([16 + r * Math.cos(a), 16 + r * Math.sin(a)]); }
  const bl = P.map((q, i) => {                                // 每片葉片的邊：從洞口順著邊往外延伸到外圈
    const n = P[(i + 1) % 6], dx = n[0] - q[0], dy = n[1] - q[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const ox = n[0] - 16, oy = n[1] - 16, bb = ox * ux + oy * uy, t = -bb + Math.sqrt(bb * bb - (ox * ox + oy * oy - R * R));
    return `<path d="M${q[0].toFixed(1)} ${q[1].toFixed(1)}L${(n[0] + ux * t).toFixed(1)} ${(n[1] + uy * t).toFixed(1)}" class="gs"/>`;
  }).join("");
  return SV(`<circle cx="16" cy="16" r="${R}" class="gw"/><polygon points="${P.map(q => q.map(v => v.toFixed(1)).join(",")).join(" ")}" class="gh"/>${bl}<circle cx="16" cy="16" r="${R}" class="gs"/>`);
}
function gShut(et){                      // 碼錶：1/8000 只走一點點、30 秒走一圈
  const v = et[0] / et[1], k = Math.max(.04, lg(v, 1 / 8000, 30)), a = k * 2 * Math.PI - Math.PI / 2;
  const big = k > .5 ? 1 : 0, x = 16 + 10.5 * Math.cos(a), y = 18 + 10.5 * Math.sin(a);
  return SV(`<path d="M13.5 3.5h5M16 3.5v3.5M24.5 8.5l1.8-1.8" class="gs"/><path d="M16 18V7.5A10.5 10.5 0 ${big} 1 ${x.toFixed(1)} ${y.toFixed(1)}Z" class="gf"/><circle cx="16" cy="18" r="11.5" class="gs"/><circle cx="16" cy="18" r="1.6" class="gd"/>`);
}
function gIso(iso){                      // 感光度儀表：ISO 越高指針越往右（右邊那段是高感光、容易有雜訊）
  const k = lg(iso, 50, 12800), A = t => Math.PI * (1 + t), P = (t, r) => `${(16 + r * Math.cos(A(t))).toFixed(1)} ${(24 + r * Math.sin(A(t))).toFixed(1)}`;
  const arc = (t0, t1, cls) => `<path d="M${P(t0, 13.5)}A13.5 13.5 0 0 1 ${P(t1, 13.5)}" class="${cls}"/>`;
  const ticks = [0, .25, .5, .75, 1].map(t => `<path d="M${P(t, 9.6)}L${P(t, 11.2)}" class="gl"/>`).join("");
  return SV(`${arc(0, 1, "gtk")}${k > .01 ? arc(0, k, "gsk") : ""}${ticks}<path d="M16 24L${P(k, 10.5)}" class="gs"/><circle cx="16" cy="24" r="2.3" class="gd"/>`);
}
function gFov(f35){                      // 取景框：外面淡淡的是超廣角看到的整片風景，亮框是這顆鏡頭拍到的範圍（望遠越小）
  const k = Math.max(.24, Math.min(1, 1 - lg(f35, 14, 400) * .76)), w = 26 * k, h = 20 * k, x = 16 - w / 2, y = 16 - h / 2, r = (2.6 * k + .6).toFixed(1);
  const id = "fv" + Math.round(f35), box = `x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${r}"`;
  const scene = `<path d="M3 23l7-8 5 5 4-5 10 9v2H3Z" class="gf"/><circle cx="22" cy="11.5" r="2.4" class="gf"/>`;
  return SV(`<defs><clipPath id="${id}a"><rect x="3" y="6" width="26" height="20" rx="3"/></clipPath><clipPath id="${id}b"><rect ${box}/></clipPath></defs>
    <g clip-path="url(#${id}a)" class="gscn">${scene}</g><rect x="3" y="6" width="26" height="20" rx="3" class="gl"/>
    <rect ${box} class="gh"/><g clip-path="url(#${id}b)">${scene}</g><rect ${box} class="gs"/>`);
}
function gEv(ev){                        // 相機裡的曝光尺：−3 … 0 … +3，下面的三角形指著這張
  const v = Math.max(-3, Math.min(3, ev)), X = i => 16 + i * 4.3, x = X(v);
  const tk = [-3, -2, -1, 0, 1, 2, 3].map(i => `<path d="M${X(i).toFixed(1)} ${i % 3 ? 13 : 9}V19" class="${i ? "gl" : "gs"}"/>`).join("");
  const bar = Math.abs(v) > .05 ? `<rect x="${Math.min(16, x).toFixed(1)}" y="20.5" width="${Math.abs(x - 16).toFixed(1)}" height="3" rx="1.5" class="gd"/>` : "";
  return SV(`<path d="M1.5 4.5h4M26.5 4.5h4M28.5 2.5v4" class="gs"/>${tk}${bar}<path d="M${x.toFixed(1)} 24l3.4 5.5h-6.8Z" class="gd"/>`);
}
function gSun(d){                        // 拍攝時間在一天的哪裡：太陽沿弧線走，晚上是月亮
  const hr = d.h + d.mi / 60, day = hr >= 6 && hr < 18;
  const a = Math.PI * (1 - (hr - 6) / 12), x = 24 + 18 * Math.cos(a), y = 24 - 18 * Math.sin(a);
  return `<svg class="gsun${day ? "" : " night"}" viewBox="0 0 48 28" aria-hidden="true"><path d="M6 24A18 18 0 0 1 42 24" class="gl"/><path d="M2 24.5h44" class="gl"/>${day ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="gd"/>` : `<path d="M27 8a6 6 0 1 0 5 9.5A5 5 0 0 1 27 8Z" class="gd"/>`}</svg>`;
}
const gArrow = deg => `<svg class="gin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" class="gt"/><path d="M12 5l3.5 9L12 12.5 8.5 14Z" class="gd" transform="rotate(${deg} 12 12)"/></svg>`;
const EPL = {1:"M", 2:"P", 3:"A", 4:"S", 5:"P", 6:"S", 7:"A", 8:"A"};
const gDial = t => `<svg class="gin gb" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" class="gf"/><text x="12" y="12" dy=".36em" text-anchor="middle" class="gtx${t.length > 1 ? " sm" : ""}">${t}</text></svg>`;
function gMeter(m){                      // 相機上的測光符號：評價（框＋圈＋點）、中央重點（框＋圈）、點測光（一個點）、局部（小圈）、平均（整片）
  const fr = `<path d="M3 8V6.5A2 2 0 0 1 5 4.5h2.5M16.5 4.5H19A2 2 0 0 1 21 6.5V8M21 16v1.5a2 2 0 0 1-2 2h-2.5M7.5 19.5H5a2 2 0 0 1-2-2V16" class="gs"/>`;
  const in_ = m === 3 ? `<circle cx="12" cy="12" r="1.8" class="gd"/>` : m === 6 ? `<circle cx="12" cy="12" r="3.6" class="gf"/>`
    : m === 2 ? `<circle cx="12" cy="12" r="4.6" class="gs"/>` : m === 1 ? `<rect x="5.5" y="7" width="13" height="10" rx="1.5" class="gf"/>`
    : `<circle cx="12" cy="12" r="4.6" class="gs"/><circle cx="12" cy="12" r="1.4" class="gd"/>`;
  return `<svg class="gin gb" viewBox="0 0 24 24" aria-hidden="true">${fr}${in_}</svg>`;
}
const gWb = man => `<svg class="gin gb" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" class="gf"/><text x="12" y="12" dy=".36em" text-anchor="middle" class="gtx sm">${man ? "WB" : "AWB"}</text></svg>`;
const gMtn = `<svg class="gin" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 19l6.5-10 4 6 2.5-3.5L22 19Z" class="gf"/></svg>`;
const gBolt = on => `<svg class="gin gb${on ? "" : " off"}" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5 13.5h6L10 22l9-12h-6Z" class="gd"/>${on ? "" : `<path d="M4 4l16 16" class="gl"/>`}</svg>`;

/* 照片的五個主要顏色：小圖畫到畫布上、照顏色分堆，越多的那段越長 */
function palette(p){
  if (p.pal) return Promise.resolve(p.pal);
  return new Promise(ok => {
    const im = new Image();
    im.onload = () => {
      try {
        p.gam = gamut(im);                                   // 先畫進 P3 畫布：Chrome 第一次畫成哪一種顏色，之後都沿用那一份（先畫一般的就被裁掉了）
        const N = 40, c = document.createElement("canvas"); c.width = c.height = N;
        const g = c.getContext("2d", {willReadFrequently:true}); g.drawImage(im, 0, 0, N, N);
        const px = g.getImageData(0, 0, N, N).data, bk = new Map();
        for (let k = 0; k < px.length; k += 4) {
          const r = px[k], gg = px[k + 1], b = px[k + 2], key = (r >> 5) << 6 | (gg >> 5) << 3 | (b >> 5);
          const o = bk.get(key) || [0, 0, 0, 0]; o[0] += r; o[1] += gg; o[2] += b; o[3]++; bk.set(key, o);
        }
        const sat = c1 => (Math.max(c1[0], c1[1], c1[2]) - Math.min(c1[0], c1[1], c1[2])) / 255;   // 有顏色的優先，不然常常五個都是灰的
        const cs = [...bk.values()].map(o => [o[0] / o[3], o[1] / o[3], o[2] / o[3], o[3]]).sort((a, b) => b[3] * (1 + 2.5 * sat(b)) - a[3] * (1 + 2.5 * sat(a))), out = [];
        cs.forEach(c1 => { const near = out.find(o => Math.hypot(o[0] - c1[0], o[1] - c1[1], o[2] - c1[2]) < 56); if (near) near[3] += c1[3]; else if (out.length < 5 && c1[3] >= 8) out.push(c1.slice()); });
        p.pal = out.sort((a, b) => b[3] - a[3]).map(o => [`rgb(${o.slice(0, 3).map(Math.round).join(",")})`, o[3]]);
        const W2 = 160, H2 = Math.max(1, Math.round(W2 * im.naturalHeight / Math.max(1, im.naturalWidth))), c2 = document.createElement("canvas");   // 直方圖：亮度＋紅綠藍，64 格
        c2.width = W2; c2.height = H2;
        const g2 = c2.getContext("2d", {willReadFrequently:true}); g2.drawImage(im, 0, 0, W2, H2);
        const q = g2.getImageData(0, 0, W2, H2).data, hs = [0, 1, 2, 3].map(() => new Array(64).fill(0));
        for (let k = 0; k < q.length; k += 4) { hs[0][q[k] >> 2]++; hs[1][q[k + 1] >> 2]++; hs[2][q[k + 2] >> 2]++; hs[3][Math.min(255, Math.round(.2126 * q[k] + .7152 * q[k + 1] + .0722 * q[k + 2])) >> 2]++; }
        const tot = W2 * H2;
        p.hist = {h:hs, lo:hs[3][0] / tot, hi:hs[3][63] / tot};
      } catch (e) { p.pal = []; }
      ok(p.pal);
    };
    im.onerror = () => { p.pal = []; ok(p.pal); };
    im.src = src(p, "s");
  });
}
/* 色域圖：照片的顏色在色度圖上的位置，跟一般螢幕（sRGB）、P3 的範圍比；用 P3 畫布讀，才看得到超出一般螢幕的顏色 */
function gamut(im){
  try {
    const w = 72, h = Math.max(1, Math.round(w * im.naturalHeight / Math.max(1, im.naturalWidth))), c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", {colorSpace:"display-p3", willReadFrequently:true});
    if (!g || !g.getContextAttributes || g.getContextAttributes().colorSpace !== "display-p3") return null;   // 不支援 P3 畫布就量不出來，不畫
    g.drawImage(im, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h, {colorSpace:"display-p3"}).data, L = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    const seen = new Map();
    let out = 0, n = 0;
    for (let k = 0; k < d.length; k += 4) {
      const r = L(d[k]), gg = L(d[k + 1]), b = L(d[k + 2]);
      const X = .4865709 * r + .2656677 * gg + .1982173 * b, Y = .2289746 * r + .6917385 * gg + .0792869 * b, Z = .0451134 * gg + 1.0439444 * b;
      const sr = 3.2404542 * X - 1.5371385 * Y - .4985314 * Z, sg = -.969266 * X + 1.8760108 * Y + .041556 * Z, sb = .0556434 * X - .2040259 * Y + 1.0572252 * Z;
      n++;
      const o = Math.min(sr, sg, sb) < -.02 || Math.max(sr, sg, sb) > 1.02;
      if (o) out++;
      if (Y < .012) continue;
      const S = X + Y + Z, x = X / S, y = Y / S, key = `${Math.round(x * 160)},${Math.round(y * 160)}`;
      if (!seen.has(key)) seen.set(key, [x, y, d[k], d[k + 1], d[k + 2], o]);
    }
    return {out:out / Math.max(1, n), pts:[...seen.values()].slice(0, 700)};
  } catch (e) { return null; }
}
const LOCUS = [[.1741, .005], [.1566, .0177], [.144, .0297], [.1241, .0578], [.1096, .0868], [.0913, .1327], [.0687, .2007], [.0454, .295], [.0235, .4127], [.0082, .5384], [.0039, .6548], [.0139, .7502], [.0389, .812], [.0743, .8338], [.1142, .8262], [.1547, .8059], [.2296, .7543], [.3016, .6923], [.3731, .6245], [.4441, .5547], [.5125, .4866], [.5752, .4242], [.627, .3725], [.6658, .334], [.6915, .3083], [.719, .2809], [.7347, .2653]];
const GX = x => (x * 100).toFixed(2), GY = y => (90 - y * 100).toFixed(2);
const gTri = pr => pr.map(([x, y]) => `${GX(x)},${GY(y)}`).join(" ");
function gamSvg(p){
  const G = p.gam; if (!G || !G.pts.length) return "";
  const pc = Math.round(G.out * 100), tip = pc >= 1 ? `有 ${pc}% 的顏色超出一般螢幕` : G.out > 0 ? "少數顏色超出一般螢幕" : "顏色都在一般螢幕的範圍內";
  return `<div class="igam"><svg viewBox="-2 -2 80 94" aria-hidden="true"><polygon points="${LOCUS.map(([x, y]) => `${GX(x)},${GY(y)}`).join(" ")}" class="glc"/>
    <polygon points="${gTri([[.68, .32], [.265, .69], [.15, .06]])}" class="gp3"/><polygon points="${gTri([[.64, .33], [.3, .6], [.15, .06]])}" class="gsr"/>
    ${G.pts.map(q => `<circle cx="${GX(q[0])}" cy="${GY(q[1])}" r="${q[5] ? .95 : .7}" fill="color(display-p3 ${(q[2] / 255).toFixed(3)} ${(q[3] / 255).toFixed(3)} ${(q[4] / 255).toFixed(3)})"${q[5] ? ` class="go"` : ""}/>`).join("")}</svg>
    <div class="igt"><small>色域</small><b>${tip}</b><span class="gk"><i class="k1"></i>一般螢幕<i class="k2"></i>P3</span>${scrNote(p)}</div></div>`;
}
function scrNote(p){                                         // 看的人的螢幕看不看得到：照瀏覽器回報的螢幕能力老實寫
  const wide = (p.gam && p.gam.out > .01) || /P3|Adobe|2020/.test(p.cs || ""), hdr = p.hdr && !isVid(p);
  const t = hdr ? (matchMedia("(dynamic-range: high)").matches ? [1, "你的螢幕支援 HDR"] : [0, "你的螢幕不支援 HDR，看的是一般版"])
    : wide ? (matchMedia("(color-gamut: p3)").matches ? [1, "你的螢幕看得到完整顏色"] : [0, "你的螢幕顯示不出全部顏色"]) : null;
  return t ? `<span class="scr${t[0] ? "" : " no"}">${I(t[0] ? "ck" : "scr")}${t[1]}</span>` : "";
}
function histSvg(p){                                         // 亮度是灰色的山，紅綠藍三條線疊在上面（跟相機回放、Lightroom 一樣）
  const H = p.hist; if (!H) return "";
  const all = [].concat(...H.h).sort((a, b) => a - b), cap = Math.max(1, all[Math.floor(all.length * .985)]);   // 太尖的那幾格不要把其他壓扁
  const y = v => (40 - Math.min(1, v / cap) * 38).toFixed(1), pts = a => a.map((v, i) => `${(i * 160 / 63).toFixed(1)},${y(v)}`).join(" ");
  const tip = H.lo > .02 ? "暗部有一片全黑" : H.hi > .02 ? "亮部有一片過曝" : "";
  return `<div class="ihist"><svg viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden="true"><path d="M40 0v40M80 0v40M120 0v40" class="hg"/><polygon points="0,40 ${pts(H.h[3])} 160,40" class="hl0"/>${["hr", "hgr", "hb"].map((c, k) => `<polyline points="${pts(H.h[k])}" class="${c}"/>`).join("")}</svg><div class="ihl"><small>暗</small>${tip ? `<b>${tip}</b>` : ""}<small>亮</small></div></div>`;
}
function palHTML(p){
  const pl = p.pal; if (!pl) return `<div class="pbar wait"></div>`;
  if (!pl.length) return "";
  const t = pl.reduce((a, c) => a + c[1], 0);
  return `${histSvg(p)}<div class="pbar">${pl.map(([c, n]) => `<i style="background:${c};flex:${Math.max(.06, n / t).toFixed(3)}"></i>`).join("")}</div>${gamSvg(p) || (scrNote(p) ? `<div class="iscr">${scrNote(p)}</div>` : "")}`;
}
/* 在這附近拍的其他照片（300 公尺內，近的先）：點了直接換過去 */
function gdist(a, b){ const r = Math.PI / 180, h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742000 * Math.asin(Math.min(1, Math.sqrt(h))); }
function nearHTML(p){
  const ns = PH.map((q, k) => [q, k]).filter(([q]) => q !== p && q.g && !q.broken).map(([q, k]) => [k, gdist(p.g, q.g)]).filter(x => x[1] <= 300).sort((a, b) => a[1] - b[1]);
  if (!ns.length) return "";
  return `<div class="inear"><div class="inh"><b>在這附近拍的</b><span class="num">${ns.length} 張</span></div><div class="inr">${ns.slice(0, 16).map(([k, m]) => `<button class="inp" data-go="${k}" aria-label="第 ${k + 1} 張"><img alt="" loading="lazy" draggable="false" src="${src(PH[k], "s")}"><small class="num">${m < 15 ? "同一處" : `${Math.round(m / 10) * 10} 公尺`}</small></button>`).join("")}</div></div>`;
}
function infoHTML(p){
  const x = p.x, d = pd(x.dt), cam = camName(x), lens = lensName(x), ext = (p.n.split(".").pop() || "").toUpperCase().replace("JPG", "JPEG");
  const mp = p.w * p.h / 1e6, f35 = x.f35 || 0, fl = x.fl || 0;
  let h = d ? `<div class="ihd"><div><div class="idt">${fdate(d)}</div><div class="itm num">${x.dtf ? `檔案時間 ${ftime(d)}` : ftod(p, d)}${x.oz ? `・UTC${x.oz.replace(":00", "")}` : ""}</div></div>${x.dtf || d.h == null ? "" : gSun(d)}</div>` : "";
  h += talkHTML(p);
  if (p.g) {
    const [lat, lon, alt, dir] = p.g, nm = p.p ? p.p.n : "拍攝地點", sub = p.p && p.p.a ? p.p.a : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    h += `<div class="ibox"><a class="imap" href="${mapUrl(lat, lon, nm)}" target="_blank" rel="noopener noreferrer" aria-label="在地圖上打開">${dir != null ? `<span class="cone" style="transform:rotate(${dir}deg)"></span>` : ""}<span class="pin"></span><span class="attr">© OpenStreetMap</span></a>
      <a class="ipl" href="${mapUrl(lat, lon, nm)}" target="_blank" rel="noopener noreferrer"><span class="pi">${I("pin")}</span><span><b>${esc(nm)}</b><span>${esc(sub)}</span></span><span class="go">${I("ext")}</span></a>${nearHTML(p)}</div>`;
  }
  const fe = f35 || (fl ? Math.round(fl) : 0);
  const cells = [["光圈", x.f ? `ƒ${+x.f.toFixed(2)}` : "", x.f ? gIris(x.f) : ""], ["快門", shutter(x.et).replace(" 秒", " s"), x.et ? gShut(x.et) : ""],
    ["ISO", x.iso || "", x.iso ? gIso(x.iso) : ""], ["焦距", fe ? `${fe} mm` : "", f35 ? gFov(f35) : ""], ["曝光", x.ev != null ? `${x.ev > 0 ? "+" : ""}${+x.ev.toFixed(1)} ev` : "", x.ev != null ? gEv(x.ev) : ""]];
  h += `<div class="ibox"><div class="icam"><div class="t">${cam && !isVid(p) ? `<button class="igear" data-gear="c:${esc(cam)}"><b>${esc(cam)}</b>${I("r")}</button>` : `<b>${esc(cam || (isVid(p) ? "影片" : "相機資訊"))}</b>`}<span class="tag">${esc(ext)}</span>${p.rw && p.rw !== ext ? `<span class="tag">+${esc(p.rw)}</span>` : ""}${p.cs ? `<span class="tag">${esc(p.cs.replace("Display ", ""))}</span>` : ""}${p.hdr && !isVid(p) ? `<span class="tag hdr">HDR</span>` : ""}</div>
      ${lens || f35 ? `<div class="l">${esc(f35 ? `${lensKind(f35)}・等效 ${f35} mm` : "")}${lens ? `${f35 ? "　" : ""}<button class="igear sm" data-gear="l:${esc(lens)}">${esc(lens)}</button>` : ""}</div>` : ""}
      <div class="l2 num">${p.w && p.h ? `<i class="gar" style="aspect-ratio:${p.w} / ${p.h}"></i>` : ""}<span>${isVid(p) ? `影片 ${dur(p.vd)}・` : mp >= .1 ? `${mp >= 10 ? Math.round(mp) : mp.toFixed(1)} MP・` : ""}${p.w} × ${p.h}・${size(p.sz)}</span></div></div>
    ${cells.some(c => c[1]) ? `<div class="iex num">${cells.map(([k, v, g]) => `<div${v ? "" : ` class="no"`}>${g || SV(`<circle cx="16" cy="16" r="12" class="gt"/>`)}<b>${esc(v || "—")}</b><small>${k}</small></div>`).join("")}</div>` : ""}</div>`;
  const ms = x.ms;
  if (ms && (ms.st || ms.lut || ms.k)) {
    const mono = /單色|ACROS|黑白|棕褐/.test(ms.st || ""), kp = ms.k ? Math.max(0, Math.min(100, (Math.log(ms.k) - Math.log(2000)) / (Math.log(12000) - Math.log(2000)) * 100)) : 0;
    h += `<div class="ibox isty">${ms.st || ms.lut ? `<i class="${mono ? "mono" : ""}"></i><div><small>${esc(ms.sl || "風格")}</small><b>${esc(ms.st || ms.lut)}</b></div>${[...(ms.fx || []), ...(ms.st && ms.lut ? [`LUT ${ms.lut}`] : [])].map(t => `<span class="tag">${esc(t)}</span>`).join("")}` : ""}
      ${ms.k ? `<div class="kel"><small>白平衡</small><b class="num">${ms.k} K</b><span class="kbar"><i style="left:${kp.toFixed(1)}%"></i></span></div>` : ""}</div>`;
  }
  if (!isVid(p)) h += `<div class="ibox ipal" data-pal aria-label="直方圖和主要顏色">${palHTML(p)}</div>`;
  const kv = [];
  if (x.ln) kv.push(["鏡頭", x.lmk && !x.ln.startsWith(x.lmk) ? `${x.lmk} ${x.ln}` : x.ln]);
  if (fl && f35 && Math.round(fl) !== f35) kv.push(["實際焦距", `${+fl.toFixed(2)} mm`]);
  if (ms && (ms.af || ms.sub)) kv.push(["對焦", [ms.af, ms.sub].filter(Boolean).join("・")]);
  if (ms && ms.is) kv.push(["防手震", ms.is]);
  // 拍攝設定：一格一個小圖（模式轉盤、測光方式、閃光燈、白平衡、場景），不再一行一行寫字
  const st = [];
  if (x.ep && EP[x.ep]) st.push([gDial(EPL[x.ep] || "P"), EP[x.ep], "模式"]);
  else if (x.em != null && x.em < 3) st.push([gDial(["A", "M", "B"][x.em]), ["自動曝光", "手動曝光", "自動包圍"][x.em], "模式"]);
  if (x.mm && MM[x.mm]) st.push([gMeter(x.mm), MM[x.mm], "測光"]);
  if (x.fla != null) st.push([gBolt(x.fla & 1), x.fla & 1 ? "有閃" : "沒閃", "閃光燈"]);
  if (x.wb != null) st.push([gWb(x.wb), x.wb ? "手動" : "自動", "白平衡"]);
  if (x.sc && SC[x.sc]) st.push([gDial("SCN"), SC[x.sc], "場景"]);
  if (p.g && p.g[2] != null) kv.push(["海拔", `${Math.round(p.g[2])} 公尺`, gMtn]);
  if (p.g && p.g[3] != null) kv.push(["拍攝方向", `${DIR8[Math.round(p.g[3] / 45) % 8]}（${p.g[3]}°）`, gArrow(p.g[3])]);
  if (p.g) kv.push(["座標", `${p.g[0].toFixed(5)}, ${p.g[1].toFixed(5)}`]);
  if (x.sw) kv.push(["軟體", x.sw]);
  kv.push(["檔名", p.n.split("/").pop()]);
  if (st.length) h += `<div class="ibox iset${st.length === 5 ? " w3" : ""}" style="--n:${st.length === 5 ? 3 : Math.min(st.length, 4)}">${st.map(([g, v, k]) => `<div>${g}<b>${esc(v)}</b><small>${k}</small></div>`).join("")}</div>`;
  h += `<div class="ibox ikv">${kv.filter(r => r[1]).map(([k, v, g]) => `<div><span>${k}</span><b>${g || ""}${esc(v)}</b></div>`).join("")}</div>`;
  if (D.dl) h += `<div class="idl"><a class="pr" href="${src(p, "o")}" download>${I("dl")}${D.dl > 1 ? (isVid(p) ? "下載影片" : "下載原圖") : "下載"}</a></div>`;
  return h;
}

boot();
