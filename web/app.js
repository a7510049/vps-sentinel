const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function store(k, v){ try { if (v === undefined) return localStorage.getItem(k) || ""; v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch(e){ return ""; } }
const KEY = "vps-sentinel-token";
/* 記錄是否從手機主畫面獨立啟動，供安全區與全頁工具使用。 */
if (navigator.standalone || matchMedia("(display-mode: standalone)").matches)
  document.documentElement.classList.add("full");
/* 登入狀態：勾「30 天內不用再登入」存在這台裝置 30 天；沒勾的話關掉瀏覽器（或 App）就要重新登入 */
const DAY30 = 30 * 86400000;
function sstore(k, v){ try { if (v === undefined) return sessionStorage.getItem(k) || ""; v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch(e){ return ""; } }
function getTok(){
  if (window._tok) return window._tok;
  const t = store(KEY);
  if (t) {
    const exp = +store(KEY + "-exp");
    if (!exp) store(KEY + "-exp", String(Date.now() + DAY30));      // 舊版存的：從現在開始算 30 天
    else if (exp < Date.now()) { store(KEY, ""); store(KEY + "-exp", ""); return sstore(KEY) === "1" ? "cookie" : sstore(KEY) || ""; }
    return t === "1" ? "cookie" : t;
  }
  const s = sstore(KEY);
  return s === "1" ? "cookie" : s || "";
}
function setTok(t, remember){
  if (remember === undefined) remember = !!store(KEY) || !sstore(KEY);   // 換密碼時：維持原本的記住方式和期限
  else store(KEY + "-exp", remember && t ? String(Date.now() + DAY30) : "");
  const mark = t ? (t === "cookie" || /^vss_/.test(t) ? "1" : "") : "";  // 真實登入鑰匙改由主機 HttpOnly Cookie 保存，瀏覽器儲存區只留登入旗標
  store(KEY, remember ? mark : ""); sstore(KEY, remember ? "" : mark);
  if (!t) store(KEY + "-exp", "");
  window._tok = t && !mark ? t : "";
}
/* 連不上主機時（例如主機正在重新啟動），瀏覽器給的錯誤是英文，換成看得懂的中文 */
/* 換密碼、關 PIN 碼這類動作：主機回「要先確認是你」時，先問 PIN 碼／手機金鑰／密碼，再帶著答案送一次 */
const api = async (path, opt) => {
  const go = o => fetch(path, o).catch(() => { throw new Error("連線失敗，請稍後再試"); });
  const r = await go(opt);
  if (r.status !== 403 || !opt || !opt.headers) return r;
  const d = await r.clone().json().catch(() => ({}));
  return d.recheck && await recheckAsk(a => go({...opt, headers:{...opt.headers, "X-Recheck": b64j(a)}})) || r;
};
const b64j = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
if (window._t0) { window._t0_keep = true; setTok(window._t0, true); window._t0 = ""; }   // 網址上的密碼已經在 index.html 最前面拿掉了

/* ═════════ 圖示 ═════════ */
const P = {
  cpu:'<rect x="5" y="5" width="14" height="14" rx="2.5"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  mem:'<rect x="2" y="6" width="20" height="11" rx="2"/><path d="M6 17v3M10 17v3M14 17v3M18 17v3M7 10v3M11 10v3M15 10v3"/>',
  disk:'<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01M10 16h.01"/>',
  down:'<path d="M12 4v15M18 13l-6 6-6-6"/>', up:'<path d="M12 20V5M6 11l6-6 6 6"/>',
  load:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  info:'<circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4M12 8h.01"/>',
  gauge:'<path d="M12 14l3.5-3.5"/><path d="M3.3 17a9.5 9.5 0 1 1 17.4 0"/><circle cx="12" cy="14" r="1.6"/>',
  net:'<path d="M7 20V5M3 9l4-4 4 4"/><path d="M17 4v15M21 15l-4 4-4-4"/>',
  trend:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  month:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M8 17v-3M12 17v-5M16 17v-2"/>',
  bell:'<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  layers:'<path d="m12 2 9.5 5L12 12 2.5 7z"/><path d="m2.5 12 9.5 5 9.5-5"/><path d="m2.5 17 9.5 5 9.5-5"/>',
  flag:'<path d="M4 22V4"/><path d="M4 4h13l-2.5 4.5L17 13H4"/>',
  alert:'<circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  devices:'<rect x="2" y="4" width="14" height="10" rx="2"/><path d="M5 18h8"/><rect x="16" y="9" width="6" height="11" rx="1.5"/><path d="M19 17h.01"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  more:'<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  ext:'<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H10"/>',
  cloud:'<path d="M17.5 19a4.5 4.5 0 1 0-1.3-8.8A6 6 0 0 0 4.6 12.5 3.5 3.5 0 0 0 6.5 19Z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>',
  pin:'<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7.5 12h.01M12 12h.01M16.5 12h.01"/>',
  archive:'<rect x="2.5" y="3.5" width="19" height="5" rx="1.5"/><path d="M4.5 8.5v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-10M10 12.5h4"/>',
  finger:'<path d="M12 10a2 2 0 0 0-2 2c0 1-.1 2.5-.26 4M14 13.1c0 2.4 0 6.4-1 8.9M17.3 21c.1-.6.4-2.3.5-3M2 12a10 10 0 0 1 18-6M2 16h.01M21.8 16c.2-2 .13-5.35 0-6M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2M8.65 22c.2-.66.45-1.3.57-2M9 6.8a6 6 0 0 1 9 5.2v2"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  quote:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
  trash:'<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  full:'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  share:'<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 13.3 7.4 4.4M15.7 6.3l-7.4 4.4"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  chev:'<path d="m6 9 6 6 6-6"/>', back:'<path d="M19 12H5M12 19l-7-7 7-7"/>', check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  tools:'<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  log:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>',
  warn:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
  ok:'<circle cx="12" cy="12" r="9.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>', chk:'<path d="m5.5 12.5 4.5 4.5 8.5-9.5"/>', bang:'<path d="M12 5v9M12 19h.01"/>',
  upd:'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  dl:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upl:'<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
  qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17.5 21H21v-3.5"/>',
  plug:'<path d="M9 2v5M15 2v5"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  clock:'<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  reset:'<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 3.5V8H8"/>',
  radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="m12 12 6.4-6.4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  ban:'<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  lockok:'<rect x="4.5" y="10.5" width="15" height="11" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><path d="m9.3 16 1.9 1.9 3.6-3.8"/>',
  power:'<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  loc:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  mpin:'<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  plane:'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  tack:'<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  noad:'<rect x="2.5" y="5.5" width="19" height="13" rx="3"/><path d="m6.5 15 2-6 2 6M7.2 13h2.6M13.5 9v6h1.3a3 3 0 0 0 0-6z"/><path d="m4 3 16 18"/>',
  album:'<rect x="3" y="7" width="14" height="14" rx="2.5"/><path d="M7 3h11a3 3 0 0 1 3 3v11"/><circle cx="8.5" cy="12" r="1.5"/><path d="m17 17.5-4-4-7.5 7.5"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  chat:'<path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l.9-4.1A8 8 0 1 1 20 12Z"/>',
  heart:'<path d="M12 20.5S3.5 15.3 3.5 9.2A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.5 2.6c0 6.1-8.5 11.3-8.5 11.3Z"/>',
  music:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  note:'<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4M2 10h4M2 14h4M2 18h4"/><path d="M21.4 5.6a2.1 2.1 0 1 0-3-3L13 8l-1 4 4-1z"/>',
  off:'<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M2 2l20 20"/>',
};
P.server = '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>';
P.palette = '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 9.8C22 6 17.5 3 12 3z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15.5" cy="7.5" r="1"/>';
P.copy = '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
P.moon = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
const I = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;

/* ═════════ 個人設定（存在這台裝置） ═════════ */
const DEF = {theme:"auto", accent:"blue", tone:"soft", motion:true, size:"m", refresh:5,
  show:{chart:true, net:true, items:true, info:true, flag:true, traffic:true, weather:true, quote:false}};
let PREF = (() => { try { const p = JSON.parse(store("vps-prefs") || "{}"); if (p.accent === "flag") p.accent = "rainbow";   /* 舊的「旗」換成彩虹 */ return {...DEF, ...p, show:{...DEF.show, ...(p.show||{})}}; } catch(e){ return JSON.parse(JSON.stringify(DEF)); } })();
const getP = k => k.split(".").reduce((o,x)=>o && o[x], PREF);
function setP(k, v){ const ks = k.split("."); let o = PREF; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; store("vps-prefs", JSON.stringify(PREF)); }
const DARKQ = matchMedia("(prefers-color-scheme: dark)");
function applyPrefs(){
  const h = document.documentElement, dark = PREF.theme === "dark" || (PREF.theme === "auto" && DARKQ.matches);
  h.dataset.mode = dark ? "dark" : "light"; h.dataset.accent = PREF.accent; h.dataset.tone = PREF.tone; h.dataset.motion = PREF.motion ? "on" : "off";
  h.style.setProperty("--zoom", {s:.92, m:1, l:1.1}[PREF.size] || 1);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#1c2433" : "#ffffff";
}
DARKQ.addEventListener("change", applyPrefs);
applyPrefs();

/* ═════════ 小工具 ═════════ */
const DESK = matchMedia("(min-width: 1024px)");
let LIST = [];
function size(b){ if(!b) return "0 B"; const u=["B","KB","MB","GB","TB"]; let i=0; while(b>=1024&&i<4){b/=1024;i++} return (b<10&&i?b.toFixed(1):Math.round(b))+" "+u[i]; }
const rate = b => size(b)+"/s";
function up(s){ const d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60);
  return d ? `${d} 天${h ? ` ${h} 小時` : ""}` : h ? `${h} 小時${m ? ` ${m} 分` : ""}` : `${m} 分鐘`; }   // 「15 天 0 小時」只寫「15 天」
const num = (v, d=0) => `<span class="num" data-v="${(+v).toFixed(d)}" data-d="${d}">${(+v).toFixed(d)}</span>`;
const keyOf = s => s.node || "@self";            // 這台自己用固定代號：改名後打開的頁面、選的主機都不會跑掉
const lvOf = s => ["ok","warn","bad"].includes(s.level) ? s.level : s.online ? "ok" : "bad";
const tier = p => p>=90 ? "b" : p>=75 ? "w" : "";
const STATE = {running:"執行中",exited:"已停止",restarting:"重啟中",paused:"暫停",created:"未啟動",dead:"故障",
  active:"執行中",inactive:"未執行",failed:"失敗",activating:"啟動中",unknown:"未知"};
let REGION; try { REGION = new Intl.DisplayNames(["zh-TW"], {type:"region"}); } catch(e) {}
const FLAGFAIL = {};
function flag(cc){
  if (!/^[A-Z]{2}$/.test(cc||"")) return "";
  const emo = String.fromCodePoint(...[...cc].map(c=>127397+c.charCodeAt(0)));
  if (FLAGFAIL[cc]) return `<span class="emoji">${emo}</span>`;
  return `<img class="flag" src="/flag/${cc.toLowerCase()}.png" alt="${emo}" title="${esc(regionOf(cc))}" data-cc="${cc}">`;  /* 外層 .fw 會留著，發光不會跑掉 */
}
/* 國旗抓不到：換成表情符號（網頁只跑登記過的程式，標籤上不能直接寫程式） */
document.addEventListener("error", e => {
  const im = e.target;
  if (!(im instanceof HTMLImageElement) || !im.classList.contains("flag") || !im.dataset.cc) return;
  FLAGFAIL[im.dataset.cc] = 1;
  im.outerHTML = `<span class="emoji">${esc(im.alt)}</span>`;
}, true);
const regionOf = cc => { try { return REGION && /^[A-Z]{2}$/.test(cc) ? REGION.of(cc) : cc; } catch(e) { return cc; } };   // 國家代碼打錯也不會讓整頁打不開
/* 地點：名稱裡已經有的國家、城市不再寫一次（「香港」不會寫成「香港／香港」，「日本」下面只寫「東京」） */
const place = s => { if (!s.geo) return ""; const n = String(s.name || "");
  return [s.geo.cc ? regionOf(s.geo.cc) : "", s.geo.city].filter(x => x && !(n && (n.includes(x) || x.includes(n)))).filter((x, i, a) => a.indexOf(x) === i).join(" "); };
function when(t){ const d=new Date(t*1000), now=new Date();
  const hm=d.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false});
  return d.toDateString()===now.toDateString() ? `今天 ${hm}` : `${d.getMonth()+1}/${d.getDate()} ${hm}`; }
/* 「3 分鐘前」「昨天 19:42」這種好讀的時間 */
function ago(t){
  const d = Date.now()/1000 - t, dt = new Date(t*1000), now = new Date();
  const hm = dt.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false});
  if (d < 45) return "剛剛";
  if (d < 3570) return `${Math.max(1, Math.round(d/60))} 分鐘前`;
  if (d < 3600) return "1 小時前";
  if (d < 6*3600) return `${Math.floor(d/3600)} 小時前`;
  if (dt.toDateString() === now.toDateString()) return `今天 ${hm}`;
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (dt.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${dt.getMonth()+1}/${dt.getDate()} ${hm}`;
}
const seen = s => s.last_seen ? `最後連上：${ago(s.last_seen)}` : "";
const safeUrl = u => /^https?:\/\/[^\s"'<>]+$/i.test(u || "") ? u : "";
const linksOf = s => (s.links || (s.panel ? [{name:"管理後台", url:s.panel}] : []))
  .map(x => x.fixed && s.cloud ? {...x, url: cloudHref(s.cloud), sso: keyOf(s)} : x).filter(x => safeUrl(x.url));
/* 雲端硬碟開啟前先確認身分，再提交一次性登入票。 */
const cloudHref = c => c.url;
const ssoAttr = s => s.cloud ? ` data-sso="${esc(keyOf(s))}"` : "";
function cloudSubmit(t, target){
  const f = document.createElement("form"), i = document.createElement("input");
  Object.assign(f, {method: "post", action: t.login, target, rel: "noopener noreferrer", hidden: true});
  Object.assign(i, {type: "hidden", name: "t", value: t.ticket});
  f.append(i); document.body.append(f); f.submit(); f.remove();
}
async function openCloud(s, here){
  if (!s || !s.cloud) return;
  const has = await pkCall("/api/passkey-login", {action:"has"}).catch(() => ({}));
  const t = await pinAsk({title: "打開雲端硬碟", sub: s.name, icon: "cloud", pin: !!has.pin, passkey: PK_OK && !!has.has,
    send: c => pkCall("/api/cloud-open", {...c, node: s.node || ""}, 1)});
  if (!t || !t.ticket || !safeUrl(t.login)) return;
  if (here) return cloudSubmit(t, "_self");
  const w = window.open("", "vscloud");                 // 驗證完馬上開新分頁；被瀏覽器擋下來就給一顆按鈕再按一次
  if (w) return cloudSubmit(t, "vscloud");
  modal({icon: ICO.cloud[1], cls: "cloud", title: "雲端硬碟", text: "驗證好了", ok: "打開"}).then(go => { if (go) cloudSubmit(t, "_blank"); });
}
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest("a[data-sso]");
  if (!a || e.button !== 0) return;
  e.preventDefault();
  onceClick(a, () => openCloud(LIST.find(x => keyOf(x) === a.dataset.sso)));
}, true);
const linkSt = x => x.up === false ? x.err || "連不上" : x.up ? `${x.ms} 毫秒` : x.err ? "確認中…" : "還沒檢查";
/* 連結的訊號格：越快格數越多，打不開是一格紅的 */
const linkSig = x => { const n = x.up === false ? 1 : x.up ? (x.ms < 200 ? 3 : x.ms < 600 ? 2 : 1) : 0, c = x.up === false ? "bad" : x.up ? "ok" : "";
  return `<span class="sig ${c}" title="${x.up === false ? "打不開" : x.up ? "正常" : ""}">${[0, 1, 2].map(i => `<i${i < n ? ' class="on"' : ""}></i>`).join("")}</span>`; };
/* 主機名稱旁的「⋯」：編輯、重新開機、移除（雲端硬碟、下載、連結都在「工具」） */
const moreBtn = s => (s.online || s.node) ? `<button class="iconbtn" title="更多" data-more="${esc(keyOf(s))}">${I("more")}</button>` : "";
/* 處理器、記憶體、主要磁碟的百分比下面的大數字已經有了，提示只寫發生什麼事 */
function noDup(s, p){
  const d0 = disk0(s);
  return p.replace(/^處理器持續偏高 \d+(\.\d+)?%$/, "處理器持續偏高").replace(/^記憶體 \d+(\.\d+)?%$/, "記憶體快用完了")
    .replace(/^磁碟 (\S+) 剩下不多（\d+(\.\d+)?%）$/, (m, path) => d0 && d0.path === path ? "磁碟快滿了" : m);
}
/* 處理器、記憶體、主要磁碟的問題：主機頁上那一格已經變紅，紅條就不再寫一次 */
function tileKey(s, p){
  p = String(p); if (/^處理器持續偏高 /.test(p)) return "cpu"; if (/^記憶體 \d/.test(p)) return "mem";
  const m = p.match(/^磁碟 (\S+) 剩下不多/), d0 = disk0(s); return m && d0 && d0.path === m[1] ? "disk" : "";
}
const tileProb = s => Object.fromEntries((s.problems || []).map(p => [tileKey(s, p), 1]).filter(x => x[0]));
/* 狀況改成小膠囊：圖示＋名稱，壞掉的加紅叉（完整的句子放在 title，滑鼠指著、讀屏都看得到）；認不得的照原句 */
const ALX = `<i class="alx">${I("x")}</i>`, ALB = `<i class="alx">${I("bang")}</i>`;
const ALC = [
  [/^處理器持續偏高/, "cpu", () => "偏高"], [/^記憶體/, "mem", () => "快用完"],
  [/^磁碟 (\S+) 剩下不多（(\d+)/, "disk", m => `${m[1]} ${m[2]}%`], [/^磁碟快滿了$/, "disk", () => "快滿"],
  [/^容器 (.+) 停止$/, "box", m => esc(m[1]) + ALX], [/^容器 (.+) 不健康$/, "box", m => esc(m[1]) + ALB],
  [/^服務 (.+) 沒在執行$/, "gear", m => esc(m[1]) + ALX], [/^「(.+)」打不開$/, "link", m => esc(m[1]) + ALX],
  [/^「(.+)」的安全憑證過期了$/, "key", m => esc(m[1]) + ALX], [/^「(.+)」的安全憑證 (\d+) 天後到期$/, "key", m => `${esc(m[1])} <b>${m[2]} 天</b>`],
  [/^本月流量已經用完$/, "month", () => "用完" + ALX], [/^本月流量已用 (\d+)%$/, "month", m => `<b>${m[1]}%</b>`], [/^本月流量預計會超過/, "month", () => "會超過"],
  [/^需要重新開機$/, "power", () => "要重開"], [/^雲端硬碟快滿了（(\d+)/, "cloud", m => `<b>${m[1]}%</b>`],
  [/^IPv6 連不出去$/, "net", () => "IPv6" + ALX], [/^IPv6 位址不見了$/, "net", () => "IPv6 不見"],
  [/^(\d+) 個安全更新$/, "shield", m => `<b>${m[1]}</b>`], [/^(\d+) 天沒有成功備份$/, "archive", m => `<b>${m[1]} 天</b>`], [/^備份還沒成功過$/, "archive", () => "沒成功過"],
  [/^SSH 允許空密碼登入$/, "key", () => "SSH 空密碼" + ALX], [/^root 能用密碼登入 SSH$/, "key", () => "root 密碼" + ALX],
  [/^SSH 能用密碼登入$/, "key", () => "SSH 密碼"],
  [/^AdGuard Home 停了$/, "noad", () => "AdGuard" + ALX], [/Oracle|太閒/, "cpu", () => "太閒"]];
function alChip(p, cls, key){
  for (const [re, ic, f] of ALC) { const m = p.match(re); if (m) return `<span class="alert ${cls}" data-key="${key}" title="${esc(p)}">${I(ic)}<span>${f(m)}</span></span>`; }
  return `<span class="alert ${cls} long" data-key="${key}">${I(cls === "bad" ? "warn" : "alert")}<span>${esc(p)}</span></span>`;
}
function alerts(s, inTile){
  const k = t => esc(String(t).replace(/^\d+\s*|\s*[（(]?\d+(\.\d+)?\s*%[）)]?$/g, ""));   // 只拿掉會變的數字，名稱裡的數字要留（app-1、app-2 是兩件事）
  const al = (s.problems||[]).filter(p => !(inTile && tileKey(s, p))).map(p => noDup(s, String(p))).map(p => alChip(p, "bad", "b:" + k(p)))
    .concat((s.notices||[]).map(p => alChip(String(p), "warn", "w:" + k(p))));
  return al.length ? `<div class="alerts" data-key="al" data-keyed>${al.join("")}</div>` : "";
}
function itemsOf(s){
  const items = [];
  (s.containers||[]).forEach(c=>{
    const st = /unhealthy/.test(c.status) ? "bad" : c.state==="running" ? "ok"
      : (c.state==="created" || c.state==="paused" || /Exited \(0\)/.test(c.status)) ? "off" : "bad";
    const g = c.project || "", short = g && c.name.startsWith(g + "-") ? c.name.slice(g.length + 1) : c.name;
    items.push({n:c.name, sn:short, g, st, s:STATE[c.state]||c.state, t:"容器"});
  });
  const rank = {bad:0, ok:1, off:2};
  items.sort((a, b) => (a.g === b.g ? 0 : !a.g ? 1 : !b.g ? -1 : a.g.localeCompare(b.g)) || rank[a.st] - rank[b.st] || a.sn.localeCompare(b.sn));
  (s.services||[]).forEach(v=>items.push({n:v.name, sn:v.name, g:"系統服務", st:v.state==="active"?"ok":"bad", s:STATE[v.state]||v.state, t:"服務"}));
  return items;
}
/* 版本、更新數量：小標籤（打勾＝已經是最新） */
const VOK = t => `<span class="vbs"><span class="vbd ok">${I("chk")}${t}</span></span>`;
function updateInfo(s){
  const n = s.updates ? s.updates.total : 0, u = s.update;
  if (u && u.running) return n ? `正在安裝 ${n} 個更新…` : `正在檢查更新…`;
  let info = s.updates ? (n ? `<span class="vbs"><span class="vbd" title="${n} 個更新可安裝">${I("box")}<b class="num">${n}</b></span>${s.updates.security ? `<span class="vbd w" title="${s.updates.security} 個安全性更新">${I("shield")}<b class="num">${s.updates.security}</b></span>` : ""}</span>` : VOK("最新")) : "";
  if (u && u.last) info += `${info?"<br>":""}上次更新${u.last.ok?"成功":`<span style="color:var(--bad)">失敗</span>`}・${when(u.last.time)}`;
  return info;
}
/* 按鈕永遠是同一個樣子（只在進行中變淡、不能按），進度和結果都寫在左邊的說明文字 */
function updateBtn(s){
  const u = s.update, n = s.updates ? s.updates.total : 0;
  if (!u || !u.supported) return "";
  return `<button class="ubtn sm" data-update="${esc(s.node||"")}" data-label="${esc(s.name)}" data-n="${n}" ${u.running ? "disabled" : ""}>${I("upd").replace("<svg","<svg style=\"width:15px;height:15px\"")}檢查更新</button>`;
}
/* ═════════ 心情小語：問候下面一句，依時段挑；同一天同一時段固定同一句，自動更新時不會一直換 ═════════ */
const QUOTES = {
  night: ["夜深了，主機幫你顧著", "累了就先睡吧，明天再說", "今天辛苦了", "把煩惱留給明天的自己", "安靜的夜，適合好好休息",
    "星星都睡了，你也早點睡", "別熬太晚，身體最重要", "今天到這裡就很好了", "關上螢幕，讓眼睛休息一下", "好夢，明天見",
    "深夜的你，也值得被溫柔對待", "睡飽了，什麼都會順一點"],
  morning: ["新的一天，慢慢來就好", "先喝杯水，再開始今天", "今天也會是不錯的一天", "早晨的陽光是免費的", "深呼吸，出發吧",
    "給自己一個微笑再出門", "一步一步來，不用急", "今天的你，比昨天多懂一點", "吃個早餐，好好開始", "願今天事事順心",
    "早起的你很棒", "今天也要對自己好一點", "晴天雨天，都是好日子", "從一件小事開始就好"],
  noon: ["記得吃午餐", "休息一下，下午更有精神", "吃飽了再繼續", "伸個懶腰，轉轉脖子", "中午了，讓腦袋放空幾分鐘",
    "好好吃一頓，是對自己好", "喝點水，別只喝咖啡", "上午辛苦了", "曬曬太陽，充個電", "慢慢吃，不趕時間"],
  afternoon: ["下午茶時間到了", "累了就起來走一走", "再撐一下，快下班了", "來點甜的，心情會好", "眼睛酸了就看看遠方",
    "事情做不完也沒關係", "一杯咖啡，一點好心情", "今天已經過了一大半，你做得很好", "別忘了喝水", "放慢一點，效率反而更好",
    "給自己一點小獎勵", "窗外的天空看了嗎"],
  evening: ["今天辛苦了", "下班了，好好放鬆", "吃頓好的，犒賞自己", "把今天放下，晚上是你的", "跟喜歡的人說說話吧",
    "洗個熱水澡，舒服一下", "今天的不順，就留在今天", "聽首喜歡的歌", "晚上就別想工作了", "慢慢來，明天還有機會",
    "好好休息，才走得更遠", "今晚早點睡吧", "謝謝今天努力的自己", "晚風很舒服，出去走走也不錯"],
};
function quoteOf(h){
  const k = h < 5 ? "night" : h < 11 ? "morning" : h < 14 ? "noon" : h < 18 ? "afternoon" : "evening", L = QUOTES[k];
  const d = new Date(), seed = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${k}`;
  let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return L[x % L.length];
}

/* ═════════ 天氣：問候旁邊顯示目前位置的天氣和小提醒 ═════════ */
// 位置用瀏覽器定位（只取到小數點後 2 位，約 1 公里），天氣問 Open-Meteo（免費、不用帳號）。
// 不給定位、抓不到或網路不通，就安靜地不顯示；位置記 6 小時、天氣記 30 分鐘，不會每次打開都問。
const WXK = "vps-wx";
let WX = null, wxTimer = 0;
const wxMem = () => { try { return JSON.parse(store(WXK) || "{}"); } catch(e) { return {}; } };
const WXV = 2;                                   // 提醒的寫法改過：舊版存的天氣不用，重新抓
(() => { const m = wxMem(); if (m.data && m.data.v === WXV && Date.now() - m.dt < 3 * 3600e3) WX = m.data; })();
function wxWord(c, day){
  const W = [[0, day ? "☀️" : "🌙", "晴朗"], [1, day ? "🌤️" : "🌙", "大致晴朗"], [2, "⛅", "多雲"], [3, "☁️", "陰天"], [48, "🌫️", "有霧"],
    [57, "🌦️", "毛毛雨"], [61, "🌧️", "小雨"], [63, "🌧️", "下雨"], [67, "🌧️", "大雨"], [77, "🌨️", "下雪"],
    [81, "🌦️", "陣雨"], [82, "⛈️", "大陣雨"], [86, "🌨️", "陣雪"], [99, "⛈️", "雷雨"]];
  return W.find(([n]) => c <= n) || W[W.length - 1];
}
function wxTip(d){
  const c = d.current, code = c.weather_code, feel = c.apparent_temperature;
  if (code >= 95) return "外面在打雷，盡量待在室內";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "外面在下雨，出門記得帶傘";
  if ((code >= 71 && code <= 77) || code >= 85) return "外面在下雪，路面小心";
  const now = d.hourly.time.indexOf(c.time.slice(0, 14) + "00"), from = Math.max(0, now);
  const rain = d.hourly.precipitation_probability.slice(from + 1, from + 10).findIndex(p => p >= 50);
  if (rain >= 0) {
    const h = (+d.hourly.time[from + 1 + rain].slice(11, 13));
    const when = h < 5 ? "半夜" : h < 11 ? "早上" : h < 14 ? "中午" : h < 17 ? "下午" : h < 19 ? "傍晚" : "晚上";
    return `${when}可能下雨，出門帶把傘`;
  }
  if (feel >= 33) return "很熱，記得多喝水";
  if (c.is_day && Math.max(...d.hourly.uv_index.slice(from, from + 4)) >= 8) return "紫外線很強，注意防曬";
  if (feel <= 5) return "很冷，注意保暖";
  if (feel <= 12) return "有點涼，多穿一件";
  const hi = Math.round(d.daily.temperature_2m_max[0]), lo = Math.round(d.daily.temperature_2m_min[0]);
  if (hi - lo >= 10) return "早晚溫差大，帶件外套";
  return `今天 ${lo}–${hi}°，適合出門`;              // 沒有要特別注意的：至少給今天的溫度範圍
}
function wxRun(){
  clearTimeout(wxTimer);
  if (!PREF.show.weather || !navigator.geolocation) return;
  wxTimer = setTimeout(wxRun, 30 * 60e3);
  const m = wxMem(), now = Date.now();
  if (m.deny && now - m.deny < 3 * 86400e3) return;            // 剛拒絕定位：3 天內不再問
  if (m.data && m.data.v === WXV && now - m.dt < 30 * 60e3) return;
  const go = async (lat, lon) => {
    try {
      const q = `latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,is_day`
        + `&hourly=precipitation_probability,uv_index&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`;
      const r = await fetch("https://api.open-meteo.com/v1/forecast?" + q, {signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined});
      if (!r.ok) return;
      const d = await r.json(), c = d.current, [, icon, word] = wxWord(c.weather_code, c.is_day);
      WX = {icon, word, t: Math.round(c.temperature_2m), tip: wxTip(d), v: WXV};
      store(WXK, JSON.stringify({lat, lon, at: m.lat === lat && m.lon === lon && m.at ? m.at : now, data: WX, dt: Date.now()}));
      if (LIST.length) render(LIST);
    } catch(e) {}
  };
  if (m.lat != null && now - m.at < 6 * 3600e3) return go(m.lat, m.lon);
  navigator.geolocation.getCurrentPosition(p => {
    const lat = +p.coords.latitude.toFixed(2), lon = +p.coords.longitude.toFixed(2);
    m.lat = lat; m.lon = lon; m.at = Date.now(); store(WXK, JSON.stringify(m));
    go(lat, lon);
  }, e => { if (e.code === 1) store(WXK, JSON.stringify({deny: Date.now()})); }, {timeout: 15000, maximumAge: 3600e3});
}

/* ═════════ 曲線圖 ═════════ */
function pathOf(vals, W, H, max, xs){
  if (!vals || vals.length < 2) return null;
  const n = vals.length, y = v => H - Math.max(0, Math.min(v/max, 1)) * (H-4) - 2, x = i => xs ? xs[i] : i/(n-1)*W;
  const d = vals.map((v,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return {line:d, area:`${d} L${W},${H} L${x(0).toFixed(1)},${H} Z`};
}
/* 換算成固定點數：點多就每段取平均（保留尖峰的一半高度），點少就線性補 */
function resample(v, n){
  if (!v || v.length < 2) return v;
  if (v.length === n) return v;
  const out = new Array(n);
  if (v.length > n) {
    const step = v.length / n;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
      let sum = 0, mx = -Infinity;
      for (let j = a; j < b; j++) { sum += v[j]; if (v[j] > mx) mx = v[j]; }
      out[i] = (sum / (b - a) + mx) / 2;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const p = i * (v.length - 1) / (n - 1), a = Math.floor(p), f = p - a;
      out[i] = v[a] + ((v[a + 1] ?? v[a]) - v[a]) * f;
    }
  }
  return out;
}
/* 刻度用的整齊數字：1、2、5、10… */
function niceMax(v, bin){
  if (bin) { const u = Math.pow(1024, Math.max(0, Math.floor(Math.log(v) / Math.log(1024)))); return niceMax(v / u) * u; }
  const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
const CHD = {};                       // 每張曲線圖的原始資料（滑鼠移上去顯示數值用）
/* 每條曲線固定 2N 個點（前 N 個是已經滑出左邊的舊資料，換時間範圍時才能平順變形）。
   30 分鐘的照時間放：新資料進來時整條往左滑（data-tf：新位置換回舊位置的比例和位移），不是原地扭動 */
function chart(id, series, o={}){
  const N = o.n || 180, raw = series, W = 600, H = o.h || 170, prev = CHD[id], t = o.t || [];
  const live = o.rg === "30m" && t.length >= 2;
  let xs = null, tf = "";
  if (live) {
    const k = Math.min(N, t.length, ...series.map(s => (s.data || []).length)), tw = t.slice(-k), s1 = tw[0], span = (tw[k - 1] - s1) || 1;
    const old = prev && prev.rg === "30m" && prev.pre ? prev : null;
    // 已經滑出左邊的舊資料（上一次的左邊＋上一次畫面裡、這次切掉的），滑動時左邊才不會空一塊
    const ot = old ? old.pre.t.concat(old.t) : [], idx = ot.map((x, i) => x < s1 ? i : -1).filter(i => i >= 0).slice(-N);
    const pre = {t: idx.map(i => ot[i]), v: series.map((s, j) => { const ov = old ? old.pre.v[j].concat(old.ser[j] ? old.ser[j].data : []) : []; return idx.map(i => +ov[i] || 0); })};
    const pad = (a, n) => a.length >= n ? a.slice(-n) : Array(n - a.length).fill(a[0]).concat(a);
    const X = tt => (tt - s1) / span * W;
    xs = pad(pre.t.length ? pre.t.map(X) : [0], N).concat(pad(tw.map(X), N));
    series = series.map((s, j) => { const w = (s.data || []).slice(-k);
      return {...s, data: pad(pre.t.length ? pre.v[j] : [w[0]], N).concat(pad(w, N))}; });
    if (old && old.span) tf = [span / old.span, (s1 - old.s1) / old.span * W];
    o._s = {s1, span, pre};
  } else series = series.map(s => { const d = resample(s.data, N); return {...s, data: d && d.length ? Array(N).fill(d[0]).concat(d) : d}; });
  const all = series.flatMap(s => (s.data || []).slice(-N));
  if (all.length < 4) return `<div class="wait" style="height:${H}px">收集資料中…</div>`;
  const max = o.max || (o.grid ? niceMax(Math.max(1, ...all) * 1.1, o.bin) : Math.max(1, ...all) * 1.2);
  if (tf) { const c = prev && prev.max ? max / prev.max : 1; tf = [tf[0], c, tf[1], (H - 2) * (1 - c)].map(v => +v.toFixed(5)).join(","); }
  if (o.t) CHD[id] = {t: o.t, ser: raw, fmt: o.fmt || (v => v), rg: o.rg, max, ...(o._s || {})};
  const yax = o.grid && o.fmt ? `<div class="yax">${[.25,.5,.75].map(f=>`<span style="top:${f*100}%">${o.fmt(max*(1-f))}</span>`).join("")}</div>` : "";
  let g = "";
  if (o.grid) for (const f of [.25,.5,.75]) g += `<line class="gl" x1="0" x2="${W}" y1="${(H*f).toFixed(1)}" y2="${(H*f).toFixed(1)}"/>`;
  const defs = series.map((s,i)=>`<linearGradient id="${id}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:${o.fade??.16}"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient>`).join("");
  const sl = tf ? ` data-tf="${tf}"` : "";
  const body = series.map((s,i)=>{ const p = pathOf(s.data, W, H, max, xs); if (!p) return "";
    return `<path d="${p.area}"${sl} fill="url(#${id}${i})"/><path d="${p.line}"${sl} fill="none" style="stroke:${s.color}" stroke-width="${o.sw||2.1}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>`; }).join("");
  return `<svg class="chart" ${o.t?`data-cid="${id}"`:""} viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px"><defs>${defs}</defs>${g}${body}</svg>${yax}`;
}
let RANGE = ["30m","24h","7d"].includes(store("vps-range")) ? store("vps-range") : "30m";
const HCACHE = {}, SHOWN = {};
function rangeSeg(){
  return `<span class="rng" data-slide style="--k:${["30m","24h","7d"].indexOf(RANGE)}">${[["30m","30分"],["24h","24時"],["7d","7天"]].map(([v,l])=>`<button class="${RANGE===v?"on":""}" data-range="${v}">${l}</button>`).join("")}</span>`;
}
/* 取得要畫的歷史：30 分鐘用即時資料；24 小時／7 天另外抓，快取 1 分鐘 */
function histFor(s){
  const h = histRaw(s);
  if (h && !h.err) SHOWN[keyOf(s)] = h;
  return h || SHOWN[keyOf(s)] || null;      // 新資料還沒到：先留著原本的曲線，到了再直接變形過去
}
function histRaw(s){
  if (RANGE === "30m") return s.hist;
  const k = keyOf(s) + "|" + RANGE, c = HCACHE[k];
  if (!c || Date.now() - c.at > 60000) {
    if (!c || !c.loading) {
      HCACHE[k] = {...(c || {}), loading: true, at: c ? c.at : 0};
      fetch(`/api/history?range=${RANGE}&node=${encodeURIComponent(s.node || "")}`, {headers:{"X-Token":getTok()}, signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined})
        .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || "讀取失敗")))
        .then(d => { HCACHE[k] = {at: Date.now(), data: d}; whenIdle(); })
        .catch(err => { HCACHE[k] = {at: Date.now(), err: typeof err === "string" ? err : "暫時讀不到，稍後自動重試"}; whenIdle(); });
    }
  }
  return c && c.data ? c.data : (c && c.err ? {err: c.err} : null);
}
function chartOr(h, id, series, o){
  if (!h) return `<div class="wait" style="height:${o.h||170}px">讀取中…</div>`;
  if (h.err) return `<div class="wait" style="height:${o.h||170}px">${esc(h.err)}</div>`;
  if (RANGE !== "30m" && (!h.t || h.t.length < 2)) return `<div class="wait" style="height:${o.h||170}px">${RANGE==="24h"?"約 10 分鐘":"約 1 小時"}後出現</div>`;
  return chart(id, series(h), {...o, t: h.t, rg: RANGE});
}
const cid = (s, k) => "g" + Math.abs([...keyOf(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))|0, 7)) + k;
const COL = {cpu:"var(--c-cpu)", mem:"var(--c-mem)", rx:"var(--c-rx)", tx:"var(--c-tx)"};
/* 概念 → [顏色樣式, 圖示] */
const ICO = {cpu:["cpu","cpu"], mem:["mem","mem"], disk:["disk","disk"], load:["load","gauge"], down:["down","down"], up:["up","up"],
  net:["net","net"], trend:["trend","trend"], month:["month","month"], box:["box","box"], bell:["bell","bell"], info:["info","info"],
  flag:["flag","flag"], keep:["keep","shield"], key:["key","key"], finger:["finger","finger"], pin:["pin","pin"], link:["link","link"], archive:["archive","archive"], sun:["sun","sun"], quote:["quote","quote"], dl:["dl","dl"], cloud:["cloud","cloud"], fly:["fly","plane"], devices:["devices","devices"], safe:["safe","lockok"], sky:["sky","radar"], note:["note","note"], dnsf:["dnsf","noad"], album:["album","album"]};
const IC = (k, cls="sm") => `<span class="ico ${cls} ${ICO[k][0]}">${I(ICO[k][1])}</span>`;

/* ═════════ 共用的小元件 ═════════ */
/* 標誌：Google 純色圓角方塊＋簡潔盾牌 */
const CHEV = I("chev").replace("<svg", '<svg class="chev"'), EXT = I("ext").replace("<svg", '<svg class="ext"');
/* 進度條：Google Material 3 圓角直條（靜止不蠕動，數值變了平順滑動） */
const wave = (pct, t = tier(pct)) => { const p = Math.max(0, Math.min(100, +pct || 0)); return `<div class="wv ${t}" style="--v:${p.toFixed(1)}%;--k:${Math.max(.02, p / 100).toFixed(3)}"><i></i></div>`; };
/* 下拉重新整理用的 Material 3 幾何形狀（只在真的正在更新時轉動） */
const blobSh = (k, a) => `polygon(${Array.from({length:96}, (_, i) => { const t = i / 96 * 2 * Math.PI, r = 50 * (1 - a * (1 - Math.cos(k * t)) / 2);
  return `${(50 + r * Math.sin(t)).toFixed(2)}% ${(50 - r * Math.cos(t)).toFixed(2)}%`; }).join(",")})`;
const disk0 = s => (s.disks || []).find(x => x.path === "/") || (s.disks || [])[0] || {pct:0, used:0, total:0};
const LOADW = lr => lr < .7 ? ["輕鬆", ""] : lr < 1 ? ["有點忙", "w"] : lr < 2 ? ["忙碌", "w"] : ["超載", "b"];
const WORD = {bad:"異常", warn:"注意", ok:"恢復", info:"通知"};

function greet(){
  const h = new Date().getHours();
  const on = PREF.show.weather && WX;
  return {quote: PREF.show.quote ? quoteOf(h) : "",
    wx: on ? `<div class="wx" data-key="wx"><span class="wi">${WX.icon}</span><div><b>${WX.t}°</b>${esc(WX.word)}${WX.tip ? `<small>${esc(WX.tip)}</small>` : ""}</div></div>` : ""};
}
/* 一句話說完現在的狀況 */
function issuesOf(list){
  const out = [];
  for (const s of list) {
    if (!s.online) { out.push({s, t:""}); continue; }
    (s.problems || []).forEach(t => out.push({s, t}));
    (s.notices || []).forEach(t => out.push({s, t}));
  }
  return out;
}
let LOST = false, LOST0 = 0, lastUpdate = ""; // 最後成功讀到資料的時間，切換畫面時沿用
/* ═════════ 事件 ═════════ */
/* 同一件事反覆發生：只留最新一筆，標上次數 */
function mergeEv(ev){
  const m = new Map();
  for (const e of ev) { const k = e.kind + ":" + e.text, x = m.get(k); x ? x.n++ : m.set(k, {...e, n:1}); }
  return [...m.values()];
}
/* 所有主機的事件合在一起，新的在上面 */
const allEvents = list => list.flatMap(s => mergeEv(s.events || []).map(e => ({...e, h: s.name, k: keyOf(s)}))).sort((a, b) => b.t - a.t);
/* 好幾台在 10 分鐘內發生同一件事：合成一筆「日本等 5 台」，不用一台一筆往下滑 */
function groupEv(ev){
  const out = [], open = new Map();
  for (const e of ev) {                          // 新的在前面
    const k = e.kind + ":" + e.text, g = open.get(k);
    if (g && g.t - e.t <= 600 && !g.ks.includes(e.k)) { g.hs.push(e.h); g.ks.push(e.k); continue; }
    const x = {...e, hs:[e.h], ks:[e.k]}; open.set(k, x); out.push(x);
  }
  return out.map(x => x.hs.length > 1 ? {...x, k:JSON.stringify([x.kind, x.text, x.t]), n:1} : x);
}
const hm = t => new Date(t * 1000).toLocaleTimeString("zh-TW", {hour:"2-digit", minute:"2-digit", hour12:false});
const EVOPEN = new Set();                   // 好幾台合成一筆的事件：點開列出是哪幾台（記住哪幾筆是打開的，自動更新不會收起來）
const evMany = e => e.hs && e.hs.length > 1;
/* 好幾台同一件事：疊在一起的國旗（沒有國旗用名字第一個字）＋台數，點了列出是哪幾台 */
const hsMini = n => { const s = LIST.find(x => x.name === n), f = PREF.show.flag && s && s.geo ? flag(s.geo.cc) : "";
  return f ? `<span class="hsa">${f}</span>` : `<span class="hsa l">${esc([...(n || "?")][0])}</span>`; };
const evWho = e => evMany(e) ? `<button class="eh stk" data-evx="${esc(e.k)}" aria-expanded="${EVOPEN.has(e.k)}" title="${esc(e.hs.join("、"))}" aria-label="${esc(e.hs[0])}等 ${e.hs.length} 台"><span class="hst">${e.hs.slice(0, 3).map(hsMini).join("")}</span><b class="num">${e.hs.length}</b><i>▾</i></button>` : `<span class="eh">${esc(e.h)}</span>`;
/* 事件前面的圖示：照內容挑（登入鑰匙、重新開機電源…），顏色是狀態（紅異常、橘注意、綠恢復、主題色通知） */
const EVI = [[/登入|PIN|金鑰|密碼/, "key"], [/重新開機|開機|重開/, "power"], [/備份|還原/, "archive"], [/更新|新版/, "upd"], [/憑證|https|TLS/i, "shield"],
  [/記憶體/, "mem"], [/磁碟|硬碟/, "disk"], [/處理器|負載/, "cpu"], [/流量/, "month"], [/下載/, "dl"], [/Telegram|通知/, "bell"], [/連不上|連線|離線|上線|網路|IPv/, "net"], [/容器|Docker/i, "box"], [/服務/, "layers"]];
/* 圖示已經說是容器、服務，字就不再寫一次（「容器 n8n 停止」→「n8n 停止」） */
const evTx = e => esc(String(e.text).replace(/(^|：)(容器|服務) /g, "$1"));
const evIco = e => { const m = EVI.find(([r]) => r.test(e.text)); return `<span class="evi ${e.kind}">${I(m ? m[1] : {bad:"warn", warn:"alert", ok:"ok"}[e.kind] || "info")}</span>`; };
const evRow = (e, many, tf = ago) => `<div class="ev${many && evMany(e) && EVOPEN.has(e.k) ? " open" : ""}" data-key="${esc(e.k)}|${e.kind}:${esc(e.text)}">${evIco(e)}<div class="et"><div>${many ? evWho(e) : ""}${evTx(e)}${e.n > 1 ? `<small class="lx num">×${e.n}</small>` : ""}</div>${many && evMany(e) ? `<div class="ehs"><div><div>${esc(e.hs.join("、"))}</div></div></div>` : ""}<div class="sub">${tf(e.t)}</div></div></div>`;
/* 電腦紀錄表的一列：時間、主機、圖示、事件（好幾台合成一筆的照樣點開看是哪幾台） */
const evRowD = (e, many) => `<div class="ev lr${many && evMany(e) && EVOPEN.has(e.k) ? " open" : ""}" data-key="${esc(e.k)}|${e.kind}:${esc(e.text)}"><span class="lt num">${hm(e.t)}</span>${many ? `<span class="lh">${evWho(e)}</span>` : ""}${evIco(e)}<div class="et"><div>${evTx(e)}${e.n > 1 ? `<small class="lx num">×${e.n}</small>` : ""}</div>${many && evMany(e) ? `<div class="ehs"><div><div>${esc(e.hs.join("、"))}</div></div></div>` : ""}</div></div>`;
const evList = (ev, many) => ev.length ? `<div class="evs" data-key="evs" data-keyed>${ev.map(e => evRow(e, many)).join("")}</div>` : `<div class="calm" data-key="calm">目前沒有事件</div>`;
const dayOf = t => { const d = new Date(t * 1000), n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
  return d.toDateString() === n.toDateString() ? "今天" : d.toDateString() === y.toDateString() ? "昨天" : `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };

function offBox(s){
  const d = s.last_seen ? Date.now()/1000 - s.last_seen : 1e9, span = d < 1800 ? [1800, "30 分前"] : d < 21600 ? [21600, "6 小時前"] : [86400, "24 小時前"];
  const g = Math.max(0, Math.min(1, 1 - d / span[0])).toFixed(3), err = s.error && s.error !== "連不上" ? `<div class="sub">${esc(s.error)}</div>` : "";
  const timeline = s.last_seen ? `<div class="otl" style="--g:${g}"><i></i></div><div class="otx"><span>${span[1]}</span><span>現在</span></div>` : "";
  return `<div class="offline" data-key="off">${I("off")}<div class="ofm"><b>${s.last_seen ? `離線 · 最後連線 ${esc(ago(s.last_seen))}` : "連不上"}</b>${timeline}${err}${peerBtn(s)}</div></div>`;
}
/* 主機列表最後的「新增主機」：貼上新主機的配對暗號 */
const addHostBtn = cls => `<button class="${cls}" data-addhost data-key="+add">${I("plus")}<span>新增主機</span></button>`;

/* 主機詳細資源 */
/* 四格：處理器、記憶體、磁碟、負載 */
function tiles(s){
  const d0 = disk0(s), l = +s.load[0] || 0, lr = l / (s.cores || 1), [lw, lt] = LOADW(lr), tp = tileProb(s);
  const of = (a, b) => `${size(a)} / ${size(b)}`;
  const t = (k, label, val, pct, sub, tt = tp[k] ? "b" : tier(pct)) => `<div class="tile ${tt}" data-key="t:${k}"><div class="th">${IC(k)}${label}</div><div class="tv">${val}</div>${wave(pct, tt)}<div class="ts">${sub}</div></div>`;
  return `<div class="tiles" data-key="tiles">${t("cpu", "處理器", `${num(s.cpu)}<small>%</small>`, s.cpu, `${s.cores} 核`)}`
    + t("mem", "記憶體", `${num(s.mem.pct)}<small>%</small>`, s.mem.pct, of(s.mem.used, s.mem.total))
    + t("disk", "磁碟", `${num(d0.pct)}<small>%</small>`, d0.pct, of(d0.used, d0.total))
    + t("load", "負載", l.toFixed(2), Math.min(100, lr / 2 * 100), `${lw} · ${s.cores} 核`, lt) + `</div>`;
}
/* IPv6：沒有 IPv6 的主機不顯示 */
function v6line(s, shown){
  const v = s.ipv6;
  if (!v) return "";
  if (!v.addr) return `<span class="v6 warn">IPv6 位址不見了</span>`;
  const st = v.ok === false ? ALX : `<i class="ld${v.ok ? " ok" : ""}"></i>`;   // 正常只放綠點，連不出去是紅叉
  return shown ? `<span class="v6 a" data-copy="${esc(v.addr)}" title="點一下複製">${esc(v.addr)}</span>`
    : `<span class="v6 ${v.ok === false ? "warn" : ""}" title="${v.ok === false ? "IPv6 連不出去" : v.ok ? "IPv6 正常" : "IPv6 檢查中"}">IPv6 ${st}</span>`;
}
/* 電信商名稱跟主機名稱同一家（例如「Oracle Corporation」和「Oracle Cloud」）就不再顯示一次 */
const ORGW = new Set("cloud corporation corp inc ltd llc limited company group network networks technology technologies hosting host server servers data services the".split(" "));
const sameOrg = (org, name) => { const w = t => (String(t || "").toLowerCase().match(/[a-z]{3,}|[^\x00-\x7f]{2,}/g) || []).filter(x => !ORGW.has(x)), n = new Set(w(name));
  return w(org).some(x => n.has(x)); };
const IPSHOW = {};                    // 哪幾台的 IP 目前是顯示狀態（到期自動再遮起來）
/* 流量條：波浪是已用，斜線一路畫到預估月底會用到哪，直線是今天走到這個週期的哪裡；右邊是幾天後重置 */
function tBar(t){
  const rst = `<span class="trs" title="${t.reset_day} 號重置">${I("upd")}<b class="num">${t.days_left}</b> 天</span>`;
  if (!t.limit) return `<div class="tsm"><span>${t.projected ? `預估月底 ${size(t.projected)}` : ""}</span>${rst}</div>`;
  const pj = t.projected ? Math.min(100, t.projected / t.limit * 100) : 0, td = t.cycle_days ? Math.max(0, Math.min(100, (1 - t.days_left / t.cycle_days) * 100)) : 0, pt = tier(pj);
  return `<div class="tbar" style="--v:${Math.min(100, +t.pct || 0).toFixed(1)}%;--pj:${pj.toFixed(1)}%;--td:${td.toFixed(1)}%">${wave(t.pct)}${pj > t.pct ? `<i class="tpj ${pt}"></i>` : ""}<i class="ttd"></i></div>`
    + `<div class="tlg"><span><i class="lw ${tier(t.pct)}"></i>已用</span>${pj > t.pct ? `<span title="預估月底 ${size(t.projected)}"><i class="lp ${pt}"></i>月底</span>` : ""}<span><i class="ltk"></i>今天</span>${rst}</div>`;
}
/* 本月流量：點了開流量設定 */
function trafficCard(s){
  const t = s.traffic; if (!t || !PREF.show.traffic) return "";
  return `<button class="cc trf" data-key="tf" data-traffic="${esc(s.node || "")}" data-label="${esc(s.name)}" title="流量設定"><div class="trow">${IC("month")}<span>本月流量</span><span class="tbig">${size(t.used)}${t.limit ? `<small>／ ${size(t.limit)}</small>` : ""}</span></div>
    ${tBar(t)}${tDays(t)}</button>`;
}
/* 這個週期每天用了多少：一天一根，今天是主題色，還沒到的日子只留底線 */
function tDays(t){
  const d = t.daily || [], n = Math.max(d.length, t.cycle_days || 0);
  if (d.length < 2 || !n) return "";
  const v = x => ({out: x.tx, in: x.rx, max: Math.max(x.rx, x.tx)})[t.count] ?? x.rx + x.tx, mx = Math.max(1, ...d.map(v));
  const bars = Array.from({length: n}, (_, i) => { const x = d[i];
    return x ? `<i class="${i === d.length - 1 ? "td" : ""}" style="--h:${Math.max(2, v(x) / mx * 100).toFixed(1)}%" title="${esc(x.d)}・${size(v(x))}"></i>` : `<i class="fu"></i>`; }).join("");
  return `<div class="tdays" data-key="tdays">${bars}</div><div class="tdx" data-key="tdx"><span>${esc(d[0].d)}</span><span>${n - d.length} 天後重置</span></div>`;
}
/* 磁碟讀寫、負載與連線：兩張小曲線（負載和連線各自照自己的最大值畫，提示框寫原本的數字） */
const lastOf = a => a && a.length ? +a[a.length - 1] || 0 : 0;
function ioCards(s, hs, ph){
  const H = ph ? 96 : 110, c = s.conns, avg = s.conns_avg;
  const cw = c == null || avg == null ? "" : (c > avg * 2 && c - avg > 20) ? "比平常多很多" : (avg > 10 && c < avg * .3) ? "比平常少很多" : "";
  const io = `<div class="cc" data-key="io"><div class="cch"><span class="ct2">磁碟讀寫</span><span class="lg sp"><i style="background:${COL.rx}"></i>讀<b class="num" data-x>${rate(lastOf(hs.rd))}</b></span><span class="lg"><i style="background:${COL.tx}"></i>寫<b class="num" data-x>${rate(lastOf(hs.wr))}</b></span></div>
    <div class="cbox">${chartOr(hs, cid(s, ph ? "r" : "c"), x => [{data:x.rd, color:COL.rx, name:"讀"}, {data:x.wr, color:COL.tx, name:"寫"}], {grid:1, bin:1, fmt:rate, h:H})}</div></div>`;
  const sc = (a, m) => (a || []).map(v => (+v || 0) / m * 100);
  const ld = `<div class="cc" data-key="ld"><div class="cch"><span class="ct2">負載與連線</span><span class="lg sp"><i style="background:${COL.cpu}"></i>負載<b class="num" data-x>${(+s.load[0] || 0).toFixed(2)}</b></span><span class="lg"><i style="background:${COL.mem}"></i>連線<b class="num" data-x>${c == null ? "—" : Number(c).toLocaleString("zh-TW")}</b>${cw ? `<em class="${cw.includes("多") ? "warn" : ""}">${cw}</em>` : ""}</span></div>
    <div class="cbox">${chartOr(hs, cid(s, ph ? "l" : "d"), x => { const lm = Math.max(s.cores || 1, ...(x.ld || [0])) * 1.15, cm = Math.max(10, ...(x.cn || [0])) * 1.15;
      return [{data:sc(x.ld, lm), raw:x.ld, f:v => (+v).toFixed(2), color:COL.cpu, name:"負載"}, {data:sc(x.cn, cm), raw:x.cn, f:v => Math.round(v) + " 條", color:COL.mem, name:"連線"}]; }, {max:100, grid:1, h:H})}</div></div>`;
  return io + ld;
}
/* 最吃資源的程式：前 5 名（同名的加在一起），長條是處理器 */
function topCard(s){
  const t = s.top; if (!PREF.show.info || !t || !t.length) return "";
  const mx = Math.max(5, ...t.map(x => x.c));
  return `<div class="cc tops" data-key="pr"><div class="cch"><span class="ct2">最吃資源的程式</span></div><div class="prl" data-key="prs" data-keyed>${t.map(x =>
    `<div class="pr" data-key="p:${esc(x.n)}"><b>${esc(x.n)}</b><span class="pbar"><i style="--k:${Math.min(1, x.c / mx).toFixed(3)}"></i></span><span class="num" title="處理器">${x.c < 10 ? (+x.c).toFixed(1) : Math.round(x.c)}%</span><span class="num" title="記憶體">${size(x.m)}</span></div>`).join("")}</div></div>`;
}
/* 這台主機的規格：處理器型號、記憶體、核心版本、IP（霧化，點一下顯示）、IPv6、主機商、其他磁碟 */
function specCard(s){
  if (!PREF.show.info) return "";
  const k = keyOf(s), shown = IPSHOW[k] > Date.now(), ip = s.geo && s.geo.ip, org = s.geo && s.geo.org, r = [];
  r.push(["處理器", `${esc(s.cpum || "")}${s.cpum ? "・" : ""}${s.cores} 核`]);
  r.push(["記憶體", `${size(s.mem.total)}${s.mem.swap_total ? `<small>虛擬 ${size(s.mem.swap_total)}・${num(s.mem.swap_pct)}%</small>` : ""}`]);
  if (s.kernel) r.push(["核心版本", esc(s.kernel)]);
  if (ip) r.push(["IP", `<b class="ipb ${shown ? "on" : ""}" tabindex="0" role="button" ${shown ? `data-copy="${esc(ip)}" title="點一下複製（15 秒後會自動遮起來）"` : `data-reveal="${esc(k)}" title="點一下顯示"`}>${esc(ip)}</b>`]);
  if (s.ipv6) r.push(["IPv6", `<span data-xw>${v6line(s, shown)}</span>`]);
  if (org && !sameOrg(org, s.name)) r.push(["主機商", esc(org)]);
  (s.disks || []).slice(1).forEach(d => r.push([`磁碟 ${esc(d.path)}`, `<b class="num ${tier(d.pct)}">${num(d.pct)}%</b><small>${size(d.used)} / ${size(d.total)}</small>`]));
  return `<div class="cc spec" data-key="sp"><div class="cch"><span class="ct2">這台主機</span></div><dl class="spl" data-key="spl">${r.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl></div>`;
}
/* 容器與服務：一個一個小膠囊，有分組（docker compose 專案、系統服務）就加小標題 */
const boxSummary = items => { const bad = items.filter(x => x.st === "bad").length;
  return bad ? `<span class="bxn" title="${bad} 個異常">${ALX}<b class="num">${bad}</b></span>` : `<span class="bxn ok" title="全部正常">${I("chk")}<b class="num">${items.filter(x => x.st === "ok").length}</b></span>`; };
function itemsCard(s){
  if (!PREF.show.items) return "";
  const items = itemsOf(s); if (!items.length) return "";
  const groups = [...new Set(items.map(x => x.g))], head = groups.length > 1 || groups[0];
  let c = "";
  for (const g of groups) {
    const gi = items.filter(x => x.g === g);
    if (head && c) c += `<i class="gbr" data-key="br:${esc(g)}"></i>`;
    if (head) c += `<span class="grp" data-key="grp:${esc(g)}" title="${g ? esc(g) : "容器"}">${I(g === "系統服務" ? "gear" : "box")}${g && g !== "系統服務" ? `<span>${esc(g)}</span>` : ""}</span>`;   // 圖示說是容器還是服務，docker compose 專案才寫名字
    c += gi.map(x => `<span class="chip${x.st === "bad" ? " bad" : ""}" data-key="${x.t}:${esc(x.n)}" title="${x.t}：${esc(x.n)}・${esc(x.s)}">${x.st === "bad" ? ALX : `<span class="dot ${x.st}"></span>`}<span>${esc(x.sn || x.n)}</span></span>`).join("");
  }
  return `<div class="cc" data-key="ib"><div class="cch"><span class="ct2">${IC("box")}容器與服務</span><span class="sum">${boxSummary(items)}</span></div><div class="chips" data-key="chips" data-keyed>${c}</div></div>`;
}
/* 常用連結（工具分頁）：每個連結多久打得開 */
const linkRow = (x, sub) => `<a class="li" data-key="lk:${esc(x.url)}" href="${esc(x.url)}"${x.sso ? ` data-sso="${esc(x.sso)}"` : ""} target="_blank" rel="noopener noreferrer"><span class="lk">${linkSig(x)}</span><span class="lab">${esc(x.name)}<small>${sub}</small></span>${EXT}</a>`;
const CNT = {both:"上傳＋下載", out:"只算上傳", in:"只算下載", max:"取較大的"};
async function trafficModal(node, label){
  const s = LIST.find(x => (x.node || "") === node), t = s && s.traffic;
  if (!t) return;
  let mode = t.count;
  const days = Array.from({length:28}, (_, i) => `<option value="${i+1}" ${t.reset_day===i+1?"selected":""}>每月 ${i+1} 號</option>`).join("");
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog">${IC("month","big")}<h3>「${esc(label)}」流量設定</h3>
    <div class="form">
      <label>每月流量上限（GB）<input class="field" type="number" inputmode="decimal" min="0" step="any" value="${t.limit ? +(t.limit/1073741824).toFixed(3) : ""}" placeholder="不限就留空"></label>
      <label>每月幾號重置<select class="field">${days}</select></label>
      <label>怎麼計算<div class="seg" data-slide>${Object.entries(CNT).map(([k,l])=>`<button type="button" class="${mode===k?"on":""}" data-m="${k}">${l}</button>`).join("")}</div>
        <small>不確定就選「上傳＋下載」</small></label>
    </div>
    <div class="btns"><button class="ubtn" data-r="1">儲存</button></div></div>`;
  $("#layer").appendChild(v);
  v.querySelectorAll(".seg").forEach(sg => sg.querySelectorAll("button").forEach(b => b.onclick = () => {
    mode = b.dataset.m; slideSel(() => sg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b))); }));
  const ok = await new Promise(res => {
    const done = r => { if (v._d) return; v._d = 1; const val = r ? {limit_gb: +(v.querySelector("input").value || 0), reset_day: +v.querySelector("select").value, count: mode} : null;
      v.classList.add("closing"); setTimeout(() => { v.remove(); res(val); }, 360); };
    v._esc = () => done(0);
    v.addEventListener("click", e => { if (e.target === v) return done(0); const b = e.target.closest("[data-r]"); if (b) done(+b.dataset.r); });
    v.querySelector("input").addEventListener("keydown", e => { if (e.key === "Enter") done(1); });
  });
  if (!ok) return;
  try {
    const r = await fetch("/api/traffic?node=" + encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(ok)});
    const d = await r.json().catch(() => ({}));
    (r.ok && d.ok) ? toast("流量設定已儲存") : toast(d.message || d.error || (r.status === 404 ? "那台主機還沒更新到新版" : "儲存失敗"), "bad");
  } catch(e) { toast("連線失敗，請稍後再試", "bad"); }
  tick();
}

/* ═════════ 分頁：首頁、工具、紀錄、設定 ═════════ */

const TABS = [["home", "主機清冊", "server"], ["log", "事件紀錄", "bell"], ["tools", "工具", "tools"], ["set", "設定", "gear"]];
let TABDIR = 0;
let DSEL = sstore("vs-dsel") || "";
let inventoryFilter = "all";
let inventoryQuery = "";
const inventoryStates = {all:"全部主機", ok:"正常", warn:"注意", bad:"異常", down:"失聯"};
const osShort = os => String(os || "").replace(/(\d+\.\d+)\.\d+/, "$1").replace(/\s*LTS$/, "");
const inventoryStatus = s => !s.online ? "down" : lvOf(s);
const inventorySelected = list => list.find(s => keyOf(s) === DSEL) || list.find(s => !s.node) || list[0];
const inventoryMark = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 21 8v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5"/></svg>';
const inventoryBadge = s => `<span class="inv-state ${inventoryStatus(s)}"><i></i>${inventoryStates[inventoryStatus(s)]}</span>`;
const inventoryIcon = s => `<span class="inv-server">${PREF.show.flag && s.geo && /^[A-Z]{2}$/.test(s.geo.cc || "") ? flag(s.geo.cc) : I("server")}</span>`;

function inventoryNav(k, name, symbol, update = false){
  return `<button class="inv-nav-link${update ? " inv-update" : ""}" type="button" data-tab="${k}"${TAB === k ? ' aria-current="page"' : ""}>${I(symbol)}<span>${name}</span></button>`;
}
function renderConsole(list, time){
  const dark = document.documentElement.dataset.mode === "dark";
  const nav = TABS.slice(0, -1).map(([k, label, symbol]) => inventoryNav(k, label, symbol)).join("");
  const body = TAB === "tools" ? toolsPage(list) : TAB === "log" ? logPage(list) : TAB === "set" ? setPage(list) : inventoryPage(list, time);
  return `<div class="dash console ${DESK.matches ? "d" : "m"}" data-key="console">
    <header class="inv-header" data-key="header"><div class="inv-width">
      <button class="inv-brand" data-dhome aria-label="哨站主機清冊"><span>${inventoryMark}</span><b>哨站<small>OUTPOST</small></b></button>
      <nav class="inv-nav" aria-label="主要導覽">${nav}</nav>
      <div class="inv-header-actions"><button class="inv-icon-button inv-theme" data-qtheme title="${dark ? "切換淺色模式" : "切換深色模式"}" aria-label="${dark ? "切換淺色模式" : "切換深色模式"}">${I(dark ? "sun" : "moon")}</button>
      <button class="inv-icon-button" data-refresh title="重新整理" aria-label="重新整理">${I("upd")}</button>
      ${inventoryNav("set", "設定", "gear", list.some(s => s.self_has))}</div></div></header>
    <main id="main-view" class="view inv-width v-${TAB}" tabindex="-1" data-key="v:${TAB}" data-dir="${TABDIR}">${body}</main></div>`;
}
const dbar = (title, rest = "") => `<header class="inv-page-heading dbar" data-key="dbar"><h1 class="dbt">${title}</h1>${rest}</header>`;
const tgHint = list => list.some(x => !x.node && x.tg_off) ? `<div class="group tgh" data-key="tgh"><button class="li" data-tg>${IC("bell", "")}<span class="lab">Telegram 通知<small>還沒設定，尚未連結 Telegram</small></span>${CHEV}</button></div>` : "";

function inventoryUsage(value){
  if (value == null || !Number.isFinite(+value)) return "—";
  const meter = Math.max(0, Math.min(100, Math.round(+value)));
  return `<span class="inv-usage ${tier(meter)}">${num(meter)}%<meter min="0" max="100" aria-hidden="true" value="${meter}"></meter></span>`;
}
function inventoryRows(list, selected){
  const q = inventoryQuery.trim().toLocaleLowerCase();
  const found = list.filter(s => {
    if (inventoryFilter !== "all" && inventoryFilter !== inventoryStatus(s)) return false;
    if (!q) return true;
    const fields = [s.name, s.hostname, s.node, place(s), s.geo?.city];
    if (PREF.show.info && IPSHOW[keyOf(s)] > Date.now()) fields.push(s.geo?.ip);
    return fields.some(value => String(value || "").toLocaleLowerCase().includes(q));
  });
  return found.map(s => {
    const k = esc(keyOf(s)), on = s.online;
    const issues = on ? (s.problems || []).concat(s.notices || []) : [];
    const ip = PREF.show.info && IPSHOW[keyOf(s)] > Date.now() ? s.geo?.ip : "";
    const region = place(s) || s.geo?.city || (s.geo?.cc ? regionOf(s.geo.cc) : "") || "—";
    return `<tr data-key="host:${k}" class="${s === selected ? "is-selected" : ""}">
      <th scope="row"><button class="inv-host-link" data-inv-host="${k}" aria-pressed="${s === selected}">${inventoryIcon(s)}<span><b>${esc(s.name)}</b><small>${esc(s.hostname && s.hostname !== s.name ? s.hostname : osShort(s.os) || (s.node ? "受監看主機" : "主要主機"))}</small></span></button></th>
      <td class="inv-location"><b>${esc(region)}</b>${ip ? `<small class="num">${esc(ip)}</small>` : ""}</td>
      <td>${inventoryBadge(s)}${issues.length ? `<small class="inv-issue" title="${esc(issues.join("、"))}">${esc(issues[0])}</small>` : !on && s.last_seen ? `<small class="inv-issue">${esc(seen(s))}</small>` : ""}</td>
      <td class="inv-measure">${inventoryUsage(on ? s.cpu : null)}</td><td class="inv-measure">${inventoryUsage(on ? s.mem?.pct : null)}</td><td class="inv-measure">${inventoryUsage(on ? disk0(s).pct : null)}</td>
      <td class="inv-row-menu">${moreBtn(s)}</td></tr>`;
  }).join("") || `<tr data-key="empty"><td colspan="7" class="inv-empty">${list.length ? "沒有符合條件的主機。試試其他名稱或狀態。" : "新增主機後，這裡會顯示連線狀態。"}</td></tr>`;
}
function inventoryChart(s){
  if (!PREF.show.chart || !s.online) return "";
  const history = histRaw(s);
  const ticks = history?.t || [];
  const label = t => new Intl.DateTimeFormat("zh-TW", RANGE === "7d" ? {month:"numeric", day:"numeric"} : {hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).format(t * 1000);
  const axis = ticks.length >= 2 ? `<div class="inv-axis">${[0, Math.floor((ticks.length - 1) / 2), ticks.length - 1].map(i => `<span>${esc(label(ticks[i]))}</span>`).join("")}</div>` : "";
  return `<div class="inv-chart" data-key="cpu-chart"><div class="inv-chart-heading"><h3>處理器趨勢</h3><strong class="num">${num(s.cpu)}%</strong></div>
    <div class="cbox inv-plot" role="group" aria-label="處理器使用率趨勢">${chartOr(history, cid(s, "inventory"), h => [{data:h.cpu, color:"var(--inv-accent)", name:"處理器"}], {max:100, grid:1, fmt:v => Math.round(v) + "%", h:84, fade:.24})}</div>${axis}${rangeSeg()}</div>`;
}
function inventoryInspector(s){
  if (!s) return "";
  const node = esc(s.node || ""), name = esc(s.name), items = s.online && PREF.show.items ? itemsOf(s) : [];
  const row = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const facts = s.online ? row("作業系統", esc(s.os || "—")) + row("資源規格", `${s.cores || "—"} 核心 / ${size(s.mem.total)}`)
    + row("連續運行", up(s.uptime)) + (items.length ? row("受監控服務", esc(items.map(x => x.sn || x.n).slice(0, 3).join("、")) + (items.length > 3 ? ` 等 ${items.length} 項` : "")) : "") : "";
  return `<aside class="inv-inspector" id="host-inspector" data-key="inspector" aria-labelledby="inv-host-name">
    <div class="inv-inspector-head">${inventoryIcon(s)}${inventoryBadge(s)}</div>
    <h2 id="inv-host-name" tabindex="-1">${name}</h2><p class="inv-host-meta">${esc(s.hostname && s.hostname !== s.name ? s.hostname : place(s) || (s.node ? "受監看主機" : "主要主機"))}</p>
    ${s.online ? alerts(s, false) + inventoryChart(s) : offBox(s)}
    ${s.online ? `<dl class="inv-mobile-usage">${row("處理器", num(s.cpu) + "%")}${row("記憶體", num(s.mem.pct) + "%")}${row("磁碟", num(disk0(s).pct) + "%")}</dl>` : ""}
    ${facts ? `<dl class="inv-facts">${facts}</dl>` : ""}
    <div class="inv-inspector-actions" data-key="actions">
    ${items.length ? '<button class="inv-secondary" data-inv-jump="inventory-services">查看服務</button>' : ""}
    ${s.online ? `<button class="inv-quiet" data-reboot="${node}" data-name="${name}">${I("power")}重新開機</button><button class="inv-quiet" data-inv-jump="inventory-detail">完整資訊</button>`
      : s.up30?.some(v => v != null) ? '<button class="inv-secondary" data-inv-jump="inventory-availability">查看上線紀錄</button>' : ""}
    </div></aside>`;
}
function inventoryDetail(s){
  if (!s) return "";
  const availability = inventoryAvailability(s);
  if (!s.online) return availability ? `<div class="inv-detail" data-key="full-detail">${availability}</div>` : "";
  const hs = PREF.show.chart ? histFor(s) : null;
  const memory = PREF.show.chart ? `<div class="cc" data-key="cp"><div class="cch"><span class="ct2">記憶體趨勢</span>${rangeSeg()}</div><div class="cbox">${chartOr(hs, cid(s, "inv-memory"), h => [{data:h.mem, color:COL.mem, name:"記憶體"}], {max:100, grid:1, fmt:v => Math.round(v) + "%", h:120})}</div></div>` : "";
  const net = PREF.show.net ? `<div class="cc" data-key="np"><div class="cch"><span class="ct2">網路速度</span></div><div class="nets"><div class="nt">${IC("down")}<div class="nv" title="下載">${rate(s.net.rx)}</div></div><div class="nt">${IC("up")}<div class="nv" title="上傳">${rate(s.net.tx)}</div></div></div>
    ${hs ? `<div class="cbox wide">${chartOr(hs, cid(s, "inv-net"), h => [{data:h.rx, color:COL.rx, name:"下載"}, {data:h.tx, color:COL.tx, name:"上傳"}], {grid:1, bin:1, fmt:rate, h:104})}</div>` : ""}</div>` : "";
  const services = itemsCard(s);
  return `<section class="inv-detail" data-key="full-detail" aria-labelledby="inventory-detail"><h2 id="inventory-detail" tabindex="-1">${esc(s.name)}的完整資訊</h2>
    <div class="inv-detail-grid" data-key="detail-grid" data-keyed>${tiles(s)}${services ? `<section class="inv-service-panel" id="inventory-services" data-key="service-panel" tabindex="-1" aria-label="容器與服務">${services}</section>` : ""}
    ${availability}${trafficCard(s)}${memory}${net}${hs && !hs.err && hs.rd ? ioCards(s, hs, !DESK.matches) : ""}${topCard(s)}${specCard(s)}</div></section>`;
}
function inventoryPage(list, time){
  const selected = inventorySelected(list), g = greet();
  const ev = groupEv(allEvents(list)).slice(0, 5);
  const totals = {all:list.length, ok:0, warn:0, bad:0, down:0};
  list.forEach(s => totals[inventoryStatus(s)]++);
  if (!totals.bad && inventoryFilter === "bad") inventoryFilter = "all";
  const summary = Object.entries(inventoryStates).filter(([k]) => k !== "bad" || totals.bad).map(([k, label]) => `<button data-key="${k}" data-inv-filter="${k}" aria-pressed="${inventoryFilter === k}"><span>${k === "all" ? I("server") : `<i class="inv-state ${k}"></i>`}${label}</span><strong class="num">${totals[k]}</strong></button>`).join("");
  const captions = [["主機", ""], ["機房", "inv-location"], ["狀態", ""], ["處理器", "inv-measure"], ["記憶體", "inv-measure"], ["磁碟", "inv-measure"], ["更多操作", "inv-row-menu"]];
  return `<div class="inv-home" data-key="inventory"><header class="inv-intro"><div><h1>主機清冊</h1><p>管理各機房的主機、資源與連線狀態。</p>${g.quote && !issuesOf(list).length && !LOST ? `<p>${esc(g.quote)}</p>` : ""}</div>${addHostBtn("ubtn inv-add")}</header>
    <div class="inv-summary" data-key="summary" data-keyed aria-label="主機狀態篩選">${summary}</div>
    <div class="inv-work" data-key="work"><section class="inv-list" aria-labelledby="inv-list-title"><div class="inv-table-tools"><h2 id="inv-list-title">主機列表</h2>
      <label class="inv-search">${I("search")}<input type="search" data-inv-search value="${esc(inventoryQuery)}" aria-label="搜尋主機" placeholder="搜尋名稱或地區"></label></div>
      <table><thead><tr>${captions.map(([label, cls]) => `<th scope="col" class="${cls}">${cls === "inv-row-menu" ? '<span class="inv-visually-hidden">更多操作</span>' : label}</th>`).join("")}</tr></thead>
      <tbody data-key="inventory-rows" data-keyed>${inventoryRows(list, selected)}</tbody></table></section>${inventoryInspector(selected)}</div>
    <div class="inv-footer">${I("clock")}<span class="meta">${LOST ? "連線中斷，正在重試" : time ? `${esc(time)} 更新` : "等待更新"}</span><span class="inv-weather">${g.wx}</span></div>
    ${inventoryDetail(selected)}
    ${list.length ? `<section class="inv-overview" aria-label="資源摘要與近期事件">${sumRow(list)}${tgHint(list)}
      <section class="inv-recent"><header><h2>近期事件</h2>${ev.length ? '<button class="inv-quiet" data-tab="log">全部紀錄</button>' : ""}</header>${evList(ev, list.length > 1)}</section></section>` : ""}</div>`;
}
/* 30 天上線紀錄計算 */
const upAvg = a => { const v = (a || []).filter(x => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const upPct = v => v == null ? "—" : v >= 99.995 ? "100%" : (Math.floor(v * 100) / 100).toFixed(2) + "%";
function inventoryAvailability(s){
  if (!Array.isArray(s.up30) || !s.up30.length) return "";
  const values = s.up30.slice(-30).map(v => v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  if (values.every(v => v == null)) return "";
  const days = values.map((value, i) => {
    const n = values.length - i - 1;
    const label = n === 0 ? "今天" : `${n} 天前`;
    return {label, value, status: value == null ? "none" : value >= 99.995 ? "ok" : value > 0 ? "warn" : "down"};
  });
  const cells = days.map(({label, value, status}) => `<i class="inv-state ${status}" title="${label}：${value == null ? "無紀錄" : upPct(value)}"></i>`).join("");
  return `<section class="cc inv-availability" data-key="availability:${esc(keyOf(s))}" aria-labelledby="inventory-availability">
    <div class="cch"><h3 class="ct2" id="inventory-availability" tabindex="-1">30 天上線紀錄</h3><strong class="num">${upPct(upAvg(values))}</strong></div>
    <div class="inv-availability-strip" aria-hidden="true">${cells}</div>
    <details><summary>每日上線率</summary><dl class="inv-facts">${days.slice().reverse().map(({label, value}) => `<div><dt>${label}</dt><dd>${value == null ? "無紀錄" : upPct(value)}</dd></div>`).join("")}</dl></details></section>`;
}
/* 總覽精簡 3 格重點摘要（在線節點、即時總網速、本月總流量，去重不雜亂） */
function sumRow(list){
  const on = list.filter(s => s.online), off = list.length - on.length;
  const ua = upAvg(list.flatMap(s => (s.up30 || []).filter(x => x != null)));
  const rx = on.reduce((t, s) => t + (s.net.rx || 0), 0), tx = on.reduce((t, s) => t + (s.net.tx || 0), 0);
  const tr = list.filter(s => s.traffic), used = tr.reduce((t, s) => t + (s.traffic.used || 0), 0), pj = tr.reduce((t, s) => t + (s.traffic.projected || 0), 0);
  const cell = (k, label, v, sub) => `<div class="sumc" data-key="sm:${k}"><dt class="smk">${label}</dt><dd class="smv">${v}</dd><dd class="sms">${sub}</dd></div>`;
  return `<dl class="sums" data-key="sums" aria-label="資源摘要">`
    + cell("h", "在線主機", `${num(on.length)}<small>／ ${list.length} 台</small>`, off ? `<span class="smoff">${off} 台離線</span>` : ua == null ? "全部在線" : `30 天上線率 ${upPct(ua)}`)
    + cell("n", "即時總網速", `<small class="dn">${I("down")}</small><b data-x>${on.length ? rate(rx) : "—"}</b>`, on.length ? `<span class="smu">${I("up")}<span data-x>${rate(tx)}</span> 上傳</span>` : "沒有在線主機")
    + cell("t", "本月總流量", `<b data-x>${tr.length ? size(used) : "—"}</b>`, !tr.length ? "尚無流量資料" : pj ? `月底預估 ${size(pj)}` : `${tr.length} 台加總`)
    + `</dl>`;
}
/* 工具：雲端硬碟、遠端下載、每日備份、加密筆記、擋廣告 DNS、相簿分享、常用連結、機場起降 */
let TOOLH = store("vs-toolh"), ORDER = [];
const tBadge = (text, cls = "") => text ? `<span class="tbadge${cls ? " " + cls : ""}" data-x>${text}</span>` : "";
function dlTileState(s){
  const d = s.dl || {};
  const run = (d.run || 0) + (d.wait || 0), bad = d.bad || 0;
  if (run) return {b: tBadge(`進行中 ${run}`, "act"), sub: bad ? `另有 ${bad} 筆失敗` : "正在存到雲端硬碟", foot: "存到雲端硬碟「下載」"};
  if (bad) return {b: tBadge(`失敗 ${bad}`, "bad"), sub: "開啟佇列以重試" , foot: ""};
  return {b: tBadge(""), sub: "檔案直連・影音網站", foot: "存到雲端硬碟「下載」"};
}

function toolsPage(list){
  const online = list.filter(s => s.online).sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b)));
  const s = online.find(x => keyOf(x) === TOOLH) || online.find(x => !x.node) || online[0];
  const flySub = FLYS.name ? `${esc(FLYS.name)}・即時看板與塔台雷達` : "即時航班看板與塔台雷達";
  const pick = !s ? "" : online.length > 1 ? hpick(online, s, x => lvOf(x) === "ok" ? "" : `<span class="dot ${lvOf(x)}"></span>`) : `<span class="tool-host">${I("server")}${esc(s.name)}</span>`;
  return `<div class="inv-tools" data-key="tools">${dbar("工具")}
    <section aria-labelledby="inv-tools-host"><div class="inv-subhead"><h2 id="inv-tools-host">主機工具</h2>${pick}</div>
      ${s ? toolsBody(s, esc(keyOf(s)), esc(s.node || ""), esc(s.name)) : '<p class="inv-empty">連不上任何主機</p>'}</section>
    <section aria-labelledby="inv-tools-shared"><div class="inv-subhead"><h2 id="inv-tools-shared">共用工具</h2></div>
      <div class="group fly1" data-key="g-fly"><button class="li" data-key="fly" data-fly>${IC("fly", "")}<span class="lab">機場起降<small>${flySub}</small></span>${CHEV}</button></div></section></div>`;
}
function toolsBody(s, k, node, name){
  const c = s.cloud && safeUrl(cloudHref(s.cloud)) ? s.cloud : null;
  const tiles = [];
  if (c) {
    const pct = c.total ? Math.round(c.pct) : null;
    const ccls = pct == null ? "" : pct >= 90 ? "bad" : pct >= 75 ? "warn" : "ok";
    tiles.push(`<a class="tbx" data-key="cl" href="${esc(cloudHref(c))}"${ssoAttr(s)} target="_blank" rel="noopener noreferrer">
      <span class="ttop">${IC("cloud", "")}<span class="trgt">${pct != null ? tBadge(`${pct}%`, ccls) : ""}<span class="tgo">${EXT}</span></span></span>
      <span class="tmeta"><b>雲端硬碟</b><small class="tdesc" data-x>${c.total ? `${size(c.used)} / ${size(c.total)}` : "加密儲存空間"}</small></span>
      <span class="tfoot">${c.total ? wave(c.pct) : `<span class="thint">驗證後直接開啟</span>`}</span></a>`);
    const dl = dlTileState(s);
    tiles.push(`<button class="tbx" data-key="dl" data-dl="${node}" data-name="${name}">
      <span class="ttop">${IC("dl", "")}<span class="trgt">${dl.b}<span class="tgo nx">${CHEV}</span></span></span>
      <span class="tmeta"><b>遠端下載</b><small class="tdesc" data-x>${dl.sub}</small></span>
      <span class="tfoot"><span class="thint">${dl.foot}</span></span></button>`);
  }
  tiles.push(`<button class="tbx" data-key="bk" data-bk="${node}" data-label="${name}">
    <span class="ttop">${IC("archive", "")}<span class="trgt"><span class="tbadge bkbdg" data-n="${node}" data-keep></span><span class="tgo nx">${CHEV}</span></span></span>
    <span class="tmeta"><b>每日備份</b><small class="tdesc bkst" data-n="${node}" data-keep data-ld>讀取中…</small></span>
    <span class="tfoot"><span class="bkdots" data-n="${node}" data-keep>${"<i></i>".repeat(7)}</span><span class="thint">近 7 天</span></span></button>`);
  tiles.push(`<button class="tbx" data-key="nt" data-notes="${node}" data-name="${name}">
    <span class="ttop">${IC("note", "")}<span class="trgt">${tBadge(s.notes ? "已開啟" : "未開啟", s.notes ? "ok" : "")}<span class="tgo nx">${CHEV}</span></span></span>
    <span class="tmeta"><b>加密筆記</b><small class="tdesc">Joplin 筆記同步</small></span>
    </button>`);
  const ab = abTile(s, node, name);
  if (ab) tiles.push(ab);
  if (c) {
    const pend = s.albums_pend || 0, n = s.albums || 0;
    const abdg = pend ? tBadge(`待確認 ${pend}`, "act") : n ? tBadge(`${n} 本分享中`, "ok") : tBadge("還沒分享");
    tiles.push(`<button class="tbx" data-key="alm" data-album="${node}" data-name="${name}">
      <span class="ttop">${IC("album", "")}<span class="trgt">${abdg}<span class="tgo nx">${CHEV}</span></span></span>
      <span class="tmeta"><b>相簿分享</b><small class="tdesc">${pend ? `有訪客上傳待審核` : "分享照片與影片"}</small></span>
      <span class="tfoot"><span class="thint">${n ? "管理連結、權限與留言" : ""}</span></span></button>`);
  }
  let h = `<div data-key="tb:${k}" data-sw><div class="tgrid" data-key="g-t:${k}" data-n="${tiles.length}">${tiles.join("")}</div>`;
  const L = linksOf(s).filter(x => !x.fixed);
  if (L.length) h += `<div class="lbl" data-key="ll">常用連結<button type="button" data-rename="${node}" data-name="${name}">編輯連結</button></div><div class="group lgrid" data-key="g-lk:${k}">${L.map(x => linkRow(x, esc(linkSt(x)))).join("")}</div>`;
  return h + `</div>`;
}
/* 一排主機名稱選一台（工具、設定共用，選了哪台兩邊都記得）；dot：名稱前面的小圓點 */
const hpick = (on, s, dot) => `<div class="hpick" data-key="hpick" data-keyed data-slide>${on.map(x => `<button class="fchip${x === s ? " on" : ""}" aria-pressed="${x === s}" data-key="hp:${esc(keyOf(x))}" data-toolh="${esc(keyOf(x))}">${dot(x)}${esc(x.name)}</button>`).join("")}</div>`;
/* 選到的主機名稱被擠到邊邊或看不到時，把那一排滑到它在中間（只滑那一排，頁面不動） */
function pickShow(anim){
  const r = $(".hpick"), b = r && r.querySelector(".on"); if (!b || r.scrollWidth <= r.clientWidth) return;
  const z = ZM(), l = (b.getBoundingClientRect().left - r.getBoundingClientRect().left) / z + r.scrollLeft, pad = 40;
  if (l < r.scrollLeft + pad || l + b.offsetWidth > r.scrollLeft + r.clientWidth - pad)        // 滑到正中間
    r.scrollTo({left: l - (r.clientWidth - b.offsetWidth) / 2, behavior: anim && canAnim() ? "smooth" : "auto"});
}
/* 有 data-slide 的單選控制項共用移動動畫，連續點選時從當下的位置接續。 */
let SPTS;   // SPRING 曲線的轉折點（JS 自己算動畫時用）
function springAt(t){
  if (!SPTS) { const m = SPRING.match(/^linear\((.*)\)$/);
    SPTS = m ? m[1].split(",").map((x, i, a) => { const [v, p] = x.trim().split(/\s+/); return [p ? parseFloat(p) / 100 : i / (a.length - 1), +v]; }) : [[0, 0], [.3, .8], [.6, 1.04], [1, 1]]; }
  for (let i = 1; i < SPTS.length; i++) if (t <= SPTS[i][0]) { const [p0, v0] = SPTS[i - 1], [p1, v1] = SPTS[i]; return v0 + (v1 - v0) * (t - p0) / ((p1 - p0) || 1); }
  return 1;
}
function slideSel(change, animate = canAnim()){
  const z = ZM(), was = animate ? [...document.querySelectorAll("[data-slide]")].map(b => {
    if (!b.offsetWidth || !b.offsetHeight) return null;
    const g = b.querySelector(":scope>.slide"), on = selOf(b);
    return [b, b.dataset.key, g ? g._now : on && boxIn(b, on, z)];
  }).filter(Boolean) : [];
  change();
  if (!animate) document.querySelectorAll("[data-slide].sliding").forEach(b => {
    const g = b.querySelector(":scope>.slide");
    if (g) { g._stop = 1; g.remove(); }
    b.classList.remove("sliding");
  });
  was.forEach(([b0, k, from]) => {
    const b = b0.isConnected ? b0 : k && document.querySelector(`[data-slide][data-key="${CSS.escape(k)}"]`), on = b && selOf(b);
    if (!from || !on || !b.offsetWidth) return;
    const old = b.querySelector(":scope>.slide"); if (old) { old._stop = 1; old.remove(); }
    const to0 = boxIn(b, on, z);
    if (Math.abs(to0.x - from.x) < 1 && Math.abs(to0.y - from.y) < 1) { if (old) b.classList.remove("sliding"); return; }   // 停在原地：換回它自己的底色
    const g = document.createElement("i"); g.className = "slide"; g.setAttribute("aria-hidden", "true"); g._leaving = 1; b.prepend(g); b.classList.add("sliding");   // _leaving：重畫時不要把它當成內容
    const dur = T.sp, t0 = performance.now(), lerp = (a, c, p) => a + (c - a) * p;
    g.animate([{opacity:1}, {opacity:1}], {duration:dur, id:"ui"});              // 滑完之前，自動更新先等一下
    const done = () => {
      if (g._stop) return;
      b.classList.remove("sliding");
      g.remove();                                                                // 同幀切換：不疊雙層氣泡也不留空白幀
    };
    const tr = c => `translate(${c.x}px,${c.y}px)`;
    if (Math.abs(to0.w - from.w) < 1 && Math.abs(to0.h - from.h) < 1 && to0.r.every((r, i) => Math.abs(r - from.r[i]) < 1)) {
      // 大小一樣（例如分頁列、側欄、設定分類）：先就位再交給 GPU 滑動，不閃到原點也不抖動
      Object.assign(g.style, {width:to0.w + "px", height:to0.h + "px", borderRadius:to0.r.map(r => r + "px").join(" "), transform:tr(from)});
      const a = g.animate([{transform:tr(from)}, {transform:tr(to0)}], {duration:dur, easing:SPRING, fill:"forwards"});
      a.onfinish = done;
      Object.defineProperty(g, "_now", {get(){ const m = new DOMMatrix(getComputedStyle(g).transform); return {x:m.e, y:m.f, w:to0.w, h:to0.h, r:to0.r}; }});
      return;
    }
    const step = now => {
      if (g._stop || !g.isConnected) return;
      const p = Math.min(1, (now - t0) / dur), e = springAt(p), on2 = selOf(b);
      if (!on2 || !b.isConnected) return g.remove();
      const to = boxIn(b, on2, z), c = {x:lerp(from.x, to.x, e), y:lerp(from.y, to.y, e), w:lerp(from.w, to.w, e), h:lerp(from.h, to.h, e), r:from.r.map((r, i) => Math.max(0, lerp(r, to.r[i], e)))};
      g._now = c;
      Object.assign(g.style, {transform:tr(c), width:c.w + "px", height:c.h + "px", borderRadius:c.r.map(r => r + "px").join(" ")});
      if (p < 1) return requestAnimationFrame(step);
      done();
    };
    step(t0);
  });
}
/* 選到的那一個；data-slide="選擇器" 這種是底色在它裡面的那一塊 */
const selOf = b => { const on = b.querySelector(":scope>.on"); return on && b.dataset.slide ? on.querySelector(b.dataset.slide) : on; };
/* 元素在容器裡的位置（使用次像素精度座標，避免交接時產生 1px 跳動） */
function boxIn(b, el, z){
  const R = b.getBoundingClientRect(), r = el.getBoundingClientRect(), cs = getComputedStyle(el), w = r.width / z, h = r.height / z;
  const rad = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map(k => Math.min(parseFloat(cs[k]) || 0, w / 2, h / 2));
  return {x:(r.left - R.left) / z - b.clientLeft + b.scrollLeft, y:(r.top - R.top) / z - b.clientTop + b.scrollTop, w, h, r:rad};
}
/* 紀錄：所有主機的事件，依日期分組 */
let LOGF = "", LOGH = "";
const LOGK = {"": () => true, bad: e => e.kind === "bad" || e.kind === "warn", other: e => e.kind === "ok" || e.kind === "info"};

function logPage(list){
  const many = list.length > 1, key = many && list.some(x => keyOf(x) === LOGH) ? LOGH : "";
  const all = allEvents(list), byHost = all.filter(e => !key || e.k === key);
  const filtered = byHost.filter(LOGK[LOGF] || LOGK[""]);
  const events = key ? filtered : groupEv(filtered);
  const filters = [["", "全部"], ["bad", "有狀況"], ["other", "恢復與通知"]];
  const buttons = filters.map(([value, label]) => {
    const matching = byHost.filter(LOGK[value]);
    const count = key ? matching.length : groupEv(matching).length;
    return `<button data-logf="${value}" data-key="lf:${value}" aria-pressed="${LOGF === value}">${label}<b class="num">${count}</b></button>`;
  }).join("");
  const host = many ? `<button class="inv-secondary" data-loghm data-key="hsel">${esc(list.find(x => keyOf(x) === key)?.name || "全部主機")}${CHEV}</button>` : "";
  let rows = "", lastDay = "";
  for (const e of events) {
    const day = dayOf(e.t);
    if (day !== lastDay) rows += `<div class="day" data-key="d:${day}">${day}</div>`;
    rows += evRowD(e, many);
    lastDay = day;
  }
  return `<div class="inv-log" data-key="log">${dbar("事件紀錄")}
    <div class="inv-log-filters" data-key="filters"><div aria-label="事件類型">${buttons}</div>${host}</div>
    ${rows ? `<div class="ltab${many ? "" : " one"}" data-key="events"><div class="lth"><span>時間</span>${many ? "<span>主機</span>" : ""}<span class="lev">事件</span></div><div class="evs" data-key="evs" data-keyed>${rows}</div></div>`
      : `<div class="inv-empty" data-key="empty">${LOGF || key ? "沒有符合篩選條件的紀錄" : "目前沒有事件"}${(LOGF || key) && all.length ? '<button class="inv-quiet" data-logreset>查看全部紀錄</button>' : ""}</div>`}</div>`;
}
/* 主題色：照色相排一圈（色票本身用 style.css 的 [data-accent] 算出預覽） */
const ACCENTS = [["red", "紅"], ["orange", "橘"], ["amber", "琥珀"], ["lime", "萊姆"], ["green", "綠"], ["teal", "青綠"],
  ["cyan", "天藍"], ["blue", "藍"], ["indigo", "靛藍"], ["purple", "紫"], ["pink", "粉紅"]];
/* 設定：上面是通知與登入、主機，外觀在最後（電腦放右邊欄）；下面「主機」好幾台時跟工具一樣一排主機名稱選一台，只顯示那台的 */
const SHOWS = [["trend", "歷史曲線圖", "chart"], ["net", "網路速度", "net"], ["box", "容器與服務", "items"], ["info", "連線數與 IP", "info"],
  ["flag", "國旗", "flag"], ["month", "每月流量", "traffic"], ["sun", "天氣", "weather", "用這台裝置的位置"], ["quote", "心情小語", "quote"]];
const showSum = () => { const n = SHOWS.filter(x => PREF.show[x[2]]).length; return n === SHOWS.length ? "全部顯示" : n ? `顯示 ${n} 項` : "全部隱藏"; };
const seg = (k, opts) => `<div class="seg" data-slide>${opts.map(([v, l]) => `<button class="${String(getP(k)) === String(v) ? "on" : ""}" data-pref="${k}" data-val="${v}" aria-pressed="${String(getP(k)) === String(v)}">${l}</button>`).join("")}</div>`;
const tog = (k, l) => `<input type="checkbox" class="tog" data-pref="${k}" aria-label="${l}" ${getP(k) ? "checked" : ""}>`;
let SETC = store("vs-setc") || "";
const STCACHE = {}, RAWCACHE = {}, TOOLCACHE = {};   // 設定頁與工具彈窗狀態快取：點開即時顯示，背景再靜默更新
function selfSumHtml(){
  const hosts = LIST.filter(x => x.online && SELFST[keyOf(x)]);
  const pend = hosts.reduce((n, h) => { const d = SELFST[keyOf(h)]; return n + (d.has && !d.running ? 1 : 0) + (d.cloud && d.cloud.has && !d.cloud.running ? 1 : 0); }, 0);
  return pend > 1 ? `<span>${pend} 項有新版</span><button class="ubtn sm" data-selfup="*">全部更新</button>` : "";
}
function setPage(list){
  const on = list.filter(s => s.online).sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b))), self = on.some(s => !s.node);
  const go = (attr, ic, l, st) => {
    const c = STCACHE[st], v = c ? (!c.b ? "" : c.b === true ? "✓" : String(c.b)) : "", bh = c && c.b === true ? I("check") : v;
    return `<button class="li" ${attr}>${IC(ic, "")}<span class="lab">${l}<small class="${st}${c && c.on ? " on" : ""}" data-keep data-ld>${c ? esc(c.t) : "讀取中…"}</small></span><span class="stb${c && typeof c.b === "number" ? " n" : ""}" data-keep${c && c.b ? ` data-v="${esc(v)}"` : " hidden"}>${bh}</span>${CHEV}</button>`;
  };
  const accMap = Object.fromEntries([...ACCENTS, ["rainbow", "彩色"]]);
  const sw = ACCENTS.map(([v, l]) => `<button class="${PREF.accent === v ? "on" : ""}" data-pref="accent" data-val="${v}" data-accent="${v}" title="${l}" aria-label="${l}">${I("check")}</button>`).join("")
    + `<button class="rbsw${PREF.accent === "rainbow" ? " on" : ""}" data-pref="accent" data-val="rainbow" title="彩色" aria-label="彩色">${I("check")}</button>`;
  const look = `<div class="group" data-key="g-look">
      <div class="li col"><span class="lab">主題</span>${seg("theme", [["auto", "自動"], ["light", "淺色"], ["dark", "深色"]])}</div>
      <div class="li col"><span class="lab sw-head"><span>主題色</span><span class="sw-val"><i></i>${esc(accMap[PREF.accent] || "藍")}</span></span><div class="sww"><div class="sw">${sw}</div></div></div>
      <div class="li col"><span class="lab">配色風格</span>${seg("tone", [["soft", "柔和"], ["vivid", "鮮明"], ["calm", "素雅"]])}</div>
      <div class="li col"><span class="lab">文字大小</span>${seg("size", [["s", "小"], ["m", "中"], ["l", "大"]])}</div>
      <label class="li"><span class="lab">動畫</span>${tog("motion", "動畫")}</label>
      <button class="li" data-shows>${IC("trend", "")}<span class="lab">要顯示的內容<small class="showst">${showSum()}</small></span>${CHEV}</button></div>`;
  const secG = `<div class="group" data-key="g-sec">${go("data-tg", "bell", "Telegram 通知", "tgst")}${PK_OK && self ? go("data-pk", "finger", "手機金鑰登入", "pkst") : ""}${self ? go("data-pin", "pin", "PIN 碼登入", "pinst") + go("data-sess", "devices", "登入的裝置", "sessst") : ""}</div>`;
  const skyG = self && !SHARE ? `<div class="group" data-key="g-sky">${go("data-sky", "sky", "OpenSky 帳號", "skyst")}</div>` : "";
  const out = `<div class="sp" data-key="sp"></div><div class="group" data-key="g-out"><button class="li" data-logout><span class="ico info">${I("logout")}</span><span class="lab">登出</span></button>
      <button class="li" data-reset><span class="ico info">${I("reset")}</span><span class="lab">恢復預設值</span></button></div>`;
  let h = "", hpk = "";
  if (on.length) {
    const s = on.find(x => keyOf(x) === TOOLH) || on.find(x => !x.node) || on[0], k = esc(keyOf(s)), node = esc(s.node || "");
    hpk = on.length > 1 ? hpick(on, s, x => x.self_has ? `<span class="dot info"></span>` : "") : "";
    h += `<div class="selfsum" data-key="selfsum" data-keep data-ld>${selfSumHtml()}</div>`;
    h += `<div class="group" data-key="g-h" data-keyed><div class="selfbox" data-key="self" data-n="${node}"${SELFST[keyOf(s)] ? "" : " data-ld"}>${selfRowHtml(s)}</div>${sysRow(s)}${secRow(s)}<button class="li" data-key="pw" data-newtok="${node}" data-label="${esc(s.name)}">${IC("key", "")}<span class="lab">換一組新密碼<small>舊密碼會立刻失效</small></span>${CHEV}</button>`
      + (s.keep ? `<label class="li" data-key="keep">${IC("keep", "")}<span class="lab">Oracle 防回收${keepLine(s.keep)}</span><input type="checkbox" class="tog" data-keepalive="${node}" aria-label="Oracle 防回收" ${s.keep.on ? "checked" : ""}></label>` : "")
      + (s.node ? "" : go(`data-key="pair" data-pair`, "link", "配對暗號", "pairst")) + `</div>`;
  }

  const groups = [
    ["sec", "通知與登入", "bell", secG],
    ...(h ? [["host", "主機管理", "server", h]] : []),
    ...(skyG ? [["sky", "機場起降", "plane", skyG]] : []),
    ["look", "外觀", "palette", look],
  ];
  const current = groups.find(([key]) => key === SETC) || groups[0];
  const controls = current[0] === "host" ? `<div class="inv-subhead inv-settings-actions">${hpk}<button class="inv-secondary" data-selfcheck>檢查新版</button></div>` : "";
  return `<div class="inv-settings" data-key="set">${dbar("設定")}
    <nav class="inv-settings-tabs" aria-label="設定分類">${groups.map(([key, label, symbol]) => `<button data-setc="${key}" data-key="sc:${key}" aria-pressed="${current[0] === key}">${I(symbol)}${label}</button>`).join("")}</nav>
    <section class="sbody inv-settings-body" data-key="sb:${current[0]}" aria-labelledby="inv-settings-section"><h2 id="inv-settings-section">${current[1]}</h2>${controls}${current[3]}</section>
    <div class="inv-account">${out}</div></div>`;
}
/* 安全檢查：存著的資料、網頁連線、雲端硬碟、備份、SSH 各自有沒有保護好 */
/* 安全檢查：上面是自動做好的（只看），下面是可以自己開關的（SSH、封鎖、自動更新），最下面放 SSH 金鑰 */
const SECI = [["seal", "lock", "密碼和資料", "兩層加密", "還沒加密"], ["web", "net", "網頁連線", "TLS 1.3", "沒加密"],
  ["cloud", "cloud", "雲端硬碟", "整顆加密", "還沒加密"], ["backup", "archive", "每日備份", "加密", "沒開"]];
const SECO = [["sshpw", "key", "SSH 只能用金鑰登入", "關掉密碼登入"], ["sshroot", "user", "root 不能用密碼登入", "只能用金鑰"],
  ["guard", "ban", "錯太多次封鎖", "10 分鐘錯 5 次封 1 小時"], ["autoupd", "layers", "自動安裝安全更新", "不會自己重新開機"]];
const secBad = s => [...SECI, ...SECO].filter(([k]) => s.sec && s.sec[k] === false).length;
const secRow = s => !s.sec ? "" : `<button class="li" data-key="sec" data-secchk="${esc(keyOf(s))}">${IC("safe", "")}<span class="lab">安全檢查${secBad(s) ? `<small class="warn">${secBad(s)} 項要注意</small>` : ""}</span>${secBad(s) ? "" : `<span class="stb" data-v="✓">${I("check")}</span>`}${CHEV}</button>`;
function secModal(k){
  const s = LIST.find(x => keyOf(x) === k); if (!s || !s.sec) return;
  const node = s.node || "", q = node ? `?node=${encodeURIComponent(node)}` : "";
  let D = {sec: s.sec, keys: null, users: [], me: "", keyok: false, bans: 0}, user = "";
  const v = document.createElement("div"); v.className = "veil";
  const head = () => { const n = [...SECI, ...SECO].filter(([x]) => D.sec[x] === false).length; return `<h3>${n ? `${n} 項要注意` : "全部保護好了"}</h3>`; };
  const sub = (key, d) => key === "guard" && D.sec.guard && D.bans ? `封鎖中 ${D.bans} 個` : key === "sshpw" && !D.sec.sshpw && D.keys && !D.keyok ? "先放一把金鑰" : d;
  const opts = () => SECO.filter(([x]) => D.sec[x] != null).map(([key, ic, name, d]) =>
    `<label class="pkrow secrow" data-key="so:${key}">${I(ic)}<span>${name}<small>${sub(key, d)}</small></span><input type="checkbox" class="tog" data-sec="${key}" aria-label="${name}"${D.sec[key] ? " checked" : ""}></label>`).join("");
  const keys = () => D.keys == null ? `<div class="pkrow secrow">${I("key")}<span>讀取中…</span></div>`
    : D.keys.length ? D.keys.map(x => `<div class="pkrow secrow">${I("key")}<span>${esc(x.name || x.type)}<small>${esc(x.user)}・${esc(x.type)}・${esc(x.fp.slice(7, 15))}</small></span></div>`).join("")
    : `<div class="pkrow secrow">${I("key")}<span>還沒有金鑰</span></div>`;
  const users = () => D.users.length > 1 ? `<div class="hpick secu">${D.users.map(u => `<button type="button" class="fchip${u === user ? " on" : ""}" data-secu="${esc(u)}">${esc(u)}</button>`).join("")}</div>` : "";
  v.innerHTML = `<div class="dialog pkd secd">${IC("safe", "big")}<div class="sech">${head()}</div><p>${esc(s.name)}</p>
    <div class="form"><div class="pklist">${SECI.filter(([x]) => D.sec[x] != null).map(([key, ic, name, good, bad]) => { const ok = D.sec[key];
      return `<div class="pkrow secrow">${I(ic)}<span>${name}<small>${ok ? good : bad}</small></span><span class="seck ${ok ? "ok" : "warn"}">${I(ok ? "check" : "warn")}</span></div>`; }).join("")}</div>
      <div class="lbl">SSH 和更新</div><div class="pklist seco">${opts()}</div>
      <div class="lbl">SSH 金鑰<button type="button" data-secadd>${I("plus")}加金鑰</button></div><div class="pklist seckeys">${keys()}</div>
      <div class="dlck seknew" hidden><span class="secus"></span><textarea class="field pfield" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="貼上 .pub 檔的內容"></textarea>
        <div class="dlnew"><button type="button" class="ubtn sm ghost" data-secgen>幫我做一組</button><button type="button" class="ubtn sm" data-seckey>加進去</button></div></div>
      <div class="msg"></div></div></div>`;
  $("#layer").appendChild(v);
  const msg = v.querySelector(".msg"), box = v.querySelector(".seknew");
  const paint = () => { swapHTML(v.querySelector(".sech"), head()); v.querySelector(".seco").innerHTML = opts(); v.querySelector(".seckeys").innerHTML = keys(); v.querySelector(".secus").innerHTML = users(); };
  const call = async body => {
    const r = await api("/api/sec" + q, {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(body)});
    const x = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error("這台還沒更新到新版，先更新再試");
    if (x.sec) { D = x; s.sec = x.sec; if (!user) user = x.me || x.users[0] || ""; paint(); }
    if (!r.ok || x.ok === false) throw new Error(x.message || x.error || "失敗了，請再試一次");
    return x;
  };
  call({action:"info"}).catch(e => sayTo(msg, e.message));
  const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => v.remove(), 360); };
  v._esc = done;
  v.addEventListener("change", async e => {
    const t = e.target; if (!t.dataset.sec) return;
    const key = t.dataset.sec, on = t.checked;
    if (key === "sshpw" && on && !D.keyok) { t.checked = false; reveal(box, true); return sayTo(msg, "先放一把金鑰，不然關掉後就進不來了"); }
    if (key === "sshpw" && on && !await modal({icon:"key", cls:"warn", title:"關掉 SSH 密碼登入？", text:"之後只能用金鑰登入，已經連著的不會斷。", ok:"關掉"})) { t.checked = false; return; }
    t.disabled = true; sayTo(msg, "");
    try { await call({action: on ? "fix" : "undo", item: key}); toast(on ? "好了" : "已改回"); }
    catch (x) { t.checked = !on; sayTo(msg, x.message); }
    t.disabled = false;
  });
  v.addEventListener("click", async e => {
    if (e.target === v) return done();
    const t = e.target;
    if (t.closest("[data-secadd]")) { reveal(box, box.hidden || box._hiding); return; }
    const u = t.closest("[data-secu]"); if (u) { user = u.dataset.secu; v.querySelector(".secus").innerHTML = users(); return; }
    const b = t.closest("[data-seckey],[data-secgen]"); if (!b) return;
    const gen = b.matches("[data-secgen]"), ta = box.querySelector("textarea");
    if (!gen && !ta.value.trim()) return ta.focus();
    b.disabled = true; sayTo(msg, "");
    try {
      const x = await call(gen ? {action:"gen", user} : {action:"key", user, key: ta.value.trim()});
      if (gen && x.priv) {                          // 私密金鑰只給這一次：存成檔案
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([x.priv], {type:"application/octet-stream"}));
        a.download = `${s.name}-${user}.key`.replace(/[\\/:*?"<>|\s]+/g, "-"); document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      ta.value = ""; reveal(box, false);
      sayTo(msg, gen ? "金鑰已下載，只給這一次，請收好" : x.message || "加好了");
    } catch (x) { sayTo(msg, x.message); }
    b.disabled = false;
  });
}
/* 加密筆記：Joplin 用 WebDAV 同步到這台（筆記在手機上先加密，主機只存亂碼） */
function notesModal(node, name){
  const q = node ? `?node=${encodeURIComponent(node)}` : "", ck = "nt:" + (node || "");
  let D = TOOLCACHE[ck] || null, pw = "", ek = "", busy = false;
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog tdlg ntd"><div class="thead">${IC("note", "")}<div class="thead-t"><h3>加密筆記</h3><p>${esc(name)}</p></div><span class="tbadge ntbdg"></span></div>
    <div class="form"><div class="ntb"><div class="abjob"><span class="spin"></span><span>讀取中…</span></div></div><div class="msg"></div></div></div>`;
  const body = v.querySelector(".ntb"), msg = v.querySelector(".msg"), bdg = v.querySelector(".ntbdg");
  const url = () => (D.base || location.origin.replace(/^http:/, "https:")) + D.path;   // 只收 https
  const row = (k, label, val, secret = false) => `<div class="ntrow"><span class="ntk">${label}</span><code${secret ? ' class="ipb" data-ntshow role="button" tabindex="0" title="點一下顯示"' : ""}>${esc(val)}</code><button type="button" class="ubtn sm ghost copybtn" data-ntcp="${k}">${I("copy")}複製</button></div>`;
  const draw = init => {
    bdg.textContent = D.on ? "已開啟" : "未開啟";
    bdg.className = "tbadge ntbdg" + (D.on ? " ok" : "");
    const locked = !pw || !ek;
    const h = !D.on
      ? `<div class="tcard ntonb"><p class="ntx">使用 Joplin 在手機和電腦之間同步加密筆記。</p>
          <ul class="ntpts"><li>${I("lock")}<span>端對端加密，主機無法讀取內容</span></li><li>${I("archive")}<span>會自動納入每日備份</span></li><li>${I("devices")}<span>支援 iOS、Android、Mac、Windows</span></li></ul></div>
        <button type="button" class="ubtn" data-nt="on">開啟加密筆記</button>`
      : `<div class="ntstats">
          <div><b class="num">${D.files || 0}</b><small>檔案數</small></div>
          <div><b class="num">${D.files ? size(D.size) : "0 B"}</b><small>佔用空間</small></div>
          <div><b>${D.last ? ago(D.last) : "尚未"}</b><small>最近同步</small></div>
        </div>
        <div class="tcard">
          <div class="tcardh"><span>WebDAV 連線資訊</span>${locked ? `<button type="button" class="linkish" data-ntshow>顯示密碼</button>` : ""}</div>
          <div class="ntlist">${row("網址", "網址", url())}${row("帳號", "帳號", D.user)}${row("密碼", "同步密碼", pw || "•".repeat(20), !pw)}${row("加密", "加密密碼", ek || "•".repeat(20), !ek)}</div>
        </div>
        <div class="tcard">
          <div class="tcardh"><span>在 Joplin App 設定</span></div>
          <ol class="ntsteps"><li><span><b>啟用加密</b>：到「加密」填入上面的「加密密碼」（先做這步）</span></li><li><span><b>設定同步</b>：到「同步」選 WebDAV，填入網址、帳號、同步密碼</span></li>${D.self_signed ? "<li><span><b>略過憑證</b>：同步進階選項勾選「忽略 TLS 憑證錯誤」</span></li>" : ""}</ol>
        </div>
        <div class="tfootbar"><button type="button" class="ubtn sm ghost" data-nt="new">換同步密碼</button><button type="button" class="ubtn sm ghost" data-nt="off">暫停同步</button><button type="button" class="ubtn sm ghost bad ntwipe" data-nt="wipe">${I("trash")}清除全部</button></div>`;
    if (init) body.innerHTML = h; else swapHTML(body, h);
  };
  if (D) draw(true);
  $("#layer").appendChild(v);
  const call = async b => {
    const r = await api("/api/notes" + q, {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(b)});
    const x = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error("這台還沒更新到新版，先更新再試");
    if (!r.ok || x.ok === false) throw new Error(x.message || x.error || "失敗了，請再試一次");
    return x;
  };
  const run = async b => {
    if (busy) return null; busy = true; sayTo(msg, "");
    try { const x = await call(b); D = x; TOOLCACHE[ck] = {...x, pw:"", ek:""}; if (x.pw) pw = x.pw; if (x.ek) ek = x.ek; if (b.action === "off") pw = ek = ""; draw(); return x; }
    catch (e) { sayTo(msg, e.message); return null; }
    finally { busy = false; }
  };
  run({action:"info"});
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("click", async e => {
      if (e.target === v) return done();
      const t = e.target;
      if (t.closest("[data-ntshow]")) return run({action:"show"});
      const cp = t.closest("[data-ntcp]");
      if (cp) {
        const k = cp.dataset.ntcp;
        if ((k === "密碼" && !pw || k === "加密" && !ek) && !await run({action:"show"})) return;
        const txt = k === "網址" ? url() : k === "帳號" ? D.user : k === "加密" ? ek : pw;
        try { await navigator.clipboard.writeText(txt); toast(`已複製${k}`); }
        catch (_) { const r = document.createRange(); r.selectNodeContents(cp.parentNode.querySelector("code")); getSelection().removeAllRanges(); getSelection().addRange(r); }
        return;
      }
      const b = t.closest("[data-nt]"); if (!b) return;
      const act = b.dataset.nt;
      if (act === "new" && !await modal({icon:"key", cls:"warn", title:"換一組密碼？", text:"舊密碼會立刻失效，每台 Joplin 都要重填。", ok:"換密碼"})) return;
      if (act === "off" && !await modal({icon:"note", cls:"warn", title:"暫停加密筆記？", text:"Joplin 會連不上，筆記還留在主機上。", ok:"暫停"})) return;
      if (act === "wipe" && !await modal({icon:"trash", cls:"bad", title:"清除所有筆記？", text:"主機上的筆記全部刪掉、密碼都換新，救不回來；手機上的不動。", ok:"清除"})) return;
      const x = await run({action: act});
      if (x && act !== "on") toast(x.message || "好了");
    });
  });
}
/* 相簿分享：雲端硬碟選一個資料夾，做成照片牆連結給朋友（誰能看、下載、浮水印、挑照片都能改，隨時收回） */
const ALMT = [[86400, "1 天"], [604800, "7 天"], [2592000, "30 天"], [0, "不限"]];
const ALMD = [[1, "1 台"], [3, "3 台"], [0, "不限"]];
const ALMDL = [[0, "不給"], [1, "壓縮圖"], [2, "原圖"]];
const ALMUP = [[0, "不開放"], [1, "要我確認"], [2, "直接放上去"]];
const ALMUQ = [[1, "1 GB"], [5, "5 GB"], [20, "20 GB"]];
const almGB = n => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(n ? 1 : 0, Math.round(n / 1e6))} MB`;
const almLeft = a => !a.exp ? "不會過期" : (s => s > 172800 ? `${Math.round(s / 86400)} 天後失效` : s > 3600 ? `${Math.round(s / 3600)} 小時後失效` : "快失效了")(a.exp - Date.now() / 1000);
const almAgo = t => { const s = Date.now() / 1000 - t; return s < 120 ? "剛剛" : s < 3600 ? `${Math.round(s / 60)} 分鐘前` : s < 86400 ? `${Math.round(s / 3600)} 小時前` : `${Math.round(s / 86400)} 天前`; };
function albumModal(node, name){
  const q = node ? `?node=${encodeURIComponent(node)}` : "", ck = "alm:" + (node || "");
  let D = TOOLCACHE[ck] || null, view = "list", cur = null, dir = "", F = null, busy = false, PK = null, DV = null, TK = null, tab = "basic";
  const o = {secs:604800, loc:true, dl:2, dev:0, talk:true, shy:true, snap:false, up:0, uq:1};
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog tdlg wide almd"><div class="thead almhead">${IC("album", "")}<div class="thead-t"><h3>相簿分享</h3><p>${esc(name)}</p></div></div>
    <div class="form"><div class="almb"><div class="abjob"><span class="spin"></span><span>讀取中…</span></div></div><div class="msg"></div></div></div>`;
  const head = v.querySelector(".almhead"), body = v.querySelector(".almb"), msg = v.querySelector(".msg");
  const base = () => (D && D.base) || location.origin;
  const link = a => `${base()}/a/${a.code}`;
  const call = async b => {
    const r = await api("/api/album" + q, {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(b)});
    const x = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error("這台還沒更新到新版，先更新再試");
    if (!r.ok || x.ok === false) throw new Error(x.message || x.error || "失敗了，請再試一次");
    return x;
  };
  const run = async b => {
    if (busy) return null; busy = true; sayTo(msg, "");
    try { const x = await call(b); if (x.list) { D = x; TOOLCACHE[ck] = x; } return x; }
    catch (e) { sayTo(msg, e.message); return null; }
    finally { busy = false; }
  };
  const tg = (k, on, l, ic) => `<label class="almrw">${I(ic)}<span>${l}</span><input type="checkbox" class="tog" data-almo="${k}" aria-label="${l}"${on ? " checked" : ""}></label>`;
  const sg = (k, list, val) => `<div class="seg" data-slide data-alms="${k}">${list.map(([s, l]) => `<button type="button" class="${val === s ? "on" : ""}" data-v="${s}">${l}</button>`).join("")}</div>`;
  const srow = (ic, l, k, list, val, side = "", extra = "") => `<div class="almrw col"${extra}><div class="almrh">${I(ic)}<span>${l}</span><small class="alms" data-side="${k}">${side}</small></div>${sg(k, list, val)}</div>`;
  const cover = a => a.cv ? `<img alt="" src="${esc(a.cv)}">` : `<i class="almph">${I("album")}</i>`;
  const meta = a => `${[a.n - (a.nv || 0) ? `${a.n - (a.nv || 0)} 張` : "", a.nv ? `${a.nv} 段影片` : ""].filter(Boolean).join("・")}${a.all > a.n ? `（共 ${a.all}）` : ""}・${almLeft(a)}`;
  const dlSide = d => ["朋友只能看", "長邊 2048 的 JPEG", "跟雲端硬碟裡一樣"][d];
  const upSide = u => ["", "你確認了才出現", "朋友放了馬上出現"][u] || "";
  const curA = () => D && D.list.find(x => x.id === cur);
  const paintHead = () => {
    const a = curA();
    if (view === "list") {
      const n = D && D.list ? D.list.length : 0;
      head.innerHTML = `${IC("album", "")}<div class="thead-t"><h3>相簿分享</h3><p>${esc(name)}${D ? `・${n ? `${n} 本分享中` : "還沒分享"}` : ""}</p></div>${D && D.cloud ? `<button type="button" class="ubtn sm" data-alm="new">${I("plus")}新增</button>` : ""}`;
      return;
    }
    const cfg = {
      pick: ["list", "選擇資料夾", "步驟 1／2・從雲端硬碟挑選"],
      opts: ["pick", "建立相簿設定", "步驟 2／2・設定誰能看與權限"],
      one: ["list", a ? a.name : "相簿設定", a ? meta(a) : name],
      photos: ["back", "挑照片", a ? a.name : ""],
      pend: ["back", "朋友放的照片", a ? a.name : ""],
      devs: ["back", "看過的設備", a ? a.name : ""],
      talk: ["back", "留言與愛心", a ? a.name : ""],
    }[view] || ["list", "相簿分享", name];
    head.innerHTML = `<button type="button" class="iconbtn almback" data-alm="${cfg[0]}" title="返回">${I("back")}</button><div class="thead-t"><h3>${esc(cfg[1])}</h3><p>${esc(cfg[2])}</p></div>`;
  };
  const oneTabBody = (a, k) => k === "basic"
    ? `<div class="almsec"><h4>名稱與介紹</h4>
        <div class="almrw col"><div class="almrh">${I("edit")}<span>相簿名稱</span></div><input class="field" data-almk="name" maxlength="40" value="${esc(a.name)}"></div>
        <div class="almrw col"><div class="almrh">${I("quote")}<span>封面介紹</span><small class="alms">選填・最多 300 字</small></div><textarea class="field" data-almk="intro" rows="2" maxlength="300" placeholder="寫幾句話，放在封面下面">${esc(a.intro || "")}</textarea>
          <div class="almin end"><button type="button" class="ubtn sm" data-alm="meta">儲存文字</button></div></div></div>
      <div class="almsec"><h4>誰能看</h4>${srow("clock", "能看多久", "secs", ALMT, -1, almLeft(a))}${srow("devices", "幾台設備", "dev", ALMD, a.dev, a.dev ? `${a.ndev} 台在看` : "不限")}
        <div class="almrw col"><div class="almrh">${I("lock")}<span>存取密碼</span><small class="alms">${a.pw ? "已設定" : "沒有"}</small></div>
          <div class="almin"><input class="field" data-almk="pw" type="password" maxlength="64" autocomplete="new-password" placeholder="${a.pw ? "輸入新密碼更換" : "不設密碼"}"><button type="button" class="ubtn sm" data-alm="pw">${a.pw ? "更換" : "設定"}</button>${a.pw ? `<button type="button" class="ubtn sm ghost" data-alm="nopw">拿掉</button>` : ""}</div></div></div>`
    : `<div class="almsec"><h4>下載與協作</h4>${srow("dl", "允許下載", "dl", ALMDL, a.dl, dlSide(a.dl))}${srow("upl", "朋友放照片", "up", ALMUP, a.up || 0, upSide(a.up || 0))}${srow("disk", "朋友最多放", "uq", ALMUQ, a.uq || 1, `已放 ${almGB(a.uused || 0)}`, a.up ? ' data-almuq' : ' data-almuq hidden')}${tg("talk", a.talk, "朋友可以按愛心、留言", "chat")}</div>
      <div class="almsec"><h4>隱私與呈現</h4>${tg("loc", a.loc, "顯示拍攝地點和地圖", "mpin")}${tg("shy", a.shy !== false, "離開畫面、截圖時照片變糊", "shield")}${tg("snap", a.snap, "按截圖鍵就鎖住那台設備", "lock")}
        <div class="almrw">${I("music")}<span>幻燈片配樂</span><small class="alms">${a.mu ? esc(a.mu) : "放一首歌進資料夾就有"}</small></div>
        <div class="almrw col"><div class="almrh">${I("edit")}<span>浮水印</span><small class="alms">${a.wm ? (a.wmok ? "印在照片上" : "只蓋在畫面上") : "沒有"}</small></div>
          <div class="almin"><input class="field" data-almk="wm" maxlength="24" value="${esc(a.wm)}" placeholder="例如 © 你的名字"><button type="button" class="ubtn sm" data-alm="wm">${a.wm ? "更換" : "加上"}</button>${a.wm ? `<button type="button" class="ubtn sm ghost" data-alm="nowm">拿掉</button>` : ""}</div></div></div>`;
  const pane = {
    list: () => D.list.length
      ? `<div class="almgrid">${D.list.map(a => `<div class="almcard" data-almid="${esc(a.id)}" role="button" tabindex="0"><span class="almcv">${cover(a)}</span>
          <button type="button" class="almcpy" data-almcp="${esc(a.id)}" title="複製連結" aria-label="複製連結">${I("copy")}</button>
          <span class="almcap"><b>${esc(a.name)}</b><small>${meta(a)}</small></span>${a.pw || a.dev || a.npend ? `<span class="almbdg${a.npend ? " pend" : ""}">${a.npend ? `${I("upl")}<em>${a.npend}</em>` : ""}${a.pw ? I("lock") : ""}${a.dev ? `<em>${a.ndev}／${a.dev}</em>` : ""}</span>` : ""}</div>`).join("")}</div>`
      : `<div class="tcard dlempty">${I("album")}<b>還沒有分享任何相簿</b><small>選一個雲端硬碟資料夾，馬上變成專屬加密照片牆</small><button type="button" class="ubtn" data-alm="new">${I("plus")}選資料夾開始</button></div>`,
    pick: () => `<div class="almcrumb"><button type="button" data-almdir="">雲端硬碟</button>${dir ? dir.split("/").map((p, i, a) => `<span>/</span><button type="button" data-almdir="${esc(a.slice(0, i + 1).join("/"))}">${esc(p)}</button>`).join("") : ""}</div>
      <div class="pklist almdirs">${F.subs.length ? F.subs.map(x => `<button type="button" class="pkrow" data-almdir="${esc((dir ? dir + "/" : "") + x.name)}">${I("folder")}<span><b>${esc(x.name)}</b><small>${x.n ? `${x.n} 張照片` : "沒有照片"}</small></span>${CHEV}</button>`).join("")
        : `<div class="pkrow"><span><small>沒有其他子資料夾</small></span></div>`}</div>
      <button type="button" class="ubtn" data-alm="use"${F.n ? "" : " disabled"}>${F.n ? `用這個資料夾（${F.n} 張）` : "這個資料夾裡沒有照片"}</button>`,
    opts: () => `<div class="almsec"><h4>相簿資訊</h4><div class="almrw col"><div class="almrh">${I("edit")}<span>相簿名稱</span></div><input class="field" data-almk="name" maxlength="40" value="${esc(dir.split("/").pop() || "相簿")}"></div></div>
      <div class="almsec"><h4>誰能看</h4>${srow("clock", "能看多久", "secs", ALMT, o.secs)}${srow("devices", "幾台設備", "dev", ALMD, o.dev)}
        <div class="almrw col"><div class="almrh">${I("lock")}<span>存取密碼</span></div><input class="field" data-almk="pw" type="password" maxlength="64" autocomplete="new-password" placeholder="留空表示不設密碼"></div></div>
      <div class="almsec"><h4>能做什麼</h4>${srow("dl", "允許下載", "dl", ALMDL, o.dl, dlSide(o.dl))}${srow("upl", "朋友放照片", "up", ALMUP, o.up, upSide(o.up))}${srow("disk", "朋友最多放", "uq", ALMUQ, o.uq, "一個人最多四分之一", o.up ? ' data-almuq' : ' data-almuq hidden')}${tg("loc", o.loc, "顯示拍攝地點和地圖", "mpin")}${tg("talk", o.talk, "朋友可以按愛心、留言", "chat")}${tg("shy", o.shy, "離開畫面、截圖時照片變糊", "shield")}${tg("snap", o.snap, "按截圖鍵就鎖住那台設備", "lock")}</div>
      <button type="button" class="ubtn" data-alm="make">建立分享連結</button>`,
    one: () => { const a = curA(); if (!a) return pane.list();
      const shareTxt = navigator.share && matchMedia("(pointer:coarse)").matches ? "分享" : "複製";
      return `<div class="almhero2"><span class="almcv">${cover(a)}</span><div class="almhinfo">
          <div class="codebox almurl"><code>${esc(link(a))}</code><button type="button" class="ubtn sm copybtn" data-alm="copy">${I("copy")}${shareTxt}</button></div>
          <div class="almchips">${a.pw ? `<span>${I("lock")}有密碼</span>` : ""}${a.dev ? `<span>${I("devices")}限 ${a.dev} 台</span>` : ""}${a.wm ? `<span>${I("edit")}浮水印</span>` : ""}<span>${I("dl")}${["不可下載", "壓縮圖", "原圖"][a.dl]}</span></div>
        </div></div>
      ${a.nup ? `<button type="button" class="almnew${a.npend ? " hot" : ""}" data-alm="pend">${I("upl")}<span>朋友放的照片</span><small>${a.npend ? `${a.npend} 個等你確認` : `共 ${a.nup} 個`}</small>${CHEV}</button>` : ""}
      <div class="almacts"><a href="${esc(link(a))}" target="_blank" rel="noopener noreferrer">${EXT}<span>打開看看</span><small>預覽相簿</small></a>
        <button type="button" data-alm="photos">${I("album")}<span>挑照片</span><small class="num">${a.n}／${a.all - (a.npend || 0)}</small></button>
        <button type="button" data-alm="devs">${I("devices")}<span>看過的設備</span><small class="num">${a.nlock ? `${I("lock")}${a.nlock}・` : ""}${a.ndev}${a.dev ? `／${a.dev}` : ""}</small></button>
        <button type="button" data-alm="talk">${I("chat")}<span>留言</span><small class="num">${a.ncm}${a.nlk ? `・♥ ${a.nlk}` : ""}</small></button></div>
      <div class="seg almtab" data-slide><button type="button" class="${tab === "basic" ? "on" : ""}" data-almtab="basic">基本與權限</button><button type="button" class="${tab === "more" ? "on" : ""}" data-almtab="more">互動與保護</button></div>
      <div class="almtbody swgrid">
        <div class="swpane${tab === "basic" ? "" : " off"}" data-sw="basic"${tab === "basic" ? "" : ' aria-hidden="true"'}>${oneTabBody(a, "basic")}</div>
        <div class="swpane${tab === "more" ? "" : " off"}" data-sw="more"${tab === "more" ? "" : ' aria-hidden="true"'}>${oneTabBody(a, "more")}</div>
      </div>
      <div class="tfootbar almfoot"><button type="button" class="ubtn sm ghost bad ntwipe" data-alm="del">${I("trash")}收回分享連結</button></div>`; },
    photos: () => { const n = PK.photos.filter(p => !p.hid).length;
      return `<div class="almpkh"><b>已選 <span class="num">${n}</span>／${PK.photos.length} 張</b><button type="button" class="ubtn sm ghost" data-alm="pkall">${n === PK.photos.length ? "全部不選" : "全選"}</button></div>
      <div class="almpk">${PK.photos.map(p => `<button type="button" class="${p.hid ? "off" : ""}" data-almp="${p.i}" aria-pressed="${!p.hid}">${p.q ? `<img class="lq" alt="" src="data:image/jpeg;base64,${p.q}">` : ""}<img alt="" loading="lazy" src="${esc(`${PK.base || base()}/a/${PK.code}/i/${p.i}/s?v=${p.v}&own=${encodeURIComponent(PK.own)}`)}"><i>${I("ok")}</i>${p.vd ? `<em class="num">${Math.floor(p.vd / 60)}:${String(Math.round(p.vd % 60)).padStart(2, "0")}</em>` : ""}</button>`).join("")}</div>
      <button type="button" class="ubtn" data-alm="pksave"${n ? "" : " disabled"}>${n ? "儲存挑選結果" : "至少留一張"}</button>`; },
    devs: () => `${DV.devs.length || DV.dev ? `<div class="almpkh"><b>${DV.dev ? `限 ${DV.dev} 台・已用 ${DV.devs.length} 台` : `${DV.devs.length} 台設備看過`}</b></div>` : ""}
      ${DV.devs.length ? `<div class="pklist">${DV.devs.map(d => `<div class="pkrow almdv">${almIcon(d)}<span><b>${esc(almDv(d)[0])}</b>${almDv(d)[1] ? `<small>${esc(almDv(d)[1])}</small>` : ""}<small>${d.lk ? `${almAgo(d.lk)}按了截圖，鎖住了` : `${almAgo(d.t)}・看了 ${d.c} 次`}</small></span>${d.lk ? `<button type="button" class="ubtn sm" data-almunlk="${esc(d.h)}">解除</button>` : ""}<button type="button" class="ubtn sm ghost bad" data-almkick="${esc(d.h)}">踢掉</button></div>`).join("")}</div>`
        : `<div class="tcard dlempty">${I("devices")}<b>還沒有人打開</b><small>把連結傳給朋友後，看過的設備會列在這裡</small></div>`}`
  };
  const pkImg = p => `${p.q ? `<img class="lq" alt="" src="data:image/jpeg;base64,${p.q}">` : ""}<img alt="" loading="lazy" src="${esc(`${PK.base || base()}/a/${PK.code}/i/${p.i}/s?v=${p.v}&own=${encodeURIComponent(PK.own)}`)}"><i>${I("ok")}</i>`;
  pane.pend = () => { const L = PK.pend, n = L.filter(p => p.sel).length, np = L.filter(p => p.sel && p.pend).length, who = [...new Set(L.map(p => p.u))];
    return `<div class="almpkh"><b>已選 <span class="num">${n}</span>／${L.length}</b><button type="button" class="ubtn sm ghost" data-alm="pdall">${n === L.length ? "全部不選" : "全選"}</button></div>
      <div class="almups">${who.map(w => { const G = L.filter(p => p.u === w), k = G.filter(p => p.sel).length;
        return `<div class="almwho"><div class="almpkh"><b>${esc(w)}<small class="num">${G.length}</small></b><button type="button" class="ubtn sm ghost" data-almw="${esc(w)}">${k === G.length ? "不選" : "選這個人全部"}</button></div>
        <div class="almpk">${G.map(p => `<button type="button" class="${p.sel ? "" : "off"}" data-almq="${p.i}" aria-pressed="${!!p.sel}">${pkImg(p)}${p.pend ? `<em class="ub">等你確認</em>` : ""}</button>`).join("")}</div></div>`; }).join("")}</div>
      <div class="almin almq">${L.some(p => p.pend) ? `<button type="button" class="ubtn" data-alm="okup"${np ? "" : " disabled"}>放上去</button>` : ""}<button type="button" class="ubtn ghost bad" data-alm="noup"${n ? "" : " disabled"}>${I("trash")}刪掉</button></div>`; };
  pane.talk = () => { const im = (i, ver) => esc(`${TK.base || base()}/a/${TK.code}/i/${i}/s?v=${ver}&own=${encodeURIComponent(TK.own)}`);
    return `${TK.likes.length ? `<div class="almpkh"><b>最多愛心</b></div><div class="almlk">${TK.likes.map(l => `<span><img alt="" loading="lazy" src="${im(l.i, l.v)}"><em class="num">${I("heart")}${l.n}</em></span>`).join("")}</div>` : ""}
      <div class="almpkh"><b>${TK.c.length ? `${TK.c.length} 則留言` : "還沒有人留言"}</b></div>
      ${TK.c.length ? `<div class="pklist almtk">${TK.c.map(c => `<div class="pkrow">${c.gb ? `<span class="almgb">${I("chat")}</span>` : `<img alt="" loading="lazy" src="${im(c.i, c.v)}">`}<span><b>${esc(c.n)}<small>${almAgo(c.t)}</small></b><small>${esc(c.s)}</small></span><button type="button" class="ubtn sm ghost bad" data-almtk="${esc(c.i)}|${esc(c.id)}" aria-label="刪掉">${I("trash")}</button></div>`).join("")}</div>`
        : `<div class="tcard dlempty">${I("chat")}<b>還沒有人留言</b><small>朋友在相簿按讚或留一句話會出現在這裡</small></div>`}`; };
  const draw = init => { paintHead(); const h = pane[view](); if (init) body.innerHTML = h; else swapHTML(body, h); };
  const share = async a => {
    const url = link(a);
    if (navigator.share && matchMedia("(pointer:coarse)").matches) { try { await navigator.share({title:a.name, url}); } catch (e) { /* 取消分享 */ } return; }
    try { await navigator.clipboard.writeText(url); toast("已複製連結"); } catch (e) { toast("複製不了，請長按連結複製", "bad"); }
  };
  const goDir = async d => { const x = await run({action:"folders", dir:d}); if (x) { F = x; dir = x.dir; view = "pick"; draw(); } };
  const side = (k, t) => { const s = v.querySelector(`[data-side="${k}"]`); if (s) s.textContent = t; };
  if (D && D.cloud) draw(true);
  $("#layer").appendChild(v);
  run({action:"list"}).then(x => { if (!x || v._d) return; if (!x.cloud) { paintHead(); swapHTML(body, `<p class="ntx">這台沒有雲端硬碟</p>`); return; } if (view === "list") draw(); });
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("change", async e => {
      const t = e.target.closest("[data-almo]"); if (!t) return;
      if (view === "opts") { o[t.dataset.almo] = t.checked; return; }
      const k = t.dataset.almo, x = await run({action:"edit", id:cur, [k]:t.checked});
      if (!x) t.checked = !t.checked;
      else toast({talk:["朋友可以按愛心、留言", "關掉了，之前的留言還留著"], loc:["朋友看得到地點", "地點藏起來了，下載的照片也拿掉定位"],
        shy:["離開畫面、截圖時照片會變糊", "照片不會變糊了"], snap:["按截圖鍵就鎖住那台設備", "按截圖鍵不會鎖住了"]}[k]?.[t.checked ? 0 : 1] || "改好了");
    });
    v.addEventListener("click", async e => {
      if (e.target === v) return done();
      const t = e.target;
      const tb = t.closest("[data-almtab]");
      if (tb) {
        if (tb.dataset.almtab === tab) return;
        const sd = tb.dataset.almtab === "more" ? 1 : -1;
        tab = tb.dataset.almtab;
        slideSel(() => v.querySelectorAll("[data-almtab]").forEach(x => x.classList.toggle("on", x === tb)));
        slidePane(v.querySelector(".almtbody"), tab, sd);
        return;
      }
      const sb = t.closest("[data-alms] button");
      if (sb) {
        const k = sb.parentNode.dataset.alms, val = +sb.dataset.v;
        if (k !== "secs" && sb.classList.contains("on")) return;
        slideSel(() => sb.parentNode.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === sb)));
        if (k === "dl") side("dl", dlSide(val));
        if (k === "up") { side("up", upSide(val)); const uq = v.querySelector("[data-almuq]"); if (uq) reveal(uq, val > 0); }
        if (view === "opts") { o[k] = val; return; }
        const x = await run({action:"edit", id:cur, [k]:val}); if (!x) return;
        const a = curA();
        if (k === "secs") { toast(val ? `從現在起 ${sb.textContent}` : "不會過期了"); if (a) { side("secs", almLeft(a)); const sp = head.querySelector(".thead-t p"); if (sp) txt(sp, meta(a)); } }
        if (k === "dev") { toast(val ? `只給 ${val} 台設備看` : "幾台設備都能看"); if (a) side("dev", val ? `${a.ndev} 台在看` : "不限"); }
        if (k === "dl") toast(["朋友不能下載了", "只能下載壓縮圖", "可以下載原圖"][val]);
        if (k === "up") { toast(["朋友不能放照片了", "朋友放的要你確認", "朋友放的馬上出現"][val]); if (a && val === 2 && a.npend) { const nw = v.querySelector(".almnew"); if (nw) { nw.classList.remove("hot"); const sm = nw.querySelector("small"); if (sm) txt(sm, `共 ${a.nup} 個`); } } }
        if (k === "uq") toast(`朋友最多放 ${val} GB`);
        return;
      }
      const cpy = t.closest("[data-almcp]");
      if (cpy) { const a = D && D.list.find(x => x.id === cpy.dataset.almcp); if (a) share(a); return; }
      const row = t.closest("[data-almid]");
      if (row) { cur = row.dataset.almid; view = "one"; tab = "basic"; return draw(); }
      const dd = t.closest("[data-almdir]");
      if (dd) return goDir(dd.dataset.almdir);
      const pp = t.closest("[data-almp]");
      if (pp) { const p = PK.photos.find(x => x.i === pp.dataset.almp); p.hid = !p.hid; pp.classList.toggle("off", p.hid); pp.setAttribute("aria-pressed", String(!p.hid));
        const n = PK.photos.filter(x => !x.hid).length, h = v.querySelector(".almpkh .num"); if (h) h.textContent = n;
        const sv = v.querySelector('[data-alm="pksave"]'); if (sv) { sv.disabled = !n; sv.textContent = n ? "儲存挑選結果" : "至少留一張"; }
        const al = v.querySelector('[data-alm="pkall"]'); if (al) al.textContent = n === PK.photos.length ? "全部不選" : "全選";
        return; }
      const pq = t.closest("[data-almq]");
      if (pq) { const p = PK.pend.find(x => x.i === pq.dataset.almq); p.sel = !p.sel; pq.classList.toggle("off", !p.sel); pq.setAttribute("aria-pressed", String(p.sel));
        return almPendSync(); }
      const pw = t.closest("[data-almw]");
      if (pw) { const G = PK.pend.filter(x => x.u === pw.dataset.almw), all = G.every(x => x.sel);
        G.forEach(x => { x.sel = !all; const b = v.querySelector(`[data-almq="${x.i}"]`); if (b) { b.classList.toggle("off", !x.sel); b.setAttribute("aria-pressed", String(x.sel)); } });
        return almPendSync(); }
      function almPendSync(){
        const L = PK.pend, n = L.filter(x => x.sel).length, h = v.querySelector(".almpkh .num"); if (h) h.textContent = n;
        const ok = v.querySelector('[data-alm="okup"]'); if (ok) ok.disabled = !L.some(x => x.sel && x.pend);
        const no = v.querySelector('[data-alm="noup"]'); if (no) no.disabled = !n;
        const al = v.querySelector('[data-alm="pdall"]'); if (al) al.textContent = n === L.length ? "全部不選" : "全選";
        v.querySelectorAll("[data-almw]").forEach(b => { const G = L.filter(x => x.u === b.dataset.almw); b.textContent = G.every(x => x.sel) ? "不選" : "選這個人全部"; });
      }
      const tk = t.closest("[data-almtk]");
      if (tk) {
        if (!await modal({icon:"trash", cls:"bad", title:"刪掉這則留言？", text:"朋友那邊也會看不到。", ok:"刪掉"})) return;
        const [i, cid] = tk.dataset.almtk.split("|"), x = await run({action:"talkdel", id:cur, i, cid});
        if (x) { TK = x; draw(); toast("刪掉了"); }
        return;
      }
      const ul = t.closest("[data-almunlk]");
      if (ul) {
        if (await run({action:"edit", id:cur, unlock:ul.dataset.almunlk})) { const x = await run({action:"devs", id:cur}); if (x) { DV = x; draw(); toast("解除了"); } }
        return;
      }
      const kk = t.closest("[data-almkick]");
      if (kk) {
        if (!await modal({icon:"ban", cls:"bad", title:"踢掉這台設備？", text:"這台設備之後打不開這本相簿。", ok:"踢掉"})) return;
        if (await run({action:"edit", id:cur, kick:kk.dataset.almkick})) { const x = await run({action:"devs", id:cur}); if (x) { DV = x; draw(); toast("踢掉了"); } }
        return;
      }
      const b = t.closest("[data-alm]"); if (!b) return;
      const act = b.dataset.alm, a = curA();
      if (act === "list") { view = "list"; return draw(); }
      if (act === "back") { if (view === "talk" || view === "devs" || view === "pend") await run({action:"list"}); view = "one"; return draw(); }
      if (act === "new" || act === "pick") return goDir(act === "pick" ? dir.split("/").slice(0, -1).join("/") : "");
      if (act === "use") { view = "opts"; return draw(); }
      if (act === "make") {
        const nm = v.querySelector('[data-almk="name"]').value.trim(), pw = v.querySelector('[data-almk="pw"]').value;
        if (pw && pw.length < 4) return sayTo(msg, "密碼要 4 個字以上");
        const x = await run({action:"add", dir, name:nm, pw, secs:o.secs, loc:o.loc, dl:o.dl, dev:o.dev, talk:o.talk, shy:o.shy, snap:o.snap, up:o.up, uq:o.uq});
        if (!x) return;
        cur = x.id; view = "one"; tab = "basic"; draw();
        const na = curA(); if (na) share(na);
        return;
      }
      if (!a) return;
      if (act === "copy") return share(a);
      if (act === "photos" || act === "pend") { const x = await run({action:"photos", id:cur}); if (!x) return;
        PK = {...x, photos:x.photos.filter(p => !p.u), pend:x.photos.filter(p => p.u).map(p => ({...p, sel:!!p.pend}))};
        view = act === "pend" && PK.pend.length ? "pend" : "photos"; return draw(); }
      if (act === "pdall") { const all = PK.pend.every(p => p.sel); PK.pend.forEach(p => { p.sel = !all; }); return draw(); }
      if (act === "okup" || act === "noup") {
        const ids = PK.pend.filter(p => p.sel && (act === "noup" || p.pend)).map(p => p.i); if (!ids.length) return;
        if (act === "noup" && !await modal({icon:"trash", cls:"bad", title:`刪掉這 ${ids.length} 個？`, text:"會從雲端硬碟刪掉，救不回來。", ok:"刪掉"})) return;
        if (!await run({action:"edit", id:cur, [act]:ids})) return;
        toast(act === "okup" ? "放上去了" : "刪掉了");
        await run({action:"list"});
        PK.pend = act === "noup" ? PK.pend.filter(p => !ids.includes(p.i)) : PK.pend.map(p => ids.includes(p.i) ? {...p, pend:false, sel:false} : p);
        view = PK.pend.length ? "pend" : "one"; return draw(); }
      if (act === "devs") { const x = await run({action:"devs", id:cur}); if (x) { DV = x; view = "devs"; draw(); } return; }
      if (act === "talk") { const x = await run({action:"talk", id:cur}); if (x) { TK = x; view = "talk"; draw(); } return; }
      if (act === "pkall") { const all = PK.photos.every(p => !p.hid); PK.photos.forEach(p => { p.hid = all; }); return draw(); }
      if (act === "pksave") { if (await run({action:"edit", id:cur, hide:PK.photos.filter(p => p.hid).map(p => p.i)})) { toast("存好了"); view = "one"; draw(); } return; }
      if (act === "pw" || act === "nopw") {
        const pw = act === "pw" ? v.querySelector('[data-almk="pw"]').value : "";
        if (act === "pw" && pw.length < 4) return sayTo(msg, "密碼要 4 個字以上");
        if (await run({action:"edit", id:cur, pw})) { toast(pw ? "密碼換好了，舊的立刻失效" : "拿掉密碼了"); draw(); }
        return;
      }
      if (act === "meta") {
        const nm = v.querySelector('[data-almk="name"]').value.trim(), intro = v.querySelector('[data-almk="intro"]').value.trim();
        if (!nm) return sayTo(msg, "相簿名稱不能留空");
        if (await run({action:"edit", id:cur, name:nm, intro})) { toast("已儲存"); paintHead(); }
        return;
      }
      if (act === "wm" || act === "nowm") {
        const wm = act === "wm" ? v.querySelector('[data-almk="wm"]').value.trim() : "";
        if (act === "wm" && !wm) return sayTo(msg, "先輸入浮水印的字");
        if (await run({action:"edit", id:cur, wm})) { toast(wm ? "浮水印加好了，照片重新做好要一點時間" : "拿掉浮水印了"); draw(); }
        return;
      }
      if (act === "del") {
        if (!await modal({icon:"trash", cls:"bad", title:`收回「${a.name}」？`, text:"連結會立刻打不開，雲端硬碟裡的照片不動。", ok:"收回"})) return;
        if (await run({action:"del", id:cur})) { toast("收回了"); view = "list"; draw(); }
      }
    });
  });
}
/* 擋廣告 DNS（AdGuard Home）：手機的 DNS 設成這台，只開加密的 DoH／DoT */
const abSt = a => a.job ? ["設定中", "act"] : a.err ? ["有狀況", "bad"] : a.on ? [a.pct != null ? `擋掉 ${a.pct}%` : "運作中", "ok"] : ["未開啟", ""];
const abTile = (s, node, name) => {
  if (!s.adblock) return "";
  const a = s.adblock, [bt, bc] = abSt(a);
  return `<button class="tbx" data-key="ab" data-ab="${node}" data-name="${name}">
    <span class="ttop">${IC("dnsf", "")}<span class="trgt">${tBadge(bt, bc)}<span class="tgo nx">${CHEV}</span></span></span>
    <span class="tmeta"><b>AdGuard Home</b><small class="tdesc" data-x>${a.err ? "點進檢查連線與防火牆" : a.on ? "加密 DNS 擋廣告" : "啟用專屬擋廣告 DNS"}</small></span>
    <span class="tfoot">${a.on && a.pct != null ? wave(a.pct) : `<span class="thint">${a.on ? "DoT / DoH 加密連線" : "點進一鍵安裝設定"}</span>`}</span></button>`;
};
/* AdGuard Home 自己的管理頁：跟雲端硬碟一樣先驗證是你，再用一次性登入票進去（不用記它的帳號密碼） */
async function openAgh(node, name){
  const has = await pkCall("/api/passkey-login", {action:"has"}).catch(() => ({}));
  const t = await pinAsk({title: "打開 AdGuard Home", sub: name, icon: "dnsf", pin: !!has.pin, passkey: PK_OK && !!has.has,
    send: c => pkCall("/api/adguard-open", {...c, node: node || ""}, 1)});
  if (!t || !t.ticket || !safeUrl(t.login)) return;
  if (window.open("", "vsagh")) return cloudSubmit(t, "vsagh");
  modal({icon: "noad", cls: "dnsf", title: "AdGuard Home", text: "驗證好了", ok: "打開"}).then(go => { if (go) cloudSubmit(t, "_blank"); });
}
/* QR 碼（位元組模式、M 級，版本 1～10）：回傳模組矩陣；給電腦顯示讓 iPhone 掃 */
function qrMat(text, fm){
  const by = [...new TextEncoder().encode(text)];
  const T = [[26,10,1,16,0,0],[44,16,1,28,0,0],[70,26,1,44,0,0],[100,18,2,32,0,0],[134,24,2,43,0,0],[172,16,4,27,0,0],[196,18,4,31,0,0],[242,22,2,38,2,39],[292,22,3,36,2,37],[346,26,4,43,1,44]];
  let v = 0; for (; v < 10; v++) { const t = T[v], dc = t[2] * t[3] + t[4] * t[5]; if (4 + (v < 9 ? 8 : 16) + 8 * by.length <= dc * 8) break; }
  if (v >= 10) return null;
  const [, ec, n1, d1, n2, d2] = T[v], dc = n1 * d1 + n2 * d2, V = v + 1, N = 17 + 4 * V;
  const bits = []; const put = (x, l) => { for (let i = l - 1; i >= 0; i--) bits.push(x >> i & 1); };
  put(4, 4); put(by.length, V < 10 ? 8 : 16); by.forEach(b => put(b, 8)); put(0, Math.min(4, dc * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let p = 0; data.length < dc; p ^= 1) data.push(p ? 17 : 236);
  const ex = [], lg = []; for (let i = 0, x = 1; i < 255; i++) { ex[i] = x; lg[x] = i; x = x << 1 ^ (x & 128 ? 0x11d : 0); }
  const mul = (a, b) => a && b ? ex[(lg[a] + lg[b]) % 255] : 0;
  let g = [1]; for (let i = 0; i < ec; i++) { const h = g.concat(0); for (let j = 0; j < g.length; j++) h[j + 1] ^= mul(g[j], ex[i]); g = h; }
  const blk = [], ecb = []; let o = 0;
  for (let b = 0; b < n1 + n2; b++) { const L = b < n1 ? d1 : d2, d = data.slice(o, o += L), r = d.concat(Array(ec).fill(0));
    for (let i = 0; i < L; i++) { const c = r[i]; if (c) for (let j = 1; j < g.length; j++) r[i + j] ^= mul(g[j], c); }
    blk.push(d); ecb.push(r.slice(L)); }
  const cw = []; for (let i = 0; i < Math.max(d1, d2); i++) blk.forEach(d => i < d.length && cw.push(d[i]));
  for (let i = 0; i < ec; i++) ecb.forEach(e => cw.push(e[i]));
  const M = Array.from({length:N}, () => Array(N).fill(0)), F = Array.from({length:N}, () => Array(N).fill(0));
  const set = (r, c, x) => { M[r][c] = x ? 1 : 0; F[r][c] = 1; };
  const finder = (r, c) => { for (let i = -1; i < 8; i++) for (let j = -1; j < 8; j++) { const y = r + i, x = c + j; if (y < 0 || x < 0 || y >= N || x >= N) continue;
    set(y, x, i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i == 0 || i == 6 || j == 0 || j == 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4))); } };
  finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
  for (let i = 8; i < N - 8; i++) { set(6, i, i % 2 == 0); set(i, 6, i % 2 == 0); }
  const AP = [[], [18], [22], [26], [30], [34], [22, 38], [24, 42], [26, 46], [28, 50]][v], ap = AP.length ? [6, ...AP] : [];
  ap.forEach(r => ap.forEach(c => { if (r < 9 && (c < 9 || c > N - 9) || r > N - 9 && c < 9) return; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) != 1); }));
  const bch = (x, gp, gl) => { let r = x << gl - 1; const d = l => 31 - Math.clz32(l); while (d(r) >= d(gp)) r ^= gp << d(r) - d(gp); return x << gl - 1 | r; };
  const fmt = m => { const f = bch(m, 0x537, 11) ^ 0x5412;
    for (let i = 0; i < 15; i++) { const b = f >> i & 1;
      if (i < 6) set(i, 8, b); else if (i < 8) set(i + 1, 8, b); else set(N - 15 + i, 8, b);
      if (i < 8) set(8, N - 1 - i, b); else if (i < 9) set(8, 15 - i - 1 + 1, b); else set(8, 15 - i - 1, b); }
    set(N - 8, 8, 1); };
  fmt(0);
  if (V >= 7) { const vb = bch(V, 0x1f25, 13); for (let i = 0; i < 18; i++) { const b = vb >> i & 1; set(Math.floor(i / 3), N - 11 + i % 3, b); set(N - 11 + i % 3, Math.floor(i / 3), b); } }
  const pos = []; for (let c = N - 1, up = 1; c > 0; c -= 2, up ^= 1) { if (c == 6) c--; for (let k = 0; k < N; k++) { const r = up ? N - 1 - k : k; for (let j = 0; j < 2; j++) if (!F[r][c - j]) pos.push([r, c - j]); } }
  const MK = [(r, c) => (r + c) % 2 == 0, r => r % 2 == 0, (r, c) => c % 3 == 0, (r, c) => (r + c) % 3 == 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 == 0,
    (r, c) => r * c % 2 + r * c % 3 == 0, (r, c) => (r * c % 2 + r * c % 3) % 2 == 0, (r, c) => ((r + c) % 2 + r * c % 3) % 2 == 0];
  const draw = m => { pos.forEach(([r, c], i) => { M[r][c] = ((cw[i >> 3] >> (7 - (i & 7)) & 1) ^ (MK[m](r, c) ? 1 : 0)); }); fmt(m); };
  const score = () => { let s = 0, dk = 0;
    for (let a = 0; a < 2; a++) for (let i = 0; i < N; i++) { let run = 1; const at = j => a ? M[j][i] : M[i][j]; let line = "";
      for (let j = 0; j < N; j++) { line += at(j); if (j && at(j) == at(j - 1)) { run++; if (run == 5) s += 3; else if (run > 5) s++; } else run = 1; }
      s += 40 * ((line.match(/(?=1011101(0000))|(?=(0000)1011101)/g) || []).length); }
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) { const x = M[r][c]; if (x == M[r][c + 1] && x == M[r + 1][c] && x == M[r + 1][c + 1]) s += 3; }
    M.forEach(r => r.forEach(x => dk += x)); return s + 10 * Math.floor(Math.abs(dk * 20 / (N * N) - 10)); };
  let best = fm == null ? 0 : fm, bs = 1e9;
  if (fm == null) for (let m = 0; m < 8; m++) { draw(m); const s = score(); if (s < bs) { bs = s; best = m; } }
  draw(best);
  return M;
}
const qrSvg = t => { const M = qrMat(t); if (!M) return ""; const n = M.length; let d = "";
  M.forEach((r, y) => r.forEach((x, c) => { if (x) d += `M${c + 4} ${y + 4}h1v1h-1z`; }));
  return `<svg class="qrc" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" role="img" aria-label="QR 碼"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`; };
function abModal(node, name){
  const q = node ? `?node=${encodeURIComponent(node)}` : "", ck = "ab:" + (node || "");
  const ios = /iPhone|iPad/.test(navigator.userAgent) || navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
  let D = TOOLCACHE[ck] || null, busy = false, os = ios || /Macintosh/.test(navigator.userAgent) ? "ios" : "and", tm = 0, last = "", lastAlert = "", mt = "stat", lt = "top", qrk = "";
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog tdlg ntd abd"><div class="thead">${IC("dnsf", "")}<div class="thead-t"><h3>AdGuard Home</h3><p>${esc(name)}</p></div><span class="tbadge abbdg"></span></div>
    <div class="form"><div class="ntb"><div class="abjob"><span class="spin"></span><span>讀取中…</span></div></div><div class="msg"></div></div></div>`;
  const body = v.querySelector(".ntb"), msg = v.querySelector(".msg"), bdg = v.querySelector(".abbdg");
  const num = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "K" : String(n);
  const alRow = (d, n, t) => { const ok = (D.allow || []).includes(d);
    return `<div${ok ? ' class="alok"' : ""}><span>${esc(d)}</span>${n == null ? "" : `<b>${num(n)}</b>`}${t ? `<small>${t}</small>` : ""}<button type="button" class="ubtn sm ghost" data-abal="${esc(d)}" data-on="${ok ? 0 : 1}">${ok ? "恢復擋" : "放行"}</button></div>`; };
  const abls = (x, k) => {
    if (k === "allow") {
      const al = D.allow || [];
      return `<div class="abadd"><input class="field" data-abdom type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="手動輸入要放行的網域（例如 shop.example.tw）"><button type="button" class="ubtn sm" data-abadd>放行</button></div>
        ${al.length ? `<div class="abtop">${al.map(d => alRow(d)).join("")}</div>` : `<div class="ntst">${I("info")}<span>目前沒有手動放行的網域</span></div>`}`;
    }
    const r = k === "top" ? (x.top || []).map(([d, n]) => alRow(d, n)) : (x.recent || []).map(([d, t]) => alRow(d, null, ago(t)));
    return r.length ? `<div class="abtop">${r.join("")}</div>` : `<div class="ntst">${I("info")}<span>目前沒有紀錄</span></div>`;
  };
  const barsHTML = x => {
    const hrs = x.hrs || [], mx = Math.max(1, ...(hrs.length ? hrs : [0]));
    return hrs.length ? `<div class="tcardh"><span>最近 24 小時攔截</span><small class="num">最高 ${num(mx)}／時</small></div>
      <div class="abh">${hrs.map((n, i) => { const back = hrs.length - 1 - i; const lbl = back ? `${back} 小時前` : "這一小時";
        return `<i style="--h:${Math.max(5, Math.round(n * 100 / mx))}%" title="${lbl}：攔截 ${n} 次"></i>`; }).join("")}</div>
      <div class="abhaxis"><span>24 小時前</span><span>12 小時前</span><span>現在</span></div>` : "";
  };
  const stats = x => {
    if (!x) return `<div class="tcard abjob"><span class="spin"></span><span>統計讀取中…</span></div>`;
    const aln = (D.allow || []).length, bh = barsHTML(x);
    return `<div class="abn"><div><b class="num">${num(x.q)}</b><small>總查詢</small></div><div><b class="num">${num(x.b)}</b><small>已擋掉</small></div><div><b class="num">${x.pct}%</b><small>攔截率</small></div></div>
      ${bh ? `<div class="tcard abhrbox">${bh}</div>` : ""}
      <div class="seg abtab" data-slide><button type="button" class="${lt === "top" ? "on" : ""}" data-ablt="top">最常擋的</button><button type="button" class="${lt === "new" ? "on" : ""}" data-ablt="new">最近擋的</button><button type="button" class="${lt === "allow" ? "on" : ""}" data-ablt="allow">已放行${aln ? ` (${aln})` : ""}</button></div>
      <div class="abls swgrid">${["top", "new", "allow"].map(k => `<div class="swpane${lt === k ? "" : " off"}" data-sw="${k}"${lt === k ? "" : ' aria-hidden="true"'}>${abls(x, k)}</div>`).join("")}</div>`;
  };
  const steps = k => k === "ios" ? (ios
    ? `<button type="button" class="ubtn" data-abp>${I("dl")}安裝加密 DNS 描述檔</button><ol class="ntsteps"><li><span>點「允許」下載描述檔</span></li><li><span>打開「設定」→「已下載描述檔」→ 安裝</span></li></ol>`
    : qrk ? `<div class="abqr">${qrSvg(location.origin + "/dns.mobileconfig?k=" + encodeURIComponent(qrk))}</div><ol class="ntsteps"><li><span>用 iPhone 相機掃描上方 QR 碼並允許下載</span></li><li><span>打開「設定」→「已下載描述檔」→ 安裝</span></li></ol>`
    : `<button type="button" class="ubtn" data-abqr>${I("qr")}產生 iPhone 掃描用 QR 碼</button><ol class="ntsteps"><li><span>點擊按鈕產生一次性描述檔 QR 碼</span></li><li><span>用 iPhone 相機掃描後到「設定」安裝</span></li></ol>`)
    : `<div class="codebox ntr"><span class="ntk">主機</span><code>${esc(D.dot)}</code><button type="button" class="ubtn sm ghost copybtn" data-abcp>${I("copy")}複製</button></div>
      <ol class="ntsteps"><li><span>打開「設定」→「網路和網際網路」→「私人 DNS」</span></li><li><span>選擇「私人 DNS 供應商主機名稱」並貼上主機名稱</span></li></ol>`;
  const connHTML = () => `${I(D.down || D.pub || D.ext ? "warn" : "ok")}${D.down || D.pub || D.ext ? "連線受阻" : D.ext === "" ? `TCP ${D.port} 正常` : `TCP ${D.port}`}`;
  const setupTab = () => `<div class="tcard">
      <div class="tcardh"><span>連線裝置設定</span><span class="abconn ${D.down || D.pub || D.ext ? "bad" : D.ext === "" ? "ok" : ""}">${connHTML()}</span></div>
      <div class="seg abos" data-slide><button type="button" class="${os === "ios" ? "on" : ""}" data-abos="ios">iPhone / iPad</button><button type="button" class="${os === "and" ? "on" : ""}" data-abos="and">Android</button></div>
      <div class="abst swgrid">${["ios", "and"].map(k => `<div class="swpane${os === k ? "" : " off"}" data-sw="${k}"${os === k ? "" : ' aria-hidden="true"'}>${steps(k)}</div>`).join("")}</div>
      ${D.ext === "" || D.ext ? "" : `<div class="ntst">${I("info")}<span>若手機連不上，請到主機商防火牆打開 TCP ${D.port}</span></div>`}
    </div>`;
  const alertOf = () => D.down ? `<div class="bkerr">${I("warn")}<span>服務停了，正在自動重新啟動</span></div>`
    : D.pub ? `<div class="bkerr">${I("warn")}<span>手機連不上：${esc(D.pub)}</span></div>`
    : D.ext ? `<div class="bkerr">${I("warn")}<span>從「${esc(D.ext_by)}」連不到：請到主機商防火牆打開 TCP ${D.port}</span></div>` : "";
  const view = () => {
    const err = D.on && (D.down || D.pub || D.ext);
    bdg.textContent = D.job ? "設定中" : err ? "有狀況" : D.on ? "運作中" : "未開啟";
    bdg.className = "tbadge abbdg" + (D.job ? " act" : err ? " bad" : D.on ? " ok" : "");
    if (D.job) return `<div class="tcard abjob"><span class="spin"></span><span>${esc(D.job)}…</span></div>`;
    if (!D.on) return `<div class="tcard ntonb"><p class="ntx">幫手機直接攔截廣告、惡意與追蹤網址，只開加密 DNS（DoT／DoH），不對外開一般 DNS。</p>
      <ul class="ntpts"><li>${I("shield")}<span>自動套用中文與惡意網址過濾清單</span></li><li>${I("lock")}<span>國際與大陸網域分流，不繞路</span></li><li>${I("devices")}<span>支援 iPhone 描述檔與 Android 私人 DNS</span></li></ul></div>
      ${D.cert ? "" : `<div class="ntst bad">${I("warn")}<span>這台還沒有網域的 TLS 憑證，無法開啟</span></div>`}
      <button type="button" class="ubtn" data-ab="on"${D.cert ? "" : " disabled"}>開啟 AdGuard Home</button>`;
    return `${alertOf()}
      <div class="seg abmain" data-slide><button type="button" class="${mt === "stat" ? "on" : ""}" data-abmt="stat">總覽與紀錄</button><button type="button" class="${mt === "setup" ? "on" : ""}" data-abmt="setup">手機設定</button></div>
      <div class="abbody swgrid">
        <div class="swpane${mt === "stat" ? "" : " off"}" data-sw="stat"${mt === "stat" ? "" : ' aria-hidden="true"'}>${stats(D.stats)}</div>
        <div class="swpane${mt === "setup" ? "" : " off"}" data-sw="setup"${mt === "setup" ? "" : ' aria-hidden="true"'}>${setupTab()}</div>
      </div>
      <div class="tfootbar"><button type="button" class="ubtn sm ghost" data-abweb>打開管理頁${EXT}</button><button type="button" class="ubtn sm ghost bad ntwipe" data-ab="off">關閉服務</button></div>`;
  };
  const draw = init => {
    const al = alertOf(), h = view();
    if (h === last && !init) return;
    last = h;
    if (init) { lastAlert = al; body.innerHTML = h; return; }
    // 運作中局部更新：保留所有 .swgrid 分頁結構與當前滑動狀態，只更新變動的數字與清單，零重繪零閃爍
    if (D.on && !D.job && body.querySelector(".abmain") && al === lastAlert) {
      const conn = body.querySelector(".abconn");
      if (conn) { conn.className = "abconn " + (D.down || D.pub || D.ext ? "bad" : D.ext === "" ? "ok" : ""); conn.innerHTML = connHTML(); }
      const stp = body.querySelector('.abbody > [data-sw="stat"]');
      if (stp && D.stats) {
        if (!stp.querySelector(".abls")) { stp.innerHTML = stats(D.stats); return; }
        const abn = stp.querySelector(".abn"), nh = `<div><b class="num">${num(D.stats.q)}</b><small>總查詢</small></div><div><b class="num">${num(D.stats.b)}</b><small>已擋掉</small></div><div><b class="num">${D.stats.pct}%</b><small>攔截率</small></div>`;
        if (abn && abn.innerHTML !== nh) abn.innerHTML = nh;
        const hb = stp.querySelector(".abhrbox"), bh = barsHTML(D.stats);
        if (hb && bh && hb.innerHTML !== bh) hb.innerHTML = bh;
        const aln = (D.allow || []).length, alb = stp.querySelector('[data-ablt="allow"]');
        if (alb) txt(alb, `已放行${aln ? ` (${aln})` : ""}`);
        ["top", "new", "allow"].forEach(k => {
          const p = stp.querySelector(`.abls > [data-sw="${k}"]`);
          if (!p || (k === "allow" && document.activeElement === p.querySelector("[data-abdom]"))) return;
          const lh = abls(D.stats, k);
          if (p.innerHTML !== lh) p.innerHTML = lh;
        });
      }
      return;
    }
    lastAlert = al;
    swapHTML(body, h);
  };
  if (D) draw(true);
  $("#layer").appendChild(v);
  const call = async b => {
    const r = await api("/api/adblock" + q, {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(b)});
    const x = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error("這台還沒更新到新版，先更新再試");
    if (!r.ok || x.ok === false) throw new Error(x.message || x.error || "失敗了，請再試一次");
    return x;
  };
  const run = async b => {
    if (busy) return null; busy = true;
    try { const x = await call(b); D = x; TOOLCACHE[ck] = x; sayTo(msg, x.err || ""); if (!v._d) draw(); return x; }
    catch (e) { sayTo(msg, e.message); return null; }
    finally { busy = false; clearTimeout(tm); if (D && !v._d) tm = setTimeout(() => run({action:"info"}), D.job ? 1500 : 30000); }
  };
  const addDom = async () => {
    const inp = v.querySelector("[data-abdom]"); if (!inp) return;
    const dom = inp.value.trim(); if (!dom) return inp.focus();
    const x = await run({action:"allow", domain:dom});
    if (x) {
      if (x.message) toast(x.message);
      const p = v.querySelector('.abls > [data-sw="allow"]');
      if (p && D && D.stats) p.innerHTML = abls(D.stats, "allow");
    }
  };
  run({action:"info"});
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; clearTimeout(tm); v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-abdom]")) { e.preventDefault(); addDom(); } });
    const LTO = ["top", "new", "allow"];
    v.addEventListener("click", async e => {
      if (e.target === v) return done();
      const t = e.target;
      const m = t.closest("[data-abmt]");
      if (m) { if (m.dataset.abmt === mt) return; const sd = m.dataset.abmt === "setup" ? 1 : -1; mt = m.dataset.abmt;
        slideSel(() => v.querySelectorAll("[data-abmt]").forEach(x => x.classList.toggle("on", x === m)));
        slidePane(v.querySelector(".abbody"), mt, sd); return; }
      const o = t.closest("[data-abos]");
      if (o) { if (o.dataset.abos === os) return; const sd = o.dataset.abos === "and" ? 1 : -1; os = o.dataset.abos;
        slideSel(() => v.querySelectorAll("[data-abos]").forEach(x => x.classList.toggle("on", x === o)));
        slidePane(v.querySelector(".abst"), os, sd); return; }
      if (t.closest("[data-abcp]")) {
        try { await navigator.clipboard.writeText(D.dot); toast("已複製主機名稱"); }
        catch (_) { const r = document.createRange(); r.selectNodeContents(v.querySelector('.abst [data-sw="and"] code')); getSelection().removeAllRanges(); getSelection().addRange(r); }
        return;
      }
      if (t.closest("[data-abweb]")) return openAgh(node, name);
      if (t.closest("[data-abadd]")) return addDom();
      const lb = t.closest("[data-ablt]");
      if (lb) { if (lb.dataset.ablt === lt) return; const sd = Math.sign(LTO.indexOf(lb.dataset.ablt) - LTO.indexOf(lt)) || 1; lt = lb.dataset.ablt;
        slideSel(() => v.querySelectorAll("[data-ablt]").forEach(x => x.classList.toggle("on", x === lb)));
        slidePane(v.querySelector(".abls"), lt, sd); return; }
      const pq = t.closest("[data-abp],[data-abqr]");
      if (pq) {
        try {
          const r = await api("/api/adblock-profile", {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify({url:D.doh, name})});
          const x = await r.json().catch(() => ({}));
          if (!r.ok || !x.k) throw new Error(x.message || "失敗了，請再試一次");
          if (pq.dataset.abqr == null) { location.href = "/dns.mobileconfig?k=" + encodeURIComponent(x.k); return; }
          qrk = x.k; const ip = v.querySelector('.abst > [data-sw="ios"]'); if (ip) swapHTML(ip, steps("ios"));
          setTimeout(() => { if (qrk === x.k) { qrk = ""; const ip2 = !v._d && v.querySelector('.abst > [data-sw="ios"]'); if (ip2) swapHTML(ip2, steps("ios")); } }, 540000);
        } catch (x) { sayTo(msg, x.message); }
        return;
      }
      const al = t.closest("[data-abal]");
      if (al) { const x = await run({action: al.dataset.on === "1" ? "allow" : "unallow", domain: al.dataset.abal}); if (x && x.message) toast(x.message); return; }
      const b = t.closest("[data-ab]"); if (!b) return;
      const act = b.dataset.ab;
      if (act === "off" && !await modal({icon:"noad", cls:"warn", title:"關閉 AdGuard Home？", text:"設好的手機會查不到網址，要先改回來。", ok:"關閉"})) return;
      const x = await run({action: act});
      if (x && act === "off") toast("已關閉");
    });
  });
}
/* 系統更新（作業系統的套件）：跟哨兵、雲端硬碟的版本放在一起 */
const sysRow = s => s.update && s.update.supported ? `<div class="selfrow" data-key="sys"><div class="cl2 first"><span class="ico sys">${I("layers")}</span><span>系統<small data-x>${updateInfo(s) || "還沒檢查"}</small></span>${updateBtn(s)}</div></div>` : "";
/* 要顯示的內容、畫面更新頻率：收在一個視窗裡（手機從下面滑上來） */
function showsModal(){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog showsd"><h3>要顯示的內容</h3>
    <div class="form"><div class="group">${SHOWS.map(([ic, l, k, sm]) => `<label class="li">${IC(ic, "")}<span class="lab">${l}${sm ? `<small>${sm}</small>` : ""}</span>${tog("show." + k, l)}</label>`).join("")}</div>
      <div class="group"><div class="li col"><span class="lab">畫面更新頻率</span>${seg("refresh", [[3, "3 秒"], [5, "5 秒"], [10, "10 秒"], [30, "30 秒"]])}</div></div></div>
    </div>`;
  $("#layer").appendChild(v);
  const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => v.remove(), 360); };
  v._esc = done;
  v.addEventListener("change", e => { const t = e.target; if (!t.dataset.pref) return; setP(t.dataset.pref, t.checked); setTimeout(() => changed(t.dataset.pref), 180); });
  v.addEventListener("click", e => {
    if (e.target === v || e.target.closest("[data-r]")) return done();
    const b = e.target.closest("[data-val]"); if (!b) return;
    setP(b.dataset.pref, +b.dataset.val); slideSel(() => b.parentNode.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b))); changed(b.dataset.pref);
  });
}

/* ═════════ 只更新有變動的地方 ═════════ */
/* 曲線變形：兩條路徑的數字一一對應，每一格畫面算一次中間值（iPhone 也能動） */
const NUM = /-?\d+(?:\.\d+)?/g;
/* 不在畫面上的曲線就不做變形動畫，直接換成新的（手機上兩台主機的曲線常常有一半在畫面外） */
const SEEN = new WeakMap();
const seenIO = window.IntersectionObserver ? new IntersectionObserver(es => es.forEach(e => SEEN.set(e.target, e.isIntersecting))) : null;
/* 主機整頁打開時，後面那一頁看不到：不用動畫，直接換成新的值 */
function onScreen(el){
  const svg = el.ownerSVGElement || el;
  if (!seenIO) return true;
  if (!SEEN.has(svg)) { SEEN.set(svg, true); seenIO.observe(svg); }
  return SEEN.get(svg);
}
function morphPath(el, from, to){
  cancelAnimationFrame(el._praf);
  if (!onScreen(el)) { el._pcur = null; return false; }
  const cur = el._pcur || from;                 // 上一次還沒變完的話，從目前的樣子接著變
  const a = cur.match(NUM), parts = to.split(NUM), b = to.match(NUM);
  if (!canAnim() || !a || !b || a.length !== b.length) { el._pcur = null; return false; }
  const A = a.map(Number), B = b.map(Number), dur = T.slow;
  let t0 = null;
  const step = now => {
    if (t0 === null) t0 = now;
    const k = scrolling() ? 1 : Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);   // 開始滑動：直接變到最後的樣子，不跟捲動搶時間
    let d = parts[0];
    for (let i = 0; i < B.length; i++) d += (A[i] + (B[i] - A[i]) * e).toFixed(1) + parts[i + 1];
    el.setAttribute("d", d); el._pcur = d;
    if (k < 1) el._praf = requestAnimationFrame(step); else { el.setAttribute("d", to); el._pcur = null; }
  };
  el._praf = requestAnimationFrame(step);
  return true;
}
/* 曲線往左滑：直接換成新的形狀，再從「舊的位置和高度比例」移回來（只動 transform，不用每格重算路徑） */
function slidePath(el, tf, to){
  cancelAnimationFrame(el._praf); el._pcur = null;
  if (!onScreen(el) || !canAnim()) return false;
  const [a, c, b, e] = tf.split(",").map(Number);
  if (![a, c, b, e].every(isFinite) || a <= 0 || c <= 0) return false;
  let m = new DOMMatrix([a, 0, 0, c, b, e]);
  if (el._slide && el._slide.playState === "running") { m = new DOMMatrix(getComputedStyle(el).transform).multiply(m); el._slide.cancel(); }   // 上一次還沒滑完：從目前的位置接著滑
  el.setAttribute("d", to);
  if (m.isIdentity) return true;
  el._slide = el.animate([{transform: m.toString()}, {transform: "none"}], {duration: T.slow, easing: EASE});
  return true;
}
function tween(el, from, to, d){
  cancelAnimationFrame(el._raf); (el._tws || []).forEach(clearTimeout); el._tws = [];
  if (!isFinite(from) || !isFinite(to) || !canAnim() || scrolling()) { el.textContent = (+to).toFixed(d); return; }
  let t0 = null; const dur = T.slow, q = Math.pow(10, d), a = Math.round(from * q), n = Math.abs(Math.round(to * q) - a);
  if (!n) { const v = (+to).toFixed(d); if (el.textContent !== v) el.textContent = v; return; }
  if (n <= 24) {
    // 數字只變幾下（平常都是這樣）：先算好每一下在什麼時候換，用計時器換就好，不用每一格畫面都跑、都重新排版
    const dir = Math.sign(to - from);
    for (let j = 1; j <= n; j++) {
      const v = a + dir * j, e = Math.min(1, Math.max(0, ((v - dir * .5) / q - from) / (to - from))), k = 1 - Math.cbrt(1 - e);   // 跟下面同一條曲線：越過兩個數字中間的那一刻
      el._tws.push(setTimeout(() => { el.textContent = j === n ? (+to).toFixed(d) : (v / q).toFixed(d); }, k * dur));
    }
    return;
  }
  const stepf = now => {
    if (t0 === null) t0 = now;                                   // 用第一格畫面當起點，時間不會倒退
    const k = scrolling() ? 1 : Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
    const v = (k < 1 ? from + (to - from) * e : +to).toFixed(d);
    if (el.textContent !== v) el.textContent = v;               // 數字真的變了才寫（整數只變兩三次；每格都寫會逼整頁重新排版）
    if (k < 1) el._raf = requestAnimationFrame(stepf);
  };
  el._raf = requestAnimationFrame(stepf);
}
/* 共用動畫規則（Google Material 3 Expressive 物理彈簧與流暢節奏，跟 CSS 的 --t-*、--sp* 一致） */
const T = {fast:180, mid:320, slow:480, long:720, spf:290, sp:420, sps:580};
/* 文字大小是用 zoom 放大縮小的：量到的位置是螢幕上的，要除回去才能拿來定位 */
const ZM = () => parseFloat(getComputedStyle(document.body).zoom) || 1;
const EASE = "cubic-bezier(.2,0,0,1)", DEC = "cubic-bezier(.05,.7,.1,1)", EXIT = "cubic-bezier(.3,0,.8,.15)", LIN = CSS.supports("transition-timing-function", "linear(0,1)");
/* 物理彈簧（Material 3 Expressive 勁度與阻尼精算，滑順自然落點）：時間用 T.spf／T.sp／T.sps */
const SPRING_F = LIN ? "linear(0,.015 2.4%,.0848 6%,.2136 10.4%,.3818 15.4%,.5611 20.8%,.7257 26.6%,.8582 32.8%,.9514 39.2%,1.0072 46%,1.0329 53%,1.0383 60.3%,1.0325 67.8%,1.0226 75.6%,1.013 83.5%,1.0057 91.7%,1)" : "cubic-bezier(.34,1.25,.64,1)",
      SPRING = LIN ? "linear(0,.0169 2.4%,.0936 6%,.2299 10.4%,.4006 15.4%,.5751 20.8%,.729 26.6%,.8486 32.8%,.931 39.2%,.9806 46%,1.0055 53%,1.0144 60.3%,1.0145 67.8%,1.0111 75.6%,1.007 83.5%,1.0037 91.7%,1)" : "cubic-bezier(.25,1.08,.55,1)";
const RMQ = matchMedia("(prefers-reduced-motion: reduce)"), canAnim = () => PREF.motion && !RMQ.matches;   // 同一個查詢留著用（每次新建很慢，動畫前都會問）
/* 讓元素平順地離開：先淡出、收起高度，再移除 */
const BLOCK = ".alert,.alerts,.ev,.day,.calm,.empty,.foot,.offline,.fcs,.cc,.grp,.lbl,.group,.tiles,.mrows,.cfoot";
const TILE = ".hcard,.hp,.tile,.chip,.fc,.li,.addhost";
function flipSiblings(parent, change){
  const z = ZM(), kids = [...parent.children].filter(c => !c._leaving), r0 = kids.map(c => c.getBoundingClientRect());
  change();
  kids.forEach((c, i) => { if (!c.isConnected) return; const r = c.getBoundingClientRect(), dx = (r0[i].left - r.left) / z, dy = (r0[i].top - r.top) / z;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) c.animate([{transform:`translate(${dx}px,${dy}px)`}, {transform:"none"}], {duration:T.sp, easing:SPRING, id:"ui"}); });
}
const gapOf = el => parseFloat(getComputedStyle(el).rowGap) || 0;
/* 前後有沒有「真正留著」的鄰居，決定要收哪一邊的間距 */
function gapSide(n){
  // 依實際排列（包含正在離開的）決定收哪一邊的間距：同時有進有出時，總間距才會剛好對上，不會跳
  return n.previousElementSibling ? "marginTop" : n.nextElementSibling ? "marginBottom" : null;
}
/* 消失：先淡出，再把空間（含間距）收起來 */
function leaveBlock(n){
  const h = n.offsetHeight, cs = getComputedStyle(n), side = gapSide(n), g = side ? gapOf(n.parentElement) : 0;
  const box = {paddingTop:cs.paddingTop, paddingBottom:cs.paddingBottom, marginTop:cs.marginTop, marginBottom:cs.marginBottom};
  const zero = {paddingTop:"0px", paddingBottom:"0px", marginTop:"0px", marginBottom:"0px"};
  if (side) { box[side] = (parseFloat(box[side]) || 0) + "px"; zero[side] = -g + "px"; }  // 連同和鄰居之間的間距一起收
  n.style.overflow = "hidden"; n.style.pointerEvents = "none"; n.style.animation = "none";
  const dur = Math.min(720, 380 + h * .45);
  n.animate([
    {height:h+"px", opacity:1, ...box, easing:EXIT},
    {height:h+"px", opacity:0, ...box, offset:.35, easing:EASE},
    {height:"0px", opacity:0, ...zero}],
    {duration:dur, easing:"linear", fill:"forwards", id:"ui"}).onfinish = () => n.remove();
}
/* 出現：先把空間撐開，再淡入 */
function enterBlock(el, delay){
  const h = el.offsetHeight, cs = getComputedStyle(el), side = gapSide(el), g = side ? gapOf(el.parentElement) : 0;
  const box = {paddingTop:cs.paddingTop, paddingBottom:cs.paddingBottom, marginTop:cs.marginTop, marginBottom:cs.marginBottom};
  const zero = {paddingTop:"0px", paddingBottom:"0px", marginTop:"0px", marginBottom:"0px"};
  if (side) zero[side] = -g + "px";
  el.style.overflow = "hidden";
  el.getAnimations().forEach(x => { if (x.animationName) x.finish(); });   // 原本的進場動畫直接跳到結尾，之後也不會再重播
  const dur = Math.min(820, 460 + h * .45);
  el.animate([
    {height:"0px", opacity:0, ...zero, easing:EASE},
    {height:h+"px", opacity:0, ...box, offset:.5, easing:EASE},
    {height:h+"px", opacity:1, ...box}],
    {duration:dur, delay, easing:"linear", fill:"backwards", id:"ui"}).onfinish = () => { el.style.overflow = ""; };
}
function leave(n){
  if (n.nodeType !== 1 || !canAnim() || !n.isConnected) return n.remove();
  if (n._leaving) return;
  if (n.matches(TILE)) {
    n._leaving = 1; n.style.pointerEvents = "none";
    n.animate([{opacity:1, transform:"none"}, {opacity:0, transform:"scale(.94)"}], {duration:T.fast, easing:EXIT, id:"ui"})
      .onfinish = () => { const par = n.parentElement; par ? flipSiblings(par, () => n.remove()) : n.remove(); };
    return;
  }
  if (!n.matches(BLOCK)) return n.remove();
  n._leaving = 1;
  leaveBlock(n);
}
/* 按鈕內容換掉時，寬度平滑變化 */
function flipWidth(el, change){
  const w0 = el.offsetWidth; change(); const w1 = el.offsetWidth;
  if (canAnim() && Math.abs(w1 - w0) > 1) el.animate([{width:w0+"px"}, {width:w1+"px"}], {duration:T.spf, easing:SPRING_F});
}
/* 拿出來又放回去的元素：瀏覽器會把裡面的進場動畫從頭重播（卡片會突然不見），全部停在結尾 */
const still = (el, keep) => el.getAnimations({subtree:true}).forEach(n => { if (n === keep) return; if (!n.animationName) n.cancel(); else if (isFinite(n.effect.getComputedTiming().endTime)) n.finish(); });
/* 尋找不包住其他毛玻璃的「最底層動畫目標」：
   W3C 規範裡，父層只要 opacity < 1 或 clip-path 就會建立新的 Backdrop Root，導致裡面的毛玻璃卡片在動畫期間先變不透明、動畫結束才突然變透明；
   直接對毛玻璃卡片本身與一般文字區塊做淡入淡出，就能讓毛玻璃全程維持真實透光不閃爍 */
const GLASS_SEL = ".hcard,.hbanner,.sumc,.htab,.ltab,.cc,.tile,.tbx,.dhome>.evs,.dhome>.tgh,.dash.d .sbody .group,.dash.d .v-tools .group>.li,.dash.m .evs>.ev,.dash.m .group>.li,.dash.m .selfrow,.dash.m .selfsum,.dash.m .selfwait,.calm,.foot,.dseg,.fchips,.hpick,.icbtn,.fc";
function animTargets(root){
  const out = [];
  const walk = el => {
    if (!el || el.nodeType !== 1) return;
    if (el.matches(GLASS_SEL) || !el.querySelector(GLASS_SEL)) out.push(el);
    else for (const c of el.children) walk(c);
  };
  walk(root);
  return out;
}
/* 點擊立即換內容，只有跟手滑動時才保留離場頁。 */
let SWIPEX = 0, TABQUIET = false;
function through(a, b){
  const par = a.parentElement;
  par.querySelectorAll(":scope>.view").forEach(v => { if (v._leaving) v.remove(); });
  b.classList.add("no-intro");
  if (TABQUIET || !canAnim()) return a.replaceWith(b);
  const slide = !DESK.matches && TABDIR && SWIPEX;
  if (!slide) {
    a.replaceWith(b);
    animTargets(b).forEach(el => el.animate([{opacity:.68, transform:"translateY(4px)"}, {opacity:1, transform:"none"}], {duration:T.fast, easing:DEC, id:"ui"}));
    return;
  }
  const z = ZM(), curX = SWIPEX;
  const r = a.getBoundingClientRect(), R = par.getBoundingClientRect(), sy = Math.max(0, scrollY) / z;
  const top = (r.top - R.top) / z - par.clientTop, h = Math.max(0, Math.min(r.height / z, sy + innerHeight / z - top));
  a.replaceWith(b);
  a._leaving = 1;
  a.inert = true;
  Object.assign(a.style, {position:"absolute", left:(r.left - R.left) / z - par.clientLeft + "px", top:(top - sy) + "px", width:r.width / z + "px",
    height:h + "px", overflow:"hidden", margin:"0", pointerEvents:"none", animation:"none", clipPath:sy > 0 ? `inset(${sy}px 0 0 0)` : ""});
  b.after(a); still(a);
  if (sy > 0) scrollTo(0, 0);
  const stride = r.width / z + 32, dur = Math.round(T.mid * Math.max(.55, 1 - Math.min(1, Math.abs(curX) / stride)));
  const opt = {duration:dur, easing:DEC, id:"ui"};
  const exit = a.animate([{transform:`translateX(${curX}px)`}, {transform:`translateX(${-TABDIR * stride}px)`}], {...opt, fill:"forwards"});
  exit.onfinish = exit.oncancel = () => a.remove();
  b.animate([{transform:`translateX(${curX + TABDIR * stride}px)`}, {transform:"none"}], opt);
}

function swapIn(a, b){
  b.classList.add("no-intro");
  a.replaceWith(b);
  if (TABQUIET || !canAnim()) return;
  const returning = b.dataset.key === "dh:all";
  const y = returning ? -4 : 4;
  animTargets(b).forEach(el => el.animate([{opacity:.68, transform:`translateY(${y}px)`}, {opacity:1, transform:"none"}], {duration:T.fast, easing:DEC, id:"ui"}));
}
function morph(a, b){
  if (a.nodeType === 1 && b.nodeType === 1 && a.matches("main.view") && b.matches("main.view") && a.getAttribute("data-key") !== b.getAttribute("data-key")) return through(a, b);
  if (a.nodeType===1 && b.nodeType===1 && (a.hasAttribute("data-sw") && b.hasAttribute("data-sw") && a.getAttribute("data-key") !== b.getAttribute("data-key")
      || a.nodeName !== b.nodeName && (a.classList.contains("wait") || b.classList.contains("wait")))) return swapIn(a, b);   // 曲線圖「讀取中」↔ 圖
  if (a.nodeType!==b.nodeType || a.nodeName!==b.nodeName ||
      (a.nodeType===1 && (a.getAttribute("data-key")||"")!==(b.getAttribute("data-key")||""))) { a.replaceWith(b); return; }
  if (a.nodeType===3 || a.nodeType===8){ if (a.nodeValue!==b.nodeValue) a.nodeValue=b.nodeValue; return; }
  if (a.nodeType!==1) return;
  if (!a._xing && a.isEqualNode(b)) return;                  // 整塊都沒變（圖示、標題…）：直接跳過，不用一個一個比
  if (a.classList.contains("ubtn") && a.innerHTML !== b.innerHTML) {
    return flipWidth(a, () => { patch(a, b); a.animate([{opacity:.35}, {opacity:1}], {duration:T.mid, easing:EASE}); });
  }
  if (a.hasAttribute("data-xw") && a.innerHTML !== b.innerHTML) {     // 小膠囊換內容（IPv6 狀態 ↔ 位址）：寬度平滑伸縮，新字淡入
    if (!canAnim() || !a.isConnected) return patch(a, b);
    // 位置一次排好（可能換到下一行），膠囊和旁邊的都從原位平滑移過去，整排高度也跟著變
    const par = a.parentElement, h0 = par.offsetHeight, w0 = a.offsetWidth, o = {duration:T.mid, easing:EASE, id:"ui"};
    a.getAnimations().forEach(x => x.cancel());
    flipSiblings(par, () => patch(a, b));
    const w1 = a.offsetWidth, h1 = par.offsetHeight, r = getComputedStyle(a).borderRadius;
    if (Math.abs(h1 - h0) > 1) par.animate([{height:h0 + "px"}, {height:h1 + "px"}], o);
    if (w1 > w0 + 1) a.animate([{clipPath:`inset(0 ${w1 - w0}px 0 0 round ${r})`}, {clipPath:`inset(0 0 0 0 round ${r})`}], o);   // 變長：從原本的寬度展開
    else if (w1 < w0 - 1) a.animate([{opacity:.4, scale:".94"}, {opacity:1, scale:"1"}], o);
    [...a.children].forEach(c => c.animate([{opacity:0, filter:"blur(4px)"}, {opacity:1, filter:"none"}], o));
    return;
  }
  if (a.hasAttribute("data-x") && a.innerHTML !== b.innerHTML) {
    if (!canAnim() || !a.isConnected) return patch(a, b);
    a._xb = b;                                    // 先淡出舊字、再換上新字淡入；高度跟著平順變化
    if (a._xing) return;
    a._xing = true;
    a.animate([{opacity:1}, {opacity:0}], {duration:T.fast, easing:EXIT, fill:"forwards", id:"ui"}).finished.catch(()=>{}).then(() => {
      const h0 = a.offsetHeight; patch(a, a._xb); const h1 = a.offsetHeight; a._xing = false;
      a.getAnimations().forEach(x => x.cancel());
      a.animate([{opacity:0, transform:"translateY(3px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE, id:"ui"});
      if (Math.abs(h1 - h0) > 1) a.animate([{height:h0+"px", overflow:"hidden"}, {height:h1+"px", overflow:"hidden"}], {duration:T.mid, easing:EASE, id:"ui"});
    });
    return;
  }
  patch(a, b);
}
/* 搬動位置的元素：瀏覽器會把它（和裡面）的 CSS 進場動畫從頭重播，看起來像整塊閃一下，直接跳到結尾 */
const skipIntro = (el, deep) => el.getAnimations({subtree:deep}).forEach(x => { if (x.animationName && isFinite(x.effect.getComputedTiming().endTime)) x.finish(); });
/* 同一層有重複的代號（例如兩個連結同名）：後面的加上 #2、#3，不然每次更新都會多出一列 */
function dedupKeys(p){
  const seen = new Map();
  for (const c of p.children) { if (c._leaving || !c.hasAttribute("data-key")) continue;
    const k = c.getAttribute("data-key").replace(/#\d+$/, ""), n = (seen.get(k) || 0) + 1; seen.set(k, n);
    const v = n > 1 ? `${k}#${n}` : k; if (c.getAttribute("data-key") !== v) c.setAttribute("data-key", v); }   // 沒變就不寫（寫了瀏覽器會重算樣式）
}
function keyedPatch(a, b, attrs){
  dedupKeys(a); dedupKeys(b);
  const old = new Map();
  [...a.children].forEach(c => { if (!c._leaving) old.set(c.getAttribute("data-key") || "", c); });
  // 項目的順序、數量都沒變時，不會有東西移位，就不用量位置（量位置會逼瀏覽器整頁重新排版）
  const moved = [...old.keys()].join("\n") !== [...b.children].map(c => c.getAttribute("data-key") || "").join("\n");
  const anim = canAnim(), first = new Map(), z = anim && moved ? ZM() : 1, grid = a.hasAttribute("data-grid");
  if (anim && moved) old.forEach((c, k) => first.set(k, c.getBoundingClientRect()));   // 要在換欄數（屬性）之前量，才是原本的位置
  const order = [...old.keys()], sx = a.scrollLeft, port = grid && anim && moved ? a.getBoundingClientRect() : null;
  if (attrs) attrs();
  const keep = [], fresh = []; let prev = null;
  const want = new Set([...b.children].map(c => c.getAttribute("data-key") || ""));
  // 找下一個「真正要留下的」元素：跳過空白、正在離開的、等一下要移除的
  const nextReal = n => { while (n && (n.nodeType !== 1 || n._leaving || !want.has(n.getAttribute("data-key") || ""))) n = n.nextSibling; return n; };
  [...b.children].forEach((nb, i) => {
    const k = nb.getAttribute("data-key") || "";
    let el = old.get(k);
    if (el) { old.delete(k); morph(el, nb); el = el.isConnected ? el : nb; if (el !== nb) keep.push([k, el]); }
    else { el = nb; el.style.setProperty("--i", i); fresh.push(el); }
    const ref = nextReal(prev ? prev.nextSibling : a.firstChild);
    if (el !== ref) { const back = el.isConnected; a.insertBefore(el, ref || null); if (back) skipIntro(el, true); }
    prev = el;
  });
  const leaving = [...old.values()];
  if (port) return gridFlip(a, {sx, z, port, first, order}, keep, fresh, leaving);
  // 會撐開／收起空間的進出場，留下的項目會跟著空間自然移動，不另外移位
  const flowing = anim && [...leaving, ...fresh].some(x => x.nodeType === 1 && !x.matches(TILE));
  leaving.forEach(c => leave(c));
  if (anim) fresh.forEach((el, j) => {
    if (el.nodeType !== 1) return;
    if (el.matches(TILE)) { skipIntro(el); el.animate([{opacity:0, transform:"scale(.95)"}, {opacity:1, transform:"none"}], {duration:T.mid, delay:j*50, easing:EASE, fill:"backwards", id:"ui"}); }
    else enterBlock(el, (leaving.length ? 200 : 0) + j*90);   // 有東西要離開時，等它先淡出再進來
  });
  if (anim && moved && !flowing) keep.forEach(([k, el]) => {   // 只有單純換位置時才平滑移位
    const f = first.get(k), l = el.getBoundingClientRect(), dx = (f.left - l.left) / z, dy = (f.top - l.top) / z;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{transform:`translate(${dx}px,${dy}px)`}, {transform:"none"}], {duration:T.spf, easing:SPRING_F, id:"ui"});
  });
}
/* 電腦版主機欄（篩選、換順序）：離開的留在原地淡出，不佔位置；留下的從原本的位置和寬度平滑移到新的；新的在自己的位置浮現 */
function gridFlip(a, {sx, z, port, first, order}, keep, fresh, leaving){
  a.scrollLeft = sx;                              // 換順序時瀏覽器會跟著原本對齊的那一欄捲走，捲回原處
  const box = a.getBoundingClientRect();
  leaving.forEach(c => {
    const f = c.nodeType === 1 && first.get(c.getAttribute("data-key") || "");
    const cl = f ? Math.max(0, port.left - f.left) / z : 0, cr = f ? Math.max(0, f.right - port.right) / z : 0;
    if (!f || cl + cr > f.width / z / 2) return c.remove();      // 原本就在畫面外（要往旁邊捲才看得到）：直接拿掉
    c._leaving = 1;
    // 拿出排版、留在原地，旁邊的欄馬上可以開始移動；超出原本可見範圍的部分切掉，不會露到右邊的事件紀錄上
    Object.assign(c.style, {position:"absolute", margin:"0", pointerEvents:"none", left:(f.left - box.left) / z + a.scrollLeft + "px", top:(f.top - box.top) / z + a.scrollTop + "px",
      width:f.width / z + "px", height:f.height / z + "px", clipPath:cl || cr ? `inset(-40px ${cr}px -40px ${cl}px)` : ""});
    c.animate([{opacity:1, transform:"none"}, {opacity:0, transform:"scale(.94)"}], {duration:T.mid, easing:EXIT, fill:"forwards", id:"ui"}).onfinish = () => c.remove();
  });
  const o = {duration:T.slow, easing:EASE, id:"ui"}, now = keep.map(x => x[0]), was = order.filter(k => now.includes(k));
  keep.forEach(([k, el]) => {
    const f = first.get(k), l = el.getBoundingClientRect(), dx = (f.left - l.left) / z, dy = (f.top - l.top) / z, w0 = f.width / z, w1 = l.width / z;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(w1 - w0) < 1) return;
    const from = {transform:`translate(${dx}px,${dy}px)`, width:w0 + "px"}, to = {transform:"none", width:w1 + "px"};
    const fwd = now.indexOf(k) < was.indexOf(k), back = now.indexOf(k) > was.indexOf(k);
    // 換順序時：往前排的（剛出狀況的）浮在上面，往後退的稍微縮小變淡從底下穿過，兩欄的字不會疊在一起
    const midf = fwd ? {transform:`translate(${dx / 2}px,${dy / 2}px) scale(1.02)`, width:(w0 + w1) / 2 + "px", offset:.5}
               : back ? {transform:`translate(${dx / 2}px,${dy / 2}px) scale(.95)`, width:(w0 + w1) / 2 + "px", opacity:.25, offset:.5} : null;
    el.style.zIndex = fwd ? 2 : 1;               // 離開的欄壓在底下，被玻璃霧化
    el.animate(midf ? [from, midf, to] : [from, to], o).finished.catch(() => {}).then(() => { el.style.zIndex = ""; });
  });
  fresh.forEach((el, j) => {
    if (el.nodeType !== 1) return;
    skipIntro(el); el.style.zIndex = 1;
    el.animate([{opacity:0, transform:"translateY(14px) scale(.97)"}, {opacity:1, transform:"none"}], {...o, delay:(leaving.length ? 120 : 0) + j*70, fill:"backwards"})
      .finished.catch(() => {}).then(() => { el.style.zIndex = ""; });
  });
}
const LIVECLS = ["prs", "hid", "sliding", "slid", "stuck"];   // 捲動收起、按壓、滑動中的即時狀態：定時更新時保留，不中斷特效
function patch(a, b){
  if (a.hasAttribute("data-keep")) return;     /* 由程式自己控制的元素（例如滑動光圈），不要被重畫蓋掉 */
  const attrs = () => {
    const keep = LIVECLS.filter(c => a.classList.contains(c));
    for (const at of [...a.attributes]) {
      if (at.name === "open" && a instanceof HTMLDetailsElement) continue;
      if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
    }
    for (const at of [...b.attributes]) if (a.getAttribute(at.name)!==at.value){
      if (at.name==="data-v") tween(a, parseFloat(a.getAttribute("data-v"))||0, parseFloat(at.value)||0, +b.getAttribute("data-d")||0);
      if (at.name==="d" && a.tagName==="path" && (b.hasAttribute("data-tf") ? slidePath(a, b.getAttribute("data-tf"), at.value) : morphPath(a, a.getAttribute("d"), at.value))) continue;
      if (at.name==="class" && keep.length) {
        const val = keep.reduce((s, c) => s.split(/\s+/).includes(c) ? s : s + " " + c, at.value);
        if (a.getAttribute("class") !== val) a.setAttribute("class", val);
        continue;
      }
      a.setAttribute(at.name, at.value);
    }
    if (keep.length && !b.hasAttribute("class")) a.classList.add(...keep);
  };
  if (a.hasAttribute("data-keyed")) return keyedPatch(a, b, attrs);
  attrs();
  if (a.hasAttribute("data-v")) return;
  const ac=[...a.childNodes].filter(n=>!n._leaving), bc=[...b.childNodes];
  bc.forEach((n,i)=>{ if (ac[i]) morph(ac[i], n); else a.appendChild(n); });
  for (let i=bc.length;i<ac.length;i++) leave(ac[i]);
}
function paint(html){
  const tpl = document.createElement("template"); tpl.innerHTML = html.trim();
  const cur = $("#app .dash");
  if (cur) morph(cur, tpl.content.firstElementChild); else { $("#app").innerHTML = ""; $("#app").appendChild(tpl.content.firstElementChild); }
}
const LVRANK = {bad:0, warn:1, ok:2};
/* 其他主機傳來的資料：會直接放進畫面的數字一律轉成數字，免得被塞進網頁程式碼 */
function tidy(s){
  const n = v => +v || 0;
  if (s.cores != null) s.cores = n(s.cores);
  if (s.updates) { s.updates.total = n(s.updates.total); s.updates.security = n(s.updates.security); }
  const t = s.traffic;
  if (t) { t.reset_day = n(t.reset_day); t.days_left = n(t.days_left); t.start = String(t.start || "").replace(/[^\d-]/g, ""); t.end = String(t.end || "").replace(/[^\d-]/g, "");
    (t.daily || []).forEach(d => { d.d = String(d.d || "").replace(/[^\d\/-]/g, ""); }); }
  if (!["ok","warn","bad"].includes(s.level)) s.level = s.online ? "ok" : "bad";
  if (s.keep) { s.keep.p95 = s.keep.p95 == null ? null : n(s.keep.p95); s.keep.days = n(s.keep.days); }
  (s.events || []).forEach(e => { if (!["bad","warn","ok","info"].includes(e.kind)) e.kind = "info"; });
  return s;
}
function render(list){
  // 更新剛完成：跳通知
  for (const s of list) {
    const old = LIST.find(x => keyOf(x) === keyOf(s));
    if (old && old.update && old.update.running && s.update && !s.update.running) {
      const ok = s.update.last && s.update.last.ok, k = s.update.last && s.update.last.n;
      const msg = !ok ? `「${s.name}」更新失敗，可以再試一次` : k ? `「${s.name}」更新完成，裝好 ${k} 個更新` : k === 0 ? `「${s.name}」檢查完成，已經是最新的` : `「${s.name}」更新完成`;
      setTimeout(() => toast(msg, ok ? "ok" : "bad"), 400);
    }
  }
  // 有紅色（異常）或橘色（注意）告警的主機排在最前面；同一級的照原本順序
  if (list !== LIST) ORDER = list.map(keyOf);  // 原本的順序（工具的主機列不跟著告警重排，免得按到別台）；換分頁重畫時 LIST 已經排過，不能拿來當原本的順序
  list = [...list].map(tidy).sort((a, b) => LVRANK[lvOf(a)] - LVRANK[lvOf(b)]);
  LIST = list;
  paint(renderConsole(list, lastUpdate));
  if (TIPX) drawTip(...TIPX);
  loadStatus(); pickShow(PSMOOTH);
}
/* 換主機時新的那台內容比較短：先撐住原本的高度，再順順地往上捲到新的底，最後才放開；
   不然捲到下面時一換，頁面會一下子跳回上面（使用者回報） */
let HOLDT = 0;
function holdHeight(change){
  const v = view(), se = document.scrollingElement, B = document.body;
  if (!v || !se || se.scrollTop < 1) return change();
  const bot = () => { const l = v.lastElementChild; return l ? l.getBoundingClientRect().bottom + se.scrollTop : 0; };
  clearTimeout(HOLDT); B.style.minHeight = "";
  const y0 = se.scrollTop, b0 = bot(); B.style.minHeight = se.scrollHeight / ZM() + "px";   // 撐住整頁原本的高度
  change();
  const tok = HOLDT = setTimeout(() => {}, 0);
  const go = () => { if (HOLDT !== tok) return;                     // 舊的還在淡出時量不準：等換好再量、再捲
    const y = se.scrollTop, cut = b0 - bot(); if (cut <= 1) { B.style.minHeight = ""; return; }
    const top = Math.max(0, Math.min(y, se.scrollHeight - cut - innerHeight));
    let done = 0; const free = () => { if (done) return; done = 1; removeEventListener("scrollend", free); if (HOLDT === tok) B.style.minHeight = ""; };
    if (top < y && canAnim()) { addEventListener("scrollend", free); setTimeout(free, 900); se.scrollTo({top, behavior:"smooth"}); }
    else { se.scrollTop = top; free(); } };
  const an = v.getAnimations ? v.getAnimations({subtree:true}).filter(a => a.playState === "running" && isFinite(a.effect && a.effect.getComputedTiming().endTime)) : [];
  Promise.race([Promise.all(an.map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, 700))]).then(go);
}
let PSMOOTH = false;   // 點主機名稱換台時，那一排平順地滑到選到的那台
DESK.addEventListener("change", () => { applyPrefs(); if (LIST.length) render(LIST); });

/* ═════════ 對話框、通知 ═════════ */
function modal({icon, cls="box", title, text, input, ok="確定"}){
  return new Promise(res => {
    const v = document.createElement("div"); v.className = "veil";
    v.innerHTML = `<div class="dialog">${icon?`<div class="ico big ${cls}">${I(icon)}</div>`:""}<h3>${esc(title)}</h3>${text?`<p>${esc(text)}</p>`:""}
      ${input!==undefined?`<input class="field" maxlength="40" value="${esc(input)}">`:""}
      <div class="btns"><button class="ubtn ${cls === "bad" || cls === "warn" ? cls : ""}" data-r="1">${ok}</button></div></div>`;
    $("#layer").appendChild(v);
    const inp = v.querySelector("input");
    const done = r => { if (v._d) return; v._d = 1; v.classList.add("closing"); const val = r ? (inp ? inp.value : true) : null;
      setTimeout(()=>{ v.remove(); res(val); }, 360); };
    v._esc = () => done(0);
    if (inp) { setTimeout(()=>{ inp.focus(); inp.select(); }, 60); inp.addEventListener("keydown", e => { if (e.key==="Enter") done(1); if (e.key==="Escape") done(0); }); }
    v.addEventListener("click", e => { if (e.target === v) return done(0); const b = e.target.closest("[data-r]"); if (b) done(+b.dataset.r); });
  });
}
/* 滑鼠移到曲線上：顯示那個時間點的數值 */
let TIPX = null;
function tipEls(){
  let t = $("#ctip");
  if (!t) { t = document.createElement("div"); t.id = "ctip"; t.className = ""; document.body.appendChild(t);
    const l = document.createElement("div"); l.id = "cline"; document.body.appendChild(l); }
  return [t, $("#cline")];
}
function hideTip(){ TIPX = null; const t = $("#ctip"); if (t) { t.classList.remove("show"); $("#cline").classList.remove("show"); } }
function drawTip(x, y){
  const el = document.elementFromPoint(x, y), box = el && el.closest && el.closest(".cbox");
  const svg = box && box.querySelector("svg.chart[data-cid]"), d = svg && CHD[svg.dataset.cid];
  if (!d || !d.ser[0] || !d.ser[0].data || d.ser[0].data.length < 2) return hideTip();
  TIPX = [x, y];
  const z = ZM(), b = svg.getBoundingClientRect(), r = {left:b.left/z, top:b.top/z, width:b.width/z, height:b.height/z}, f = Math.max(0, Math.min(1, (x/z - r.left) / r.width));
  const n = d.ser[0].data.length, i = Math.round(f * (n - 1)), t = d.t && d.t[i];
  const dt = t ? new Date(t * 1000) : null, hm = dt ? dt.toLocaleTimeString("zh-TW", {hour:"2-digit", minute:"2-digit", hour12:false}) : "";
  const when = !dt ? "" : RANGE === "7d" ? `${dt.getMonth()+1}/${dt.getDate()} ${hm}` : hm;
  const [tip, line] = tipEls();
  tip.innerHTML = `<div class="tt">${when}</div>` + d.ser.map(s => `<div class="tr2"><i style="background:${s.color}"></i>${esc(s.name||"")}<b class="num">${(s.f || d.fmt)((s.raw || s.data)[i] ?? 0)}</b></div>`).join("");
  const lx = r.left + f * r.width;
  line.style.cssText = `left:${lx}px;top:${r.top}px;height:${r.height}px`;
  const w = tip.offsetWidth || 150, left = lx + 14 + w > innerWidth / z - 8 ? lx - 14 - w : lx + 14;
  tip.style.left = left + "px"; tip.style.top = (r.top + 6) + "px";
  tip.classList.add("show"); line.classList.add("show");
}
document.addEventListener("pointermove", e => {
  if (e.pointerType !== "mouse") return;
  if (e.target.closest && e.target.closest(".cbox")) drawTip(e.clientX, e.clientY); else if (TIPX) hideTip();
}, {passive:true});
addEventListener("scroll", () => { if (TIPX) hideTip(); }, {passive:true});
document.addEventListener("pointerleave", hideTip);
/* 整頁平順切換（深淺模式、配色風格）：截圖瞬間先凍住元件過渡，避免新畫面拍到半透明／舊顏色而閃一下 */
function smooth(fn){
  if (!canAnim() || !document.startViewTransition) return fn();
  const h = document.documentElement, id = h._vtm = (h._vtm || 0) + 1;
  h.classList.add("vtswap");
  document.startViewTransition(fn).finished.catch(() => {}).finally(() => { if (h._vtm === id) h.classList.remove("vtswap"); });
}
/* 切換文字大小：整頁重新排版只做一次（排版期間畫面先停在舊的樣子），
   然後舊畫面一邊放大（或縮小）一邊淡出、新畫面從另一個大小接過來淡入，看起來像整頁平順地縮放 */
function sizeShift(fn){
  const h = document.documentElement, z0 = parseFloat(h.style.getPropertyValue("--zoom")) || 1;
  if (!canAnim() || !document.startViewTransition) return fn();
  const z1 = {s:.92, m:1, l:1.1}[PREF.size] || 1;
  h.style.setProperty("--zr", (z1 / z0).toFixed(4)); h.classList.add("vtsize");
  const id = h._vts = (h._vts || 0) + 1;           // 連點兩下：前一次被中斷時，不能把這一次要用的縮放設定拿掉，不然設定面板會閃
  document.startViewTransition(fn).finished.catch(() => {}).finally(() => { if (h._vts === id) h.classList.remove("vtsize"); });
}
function toast(msg, type="ok"){
  const t = document.createElement("div"); t.className = `toast ${type}`;
  t.innerHTML = `${I(type==="ok"?"ok":"warn")}<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(t);
  setTimeout(()=>{ t.classList.add("out"); setTimeout(()=>t.remove(), 400); }, 2600);
}

/* ═════════ 分頁、主機整頁 ═════════ */
let TAB = ["home", "tools", "log", "set"].includes(sstore("vs-tab")) ? sstore("vs-tab") : "home";
function setTab(k, keyboard = false){
  closeMenu(); hideTip();
  if (TAB === k) {
    if (scrollY > 0) scrollTo({top:0, behavior: !keyboard && canAnim() ? "smooth" : "auto"});
    return;
  }
  const ks = TABS.map(x => x[0]);
  TABDIR = Math.sign(ks.indexOf(k) - ks.indexOf(TAB));
  TAB = k; sstore("vs-tab", k);
  TABQUIET = keyboard;
  try { slideSel(() => render(LIST), !keyboard && canAnim()); } finally { TABQUIET = false; }
  if (scrollY > 0) scrollTo(0, 0);
}
let TABID = 0;
/* 工具、設定頁上「讀取中…」的狀態：換到那一頁時讀一次（之後自動更新不會蓋掉） */
const view = () => $("#app .view");
function loadStatus(){
  const r = view(); if (!r || !r.querySelector("[data-ld]")) return;
  r.querySelectorAll("[data-ld]").forEach(x => x.removeAttribute("data-ld"));
  tgStatus(r); selfStatus(r); pkStatus(r); pinStatus(r); sessStatus(r); pairStatus(r); bkStatus(r); skyStatus(r);
}
/* 改了設定：馬上套用 */
function changed(k){
  const run = () => { applyPrefs(); if (LIST.length) render(LIST); };
  if (k === "size") sizeShift(run);              // 文字大小：整頁平順地放大／縮小過去
  else if (k === "theme") {                      // 深淺模式：只有真的換了深淺才整頁淡入淡出（避免同色切「自動」也閃一下）
    const next = (PREF.theme === "dark" || (PREF.theme === "auto" && DARKQ.matches)) ? "dark" : "light";
    if (document.documentElement.dataset.mode !== next) smooth(run); else run();
  }
  else if (k === "accent" || k === "tone") smooth(() => {   // 主題色／配色風格：只改屬性與選取態，免整頁 diff 與重查狀態，交給 GPU 一次截圖順滑淡換
    applyPrefs();
    document.querySelectorAll(`#app [data-pref="${k}"]`).forEach(b => b.classList.toggle("on", b.dataset.val === String(PREF[k])));
    if (k === "accent") {
      const sv = document.querySelector("#app .sw-val"), lb = ACCENTS.find(x => x[0] === PREF.accent)?.[1] || (PREF.accent === "rainbow" ? "彩色" : "藍");
      if (sv) sv.innerHTML = `<i></i>${esc(lb)}`;
    }
  });
  else run();
  if (k === "refresh") restart();
  if (k === "show.weather") { if (PREF.show.weather) store(WXK, JSON.stringify({...wxMem(), deny: 0})); wxRun(); }
}
document.addEventListener("change", e => {
  const t = e.target; if (!t.closest || t.closest("#layer")) return;
  if (t.dataset.keepalive !== undefined) return keepSet(t);
  if (t.classList.contains("tog") && t.dataset.pref) { setP(t.dataset.pref, t.checked); setTimeout(() => changed(t.dataset.pref), 180); }   // 等開關動畫跑完再重畫
});
/* 其他主機連不上：可以直接在網頁上改它的連線網址（例如網域、連接埠換了） */
const peerBtn = s => s.node ? `<button class="ubtn ghost sm peerfix" data-peeredit="${esc(s.node)}">${I("edit")}更改連線網址</button>` : "";
function peerModal(s){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog"><div class="ico big theme">${I("off")}</div><h3>更改「${esc(s.name)}」的連線網址</h3>
    <p>網域或連接埠換了時用</p>
    <div class="form">
      <label>網址<input class="field" data-k="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://網域:9443 或 http://IP:8787" value="${esc(s.peer_url || "")}">
        </label>
      <label>密碼<input class="field" data-k="token" autocomplete="off" spellcheck="false" placeholder="沒變就留空">
        <small>那台換過密碼才要填</small></label>
      <div class="msg"></div>
    </div>
    <div class="btns"><button class="ubtn" data-save>測試並儲存</button></div></div>`;
  $("#layer").appendChild(v);
  const q = k => v.querySelector(`[data-k="${k}"]`), msg = v.querySelector(".msg"), sb = v.querySelector("[data-save]");
  let force = false, busy = false;
  const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => v.remove(), 360); };
  v._esc = done;
  q("url").addEventListener("input", () => { force = false; sb.textContent = "測試並儲存"; });
  v.addEventListener("click", async e => {
    if (e.target === v || e.target.closest("[data-r]")) return done();
    if (!e.target.closest("[data-save]") || busy) return;
    busy = true; sb.disabled = true; sb.innerHTML = `<span class="spin"></span>測試中…`; msg.className = "msg"; msg.textContent = "";
    try {
      const r = await fetch("/api/peer", {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"},
        body: JSON.stringify({name: s.node, url: q("url").value.trim(), token: q("token").value.trim(), force})});
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { toast(d.message); done(); tick(); }
      else { msg.className = "msg bad"; msg.textContent = (d.message || "儲存失敗") + (d.test_failed ? "。網址沒錯的話可按「仍然儲存」。" : "");
        if (d.test_failed) force = true; }
    } catch(err) { msg.className = "msg bad"; msg.textContent = "連線失敗，請稍後再試"; }
    busy = false; sb.disabled = false; sb.textContent = force ? "仍然儲存" : "測試並儲存";
  });
  setTimeout(() => q("url").focus(), 60);
}
/* 編輯主機：名稱＋管理後台網址 */
function hostModal(name, links){
  return new Promise(res => {
    const v = document.createElement("div"); v.className = "veil";
    const row = (x = {name:"", url:""}) => `<div class="lrow"><input class="field ln" maxlength="30" placeholder="名稱，例如 3x-ui" value="${esc(x.name)}"><input class="field lu" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://你的網域:2053/路徑/" value="${esc(x.url)}"><button type="button" class="iconbtn" data-del title="刪掉這個連結">${I("x")}</button></div>`;
    v.innerHTML = `<div class="dialog hostd"><div class="ico big theme">${I("edit")}</div><h3>編輯主機</h3>
      <div class="form">
        <label>名稱<input class="field" data-k="name" maxlength="40" value="${esc(name)}"></label>
        <div class="lbl">常用連結
          <small>例如 3x-ui 後台、n8n，會放在「工具」</small>
          <div class="lrows">${(links.length ? links : [{name:"", url:""}]).map(row).join("")}</div>
          <button type="button" class="ubtn ghost addl" data-add>＋ 新增連結</button></div>
      </div>
      <div class="btns"><button class="ubtn" data-r="1">儲存</button></div></div>`;
    $("#layer").appendChild(v);
    const box = v.querySelector(".lrows");
    const rows = () => [...box.children].filter(r => !r._leaving);
    const sync = () => reveal(v.querySelector("[data-add]"), rows().length < 6);
    const done = ok => { if (v._d) return; v._d = 1; v.classList.add("closing");
      const val = ok ? {name: v.querySelector('[data-k="name"]').value.trim(),
        links: rows().map(r => ({name: r.querySelector(".ln").value.trim(), url: r.querySelector(".lu").value.trim()})).filter(x => x.url)} : null;
      setTimeout(() => { v.remove(); res(val); }, 360); };
    v._esc = () => done(0);
    setTimeout(() => v.querySelector('[data-k="name"]').focus(), 60);
    v.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input")) done(1); });
    v.addEventListener("click", e => {
      if (e.target === v) return done(0);
      const b = e.target.closest("[data-r]"); if (b) return done(+b.dataset.r);
      if (e.target.closest("[data-add]")) { box.insertAdjacentHTML("beforeend", row()); const r = box.lastElementChild;
        if (canAnim()) enterBlock(r, 0);
        r.querySelector(".ln").focus({preventScroll:true}); return sync(); }
      const d = e.target.closest("[data-del]");
      if (d) { const r = d.closest(".lrow");
        if (rows().length === 1) { r.querySelectorAll("input").forEach(i => i.value = ""); return; }
        r._leaving = 1; if (canAnim()) leaveBlock(r); else r.remove(); sync(); }
    });
    sync();
  });
}
/* 有好幾個常用連結：出現小選單 */
/* 選單放在按鈕下面；下面放不下就改放上面 */
function placeMenu(m, btn, x){
  const z = ZM(), b = btn.getBoundingClientRect(), r = {left:b.left/z, right:b.right/z, top:b.top/z, bottom:b.bottom/z, width:b.width/z};
  const vw = innerWidth / z, vh = innerHeight / z, w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(vw - w - 8, x(r))) + "px";
  const above = r.bottom + 8 + h > vh - 8 && r.top - 8 - h > 8;
  m.style.top = (above ? r.top - 8 - h : r.bottom + 8) + "px";
  m.style.transformOrigin = (above ? "bottom " : "top ") + (r.left + r.width / 2 - parseFloat(m.style.left)) + "px";
}
function moreMenu(btn, s){
  closeMenu();
  const node = esc(s.node || ""), name = esc(s.name);
  const it = (attr, icon, label, cls="") => `<button class="${cls}" ${attr}="${node}" data-name="${name}">${I(icon)}<span>${label}</span></button>`;
  const m = document.createElement("div"); m.className = "lmenu hmenu";
  m.innerHTML = (s.online ? it("data-rename", "edit", "編輯名稱與連結")
    + it("data-reboot", "power", "重新開機", "warn") : "")
    + (s.node ? it("data-rmhost", "trash", "移除主機", "bad") : "");
  document.body.appendChild(m);
  placeMenu(m, btn, r => r.left - 6);           // 從 ⋯ 往右下展開，不會蓋住主機名稱
  if (canAnim()) m.animate([{opacity:0, transform:"scale(.86,.68)"}, {opacity:1, transform:"none"}], {duration:T.spf, easing:SPRING_F});
  window._menu = m; histMark(m);
  setTimeout(() => m.addEventListener("click", () => closeMenu()), 0);
}
/* 紀錄（手機）：選只看哪一台主機 */
function logHostMenu(btn){
  closeMenu();
  const it = (k, l) => `<button data-logh="${esc(k)}"${LOGH === k ? ` class="on"` : ""}>${LOGH === k ? I("check") : `<span class="ckh"></span>`}<span>${l}</span></button>`;
  const m = document.createElement("div"); m.className = "lmenu hmenu hlist";
  m.innerHTML = it("", "全部主機") + LIST.map(x => it(keyOf(x), esc(x.name))).join("");
  document.body.appendChild(m);
  placeMenu(m, btn, r => r.right - m.offsetWidth);
  if (canAnim()) m.animate([{opacity:0, transform:"scale(.86,.68)"}, {opacity:1, transform:"none"}], {duration:T.spf, easing:SPRING_F});
  window._menu = m; histMark(m);
  setTimeout(() => m.addEventListener("click", () => closeMenu()), 0);
}
function closeMenu(){
  const m = window._menu; if (!m) return; window._menu = null;
  if (!canAnim()) { m.remove(); return histDrop(m); }
  m.animate([{opacity:1, transform:"none"}, {opacity:0, transform:"scale(.94,.86)"}], {duration:Math.round(T.fast * .7), easing:EXIT, fill:"forwards"}).finished.then(() => { m.remove(); histDrop(m); });
}
addEventListener("scroll", e => { if (!(window._menu && e.target instanceof Node && window._menu.contains(e.target))) closeMenu(); }, {passive:true, capture:true});   // 選單自己裡面捲動不關
addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
/* ═════════ 更新哨兵本身 ═════════ */
async function selfCall(node, action){
  const r = await api("/api/self?node=" + encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify({action})});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || (r.status === 404 ? "這台還是舊版，請先手動更新一次" : "讀取失敗"));
  return d;
}
const SELFST = {};
let SELFT = 0;
/* 每台的版本都讀一次（算「全部更新」要用）；換選別台時直接用剛讀到的，不用再等 */
/* mode：true＝去檢查有沒有新版；"fresh"＝重新讀一次；不給＝一分鐘內讀過就直接用 */
let SELFCHK = false;   // 按了「檢查新版」、還在問的時候
async function selfStatus(root, mode){
  if (!root.querySelector(".selfbox")) return;
  const hosts = LIST.filter(x => x.online);
  if (mode || Date.now() - SELFT > 60000 || hosts.some(h => !SELFST[keyOf(h)])) {
    const res = await Promise.all(hosts.map(h => selfCall(h.node || "", mode === true ? "check" : "status").then(d => [h, d]).catch(e => [h, {err: e.message, old: true}])));
    res.forEach(([h, d]) => SELFST[keyOf(h)] = d); SELFT = Date.now();
  }
  selfPaint(root);
}
/* 讀到的狀態換上去：新字淡入（字一樣就不動） */
function txt(el, t){
  if (el.textContent === t) return;
  el.textContent = t;
  if (canAnim() && el.isConnected) el.animate([{opacity:0}, {opacity:1}], {duration:T.mid, easing:EASE, id:"ui"});
}
/* 整塊內容換掉：新出現的淡入（沒變的不動）、高度平滑變化；本來是空的就從 0 撐開 */
function swapHTML(el, html){
  if (el.innerHTML === html) return;
  if (!canAnim() || !el.isConnected) { el.innerHTML = html; return; }
  const h0 = el.offsetHeight, olds = [...el.children]; el.innerHTML = html;
  if (!html.trim()) return;
  if (!h0) return enterBlock(el, 0);
  const h1 = el.offsetHeight, o = {duration:T.mid, easing:EASE, id:"ui"};
  // 只有真的變了的那一行淡入；包在同一個外框裡的，往裡面一層比
  const fade = (was, now) => { const same = new Set(was.map(c => c.outerHTML));
    now.forEach((c, i) => { if (same.has(c.outerHTML)) return; const p = was[i];
      if (p && p.tagName === c.tagName && p.className === c.className && p.children.length && c.children.length) return fade([...p.children], [...c.children]);
      c.animate([{opacity:0, transform:"translateY(4px)"}, {opacity:1, transform:"none"}], o); }); };
  fade(olds, [...el.children]);
  if (Math.abs(h1 - h0) > 1) el.animate([{height:h0 + "px", overflow:"hidden"}, {height:h1 + "px", overflow:"hidden"}], o);
}
/* 彈窗分頁切換（每日備份、擋廣告、相簿詳細設定）：同格 1×1 Grid 疊放所有分頁（.dialog 高度永不變動，徹底杜絕 iOS 毛玻璃重繪閃爍），純 GPU 水平滑換，零複製、零重疊、零空白 */
function slidePane(wrap, nextKey, dir = 1){
  if (!wrap) return;
  const panes = [...wrap.children].filter(c => c.dataset.sw !== undefined);
  const next = panes.find(c => c.dataset.sw === nextKey);
  if (!next) return;
  const prev = panes.find(c => c.dataset.sw === wrap._cur && c !== next) || panes.find(c => c !== next && !c.classList.contains("off")) || null;
  wrap._cur = nextKey;
  if (!canAnim() || !wrap.isConnected || !prev) {
    panes.forEach(p => { const off = p !== next; p.classList.toggle("off", off); p.setAttribute("aria-hidden", off ? "true" : "false"); });
    return;
  }
  const id = wrap._sw = (wrap._sw || 0) + 1;
  const xOf = el => { const t = getComputedStyle(el).transform; return t && t !== "none" ? new DOMMatrix(t).m41 : 0; };
  const fromPrev = xOf(prev), fromNext = next.classList.contains("off") ? null : xOf(next);
  panes.forEach(p => {
    p.getAnimations().forEach(a => a.cancel());
    if (p !== prev && p !== next) { p.classList.add("off"); p.setAttribute("aria-hidden", "true"); }
  });
  const w = (wrap.offsetWidth || 320) + 16, d = dir < 0 ? -1 : 1;
  const o = {duration:Math.round(T.mid * .82), easing:DEC, id:"ui"};
  prev.classList.remove("off"); prev.setAttribute("aria-hidden", "true");
  next.classList.remove("off"); next.setAttribute("aria-hidden", "false");
  const aPrev = prev.animate([{transform:`translate3d(${fromPrev}px,0,0)`}, {transform:`translate3d(${-d * w}px,0,0)`}], {...o, fill:"forwards"});
  const aNext = next.animate([{transform:`translate3d(${fromNext !== null ? fromNext : d * w}px,0,0)`}, {transform:"translate3d(0,0,0)"}], o);
  Promise.all([aPrev.finished, aNext.finished]).catch(() => {}).then(() => {
    if (wrap._sw !== id || !wrap.isConnected) return;
    panes.forEach(p => { if (p !== next) { p.classList.add("off"); p.setAttribute("aria-hidden", "true"); } });
    aPrev.cancel();
  });
}
/* 顯示／收起一塊（取代直接改 hidden）：撐開後淡入；淡出後收起 */
function reveal(el, on){
  if (!el) return;
  if (on === (!el.hidden && !el._hiding)) return;
  el.getAnimations().forEach(a => a.cancel()); el._hiding = false; el.style.overflow = "";
  if (!canAnim() || !el.isConnected) { el.hidden = !on; return; }
  if (on) { el.hidden = false; return enterBlock(el, 0); }
  el._hiding = true; el.style.overflow = "hidden";
  el.animate([{height:el.offsetHeight + "px", opacity:1, easing:EXIT}, {height:el.offsetHeight + "px", opacity:0, offset:.35, easing:EASE},
    {height:"0px", opacity:0, paddingTop:"0px", paddingBottom:"0px", marginTop:"0px", marginBottom:"0px"}], {duration:T.mid, easing:"linear", id:"ui"})
    .finished.then(() => { if (el._hiding) { el.hidden = true; el._hiding = false; } el.style.overflow = ""; }, () => {});
}
/* 視窗裡的提示字：新的字淡入，從沒有字變成有字時慢慢撐開 */
function sayTo(msg, t){ t ? swapHTML(msg, `<span>${esc(t)}</span>`) : msg.textContent = ""; }
function selfRowHtml(h){
  const d = h && SELFST[keyOf(h)];
  if (!d) return `<div class="selfwait">讀取中…</div>`;
  const node = esc(h.node || "");
  const st = d.running ? `<span class="spin"></span>更新中…` : SELFCHK ? `<span class="spin"></span>檢查中…` : d.old || d.supported === false ? `<span class="warn">${esc(d.err)}</span>`
    : d.has ? `<span class="new">有新版可以更新</span>` : d.err ? esc(d.err) : "";
  const ch = d.has && d.changes && d.changes.length ? `<ul class="chg">${d.changes.slice(0, 5).map(c => `<li>${esc(c.split("\n")[0])}</li>`).join("")}</ul>` : "";
  const c = d.cloud;
  const cst = !c ? "" : c.running ? `<span class="spin"></span>更新中…` : c.has ? `<span class="new">官方有新版可以更新</span>` : c.err ? `<span class="warn">${esc(c.err)}</span>` : c.has === false ? "ok" : "還沒檢查";
  const est = c && c.enc && c.enc.on ? ` <span class="vlk" title="已加密">${I("lock")}</span>` : "";   // 整顆加密：小鎖頭
  const crow = c ? `<div class="cl2">${IC("cloud", "")}<span>雲端硬碟<small>${cst === "ok" ? (c.version ? VOK(esc(c.version)) : VOK("最新")) : (c.version ? `<span class="vbs"><span class="vbd">${esc(c.version)}</span></span> ` : "") + cst}${est}</small></span>
    ${c.has && !c.running ? `<button class="ubtn sm" data-cloudup="${node}">更新</button>` : ""}</div>` : "";
  const srow = `<div class="cl2 first"><span class="ico theme">${I("upd")}</span><span>哨站<small title="${esc(d.build || "")}">${st ? (d.version ? `<span class="vbs"><span class="vbd">${esc(d.version)}</span></span> ` : "") + st : d.version ? VOK(esc(d.version)) : ""}</small>${ch}</span>
    ${d.has && !d.running ? `<button class="ubtn sm" data-selfup="${node}">更新</button>` : ""}</div>`;
  return `<div class="selfrow">${srow}${crow}</div>`;
}
function selfPaint(root){
  const box = root.querySelector(".selfbox"), sum = root.querySelector(".selfsum"); if (!box) return;
  if (sum) swapHTML(sum, selfSumHtml());
  const h = LIST.find(x => (x.node || "") === box.dataset.n);
  if (!h || !SELFST[keyOf(h)]) return;
  swapHTML(box, selfRowHtml(h));
}
/* 背景預先讀取設定頁狀態：第一次滑到設定或點開設定視窗時已就緒，不慢半拍、整頁不跳動 */
function prewarmSet(){
  if (window._pw || SHARE || !getTok() || !LIST.length) return;
  window._pw = 1;
  const on = LIST.filter(x => x.online), self = on.some(x => !x.node);
  if (on.length && on.some(h => !SELFST[keyOf(h)])) {
    Promise.all(on.map(h => selfCall(h.node || "", "status").then(d => [h, d]).catch(e => [h, {err:e.message, old:true}]))).then(res => {
      res.forEach(([h, d]) => SELFST[keyOf(h)] = d); SELFT = Date.now();
      const r = view(); if (r && r.querySelector(".selfbox")) selfPaint(r);
    });
  }
  tgCall({action:"status"}).then(d => { RAWCACHE.tg = d; STCACHE.tgst = {t: d.on ? "" : d.has_token ? "還沒選要傳到哪裡" : "還沒設定", b: !!d.on, on: !!d.on}; }, () => {});
  if (self) {
    if (PK_OK) pkCall("/api/passkey", {action:"list"}, 1).then(d => { RAWCACHE.pk = d; const n = d.keys && d.keys.length; STCACHE.pkst = {t: n ? "" : "還沒登記", b: n || false, on: !!n}; }, () => {});
    pinCall({action:"status"}).then(d => { RAWCACHE.pin = d; const ok = !!(d.on && !d.locked); STCACHE.pinst = {t: !d.on ? "還沒設定" : d.locked ? `輸錯太多次，暫停中（還有 ${Math.ceil(d.locked / 60)} 分鐘）` : "", b: ok, on: ok}; }, () => {});
    sessCall({action:"list"}).then(d => { RAWCACHE.sess = d; STCACHE.sessst = {t: "", b: (d.list || []).length || 1, on: false}; }, () => {});
    pairCall({action:"status"}).then(d => { RAWCACHE.pair = d; const n = (d.keys || []).length; STCACHE.pairst = {t: n ? "" : "還沒配對", b: n || false, on: n > 0}; }, () => {});
    skyCall({action:"status"}).then(d => { RAWCACHE.sky = d; STCACHE.skyst = {t: skyLine(d), b: false, on: !!d.on && !d.err}; }, () => {});
  }
}
/* jobs：[{node, kind:"self"|"cloud"}]；不給就是「全部更新」 */
async function selfUpdate(root, jobs){
  if (!jobs) { jobs = [];
    for (const h of LIST.filter(x => x.online)) { const d = SELFST[keyOf(h)], node = h.node || ""; if (!d) continue;   // 只看現在連得上的主機
      if (d.has && !d.running) jobs.push({node, kind:"self"});
      if (d.cloud && d.cloud.has && !d.cloud.running) jobs.push({node, kind:"cloud"}); } }
  const onlyCloud = jobs.every(j => j.kind === "cloud");
  const ok = await modal({icon:"upd", cls:"theme", title: onlyCloud ? "更新雲端硬碟？" : "開始更新？",
    text: onlyCloud ? "約 1 分鐘，期間暫時打不開，檔案都會保留。"
      : "約 1 分鐘，設定和檔案都會保留。", ok:"開始更新"});
  if (!ok) return;
  jobs.sort((a, b) => (a.node === "" && a.kind === "self") - (b.node === "" && b.kind === "self"));   // 這台的哨兵最後更新（更新完畫面會重新載入）
  /* 好幾台的哨兵一起更新：先更新一台別的主機，確定新版跑得起來再更新其他台 */
  const selfs = jobs.filter(j => j.kind === "self"), first = selfs.length > 1 && selfs.find(j => j.node);
  const later = first ? selfs.filter(j => j !== first) : [];
  const fail = [], go = await upwStart(jobs.filter(j => !later.includes(j)), fail);
  if (go.includes(first)) { UPW.wait = later; UPW.first = first.node; }
  else if (later.length) go.push(...await upwStart(later, fail));     // 先試的那台根本沒開始（例如剛好斷線）：其他台照常更新
  const all = go.length + (go.includes(first) ? later.length : 0);
  if (UPW.wait.length) UPW.wait.forEach(j => upvSet(j, "wait"));
  if (all) upvOpen();                                                   // 開始了：打開進度視窗（開不了的也列在裡面）
  else if (fail.length) toast(fail.join("；"), "bad");
  setTimeout(() => selfStatus(root, "fresh"), 1500);
  upwSave(); upwRun();
}
const jobName = j => ((LIST.find(x => (x.node || "") === j.node) || {}).name || "主機") + (j.kind === "cloud" ? " 的雲端硬碟" : "");
/* 開始更新這幾項，回傳成功開始的；失敗的原因放進 fail */
async function upwStart(jobs, fail){
  const go = [];
  for (const j of jobs) {
    const h = LIST.find(x => (x.node || "") === j.node) || {}, d = SELFST[keyOf(h)] || {};
    try { await selfCall(j.node, j.kind === "cloud" ? "cloud_update" : "update"); go.push(j);
      UPW.jobs.push({node: j.node, kind: j.kind, name: h.name || "主機", from: j.kind === "cloud" ? (d.cloud || {}).version || "" : d.build || "", t0: Date.now()});
      upvSet(j, "dl");
    } catch(e) { fail.push(`${jobName(j)}：${e.message}`); upvSet(j, "fail", e.message); }
  }
  return go;
}
/* 更新完自動套用：盯著剛開始更新的項目，全部好了才跳一則通知、更新設定面板上的版本號；
   這台的哨兵換新版時自動重新載入網頁。記在分頁裡，重新載入後會接著盯
   wait：等第一台（first）確定沒問題才更新的；held：已經有結果、等全部好了一起說的 */
const UPW = (() => { let o = {}; try { o = JSON.parse(sstore("vs-upw") || "{}"); } catch(e) {}
  if (Array.isArray(o)) o = {jobs: o};
  return {jobs: o.jobs || [], wait: o.wait || [], first: o.first || "", held: o.held || [], rows: o.rows || [], show: !!o.show, timer: 0}; })();
function upwSave(){ const {jobs, wait, first, held, rows, show} = UPW;
  sstore("vs-upw", jobs.length || wait.length || held.length || show ? JSON.stringify({jobs, wait, first, held, rows, show}) : ""); }
function upwPanel(){ const b = TAB === "set" && view(); if (b) selfStatus(b, "fresh"); }
const upwSay = (list) => { const bad = list.filter(x => !x[1]), good = list.filter(x => x[1]);
  return [good.length ? (good.length > 1 ? `${good.length} 個項目都更新好了 ✨` : good[0][0]) : "", ...bad.map(x => x[0])].filter(Boolean).join("；"); };
function upwReload(msg){
  if (window._reloading) return; window._reloading = true;
  clearTimeout(UPW.timer); clearTimeout(timer);
  UPW.jobs = UPW.jobs.filter(j => !(!j.node && j.kind === "self"));
  if (!UPW.jobs.length && !UPW.wait.length) { msg = upwSay([...UPW.held, [msg, true]]); UPW.held = []; }
  else UPW.held.push([msg, true]);
  if (UPV) { UPW.rows.filter(r => r.k.startsWith("|") && r.kind === "self").forEach(r => upvSet(r, "done"));   // 視窗開著：先畫「好了」，整頁淡出再重新載入
    if (!UPW.jobs.length && !UPW.wait.length) UPW.show = false;
    upwSave(); if (msg) sstore("vs-upmsg", msg);
    setTimeout(() => { if (canAnim()) document.body.animate([{opacity:1}, {opacity:0}], {duration:T.slow, easing:EXIT, fill:"forwards"}); }, T.long);
    return setTimeout(() => location.reload(), T.long + (canAnim() ? T.slow : 0));
  }
  upwSave();
  if (msg) sstore("vs-upmsg", msg);
  toast("哨站已更新到新版，重新載入中…");
  setTimeout(() => location.reload(), 1400);
}
function upwRun(){
  clearTimeout(UPW.timer);
  if (!UPW.jobs.length || window._reloading) return;
  UPW.timer = setTimeout(upwStep, UPV ? 1500 : 3000);                  // 進度視窗開著：問勤一點，步驟才跟得上
}
async function upwStep(){
  const nodes = [...new Set(UPW.jobs.map(j => j.node))], done = [];
  let mine = "";                                                        // 這台的哨兵換好的新版本號
  await Promise.all(nodes.map(async node => {
    let d; try { d = await selfCall(node, "status"); }
    catch(e) {                                                          // 正在重新啟動，連不上是正常的
      UPW.jobs.filter(x => x.node === node && x.kind === "self" && Date.now() - x.t0 > 4000).forEach(j => upvSet(j, "boot"));
      return; }
    for (const j of UPW.jobs.filter(x => x.node === node)) {
      const age = Date.now() - j.t0;
      if (j.kind === "self" && d.running && !(d.build && j.from && d.build !== j.from)) {
        const r = UPW.rows.find(x => x.k === upk(j)), was = r ? UPST.indexOf(r.st) : 0, now = UPST.indexOf(d.stage || (age < 4000 ? "dl" : "inst"));
        if (now > was) upvSet(j, UPST[now]);                            // 舊版主機沒有回報步驟：照時間猜；步驟只往前不往回
      }
      if (j.kind === "cloud") {
        const c = d.cloud; if (!c || c.running) continue;
        if (age < 4000) continue;                                       // 剛開始的那一下可能還沒跑起來
        const v = c.version || "";
        done.push([j, c.err && !v ? `「${j.name}」的雲端硬碟更新失敗：${c.err}` : v && v !== j.from ? `「${j.name}」的雲端硬碟已更新到 ${v} ✨` : `「${j.name}」的雲端硬碟更新完成`, !(c.err && !v)]);
      } else if (j.from && d.build && d.build !== j.from) {
        if (!node) { mine = d.version; done.push([j, "", true]); continue; }   // 這台：等一下換上新畫面
        done.push([j, `「${j.name}」的哨站已更新到 ${d.version} ✨`, true]);
      } else if (!d.running && age > 15000) {
        const bad = d.last && d.last.ok === false;
        done.push([j, bad ? `「${j.name}」的哨站${d.last.rolled ? "新版打不開，已換回原本的版本" : "更新失敗，已保留原本的版本"}` : `「${j.name}」的哨站${j.from ? "已經是最新版" : "更新完成"} ✨`, !bad,
          bad ? (d.last.rolled ? "新版打不開，已換回原本的版本" : "沒更新成功，還是原本的版本") : ""]);
      }
    }
  }));
  if (window._reloading) return;
  const mark = () => done.forEach(([j, m, ok, why]) => upvSet(j, ok ? "done" : "fail", ok ? "" : why || m.replace(/^「[^」]*」(的哨站|的雲端硬碟)?/, "")));
  if (mine) { mark(); UPW.jobs = UPW.jobs.filter(j => !done.some(x => x[0] === j)); UPW.held.push(...done.filter(x => x[1]).map(x => [x[1], x[2]])); return upwReload(`哨站已更新到 ${mine} ✨`); }
  for (const j of UPW.jobs) if (Date.now() - j.t0 > 15 * 60000 && !done.some(x => x[0] === j)) done.push([j, `「${j.name}」${j.kind === "cloud" ? "的雲端硬碟" : "的哨站"}更新太久沒回應，請到主機上看看`, false]);
  if (done.length) {
    UPW.jobs = UPW.jobs.filter(j => !done.some(x => x[0] === j)); mark();
    UPW.held.push(...done.map(x => [x[1], x[2]]));
    const fx = UPW.wait.length && done.find(x => x[0].kind === "self" && x[0].node === UPW.first);
    if (fx && fx[2]) { const fail = [], w = UPW.wait; UPW.wait = []; await upwStart(w, fail); fail.forEach(f => UPW.held.push([f, false])); }   // 第一台沒問題：換其他台
    else if (fx) { UPW.held.push([`其他 ${UPW.wait.length} 台先不更新`, false]); UPW.wait.forEach(j => upvSet(j, "skip")); UPW.wait = []; }
    if (!UPW.jobs.length && !UPW.wait.length) {                         // 全部都有結果了：合成一則（進度視窗開著就看視窗，不另外跳）
      const bad = UPW.held.some(x => !x[1]);
      if (!UPV) { toast(upwSay(UPW.held), bad ? "bad" : "ok"); UPW.rows = []; }
      UPW.held = [];
    }
    upwSave(); upwPanel(); tick();                                      // 設定面板的版本號、齒輪上的紅點馬上跟著變
  }
  upwRun();
}
/* ═════════ 更新進度視窗：每一項一條波浪進度條，哨兵另外標出走到哪一步 ═════════ */
const UPST = ["wait", "dl", "inst", "boot", "done"];
/* 每一步的進度條範圍（%）和慢慢往前走的快慢（毫秒）：沒有真的百分比，只在這一步的範圍裡越走越慢，不會停住也不會跳 */
const UPRG = {self:{wait:[0, 0, 1], dl:[4, 26, 5000], inst:[26, 66, 14000], boot:[66, 93, 9000]}, cloud:{dl:[4, 90, 25000]}};
const UPLB = {wait:"等第一台好", dl:"下載新版", inst:"安裝中", boot:"重新啟動", done:"好了", fail:"沒更新成功", skip:"先不更新"};
const UPSTEP = [["dl", "下載"], ["inst", "安裝"], ["boot", "重新啟動"], ["done", "完成"]];
const upk = j => (j.node || "") + "|" + j.kind;
let UPV = null;
function upvPct(r){
  if (r.st === "done" || r.st === "fail") return 100;
  const g = (UPRG[r.kind] || UPRG.self)[r.st] || [r.p || 0, r.p || 0, 1], lo = Math.max(g[0], r.p0 || 0);
  return lo + (g[1] - lo) * (1 - Math.exp(-(Date.now() - r.t) / g[2]));
}
function upvSet(j, st, msg){
  const k = j.k || upk(j); let r = UPW.rows.find(x => x.k === k);
  if (!r) { const h = LIST.find(x => (x.node || "") === (j.node || "")) || {};
    UPW.rows.push(r = {k, name: j.name || h.name || "主機", kind: j.kind, st: "", t: Date.now(), p0: 0}); }
  if (r.st !== st) { r.p0 = r.st ? upvPct(r) : 0; if (st === "fail") r.prev = r.st; r.st = st; r.t = Date.now(); }
  if (msg !== undefined) r.msg = msg;
  upwSave(); upvPaint();
}
function upvOpen(){
  UPW.show = true; upwSave();
  if (UPV) return upvPaint();
  const v = UPV = document.createElement("div"); v.className = "veil upv";
  v.innerHTML = `<div class="dialog upd run"><div class="uorb" aria-hidden="true"><i class="ur"></i><i class="ub"></i><i class="uc"></i>
      <span class="ug a">${I("upd")}</span><span class="ug b">${I("chk")}</span><span class="ug c">${I("bang")}</span></div>
    <h3 aria-live="polite">更新中</h3><p class="ups"></p><div class="uplist"></div>
    <div class="btns"><button class="ubtn ghost" data-r>在背景更新</button></div></div>`;
  $("#layer").appendChild(v);
  v._esc = upvClose;
  v.addEventListener("click", e => { if (e.target === v || e.target.closest("[data-r]")) upvClose(); });
  upvPaint(); v._t = setInterval(upvPaint, 600);
  upwRun();
}
function upvClose(){
  const v = UPV; if (!v || window._reloading) return;
  UPV = null; clearInterval(v._t); v.classList.add("closing"); setTimeout(() => v.remove(), 360);
  UPW.show = false; if (!UPW.jobs.length && !UPW.wait.length) UPW.rows = [];
  upwSave(); upwRun();
}
function upvPaint(){
  const v = UPV; if (!v) return;
  const dlg = v.querySelector(".dialog"), list = v.querySelector(".uplist"), rows = UPW.rows;
  const live = UPW.jobs.length || UPW.wait.length || rows.some(r => !["done", "fail", "skip"].includes(r.st));
  const fails = rows.filter(r => r.st === "fail").length;
  const mode = live ? "run" : fails ? "bad" : "ok";
  if (!dlg.classList.contains(mode)) { dlg.classList.remove("run", "ok", "bad"); dlg.classList.add(mode); }
  txt(v.querySelector("h3"), {run:"更新中", ok:"更新好了", bad: fails < rows.length ? "有些沒更新成功" : "更新失敗"}[mode]);
  const p = v.querySelector(".ups"), say = window._reloading ? "換上新版中…" : "";
  if (p.textContent !== say) sayTo(p, say);
  const btn = v.querySelector("[data-r]");
  txt(btn, live ? "在背景更新" : "好"); btn.disabled = !!window._reloading;
  const keys = rows.map(r => r.k).join(",");
  if (list.dataset.keys !== keys) { list.dataset.keys = keys;
    swapHTML(list, rows.map(r => `<div class="upj" data-k="${esc(r.k)}"><div class="upt"><b>${esc(r.name)}</b><small>${r.kind === "cloud" ? "雲端硬碟" : "哨站"}</small><span class="upn"></span></div>
      ${wave(0, "")}${r.kind === "self" ? `<div class="upsteps">${UPSTEP.map(([k, l]) => `<span data-s="${k}">${l}</span>`).join("")}</div>` : ""}<div class="upm" hidden></div></div>`).join("")); }
  rows.forEach(r => {
    const el = list.querySelector(`[data-k="${CSS.escape(r.k)}"]`); if (!el) return;
    el.className = "upj s-" + r.st;
    txt(el.querySelector(".upn"), UPLB[r.st] || "");
    const p = upvPct(r), w = el.querySelector(".wv");
    w.style.setProperty("--v", p.toFixed(1) + "%");
    w.style.setProperty("--k", (r.st === "wait" ? 0 : Math.max(.02, Math.min(1, p / 100))).toFixed(3));
    w.classList.toggle("b", r.st === "fail");
    const bad = r.st === "fail", at = UPST.indexOf(bad ? r.prev : r.st);      // 失敗：停在出事的那一步，那一步標紅
    el.querySelectorAll(".upsteps span").forEach(s => { const i = UPST.indexOf(s.dataset.s);
      s.classList.toggle("on", at >= 0 && (i < at || r.st === "done")); s.classList.toggle("cur", i === at && !bad && r.st !== "done"); s.classList.toggle("x", i === at && bad); });
    const m = el.querySelector(".upm"); if (r.msg) txt(m, r.msg); reveal(m, !!r.msg);
  });
}
/* ═════════ Telegram 通知設定 ═════════ */
async function tgCall(body){
  const r = await api("/api/telegram", {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(body)});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || (r.status === 404 ? "這台主機還沒更新到新版" : "發生錯誤"));
  return d;
}
async function tgStatus(root){
  const el = root.querySelector(".tgst"); if (!el) return;
  try { const d = await tgCall({action:"status"}); RAWCACHE.tg = d;
    stSet(el, d.on ? "" : d.has_token ? "還沒選要傳到哪裡" : "還沒設定", !!d.on);
    el.classList.toggle("on", !!d.on);
  } catch(e) { txt(el, e.message); }
}
async function tgModal(){
  const st = RAWCACHE.tg || {};
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog tgd">${IC("bell","big")}<h3>Telegram 通知</h3>
    <p>主機有狀況時傳訊息給你</p>
    <div class="form">
      <label>① 機器人密碼<input class="field" data-k="token" autocomplete="off" spellcheck="false" placeholder="${st.has_token ? "已經設定過，不用改就留空" : "123456789:AAH…"}">
        <small>找 <b>@BotFather</b> 傳 <b>/newbot</b>，最後給你的那串就是</small></label>
      <div class="lbl">② 要傳到哪裡
        <small>先傳一句話給機器人（或在有它的群組講話），再按「自動尋找」</small>
        <button type="button" class="ubtn ghost find" data-find>${I("search")}自動尋找</button>
        <div class="chats"></div>
        <input class="field" data-k="chat" inputmode="text" autocomplete="off" placeholder="可以留空，會自動找" value="${esc(st.chat || "")}"></div>
      <div class="lbl">③ 通知保留多久
        <small>時間到自動刪掉，最多 2 天</small>
        <div class="seg keep" data-slide>${[[0,"不刪除"],[1,"1 小時"],[6,"6 小時"],[24,"1 天"],[47,"2 天"]].map(([h,l])=>`<button type="button" data-keep="${h}" class="${(+st.keep||0)===h?"on":""}">${l}</button>`).join("")}</div></div>
      <div class="msg" aria-live="polite"></div>
    </div>
    <div class="btns three"><button class="ubtn ghost" data-test>測試</button><button class="ubtn" data-save>儲存</button></div>
    <button class="linkbtn" data-off${st.on ? "" : " hidden"}>關閉 Telegram 通知</button></div>`;
  $("#layer").appendChild(v);
  const q = k => v.querySelector(`[data-k="${k}"]`), msg = v.querySelector(".msg");
  const say = (t, cls) => { sayTo(msg, t); msg.className = "msg " + (cls || ""); };
  const vals = () => ({token: q("token").value.trim(), chat: q("chat").value.trim(), keep: +((v.querySelector("[data-keep].on") || {}).dataset || {keep:0}).keep});
  let busy = false, dirty = false;
  tgCall({action:"status"}).then(d => {
    RAWCACHE.tg = d; if (v._d) return;
    q("token").placeholder = d.has_token ? "已經設定過，不用改就留空" : "123456789:AAH…";
    if (!dirty) {
      if (!q("chat").value && d.chat) q("chat").value = d.chat;
      v.querySelectorAll("[data-keep]").forEach(x => x.classList.toggle("on", +x.dataset.keep === (+d.keep || 0)));
    }
    const ob = v.querySelector("[data-off]"); if (ob) ob.hidden = !d.on;
  }, () => {});
  const run = async (btn, label, fn) => {
    if (busy) return; busy = true; const old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${label}`; say("");
    try { await fn(); } catch(e) { say(e.message, "bad"); }
    btn.disabled = false; btn.innerHTML = old; busy = false;
  };
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("click", e => {
      const t = e.target;
      if (t === v || t.closest("[data-r]")) return done();
      const f = t.closest("[data-find]");
      if (f) return run(f, "尋找中…", async () => {
        const d = await tgCall({action:"find", token: vals().token});
        const box = v.querySelector(".chats");
        swapHTML(box, d.chats.map(c => `<button type="button" data-chat="${esc(c.id)}">${esc(c.name)}</button>`).join(""));
        if (d.chats.length === 1) { q("chat").value = d.chats[0].id; box.firstChild.classList.add("on"); }
        say(d.chats.length > 1 ? `找到 ${d.chats.length} 個聊天，點一下要傳去哪裡` : `會傳到「${d.chats[0].name}」`, "ok");
      });
      const kp = t.closest("[data-keep]");
      if (kp) { dirty = true; slideSel(() => v.querySelectorAll("[data-keep]").forEach(x => x.classList.toggle("on", x === kp))); return; }
      const c = t.closest("[data-chat]");
      if (c) { dirty = true; q("chat").value = c.dataset.chat; v.querySelectorAll("[data-chat]").forEach(x => x.classList.toggle("on", x === c)); return say(""); }
      const tb = t.closest("[data-test]");
      if (tb) return run(tb, "傳送中…", async () => { const d = await tgCall({action:"test", ...vals()}); if (d.chat) q("chat").value = d.chat; say(d.message, "ok"); });
      const sb = t.closest("[data-save]");
      if (sb) return run(sb, "儲存中…", async () => { const d = await tgCall({action:"save", ...vals()}); toast(d.message); done(); });
      const ob = t.closest("[data-off]");
      if (ob) return run(ob, "關閉中…", async () => { const d = await tgCall({action:"save", off:true}); toast(d.message); done(); });
    });
    q("chat").addEventListener("input", () => { dirty = true; v.querySelectorAll("[data-chat]").forEach(x => x.classList.remove("on")); });
  });
}
/* ═════════ OpenSky 帳號（機場起降：高雄、台中的飛機靠它補） ═════════ */
async function skyCall(body){
  const r = await api("/api/opensky", {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(body)});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || (r.status === 404 ? "這台主機還沒更新到新版" : "發生錯誤"));
  return d;
}
const skyLine = d => d.on ? d.err ? d.err : d.out ? `今天的次數用完了，${flyHM(d.out * 1000)} 恢復` : d.left != null ? `已設定・今天還能查 ${d.left.toLocaleString()} 次` : "已設定"
  : d.out ? `今天的次數用完了，${flyHM(d.out * 1000)} 恢復` : "還沒設定";
async function skyStatus(root){
  const el = root.querySelector(".skyst"); if (!el) return;
  try { const d = await skyCall({action:"status"}), s = skyLine(d), on = !!d.on && !d.err;
    RAWCACHE.sky = d; STCACHE.skyst = {t: s, b: false, on}; txt(el, s); el.classList.toggle("on", on); }
  catch(e) { txt(el, e.message); }
}
async function skyModal(){
  const st = RAWCACHE.sky || {};
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog skyd">${IC("sky","big")}<h3>OpenSky 帳號</h3>
    <p>填了每天可以查 4000 次（沒填 400 次）</p>
    <div class="form">
      <button type="button" class="ubtn ghost find" data-file>${I("archive")}選帳號檔（credentials.json）</button>
      <input type="file" accept=".json,application/json" hidden>
      <label>client_id<input class="field" data-k="id" autocomplete="off" spellcheck="false" value="${esc(st.id || "")}"></label>
      <label>client_secret<input class="field" data-k="secret" type="password" autocomplete="off" spellcheck="false" placeholder="${st.on ? "已經設定過" : ""}"></label>
      <div class="msg" aria-live="polite"></div>
    </div>
    <div class="btns"><button class="ubtn" data-save>儲存</button></div>
    <button class="linkbtn" data-off${st.on ? "" : " hidden"}>移除帳號</button></div>`;
  $("#layer").appendChild(v);
  const q = k => v.querySelector(`[data-k="${k}"]`), msg = v.querySelector(".msg"), file = v.querySelector("input[type=file]");
  skyCall({action:"status"}).then(d => {
    RAWCACHE.sky = d; if (v._d) return;
    if (!q("id").value && d.id) q("id").value = d.id;
    q("secret").placeholder = d.on ? "已經設定過" : "";
    const ob = v.querySelector("[data-off]"); if (ob) ob.hidden = !d.on;
  }, () => {});
  const say = (t, cls) => { sayTo(msg, t); msg.className = "msg " + (cls || ""); };
  const fill = text => {                     // 貼上或選了整個帳號檔：自動拆成兩格
    try { const j = JSON.parse(text); if (j && (j.clientId || j.client_id)) { q("id").value = j.clientId || j.client_id; q("secret").value = j.clientSecret || j.client_secret || ""; say(""); return true; } } catch(e) {}
    return false;
  };
  q("id").addEventListener("paste", e => { const t = (e.clipboardData || {}).getData ? e.clipboardData.getData("text") : ""; if (fill(t)) e.preventDefault(); });
  file.addEventListener("change", async () => { const f = file.files[0]; if (!f) return; if (!fill(await f.text())) say("這不是 OpenSky 的帳號檔", "bad"); file.value = ""; });
  let busy = false;
  const run = async (btn, label, fn) => {
    if (busy) return; busy = true; const old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${label}`; say("");
    try { await fn(); } catch(e) { say(e.message, "bad"); }
    btn.disabled = false; btn.innerHTML = old; busy = false;
  };
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("click", e => {
      const t = e.target;
      if (t === v || t.closest("[data-r]")) return done();
      if (t.closest("[data-file]")) return file.click();
      const sb = t.closest("[data-save]");
      if (sb) return run(sb, "登入中…", async () => {
        if (st.on && !q("secret").value.trim() && q("id").value.trim() === st.id) return done();
        await skyCall({action:"save", id:q("id").value.trim(), secret:q("secret").value.trim()}); toast("OpenSky 帳號已設定"); done();
      });
      const ob = t.closest("[data-off]");
      if (ob) return run(ob, "移除中…", async () => { await skyCall({action:"off"}); toast("已移除 OpenSky 帳號"); done(); });
    });
  });
}
/* 換密碼：換好後顯示新密碼給你複製，這台裝置會自動改用新密碼 */
async function newToken(node, label){
  const ok = await modal({icon:"key", cls:"warn", title:`換掉「${label}」的密碼？`,
    text:"其他裝置都會登出，要用新密碼重新登入。", ok:"換新密碼"});
  if (!ok) return;
  let d = {};
  try {
    const r = await api("/api/token?node=" + encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok()}});
    d = await r.json().catch(() => ({}));
    if (r.status === 404) return toast("那台主機還沒更新到新版，先更新再換密碼", "bad");
    if (!r.ok || !d.ok || !d.token) return toast(d.message || "換密碼失敗", "bad");
  } catch(e) { return toast("連線失敗，請稍後再試", "bad"); }
  if (!node) {
    setTok(d.sess || d.token);
    if (LIST.some(x => !x.node && x.cloud))          // 這台裝置的雲端硬碟通行證也換新
      fetch("/api/cloud-login", {method:"POST", headers:{"X-Token":getTok()}}).catch(() => {});
  }
  const cp = await modal({icon:"ok", cls:"theme", title:"已換成新密碼", input:d.token, ok:"複製密碼",
    text: node ? "這邊已記住新密碼。直接打開那台時，用新密碼登入。"
               : "請記下新密碼，其他裝置要用它重新登入。"});
  if (cp) {
    try { await navigator.clipboard.writeText(d.token); toast("已複製新密碼"); }
    catch(e) { toast("沒辦法自動複製，請手動選取密碼複製", "bad"); }
  }
}
function restart(){ clearTimeout(timer); timer = setTimeout(tick, (PREF.refresh || 5) * 1000); }
addEventListener("keydown", e => { if (e.key === "Escape") { const v = [...document.querySelectorAll("#layer .veil")].pop(); if (v && v._esc) v._esc(); } });
/* 可取消的對話框提供關閉按鈕與 Esc
   打開時記一筆瀏覽紀錄，返回手勢先關最上面的視窗，不會整頁退出（機場起降、主機細節也一樣） */
let DLGN = 0, DLGSKIP = 0;
new MutationObserver(ms => { for (const m of ms) {
  for (const v of m.addedNodes) {
    const d = v.classList && v.classList.contains("veil") && v.querySelector(".dialog"); if (!d) continue;
    if (typeof v._esc === "function" && !v.classList.contains("upv") && !v.classList.contains("stay") && !d.querySelector(".dx")) {
      d.insertAdjacentHTML("afterbegin", `<button type="button" class="dx" aria-label="關閉">${I("x")}</button>`);
      d.firstChild.addEventListener("click", e => { e.stopPropagation(); if (v._esc) v._esc(); });
    }
    histMark(v);
    d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true");
    const title = d.querySelector("h3");
    if (title) { if (!title.id) title.id = "dlg-title-" + v._dlg; d.setAttribute("aria-labelledby", title.id); }
    d.tabIndex = -1;
    v._opener = document.activeElement;
    if (!d.contains(document.activeElement)) d.focus({preventScroll:true});
  }
  for (const v of m.removedNodes) {
    histDrop(v);
    if (document.activeElement === document.body && v._opener?.isConnected) v._opener.focus({preventScroll:true});
  }
} }).observe($("#layer"), {childList:true});
document.addEventListener("keydown", e => {
  if (e.key !== "Tab") return;
  const d = [...document.querySelectorAll("#layer .veil .dialog")].pop();
  if (!d) return;
  const controls = [...d.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')]
    .filter(el => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length);
  const first = controls[0], last = controls[controls.length - 1], active = document.activeElement;
  if (!first || !d.contains(active) || (e.shiftKey ? active === first || active === d : active === last)) {
    e.preventDefault(); (e.shiftKey ? last || d : first || d).focus();
  }
});
const DLGEL = new Map();
const histLive = el => el && (el === window._menu || (el.classList.contains("veil") && !el._d && !el.classList.contains("closing") && el.isConnected));
function histMark(el){                         // 上一個正在關（例如選單點了就換成對話框）：沿用那一筆，不多一格
  const st = history.state || {}, cur = st.dlg;
  el._dlg = ++DLGN; DLGEL.set(el._dlg, el);
  if (cur && !histLive(DLGEL.get(cur))) { DLGEL.delete(cur); history.replaceState({...st, dlg: el._dlg}, ""); }
  else history.pushState({...st, dlg: el._dlg}, "");
}
function histDrop(el){ DLGEL.delete(el._dlg); if (el._dlg && !el._popped && history.state && history.state.dlg === el._dlg) { DLGSKIP++; history.back(); } }
addEventListener("popstate", () => {
  if (DLGSKIP) { DLGSKIP--; return; }
  const at = (history.state && history.state.dlg) || 0, mn = window._menu;
  if (mn && mn._dlg > at) { mn._popped = 1; return closeMenu(); }
  const top = [...document.querySelectorAll("#layer .veil")].filter(v => v._dlg && !v._d && !v._popped).pop();
  if (top && top._dlg > at) { top._popped = 1; if (top._esc) top._esc(); }
  else if (at && !(mn && mn._dlg === at) && ![...document.querySelectorAll("#layer .veil")].some(v => v._dlg === at)) { DLGSKIP++; history.back(); }   // 這筆的視窗早就關了：再退一格
});

/* ═════════ 手機金鑰登入：用指紋、臉部辨識代替輸入密碼（要用 https 網址打開才能用） ═════════ */
const PK_OK = !!(window.PublicKeyCredential && window.isSecureContext && navigator.credentials);
const ub = s => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const bu = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const isPhone = () => /iPhone|iPad|Android/.test(navigator.userAgent);
async function pkCall(path, body, auth){
  const r = await api(path, {method:"POST", headers:{...(auth ? {"X-Token":getTok()} : {}), "Content-Type":"application/json"}, body:JSON.stringify(body)});
  const d = await r.json().catch(() => ({}));
  if (r.status === 404) throw new Error("主機還沒更新到新版，先更新再試");
  return d;
}
const pkErr = e => e && e.name === "InvalidStateError" ? `這${isPhone() ? "支手機" : "台裝置"}已經登記過了`
  : e && e.name === "NotAllowedError" ? "已取消，或等太久了" : e && e.name === "SecurityError" ? "網址不符，請用平常的網域網址打開哨站"
  : e && (e.name === "NotSupportedError" || e.name === "ConstraintError") ? `這${isPhone() ? "支手機" : "台裝置"}不支援手機金鑰，可以改用 PIN 碼`
  : e instanceof DOMException ? "沒有完成，請再試一次"                // 瀏覽器其他的錯誤訊息都是英文，不直接顯示
  : (e && e.message) || "失敗了，請再試一次";
/* 裝置的詳細型號：Chrome、Edge 可以問到手機型號、Windows／macOS 版本（Safari 問不到 iPhone 型號，只寫 iOS 幾） */
let DEVH = {};
const DEVP = (async () => { try { DEVH = (await Promise.race([navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"]), new Promise(r => setTimeout(r, T.long))])) || {}; } catch(e) {} })();
function devOs(){
  const u = navigator.userAgent;
  return /iPhone|iPad/.test(u) || (/Mac/.test(u) && navigator.maxTouchPoints > 1) ? "ios" : /Android/.test(u) ? "android"
    : /Mac/.test(u) ? "mac" : /Windows/.test(u) ? "win" : /Linux|CrOS/.test(u) ? "linux" : "";
}
/* 相簿「看過的設備」：名字寫型號（朋友那頁送來的 i.m），下面一行系統・瀏覽器・螢幕 */
function almDv(d){
  const i = d.i || {}, [n0, b0] = String(d.n || "").split("・"), m = devModel(i.m) || n0 || "裝置";
  return [d.nm ? `${d.nm}・${m}` : m, [i.os, i.br || b0, i.sc].filter(Boolean).join("・")];
}
function almIcon(d){                       // 看過的設備照系統放圖示（iPhone、iPad、Mac 蘋果，安卓、Windows 各自的）
  const i = d.i || {}, o = String(i.os || ""), n = `${i.m || ""} ${d.n || ""}`;
  const os = /^iOS|iPadOS/.test(o) || /iPhone|iPad/.test(n) ? "ios" : /^macOS/.test(o) || /Mac/.test(n) ? "mac" : /^Android/.test(o) || /Android|SM-|Pixel/.test(n) ? "android" : /^Windows/.test(o) || /Windows/.test(n) ? "win" : "";
  return devIcon({os, dev:""});
}
function devModel(m){                       // 型號代碼換成看得懂的名字（三星 S、Z 系列換成第幾代）
  m = String(m || "").replace(/\s*Build\/.*$/, "").trim();
  if (!m || m === "K") return "";
  if (/^iPhone\b/.test(m)) return "iPhone";                  // 以前照螢幕大小猜的「iPhone 14 Pro Max～16 Plus」不準，一律只寫 iPhone
  let g;
  if ((g = /^SM-S9(\d)(\d)/.exec(m))) return `Samsung Galaxy S${22 + +g[1]}${{6:"+", 7:" Edge", 8:" Ultra"}[g[2]] || ""}`;
  if ((g = /^SM-F9(\d)/.exec(m))) return `Samsung Galaxy Z Fold${+g[1] + 1}`;
  if ((g = /^SM-F7(\d)/.exec(m))) return `Samsung Galaxy Z Flip${+g[1] + 2}`;
  if (/^SM-/.test(m)) return "Samsung Galaxy " + m.slice(3);
  if (/^Pixel/.test(m)) return "Google " + m;
  if (/^CPH\d/.test(m)) return "OPPO " + m;
  if (/^RMX\d/.test(m)) return "realme " + m;
  if (/^V2\d{3}/.test(m)) return "vivo " + m;
  if (/^XQ-/.test(m)) return "Sony Xperia " + m.slice(3);
  if (/^moto/i.test(m)) return "Motorola " + m.replace(/^motorola\s*/i, "");
  return m;
}
/* iOS 幾：iOS 26 起系統版本固定寫 18_6，Safari 看 Version/ 那個數字；其他 App、瀏覽器只有凍住的 18_6 就不寫（寫了會錯） */
function iosVer(u){
  const sv = +((/Version\/(\d+)/.exec(u) || [])[1] || 0), v = /OS (\d+)[_.](\d+)/.exec(u);
  if (sv >= 26) return String(sv);
  if (!v) return "";
  if (+v[1] === 18 && +v[2] >= 6 && sv !== 18) return "";
  return +v[1] >= 18 ? v[1] : `${v[1]}.${v[2]}`;
}
function devName(){
  const u = navigator.userAgent, os = devOs(), pf = (navigator.userAgentData || {}).platform || "";
  const ver = (os === "mac" && pf === "macOS") || (os === "win" && pf === "Windows") ? parseInt(DEVH.platformVersion || "", 10) : 0;   // 只信系統對得上的版本
  if (os === "ios") { const v = iosVer(u); return (/iPhone/.test(u) ? "iPhone" : "iPad") + (v ? `（iOS ${v}）` : ""); }
  if (os === "android") return devModel(DEVH.model) || devModel((/Android [\d.]+; ([^;)]+)/.exec(u) || [])[1]) || "Android 手機";
  if (os === "mac") return ver >= 11 ? `Mac（macOS ${ver}）` : "Mac";   // 10 是凍住的假數字
  if (os === "win") return ver ? `Windows ${ver >= 13 ? 11 : 10} 電腦` : "Windows 電腦";
  return os === "linux" ? (/CrOS/.test(u) ? "Chromebook" : "Linux 電腦") : "我的裝置";
}
/* 瀏覽器：照順序比對（App 裡打開的、各家手機內建的先，Chrome／Safari 最後） */
const BRW = [[/Line\//, "LINE"], [/Instagram/, "Instagram"], [/FBAN|FB_IAB/, "Facebook"], [/MicroMessenger/, "微信"], [/Barcelona/, "Threads"],
  [/musical_ly|BytedanceWebview|aweme/i, "抖音／TikTok"], [/Telegram/i, "Telegram"], [/ GSA\/(\d+)/, "Google App"], [/Edg(?:A|iOS)?\/(\d+)/, "Edge"],
  [/(?:OPR|OPT|OPX)\/(\d+)/, "Opera"], [/Vivaldi\/(\d+)/, "Vivaldi"], [/YaBrowser\/(\d+)/, "Yandex"], [/(?:DuckDuckGo|Ddg)\/(\d+)/, "DuckDuckGo"],
  [/SamsungBrowser\/(\d+)/, "三星瀏覽器"], [/HuaweiBrowser\/(\d+)/, "華為瀏覽器"], [/MiuiBrowser\/(\d+)/, "小米瀏覽器"], [/HeyTapBrowser\/(\d+)/, "OPPO 瀏覽器"],
  [/VivoBrowser\/(\d+)/, "vivo 瀏覽器"], [/UCBrowser\/(\d+)/, "UC 瀏覽器"], [/QQBrowser\/(\d+)/, "QQ 瀏覽器"], [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"]];
function brwOf(u, ud){                       // 回 [名字, 版本]；Brave、Edge、Opera 的辨識字可能跟 Chrome 一樣，再看 userAgentData
  for (const [re, n] of BRW) { const m = re.exec(u); if (m) return [n, m[1] || ""]; }
  const b = ((ud || {}).brands || []).find(x => /Edge|Opera|Brave|Vivaldi/.test(x.brand));
  if (b) return [b.brand.replace("Microsoft ", ""), b.version || ""];
  if (navigator.brave) return ["Brave", ""];
  const c = /(?:CriOS|Chrome)\/(\d+)/.exec(u); if (c) return ["Chrome", c[1]];
  return /Safari/.test(u) ? ["Safari", ""] : ["", ""];
}
/* 登入的裝置清單上的名字：裝置＋瀏覽器 */
function devLabel(){
  const b = brwOf(navigator.userAgent, navigator.userAgentData)[0];
  return devName() + (b ? "・" + b : "");
}
/* 廠商圖示：蘋果、安卓、Windows（舊的登入沒有記系統，照名字猜） */
const DEVI = {
  ios:'<path d="M16.4 12.7c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9s-2-.9-3.3-.8c-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1.1-2.8-4.2zM14 5.2c.7-.8 1.2-2 1-3.2-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.9-1.1 3 1.1.1 2.3-.5 3-1.3z"/>',
  android:'<path fill-rule="evenodd" d="M3.5 18a8.5 8.5 0 0 1 17 0zM8.6 13.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm6.8 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/><path d="M7.4 10.6 5.6 7.6m11 3 1.8-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  win:'<path d="M3 5.6 10.4 4.6v6.9H3zM11.6 4.4 21 3v8.5h-9.4zM3 12.7h7.4v6.9L3 18.6zM11.6 12.7H21V21l-9.4-1.3z"/>'};
DEVI.mac = DEVI.ios;
function devRow(x){                         // 名字只放裝置，系統版本、瀏覽器、多久前用過放下面那行
  const [n, b] = String(x.dev).split("・"), m = /^(.*?)（(.+)）$/.exec(n);
  return `${esc(m ? m[1] : n)}<small>${[m && m[2], b, x.me ? "" : ago(x.seen)].filter(Boolean).map(esc).join("・")}</small>`;
}
function devIcon(x){
  const os = x.os || (/iPhone|iPad/.test(x.dev) ? "ios" : /Mac/.test(x.dev) ? "mac" : /Windows/.test(x.dev) ? "win" : /Android|Samsung|Google|OPPO|realme|vivo|Sony|Motorola/.test(x.dev) ? "android" : "");
  return `<i class="dvi ${os || "etc"}" aria-hidden="true">${DEVI[os] ? `<svg viewBox="0 0 24 24" fill="currentColor">${DEVI[os]}</svg>` : I("devices")}</i>`;
}
async function pkRegister(name){
  const b = await pkCall("/api/passkey", {action:"begin"}, 1);
  if (!b.ok) throw new Error(b.message || "沒辦法開始登記");
  const c = await navigator.credentials.create({publicKey:{
    challenge:ub(b.challenge), rp:{id:b.rp, name:"哨站"},
    user:{id:ub(b.user), name:`哨站（${b.name}）`, displayName:`哨站（${b.name}）`},
    pubKeyCredParams:[{type:"public-key", alg:-7}, {type:"public-key", alg:-257}], timeout:120000, attestation:"none",
    authenticatorSelection:{residentKey:"required", requireResidentKey:true, userVerification:"required"},
    excludeCredentials:(b.exclude || []).map(id => ({type:"public-key", id:ub(id)}))}});
  const d = await pkCall("/api/passkey", {action:"finish", name, clientDataJSON:bu(c.response.clientDataJSON),
    attestationObject:bu(c.response.attestationObject)}, 1);
  if (!d.ok) throw new Error(d.message || "登記失敗");
  return d;
}
async function pkLogin(){
  const b = await pkCall("/api/passkey-login", {action:"begin"});
  if (!b.challenge) throw new Error("主機還沒更新到新版");
  const c = await navigator.credentials.get({publicKey:{challenge:ub(b.challenge), rpId:b.rp, timeout:120000, userVerification:"required"}});
  const d = await pkCall("/api/passkey-login", {action:"finish", id:bu(c.rawId), clientDataJSON:bu(c.response.clientDataJSON),
    authenticatorData:bu(c.response.authenticatorData), signature:bu(c.response.signature), keep:REM, dev:devLabel(), os:devOs()});
  if (!d.ok || !d.token) throw new Error(d.message || "登入失敗");
  return d.token;
}
async function pkStatus(root){
  const el = root.querySelector(".pkst"); if (!el) return;
  try { const d = await pkCall("/api/passkey", {action:"list"}, 1); RAWCACHE.pk = d;
    stSet(el, d.keys && d.keys.length ? "" : "還沒登記", d.keys && d.keys.length);
    el.classList.toggle("on", !!(d.keys && d.keys.length));
  } catch(e) { txt(el, e.message); }
}
async function pkModal(){
  const v = document.createElement("div"); v.className = "veil";
  const me = isPhone() ? "這支手機" : "這台裝置";
  v.innerHTML = `<div class="dialog pkd">${IC("finger","big")}<h3>手機金鑰登入</h3>
    <p>用指紋或臉部辨識登入</p>
    <div class="form"><div class="pklist"></div>
      <label class="pkadd">幫${me}取個名字<input class="field" data-k="name" maxlength="20" value="${esc(devName())}">
        <small>最多 5 支，換密碼也照樣能用</small></label>
      <div class="msg"></div></div>
    <div class="btns"><button class="ubtn" data-add>登記${me}</button></div></div>`;
  const list = v.querySelector(".pklist"), msg = v.querySelector(".msg"), add = v.querySelector("[data-add]"), lab = v.querySelector(".pkadd");
  const day = t => { const d = new Date(t * 1000); return `${d.getMonth()+1}/${d.getDate()}`; };
  let keys = (RAWCACHE.pk && RAWCACHE.pk.keys) || [], max = (RAWCACHE.pk && RAWCACHE.pk.max) || 5, busy = false;
  const draw = init => {
    const h = keys.map(k => `<div class="pkrow"><span>${esc(k.name)}<small>${day(k.added)} 登記${k.used ? `・${day(k.used)} 用過` : "・還沒用過"}</small></span>
      <button type="button" class="iconbtn" data-del="${esc(k.id)}" data-name="${esc(k.name)}" title="刪掉這支">${I("x")}</button></div>`).join("");
    if (init) list.innerHTML = h; else swapHTML(list, h);
    const full = keys.length >= max;
    lab.style.display = full ? "none" : "";
    add.disabled = full; add.textContent = full ? `已經登記滿 ${max} 支` : `登記${me}`;
  };
  if (RAWCACHE.pk) draw(true);
  $("#layer").appendChild(v);
  pkCall("/api/passkey", {action:"list"}, 1).then(d => { RAWCACHE.pk = d; if (v._d) return; keys = d.keys || []; max = d.max || 5; draw(); }, e => { if (!v._d) { msg.className = "msg bad"; msg.textContent = e.message; } });
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      if (busy) return;
      const del = e.target.closest("[data-del]");
      if (del) {
        if (!await modal({icon:"finger", cls:"bad", title:`刪掉「${del.dataset.name}」？`, text:"刪掉之後，它就不能再用指紋或臉部辨識登入哨站。", ok:"刪除"})) return;
        busy = true;
        const d = await pkCall("/api/passkey", {action:"delete", id:del.dataset.del}, 1).catch(err => ({message:err.message}));
        busy = false;
        if (d.ok) { RAWCACHE.pk = d; keys = d.keys || []; draw(); toast(d.message); } else toast(d.message || "刪除失敗", "bad");
        return;
      }
      if (!e.target.closest("[data-add]")) return;
      busy = true; add.disabled = true; add.innerHTML = `<span class="spin"></span>請在${me}上確認…`; msg.className = "msg"; msg.textContent = "";
      try {
        const d = await pkRegister(v.querySelector('[data-k="name"]').value.trim());
        RAWCACHE.pk = d; keys = d.keys || []; store("vps-pk", "1"); toast(d.message);
      } catch(err) { msg.className = "msg bad"; msg.textContent = pkErr(err); }
      busy = false; draw();
    });
  });
}

/* 設定列表的狀態：設好了只在右邊放一個勾或數字，還沒設好（要你動手）才寫字 */
function stSet(el, t, b){
  const k = [...el.classList].find(c => /st$/.test(c));
  if (k) STCACHE[k] = {t, b: b || false, on: !!b};
  const li = el.closest(".li"); txt(el, t);
  let g = li && li.querySelector(".stb");
  if (!g) return;
  // 記住上次放的是什麼（瀏覽器存的勾勾圖形寫法跟 I("check") 不一樣，比 innerHTML 永遠不同，切換主機時勾勾會重播一次）
  const v = !b ? "" : b === true ? "✓" : String(b), h = b === true ? I("check") : v;
  if (g.dataset.v !== v) { g.dataset.v = v; g.innerHTML = h; g.className = "stb" + (typeof b === "number" ? " n" : ""); if (canAnim() && h) g.animate([{opacity:0, transform:"scale(.6)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:SPRING}); }
  g.hidden = !b;
}
/* ═════════ 登入的裝置：每台裝置登入後拿到自己的鑰匙，可以單獨登出一台 ═════════ */
const sessCall = body => pkCall("/api/sessions", body, 1);
async function sessStatus(root){
  const el = root.querySelector(".sessst"); if (!el) return;
  try { const d = await sessCall({action:"list"}); RAWCACHE.sess = d; stSet(el, "", (d.list || []).length || 1); }
  catch(e) { txt(el, e.message); }
}
async function sessModal(){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog pkd">${IC("devices","big")}<h3>登入的裝置</h3>
    <div class="form"><div class="pklist"></div><div class="msg"></div></div>
    </div>`;
  const list = v.querySelector(".pklist"), msg = v.querySelector(".msg");
  let rows = (RAWCACHE.sess && RAWCACHE.sess.list) || [], busy = false;
  const draw = init => {
    const h = rows.map(x => `<div class="pkrow dvrow">${devIcon(x)}<span>${devRow(x)}</span>
      ${x.me ? `<span class="dvme">這台</span>` : `<button type="button" class="iconbtn" data-del="${esc(x.id)}" data-name="${esc(x.dev)}" title="登出這台">${I("x")}</button>`}</div>`).join("");
    if (init) list.innerHTML = h; else swapHTML(list, h);
  };
  if (RAWCACHE.sess) draw(true);
  $("#layer").appendChild(v);
  sessCall({action:"list", dev:devLabel(), os:devOs()}).then(d => { RAWCACHE.sess = d; if (v._d) return; rows = d.list || []; draw(); }, e => { if (!v._d) { msg.className = "msg bad"; msg.textContent = e.message; } });
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      const del = e.target.closest("[data-del]");
      if (!del || busy) return;
      if (!await modal({icon:"logout", cls:"bad", title:`登出「${del.dataset.name}」？`, text:"那台要重新登入才能再用。", ok:"登出"})) return;
      busy = true;
      const d = await sessCall({action:"del", id:del.dataset.del}).catch(err => ({message:err.message}));
      busy = false;
      if (d.ok) { RAWCACHE.sess = d; rows = d.list || []; draw(); toast(`已登出「${del.dataset.name}」`); } else toast(d.message || "登出失敗", "bad");
    });
  });
}

/* 要驗證是你本人：打亂的 PIN 碼鍵盤（主要），旁邊可以改用手機金鑰或密碼
   send(憑證) 送去主機：PIN 碼是 {pin:{nonce, proof}}、手機金鑰是簽好的資料、密碼是 {pw}；回傳主機的回覆（ok 才關），取消回傳 null */
function pinAsk({title, sub = "", icon = "pin", pin = true, passkey = false, pw = true, begin, send}){
  begin = begin || (() => pkCall("/api/pin-login", {action:"begin"}));
  return new Promise(res => {
    const v = document.createElement("div"); v.className = "veil";
    const alt = [passkey && !pin ? `<button class="linkish" data-ppk>用手機金鑰</button>` : "", pw && pin ? `<button class="linkish" data-ppw>改用密碼</button>` : ""].join("");   // 有數字鍵盤時手機金鑰是鍵盤左下那顆
    v.innerHTML = `<div class="dialog pindlg2">${IC(icon, "big")}<h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ""}
      <div class="ppbox"${pin ? "" : " hidden"}></div>
      <div class="form ppw"${pin ? " hidden" : ""}><input class="field" type="password" placeholder="存取密碼" autocomplete="current-password"></div>
      <div class="msg"></div>${alt ? `<div class="pplinks">${alt}</div>` : ""}
      <div class="btns"><button class="ubtn" data-ppgo>確定</button></div></div>`;
    $("#layer").appendChild(v);
    const msg = v.querySelector(".msg"), box = v.querySelector(".ppbox"), pwf = v.querySelector(".ppw"), inp = pwf.querySelector("input"), okb = v.querySelector("[data-ppgo]");
    let out = null, busy = false, pwMode = !pin;
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(out); }, 360); };
    v._esc = done;
    const say = t => { msg.className = "msg bad"; sayTo(msg, t); };
    const tryIt = async (mk, onBad) => {
      if (busy) return; busy = true; pad && pad.busy(true); okb.disabled = true; sayTo(msg, "");
      let d;
      try { d = await send(await mk()); } catch(e) { d = {message: e.name === "NotAllowedError" || e.name === "AbortError" ? "" : e.message}; }
      busy = false; pad && pad.busy(false); if (pwMode) okb.disabled = false;
      if (d && d.ok) { out = d; return done(); }
      if (d && d.message) say(d.message);
      onBad && onBad();
    };
    const usePk = () => tryIt(async () => {
      const b = await pkCall("/api/passkey-login", {action:"begin"});
      const c = await navigator.credentials.get({publicKey:{challenge:ub(b.challenge), rpId:b.rp, timeout:120000, userVerification:"required"}});
      return {id:bu(c.rawId), clientDataJSON:bu(c.response.clientDataJSON), authenticatorData:bu(c.response.authenticatorData), signature:bu(c.response.signature)};
    });
    const pad = pin ? pinPad(box, {okBtn: okb, left: passkey ? {html: I("finger"), label: "用手機金鑰", on: usePk} : null,
      ok: p => tryIt(() => pinProof(p, begin).then(x => ({pin: x})), () => pad.again())}) : null;
    if (!pin) setTimeout(() => inp.focus(), 60);
    const pwGo = () => { const x = inp.value.trim(); if (!x) return inp.focus(); tryIt(async () => ({pw: x}), () => inp.select()); };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); pwGo(); } });
    v.addEventListener("click", e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      if (e.target.closest("[data-ppgo]") && pwMode) return pwGo();
      if (e.target.closest("[data-ppw]")) { pwMode = true; okb.disabled = false; reveal(box, false); e.target.closest(".pplinks").remove(); reveal(pwf, true); return setTimeout(() => inp.focus(), 60); }
      if (e.target.closest("[data-ppk]")) return usePk();
    });
  });
}
/* 再確認一次是你：有 PIN 碼用鍵盤，有手機金鑰可以用金鑰，不然打密碼；確認過 5 分鐘內不用再問 */
async function recheckAsk(go){
  const has = await pkCall("/api/passkey-login", {action:"has"}).catch(() => ({}));
  const out = await pinAsk({title: "先確認是你", sub: has.pin ? "輸入現在的 PIN 碼" : "", icon: "key", pin: !!has.pin, passkey: PK_OK && !!has.has,
    send: async a => {
      const r = await go(a);
      if (r.status === 403) { const d = await r.clone().json().catch(() => ({})); if (d.recheck) return {message: d.message}; }
      return {ok: true, r};
    }});
  return out && out.r;
}
/* ═════════ PIN 碼登入：4～8 位數字，連續輸錯 5 次暫停 15 分鐘，累計 10 次自動關閉 ═════════ */
const pinCall = body => pkCall("/api/pin", body, 1);
async function pinStatus(root){
  const el = root.querySelector(".pinst"); if (!el) return;
  try { const d = await pinCall({action:"status"});
    RAWCACHE.pin = d;
    stSet(el, !d.on ? "還沒設定" : d.locked ? `輸錯太多次，暫停中（還有 ${Math.ceil(d.locked / 60)} 分鐘）` : "", !!(d.on && !d.locked));
    el.classList.toggle("on", !!d.on && !d.locked);
  } catch(e) { txt(el, e.message); }
}
/* force：還在用安裝時給的臨時 PIN 碼，換好才能用（關不掉、沒有「關閉 PIN 碼」） */
function pinModal(force){
  const st = RAWCACHE.pin || {};
  const v = document.createElement("div"); v.className = "veil" + (force ? " stay" : "");
  v.innerHTML = `<div class="dialog pindlg2">${IC("pin","big")}<h3>${force ? "換掉臨時 PIN 碼" : st.on ? "換一組 PIN 碼" : "設定 PIN 碼"}</h3>
    <p data-t>輸入 4～8 位數字</p><div class="ppbox"></div><div class="msg"></div>
    <div class="btns">${!force ? `<button class="ubtn ghost" data-off${st.on ? "" : " hidden"}>關閉 PIN 碼</button>` : ""}<button class="ubtn" data-ppgo>確定</button></div></div>`;
  $("#layer").appendChild(v);
  const msg = v.querySelector(".msg"), tip = v.querySelector("[data-t]");
  pinCall({action:"status"}).then(d => {
    RAWCACHE.pin = d;
    if (v._d || force) return;
    txt(v.querySelector("h3"), d.on ? "換一組 PIN 碼" : "設定 PIN 碼");
    const ob = v.querySelector("[data-off]"); if (ob) ob.hidden = !d.on;
  }, () => {});
  return new Promise(res => {
    let busy = false, first = "";
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    if (!force) v._esc = done;
    const bad = t => { msg.className = "msg bad"; sayTo(msg, t); };
    const pad = pinPad(v.querySelector(".ppbox"), {okBtn: v.querySelector("[data-ppgo]"), ok: async p => {      // 先輸入一次，鍵盤重新打亂再輸入一次；PIN 碼在這裡算好雜湊才送出
      if (!first) {
        if (pinWeak(p)) { bad("這組太好猜了，換一組吧"); return pad.again(); }
        first = p; sayTo(msg, ""); txt(tip, "再輸入一次"); return pad.again();
      }
      if (p !== first) { first = ""; txt(tip, "輸入 4～8 位數字"); bad("兩次輸入的不一樣，請重新輸入"); return pad.again(); }
      busy = true; pad.busy(true);
      const d = await pinMake(p).then(x => pinCall({action:"set", pin:x})).catch(e => ({message:e.message}));
      busy = false; pad.busy(false);
      if (d.ok) { RAWCACHE.pin = {on:true, locked:0}; toast(d.message); done(); } else { first = ""; txt(tip, "輸入 4～8 位數字"); bad(d.message || "設定失敗"); pad.again(); }
    }});
    v.addEventListener("click", async e => {
      if (!force && (e.target === v || e.target.closest("[data-r]"))) return done();
      if (busy) return;
      if (e.target.closest("[data-off]")) {
        busy = true;
        const d = await pinCall({action:"off"}).catch(err => ({message:err.message}));
        busy = false;
        if (d.ok) { RAWCACHE.pin = {on:false, locked:0}; toast(d.message); done(); } else bad(d.message || "關閉失敗");
      }
    });
  });
}

/* ═════════ 配對暗號：新主機產生暗號，主要主機貼上就加進來（暗號用一次就失效，每台各有自己的連線鑰匙） ═════════ */
const pairCall = body => pkCall("/api/pair-admin", body, 1);
const pairDay = t => { const d = new Date(t * 1000); return `${d.getMonth()+1}/${d.getDate()}`; };
async function pairStatus(root){
  const el = root.querySelector(".pairst"); if (!el) return;
  try { const d = await pairCall({action:"status"}), n = (d.keys || []).length;
    RAWCACHE.pair = d;
    stSet(el, n ? "" : "還沒配對", n);
    el.classList.toggle("on", n > 0);
  } catch(e) { txt(el, e.message); }
}
function pairModal(){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog pkd pairdlg">${IC("link","big")}<h3>配對暗號</h3>
    <p>在主要主機按「新增主機」，貼上暗號</p>
    <div class="form"><div class="pklist"></div><div class="pcode"></div><div class="msg"></div></div>
    <div class="btns"><button class="ubtn" data-gen>產生暗號</button></div></div>`;
  $("#layer").appendChild(v);
  const list = v.querySelector(".pklist"), box = v.querySelector(".pcode"), msg = v.querySelector(".msg"), gen = v.querySelector("[data-gen]");
  let keys = (RAWCACHE.pair && RAWCACHE.pair.keys) ? [...RAWCACHE.pair.keys] : [], code = "", busy = false;
  const draw = init => {
    const lh = keys.map(k => `<div class="pkrow"><span>${esc(k.name)}<small>${pairDay(k.t)} 配對${k.seen ? `・${ago(k.seen).replace(/\d$/, "$& ")}連過` : ""}</small></span>
      <button type="button" class="iconbtn" data-del="${esc(k.id)}" data-name="${esc(k.name)}" title="解除配對">${I("x")}</button></div>`).join("");
    const bh = code ? `<div class="codebox" data-x><code>${esc(code)}</code><button type="button" class="ubtn sm" data-cp>複製</button></div>
      <small>24 小時內有效，用一次就失效</small>` : "";
    if (init) { list.innerHTML = lh; box.innerHTML = bh; } else { swapHTML(list, lh); swapHTML(box, bh); }
    gen.textContent = code ? "重新產生" : "產生暗號";
  };
  if (keys.length) draw(true);
  // 暗號貼到主要主機、配對好了：這台改成被監看，重新載入換成被監看的那一頁
  let watch = 0;
  const check = async () => {
    const d = await pairCall({action:"status"}).catch(() => null);
    if (!d || v._d) return;
    RAWCACHE.pair = d;
    const n = (d.keys || []).find(k => !keys.some(x => x.id === k.id));
    if (!n) return;
    clearInterval(watch); toast(`已和「${n.name}」配對好了`);
    if (LIST.length > 1) { keys = d.keys; code = ""; return draw(); }   // 這台自己也在看別台：不會被監看，留在這裡
    setTimeout(() => location.reload(), 1400);
  };
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; clearInterval(watch); v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    pairCall({action:"status"}).then(d => {
      RAWCACHE.pair = d;
      if (v._d) return;
      keys = d.keys || []; draw();
    }, e => { if (!v._d) { msg.className = "msg bad"; msg.textContent = e.message; } });
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      if (busy) return;
      if (e.target.closest("[data-cp]")) {
        try { await navigator.clipboard.writeText(code); toast("已複製暗號"); }
        catch(err) { const r = document.createRange(); r.selectNodeContents(box.querySelector("code")); getSelection().removeAllRanges(); getSelection().addRange(r);
          toast("請手動複製選取的暗號", "bad"); }
        return;
      }
      const del = e.target.closest("[data-del]");
      if (del) {
        if (!await modal({icon:"link", cls:"bad", title:`解除「${del.dataset.name}」的配對？`, text:"那台就看不到這台了。", ok:"解除"})) return;
        busy = true;
        const d = await pairCall({action:"revoke", id:del.dataset.del}).catch(err => ({message:err.message}));
        busy = false;
        if (d.ok) { keys = d.keys || []; RAWCACHE.pair = {keys}; draw(); toast(d.message); } else toast(d.message || "解除失敗", "bad");
        return;
      }
      if (!e.target.closest("[data-gen]")) return;
      busy = true; gen.disabled = true; msg.className = "msg"; msg.textContent = "";
      const d = await pairCall({action:"code", url: location.origin + location.pathname.replace(/\/(index\.html)?$/, "")}).catch(err => ({message:err.message}));
      busy = false; gen.disabled = false;
      if (d.ok) { code = d.code; draw(); clearInterval(watch); watch = setInterval(check, 3000); }
      else { msg.className = "msg bad"; msg.textContent = d.message || "產生失敗"; }
    });
  });
}
async function rmHost(node, name){
  if (!await modal({icon:"trash", cls:"bad", title:`移除「${name}」？`, text:"會同時解除配對，要加回來得重新配對。", ok:"移除"})) return;
  const d = await pkCall("/api/peer", {action:"remove", name:node}, 1).catch(err => ({message:err.message}));
  if (!d.ok) return toast(d.message || "移除失敗", "bad");
  toast(`已移除「${name}」`);
  return tick();
}
/* 重新開機：先傳驗證碼到 Telegram，輸入對了才重開（沒設定 Telegram 就輸入那台的密碼或 PIN 碼） */
function rebootModal(node, name){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog"><div class="ico big warn">${I("power")}</div><h3>重新開機「${esc(name)}」？</h3>
    <p data-t>要先確認是你本人</p>
    <div class="form" hidden><input class="field" data-k="code" autocomplete="one-time-code" autocapitalize="off" spellcheck="false"><div class="msg"></div></div>
    <div class="btns"><button class="ubtn warn" data-go>繼續</button></div></div>`;
  $("#layer").appendChild(v);
  const form = v.querySelector(".form"), inp = v.querySelector("input"), msg = v.querySelector(".msg"), go = v.querySelector("[data-go]"), txt = v.querySelector("[data-t]");
  const call = body => pkCall("/api/reboot" + (node ? "?node=" + encodeURIComponent(node) : ""), body, 1).catch(err => ({message:err.message}));
  let busy = false, asked = false;
  const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => v.remove(), 360); };
  v._esc = done;
  const wait = t => { busy = true; go.disabled = true; go.innerHTML = `<span class="spin"></span>${t}`; msg.className = "msg"; msg.textContent = ""; };
  const say = (t, bad) => { msg.className = "msg" + (bad ? " bad" : ""); sayTo(msg, t); };
  const ask = async () => {
    wait("傳送中…");
    const d = await call({action:"ask"});
    busy = false; go.disabled = false; go.textContent = asked ? "重新開機" : "繼續";
    if (!d.ok) { reveal(form, true); return say(d.message || "傳送失敗", 1); }
    asked = true; go.textContent = "重新開機"; reveal(form, true);
    if (d.mode === "pw") { txt.innerHTML = `沒設定 Telegram，請輸入這台的密碼 <a href="#" data-rpin>用 PIN 碼</a>`; inp.type = "password"; inp.placeholder = "密碼"; }
    else { txt.innerHTML = `請輸入 Telegram 收到的驗證碼 <a href="#" data-again>重傳</a>`; inp.inputMode = "numeric"; inp.maxLength = 6; inp.placeholder = "6 位數驗證碼"; say(d.message); }
    inp.value = ""; setTimeout(() => inp.focus(), 60);
  };
  const nq = node ? "?node=" + encodeURIComponent(node) : "";
  const begin = () => pkCall("/api/pin" + nq, {action:"begin"}, 1);
  const boot = async () => {
    let code = inp.value.trim();
    if (!code) return inp.focus();
    wait("重新開機中…");
    if (inp.type === "password" && /^\d{4,8}$/.test(code)) code = await pinProof(code, begin).catch(e => ({err: e.message}));   // 打的是 PIN 碼：一樣不原樣送出
    const d = code.err ? {message: code.err} : await call({action:"go", code});
    busy = false; go.disabled = false; go.textContent = "重新開機";
    if (d.ok) { toast(`「${name}」正在重新開機`); done(); } else { say(d.message || "沒有成功", 1); inp.select(); }
  };
  inp.addEventListener("input", () => { if (inp.inputMode === "numeric") inp.value = inp.value.replace(/\D/g, ""); });
  inp.addEventListener("keydown", e => { if (e.key === "Enter" && !busy) { e.preventDefault(); boot(); } });
  v.addEventListener("click", e => {
    if (e.target === v || e.target.closest("[data-r]")) return done();
    if (e.target.closest("[data-again]")) { e.preventDefault(); if (!busy) ask(); return; }
    if (e.target.closest("[data-rpin]")) {          // 用 PIN 碼：打亂的數字鍵盤，對了就直接重新開機
      e.preventDefault();
      return pinAsk({title: `重新開機「${name}」`, pw: false, begin, send: c => call({action:"go", code:c.pin})})
        .then(d => { if (d) { toast(`「${name}」正在重新開機`); done(); } });
    }
    if (e.target.closest("[data-go]") && !busy) asked ? boot() : ask();
  });
}
/* 遠端下載：貼上連結，主機直接下載到它的雲端硬碟「下載」資料夾；開著時每秒更新進度（只改有變的地方，不整塊重畫） */
/* 遠端下載清單：照副檔名放圖示（影片、音樂、圖片、壓縮檔、文件、其他） */
const DLK = {video:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>', audio:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>', zip:'<path d="M6 3h9l4 4v14H6z"/><path d="M11 6h1M11 9h1M11 12h1M10.5 15h2v3h-2z"/>',
  doc:'<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 15h7M9 18h4"/>', file:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>'};
const dlKind = n => { const e = ((String(n).split(/[?#]/)[0].match(/\.([a-z0-9]{1,5})$/i) || [])[1] || "").toLowerCase();
  return /^(mp4|mkv|webm|mov|avi|m4v|ts|flv)$/.test(e) || /youtu|bilibili|xiaohongshu|xhslink|douyin|tiktok/i.test(n) ? "video" : /^(mp3|m4a|flac|wav|aac|ogg|opus)$/.test(e) ? "audio"
    : /^(jpe?g|png|gif|webp|heic|avif|bmp)$/.test(e) ? "image" : /^(zip|rar|7z|gz|tgz|xz|bz2|tar|iso|dmg|apk|deb)$/.test(e) ? "zip" : /^(pdf|docx?|xlsx?|pptx?|txt|epub|csv)$/.test(e) ? "doc" : "file"; };
function dlModal(node, name){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog tdlg dld"><div class="thead">${IC("dl", "")}<div class="thead-t"><h3>遠端下載</h3><p>${esc(name)}・存到雲端硬碟「下載」</p></div><span class="tbadge dlroom"></span></div>
    <div class="form"><div class="dlnew"><input class="field" data-k="url" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="貼上檔案網址或影音分享文字"><button class="ubtn" data-go>下載</button></div>
      <div class="msg"></div>
      <div class="dlbar" hidden><span class="dlsum"></span><button type="button" class="linkish" data-dlclean hidden>清除已完成</button></div>
      <div class="dllist"></div>
      <div class="tcard dlempty" hidden>${I("dl")}<b>目前沒有下載任務</b><small>貼上檔案直連，或 YouTube、B 站、小紅書、抖音分享文字就能開始</small></div>
      <div class="tcard dlyt" hidden><button type="button" class="dlyth" data-yt>${I("key")}<span class="dlytl"><b>影音網站登入資料</b><small class="dlyts"></small></span>${CHEV}</button>
        <div class="dlck" hidden><textarea class="field pfield" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="貼上 cookies.txt 的內容"></textarea>
          <small>被網站擋住時才會用到；建議使用備用帳號；不同網站可分開貼上</small>
          <div class="dlnew"><button type="button" class="ubtn sm ghost" data-ckdel>清除</button><button type="button" class="ubtn sm" data-cksave>儲存</button></div></div></div></div>
    </div>`;
  $("#layer").appendChild(v);
  const inp = v.querySelector("input"), msg = v.querySelector(".msg"), go = v.querySelector("[data-go]"), list = v.querySelector(".dllist"), room = v.querySelector(".dlroom");
  const bar = v.querySelector(".dlbar"), sum = v.querySelector(".dlsum"), clean = v.querySelector("[data-dlclean]"), empty = v.querySelector(".dlempty");
  const call = body => pkCall("/api/download" + (node ? "?node=" + encodeURIComponent(node) : ""), body, 1).catch(err => ({message:err.message}));
  const say = (t, bad) => { msg.className = "msg" + (bad ? " bad" : ""); sayTo(msg, t); };
  const left = s => s < 60 ? `${Math.max(1, Math.round(s))} 秒` : s < 3600 ? `${Math.round(s / 60)} 分鐘` : `${(s / 3600).toFixed(1)} 小時`;
  const stOf = j => j.st === "wait" ? j.err || "排隊中" : j.st === "ok" ? `下載完成・${size(j.total)}` : j.st === "bad" ? j.err || "沒有成功"
    : j.total ? `${Math.floor(j.done / j.total * 100)}%${j.bps ? `・${rate(j.bps)}・剩 ${left((j.total - j.done) / j.bps)}` : `・共 ${size(j.total)}`}`
    : `${size(j.done)}${j.bps ? `・${rate(j.bps)}` : ""}`;
  let timer = 0, busy = false, lastList = [];
  const ck = "dl:" + (node || "");
  const draw = d => {
    if (!d || !Array.isArray(d.list)) return;
    TOOLCACHE[ck] = d;
    lastList = d.list;
    if (!d.cloud) { inp.disabled = go.disabled = true; say("這台沒有雲端硬碟", 1); }
    room.textContent = d.cloud ? `可用 ${size(d.room)}` : "";
    const yt = d.yt || {}, ys = v.querySelector(".dlyt");
    reveal(ys, !!yt.tool);
    ys.querySelector(".dlyts").textContent = `${yt.cookies ? "已設定" : "未設定"}${yt.warp ? "・WARP 已開" : ""}`;
    const nRun = d.list.filter(j => j.st === "run" || j.st === "wait").length;
    const nOk = d.list.filter(j => j.st === "ok").length;
    const nBad = d.list.filter(j => j.st === "bad").length;
    bar.hidden = !d.list.length;
    empty.hidden = !d.cloud || !!d.list.length;
    if (d.list.length) {
      sum.textContent = [nRun ? `進行中 ${nRun}` : "", nOk ? `已完成 ${nOk}` : "", nBad ? `失敗 ${nBad}` : ""].filter(Boolean).join("・");
      clean.hidden = !nOk;
    }
    const seen = new Set();
    d.list.forEach((j, i) => {
      seen.add(j.id);
      let r = list.querySelector(`[data-id="${CSS.escape(j.id)}"]`);
      if (!r) {
        r = document.createElement("div"); r.className = "dlrow"; r.dataset.id = j.id;
        r.innerHTML = `<i class="dlk"></i><span><b></b><small></small><div class="track"><div class="fill"></div></div></span>
          <button type="button" class="iconbtn" data-retry title="重新下載">${I("upd")}</button><button type="button" class="iconbtn" data-del>${I("x")}</button>`;
        r._new = 1;
      }
      const now = [...list.children].filter(x => !x._leaving);
      if (now[i] !== r) list.insertBefore(r, now[i] || null);
      if (r._new) { r._new = 0; if (canAnim()) enterBlock(r, 0); }
      const set = (el, t) => { if (el.textContent !== t) el.textContent = t; };
      set(r.querySelector("b"), j.name || j.label || "檔案");
      const fk = dlKind(j.name || j.url || ""), ki = r.querySelector(".dlk");
      if (ki.dataset.k !== fk) { ki.dataset.k = fk; ki.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${DLK[fk]}</svg>`; }
      r.querySelector("b").title = j.url || "";
      set(r.querySelector("small"), stOf(j));
      r.className = "dlrow " + j.st;
      const tr = r.querySelector(".track"), run = j.st === "run" || j.st === "wait", indet = run && (j.st === "wait" || !j.total);
      tr.classList.toggle("indet", indet);
      reveal(tr, run);
      if (run) r.querySelector(".fill").style.width = indet ? "35%" : Math.max(2, j.done / j.total * 100) + "%";
      const rb = r.querySelector("[data-retry]");
      if (rb.hidden !== (j.st !== "bad")) { rb.hidden = j.st !== "bad"; if (!rb.hidden && canAnim()) rb.animate([{opacity:0, transform:"scale(.6)"}, {opacity:1, transform:"none"}], {duration:T.spf, easing:SPRING_F}); }
      r.querySelector("[data-del]").title = run ? "取消下載" : "從清單拿掉（檔案不會刪）";
    });
    [...list.children].forEach(r => { if (!seen.has(r.dataset.id) && !r._leaving) { r._leaving = 1; canAnim() ? leaveBlock(r) : r.remove(); } });
    clearTimeout(timer);
    if (!v._d) timer = setTimeout(load, d.list.some(j => j.st === "run" || j.st === "wait") ? 1000 : 5000);
  };
  const load = async () => { const d = await call({action:"list"}); if (!v._d) { if (d.list) draw(d); else { say(d.message || d.error || "讀取失敗", 1); timer = setTimeout(load, 5000); } } };
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; clearTimeout(timer); v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    const add = async () => {
      const url = inp.value.trim();
      if (!url) return inp.focus();
      busy = true; go.disabled = true; say("");
      const d = await call({action:"add", url});
      busy = false; go.disabled = false;
      if (d.ok) { inp.value = ""; } else say(d.message || "沒有成功", 1);
      draw(d);
    };
    inp.addEventListener("keydown", e => { if (e.key === "Enter" && !busy) { e.preventDefault(); add(); } });
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      if (e.target.closest("[data-go]") && !busy) return add();
      if (e.target.closest("[data-dlclean]") && !busy) {
        const oks = lastList.filter(j => j.st === "ok"); if (!oks.length) return;
        busy = true; clean.disabled = true;
        let last = null;
        for (const j of oks) last = await call({action:"stop", id:j.id});
        busy = false; clean.disabled = false;
        if (last && last.list) draw(last);
        toast("已清除完成的紀錄");
        return;
      }
      if (e.target.closest("[data-yt]")) {
        e.preventDefault();
        const ck = v.querySelector(".dlck"), on = ck.hidden || ck._hiding;
        v.querySelector(".dlyt").classList.toggle("open", on);
        reveal(ck, on);
        if (on) ck.querySelector("textarea").focus({preventScroll:true});
        return;
      }
      const cs = e.target.closest("[data-cksave],[data-ckdel]");
      if (cs) {
        const ta = v.querySelector(".dlck textarea"), text = cs.matches("[data-ckdel]") ? "" : ta.value.trim();
        if (!text && cs.matches("[data-cksave]")) return ta.focus();
        const d = await call({action:"cookies", text});
        say(d.message || "沒有成功", !d.ok);
        if (d.ok) { ta.value = ""; v.querySelector(".dlyt").classList.remove("open"); reveal(v.querySelector(".dlck"), false); }
        return draw(d);
      }
      const row = e.target.closest(".dlrow"), del = e.target.closest("[data-del]"), re = e.target.closest("[data-retry]");
      if (!row || !(del || re)) return;
      const d = await call({action: re ? "retry" : "stop", id: row.dataset.id});
      if (!d.ok) say(d.message || "沒有成功", 1);
      draw(d);
    });
    if (TOOLCACHE[ck]) draw(TOOLCACHE[ck]);
    load();
    if (!matchMedia("(hover:none)").matches) setTimeout(() => inp.focus(), 60);   // 手機不自動跳出鍵盤
  });
}
async function addHostModal(){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog">${IC("link","big")}<h3>新增主機</h3>
    <p>貼上新主機的配對暗號</p>
    <div class="form"><textarea class="field pfield" data-k="code" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="VS-…"></textarea>
      <small>新主機裝好時會顯示，也能在它的「設定 → 配對暗號」產生</small><div class="msg"></div></div>
    <div class="btns"><button class="ubtn" data-go>連接</button></div></div>`;
  $("#layer").appendChild(v);
  const inp = v.querySelector("textarea"), msg = v.querySelector(".msg"), go = v.querySelector("[data-go]");
  let busy = false;
  const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => v.remove(), 360); };
  v._esc = done;
  const send = async () => {
    const code = inp.value.trim();
    if (!code) return inp.focus();
    busy = true; go.disabled = true; go.innerHTML = `<span class="spin"></span>連接中…`; msg.className = "msg"; msg.textContent = "";
    const d = await pkCall("/api/peer", {action:"add", code}, 1).catch(err => ({message:err.message}));
    busy = false; go.disabled = false; go.textContent = "連接";
    if (d.ok) { toast(d.message); done(); tick(); } else { msg.className = "msg bad"; msg.textContent = d.message || "連接失敗"; }
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter" && !busy) { e.preventDefault(); send(); } });
  v.addEventListener("click", e => {
    if (e.target === v || e.target.closest("[data-r]")) return done();
    if (e.target.closest("[data-go]") && !busy) send();
  });
  setTimeout(() => inp.focus(), 60);
}

/* ═════════ Oracle 防回收：免費主機太閒會被收回，每天固定時段把處理器補到門檻以上 ═════════ */
function keepLine(k){
  if (!k.on) return `<small>已關閉</small>`;
  if (k.p95 == null) return `<small>收集資料中</small>`;
  const low = k.p95 < 20 && k.days >= 2;
  const dd = Math.min(7, Math.max(1, Math.ceil(k.days)));   // 長條 0～50%，直線是 20% 的門檻
  return `<small class="kpst${low ? " bad" : ""}" title="${dd} 天處理器 ${k.p95}%・門檻 20%"><span class="kpb" style="--k:${Math.min(1, k.p95 / 50).toFixed(3)}"><i></i><u></u></span><b class="num">${Math.round(k.p95)}%</b>${k.now ? `<span class="vbd kpon">${I("cpu")}補量中${k.until ? `・到 ${hm(k.until)}` : ""}</span>` : ""}</small>`;   // 正在補處理器：不會動的小標籤（轉圈看起來像卡住）
}
async function keepSet(t){
  const node = t.dataset.keepalive;
  try {
    const r = await api("/api/keepalive" + (node ? `?node=${encodeURIComponent(node)}` : ""), {method:"POST",
      headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify({on:t.checked})});
    const x = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 404 ? "主機還沒更新到新版，先更新再試" : x.message || x.error || "失敗了，請再試一次");
    const s = LIST.find(h => (h.node || "") === node);
    if (s && s.keep) s.keep.on = t.checked;
    const sm = t.closest(".li").querySelector(".lab small");
    if (s && s.keep && sm) sm.outerHTML = keepLine(s.keep);
    toast(x.message);
  } catch(err) { t.checked = !t.checked; toast(err.message, "bad"); }
}

/* ═════════ 每日備份：本機一份、Telegram 一份（有密碼）、其他主機的雲端硬碟一份 ═════════ */
const bkQ = node => node ? `?node=${encodeURIComponent(node)}` : "";
async function bkGet(node){
  const r = await api("/api/backup" + bkQ(node), {headers:{"X-Token":getTok()}});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 404 ? "主機還沒更新到新版，先更新再試" : d.error || "讀取失敗");
  TOOLCACHE["bk:" + (node || "")] = d;
  return d;
}
const bkSize = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
function bkLine(d){
  const L = d.last;
  const me = (d.copies || []).find(c => c.me);
  return !d.on ? ["已關閉", ""] : d.running ? ["備份中…", ""]
    : !L && me ? [`上次備份：${ago(me.t)}（${bkSize(me.size)}）`, "on"] : !L ? [`還沒備份過`, ""]
    : L.ok ? [`上次備份：${ago(L.t)}（${bkSize(L.size)}）`, "on"] : [`上次備份有問題（${ago(L.t)}）`, "bad"];
}
async function bkStatus(root){
  await Promise.all([...root.querySelectorAll(".bkst")].map(async el => {
    const box = el.closest(".tbx") || el.parentNode;
    const bdg = box && box.querySelector(".bkbdg");
    try {
      const d = await bkGet(el.dataset.n), [t, c] = bkLine(d);
      txt(el, el.closest(".tbx") ? t.replace(/^上次備份：/, "").replace(/（.*）$/, "") : t);
      el.className = (el.closest(".tbx") ? "tdesc " : "") + "bkst " + c;
      if (bdg) {
        const [bt, bc] = !d.on ? ["已關閉", ""] : d.running ? ["備份中", "act"] : d.last && !d.last.ok ? ["有問題", "bad"] : ["自動", "ok"];
        txt(bdg, bt); bdg.className = "tbadge bkbdg" + (bc ? " " + bc : "");
      }
      bkDots(box.querySelector(".bkdots"), d);
    } catch(e) {
      txt(el, e.message); el.className = (el.closest(".tbx") ? "tdesc " : "") + "bkst";
      if (bdg) { txt(bdg, ""); bdg.className = "tbadge bkbdg"; }
    }
  }));
}
/* 最近 7 天每天一個點：有備份綠色、最後一次失敗紅色、沒有灰色（最右邊是今天） */
function bkDots(box, d){
  if (!box) return;
  const me = (d.copies || []).find(c => c.me), ts = (me && me.ts) || [], L = d.last, day = t => new Date(t * 1000).toDateString();
  const has = new Set(ts.map(day)), bad = L && !L.ok ? day(L.t) : "";
  [...box.children].forEach((i, n) => {
    const k = new Date(Date.now() - (6 - n) * 864e5).toDateString(), c = k === bad && !has.has(k) ? "bad" : has.has(k) ? "ok" : "";
    if (i.className !== c) i.className = c;
    i.title = new Date(Date.now() - (6 - n) * 864e5).toLocaleDateString("zh-TW", {month:"numeric", day:"numeric"});
  });
}
function bkCalHTML(d){
  const me = (d.copies || []).find(c => c.me), ts = (me && me.ts) || [], L = d.last, day = t => new Date(t * 1000).toDateString();
  const has = new Set(ts.map(day)), bad = L && !L.ok ? day(L.t) : "";
  return `<div class="bkcal">${Array.from({length:7}, (_, n) => {
    const dt = new Date(Date.now() - (6 - n) * 864e5), k = dt.toDateString();
    const c = k === bad && !has.has(k) ? "bad" : has.has(k) ? "ok" : "";
    const lb = n === 6 ? "今天" : `${dt.getMonth() + 1}/${dt.getDate()}`;
    return `<div class="bkday ${c}"><i></i><small class="num">${lb}</small></div>`;
  }).join("")}</div>`;
}
function bkSummaryHTML(d){
  const L = d.last;
  let h = `<div class="tcardh"><span>最近一次備份</span><small class="num">${L ? `${esc(when(L.t))}${L.size ? `・${bkSize(L.size)}` : ""}` : d.on ? "還沒備份過" : "已關閉"}</small></div>`;
  h += bkCalHTML(d);
  if (L) {
    if (L.msg) h += `<div class="bkerr">${I("warn")}<span>${esc(L.msg)}</span></div>`;
    const to = L.to || [];
    if (to.length) {
      const dest = [];
      for (const x of to) {
        const tg = /Telegram/.test(x.where), nm = (/「(.+?)」/.exec(x.where) || [])[1];
        const k = tg ? "tg" : nm ? "p:" + nm : "me";
        let g = dest.find(y => y.k === k);
        if (!g) dest.push(g = {k, ic: tg ? "bell" : nm ? "net" : "disk", name: tg ? "Telegram" : nm || "這台", ok: true, wh: []});
        if (!x.ok) g.ok = false;
        if (x.where) g.wh.push(x.where);
      }
      h += `<div class="bkto">${dest.map(x => `<span class="${x.ok ? "ok" : "bad"}" title="${esc(x.wh.join("；"))}">${I(x.ic)}<em>${esc(x.name)}</em><i>${I(x.ok ? "chk" : "x")}</i></span>`).join("")}</div>`;
    }
    to.filter(x => !x.ok).forEach(x => { h += `<div class="bkerr">${I("warn")}<span><b>${esc(x.where)}沒有成功</b>${x.msg ? `<small>${esc(x.msg)}</small>` : ""}</span></div>`; });
    if (L.items && L.items.length) h += `<div class="bktags">${L.items.map(x => `<span>${esc(x)}</span>`).join("")}</div>`;
    if (L.big && L.big.length) h += `<div class="ntst">${I("info")}<span>太大略過：${esc(L.big.map(p => p.split("/").pop()).join("、"))}</span></div>`;
  }
  if (!d.tg) h += `<div class="ntst">${I("info")}<span>開啟 Telegram 通知會自動多備份一份</span></div>`;
  return h;
}
/* 這台存著哪些主機的備份（每台主機都存著每一台的） */
const bkCopies = d => (d.copies || []).map(c => `<div class="bkcp">${I("archive")}<span class="bkcpi"><b>${esc(c.name)}${c.me ? "（這台）" : ""}</b><small>最新：${esc(when(c.t))}・${bkSize(c.size)}</small></span><span class="tbadge num">${+c.count || 0} 份</span></div>`).join("");
function bkModal(node, label){
  const ck = "bk:" + (node || "");
  let d = TOOLCACHE[ck] ? {...TOOLCACHE[ck]} : null, tab = "stat", watching = false, bkKeyVal = "";
  const v = document.createElement("div"); v.className = "veil";
  const bdgOf = x => !x ? ["", ""] : !x.on ? ["已關閉", ""] : x.running ? ["備份中", "act"] : x.last && !x.last.ok ? ["有問題", "bad"] : ["自動備份", "ok"];
  const [bt, bc] = bdgOf(d);
  const cpHtml = x => bkCopies(x) || `<div class="ntst">${I("info")}<span>目前還沒有已存的備份檔</span></div>`;
  const paneBody = x => `<div class="seg bktab" data-slide><button type="button" class="${tab === "stat" ? "on" : ""}" data-bktab="stat">備份狀態</button><button type="button" class="${tab === "set" ? "on" : ""}" data-bktab="set">份數與設定</button></div>
      <div class="bkpw swgrid">
      <div class="bkpane swpane${tab === "stat" ? "" : " off"}" data-bkpane="stat" data-sw="stat"${tab === "stat" ? "" : ' aria-hidden="true"'}>
        <div class="tcard bksum">${bkSummaryHTML(x)}</div>
        <div class="tcard bksch">
          <label class="bkon"><span class="bkat">${I("clock")}<span><b>每日自動備份</b><small>每天 <span class="num bkhr">${String(+x.hour || 0).padStart(2, "0")}:00</span> 自動執行</small></span></span><input type="checkbox" class="tog" ${x.on ? "checked" : ""}></label>
        </div>
      </div>
      <div class="bkpane swpane${tab === "set" ? "" : " off"}" data-bkpane="set" data-sw="set"${tab === "set" ? "" : ' aria-hidden="true"'}>
        <div class="tcard">
          <div class="tcardh"><span class="bkwh">${x.where === "雲端硬碟" ? `雲端硬碟「${esc(x.folder)}」` : "本機已存份數"}</span><button type="button" class="linkish" data-restore>怎麼還原？</button></div>
          <div class="bkcopies">${cpHtml(x)}</div>
        </div>
        <div class="tcard bkkeyblk">
          <div class="tcardh"><span>解開密碼（所有主機共用）</span><button type="button" class="linkish" data-chg>更換密碼</button></div>
          <div class="codebox bkkeybox"><code class="bkkey" tabindex="0" role="button" title="點一下顯示">${esc(bkKeyVal || "••••••••••••••••••••")}</code><button type="button" class="ubtn sm ghost" data-bkshow>顯示</button><button type="button" class="ubtn sm ghost copybtn" data-bkcp>${I("copy")}複製</button></div>
          <small>還原備份時必須輸入這組密碼，請另外妥善保存</small>
          <span class="bknew" hidden><input class="field" type="password" maxlength="128" autocomplete="new-password" placeholder="輸入新密碼（至少 8 個字）"><button type="button" class="ubtn sm" data-setkey>儲存</button><button type="button" class="ubtn sm ghost" data-chgno>取消</button></span>
        </div>
        ${x.tg ? `<div class="tcard bksch"><label class="bkon"><span class="bkat">${I("bell")}<span><b>Telegram 附帶解開密碼</b><small>開啟會在私人對話附上這份的打碼密碼</small></span></span><input type="checkbox" class="tog" data-bktgpw ${x.tg_pw ? "checked" : ""}></label></div>` : ""}
      </div>
      </div>`;
  v.innerHTML = `<div class="dialog tdlg bkdlg">
    <div class="thead">${IC("archive", "")}<div class="thead-t"><h3>每日備份</h3><p>${esc(label)}</p></div><span class="tbadge bkmst${bc ? " " + bc : ""}">${bt}</span></div>
    <div class="form">
      <div class="bkmbody">${d ? paneBody(d) : `<div class="abjob"><span class="spin"></span><span>讀取中…</span></div>`}</div>
      <div class="msg"></div>
      <div class="tfootbar"><button type="button" class="ubtn ghost" data-dl${d ? "" : " disabled"}>${I("dl")}下載最新</button><button type="button" class="ubtn" data-run${d ? "" : " disabled"}>立即備份</button></div>
    </div></div>`;
  $("#layer").appendChild(v);
  const mbody = v.querySelector(".bkmbody"), msg = v.querySelector(".msg"), runb = v.querySelector("[data-run]"), dlb = v.querySelector("[data-dl]"), mst = v.querySelector(".bkmst");
  const say = (t, c = "") => { msg.className = "msg " + c; sayTo(msg, t); };
  const syncBdg = () => { const [t, c] = bdgOf(d); mst.textContent = t; mst.className = "tbadge bkmst" + (c ? " " + c : ""); };
  const post = async (body, here) => {           // here：送給目前開著的這台（換密碼由它負責通知其他台）
    const r = await api("/api/backup" + (here ? "" : bkQ(node)), {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(body)});
    const x = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(x.message || x.error || "失敗了，請再試一次");
    return x;
  };
  const busy = (b, t) => { b.disabled = !!t; b.innerHTML = t ? `<span class="spin"></span>${t}` : b._t; };
  v.querySelectorAll(".tfootbar button").forEach(b => b._t = b.innerHTML);
  let lastSum = d ? bkSummaryHTML(d) : "", lastCp = d ? cpHtml(d) : "";
  const syncData = x => {
    d = x; syncBdg();
    if (!v.querySelector(".bkpw")) {
      lastSum = bkSummaryHTML(d); lastCp = cpHtml(d);
      swapHTML(mbody, paneBody(d));
      dlb.disabled = false; runb.disabled = false;
      return;
    }
    const sh = bkSummaryHTML(d), sumBox = v.querySelector(".bksum");
    if (sumBox && sh !== lastSum) { lastSum = sh; sumBox.innerHTML = sh; }
    const ch = cpHtml(d), cpBox = v.querySelector(".bkcopies");
    if (cpBox && ch !== lastCp) { lastCp = ch; cpBox.innerHTML = ch; }
    const tog = v.querySelector(".bksch .tog:not([data-bktgpw])"); if (tog) tog.checked = !!d.on;
    const tgp = v.querySelector("[data-bktgpw]"); if (tgp) tgp.checked = !!d.tg_pw;
    const hr = v.querySelector(".bkhr"); if (hr) txt(hr, `${String(+d.hour || 0).padStart(2, "0")}:00`);
    const wh = v.querySelector(".bkwh"); if (wh) txt(wh, d.where === "雲端硬碟" ? `雲端硬碟「${d.folder}」` : "本機已存份數");
  };
  return new Promise(res => {
    let live = true;
    const done = () => { if (v._d) return; v._d = 1; live = false; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    const watch = async () => {                    // 備份中：每 1.5 秒看一次，好了就更新上面的清單
      if (watching || !d) return; watching = true;
      d.running = true; syncBdg(); busy(runb, "備份中…");
      while (live) {
        await new Promise(r => setTimeout(r, 1500));
        try { d = await bkGet(node); } catch(e) { continue; }
        if (!d.running) break;
      }
      watching = false;
      if (!live) return;
      busy(runb); syncData(d);
      d.last && d.last.ok ? say("備份好了", "ok") : say("有地方沒備份成功，看上面的說明", "bad");
    };
    if (d && d.running) watch();
    bkGet(node).then(fresh => {
      if (!live) return;
      syncData(fresh);
      if (fresh.running) watch();
    }, err => {
      if (!live) return;
      if (!d) { done(); toast(err.message, "bad"); }
    });
    v.addEventListener("change", async e => {
      const t = e.target; if (!t.classList.contains("tog") || !d) return;
      if (t.hasAttribute("data-bktgpw")) {
        try { const x = await post({action:"tg_pw", on:t.checked}, true); d.tg_pw = t.checked; TOOLCACHE[ck] = d; toast(x.message); }
        catch(err) { t.checked = !t.checked; say(err.message, "bad"); }
        return;
      }
      try { const x = await post({action:"set", on:t.checked}); d.on = t.checked; TOOLCACHE[ck] = d; syncBdg(); toast(x.message); }
      catch(err) { t.checked = !t.checked; say(err.message, "bad"); }
    });
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      const bt2 = e.target.closest("[data-bktab]");
      if (bt2) {
        if (bt2.dataset.bktab === tab) return;
        const sd = bt2.dataset.bktab === "set" ? 1 : -1;
        tab = bt2.dataset.bktab;
        slideSel(() => v.querySelectorAll("[data-bktab]").forEach(x => x.classList.toggle("on", x === bt2)));
        slidePane(v.querySelector(".bkpw"), tab, sd);
        return;
      }
      if (!d) return;
      if (e.target.closest("[data-restore]")) {     // 還原說明蓋在上面時，先把這個視窗藏起來
        const box = v.querySelector(".dialog"); box.style.visibility = "hidden";
        await bkRestore(); box.style.visibility = "";
        return;
      }
      if (e.target.closest("[data-chg]")) {
        const box = v.querySelector(".bknew"); reveal(box, true); reveal(e.target.closest("[data-chg]"), false);
        return box.querySelector("input").focus();
      }
      if (e.target.closest("[data-chgno]")) {
        reveal(v.querySelector(".bknew"), false); reveal(v.querySelector("[data-chg]"), true);
        return;
      }
      const sk = e.target.closest("[data-setkey]");
      if (sk && !sk.disabled) {
        const inp = v.querySelector(".bknew input"), key = inp.value;
        if (key.length < 8) return say("密碼至少要 8 個字", "bad");
        if (!await modal({icon:"key", cls:"warn", title:"換成新的解開密碼？", text:"所有主機一起換。舊備份仍要用舊密碼，請留著。", ok:"換"})) return;
        busy(sk, "儲存中…");
        try {
          const x = await post({action:"key", key, sync:true}, true); bkKeyVal = key;
          const kb = v.querySelector(".bkkey"), sb = v.querySelector("[data-bkshow]");
          kb.textContent = key; kb.classList.add("on"); if (sb) sb.textContent = "隱藏";
          inp.value = ""; reveal(v.querySelector(".bknew"), false); reveal(v.querySelector("[data-chg]"), true); say(x.message, "ok");
        } catch(err) { say(err.message, "bad"); }
        busy(sk);
        return;
      }
      const loadKey = async () => {
        if (bkKeyVal) return bkKeyVal;
        const x = await post({action:"show_key"}, true);
        bkKeyVal = x.key || "";
        return bkKeyVal;
      };
      if (e.target.closest("[data-bkshow]") || e.target.closest(".bkkey")) {
        const kb = v.querySelector(".bkkey"), sb = v.querySelector("[data-bkshow]");
        if (kb.classList.contains("on")) { kb.classList.remove("on"); if (sb) sb.textContent = "顯示"; return; }
        try {
          const k = await loadKey(); if (!live || !k) return;
          kb.textContent = k; kb.classList.add("on"); if (sb) sb.textContent = "隱藏";
        } catch(err) { say(err.message, "bad"); }
        return;
      }
      if (e.target.closest("[data-bkcp]")) {
        try {
          const k = await loadKey(); if (!live || !k) return;
          await navigator.clipboard.writeText(k); toast("已複製解開密碼");
        } catch(err) { toast(err.message || "複製不了，請先點顯示再手動選取", "bad"); }
        return;
      }
      if (e.target.closest("[data-run]") && !runb.disabled) {
        say("");
        try { await post({action:"run"}); watch(); } catch(err) { say(err.message, "bad"); }
        return;
      }
      const dl = e.target.closest("[data-dl]");
      if (dl && !dl.disabled) {
        busy(dl, "準備中…"); say("");
        try {
          const r = await api("/api/backup-file" + bkQ(node), {headers:{"X-Token":getTok()}});
          if (!r.ok) { const x = await r.json().catch(() => ({})); throw new Error(x.error || "下載失敗"); }
          const name = decodeURIComponent(r.headers.get("X-Backup-Name") || "backup.vsbk");
          const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = name;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
          say(`已下載 ${name}`, "ok");
        } catch(err) { say(err.message, "bad"); }
        busy(dl);
      }
    });
  });
}

/* 還原：在這台上執行一行指令挑一份放回去；整台搬到新主機時，產生一個 24 小時內有效的下載連結，貼一段指令就好。
   連結一律由目前連線的這台產生（它存著每一台的備份） */
const BK_REPO = "https://github.com/a7510049/vps-sentinel.git";
function bkRestore(){
  const cached = TOOLCACHE["bk:"];
  const here = "sudo python3 ~/vps-sentinel/sentinel.py --restore";
  const hostsCard = hosts => hosts.length ? `<div class="tcard"><div class="tcardh"><span>整台搬遷到新主機</span></div>
    <small>網域先指向新主機，選一台產生 24 小時內有效的搬遷指令：</small>
    <div class="bkhosts">${hosts.map(h => `<button type="button" class="fchip" data-link="${esc(h.name)}">${esc(h.name)}</button>`).join("")}</div>
    <div class="codebox bkcmdbox" data-newcmd hidden><code class="bkcmd"></code><button type="button" class="ubtn sm ghost copybtn" data-bkcmd="">${I("copy")}複製</button></div></div>` : "";
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog tdlg bkdlg">
    <div class="thead">${IC("archive", "")}<div class="thead-t"><h3>還原備份</h3><p>還原前原本的檔案會先自動另存一份</p></div></div>
    <div class="form">
      <div class="tcard"><div class="tcardh"><span>原地還原到前幾天</span></div>
        <small>在原本那台主機的終端機執行：</small>
        <div class="codebox bkcmdbox"><code class="bkcmd">${esc(here)}</code><button type="button" class="ubtn sm ghost copybtn" data-bkcmd="${esc(here)}">${I("copy")}複製</button></div></div>
      <div class="bkrhosts">${cached ? hostsCard(cached.copies || []) : ""}</div>
      <div class="msg"></div></div></div>`;
  $("#layer").appendChild(v);
  const msg = v.querySelector(".msg"), hbox = v.querySelector(".bkrhosts");
  const say = (t, c = "") => { msg.className = "msg " + c; sayTo(msg, t); };
  let lastH = cached ? (cached.copies || []).map(h => h.name).join("\n") : "";
  bkGet("").then(d => {
    if (v._d) return;
    const names = (d.copies || []).map(h => h.name).join("\n");
    if (names !== lastH) { lastH = names; swapHTML(hbox, hostsCard(d.copies || [])); }
  }, err => { if (!v._d && !cached) say(err.message, "bad"); });
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      const cp = e.target.closest("[data-bkcmd]");
      if (cp && cp.dataset.bkcmd) {
        try { await navigator.clipboard.writeText(cp.dataset.bkcmd); toast("已複製指令"); } catch(err) { /* 不能複製就讓使用者自己選取 */ }
        return;
      }
      const b = e.target.closest("[data-link]");
      if (!b || b.disabled) return;
      b.disabled = true; say("");
      try {
        const r = await api("/api/backup", {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"},
                                            body:JSON.stringify({action:"link", host:b.dataset.link})});
        const x = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(x.message || "產生失敗，請再試一次");
        const url = `${location.origin}/api/backup-dl?${x.q}`;
        const cmd = `sudo apt-get install -y -qq git; git clone ${BK_REPO} ~/vps-sentinel; sudo python3 ~/vps-sentinel/sentinel.py --restore '${url}'`;
        const box = v.querySelector("[data-newcmd]");
        txt(box.querySelector("code"), cmd); box.querySelector("[data-bkcmd]").dataset.bkcmd = cmd; reveal(box, true);
        v.querySelectorAll("[data-link]").forEach(x => x.classList.toggle("on", x === b));
        say(`已產生「${b.dataset.link}」的搬遷指令（24 小時內有效）`, "ok");
      } catch(err) { say(err.message, "bad"); }
      b.disabled = false;
    });
  });
}

/* ═════════ 登入 ═════════ */
function login(msg){
  $("#app").innerHTML = inventoryEntry(`<main class="login ${msg?"shake":""}"><h1>登入哨站</h1><form>
    <label class="tok-label" for="tok">存取密碼</label><input id="tok" class="field" type="password" required autocomplete="current-password" aria-describedby="login-err">
    <label class="remember"><input type="checkbox" id="rem" ${REM ? "checked" : ""}><span>30 天內不用再登入</span></label>
    <div class="err" id="login-err" role="alert">${esc(msg || "")}</div><button class="ubtn inv-add" type="submit" data-login>登入</button></form>${PIN_ON ? pinBtn : ""}${PK_OK && store("vps-pk") ? pkBtn : ""}</main>`);
  const box = $("#app .login");
  box.querySelector("form").onsubmit = e => { e.preventDefault(); doLogin(); };
  $("#rem").addEventListener("change", e => { REM = e.target.checked; });
  pkCall("/api/passkey-login", {action:"has"}).then(d => {   // 問主機有沒有設定 PIN 碼、有沒有登記手機金鑰，有才顯示
    if (!box.isConnected) return;
    PIN_ON = !!d.pin;
    const add = h => { box.insertAdjacentHTML("beforeend", h); const b = box.lastElementChild;
      if (canAnim()) b.animate([{opacity:0, transform:"translateY(-4px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE}); };
    if (PIN_ON && !box.querySelector("[data-pinlogin]")) add(pinBtn);
    if (PK_OK && d.has && !box.querySelector("[data-pklogin]")) add(pkBtn);
    if (d.temp && !window._tmpAsk) { window._tmpAsk = 1; pinLoginClick(); }   // 剛裝好：直接打開 PIN 碼鍵盤
  }).catch(() => {});
  fetch("/api/restore", {cache:"no-store"}).then(r => r.json()).then(d => {   // 剛裝好、正在等待還原：多一個入口
    if (d.active && box.isConnected && !box.querySelector("[data-rsw]")) box.insertAdjacentHTML("beforeend", `<button class="linkish rswgo" data-rsw>從備份還原</button>`);
  }).catch(() => {});
}
const inventoryEntry = content => `<div class="console inv-entry"><header class="inv-header"><div class="inv-width"><div class="inv-brand"><span>${inventoryMark}</span><b>哨站<small>OUTPOST</small></b></div></div></header>${content}</div>`;

/* ═════════ 從備份還原（安裝時選了「從備份還原」）═════════
   網址上的 ?restore=代碼 是安裝完成時終端機給的一次性代碼；有代碼才能上傳備份檔、開始還原 */
const RSW = {code: sessionStorage.getItem("vs-rsw") || "", poll: 0, down: 0};
function rswApi(path, opt = {}){
  return fetch(path, {...opt, cache:"no-store", headers:{...(opt.headers || {}), "X-Restore-Code": RSW.code}});
}
async function restoreScreen(){
  endSplash(); clearTimeout(timer);
  $("#app").innerHTML = inventoryEntry(`<main class="login rsw"><h1>從備份還原</h1>
    <p>還原會以備份中的資料覆蓋這台主機的現有資料。</p><div class="rswbody"></div></main>`);
  rswShow();
}
async function rswShow(){
  const body = $("#app .rswbody");
  if (!body) return;
  let d;
  try {
    const r = await rswApi("/api/restore");
    d = await r.json();
    if (r.status === 401 || !RSW.code) return rswCodeForm(body, RSW.code ? (/太多次/.test(d.error || "") ? d.error : "還原代碼不對") : "");
    RSW.down = 0;
  } catch(e) {                                   // 還原時哨兵會重新啟動：連不上一下是正常的
    RSW.down++;
    return rswRunning(body, null);
  }
  if (!d.active) return rswEnd(body, null, "目前沒有等待中的還原。要還原請在主機執行：sudo bash install.sh --restore");
  if (d.stage === "wait") return rswForm(body);
  if (d.stage === "running" || (d.progress && !d.progress.done)) return rswRunning(body, d.progress);
  return rswEnd(body, d.progress);
}
function rswCodeForm(body, err){
  body.innerHTML = `<label for="rswcode">還原代碼</label><input class="field" id="rswcode" aria-describedby="rswcode-hint" autocomplete="off" value="${esc(RSW.code)}">
    <small class="rswtip" id="rswcode-hint">使用主機終端機顯示的代碼。</small><div class="err" role="alert">${esc(err)}</div><button class="ubtn" data-rswcode>下一步</button>`;
  const go = () => { RSW.code = $("#rswcode").value.trim().toUpperCase(); sessionStorage.setItem("vs-rsw", RSW.code); rswShow(); };
  body.querySelector("[data-rswcode]").onclick = go;
  $("#rswcode").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
}
function rswForm(body){
  body.innerHTML = `<label class="rswselect"><span>備份檔（.vsbk）</span><input type="file" accept=".vsbk" multiple aria-describedby="rswfile-hint"><span class="ubtn ghost rswfile" aria-hidden="true"><span class="rswname">選擇檔案</span></span></label><small id="rswfile-hint" class="rswtip">分段備份請一次選取所有檔案。</small>
    <label for="rswpw">備份密碼</label><input class="field" id="rswpw" type="password" autocomplete="off">
    <small class="rswtip">可使用備份總密碼，或 Telegram 通知附上的密碼。</small>
    <div class="err" role="alert"></div><button class="ubtn" data-rswgo>開始還原</button>`;
  const inp = body.querySelector("input[type=file]"), err = body.querySelector(".err"), go = body.querySelector("[data-rswgo]");
  const lab = body.querySelector(".rswname");
  inp.onchange = () => {
    const fs = [...inp.files], b = rswJoin(fs);
    lab.textContent = !fs.length ? "選擇檔案" : fs.length > 1 ? `${fs.length} 段（${bkSize(b.size || 0)}）` : `${fs[0].name}（${bkSize(fs[0].size)}）`;
    err.textContent = b.err || "";
  };
  go.onclick = async () => {
    const b = rswJoin([...inp.files]), f = b.blob, pw = $("#rswpw").value;
    if (b.err) return err.textContent = b.err;
    if (!f) return err.textContent = "請先選擇備份檔";
    if (!pw) return err.textContent = "請輸入備份密碼";
    go.disabled = true; err.textContent = "";
    try {
      await new Promise((res, rej) => {          // 用 XHR 才看得到上傳進度
        const x = new XMLHttpRequest();
        x.open("POST", "/api/restore-upload"); x.setRequestHeader("X-Restore-Code", RSW.code);
        x.upload.onprogress = e => { if (e.lengthComputable) go.innerHTML = `<span class="spin"></span>上傳中 ${Math.round(e.loaded / e.total * 100)}%`; };
        x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch(_) {} x.status === 200 ? res() : rej(new Error(j.message || j.error || "上傳失敗")); };
        x.onerror = () => rej(new Error("上傳失敗，請確認網路後再試一次"));
        x.send(f);
      });
      go.innerHTML = `<span class="spin"></span>檢查密碼…`;
      const r = await rswApi("/api/restore-run", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({pw})});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || j.error || "沒辦法開始還原");
      rswShow();
    } catch(e) { err.textContent = e.message; go.disabled = false; go.textContent = "開始還原"; }
  };
}
/* Telegram 上超過 50 MB 的備份分成「…第1／3段.vsbk」好幾個檔：全部一起選，照順序接回一個檔再上傳 */
function rswJoin(fs){
  if (!fs.length) return {};
  const ps = fs.map(f => [f, /^(.*) 第(\d+)／(\d+)段\.vsbk$/.exec(f.name)]);
  if (fs.length === 1 && !ps[0][1]) return {blob: fs[0], size: fs[0].size};
  if (ps.some(p => !p[1])) return {err: "一次選一份備份"};
  const [, base, , n] = ps[0][1];
  if (ps.some(p => p[1][1] !== base || p[1][3] !== n)) return {err: "一次選一份備份"};
  const got = new Map(ps.map(p => [+p[1][2], p[0]]));
  const miss = Array.from({length: +n}, (_, i) => i + 1).filter(i => !got.has(i));
  if (miss.length) return {err: `還少第 ${miss.join("、")} 段，${n} 段要一起選`};
  const blob = new Blob(Array.from({length: +n}, (_, i) => got.get(i + 1)));
  return {blob, size: blob.size};
}
function rswLog(pg){
  return (pg && pg.log || []).filter(l => !/測試，不執行/.test(l)).slice(-10).map(l => `<li>${esc(l.trim())}</li>`).join("");
}
function rswRunning(body, pg){
  const after = pg && pg.after;
  const note = RSW.down > 40 && after ? `還原後網址換成 <a href="${esc(after)}">${esc(after)}</a>，請改用這個網址登入`
             : RSW.down ? "哨站正在重新啟動，等一下就好…" : "請不要關掉這個頁面";
  body.innerHTML = `<div class="rswnow"><span class="spin"></span>還原中${pg && pg.name ? `：${esc(pg.name)}` : ""}</div>
    <ul class="bkrows rswlog">${rswLog(pg) || "<li>準備中…</li>"}</ul><small class="rswtip">${note}</small>`;
  clearTimeout(RSW.poll); RSW.poll = setTimeout(rswShow, 1500);
}
function rswEnd(body, pg, msg){
  clearTimeout(RSW.poll);
  if (!pg) { swapHTML(body, `<small class="rswtip">${esc(msg)}</small><button class="ubtn" data-rswdone>前往登入</button>`); }
  else {
    const res = (pg.result || []).map(x => `<li class="${x.ok ? "ok" : "bad"}">${I(x.ok ? "ok" : "warn")}<span>${esc(x.label)}${x.ok ? "" : " 沒有跑起來"}</span></li>`).join("");
    swapHTML(body, `<div class="rswnow ${pg.ok ? "ok" : "bad"}">${pg.error ? "沒有還原成功" : pg.ok ? "還原完成" : "還原完成，但有地方沒跑起來"}</div>
      ${pg.error ? `<small class="rswtip">${esc(pg.error)}</small>` : `<ul class="bkrows">${res || "<li>（這份備份裡沒有需要啟動的服務）</li>"}</ul>`}
      <small class="rswtip">${pg.error ? "可以在主機上執行 sudo bash install.sh --restore 重新產生代碼再試一次" : "登入時用原本那台的密碼、PIN 碼或手機金鑰"}</small>
      <button class="ubtn" data-rswdone>前往登入</button>`);
  }
  body.querySelector("[data-rswdone]").onclick = () => {
    sessionStorage.removeItem("vs-rsw"); RSW.code = ""; setTok("");
    if (pg && pg.after && !location.href.startsWith(pg.after)) location.href = pg.after;
    else login();
  };
}
let REM = true, PIN_ON = false;
/* 輸入 4～8 位數字、主機又有設定 PIN 碼：當成 PIN 碼（一樣不原樣送出）；其他都當成存取密碼 */
async function doLogin(){
  const inp = $("#tok"), b = $("#app [data-login]"), err = $("#login-err");
  if (b.disabled) return;
  const v = inp.value.trim();
  const pin = PIN_ON && /^\d{4,8}$/.test(v);
  b.disabled = true; b.textContent = "登入中…"; err.textContent = "";
  let d = {};
  try { const r = await fetch(pin ? "/api/pin-login" : "/api/login", {method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({[pin ? "pin" : "pw"]: pin ? await pinProof(v, () => pkCall("/api/pin-login", {action:"begin"})) : v, keep:REM, dev:devLabel(), os:devOs()})});
    d = await r.json().catch(() => ({})); }
  catch(e) { d = {message:"連線失敗，請稍後再試"}; }
  if (!b.isConnected) return;
  if (d.ok && d.token) { if (!pin) window._fresh = true; setTok(d.token, REM); return tick(); }   // 用密碼登入才把 PIN 碼輸錯的次數歸零
  err.textContent = d.message || (pin ? "PIN 碼不對" : "密碼不對，再試一次");
  b.disabled = false; b.textContent = "登入"; inp.focus(); inp.select();
}
const pkBtn = `<button class="ubtn ghost pkbtn" data-pklogin>${I("finger")}用手機金鑰登入</button>`;
const pinBtn = `<button class="ubtn ghost pkbtn" data-pinlogin>${I("pin")}用 PIN 碼登入</button>`;
async function pinLoginClick(){
  const d = await pinAsk({title: "PIN 碼登入", pw: false,
    send: async c => { const r = await api("/api/pin-login", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...c, keep:REM, dev:devLabel(), os:devOs()})});
      return r.json().catch(() => ({})); }});
  if (d && d.token) { setTok(d.token, REM); tick(); }
}
async function pkLoginClick(b){
  const err = $("#app .login .err");
  b.disabled = true; err.textContent = "";
  try { setTok(await pkLogin(), REM); store("vps-pk", "1"); window._fresh = true; return tick(); }
  catch(e) { if (e.name !== "NotAllowedError" && e.name !== "AbortError") err.textContent = pkErr(e); }
  b.disabled = false;
}

/* ═════════ 點擊 ═════════ */
/* 同一顆按鈕上一次按的還沒做完（例如還在等主機回應、視窗還沒打開）再按就不理它；視窗或選單一出現、做完、或 10 秒後放開（使用者要求：不能按兩次開兩個） */
const ONCE = new WeakSet();
function onceClick(el, run){
  if (!el) return run();
  if (ONCE.has(el)) return;
  ONCE.add(el);
  let done = 0;
  const L = $("#layer"), mo = new MutationObserver(() => free()), tm = setTimeout(() => free(), 10000);
  const free = () => { if (done) return; done = 1; ONCE.delete(el); mo.disconnect(); clearTimeout(tm); };
  if (L) mo.observe(L, {childList:true});
  let r;
  try { r = run(); } catch(e) { free(); throw e; }
  return r && typeof r.then === "function" ? r.finally(free) : (free(), r);
}
const ONCE_SEL = "button,a,[role=button]";
document.addEventListener("click", e => {
  if (!e.target.closest || e.target.closest("#layer") || e.target.closest("#fly")) return;
  return onceClick(e.target.closest(ONCE_SEL), () => pageClick(e));
});
function focusInventory(id){
  const el = document.getElementById(id);
  if (!el) return;
  el.focus({preventScroll:true});
  el.scrollIntoView({block:"start", behavior:canAnim() ? "smooth" : "instant"});
}
document.addEventListener("input", e => {
  if (!e.target.matches("[data-inv-search]")) return;
  inventoryQuery = e.target.value;
  // 只更新清單，保留輸入法組字、焦點與捲動位置。
  const rows = document.querySelector(".inv-list tbody");
  if (rows) rows.innerHTML = inventoryRows(LIST, inventorySelected(LIST));
});
async function pageClick(e){
  if (e.target.closest("#layer") || e.target.closest("#fly")) return;
  if (e.target.closest("[data-fly]")) return flyEnter(e.target.closest("[data-fly]"));
  const t = e.target;
  if (t.closest("[data-pklogin]")) return pkLoginClick(t.closest("[data-pklogin]"));
  if (t.closest("[data-pinlogin]")) return pinLoginClick();
  if (t.closest("[data-rsw]")) return restoreScreen();
  const tb = t.closest("[data-tab]");
  if (tb) { if ($("#fly") && !tb.closest("#fly")) { flyClose(); if (TAB === tb.dataset.tab) return; } return setTab(tb.dataset.tab, e.detail === 0); }   // 機場起降開著時按分頁列：先關掉
  if (t.closest("[data-settings]")) return setTab("set");
  const filter = t.closest("[data-inv-filter]");
  if (filter) {
    inventoryFilter = filter.dataset.invFilter;
    hideTip();
    return render(LIST);
  }
  const host = t.closest("[data-inv-host]");
  if (host) {
    DSEL = host.dataset.invHost;
    sstore("vs-dsel", DSEL);
    closeMenu();
    hideTip();
    render(LIST);
    if (matchMedia("(max-width: 840px)").matches) focusInventory("inv-host-name");
    return;
  }
  const jump = t.closest("[data-inv-jump]");
  if (jump) return focusInventory(jump.dataset.invJump);
  if (t.closest("[data-addhost]")) return addHostModal();
  const rg = t.closest("[data-range]");
  if (rg) { if (RANGE !== rg.dataset.range) { RANGE = rg.dataset.range; store("vps-range", RANGE); slideSel(() => render(LIST)); } return; }
  const tf = t.closest("[data-traffic]");
  if (tf) return trafficModal(tf.dataset.traffic, tf.dataset.label);
  if (t.closest("[data-refresh]")) return refreshNow(t.closest("[data-refresh]"));
  if (t.closest("[data-qtheme]")) {
    const next = document.documentElement.dataset.mode === "dark" ? "light" : "dark";
    setP("theme", next); return changed("theme");
  }
  if (t.closest("[data-logout]")) {
    if (await modal({icon:"logout", cls:"theme", title:"要登出嗎？", text:"", ok:"登出"})) { sessCall({action:"out"}).catch(() => {}); setTok(""); LIST = []; for (const k in STCACHE) delete STCACHE[k]; for (const k in RAWCACHE) delete RAWCACHE[k]; for (const k in TOOLCACHE) delete TOOLCACHE[k]; window._pw = 0; clearTimeout(timer); inventoryFilter = "all"; inventoryQuery = ""; document.documentElement.classList.remove("lock"); login(); }
    return;
  }
  const th = t.closest("[data-toolh]");
  if (th) { if (TOOLH !== th.dataset.toolh) { TOOLH = th.dataset.toolh; store("vs-toolh", TOOLH); PSMOOTH = true; holdHeight(() => slideSel(() => render(LIST))); PSMOOTH = false; } pickShow(true); return; }
  const scg = t.closest("[data-setc]");
  if (scg) { if (SETC !== scg.dataset.setc) { SETC = scg.dataset.setc; store("vs-setc", SETC); slideSel(() => render(LIST)); } return; }
  const lf = t.closest("[data-logf]");
  if (t.closest("[data-logreset]")) { LOGF = ""; LOGH = ""; slideSel(() => render(LIST)); return; }
  if (lf) { if (LOGF !== lf.dataset.logf) { LOGF = lf.dataset.logf; slideSel(() => render(LIST)); } return; }
  const ex = t.closest("[data-evx]");
  if (ex) { const k = ex.dataset.evx, on = !EVOPEN.has(k); on ? EVOPEN.add(k) : EVOPEN.delete(k);
    document.querySelectorAll("[data-evx]").forEach(b => { if (b.dataset.evx === k) { b.closest(".ev").classList.toggle("open", on); b.setAttribute("aria-expanded", on); } }); return; }
  const lhm = t.closest("[data-loghm]");
  if (lhm) return logHostMenu(lhm);
  const lh = t.closest("[data-logh]");
  if (lh) { if (LOGH !== lh.dataset.logh) { LOGH = lh.dataset.logh; slideSel(() => render(LIST)); } return; }

  const pe = t.closest("[data-peeredit]");
  if (pe) { const s = LIST.find(x => (x.node || "") === pe.dataset.peeredit); return s && peerModal(s); }
  const mo = t.closest("[data-more]");
  if (mo) { const s = LIST.find(x => keyOf(x) === mo.dataset.more), same = window._menu && window._menu._by === mo;
    if (window._menu) closeMenu(); if (same || !s) return;            // 按同一個「⋯」是關掉；按別台的直接換過去
    moreMenu(mo, s); if (window._menu) window._menu._by = mo; return; }
  if (window._menu && !t.closest(".lmenu")) closeMenu();
  const dl = t.closest("[data-dl]");
  if (dl) return dlModal(dl.dataset.dl, dl.dataset.name).then(() => tick());
  const ab = t.closest("[data-ab]");
  if (ab && !ab.closest(".veil")) return abModal(ab.dataset.ab, ab.dataset.name).then(() => tick());
  const alm = t.closest("[data-album]");
  if (alm) return albumModal(alm.dataset.album, alm.dataset.name).then(() => tick());
  const nb = t.closest("[data-notes]");
  if (nb) return notesModal(nb.dataset.notes, nb.dataset.name).then(() => tick());
  const rb = t.closest("[data-reboot]");
  if (rb) return rebootModal(rb.dataset.reboot, rb.dataset.name);
  const rm = t.closest("[data-rmhost]");
  if (rm) return rmHost(rm.dataset.rmhost, rm.dataset.name);
  const rn = t.closest("[data-rename]");
  if (rn) {
    const old = rn.dataset.name, node = rn.dataset.rename, hs = LIST.find(x => (x.node || "") === node);
    const oldl = hs ? linksOf(hs).filter(x => !x.fixed) : [];
    const r0 = await hostModal(old, oldl);
    if (!r0) return;
    const post = (path, body) => fetch(path + "?node=" + encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(body)})
      .then(async r => { const d = await r.json().catch(()=>({})); if (!(r.ok && d.ok)) throw new Error(d.message || d.error || (r.status === 404 ? "那台主機還沒更新到新版" : "儲存失敗")); return d; });
    try {
      const msgs = [];
      if (r0.name && r0.name !== old) { await post("/api/rename", {name:r0.name}); msgs.push(`已改名為「${r0.name}」`); }
      if (JSON.stringify(r0.links) !== JSON.stringify(oldl.map(x => ({name:x.name, url:x.url})))) msgs.push((await post("/api/links", {links:r0.links})).message);
      if (msgs.length) toast(msgs.join("，"));
    } catch(err) { toast(err.message === "Failed to fetch" ? "連線失敗，請稍後再試" : err.message, "bad"); }
    return tick();
  }
  const rv = t.closest("[data-reveal]");
  if (rv) {
    const k = rv.dataset.reveal;
    IPSHOW[k] = Date.now() + 15000; setTimeout(() => { if (IPSHOW[k] <= Date.now()) { delete IPSHOW[k]; if (LIST.length && getTok()) render(LIST); } }, 15100);   // 15 秒後自動再遮起來
    return render(LIST);
  }
  const cp = t.closest("[data-copy]");
  if (cp) {
    const txt = cp.dataset.copy;
    try { await navigator.clipboard.writeText(txt); }
    catch(e) { const ta = document.createElement("textarea"); ta.value = txt; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch(_) {} ta.remove(); }
    return toast(`已複製 ${txt}`);
  }
  const ub = t.closest("[data-update]");
  if (ub) {
    const node = ub.dataset.update, label = ub.dataset.label, n = +ub.dataset.n;
    const ok = await modal({icon:"upd", cls:"theme", title: n ? `更新「${label}」？` : `檢查「${label}」的更新？`,
      text: n ? `約 1～5 分鐘，部分服務可能短暫重啟。` : "重新檢查，有更新就裝好。", ok: n ? "開始更新" : "檢查"});
    if (!ok) return;
    ub.disabled = true;
    try {
      const r = await fetch("/api/update?node="+encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok()}});
      const d = await r.json().catch(()=>({}));
      if (!(r.ok && d.ok)) toast(d.message || d.error || "無法開始更新", "bad");
    } catch(err) { toast("連線失敗，請稍後再試", "bad"); }
    return tick();
  }
  // 設定頁
  if (t.closest("[data-tg]")) return tgModal().then(() => tgStatus(view()));
  if (t.closest("[data-sky]")) return skyModal().then(() => skyStatus(view()));
  if (t.closest("[data-pk]")) return pkModal().then(() => pkStatus(view()));
  if (t.closest("[data-pin]")) return pinModal().then(() => pinStatus(view()));
  if (t.closest("[data-sess]")) return sessModal().then(() => sessStatus(view()));
  if (t.closest("[data-shows]")) return showsModal();
  if (t.closest("[data-pair]")) return pairModal().then(() => pairStatus(view()));
  const bk = t.closest("[data-bk]");
  if (bk) return bkModal(bk.dataset.bk, bk.dataset.label).then(() => bkStatus(view()));
  const nt = t.closest("[data-newtok]");
  if (nt) return newToken(nt.dataset.newtok, nt.dataset.label);
  const sc = t.closest("[data-selfcheck]");
  if (sc) { sc.disabled = true; SELFCHK = true; selfPaint(view()); return selfStatus(view(), true).finally(() => { sc.disabled = false; SELFCHK = false; selfPaint(view()); }); }   // 按鈕的字不變（使用者要求），狀態寫在下面
  const su = t.closest("[data-selfup]");
  if (su) return selfUpdate(view(), su.dataset.selfup === "*" ? null : [{node: su.dataset.selfup, kind:"self"}]);
  const sk = t.closest("[data-secchk]");
  if (sk) return secModal(sk.dataset.secchk);
  const cu = t.closest("[data-cloudup]");
  if (cu) return selfUpdate(view(), [{node: cu.dataset.cloudup, kind:"cloud"}]);
  const pv = t.closest("[data-val]");
  if (pv) {
    const raw = pv.dataset.val, k = pv.dataset.pref;
    if (String(getP(k)) === raw) return;
    setP(k, /^\d+$/.test(raw) ? +raw : raw);
    return changed(k);
  }
  if (t.closest("[data-reset]")) {
    PREF = JSON.parse(JSON.stringify(DEF)); store("vps-prefs", JSON.stringify(PREF));
    smooth(() => { applyPrefs(); if (LIST.length) render(LIST); });
    restart(); return toast("已恢復預設值");
  }
  if (t.closest("[data-dhome]")) {
    DSEL = ""; sstore("vs-dsel", "");
    if (TAB !== "home") return setTab("home");
    scrollTo(0, 0); return render(LIST);
  }

}

/* ═════════ 機場起降：畫面程式在 web/fly.js，用到才下載（首頁打開比較快） ═════════ */
const FLYK = "vs-fly";                                    // 記住選的機場和分頁
const FLYS = (() => { try { return {ap:"", tab:"arr", ...JSON.parse(store(FLYK) || "{}")}; } catch(e) { return {ap:"", tab:"arr"}; } })();
const FLYFMT = {};                                         // 每個時區的時間格式只建一次（每次都建很慢）
const flyHM = (t, tz) => { const k = tz || "";
  if (!FLYFMT[k]) { try { FLYFMT[k] = new Intl.DateTimeFormat("zh-TW", {hour:"2-digit", minute:"2-digit", hourCycle:"h23", timeZone: tz || undefined}); } catch(e) { FLYFMT[k] = new Intl.DateTimeFormat("zh-TW", {hour:"2-digit", minute:"2-digit", hourCycle:"h23"}); } }
  return FLYFMT[k].format(t); };
const SHARE = (m => m ? "fs_" + m[1] : location.pathname === "/fly" ? new URLSearchParams(location.hash.slice(1)).get("s") || "" : "")(location.pathname.match(/^\/s\/([A-Za-z0-9]{8})$/));   // /s/八碼；以前的 /fly#s=…照樣能用
const FLYV = "/*@flyv*/";                                 // fly.js 的版本：換版本瀏覽器才重拿
let FLYLIB = null;
function flyLib(){
  return FLYLIB || (FLYLIB = new Promise((ok, no) => {
    const s = document.createElement("script"); s.src = "/fly.js?v=" + FLYV;
    s.onload = ok; s.onerror = () => { FLYLIB = null; s.remove(); no(); };   // 載入失敗：下次再試
    document.head.appendChild(s);
  }));
}
function flyEnter(btn){ return typeof flyOpen === "function" ? flyOpen(btn) : flyLib().then(() => flyOpen(btn), () => toast("機場起降打不開，請再試一次", "bad")); }
/* ═════════ 定時抓資料 ═════════ */
let timer;
const T0 = performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms));
let BOOTED = false, REFRESHING = false;
function splashMsg(t){ const m = document.querySelector(".sp-msg"); if (m && m.textContent !== t) m.innerHTML = `<span>${esc(t)}</span>`; }
function endSplash(){
  if (BOOTED) return; BOOTED = true;
  setTimeout(() => flyLib().catch(() => {}), 1200);   // 進站穩定後先在背景預載機場起降程式，點下去零等待秒開
  const sp = $("#splash"); document.documentElement.classList.remove("booting");
  if (!sp) return;
  if (!canAnim()) return sp.remove();
  sp.classList.add("out"); setTimeout(() => sp.remove(), 650);
}
/* 預先載入國旗圖片，避免畫面出來後才一個個冒出來 */
function preloadFlags(list){
  if (!PREF.show.flag) return Promise.resolve();
  const ccs = [...new Set(list.map(s => s.geo && s.geo.cc).filter(c => /^[A-Z]{2}$/.test(c || "")))];
  return Promise.all(ccs.map(cc => new Promise(res => {
    const im = new Image(); im.onload = () => (im.decode ? im.decode().catch(()=>{}) : Promise.resolve()).then(res);
    im.onerror = () => { FLAGFAIL[cc] = 1; res(); }; im.src = `/flag/${cc.toLowerCase()}.png`;
  })));
}
/* 背景讀到的資料（24 小時／7 天的曲線）：等畫面空下來再換上去 */
async function whenIdle(){ await settle(); if (LIST.length) render(LIST); }
/* 等介面動畫（收起、展開、移位）播完再更新畫面，最多等 0.9 秒，避免兩邊搶著動 */
const UIIN = new Set(["through", "slideR", "slideL", "sheetIn", "sheetOut", "rise", "pop"]);   // 換分頁、換主機、開啟／收合整頁時的 CSS 動畫
function uiBusy(){ return document.getAnimations().some(a => (a.id === "ui" || UIIN.has(a.animationName)) && a.playState === "running"); }
/* 手指還在畫面上、或頁面還在滑：新資料先等一下，滑停了才換上去，捲動時不會卡一下 */
let SCRT = 0, TOUCH = 0;
document.addEventListener("scroll", () => {
  const now = performance.now();
  if (now - SCRT > 200) for (const a of document.getAnimations()) if (a.transitionProperty === "width") a.finish();   // 剛開始滑：還在伸縮的進度條直接到位
  SCRT = now;
}, {passive:true, capture:true});
addEventListener("touchstart", () => { TOUCH = 1; }, {passive:true});
addEventListener("touchend", e => { if (!e.touches.length) TOUCH = 0; }, {passive:true});
addEventListener("touchcancel", () => { TOUCH = 0; }, {passive:true});
const scrolling = () => TOUCH || performance.now() - SCRT < 200;
async function settle(){
  const t0 = performance.now();
  for (;;) {
    const w = performance.now() - t0;
    if (!(uiBusy() && w < 900) && !(scrolling() && w < 4000)) break;
    await sleep(60);
  }
  await new Promise(r => requestAnimationFrame(r));       // 對齊下一格畫面再改
}
/* 30 分鐘的圖表資料：主機只傳上次之後的新點，這邊接起來（每台每次只多一兩筆，不用整段重傳） */
const HIST = {};
function histJoin(list){
  const seen = new Set();
  for (const s of list) {
    const k = keyOf(s), h = s.hist, o = HIST[k];
    seen.add(k);
    if (!h || !Array.isArray(h.t)) { if (o) s.hist = o; continue; }
    let m = h;
    if (h.part && o) {
      const last = o.t[o.t.length - 1] || 0, add = h.t.map((t, i) => t > last ? i : -1).filter(i => i >= 0);
      m = {};
      for (const f of Object.keys(o)) m[f] = o[f].concat(add.map(i => (h[f] || [])[i]));
      const end = m.t[m.t.length - 1] || 0, cut = m.t.findIndex(t => t >= end - 1800);
      if (cut > 0) for (const f of Object.keys(m)) m[f] = m[f].slice(cut);
      if (!add.length) m = o;                       // 沒有新的：用同一份，畫面就知道不用重畫
    } else if (h.part) { delete HIST[k]; s.hist = null; continue; }   // 這邊沒有前面的（不該發生）：下次整段要
    else { m = {}; for (const f of Object.keys(h)) if (f !== "part") m[f] = h[f]; }
    HIST[k] = m; s.hist = m;
  }
  for (const k in HIST) if (!seen.has(k)) delete HIST[k];
}
let TICKID = 0;
/* 舊版存著的存取密碼、舊版 localStorage 登入鑰匙、或一鍵登入網址：一律換成主機 HttpOnly Cookie，瀏覽器儲存區不再留鑰匙 */
async function upgradeTok(){
  let r;
  const cur = getTok(), keep = !!(window._t0_keep || store(KEY));
  window._t0_keep = false;
  if (/^vss_/.test(cur)) {
    try { r = await fetch("/api/session-cookie", {method:"POST", headers:{"X-Token":cur, "Content-Type":"application/json"}, cache:"no-store", body:"{}"}); }
    catch(e) { return true; }
    if (r.status === 401) { setTok(""); endSplash(); login("請重新登入"); return false; }
    if (r.ok) setTok("cookie", keep);
    return true;
  }
  await DEVP;
  try { r = await fetch("/api/login", {method:"POST", headers:{"Content-Type":"application/json"}, cache:"no-store",
    body:JSON.stringify({pw:cur, keep, dev:devLabel(), os:devOs()})}); }
  catch(e) { return true; }                                     // 連不上：照舊用，等一下 tick 自己會處理
  if (r.status === 401) { setTok(""); endSplash(); login("密碼不對，再試一次"); return false; }
  const d = await r.json().catch(() => ({}));
  if (d.ok && d.token) setTok("cookie", keep);
  return true;
}
async function tick(){
  clearTimeout(timer);
  const id = ++TICKID;                          // 同時有好幾個在讀：只用最新的那一次，舊的結果不畫
  const rq = new URLSearchParams(location.search).get("restore");
  if (rq) { RSW.code = rq.trim().toUpperCase(); sessionStorage.setItem("vs-rsw", RSW.code); history.replaceState(null, "", location.pathname); }
  if (RSW.code) return restoreScreen();
  if (!getTok()) { endSplash(); return login(); }
  if (getTok() !== "cookie" && !await upgradeTok()) return;
  if (document.hidden && LIST.length) return true;   // 已經切到背景：不抓也不畫，回來時馬上更新
  try {
    if (!BOOTED) splashMsg("讀取主機狀態…");
    const since = Object.fromEntries(Object.entries(HIST).map(([k, h]) => [k, h.t[h.t.length - 1]]).filter(x => x[1]));
    const r = await fetch("/api/all" + (Object.keys(since).length ? "?since=" + encodeURIComponent(JSON.stringify(since)) : ""), {headers:{"X-Token":getTok()}, cache:"no-store", signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined});   // 網路卡住最多等 20 秒，不會一直轉
    if (id !== TICKID || !getTok()) return true;
    if (r.status === 401) { const was = getTok(); setTok(""); LIST = []; for (const k in HIST) delete HIST[k]; endSplash(); return login(was === "cookie" || /^vss_/.test(was) ? "請重新登入" : "密碼不對，再試一次"); }
    if (r.status === 403 && (await r.clone().json().catch(() => ({}))).mustpin) {   // 還在用臨時 PIN 碼：先換掉
      if (id !== TICKID || !getTok()) return true;
      endSplash(); if (window._mustPin) return true;
      window._mustPin = 1; await pinModal(true); window._mustPin = 0; return tick();
    }
    if (!r.ok) throw new Error("無法讀取主機狀態");
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error("無法讀取主機狀態");
    if (id !== TICKID || !getTok()) return true;
    LOST0 = 0; if (LOST) { LOST = false; document.documentElement.classList.remove("lost"); }   // 又連上了：數字恢復、標題照實際狀況
    histJoin(data);
    const me = data.find(x => !x.node);
    if (window._fresh) { window._fresh = false; fetch("/api/pin", {method:"POST", headers:{"X-Token":getTok()}, body:'{"action":"login"}'}).catch(() => {}); }  // 登入成功：PIN 碼輸錯的次數歸零
    if (new URLSearchParams(location.search).get("go") === "cloud" && me && me.cloud && !window._goCloud) {   // 直接打開雲端硬碟的網址：驗證好了就送回去
      window._goCloud = true;
      history.replaceState(null, "", location.pathname + location.hash);
      setTimeout(() => openCloud(me, true), 900);
    }
    const tz = -new Date().getTimezoneOffset();
    if (me && "bk_tz" in me && me.bk_tz !== tz && !window._tzSent) {   // 備份檔名上的時間跟這支手機／電腦一樣（所有主機一起用）
      window._tzSent = true;
      fetch("/api/backup", {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify({action:"tz", tz})}).catch(() => {});
    }
    if (me && me.build) {
      if (!window._build) {
        window._build = me.build;
        const stale = UPW.jobs.filter(j => !j.node && j.kind === "self" && j.from && j.from !== me.build);
        if (stale.length) {
          UPW.jobs = UPW.jobs.filter(j => !stale.includes(j));
          UPW.rows.filter(r => r.k === "|self").forEach(r => { r.st = "done"; });
          if (!UPW.jobs.length && !UPW.wait.length) { UPW.show = false; UPW.rows = []; }
          upwSave();
        }
      } else if (me.build !== window._build) upwReload(`哨站已更新到 ${me.version} ✨`);   // 這台的哨兵剛更新好：重新載入換上新畫面
    }
    if (!BOOTED) {
      splashMsg("準備畫面…");
      // 字型和國旗最多等 1.5 秒；啟動畫面至少顯示 0.7 秒，避免一閃而過
      await Promise.race([Promise.all([document.fonts ? document.fonts.ready : null, preloadFlags(data)]), sleep(1500)]);
      const wait = 700 - (performance.now() - T0); if (wait > 0) await sleep(wait);
      endSplash();
      const um = sstore("vs-upmsg"); if (um) { sstore("vs-upmsg", ""); setTimeout(() => toast(um), 500); }   // 剛重新載入：說一聲換成哪一版
      if (UPW.show && (UPW.jobs.length || UPW.wait.length)) setTimeout(upvOpen, 600);   // 還有別台在更新：進度視窗接著開
      else if (UPW.rows.length) { UPW.rows = []; UPW.show = false; upwSave(); }
      upwRun();
      setTimeout(prewarmSet, 450);               // 背景預先抓好設定頁狀態，滑過去時整頁不跳一下
      setTimeout(wxRun, 1200);                   // 畫面出來後再問位置、抓天氣，不拖慢開啟
    }
    if (BOOTED) await settle();
    if (id !== TICKID || !getTok()) return true;  // 等的時候登出了，或已經有更新的一次
    if (document.hidden && BOOTED) return true;    // 抓到一半切到背景：先不畫（資料留到回來那次一起畫）
    lastUpdate = new Date().toLocaleTimeString("zh-TW", {hour12:false});
    render(data);
  } catch(e) {
    if (id !== TICKID) return false;
    if (!BOOTED) splashMsg("連線不上，正在重試…");
    const m = document.querySelector(".meta"); if (m && !LOST) m.innerHTML = `<span class="live off"></span>連線中斷，重試中…`;
    if (!LOST0) LOST0 = Date.now();
    if (!LOST && LIST.length && Date.now() - LOST0 > 15000) {   // 連不上超過 15 秒：標題改「連不上主機」、畫面上的數字變淡（都是舊的）
      LOST = true; document.documentElement.classList.add("lost"); render(LIST);
    }
    if (!(document.hidden && LIST.length)) timer = setTimeout(tick, 3000);
    return false;
  }
  if (document.hidden && LIST.length) return true;   // 看不到（切到別的分頁、App 在背景）：先不更新，回來馬上更新
  const busy = LIST.some(s => s.update && s.update.running);   // 更新中就看得勤一點
  timer = setTimeout(tick, busy ? 2000 : (PREF.refresh || 5) * 1000);
  return true;
}
/* 載入中的形狀（Material 3 的載入圖形）：一邊轉一邊在幾種圓潤形狀之間彈性變形；
   停下來時從當下的角度繼續往前轉到定位、形狀平順變回去，不會一下子跳回原樣 */
const LDSH = [blobSh(4, .2), blobSh(6, .3), blobSh(12, .18), blobSh(5, .24)];
const angOf = el => { const m = new DOMMatrix(getComputedStyle(el).transform); return (Math.atan2(m.b, m.a) * 180 / Math.PI + 360) % 360; };
function loader(el, a0 = 0){
  if (!canAnim() || !el) return () => {};
  const rest = el.style.clipPath || getComputedStyle(el).clipPath, seq = [rest, ...LDSH], n = seq.length;
  const k = seq.map((c, i) => ({clipPath: c, transform: `rotate(${a0 + i * 144}deg)`, easing: SPRING}));
  k.push({clipPath: rest, transform: `rotate(${a0 + n * 144}deg)`});
  const an = el.animate(k, {duration: T.mid * 1.2 * n, iterations: Infinity});
  return (to = el.style.clipPath || rest) => {
    const cp = getComputedStyle(el).clipPath, ang = angOf(el);
    let end = ang - ((ang - a0) % 360 + 360) % 360 + 360; if (end - ang < 60) end += 360;   // 往前轉到跟原本一樣的角度
    an.cancel(); el.style.clipPath = to;
    return el.animate([{clipPath: cp, transform: `rotate(${ang}deg)`}, {clipPath: to, transform: `rotate(${end}deg)`}],
      {duration: T.sp, easing: SPRING}).finished.catch(() => {});
  };
}
/* 圖示線條描繪動畫。 */
function drawIn(svg, delay = 0){
  if (!canAnim() || !svg) return;
  svg.querySelectorAll("path,circle").forEach((x, i) => x.animate([{strokeDasharray: "1 1", strokeDashoffset: 1}, {strokeDasharray: "1 1", strokeDashoffset: 0}],
    {duration: T.slow, delay: delay + i * T.fast * .6, easing: EASE, fill: "backwards"}));
}
/* 按鈕在載入中的樣子；回傳「停下來」 */
function busy(btn){
  if (!canAnim()) return () => {};
  if (btn.classList.contains("blob")) {
    const bf = btn.querySelector(".bf"), g0 = btn.querySelector(".bg"), stop = loader(bf);
    const hide = g0.animate([{opacity: 1, transform: "none"}, {opacity: 0, transform: "scale(.4)"}], {duration: T.fast, easing: EASE, fill: "forwards"});
    return () => {
      stop(); hide.cancel();
      const g = btn.querySelector(".bg");
      g.animate([{opacity: 0, transform: "scale(.4)"}, {opacity: 1, transform: "none"}], {duration: T.sp, easing: SPRING, fill: "backwards", delay: T.fast * .5});
      drawIn(g.querySelector("svg"), T.fast * .5);
    };
  }
  const svg = btn.querySelector("svg");
  if (!svg) return () => {};
  const an = svg.animate([{transform: "rotate(0)"}, {transform: "rotate(360deg)"}], {duration: T.long, iterations: Infinity, easing: EASE});
  return () => { const ang = angOf(svg); an.cancel(); svg.animate([{transform: `rotate(${ang}deg)`}, {transform: "rotate(360deg)"}], {duration: T.sp, easing: SPRING}); };
}
/* 手動重新整理（按鈕或下拉） */
async function refreshNow(btn){
  if (REFRESHING) return; REFRESHING = true;
  const stop = btn ? busy(btn) : () => {};
  try { const [ok] = await Promise.all([tick(), sleep(T.long)]); return ok; }
  finally { REFRESHING = false; stop(); }   // 出錯也一定要停下來，不然之後都不能再重新整理
}
/* 手機：畫面中間左右滑，整頁跟手滑動並無縫接續換分頁（僅在有效觸控期間動態掛載 touchmove，平時不拖慢 iOS 捲動與點擊） */
(function(){
  let x0 = null, y0 = 0, t0 = 0, dx = 0, baseX = 0, lock = 0, v = null, tgt = null, on = false;
  const unbind = () => {
    if (!on) return; on = false;
    removeEventListener("touchmove", onMove); removeEventListener("touchend", onEnd); removeEventListener("touchcancel", onCancel);
  };
  const reset = anim => {
    unbind();
    const el = v, cur = dx; x0 = null; dx = baseX = 0; lock = 0; v = null; tgt = null;
    if (!el) return;
    el.style.transform = "";
    if (anim && canAnim() && Math.abs(cur) > 1) el.animate([{transform:`translateX(${cur}px)`}, {transform:"none"}], {duration:T.fast, easing:DEC, id:"tab-gesture"});
  };
  const onMove = e => {
    if (x0 === null || !v || e.touches.length > 1) return reset(false);
    const t = e.touches[0], mx = (t.clientX - x0) / ZM(), my = (t.clientY - y0) / ZM();
    if (!v.isConnected) return reset(false);
    if (!lock) {
      if (Math.hypot(mx, my) < 10) return;
      if (Math.abs(mx) > Math.abs(my) * 1.4) {
        for (let el = tgt; el && el !== document.body; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return reset(false);
        const transform = getComputedStyle(v).transform;
        baseX = transform === "none" ? 0 : new DOMMatrix(transform).e;
        v.getAnimations().filter(a => a.id === "ui" || a.id === "tab-gesture").forEach(a => a.cancel());
        lock = 1;
      } else return reset(false);
    }
    if (e.cancelable) e.preventDefault();
    const ks = TABS.map(([k]) => k), idx = ks.indexOf(TAB);
    const edge = (mx > 0 && idx === 0) || (mx < 0 && idx === ks.length - 1);
    dx = baseX + (edge ? mx * .18 : Math.sign(mx) * (88 * (1 - Math.exp(-Math.abs(mx) / 130))));
    if (canAnim()) v.style.transform = `translateX(${dx}px)`;
  };
  const onEnd = e => {
    if (x0 === null) return unbind();
    const t = e.changedTouches[0], rawDx = (t.clientX - x0) / ZM(), rawDy = (t.clientY - y0) / ZM();
    const dt = Math.max(1, performance.now() - t0), vel = Math.abs(rawDx) / dt;
    const ks = TABS.map(([k]) => k), dir = rawDx < 0 ? 1 : -1, next = ks.indexOf(TAB) + dir;
    const go = next >= 0 && next < ks.length && (lock === 1 ? (Math.abs(rawDx) > 56 || (Math.abs(rawDx) > 24 && vel > .45)) : (Math.abs(rawDx) >= 60 && Math.abs(rawDx) >= Math.abs(rawDy) * 1.8 && dt < 700));
    if (go) {
      unbind();
      SWIPEX = dx;
      if (v) v.style.transform = "";
      x0 = null; dx = baseX = 0; lock = 0; v = null; tgt = null;
      setTab(ks[next]);
      SWIPEX = 0;
    } else reset(true);
  };
  const onCancel = () => reset(true);
  addEventListener("touchstart", e => {
    if (on) reset(false);
    if (DESK.matches || $("#fly") || window._menu || e.touches.length > 1 || document.querySelector("#layer .veil") || !LIST.length) return;
    const t = e.touches[0];
    if (t.clientX < 28 || t.clientX > innerWidth - 28) return;
    if (e.target.closest("input,textarea,select,canvas,.cbox,.inv-nav,.inv-settings-tabs,[data-noswipe],.fhrs,.fterm")) return;
    x0 = t.clientX; y0 = t.clientY; t0 = performance.now(); tgt = e.target; v = view(); on = true;
    addEventListener("touchmove", onMove, {passive:false});
    addEventListener("touchend", onEnd, {passive:true});
    addEventListener("touchcancel", onCancel, {passive:true});
  }, {passive:true});
})();
/* 按下去的水波紋與彈簧按壓回饋（觸控快速輕點不阻塞 click 前強制排版；長按或滑鼠才疊水波紋） */
(function(){
  const SEL = ".hcard,.li:not(div),.fapc,.ubtn,.iconbtn,.icbtn,.hmenu button,.addhost,.trf,.chats button,.sw button,.rh,.backbtn,.tbx,.side-icbtn";
  const PRESS_DESK = ".ubtn,.iconbtn,.icbtn,.rh,.backbtn,.tbx,.addhost,.fapc,.side-icbtn";
  addEventListener("pointerdown", e => {
    if (e.button || !canAnim()) return;
    const el = e.target.closest(SEL);
    if (!el || el.disabled || el.closest(".pane")) return;
    const touch = e.pointerType !== "mouse", wantPrs = touch || el.matches(PRESS_DESK), pid = e.pointerId, x0 = e.clientX, y0 = e.clientY;
    let box = null, done = false, t0 = 0;
    const press = () => { if (t0) return; if (wantPrs) el.classList.add("prs"); t0 = performance.now(); };
    const release = now => { if (wantPrs && t0) setTimeout(() => el.classList.remove("prs"), now ? 0 : Math.max(0, (touch ? 75 : 120) - (performance.now() - t0))); };
    const ripple = () => {
      press();
      if (box || el.closest(".sw") || el.classList.contains("side-icbtn")) return;   // 圓形色塊與側欄小圖示不疊大水波紋
      const r = el.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      const x = (x0 - r.left) * w / (r.width || 1), y = (y0 - r.top) * h / (r.height || 1);
      const R = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
      box = document.createElement("span"); box.className = "rip"; box._leaving = 1;
      const dot = document.createElement("i"); dot.style.cssText = `left:${x - R}px;top:${y - R}px;width:${2 * R}px;height:${2 * R}px`;
      box.appendChild(dot); el.appendChild(box);
      dot.animate([{transform:"scale(.18)"}, {transform:"scale(1)"}], {duration:T.slow, easing:EASE, fill:"forwards"});
    };
    const fade = () => box && box.animate([{opacity:1}, {opacity:0}], {duration:T.mid, delay:T.fast / 2, easing:EASE, fill:"forwards"}).finished.then(() => box.remove(), () => box.remove());
    const tPrs = !touch ? (ripple(), 0) : setTimeout(() => { if (!done) press(); }, 20);
    const tRip = !touch ? 0 : setTimeout(() => { if (!done) ripple(); }, 90);
    const cleanup = () => { clearTimeout(tPrs); clearTimeout(tRip); removeEventListener("pointerup", end); removeEventListener("pointercancel", end); removeEventListener("pointermove", move); };
    const cancel = () => { if (done) return; done = true; cleanup(); release(true); fade(); };
    const move = ev => { if (ev.pointerId === pid && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) cancel(); };
    const end = ev => {
      if (ev.pointerId !== pid || done) return;
      done = true; cleanup();
      if (ev.type === "pointercancel") { release(true); if (!box) return; }
      else release(false);
      fade();
    };
    addEventListener("pointerup", end); addEventListener("pointercancel", end);
    if (touch) addEventListener("pointermove", move, {passive:true});
  }, {passive:true});
})();
/* 手機：從下面滑上來的面板，從頂端往下拉就關掉（綁在 #layer 且動態掛載 touchmove，平時不干擾全域捲動） */
(function(){
  const SHEET = matchMedia("(max-width:599px)"), L = $("#layer");
  if (!L) return;
  let d = null, on = false;
  const unbind = () => {
    if (!on) return; on = false;
    removeEventListener("touchmove", onMove); removeEventListener("touchend", onEnd); removeEventListener("touchcancel", snap);
  };
  const snap = () => {
    unbind();
    if (!d) return; const {dl, dy, on:drag} = d; d = null;
    if (!drag) return;
    dl.style.transform = "";
    if (canAnim() && dy > 0) dl.animate([{transform:`translateY(${dy}px)`}, {transform:"none"}], {duration:T.spf, easing:SPRING_F});
  };
  const onMove = e => {
    if (!d) return unbind();
    d.dy = (e.touches[0].clientY - d.y0) / ZM();
    if (!d.on && (d.dy < 0 || d.dl.scrollTop > 0)) { d = null; return unbind(); }      // 往上滑：是要捲動內容
    if (d.dy > 6) d.on = true;
    if (d.on) { if (e.cancelable) e.preventDefault(); d.dl.style.transform = `translateY(${Math.max(0, d.dy)}px)`; }
  };
  const onEnd = () => {
    unbind();
    if (!d) return; const {dl, v, dy, t0, on:drag} = d; d = null;
    if (!drag) return;
    if (dy > 110 || dy / (performance.now() - t0) > .6) { if (v._esc) { v.classList.add("flung"); return v._esc(); } }   // 拉得夠遠或甩得夠快：關掉
    dl.style.transform = "";
    if (canAnim()) dl.animate([{transform:`translateY(${dy}px)`}, {transform:"none"}], {duration:T.spf, easing:SPRING_F});
  };
  L.addEventListener("touchstart", e => {
    const dl = e.target.closest("#layer .veil .dialog"), v = dl && dl.parentNode;
    if (!SHEET.matches || !dl || dl.scrollTop > 0 || !dl.querySelector(".form") || v.classList.contains("closing") || e.target.closest("input,textarea,select")) return;
    d = {dl, v, y0:e.touches[0].clientY, t0:performance.now(), dy:0, on:false}; on = true;
    addEventListener("touchmove", onMove, {passive:false});
    addEventListener("touchend", onEnd, {passive:true});
    addEventListener("touchcancel", snap, {passive:true});
  }, {passive:true});
})();
document.addEventListener("visibilitychange",()=>{ if(!document.hidden && LIST.length && getTok()) tick(); });   // 登入、還原畫面不要重畫（打到一半的密碼、選好的檔案會不見）
SHARE ? flyLib().then(() => shareBoot(), () => setTimeout(() => location.reload(), 3000)) : tick();
/* 不是按鈕但點得動的（IP、備份密碼、還原指令）：用鍵盤選到後按 Enter 或空白鍵也行 */
document.addEventListener("keydown", e => {
  const t = e.target;
  if ((e.key === "Enter" || e.key === " ") && t.matches && t.matches('[role="button"]:not(button)')) { e.preventDefault(); t.click(); }
});
