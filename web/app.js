const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function store(k, v){ try { if (v === undefined) return localStorage.getItem(k) || ""; v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch(e){ return ""; } }
const KEY = "vps-sentinel-token";
/* 從主畫面、安卓 App 打開（沒有網址列）：手機分頁列浮在下面；瀏覽器裡放上面（style.css 的 .full） */
if (navigator.standalone || matchMedia("(display-mode: standalone)").matches || typeof VSApp !== "undefined" || /; wv\)/.test(navigator.userAgent))
  document.documentElement.classList.add("full");
/* 登入狀態：勾「30 天內不用再登入」存在這台裝置 30 天；沒勾的話關掉瀏覽器（或 App）就要重新登入 */
const DAY30 = 30 * 86400000;
function sstore(k, v){ try { if (v === undefined) return sessionStorage.getItem(k) || ""; v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch(e){ return ""; } }
function getTok(){
  const t = store(KEY);
  if (t) {
    const exp = +store(KEY + "-exp");
    if (!exp) store(KEY + "-exp", String(Date.now() + DAY30));      // 舊版存的：從現在開始算 30 天
    else if (exp < Date.now()) { store(KEY, ""); store(KEY + "-exp", ""); return sstore(KEY) || ""; }
    return t;
  }
  return sstore(KEY) || window._tok || "";
}
function setTok(t, remember){
  if (remember === undefined) remember = !!store(KEY) || !sstore(KEY);   // 換密碼時：維持原本的記住方式和期限
  else store(KEY + "-exp", remember && t ? String(Date.now() + DAY30) : "");
  store(KEY, remember ? t : ""); sstore(KEY, remember ? "" : t);
  if (!t) store(KEY + "-exp", "");
  window._tok = t;
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
if (window._t0) { setTok(window._t0, true); window._t0 = ""; }   // 網址上的密碼已經在 index.html 最前面拿掉了

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
  plug:'<path d="M9 2v5M15 2v5"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  clock:'<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  power:'<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  loc:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  mpin:'<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  plane:'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  tack:'<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  off:'<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M2 2l20 20"/>',
};
P.server = '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>';
P.palette = '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 9.8C22 6 17.5 3 12 3z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15.5" cy="7.5" r="1"/>';
const I = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;

/* ═════════ 個人設定（存在這台裝置） ═════════ */
const DEF = {theme:"auto", accent:"blue", tone:"soft", motion:true, size:"m", refresh:5,
  show:{chart:true, net:true, items:true, info:true, flag:true, traffic:true, weather:true, quote:true}};
let PREF = (() => { try { const p = JSON.parse(store("vps-prefs") || "{}"); if (p.accent === "flag") p.accent = "rainbow";   /* 舊的「旗」換成彩虹 */ return {...DEF, ...p, show:{...DEF.show, ...(p.show||{})}}; } catch(e){ return JSON.parse(JSON.stringify(DEF)); } })();
const getP = k => k.split(".").reduce((o,x)=>o && o[x], PREF);
function setP(k, v){ const ks = k.split("."); let o = PREF; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; store("vps-prefs", JSON.stringify(PREF)); }
const DARKQ = matchMedia("(prefers-color-scheme: dark)");
function applyPrefs(){
  const h = document.documentElement, dark = PREF.theme === "dark" || (PREF.theme === "auto" && DARKQ.matches);
  h.dataset.mode = dark ? "dark" : "light"; h.dataset.accent = PREF.accent; h.dataset.tone = PREF.tone; h.dataset.motion = PREF.motion ? "on" : "off";
  h.style.setProperty("--zoom", {s:.92, m:1, l:1.1}[PREF.size] || 1);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#121317" : "#fbfbfe";
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
function avatar(s){
  const f = PREF.show.flag && s.geo ? flag(s.geo.cc) : "";
  const lv = lvOf(s), tip = {ok:"", warn:"需要留意", bad:"出問題了"}[lv];
  const inner = f ? `<span class="fw">${f}</span>` : `<span class="fw round"><span class="letter">${esc([...(s.name||"?")][0])}</span></span>`;
  return `<div class="avatar ${lv}" title="${tip}">${inner}</div>`;
}
const safeUrl = u => /^https?:\/\/[^\s"'<>]+$/i.test(u || "") ? u : "";
const linksOf = s => (s.links || (s.panel ? [{name:"管理後台", url:s.panel}] : []))
  .map(x => x.fixed && s.cloud ? {...x, url: cloudHref(s.cloud), sso: keyOf(s)} : x).filter(x => safeUrl(x.url));   // 雲端硬碟：點了用一次性登入票打開
/* 雲端硬碟：每次打開都要先驗證 PIN 碼、手機金鑰或密碼，過了主機才給一次性登入票（用表單送出，不放在網址上） */
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
  [/Oracle|太閒/, "cpu", () => "太閒"]];
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
  const defs = series.map((s,i)=>`<linearGradient id="${id}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:${o.fade??.3}"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient>`).join("");
  const sl = tf ? ` data-tf="${tf}"` : "";
  const body = series.map((s,i)=>{ const p = pathOf(s.data, W, H, max, xs); if (!p) return "";
    return `<path d="${p.area}"${sl} fill="url(#${id}${i})"/><path d="${p.line}"${sl} fill="none" style="stroke:${s.color}" stroke-width="${o.sw||2.4}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="miter"/>`; }).join("");
  return `<svg class="chart" ${o.t?`data-cid="${id}"`:""} viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px"><defs>${defs}</defs>${g}${body}</svg>${yax}`;
}
let RANGE = ["30m","24h","7d"].includes(store("vps-range")) ? store("vps-range") : "30m";
const HCACHE = {}, SHOWN = {};
function rangeSeg(){
  return `<span class="rng" style="--k:${["30m","24h","7d"].indexOf(RANGE)}">${[["30m","30分"],["24h","24時"],["7d","7天"]].map(([v,l])=>`<button class="${RANGE===v?"on":""}" data-range="${v}">${l}</button>`).join("")}</span>`;
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
  flag:["flag","flag"], keep:["keep","shield"], key:["key","key"], finger:["finger","finger"], pin:["pin","pin"], link:["link","link"], archive:["archive","archive"], sun:["sun","sun"], quote:["quote","quote"], dl:["dl","dl"], cloud:["cloud","cloud"], fly:["fly","plane"], devices:["devices","devices"]};
const IC = (k, cls="sm") => `<span class="ico ${cls} ${ICO[k][0]}">${I(ICO[k][1])}</span>`;

/* ═════════ 共用的小元件 ═════════ */
/* 標誌：主題色的圓角方塊＋白色盾牌 */
const LOGOSVG = id => `<svg viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lb${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--seed) 70%,#fff)"/><stop offset="1" style="stop-color:color-mix(in srgb,var(--seed) 82%,#000)"/></linearGradient><mask id="lm${id}"><rect width="512" height="512" fill="#fff"/><path d="M204 258l36 36 72-76" fill="none" stroke="#000" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="512" height="512" rx="128" fill="url(#lb${id})"/><path d="M256 108 371 150c9 3 15 12 15 22v72c0 84-52 140-122 168-5 2-11 2-16 0-70-28-122-84-122-168v-72c0-10 6-19 15-22Z" fill="#fff" mask="url(#lm${id})" transform="translate(256 262) scale(.88) translate(-256 -258)"/></svg>`;
const BRAND = LOGOSVG("br");
const CHEV = I("chev").replace("<svg", '<svg class="chev"'), EXT = I("ext").replace("<svg", '<svg class="ext"');
/* 波浪進度條：波浪那段會慢慢往前流，數字變了寬度用彈簧變過去 */
const WAVE = (() => { let d = "M0 6"; for (let x = 0; x < 480; x += 12) d += ` Q${x + 6} ${x % 24 ? 12 : 0} ${x + 12} 6`;
  return `<svg viewBox="0 0 480 12" aria-hidden="true"><path d="${d}"/></svg>`; })();
const wave = (pct, t = tier(pct)) => `<div class="wv ${t}" style="--v:${Math.max(0, Math.min(100, +pct || 0)).toFixed(1)}%"><div class="wf"><div class="wq">${WAVE}</div></div><i class="wr"><i></i></i></div>`;
/* 首頁的狀態圖形：正常是圓潤的餅乾形、注意是尖一點的太陽形、異常是更尖的星形；點數一樣，換狀態時會平順變形 */
const blobSh = (k, a) => `polygon(${Array.from({length:96}, (_, i) => { const t = i / 96 * 2 * Math.PI, r = 50 * (1 - a * (1 - Math.cos(k * t)) / 2);
  return `${(50 + r * Math.sin(t)).toFixed(2)}% ${(50 - r * Math.cos(t)).toFixed(2)}%`; }).join(",")})`;
const BLOB = {ok: blobSh(9, .1), warn: blobSh(12, .2), bad: blobSh(6, .32)};
/* 圖示的線條加上 pathLength，才能做「一筆畫出來」的動畫 */
const drawable = svg => svg.replace(/<(path|circle)/g, '<$1 pathLength="1"');
const blobBtn = lv => `<button class="blob ${lv}" data-key="blob" data-refresh title="重新整理"><span class="bs"><span class="bf" style="clip-path:${BLOB[lv]}"></span></span><span class="bg" data-key="g:${lv}">${drawable(I({ok:"ok", warn:"alert", bad:"warn"}[lv]))}</span></button>`;
const disk0 = s => (s.disks || []).find(x => x.path === "/") || (s.disks || [])[0] || {pct:0, used:0, total:0};
const LOADW = lr => lr < .7 ? ["輕鬆", ""] : lr < 1 ? ["有點忙", "w"] : lr < 2 ? ["忙碌", "w"] : ["超載", "b"];
const WORD = {bad:"異常", warn:"注意", ok:"恢復", info:"通知"};

function greet(){
  const h = new Date().getHours();
  const hi = h < 5 ? "夜深了" : h < 11 ? "早安" : h < 14 ? "午安" : h < 18 ? "下午好" : "晚安";
  const on = PREF.show.weather && WX;
  return {hi, quote: PREF.show.quote ? quoteOf(h) : "",
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
let LOST = false, LOST0 = 0;                  // 這個網頁連不上主機：從什麼時候開始
function headline(list){
  if (LOST) return "連不上主機";
  const is = issuesOf(list), hosts = new Set(is.map(x => keyOf(x.s)));
  if (!is.length) return list.length > 1 ? `${list.length} 台主機都正常` : "主機一切正常";
  if (is.length === 1) return is[0].t ? `${is[0].s.name}・${is[0].t}` : `${is[0].s.name} 連不上`;
  if (hosts.size === 1) return `${is[0].s.name} 有 ${is.length} 件事要留意`;
  return `${hosts.size} 台主機要留意`;
}
function hero(list, time){
  const lv = list.some(s => lvOf(s) === "bad") ? "bad" : list.some(s => lvOf(s) === "warn") ? "warn" : "ok", g = greet();
  const txt = `<div class="hello meta">${LOST ? `<span class="live off"></span>連不上主機，重試中…` : `<span class="live"></span>${g.hi}・${time} 更新`}</div><h1 class="headline" data-x>${esc(headline(list))}</h1><p class="quote">${esc(g.quote)}</p>`;
  return DESK.matches
    ? `<section class="hero" data-key="hero"><div class="hrow">${blobBtn(lv)}<div class="htx">${txt}</div></div></section>`
    : `<section class="hero" data-key="hero"><div class="hrow">${blobBtn(lv)}<div class="wxw">${g.wx}</div></div>${txt}</section>`;
}

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
    if (g && g.t0 - e.t <= 600 && !g.ks.includes(e.k)) { g.hs.push(e.h); g.ks.push(e.k); g.t0 = e.t; continue; }
    const x = {...e, hs:[e.h], ks:[e.k], t0:e.t}; open.set(k, x); out.push(x);
  }
  return out.map(x => x.hs.length > 1 ? {...x, k:"*" + Math.round(x.t0), n:1} : x);
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

/* ═════════ 首頁的主機卡片（手機） ═════════ */
const mrow = (l, p, ic) => `<div class="mr"><span class="ml${ic ? ` mi ${ic}" title="${l}">${I(ic)}` : `">${l}`}</span>${wave(p)}<span class="mv ${tier(p)}">${num(p)}%</span></div>`;
function hostCard(s, i, mini){
  const lv = lvOf(s), k = keyOf(s);
  let b = `<div class="hcard ${lv}${mini ? " mini" : ""}" data-key="${esc(k)}" data-keyed data-open="${esc(k)}" role="button" tabindex="0" style="--i:${i}">
    <div class="ct" data-key="ct">${avatar(s)}<div class="nm"><div class="cn">${esc(s.name)}</div><div class="cp">${esc(place(s) || osShort(s.os))}</div></div>${mini ? "" : I("chev")}</div>`;
  if (!s.online) return b + offBox(s) + `</div>`;
  const d0 = disk0(s), ft = [PREF.show.traffic && s.traffic ? `<span title="本月流量">${I("month")}${size(s.traffic.used)}</span>` : "", `<span title="開機多久">${I("power")}${up(s.uptime)}</span>`].join("");   // 圖示＋數字，不寫「本月」「開機」
  const mr = `<div class="mrows" data-key="mr">${mrow("處理器", s.cpu, mini && "cpu")}${mrow("記憶體", s.mem.pct, mini && "mem")}${mrow("磁碟", d0.pct, mini && "disk")}</div>`;   // 一行的：字換成小圖示，名字才放得下
  if (mini) return b + mr + `<span class="mch" data-key="ch">${I("chev")}</span></div>`;
  return b + alerts(s, 1) + mr + `<div class="cfoot" data-key="cf">${ft}</div></div>`;   // 處理器、記憶體、磁碟下面那格已經變色，不再放膠囊
}
/* 主機很多時（4 台以上、而且是卡片模式）：正常的主機縮成一行（名稱＋三個數字），有狀況的照舊是大卡片 */
const MININ = 4;
function hostLists(list, wallCls){
  const mini = cardMode(list) && list.length >= MININ, big = mini ? list.filter(s => !s.online || lvOf(s) !== "ok") : list, small = mini ? list.filter(s => !big.includes(s)) : [];
  return `<div class="hosts${wallCls}" data-key="hosts" data-keyed${wallCls ? " data-grid" : ""}>${big.map((s, i) => hostCard(s, i)).join("")}</div>`
    + `<div class="minis" data-key="minis" data-keyed>${small.map((s, i) => hostCard(s, big.length + i, true)).join("")}${addHostBtn("addhost")}</div>`;
}
/* 連不上：最後連上的時間＋一條時間條（綠的是還連得上、紅斜線是斷掉之後；範圍照斷了多久換 30 分／6 小時／24 小時） */
function offBox(s){
  const d = s.last_seen ? Date.now()/1000 - s.last_seen : 1e9, span = d < 1800 ? [1800, "30 分前"] : d < 21600 ? [21600, "6 小時前"] : [86400, "24 小時前"];
  const g = Math.max(0, Math.min(1, 1 - d / span[0])).toFixed(3), err = s.error && s.error !== "連不上" ? `<div class="sub">${esc(s.error)}</div>` : "";
  return `<div class="offline" data-key="off">${I("off")}<div class="ofm"><b>${s.last_seen ? esc(ago(s.last_seen)) : "連不上"}</b>`
    + `<div class="otl" style="--g:${g}"><i></i></div><div class="otx"><span>${span[1]}</span><span>現在</span></div>${err}${peerBtn(s)}</div></div>`;
}
/* 主機列表最後的「新增主機」：貼上新主機的配對暗號 */
const addHostBtn = cls => `<button class="${cls}" data-addhost data-key="+add">${I("plus")}<span>新增主機</span></button>`;

/* ═════════ 一台主機的內容：手機的整頁、電腦的欄位共用 ═════════ */
const osShort = o => String(o || "").replace(/(\d+\.\d+)\.\d+/, "$1").replace(/\s*LTS$/, "");   // Ubuntu 24.04.5 LTS → Ubuntu 24.04（完整的放在提示）
const subOf = s => s.online ? `<span title="${esc(s.os || "")}・核心版本 ${esc(s.kernel)}">${esc([place(s), osShort(s.os)].filter(Boolean).join("・"))}</span>・<span class="hup" title="開機多久">${I("power")}${up(s.uptime)}</span>`
  : esc(place(s) || "");   // 連不上寫在下面的時間條，這裡不再寫「離線」
function hostBody(s, ph){
  let h = `<div class="hb" data-key="hb" data-keyed><div class="hhead" data-key="hh">${avatar(s)}<div class="nm"><h2 class="hname">${esc(s.name)}</h2><div class="hsub">${subOf(s)}</div></div>${ph ? "" : `<span class="hacts">${moreBtn(s)}</span>`}</div>`;
  if (!s.online) return h + offBox(s) + `</div>`;
  h += alerts(s, 1) + tiles(s) + factsRow(s, ph);
  const hs = PREF.show.chart ? histFor(s) : null;
  if (PREF.show.chart) h += `<div class="cc" data-key="cp"><div class="cch"><span class="lg"><i style="background:${COL.cpu}"></i>處理器</span><span class="lg"><i style="background:${COL.mem}"></i>記憶體</span>${rangeSeg()}</div>
    <div class="cbox">${chartOr(hs, cid(s, ph ? "m" : "a"), x => [{data:x.cpu, color:COL.cpu, name:"處理器"}, {data:x.mem, color:COL.mem, name:"記憶體"}], {max:100, grid:1, fmt:v => Math.round(v) + "%", h: ph ? 130 : 150})}</div></div>`;
  if (PREF.show.net) h += `<div class="cc" data-key="np"><div class="nets"><div class="nt">${IC("down")}<div class="nv" title="下載">${rate(s.net.rx)}</div></div><div class="nt">${IC("up")}<div class="nv" title="上傳">${rate(s.net.tx)}</div></div></div>
    ${hs ? `<div class="cbox wide">${chartOr(hs, cid(s, ph ? "n" : "b"), x => [{data:x.rx, color:COL.rx, name:"下載"}, {data:x.tx, color:COL.tx, name:"上傳"}], {grid:1, bin:1, fmt:rate, h: ph ? 96 : 110})}</div>` : ""}</div>`;
  h += trafficCard(s) + itemsCard(s);
  return h + `</div>`;
}
/* 負載的半圓儀表：指針從左（輕鬆）轉到右（超載，每核 2 以上） */
const lgauge = v => `<svg class="lgg" viewBox="0 0 64 36" aria-hidden="true"><path class="lgb" d="M6 32a26 26 0 0 1 52 0" pathLength="100"/><path class="lgv" d="M6 32a26 26 0 0 1 52 0" pathLength="100" style="stroke-dasharray:${v.toFixed(1)} 100"/><g class="lgn" style="transform:rotate(${(v * 1.8 - 90).toFixed(1)}deg)"><path d="M32 32V12"/><circle cx="32" cy="32" r="3.5"/></g></svg>`;
/* 四格：處理器、記憶體、磁碟、負載 */
function tiles(s){
  const d0 = disk0(s), l = +s.load[0] || 0, lr = l / (s.cores || 1), [lw, lt] = LOADW(lr), tp = tileProb(s);
  const of = (a, b) => `${size(a)} / ${size(b)}`;
  const t = (k, label, val, pct, sub, tt = tp[k] ? "b" : tier(pct)) => `<div class="tile ${tt}" data-key="t:${k}"><div class="th">${IC(k)}${label}</div><div class="tv">${val}</div>${wave(pct, tt)}<div class="ts">${sub}</div></div>`;
  return `<div class="tiles" data-key="tiles">${t("cpu", "處理器", `${num(s.cpu)}<small>%</small>`, s.cpu, `${s.cores} 核`)}`
    + t("mem", "記憶體", `${num(s.mem.pct)}<small>%</small>`, s.mem.pct, of(s.mem.used, s.mem.total))
    + t("disk", "磁碟", `${num(d0.pct)}<small>%</small>`, d0.pct, of(d0.used, d0.total))
    + t("load", "負載", `${lgauge(Math.min(100, lr / 2 * 100))}<span class="wd">${lw}</span>`, Math.min(100, lr / 2 * 100), `${l.toFixed(2)}／${s.cores} 核`, lt) + `</div>`;
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
/* 一排小膠囊：連線數、IP（霧化，點一下顯示）、IPv6、其他磁碟、雲端硬碟 */
const IPSHOW = {};                    // 哪幾台的 IP 目前是顯示狀態（到期自動再遮起來）
function factsRow(s, ph){
  const f = [], k = keyOf(s), shown = IPSHOW[k] > Date.now(), c = s.conns, avg = s.conns_avg;
  if (PREF.show.info) {
    const cw = c == null || avg == null ? "" : (c > avg * 2 && c - avg > 20) ? "比平常多很多" : (avg > 10 && c < avg * .3) ? "比平常少很多" : "";
    if (c != null) f.push(`<span class="fc" title="現在的網路連線數${avg != null ? `（平常約 ${Math.round(avg)} 條）` : ""}">${I("plug")}<b class="num">${Number(c).toLocaleString("zh-TW")}</b>${cw ? `<em class="${cw.includes("多") ? "warn" : ""}">${cw}</em>` : ""}</span>`);
    const ip = s.geo && s.geo.ip, org = s.geo && s.geo.org;
    if (ip) f.push(`<span class="fc">IP<b class="ipb ${shown ? "on" : ""}" tabindex="0" role="button" ${shown ? `data-copy="${esc(ip)}" title="點一下複製（15 秒後會自動遮起來）"` : `data-reveal="${esc(k)}" title="點一下顯示"`}>${esc(ip)}</b></span>`);
    if (s.ipv6) f.push(`<span class="fc" data-xw>${v6line(s, shown)}</span>`);
    if (org && !sameOrg(org, s.name)) f.push(`<span class="fc">${esc(org)}</span>`);
    (s.disks || []).slice(1).forEach(d => f.push(`<span class="fc">磁碟 ${esc(d.path)}<b class="num ${tier(d.pct)}">${num(d.pct)}%</b></span>`));
    if (s.mem.swap_total) f.push(`<span class="fc">虛擬記憶體<b class="num">${num(s.mem.swap_pct)}%</b></span>`);
  }
  return f.length ? `<div class="fcs" data-key="fcs">${f.join("")}</div>` : "";
}
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
    ${tBar(t)}</button>`;
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
      <label>怎麼計算<div class="seg">${Object.entries(CNT).map(([k,l])=>`<button type="button" class="${mode===k?"on":""}" data-m="${k}">${l}</button>`).join("")}</div>
        <small>不確定就選「上傳＋下載」</small></label>
    </div>
    <div class="btns"><button class="ubtn" data-r="1">儲存</button></div></div>`;
  $("#layer").appendChild(v);
  v.querySelectorAll(".seg").forEach(sg => sg.querySelectorAll("button").forEach(b => b.onclick = () => {
    mode = b.dataset.m; sg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); }));
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
const TABS = [["home", "首頁", "home"], ["tools", "工具", "tools"], ["log", "紀錄", "log"], ["set", "設定", "gear"]];
function navBtns(rail, list){
  const nw = list.some(s => s.self_has);
  return TABS.map(([k, l, ic]) => rail
    ? `<button class="rb${TAB === k ? " on" : ""}${k === "set" && nw ? " hasnew" : ""}" data-tab="${k}"><span class="ri">${I(ic)}</span><span class="rl">${k === "home" ? "總覽" : l}</span></button>`
    : `<button class="tb${TAB === k ? " on" : ""}${k === "set" && nw ? " hasnew" : ""}" data-tab="${k}" title="${l}">${I(ic)}<span class="t">${l}</span></button>`).join("");
}
function page(list, time){
  return TAB === "tools" ? toolsPage(list) : TAB === "log" ? logPage(list) : TAB === "set" ? setPage(list)
    : DESK.matches ? homeDesk(list, time) : homePhone(list, time);
}
/* 手機：首頁是每台一張卡片，點了從卡片長出那台的整頁 */
function renderPhone(list, time){
  const s = DET && list.find(x => keyOf(x) === DET);
  return `<div class="dash m" data-key="m"><nav class="dock" data-key="dock" data-slide>${navBtns(false, list)}</nav><main class="view v-${TAB}" data-key="v:${TAB}">${page(list, time)}</main>${s ? detail(s) : ""}</div>`;
}
/* 電腦：左邊直排分頁；首頁每台主機一欄並排（主機多就是小卡片），右邊是天氣和最近發生的事 */
/* 電腦：桌面主控台。左邊固定側欄（分頁＋所有主機），右邊是頁面；手機版完全不同一套 */
let DSEL = store("vs-dsel") || "";
const deskSel = list => list.find(x => keyOf(x) === DSEL) || list[0];
const railHost = (s, on) => `<button class="rh${on ? " on" : ""}" data-dsel="${esc(keyOf(s))}" data-key="rh:${esc(keyOf(s))}"><span class="dot ${s.online ? lvOf(s) : "bad"}"></span><b>${esc(s.name)}</b><small class="num">${s.online ? num(s.cpu) + "%" : I("off")}</small></button>`;
function renderDesk(list, time){
  const sel = deskSel(list), k = sel && keyOf(sel);
  return `<div class="dash d" data-key="d"><nav class="rail" data-key="rail"><div class="brand">${BRAND}<b>VPS 哨兵</b></div><div class="rnav">${navBtns(true, list)}</div>
    ${list.length > 1 ? `<div class="rsec">主機<small class="num">${list.length}</small></div><div class="rhosts" data-key="rhs" data-keyed>${list.map(s => railHost(s, TAB === "home" && keyOf(s) === k)).join("")}</div>` : ""}
    <div class="rfoot"><span class="rtime"><span class="live${LOST ? " off" : ""}"></span><span data-x>${LOST ? "重新連線中" : time}</span></span><button class="iconbtn" data-refresh title="重新整理">${I("upd")}</button></div></nav>
    <main class="view v-${TAB}" data-key="v:${TAB}">${page(list, time)}</main></div>`;
}
/* 電腦每一頁上面同一條工具列：頁面名稱，後面接各頁自己的東西 */
const dbar = (title, rest = "") => `<div class="dbar" data-key="dbar"><h1 class="dbt">${title}</h1>${rest}</div>`;
/* 這台還沒設定 Telegram：主機下面提醒一行，點了直接設定 */
const tgHint = list => list.some(x => !x.node && x.tg_off) ? `<div class="group tgh" data-key="tgh"><button class="li" data-tg>${IC("bell", "")}<span class="lab">Telegram 通知<small>還沒設定，出事不會通知你</small></span>${CHEV}</button></div>` : "";
function homePhone(list, time){
  const ev = groupEv(allEvents(list)).slice(0, 3);
  return hero(list, time) + `<div class="lbl" data-key="lh">主機</div>${hostLists(list, "")}${tgHint(list)}
    <div class="lbl" data-key="le">最近發生${ev.length ? `<button data-tab="log">全部紀錄</button>` : ""}</div>${evList(ev, list.length > 1)}`;
}
/* 電腦版不再並排大卡片：主機一律放在總表，點一列看那台 */
const deskCols = () => 1;
const cardMode = () => !DESK.matches;
/* 主機總表的一列：名稱、三條用量、網路、流量、開機、⋯；連不上的整列寫原因 */
function hostRowD(s, on){
  const k = esc(keyOf(s)), lv = s.online ? lvOf(s) : "bad", bar = p => `<span class="hc">${wave(p)}<b class="num ${tier(p)}">${num(p)}%</b></span>`;
  /* 有狀況的：名字下面直接放那件事的小膠囊（處理器、記憶體、磁碟那格已經變紅的不再放），不用點進去才知道 */
  const bad = s.online ? (s.problems || []).filter(p => !tileKey(s, p)).map(p => alChip(noDup(s, String(p)), "bad", "b")) : [];
  const warn = s.online ? (s.notices || []).map(p => alChip(String(p), "warn", "w")) : [];
  const al = bad.concat(warn), sub = al.length ? `<small class="hal">${al[0]}${al.length > 1 ? `<i class="num">+${al.length - 1}</i>` : ""}</small>` : `<small>${esc(place(s) || osShort(s.os))}</small>`;
  const nm = `<span class="hc hn">${avatar(s)}<span><b>${esc(s.name)}</b>${sub}</span></span>`;
  if (!s.online) return `<div class="htr off${on ? " on" : ""}" data-dsel="${k}" data-key="hr:${k}">${nm}<span class="hc hoff">${I("off")}連不上${s.last_seen ? `・${esc(seen(s))}` : ""}</span><span class="hc">${moreBtn(s)}</span></div>`;
  const d0 = disk0(s);
  return `<div class="htr ${lv}${on ? " on" : ""}" data-dsel="${k}" data-key="hr:${k}">${nm}${bar(s.cpu)}${bar(s.mem.pct)}${bar(d0.pct)}
    <span class="hc num hnet">${I("down")}<span>${rate(s.net.rx)}</span>${I("up")}<span>${rate(s.net.tx)}</span></span>${s.traffic && s.traffic.limit ? `<span class="hc htf" title="${size(s.traffic.used)}／${size(s.traffic.limit)}">${wave(s.traffic.pct)}<b class="num ${tier(s.traffic.pct)}">${size(s.traffic.used)}</b></span>` : `<span class="hc htf"><span class="wv0"></span><b class="num nl">${s.traffic ? size(s.traffic.used) : "—"}</b></span>`}<span class="hc num">${up(s.uptime)}</span><span class="hc">${moreBtn(s)}</span></div>`;
}
function homeDesk(list, time){
  const ev = groupEv(allEvents(list)).slice(0, 8), sel = deskSel(list), g = greet();
  const lvs = list.map(s => s.online ? lvOf(s) : "bad"), lv = LOST || lvs.includes("bad") ? "bad" : lvs.includes("warn") || issuesOf(list).length ? "warn" : "ok";   // 跟標題那句話一致
  const bar = dbar("總覽", `<span class="spill ${lv}" data-x>${I({ok:"ok", warn:"alert", bad:"warn"}[lv])}${esc(headline(list))}</span><span class="dq">${esc(g.hi)}${g.quote ? `・${esc(g.quote)}` : ""}</span><span class="sp"></span>${addHostBtn("ubtn ghost dadd")}`);
  const tab = list.length > 1 ? `<div class="htab" data-key="htab"><div class="hth"><span>主機</span><span>處理器</span><span>記憶體</span><span>磁碟</span><span>網路</span><span>本月流量</span><span>開機</span><span></span></div>
    <div class="htb" data-key="htb" data-keyed>${list.map(s => hostRowD(s, s === sel)).join("")}</div></div>` : "";
  return `<div class="dhome" data-key="dh">${bar}${tab}<div class="dgrid" data-key="dg"><section class="hp ${sel ? lvOf(sel) : ""}" data-key="${sel ? esc(keyOf(sel)) : "none"}" data-sw>${sel ? hostBody(sel, false) : `<div class="calm">還沒有主機</div>`}</section>
    <aside class="aside" data-key="as">${g.wx ? `<div class="wxw">${g.wx}</div>` : ""}${tgHint(list)}<div class="lbl">最近發生${ev.length ? `<button data-tab="log">全部紀錄</button>` : ""}</div>${evList(ev, list.length > 1)}</aside></div></div>`;
}
/* 那台主機的整頁（從卡片的位置展開；電腦上左邊的分頁列留著） */
function detail(s){
  const r = OPENR || {t:0, b:0, l:0, r:0};
  return `<div class="det${DETX ? " closing" : ""}" data-key="det:${esc(keyOf(s))}" style="--ct:${r.t}px;--cb:${r.b}px;--cl:${r.l}px;--cr:${r.r}px"><div class="dscroll">
    <div class="dtop"><button class="icbtn" data-back title="返回">${I("back")}</button><span class="dtt">${esc(s.name)}</span><span class="hacts">${moreBtn(s).replace("iconbtn", "icbtn")}</span></div>
    ${hostBody(s, true)}</div></div>`;
}
/* 工具：雲端硬碟、遠端下載、每日備份、常用連結；好幾台時上面一排主機名稱（可以左右滑）選一台，只顯示那台的 */
let TOOLH = store("vs-toolh"), ORDER = [];
function toolsPage(list){
  const on = list.filter(s => s.online).sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b)));
  const D = DESK.matches;
  let h = `<div class="${D ? "wide" : "narrow"}" data-key="tools"><h1 class="ptitle"><span>工具</span></h1>`;
  const fly = `<div class="group fly1" data-key="g-fly"><button class="li" data-key="fly" data-fly>${IC("fly", "")}<span class="lab">機場起降${FLYS.name ? `<small>${esc(FLYS.name)}</small>` : ""}</span>${CHEV}</button></div>`;
  const flyT = `<button class="tbx" data-key="fly" data-fly><span class="ttop">${IC("fly", "")}<span class="tgo nx">${CHEV}</span></span><b>機場起降</b>${FLYS.name ? `<small>${esc(FLYS.name)}</small>` : ""}</button>`;
  if (!on.length) return D ? `<div class="wide" data-key="tools">${dbar("工具")}<div class="calm">連不上任何主機</div><div class="tgrid" data-key="g-tf">${flyT}</div></div>`
    : h + `<div class="calm">連不上任何主機</div></div>`;
  const s = on.find(x => keyOf(x) === TOOLH) || on.find(x => !x.node) || on[0], k = esc(keyOf(s)), node = esc(s.node || ""), name = esc(s.name);
  const dot = x => lvOf(x) === "ok" ? "" : `<span class="dot ${lvOf(x)}"></span>`;
  const pick = on.length > 1 ? hpick(on, s, dot) : "";
  const lh = `<div class="lbl" data-key="lth">主機</div>`;
  if (D) return `<div class="wide" data-key="tools">${dbar("工具", pick)}${toolsBody(s, k, node, name)}<div class="lbl" data-key="ltf">不分主機</div>${fly}</div>`;   // 電腦：選主機放工具列，下面一格一格（格子撐滿一排）；機場起降跟手機一樣是一整條
  return h + fly + lh + pick + toolsBody(s, k, node, name) + `</div>`;
}
function toolsBody(s, k, node, name){
  const c = s.cloud && safeUrl(cloudHref(s.cloud)) ? s.cloud : null;
  let h = `<div data-key="tb:${k}" data-sw><div class="tgrid" data-key="g-t:${k}">`;   // 兩欄大方塊：圖示、名字，下面直接畫狀態（用量波浪條、備份最近 7 天）
  if (c) h += `<a class="tbx" data-key="cl" href="${esc(cloudHref(c))}"${ssoAttr(s)} target="_blank" rel="noopener noreferrer"><span class="ttop">${IC("cloud", "")}<span class="tgo">${EXT}</span></span>
      <b>雲端硬碟</b><small>${c.total ? `${size(c.used)} / ${size(c.total)}` : ""}</small>${c.total ? wave(c.pct) : ""}</a>
    <button class="tbx" data-key="dl" data-dl="${node}" data-name="${name}"><span class="ttop">${IC("dl", "")}<span class="tgo nx">${CHEV}</span></span><b>遠端下載</b><small>存到雲端硬碟</small></button>`;
  h += `<button class="tbx" data-key="bk" data-bk="${node}" data-label="${name}"><span class="ttop">${IC("archive", "")}<span class="tgo nx">${CHEV}</span></span>
      <b>每日備份</b><small class="bkst" data-n="${node}" data-keep data-ld>讀取中…</small><span class="bkdots" data-n="${node}" data-keep>${"<i></i>".repeat(7)}</span></button></div>`;
  const L = linksOf(s).filter(x => !x.fixed);
  if (L.length) h += `<div class="lbl" data-key="ll">常用連結</div><div class="group" data-key="g-lk:${k}">${L.map(x => linkRow(x, esc(linkSt(x)))).join("")}</div>`;
  return h + `</div>`;
}
/* 一排主機名稱選一台（工具、設定共用，選了哪台兩邊都記得）；dot：名稱前面的小圓點 */
const hpick = (on, s, dot) => `<div class="hpick" data-key="hpick" data-keyed data-slide>${on.map(x => `<button class="fchip${x === s ? " on" : ""}" data-key="hp:${esc(keyOf(x))}" data-toolh="${esc(keyOf(x))}">${dot(x)}${esc(x.name)}</button>`).join("")}</div>`;
/* 選到的主機名稱被擠到邊邊或看不到時，把那一排滑到它在中間（只滑那一排，頁面不動） */
function pickShow(anim){
  const r = $(".hpick"), b = r && r.querySelector(".on"); if (!b || r.scrollWidth <= r.clientWidth) return;
  const z = ZM(), l = (b.getBoundingClientRect().left - r.getBoundingClientRect().left) / z + r.scrollLeft, pad = 40;
  if (l < r.scrollLeft + pad || l + b.offsetWidth > r.scrollLeft + r.clientWidth - pad)        // 滑到正中間
    r.scrollTo({left: l - (r.clientWidth - b.offsetWidth) / 2, behavior: anim && canAnim() ? "smooth" : "auto"});
}
/* 單選的一排（data-slide）：
   直的清單（.pane）、手機上面的分頁底線（.dock）：選取底色從舊的那一個彈性滑到新的，跟著新的大小、圓角變形；滑的途中再按別的就從現在的位置轉向
   其他（選主機、機場分頁、時段、紀錄篩選）：交給 CSS（style.css 的「選到的底色」::before），新的原地撐開、舊的淡掉；
   連按時每一顆從現在的樣子接著變，不在這裡另外疊一塊（以前疊的那塊被下一下拿掉，底色整塊消失） */
let SPTS;   // SPRING 曲線的轉折點（JS 自己算動畫時用）
function springAt(t){
  if (!SPTS) { const m = SPRING.match(/^linear\((.*)\)$/);
    SPTS = m ? m[1].split(",").map((x, i, a) => { const [v, p] = x.trim().split(/\s+/); return [p ? parseFloat(p) / 100 : i / (a.length - 1), +v]; }) : [[0, 0], [.3, .8], [.6, 1.04], [1, 1]]; }
  for (let i = 1; i < SPTS.length; i++) if (t <= SPTS[i][0]) { const [p0, v0] = SPTS[i - 1], [p1, v1] = SPTS[i]; return v0 + (v1 - v0) * (t - p0) / ((p1 - p0) || 1); }
  return 1;
}
function slideSel(change){
  const z = ZM(), was = canAnim() ? [...document.querySelectorAll(".pane[data-slide],.dock[data-slide]")].map(b => {
    const g = b.querySelector(":scope>.slide"), on = selOf(b);
    return [b.dataset.key, g ? g._now : on && boxIn(b, on, z)];
  }) : [];
  change();
  was.forEach(([k, from]) => {
    const b = document.querySelector(`[data-slide][data-key="${k}"]`), on = b && selOf(b);
    if (!from || !on) return;
    const old = b.querySelector(":scope>.slide"); if (old) { old._stop = 1; old.remove(); }
    const to0 = boxIn(b, on, z);
    if (Math.abs(to0.x - from.x) < 1 && Math.abs(to0.y - from.y) < 1) { if (old) b.classList.remove("sliding"); return; }   // 停在原地：換回它自己的底色
    const g = document.createElement("i"); g.className = "slide"; g._leaving = 1; b.prepend(g); b.classList.add("sliding");   // _leaving：重畫時不要把它當成內容
    const dur = T.sp, t0 = performance.now(), lerp = (a, c, p) => a + (c - a) * p;
    g.animate([{opacity:1}, {opacity:1}], {duration:dur, id:"ui"});              // 滑完之前，自動更新先等一下
    const done = () => { const on2 = selOf(b); if (on2) { on2.style.transition = "none"; b.classList.remove("sliding"); on2.offsetWidth; on2.style.transition = ""; } g.remove(); };   // 換回它自己的底色，同一格畫面，不會閃
    if (Math.abs(to0.w - from.w) < 1 && Math.abs(to0.h - from.h) < 1 && to0.r.every((r, i) => Math.abs(r - from.r[i]) < 1)) {
      // 大小一樣（例如手機上面的分頁列、電腦左邊的圖示）：只移位置，交給顯示卡跑，新的一頁在畫的時候也不會頓
      Object.assign(g.style, {width:to0.w + "px", height:to0.h + "px", borderRadius:to0.r.map(r => r + "px").join(" ")});
      const tr = c => `translate(${c.x}px,${c.y}px)`, a = g.animate([{transform:tr(from)}, {transform:tr(to0)}], {duration:dur, easing:SPRING, fill:"forwards"});
      a.onfinish = () => { if (!g._stop) done(); };
      Object.defineProperty(g, "_now", {get(){ const m = new DOMMatrix(getComputedStyle(g).transform); return {x:m.e, y:m.f, w:to0.w, h:to0.h, r:to0.r}; }});
      return;
    }
    const step = now => {
      if (g._stop || !g.isConnected) return;
      const p = Math.min(1, (now - t0) / dur), e = springAt(p), on2 = selOf(b);
      if (!on2 || !b.isConnected) return g.remove();
      const to = boxIn(b, on2, z), c = {x:lerp(from.x, to.x, e), y:lerp(from.y, to.y, e), w:lerp(from.w, to.w, e), h:lerp(from.h, to.h, e), r:from.r.map((r, i) => Math.max(0, lerp(r, to.r[i], e)))};
      g._now = c;
      Object.assign(g.style, {transform:`translate(${c.x}px,${c.y}px)`, width:c.w + "px", height:c.h + "px", borderRadius:c.r.map(r => r + "px").join(" ")});
      if (p < 1) return requestAnimationFrame(step);
      done();
    };
    step(t0);
  });
}
/* 選到的那一個；data-slide="選擇器" 這種是底色在它裡面的那一塊 */
const selOf = b => { const on = b.querySelector(":scope>.on"); return on && b.dataset.slide ? on.querySelector(b.dataset.slide) : on; };
/* 元素在容器裡的位置（容器可以左右捲；圓角換成實際看得到的大小，999px 的膠囊不會讓變形慢半拍） */
function boxIn(b, el, z){
  const R = b.getBoundingClientRect(), r = el.getBoundingClientRect(), cs = getComputedStyle(el), w = r.width / z, h = r.height / z;
  const rad = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map(k => Math.min(parseFloat(cs[k]) || 0, w / 2, h / 2));
  return {x:(r.left - R.left) / z - b.clientLeft + b.scrollLeft, y:(r.top - R.top) / z - b.clientTop + b.scrollTop, w, h, r:rad};
}
/* 紀錄：所有主機的事件，依日期分組 */
let LOGF = "", LOGH = "";
const LOGK = {"": () => true, bad: e => e.kind === "bad" || e.kind === "warn", other: e => e.kind === "ok" || e.kind === "info"};
function logPage(list){
  const D = DESK.matches, many = list.length > 1, hk = many && list.some(x => keyOf(x) === LOGH) ? LOGH : "";
  const all = allEvents(list), byH = all.filter(e => !hk || e.k === hk), ev0 = byH.filter(LOGK[LOGF] || LOGK[""]), ev = hk ? ev0 : groupEv(ev0);
  const F = [["", "全部", "log"], ["bad", "有狀況", "warn"], ["other", "恢復與通知", "ok"]];   // 前面一個圖示，筆數是小徽章
  const fi = (k, ic) => `<span class="lfi ${k || "all"}">${I(ic)}</span>`, fn = k => (hk ? byH.filter(LOGK[k]) : groupEv(byH.filter(LOGK[k]))).length;
  let rows = "", day = "";
  for (const e of ev) { const d = dayOf(e.t); if (d !== day) { day = d; rows += `<div class="day" data-key="d:${d}">${d}</div>`; } rows += evRow(e, many, hm); }
  const body = ev.length ? `<div class="evs" data-key="evs" data-keyed data-sw>${rows}</div>` : `<div class="calm" data-key="calm" data-sw>目前沒有事件</div>`;
  const chip = (k, l, ic) => `<button class="fchip lfc${LOGF === k ? " on" : ""}" data-logf="${k}" data-key="lf:${k}" title="${l}">${fi(k, ic)}<span class="lfl">${l}</span><b class="lfn">${fn(k)}</b></button>`;
  const hn = hk && list.find(x => keyOf(x) === hk);   // 好幾台時多一顆「全部主機 ▾」，點了選只看哪一台
  const hc = many ? `<button class="fchip hsel${hk ? " set" : ""}" data-loghm data-key="hsel" data-x>${esc(hn ? hn.name : "全部主機")}${I("chev")}</button>` : "";
  const fc = `<div class="fchips" data-key="lfc" data-slide>${F.map(([k, l, ic]) => chip(k, l, ic)).join("")}</div>`;
  if (D) {   // 電腦：篩選放工具列，事件是一張表（時間、主機、事件）
    let tr = "", dd = "";
    for (const e of ev) { const d = dayOf(e.t); if (d !== dd) { dd = d; tr += `<div class="day" data-key="d:${d}">${d}</div>`; } tr += evRowD(e, many); }
    const tb = ev.length ? `<div class="ltab${many ? "" : " one"}" data-key="ltab:${LOGF}:${hk}" data-sw><div class="lth"><span>時間</span>${many ? "<span>主機</span>" : ""}<span></span><span>事件</span></div><div class="evs" data-key="evs" data-keyed>${tr}</div></div>`
      : `<div class="calm" data-key="calm" data-sw>目前沒有事件</div>`;
    return `<div class="wide" data-key="log">${dbar("紀錄", fc + `<span class="sp"></span>` + hc)}${tb}</div>`;
  }
  return `<div class="narrow" data-key="log"><h1 class="ptitle wh"><span>紀錄</span>${hc}</h1>${fc}${body}</div>`;
}
/* 主題色：照色相排一圈（色票本身用 style.css 的 [data-accent] 算出預覽） */
const ACCENTS = [["red", "紅"], ["orange", "橘"], ["amber", "琥珀"], ["lime", "萊姆"], ["green", "綠"], ["teal", "青綠"],
  ["cyan", "天藍"], ["blue", "藍"], ["indigo", "靛藍"], ["purple", "紫"], ["pink", "粉紅"]];
/* 設定：上面是通知與登入、主機，外觀在最後（電腦放右邊欄）；下面「主機」好幾台時跟工具一樣一排主機名稱選一台，只顯示那台的 */
const SHOWS = [["trend", "歷史曲線圖", "chart"], ["net", "網路速度", "net"], ["box", "容器與服務", "items"], ["info", "連線數與 IP", "info"],
  ["flag", "國旗", "flag"], ["month", "每月流量", "traffic"], ["sun", "天氣", "weather", "用這台裝置的位置"], ["quote", "心情小語", "quote"]];
const showSum = () => { const n = SHOWS.filter(x => PREF.show[x[2]]).length; return n === SHOWS.length ? "全部顯示" : n ? `顯示 ${n} 項` : "全部隱藏"; };
const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(getP(k)) === String(v) ? "on" : ""}" data-pref="${k}" data-val="${v}">${l}</button>`).join("")}</div>`;
/* 外觀的選項用小預覽圖代替字：主題是迷你畫面、配色風格用那個風格算出來的顏色、文字大小是三種大小的「字」 */
const lkMini = (m, tone) => `<i class="lkp" data-mode="${m}"${tone ? ` data-tone="${tone}"` : ""}><b></b><s></s><u></u></i>`;
const lkPick = (k, opts, pic) => `<div class="lks">${opts.map(([v, l]) => `<button class="lkb${String(getP(k)) === String(v) ? " on" : ""}" data-pref="${k}" data-val="${v}" aria-label="${l}"><span class="lkf">${pic(v)}<i class="lkc">${I("check")}</i></span><small>${l}</small></button>`).join("")}</div>`;
const tog = (k, l) => `<input type="checkbox" class="tog" data-pref="${k}" aria-label="${l}" ${getP(k) ? "checked" : ""}>`;
let SETC = store("vs-setc") || "";
function setPage(list){
  const on = list.filter(s => s.online).sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b))), self = on.some(s => !s.node);
  const go = (attr, ic, l, st) => `<button class="li" ${attr}>${IC(ic, "")}<span class="lab">${l}<small class="${st}" data-keep data-ld>讀取中…</small></span><span class="stb" data-keep hidden></span>${CHEV}</button>`;
  const sw = ACCENTS.map(([v, l]) => `<button class="${PREF.accent === v ? "on" : ""}" data-pref="accent" data-val="${v}" data-accent="${v}" title="${l}" aria-label="${l}">${I("check")}</button>`).join("")
    + `<button class="rbsw${PREF.accent === "rainbow" ? " on" : ""}" data-pref="accent" data-val="rainbow" title="彩虹" aria-label="彩虹">${I("check")}</button>`;
  const D = DESK.matches;   // 電腦：左邊主機和通知，右邊欄是這台裝置的外觀
  const look = `<div class="lbl" data-key="llook">外觀</div><div class="group" data-key="g-look">
      <div class="li col"><span class="lab">主題</span>${lkPick("theme", [["auto", "自動"], ["light", "淺色"], ["dark", "深色"]], v => v === "auto" ? `<span class="lkh">${lkMini("light")}${lkMini("dark")}</span>` : lkMini(v))}</div>
      <div class="li col"><span class="lab">主題色</span><div class="sw">${sw}</div></div>
      <div class="li col"><span class="lab">配色風格</span>${lkPick("tone", [["soft", "柔和"], ["vivid", "鮮明"], ["calm", "素雅"]], v => lkMini(document.documentElement.dataset.mode || "light", v))}</div>
      <div class="li col"><span class="lab">文字大小</span>${lkPick("size", [["s", "小"], ["m", "中"], ["l", "大"]], v => `<i class="lkz ${v}">字</i>`)}</div>
      <label class="li"><span class="lab">動畫</span>${tog("motion", "動畫")}</label>
      <button class="li" data-shows>${IC("trend", "")}<span class="lab">要顯示的內容<small class="showst">${showSum()}</small></span>${CHEV}</button></div>`;
  const secG = `<div class="group" data-key="g-sec">${go("data-tg", "bell", "Telegram 通知", "tgst")}${PK_OK && self ? go("data-pk", "finger", "手機金鑰登入", "pkst") : ""}${self ? go("data-pin", "pin", "PIN 碼登入", "pinst") + go("data-sess", "devices", "登入的裝置", "sessst") : ""}</div>`;
  const skyG = self && !SHARE ? `<div class="group" data-key="g-sky">${go("data-sky", "fly", "OpenSky 帳號", "skyst")}</div>` : "";
  const sec = `<div class="lbl" data-key="lsec">通知與登入</div>${secG}` + (skyG ? `<div class="lbl" data-key="lsky">機場起降</div>${skyG}` : "");
  const out = `<div class="sp" data-key="sp"></div><div class="group" data-key="g-out"><button class="li" data-logout><span class="ico info">${I("logout")}</span><span class="lab">登出</span></button>
      <button class="li" data-reset><span class="ico info">${I("upd")}</span><span class="lab">恢復預設值</span></button></div>`;
  let h = "";
  if (on.length) {
    const s = on.find(x => keyOf(x) === TOOLH) || on.find(x => !x.node) || on[0], k = esc(keyOf(s)), node = esc(s.node || "");
    h += `<div class="lbl" data-key="lh">主機<button data-selfcheck>檢查新版</button></div><div class="selfsum" data-key="selfsum" data-keep data-ld></div>`;
    if (on.length > 1) h += hpick(on, s, x => x.self_has ? `<span class="dot info"></span>` : "");
    h += `<div class="group" data-key="g-h:${k}" data-sw><div class="selfbox" data-key="self" data-n="${node}" data-keep data-ld><div class="selfwait">讀取中…</div></div>${sysRow(s)}<button class="li" data-newtok="${node}" data-label="${esc(s.name)}">${IC("key", "")}<span class="lab">換一組新密碼<small>舊密碼會立刻失效</small></span>${CHEV}</button>`
      + (s.keep ? `<label class="li">${IC("keep", "")}<span class="lab">Oracle 防回收${keepLine(s.keep)}</span><input type="checkbox" class="tog" data-keepalive="${node}" aria-label="Oracle 防回收" ${s.keep.on ? "checked" : ""}></label>` : "")
      + (s.node ? "" : go("data-pair", "link", "配對暗號", "pairst")) + `</div>`;
  }
  if (D) {   // 電腦：左邊分類、右邊只放那一類（跟電腦上的設定程式一樣）
    const C = [["sec", "通知與登入", "bell"], ...(skyG ? [["sky", "機場起降", "plane"]] : []), ...(h ? [["host", "主機", "server"]] : []), ["look", "外觀", "palette"]];
    const c = C.some(x => x[0] === SETC) ? SETC : C[0][0], body = {sec:secG, sky:skyG, host:h.replace(/<div class="lbl" data-key="lh">主機/, '<div class="lbl" data-key="lh">'), look:look.replace(/<div class="lbl"[^>]*>外觀<\/div>/, "")}[c];
    return `<div class="wide" data-key="set">${dbar("設定")}<div class="sgrid" data-key="sg"><nav class="scat" data-key="sct"><div class="pane group" data-key="scp" data-slide>${C.map(([k, l, ic]) => `<button class="li${c === k ? " on" : ""}" data-setc="${k}" data-key="sc:${k}">${I(ic)}<span class="lab">${l}</span></button>`).join("")}</div>${out}</nav>
      <div class="sbody" data-key="sb:${c}" data-sw>${body}</div></div></div>`;
  }
  return `<div class="narrow" data-key="set"><h1 class="ptitle"><span>設定</span></h1>` + sec + h + look + out + `</div>`;   // 手機：常用的通知、登入放最上面，外觀設好就很少動，放最後
}
/* 系統更新（作業系統的套件）：跟哨兵、雲端硬碟的版本放在一起 */
const sysRow = s => s.update && s.update.supported ? `<div class="selfrow" data-key="sys"><div class="cl2 first"><span class="ico info">${I("layers")}</span><span>系統<small data-x>${updateInfo(s) || "還沒檢查"}</small></span>${updateBtn(s)}</div></div>` : "";
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
    setP(b.dataset.pref, +b.dataset.val); b.parentNode.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); changed(b.dataset.pref);
  });
}

/* ═════════ 只更新有變動的地方 ═════════ */
/* 曲線變形：兩條路徑的數字一一對應，每一格畫面算一次中間值（iPhone 也能動） */
const NUM = /-?\d+(?:\.\d+)?/g;
/* 不在畫面上的曲線就不做變形動畫，直接換成新的（手機上兩台主機的曲線常常有一半在畫面外） */
const SEEN = new WeakMap();
const seenIO = window.IntersectionObserver ? new IntersectionObserver(es => es.forEach(e => SEEN.set(e.target, e.isIntersecting))) : null;
/* 波浪條捲出畫面就停（主機多時首頁幾十條，看不到的不用一直動，手機比較省電）；新長出來的自動加進來、拿掉的不再看 */
const waveIO = window.IntersectionObserver ? new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle("zz", !e.isIntersecting)), {rootMargin:"60px"}) : null;
if (waveIO) new MutationObserver(ms => { for (const m of ms) {
  for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.classList.contains("wv")) waveIO.observe(n); else n.querySelectorAll(".wv").forEach(w => waveIO.observe(w)); }
  for (const n of m.removedNodes) if (n.nodeType === 1) { if (n.classList.contains("wv")) waveIO.unobserve(n); else n.querySelectorAll(".wv").forEach(w => waveIO.unobserve(w)); }
} }).observe(document.documentElement, {childList:true, subtree:true});
/* 主機整頁打開時，後面那一頁看不到：不用動畫，直接換成新的值 */
const behind = el => !!DET && !el.closest(".det");
function onScreen(el){
  const svg = el.ownerSVGElement || el;
  if (behind(svg)) return false;
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
  if (!isFinite(from) || !isFinite(to) || !canAnim() || behind(el) || scrolling()) { el.textContent = (+to).toFixed(d); return; }
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
/* 共用動畫規則（跟 CSS 的 --t-*、--ease 一致） */
const T = {fast:200, mid:380, slow:620, long:900, spf:330, sp:380, sps:530};
/* 文字大小是用 zoom 放大縮小的：量到的位置是螢幕上的，要除回去才能拿來定位 */
const ZM = () => parseFloat(getComputedStyle(document.body).zoom) || 1;
const EASE = "cubic-bezier(.2,0,0,1)", EXIT = "cubic-bezier(.3,0,.8,.15)", LIN = CSS.supports("transition-timing-function", "linear(0,1)");
/* 彈簧（Material 3 Expressive 官方數值，跟 CSS 的 --sp-fast／--sp／--sp-slow 一樣）：時間用 T.spf／T.sp／T.sps */
const SPRING_F = LIN ? "linear(0,.022 2%,.088 5%,.221 8%,.658 18%,.821 22%,.94 26%,1.024 31%,1.075 36%,1.093 41%,1.069 51%,1.006 68%,.991 84%,1)" : "cubic-bezier(.34,1.4,.64,1)",
      SPRING = LIN ? "linear(0,.022 3%,.093 7%,.259 12%,.554 22%,.713 28%,.83 35%,.917 42%,.976 50%,1.009 61%,1.011 83%,1)" : "cubic-bezier(.3,1.1,.55,1)";
const RMQ = matchMedia("(prefers-reduced-motion: reduce)"), canAnim = () => PREF.motion && !RMQ.matches;   // 同一個查詢留著用（每次新建很慢，動畫前都會問）
/* 讓元素平順地離開：先淡出、收起高度，再移除 */
const BLOCK = ".alert,.alerts,.ev,.day,.calm,.empty,.foot,.offline,.fcs,.cc,.grp,.lbl,.group,.tiles,.mrows,.cfoot";
const TILE = ".hcard,.hp,.tile,.chip,.fc,.li,.addhost";
function flipSiblings(parent, change){
  const z = ZM(), kids = [...parent.children].filter(c => !c._leaving), r0 = kids.map(c => c.getBoundingClientRect());
  change();
  kids.forEach((c, i) => { if (!c.isConnected) return; const r = c.getBoundingClientRect(), dx = (r0[i].left - r.left) / z, dy = (r0[i].top - r.top) / z;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) c.animate([{transform:`translate(${dx}px,${dy}px)`}, {transform:"none"}], {duration:T.spf, easing:SPRING_F, id:"ui"}); });
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
  if (canAnim() && Math.abs(w1 - w0) > 1) el.animate([{width:w0+"px"}, {width:w1+"px"}], {duration:T.mid, easing:EASE});
}
/* 拿出來又放回去的元素：瀏覽器會把裡面的進場動畫從頭重播（卡片會突然不見），全部停在結尾 */
const still = (el, keep) => el.getAnimations({subtree:true}).forEach(n => { if (n === keep) return; if (!n.animationName) n.cancel(); else if (isFinite(n.effect.getComputedTiming().endTime)) n.finish(); });
/* 換分頁：舊的那頁留在原地很快淡出（不佔位置），新的那頁接著淡入（CSS 的 through） */
function through(a, b){
  const par = a.offsetParent;
  if (!canAnim() || !par) return a.replaceWith(b);
  if (a._fading && a._fading.playState === "finished") return a.replaceWith(b);   // 按分頁時舊的那頁已經淡完：直接拿掉（不用再量位置、停它的動畫，新的那頁早一點出來）
  const z = ZM(), r = a.getBoundingClientRect(), R = par.getBoundingClientRect();
  a.replaceWith(b);
  a._leaving = 1;
  Object.assign(a.style, {position:"absolute", left:(r.left - R.left) / z - par.clientLeft + "px", top:(r.top - R.top) / z - par.clientTop + "px", width:r.width / z + "px",
    height:Math.min(r.height / z, innerHeight / z * 2) + "px", overflow:"hidden", margin:"0", pointerEvents:"none", animation:"none"});
  const f = a._fading;
  b.after(a); still(a, f);
  if (f) {                                       // 按分頁時已經先開始淡出：接著淡完就好，新的那頁等它淡完再出來
    const left = Math.max(0, T.fast / 2 - (f.currentTime || 0));
    f.finished.catch(() => {}).then(() => a.remove());
    b.style.animationDelay = left + "ms";
    return;
  }
  a.animate([{opacity:1}, {opacity:0}], {duration:T.fast / 2, easing:EXIT, fill:"forwards", id:"ui"}).onfinish = () => a.remove();
  b.style.animationDelay = T.fast / 2 + "ms";
}
/* 換成另一台主機的內容（data-sw）：舊的留在原地很快淡出，新的同時淡入浮上來；
   高度每一格都跟著新內容實際的高度走（裡面讀到狀態又長高也一起跟上，不會最後才跳一下） */
function swapIn(a, b){
  if (!canAnim() || !a.isConnected) return a.replaceWith(b);
  const h0 = a.offsetHeight, par = a.offsetParent, x = a.offsetLeft, y = a.offsetTop, w = a.offsetWidth;
  a.replaceWith(b); skipIntro(b, true);
  if (par) {
    a._leaving = 1;
    Object.assign(a.style, {position:"absolute", left:x + "px", top:y + "px", width:w + "px", height:h0 + "px", margin:"0", pointerEvents:"none", overflow:"hidden", zIndex:1});
    b.after(a); still(a);
    a.animate([{opacity:1}, {opacity:0}], {duration:T.fast / 2, easing:EXIT, fill:"forwards", id:"ui"}).onfinish = () => a.remove();
  }
  b.animate([{opacity:0, transform:"translateY(8px) scale(.985)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE, fill:"backwards", id:"ui"});   // 跟舊的淡出同時開始（以前等舊的淡完才淡入，中間有一下兩邊都看不到，像閃一下）
  const own = [b.style.height, b.style.overflow];         // 自己本來就有的高度（例如曲線圖「讀取中」那格）要留著
  b.style.height = h0 + "px"; b.style.overflow = "hidden";
  const t0 = performance.now(), dur = T.mid;
  const step = now => {
    if (!b.isConnected) return;
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
    if (p >= 1) { [b.style.height, b.style.overflow] = own; return; }
    b.style.height = own[0]; const h1 = b.offsetHeight;      // 新內容現在真正的高度
    b.style.height = h0 + (h1 - h0) * e + "px";
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
function patch(a, b){
  if (a.hasAttribute("data-keep")) return;     /* 由程式自己控制的元素（例如滑動光圈），不要被重畫蓋掉 */
  const attrs = () => {
    for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
    for (const at of [...b.attributes]) if (a.getAttribute(at.name)!==at.value){
      if (at.name==="data-v") tween(a, parseFloat(a.getAttribute("data-v"))||0, parseFloat(at.value)||0, +b.getAttribute("data-d")||0);
      if (at.name==="d" && a.tagName==="path" && (b.hasAttribute("data-tf") ? slidePath(a, b.getAttribute("data-tf"), at.value) : morphPath(a, a.getAttribute("d"), at.value))) continue;
      a.setAttribute(at.name, at.value);
    }
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
      const msg = !ok ? `「${s.name}」更新失敗，可以再試一次` : k ? `「${s.name}」更新完成，裝好 ${k} 個更新 ✨` : k === 0 ? `「${s.name}」檢查完成，已經是最新的 ✨` : `「${s.name}」更新完成 ✨`;
      setTimeout(() => toast(msg, ok ? "ok" : "bad"), 400);
    }
  }
  // 有紅色（異常）或橘色（注意）告警的主機排在最前面；同一級的照原本順序
  if (list !== LIST) ORDER = list.map(keyOf);  // 原本的順序（工具的主機列不跟著告警重排，免得按到別台）；換分頁重畫時 LIST 已經排過，不能拿來當原本的順序
  list = [...list].map(tidy).sort((a, b) => LVRANK[lvOf(a)] - LVRANK[lvOf(b)]);
  LIST = list;
  if (DET && (!cardMode(list) || !list.some(s => keyOf(s) === DET))) { DET = ""; DETX = false; showBack(); document.documentElement.classList.remove("lock"); }
  const time = new Date().toLocaleTimeString("zh-TW", {hour12:false});
  paint(DESK.matches ? renderDesk(list, time) : renderPhone(list, time));
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
/* 電腦版一次並排幾台：螢幕夠寬才放三台 */
let WIDE = 0;
addEventListener("resize", () => { const w = deskCols(); if (w !== WIDE) { WIDE = w; if (DESK.matches && LIST.length) render(LIST); } }, {passive:true});

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
  tip.innerHTML = `<div class="tt">${when}</div>` + d.ser.map(s => `<div class="tr2"><i style="background:${s.color}"></i>${esc(s.name||"")}<b class="num">${d.fmt(s.data[i] ?? 0)}</b></div>`).join("");
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
/* 整頁平順切換（深淺模式）：支援的瀏覽器會淡入淡出，不支援就直接換 */
function smooth(fn){
  if (!canAnim() || !document.startViewTransition) return fn();
  document.startViewTransition(fn);
}
/* 切換文字大小：整頁重新排版只做一次（排版期間畫面先停在舊的樣子），
   然後舊畫面一邊放大（或縮小）一邊淡出、新畫面從另一個大小接過來淡入，看起來像整頁平順地縮放 */
function sizeShift(fn){
  const h = document.documentElement, z0 = parseFloat(h.style.getPropertyValue("--zoom")) || 1;
  if (!canAnim() || !document.startViewTransition) return fn();
  const z1 = {s:.92, m:1, l:1.1}[PREF.size] || 1;
  h.style.setProperty("--zr", (z1 / z0).toFixed(4)); h.classList.add("vtsize");
  const id = h._vts = (h._vts || 0) + 1;           // 連點兩下：前一次被中斷時，不能把這一次要用的縮放設定拿掉，不然設定面板會閃
  document.startViewTransition(fn).finished.finally(() => { if (h._vts === id) h.classList.remove("vtsize"); });
}
function toast(msg, type="ok"){
  const t = document.createElement("div"); t.className = `toast ${type}`;
  t.innerHTML = `${I(type==="ok"?"ok":"warn")}<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(t);
  setTimeout(()=>{ t.classList.add("out"); setTimeout(()=>t.remove(), 400); }, 2600);
}

/* ═════════ 分頁、主機整頁 ═════════ */
let TAB = ["home", "tools", "log", "set"].includes(sstore("vs-tab")) ? sstore("vs-tab") : "home";
function setTab(k){
  closeMenu(); hideTip();
  if (DET) {                                     // 電腦上開著主機整頁時按分頁列：同一頁就收起來，別頁直接換過去
    if (TAB === k) return closeDet();
    DET = ""; DETX = false; showBack(); document.documentElement.classList.remove("lock");
    if (history.state && history.state.det) history.replaceState(null, "");
  }
  if (TAB === k) { if (scrollY > 0) scrollTo({top:0, behavior: canAnim() ? "smooth" : "auto"}); return; }
  TAB = k; sstore("vs-tab", k);
  scrollTo(0, 0);
  const v = view();
  if (!canAnim() || !v) return slideSel(() => render(LIST));
  // 按下去只做便宜的事（分頁底色開始滑、舊的那頁淡出），淡完才畫新的那頁：主機多也不會先頓一下才動，淡出也不會被拖慢
  slideSel(() => document.querySelectorAll(".dock [data-tab], .rail [data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === k)));
  if (!v._fading) v._fading = v.animate([{opacity:1}, {opacity:0}], {duration:T.fast / 2, easing:EXIT, fill:"forwards", id:"ui"});
  const id = ++TABID;
  v._fading.finished.catch(() => {}).then(() => {
    if (id !== TABID || TAB !== k) return;
    render(LIST);
    if (v.isConnected && !v._leaving && v._fading) { v._fading.cancel(); v._fading = null; v.animate([{opacity:0}, {opacity:1}], {duration:T.mid, easing:EASE, id:"ui"}); }   // 很快又按回原本那頁：同一頁留著，淡出要拿掉（不然整頁一直是透明的）
  });
}
let TABID = 0;
/* 工具、設定頁上「讀取中…」的狀態：換到那一頁時讀一次（之後自動更新不會蓋掉） */
const view = () => $("#app .view");
function loadStatus(){
  const r = view(); if (!r || !r.querySelector("[data-ld]")) return;
  r.querySelectorAll("[data-ld]").forEach(x => x.removeAttribute("data-ld"));
  tgStatus(r); selfStatus(r); pkStatus(r); pinStatus(r); sessStatus(r); pairStatus(r); bkStatus(r); skyStatus(r);
}
/* 手機：點主機卡片，那台的整頁從卡片的位置長出來；返回時縮回卡片 */
let DET = "", DETX = false, OPENR = null;
function cardRect(k){
  const c = [...document.querySelectorAll("#app .hcard")].find(x => x.dataset.open === k); if (!c) return null;
  const z = ZM(), r = c.getBoundingClientRect(), x = DESK.matches ? 96 : 0;          // 電腦：整頁從分頁列右邊開始
  return {t: Math.max(0, r.top / z), b: Math.max(0, (innerHeight - r.bottom) / z), l: Math.max(0, r.left / z - x), r: Math.max(0, (innerWidth - r.right) / z)};
}
function openDet(k){
  if (!cardMode(LIST) || DET) return;
  OPENR = cardRect(k) || {t:0, b:0, l:0, r:0}; DET = k; DETX = false;
  history.pushState({det: k}, "");
  closeMenu(); document.documentElement.classList.add("lock");
  render(LIST);
  clearTimeout(DETH); DETH = setTimeout(() => { if (DET && !DETX) document.documentElement.classList.add("dhid"); }, T.slow + 80);   // 展開完才藏
}
let DETH;
const showBack = () => { clearTimeout(DETH); document.documentElement.classList.remove("dhid"); };
function closeDet(){ if (!DET) return; if (history.state && history.state.det) history.back(); else shutDet(); }
function shutDet(){
  if (!DET || DETX) return;
  showBack();
  const r = cardRect(DET); if (r) OPENR = r;
  closeMenu(); hideTip();
  if (!canAnim()) return endDet();
  DETX = true; render(LIST);
  setTimeout(endDet, T.mid);
}
function endDet(){ DET = ""; DETX = false; showBack(); document.documentElement.classList.remove("lock"); render(LIST); }
addEventListener("popstate", () => { if (DET && !(history.state && history.state.det)) shutDet(); });
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-open]")) { e.preventDefault(); openDet(e.target.dataset.open); }
  if (e.key === "Escape" && DET && !document.querySelector("#layer .veil") && !window._menu) closeDet();
});
/* 改了設定：馬上套用 */
function changed(k){
  const run = () => { applyPrefs(); if (LIST.length) render(LIST); };
  if (k === "size") sizeShift(run);              // 文字大小：整頁平順地放大／縮小過去
  else if (k === "theme") smooth(run);            // 深淺模式：整頁淡入淡出
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
  if (canAnim()) m.animate([{opacity:0, transform:"scale(.85,.4)"}, {opacity:1, transform:"none"}], {duration:T.spf, easing:SPRING_F});   // 從 ⋯ 的位置往外長出來
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
  if (canAnim()) m.animate([{opacity:0, transform:"scale(.85,.4)"}, {opacity:1, transform:"none"}], {duration:T.spf, easing:SPRING_F});
  window._menu = m; histMark(m);
  setTimeout(() => m.addEventListener("click", () => closeMenu()), 0);
}
function closeMenu(){
  const m = window._menu; if (!m) return; window._menu = null;
  if (!canAnim()) { m.remove(); return histDrop(m); }
  m.animate([{opacity:1}, {opacity:0, transform:"scale(.95,.8)"}], {duration:T.fast, easing:EXIT, fill:"forwards"}).finished.then(() => { m.remove(); histDrop(m); });
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
function selfPaint(root){
  const box = root.querySelector(".selfbox"), sum = root.querySelector(".selfsum"); if (!box) return;
  const hosts = LIST.filter(x => x.online && SELFST[keyOf(x)]);
  const pend = hosts.reduce((n, h) => { const d = SELFST[keyOf(h)]; return n + (d.has && !d.running ? 1 : 0) + (d.cloud && d.cloud.has && !d.cloud.running ? 1 : 0); }, 0);
  if (sum) swapHTML(sum, pend > 1 ? `<span>${pend} 項有新版</span><button class="ubtn sm" data-selfup="*">全部更新</button>` : "");
  const h = LIST.find(x => (x.node || "") === box.dataset.n), d = h && SELFST[keyOf(h)];
  if (!d) return;
  const node = esc(h.node || "");
  const st = d.running ? `<span class="spin"></span>更新中…` : SELFCHK ? `<span class="spin"></span>檢查中…` : d.old || d.supported === false ? `<span class="warn">${esc(d.err)}</span>`
    : d.has ? `<span class="new">有新版可以更新</span>` : d.err ? esc(d.err) : "";
  const ch = d.has && d.changes && d.changes.length ? `<ul class="chg">${d.changes.slice(0, 5).map(c => `<li>${esc(c.split("\n")[0])}</li>`).join("")}</ul>` : "";
  const c = d.cloud;
  const cst = !c ? "" : c.running ? `<span class="spin"></span>更新中…` : c.has ? `<span class="new">官方有新版可以更新</span>` : c.err ? `<span class="warn">${esc(c.err)}</span>` : c.has === false ? "ok" : "還沒檢查";
  const e = c && c.enc;                              // 整顆加密：好了是小鎖頭；舊的雲端硬碟才有「加密」鈕
  const est = !e ? "" : e.running ? ` <span class="spin"></span>加密中…` : e.on ? ` <span class="vlk" title="已加密">${I("lock")}</span>` : "";
  const ebtn = e && !e.on && !e.running && !c.running ? `<button class="ubtn sm" data-cloudenc="${node}"${e.need > e.free ? " disabled" : ""}>加密</button>` : "";
  const crow = c ? `<div class="cl2">${IC("cloud", "")}<span>雲端硬碟<small>${cst === "ok" ? (c.version ? VOK(esc(c.version)) : VOK("最新")) : (c.version ? `<span class="vbs"><span class="vbd">${esc(c.version)}</span></span> ` : "") + cst}${est}</small></span>
    ${c.has && !c.running ? `<button class="ubtn sm" data-cloudup="${node}">更新</button>` : ebtn}</div>` : "";
  const srow = `<div class="cl2 first"><span class="ico theme">${I("upd")}</span><span>哨兵<small title="${esc(d.build || "")}">${st ? (d.version ? `<span class="vbs"><span class="vbd">${esc(d.version)}</span></span> ` : "") + st : d.version ? VOK(esc(d.version)) : ""}</small>${ch}</span>
    ${d.has && !d.running ? `<button class="ubtn sm" data-selfup="${node}">更新</button>` : ""}</div>`;
  swapHTML(box, `<div class="selfrow">${srow}${crow}</div>`);
}
/* 舊的雲端硬碟換成整顆加密的：檔案搬過去、比對過才刪舊的 */
async function cloudEncrypt(root, node){
  const h = LIST.find(x => (x.node || "") === node), d = h && SELFST[keyOf(h)], e = d && d.cloud && d.cloud.enc;
  if (!e) return;
  const ok = await modal({icon: "lock", cls: "theme", title: "加密雲端硬碟？",
    text: `要多 ${size(e.need)} 空位，搬完前打不開。`, ok: "開始加密"});
  if (!ok) return;
  try { const r = await selfCall(node, "cloud_encrypt"); toast(r.message || "已開始加密"); e.running = true; }
  catch (x) { toast(x.message, "bad"); }
  selfPaint(root);
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
  toast("哨兵已更新到新版，重新載入中…");
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
        done.push([j, c.err && !v ? `「${j.name}」的雲端硬碟更新失敗：${c.err}` : v && v !== j.from ? `「${j.name}」的雲端硬碟已更新到 ${v} ✨` : `「${j.name}」的雲端硬碟更新完成 ✨`, !(c.err && !v)]);
      } else if (j.from && d.build && d.build !== j.from) {
        if (!node) { mine = d.version; done.push([j, "", true]); continue; }   // 這台：等一下換上新畫面
        done.push([j, `「${j.name}」的哨兵已更新到 ${d.version} ✨`, true]);
      } else if (!d.running && age > 15000) {
        const bad = d.last && d.last.ok === false;
        done.push([j, bad ? `「${j.name}」的哨兵${d.last.rolled ? "新版打不開，已換回原本的版本" : "更新失敗，已保留原本的版本"}` : `「${j.name}」的哨兵${j.from ? "已經是最新版" : "更新完成"} ✨`, !bad,
          bad ? (d.last.rolled ? "新版打不開，已換回原本的版本" : "沒更新成功，還是原本的版本") : ""]);
      }
    }
  }));
  if (window._reloading) return;
  const mark = () => done.forEach(([j, m, ok, why]) => upvSet(j, ok ? "done" : "fail", ok ? "" : why || m.replace(/^「[^」]*」(的哨兵|的雲端硬碟)?/, "")));
  if (mine) { mark(); UPW.jobs = UPW.jobs.filter(j => !done.some(x => x[0] === j)); UPW.held.push(...done.filter(x => x[1]).map(x => [x[1], x[2]])); return upwReload(`哨兵已更新到 ${mine} ✨`); }
  for (const j of UPW.jobs) if (Date.now() - j.t0 > 15 * 60000 && !done.some(x => x[0] === j)) done.push([j, `「${j.name}」${j.kind === "cloud" ? "的雲端硬碟" : "的哨兵"}更新太久沒回應，請到主機上看看`, false]);
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
    swapHTML(list, rows.map(r => `<div class="upj" data-k="${esc(r.k)}"><div class="upt"><b>${esc(r.name)}</b><small>${r.kind === "cloud" ? "雲端硬碟" : "哨兵"}</small><span class="upn"></span></div>
      ${wave(0, "")}${r.kind === "self" ? `<div class="upsteps">${UPSTEP.map(([k, l]) => `<span data-s="${k}">${l}</span>`).join("")}</div>` : ""}<div class="upm" hidden></div></div>`).join("")); }
  rows.forEach(r => {
    const el = list.querySelector(`[data-k="${CSS.escape(r.k)}"]`); if (!el) return;
    el.className = "upj s-" + r.st;
    txt(el.querySelector(".upn"), UPLB[r.st] || "");
    const w = el.querySelector(".wv"); w.style.setProperty("--v", upvPct(r).toFixed(1) + "%"); w.classList.toggle("b", r.st === "fail");
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
  try { const d = await tgCall({action:"status"});
    stSet(el, d.on ? "" : d.has_token ? "還沒選要傳到哪裡" : "還沒設定", !!d.on);
    el.classList.toggle("on", !!d.on);
  } catch(e) { txt(el, e.message); }
}
async function tgModal(){
  const st = await tgCall({action:"status"}).catch(() => ({}));
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
        <div class="seg keep">${[[0,"不刪除"],[1,"1 小時"],[6,"6 小時"],[24,"1 天"],[47,"2 天"]].map(([h,l])=>`<button type="button" data-keep="${h}" class="${(+st.keep||0)===h?"on":""}">${l}</button>`).join("")}</div></div>
      <div class="msg" aria-live="polite"></div>
    </div>
    <div class="btns three"><button class="ubtn ghost" data-test>測試</button><button class="ubtn" data-save>儲存</button></div>
    ${st.on ? `<button class="linkbtn" data-off>關閉 Telegram 通知</button>` : ""}</div>`;
  $("#layer").appendChild(v);
  const q = k => v.querySelector(`[data-k="${k}"]`), msg = v.querySelector(".msg");
  const say = (t, cls) => { sayTo(msg, t); msg.className = "msg " + (cls || ""); };
  const vals = () => ({token: q("token").value.trim(), chat: q("chat").value.trim(), keep: +((v.querySelector("[data-keep].on") || {}).dataset || {keep:0}).keep});
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
      const f = t.closest("[data-find]");
      if (f) return run(f, "尋找中…", async () => {
        const d = await tgCall({action:"find", token: vals().token});
        const box = v.querySelector(".chats");
        swapHTML(box, d.chats.map(c => `<button type="button" data-chat="${esc(c.id)}">${esc(c.name)}</button>`).join(""));
        if (d.chats.length === 1) { q("chat").value = d.chats[0].id; box.firstChild.classList.add("on"); }
        say(d.chats.length > 1 ? `找到 ${d.chats.length} 個聊天，點一下要傳去哪裡` : `會傳到「${d.chats[0].name}」`, "ok");
      });
      const kp = t.closest("[data-keep]");
      if (kp) { v.querySelectorAll("[data-keep]").forEach(x => x.classList.toggle("on", x === kp)); return; }
      const c = t.closest("[data-chat]");
      if (c) { q("chat").value = c.dataset.chat; v.querySelectorAll("[data-chat]").forEach(x => x.classList.toggle("on", x === c)); return say(""); }
      const tb = t.closest("[data-test]");
      if (tb) return run(tb, "傳送中…", async () => { const d = await tgCall({action:"test", ...vals()}); if (d.chat) q("chat").value = d.chat; say(d.message, "ok"); });
      const sb = t.closest("[data-save]");
      if (sb) return run(sb, "儲存中…", async () => { const d = await tgCall({action:"save", ...vals()}); toast(d.message); done(); });
      const ob = t.closest("[data-off]");
      if (ob) return run(ob, "關閉中…", async () => { const d = await tgCall({action:"save", off:true}); toast(d.message); done(); });
    });
    q("chat").addEventListener("input", () => v.querySelectorAll("[data-chat]").forEach(x => x.classList.remove("on")));
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
  try { const d = await skyCall({action:"status"}); txt(el, skyLine(d)); el.classList.toggle("on", !!d.on && !d.err); }
  catch(e) { txt(el, e.message); }
}
async function skyModal(){
  const st = await skyCall({action:"status"}).catch(() => ({}));
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog skyd">${IC("fly","big")}<h3>OpenSky 帳號</h3>
    <p>填了每天可以查 4000 次（沒填 400 次）</p>
    <div class="form">
      <button type="button" class="ubtn ghost find" data-file>${I("archive")}選帳號檔（credentials.json）</button>
      <input type="file" accept=".json,application/json" hidden>
      <label>client_id<input class="field" data-k="id" autocomplete="off" spellcheck="false" value="${esc(st.id || "")}"></label>
      <label>client_secret<input class="field" data-k="secret" type="password" autocomplete="off" spellcheck="false" placeholder="${st.on ? "已經設定過" : ""}"></label>
      <div class="msg" aria-live="polite"></div>
    </div>
    <div class="btns"><button class="ubtn" data-save>儲存</button></div>
    ${st.on ? `<button class="linkbtn" data-off>移除帳號</button>` : ""}</div>`;
  $("#layer").appendChild(v);
  const q = k => v.querySelector(`[data-k="${k}"]`), msg = v.querySelector(".msg"), file = v.querySelector("input[type=file]");
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
/* 對話框：不放「取消」「關閉」鈕（點旁邊、往下滑、Esc 就關）；電腦上右上角一個 ×
   打開時記一筆瀏覽紀錄，返回手勢先關最上面的視窗，不會整頁退出（機場起降、主機細節也一樣） */
let DLGN = 0, DLGSKIP = 0;
new MutationObserver(ms => { for (const m of ms) {
  for (const v of m.addedNodes) {
    const d = v.classList && v.classList.contains("veil") && v.querySelector(".dialog"); if (!d) continue;
    if (!v.classList.contains("upv") && !d.querySelector(".dx")) {
      d.insertAdjacentHTML("afterbegin", `<button type="button" class="dx" aria-label="關閉">${I("x")}</button>`);
      d.firstChild.addEventListener("click", e => { e.stopPropagation(); if (v._esc) v._esc(); });
    }
    histMark(v);
  }
  for (const v of m.removedNodes) histDrop(v);
} }).observe($("#layer"), {childList:true});
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
  : e && e.name === "NotAllowedError" ? "已取消，或等太久了" : e && e.name === "SecurityError" ? "網址不符，請用平常的網域網址打開哨兵"
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
function devModel(m){                       // 型號代碼換成看得懂的名字（三星 S、Z 系列換成第幾代）
  m = String(m || "").replace(/\s*Build\/.*$/, "").trim();
  if (!m || m === "K") return "";
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
function devName(){
  const u = navigator.userAgent, os = devOs(), ver = parseInt(DEVH.platformVersion || "", 10);
  if (os === "ios") { const v = /OS (\d+)_/.exec(u); return (/iPhone/.test(u) ? "iPhone" : "iPad") + (v ? `（iOS ${v[1]}）` : ""); }
  if (os === "android") return devModel(DEVH.model) || devModel((/Android [\d.]+; ([^;)]+)/.exec(u) || [])[1]) || "Android 手機";
  if (os === "mac") return ver ? `Mac（macOS ${ver}）` : "Mac";
  if (os === "win") return ver ? `Windows ${ver >= 13 ? 11 : 10} 電腦` : "Windows 電腦";
  return os === "linux" ? (/CrOS/.test(u) ? "Chromebook" : "Linux 電腦") : "我的裝置";
}
/* 登入的裝置清單上的名字：裝置＋瀏覽器（安卓 App 寫 App） */
function devLabel(){
  const u = navigator.userAgent;
  const b = typeof VSApp !== "undefined" || /; wv\)/.test(u) ? "App" : /Edg\//.test(u) ? "Edge" : /SamsungBrowser/.test(u) ? "三星瀏覽器" : /Firefox|FxiOS/.test(u) ? "Firefox"
    : /Chrome|CriOS/.test(u) ? "Chrome" : /Safari/.test(u) ? "Safari" : "";
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
    challenge:ub(b.challenge), rp:{id:b.rp, name:"VPS 哨兵"},
    user:{id:ub(b.user), name:`VPS 哨兵（${b.name}）`, displayName:`VPS 哨兵（${b.name}）`},
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
  try { const d = await pkCall("/api/passkey", {action:"list"}, 1);
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
  $("#layer").appendChild(v);
  const list = v.querySelector(".pklist"), msg = v.querySelector(".msg"), add = v.querySelector("[data-add]"), lab = v.querySelector(".pkadd");
  const day = t => { const d = new Date(t * 1000); return `${d.getMonth()+1}/${d.getDate()}`; };
  let keys = [], max = 5, busy = false;
  const draw = () => {
    swapHTML(list, keys.map(k => `<div class="pkrow"><span>${esc(k.name)}<small>${day(k.added)} 登記${k.used ? `・${day(k.used)} 用過` : "・還沒用過"}</small></span>
      <button type="button" class="iconbtn" data-del="${esc(k.id)}" data-name="${esc(k.name)}" title="刪掉這支">${I("x")}</button></div>`).join(""));
    const full = keys.length >= max;
    lab.style.display = full ? "none" : "";
    add.disabled = full; add.textContent = full ? `已經登記滿 ${max} 支` : `登記${me}`;
  };
  try { const d = await pkCall("/api/passkey", {action:"list"}, 1); keys = d.keys || []; max = d.max || 5; draw(); }
  catch(e) { msg.className = "msg bad"; msg.textContent = e.message; }
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      if (busy) return;
      const del = e.target.closest("[data-del]");
      if (del) {
        if (!await modal({icon:"finger", cls:"bad", title:`刪掉「${del.dataset.name}」？`, text:"刪掉之後，它就不能再用指紋或臉部辨識登入哨兵。", ok:"刪除"})) return;
        busy = true;
        const d = await pkCall("/api/passkey", {action:"delete", id:del.dataset.del}, 1).catch(err => ({message:err.message}));
        busy = false;
        if (d.ok) { keys = d.keys || []; draw(); toast(d.message); } else toast(d.message || "刪除失敗", "bad");
        return;
      }
      if (!e.target.closest("[data-add]")) return;
      busy = true; add.disabled = true; add.innerHTML = `<span class="spin"></span>請在${me}上確認…`; msg.className = "msg"; msg.textContent = "";
      try {
        const d = await pkRegister(v.querySelector('[data-k="name"]').value.trim());
        keys = d.keys || []; store("vps-pk", "1"); toast(d.message);
      } catch(err) { msg.className = "msg bad"; msg.textContent = pkErr(err); }
      busy = false; draw();
    });
  });
}

/* 設定列表的狀態：設好了只在右邊放一個勾或數字，還沒設好（要你動手）才寫字 */
function stSet(el, t, b){
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
  try { const d = await sessCall({action:"list"}); stSet(el, "", (d.list || []).length || 1); }
  catch(e) { txt(el, e.message); }
}
async function sessModal(){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog pkd">${IC("devices","big")}<h3>登入的裝置</h3>
    <div class="form"><div class="pklist"></div><div class="msg"></div></div>
    </div>`;
  $("#layer").appendChild(v);
  const list = v.querySelector(".pklist"), msg = v.querySelector(".msg");
  let rows = [], busy = false;
  const draw = () => swapHTML(list, rows.map(x => `<div class="pkrow dvrow">${devIcon(x)}<span>${devRow(x)}</span>
      ${x.me ? `<span class="dvme">這台</span>` : `<button type="button" class="iconbtn" data-del="${esc(x.id)}" data-name="${esc(x.dev)}" title="登出這台">${I("x")}</button>`}</div>`).join(""));
  try { rows = (await sessCall({action:"list", dev:devLabel(), os:devOs()})).list || []; draw(); }
  catch(e) { msg.className = "msg bad"; msg.textContent = e.message; }
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
      if (d.ok) { rows = d.list || []; draw(); toast(`已登出「${del.dataset.name}」`); } else toast(d.message || "登出失敗", "bad");
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
    stSet(el, !d.on ? "還沒設定" : d.locked ? `輸錯太多次，暫停中（還有 ${Math.ceil(d.locked / 60)} 分鐘）` : "", !!(d.on && !d.locked));
    el.classList.toggle("on", !!d.on && !d.locked);
  } catch(e) { txt(el, e.message); }
}
async function pinModal(){
  const st = await pinCall({action:"status"}).catch(() => ({}));
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog pindlg2">${IC("pin","big")}<h3>${st.on ? "換一組 PIN 碼" : "設定 PIN 碼"}</h3>
    <p data-t>輸入 4～8 位數字</p><div class="ppbox"></div><div class="msg"></div>
    <div class="btns">${st.on ? `<button class="ubtn ghost" data-off>關閉 PIN 碼</button>` : ""}<button class="ubtn" data-ppgo>確定</button></div></div>`;
  $("#layer").appendChild(v);
  const msg = v.querySelector(".msg"), tip = v.querySelector("[data-t]");
  return new Promise(res => {
    let busy = false, first = "";
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
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
      if (d.ok) { toast(d.message); done(); } else { first = ""; txt(tip, "輸入 4～8 位數字"); bad(d.message || "設定失敗"); pad.again(); }
    }});
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      if (busy) return;
      if (e.target.closest("[data-off]")) {
        busy = true;
        const d = await pinCall({action:"off"}).catch(err => ({message:err.message}));
        busy = false;
        if (d.ok) { toast(d.message); done(); } else bad(d.message || "關閉失敗");
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
    stSet(el, n ? "" : "還沒配對", n);
    el.classList.toggle("on", n > 0);
  } catch(e) { txt(el, e.message); }
}
async function pairModal(){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog pkd pairdlg">${IC("link","big")}<h3>配對暗號</h3>
    <p>在主要主機按「新增主機」，貼上暗號</p>
    <div class="form"><div class="pklist"></div><div class="pcode"></div><div class="msg"></div></div>
    <div class="btns"><button class="ubtn" data-gen>產生暗號</button></div></div>`;
  $("#layer").appendChild(v);
  const list = v.querySelector(".pklist"), box = v.querySelector(".pcode"), msg = v.querySelector(".msg"), gen = v.querySelector("[data-gen]");
  let keys = [], code = "", busy = false;
  const draw = () => {
    swapHTML(list, keys.map(k => `<div class="pkrow"><span>${esc(k.name)}<small>${pairDay(k.t)} 配對${k.seen ? `・${ago(k.seen).replace(/\d$/, "$& ")}連過` : ""}</small></span>
      <button type="button" class="iconbtn" data-del="${esc(k.id)}" data-name="${esc(k.name)}" title="解除配對">${I("x")}</button></div>`).join(""));
    swapHTML(box, code ? `<div class="codebox" data-x><code>${esc(code)}</code><button type="button" class="ubtn sm" data-cp>複製</button></div>
      <small>24 小時內有效，用一次就失效</small>` : "");
    gen.textContent = code ? "重新產生" : "產生暗號";
  };
  try { keys = (await pairCall({action:"status"})).keys || []; draw(); }
  catch(e) { msg.className = "msg bad"; msg.textContent = e.message; }
  // 暗號貼到主要主機、配對好了：這台改成被監看，重新載入換成被監看的那一頁
  let watch = 0;
  const check = async () => {
    const d = await pairCall({action:"status"}).catch(() => null);
    if (!d || v._d) return;
    const n = (d.keys || []).find(k => !keys.some(x => x.id === k.id));
    if (!n) return;
    clearInterval(watch); toast(`已和「${n.name}」配對好了`);
    if (LIST.length > 1) { keys = d.keys; code = ""; return draw(); }   // 這台自己也在看別台：不會被監看，留在這裡
    setTimeout(() => location.reload(), 1400);
  };
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; clearInterval(watch); v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
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
        if (d.ok) { keys = d.keys || []; draw(); toast(d.message); } else toast(d.message || "解除失敗", "bad");
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
  v.innerHTML = `<div class="dialog dld">${IC("dl","big")}<h3>遠端下載</h3>
    <p>存到「${esc(name)}」雲端硬碟的「下載」資料夾</p>
    <div class="form"><div class="dlnew"><input class="field" data-k="url" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="貼上連結或分享文字"><button class="ubtn" data-go>下載</button></div>
      <div class="msg"></div><div class="dllist"></div><small class="dlroom"></small>
      <div class="dlyt" hidden><small><a href="#" data-yt>網站登入資料</a><span></span></small>
        <div class="dlck" hidden><textarea class="field pfield" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="貼上 cookies.txt 的內容"></textarea>
          <small>被擋時才會用；建議用備用帳號；不同網站分開貼</small>
          <div class="dlnew"><button type="button" class="ubtn sm ghost" data-ckdel>清除</button><button type="button" class="ubtn sm" data-cksave>儲存</button></div></div></div></div>
    </div>`;
  $("#layer").appendChild(v);
  const inp = v.querySelector("input"), msg = v.querySelector(".msg"), go = v.querySelector("[data-go]"), list = v.querySelector(".dllist"), room = v.querySelector(".dlroom");
  const call = body => pkCall("/api/download" + (node ? "?node=" + encodeURIComponent(node) : ""), body, 1).catch(err => ({message:err.message}));
  const say = (t, bad) => { msg.className = "msg" + (bad ? " bad" : ""); sayTo(msg, t); };
  const left = s => s < 60 ? `${Math.max(1, Math.round(s))} 秒` : s < 3600 ? `${Math.round(s / 60)} 分鐘` : `${(s / 3600).toFixed(1)} 小時`;
  const stOf = j => j.st === "wait" ? j.err || "排隊中" : j.st === "ok" ? `下載好了・${size(j.total)}` : j.st === "bad" ? j.err || "沒有成功"
    : j.total ? `${Math.floor(j.done / j.total * 100)}%${j.bps ? `・${rate(j.bps)}・剩 ${left((j.total - j.done) / j.bps)}` : `・共 ${size(j.total)}`}`
    : `${size(j.done)}${j.bps ? `・${rate(j.bps)}` : ""}`;
  let timer = 0, busy = false;
  const draw = d => {
    if (!d || !Array.isArray(d.list)) return;
    if (!d.cloud) { inp.disabled = go.disabled = true; say("這台沒有雲端硬碟", 1); }
    room.textContent = d.cloud ? `還能放 ${size(d.room)}` : "";
    const yt = d.yt || {}, ys = v.querySelector(".dlyt");
    reveal(ys, !!yt.tool);
    ys.querySelector("span").textContent = `：${yt.cookies ? "已設定" : "還沒設定"}${yt.warp ? "・WARP 已開" : ""}`;
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
      const tr = r.querySelector(".track"), run = j.st === "run" || j.st === "wait";
      reveal(tr, run);
      if (run) r.querySelector(".fill").style.width = (j.total ? Math.max(1, j.done / j.total * 100) : 0) + "%";
      const rb = r.querySelector("[data-retry]");
      if (rb.hidden !== (j.st !== "bad")) { rb.hidden = j.st !== "bad"; if (!rb.hidden && canAnim()) rb.animate([{opacity:0, transform:"scale(.6)"}, {opacity:1, transform:"none"}], {duration:T.spf, easing:SPRING_F}); }
      r.querySelector("[data-del]").title = run ? "取消下載" : "從清單拿掉（檔案不會刪）";
    });
    [...list.children].forEach(r => { if (!seen.has(r.dataset.id) && !r._leaving) { r._leaving = 1; canAnim() ? leaveBlock(r) : r.remove(); } });
    clearTimeout(timer);
    if (!v._d) timer = setTimeout(load, d.list.some(j => j.st === "run" || j.st === "wait") ? 1000 : 5000);
  };
  const load = async () => { const d = await call({action:"list"}); if (!v._d) { if (d.list) draw(d); else { say(d.message || d.error || "讀取失敗", 1); timer = setTimeout(load, 5000); } } };
  const done = () => { if (v._d) return; v._d = 1; clearTimeout(timer); v.classList.add("closing"); setTimeout(() => v.remove(), 360); };
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
    if (e.target.closest("[data-yt]")) { e.preventDefault(); const ck = v.querySelector(".dlck"), on = ck.hidden || ck._hiding; reveal(ck, on); if (on) ck.querySelector("textarea").focus({preventScroll:true}); return; }
    const cs = e.target.closest("[data-cksave],[data-ckdel]");
    if (cs) {
      const ta = v.querySelector(".dlck textarea"), text = cs.matches("[data-ckdel]") ? "" : ta.value.trim();
      if (!text && cs.matches("[data-cksave]")) return ta.focus();
      const d = await call({action:"cookies", text});
      say(d.message || "沒有成功", !d.ok);
      if (d.ok) { ta.value = ""; reveal(v.querySelector(".dlck"), false); }
      return draw(d);
    }
    const row = e.target.closest(".dlrow"), del = e.target.closest("[data-del]"), re = e.target.closest("[data-retry]");
    if (!row || !(del || re)) return;
    const d = await call({action: re ? "retry" : "stop", id: row.dataset.id});
    if (!d.ok) say(d.message || "沒有成功", 1);
    draw(d);
  });
  load();
  if (!matchMedia("(hover:none)").matches) setTimeout(() => inp.focus(), 60);   // 手機不自動跳出鍵盤
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
    try { const d = await bkGet(el.dataset.n), [t, c] = bkLine(d); txt(el, el.closest(".tbx") ? t.replace(/^上次備份：/, "").replace(/（.*）$/, "") : t); el.className = "bkst " + c; bkDots(el.parentNode.querySelector(".bkdots"), d); }
    catch(e) { txt(el, e.message); el.className = "bkst"; }
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
function bkRows(d){
  const L = d.last, row = (ok, t, sub) => `<li class="${ok === null ? "" : ok ? "ok" : "bad"}">${ok === null ? "" : I(ok ? "ok" : "warn")}<span>${t}${sub ? `<small>${esc(sub)}</small>` : ""}</span></li>`;
  let h = "";
  if (L) {
    h += row(null, `<b>上次備份</b>${esc(when(L.t))}${L.size ? `・${bkSize(L.size)}` : ""}`);
    if (L.msg) h += row(false, esc(L.msg));
    const to = L.to || [];                         // 存到哪裡：一排小圖示（這台、Telegram、其他主機），成功打勾、失敗打叉；失敗的另外一行寫原因
    if (to.length) h += `<li class="bkto">${to.map(x => { const tg = /Telegram/.test(x.where), nm = (/「(.+?)」/.exec(x.where) || [])[1];
      return `<span class="${x.ok ? "ok" : "bad"}" title="${esc(x.where)}">${I(tg ? "bell" : nm ? "net" : "disk")}<em>${esc(tg ? "Telegram" : nm || "這台")}</em><i>${I(x.ok ? "ok" : "x")}</i></span>`; }).join("")}</li>`;
    h += to.filter(x => !x.ok).map(x => row(false, `${esc(x.where)}沒有成功`, x.msg)).join("");
    if (L.items && L.items.length) h += row(null, `<b>備份內容</b>${esc(L.items.join("、"))}`);
    if (L.big && L.big.length) h += row(null, `<b>太大沒備份</b>${esc(L.big.map(p => p.split("/").pop()).join("、"))}`);
  } else h += row(null, d.on ? "還沒備份過" : "每日備份已關閉");
  if (!d.tg) h += row(null, `<small>開啟 Telegram 通知會多存一份</small>`);
  return h;
}
/* 這台存著哪些主機的備份（每台主機都存著每一台的） */
const bkCopies = d => (d.copies || []).map(c => `<li>${I("archive")}<span><b>${esc(c.name)}${c.me ? "（這台）" : ""}</b>${+c.count || 0} 份<small>最新：${esc(when(c.t))}・${bkSize(c.size)}</small></span></li>`).join("");   // 沒有就整段不放（上面已經寫「還沒備份過」）
async function bkModal(node, label){
  let d = await bkGet(node).catch(e => ({err:e.message}));
  if (d.err) return toast(d.err, "bad");
  const v = document.createElement("div"); v.className = "veil";
  const multi = LIST.length > 1;
  v.innerHTML = `<div class="dialog bkdlg">${IC("archive","big")}<h3>每日備份${multi ? `：${esc(label)}` : ""}</h3>
    <div class="form">
      <ul class="bkrows">${bkRows(d)}</ul>
      <div class="lbl">${bkCopies(d) ? `${d.where === "雲端硬碟" ? "這台的雲端硬碟裡有" : "這台主機上有"}${d.where === "雲端硬碟" ? `<small>「${esc(d.folder)}」資料夾</small>` : ""}<ul class="bkrows bkcopies">${bkCopies(d)}</ul>` : ""}
        <button class="linkish bkchg" data-restore>怎麼還原？</button></div>
      <div class="lbl">解開密碼（所有主機共用）<b class="bkkey" tabindex="0" role="button" title="點一下顯示">${esc(d.key)}</b>
        <small>沒有它誰都打不開，請另外記好</small>
        <button class="linkish bkchg" data-chg>改成自己的密碼</button>
        <span class="bknew" hidden><input class="field" type="password" maxlength="128" autocomplete="new-password" placeholder="至少 8 個字"><button class="ubtn sm" data-setkey>儲存</button></span></div>
      <label class="bkon" title="每天 ${+d.hour || 0} 點自動備份"><span class="bkat">${I("clock")}<b class="num">${String(+d.hour || 0).padStart(2, "0")}:00</b></span><input type="checkbox" class="tog" ${d.on ? "checked" : ""}></label>
      <div class="msg"></div></div>
    <div class="btns three"><button class="ubtn ghost" data-dl>下載</button><button class="ubtn" data-run>立即備份</button></div></div>`;
  $("#layer").appendChild(v);
  const msg = v.querySelector(".msg"), rows = v.querySelector(".bkrows"), runb = v.querySelector("[data-run]");
  const say = (t, c = "") => { msg.className = "msg " + c; sayTo(msg, t); };
  const post = async (body, here) => {           // here：送給目前開著的這台（換密碼由它負責通知其他台）
    const r = await api("/api/backup" + (here ? "" : bkQ(node)), {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(body)});
    const x = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(x.message || x.error || "失敗了，請再試一次");
    return x;
  };
  const busy = (b, t) => { b.disabled = !!t; b.innerHTML = t ? `<span class="spin"></span>${t}` : b._t; };
  v.querySelectorAll(".btns button").forEach(b => b._t = b.innerHTML);
  return new Promise(res => {
    let live = true;
    const done = () => { if (v._d) return; v._d = 1; live = false; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    const watch = async () => {                    // 備份中：每 1.5 秒看一次，好了就更新上面的清單
      busy(runb, "備份中…");
      while (live) {
        await new Promise(r => setTimeout(r, 1500));
        try { d = await bkGet(node); } catch(e) { continue; }
        if (!d.running) break;
      }
      if (!live) return;
      busy(runb); swapHTML(rows, bkRows(d)); { const bc = v.querySelector(".bkcopies"); if (bc) swapHTML(bc, bkCopies(d)); }
      d.last && d.last.ok ? say("備份好了", "ok") : say("有地方沒備份成功，看上面的說明", "bad");
    };
    if (d.running) watch();
    v.addEventListener("change", async e => {
      const t = e.target; if (!t.classList.contains("tog")) return;
      try { const x = await post({action:"set", on:t.checked}); d.on = t.checked; toast(x.message); }
      catch(err) { t.checked = !t.checked; say(err.message, "bad"); }
    });
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      if (e.target.closest("[data-restore]")) {     // 還原說明蓋在上面時，先把這個視窗藏起來（玻璃疊在一起會看到底下的字）
        const box = v.querySelector(".dialog"); box.style.visibility = "hidden";
        await bkRestore(); box.style.visibility = "";
        return;
      }
      if (e.target.closest("[data-chg]")) {
        const box = v.querySelector(".bknew"); reveal(box, true); reveal(e.target.closest("[data-chg]"), false);
        return box.querySelector("input").focus();
      }
      const sk = e.target.closest("[data-setkey]");
      if (sk && !sk.disabled) {
        const inp = v.querySelector(".bknew input"), key = inp.value;
        if (key.length < 8) return say("密碼至少要 8 個字", "bad");
        if (!await modal({icon:"key", cls:"warn", title:"換成新的解開密碼？", text:"所有主機一起換。舊備份仍要用舊密碼，請留著。", ok:"換"})) return;
        busy(sk, "儲存中…");
        try {
          const x = await post({action:"key", key, sync:true}, true); d.key = key;
          const kb = v.querySelector(".bkkey"); kb.textContent = key; kb.classList.add("on");
          inp.value = ""; reveal(v.querySelector(".bknew"), false); reveal(v.querySelector("[data-chg]"), true); say(x.message, "ok");
        } catch(err) { say(err.message, "bad"); }
        busy(sk);
        return;
      }
      const k = e.target.closest(".bkkey");
      if (k) {
        if (!k.classList.contains("on")) return k.classList.add("on");
        try { await navigator.clipboard.writeText(d.key); toast("已複製解開密碼"); } catch(err) { /* 不能複製就讓使用者自己選取 */ }
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
async function bkRestore(){
  const d = await bkGet("").catch(e => ({err:e.message}));
  if (d.err) return toast(d.err, "bad");
  const here = "sudo python3 ~/vps-sentinel/sentinel.py --restore";
  const hosts = d.copies || [];
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog bkdlg">${IC("archive","big")}<h3>還原備份</h3>
    <p>原本的檔案會先另存一份</p>
    <div class="form">
      <div class="lbl">讓主機回到前幾天的樣子<small>在那台執行這行（點一下複製）</small>
        <code class="bkcmd" tabindex="0" role="button" data-cmd="${esc(here)}">${esc(here)}</code></div>
      ${hosts.length ? `<div class="lbl">整台搬到新主機（原本那台壞掉時）<small>網域先指向新主機，選一台，把指令貼到新主機執行（24 小時內有效）</small>
        <div class="bkhosts">${hosts.map(h => `<button class="ubtn ghost sm" data-link="${esc(h.name)}">${esc(h.name)}</button>`).join("")}</div>
        <code class="bkcmd" tabindex="0" role="button" data-cmd="" hidden></code></div>` : ""}
      <div class="msg"></div></div>
    </div>`;
  $("#layer").appendChild(v);
  const msg = v.querySelector(".msg");
  const say = (t, c = "") => { msg.className = "msg " + c; sayTo(msg, t); };
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      const c = e.target.closest(".bkcmd");
      if (c) {
        try { await navigator.clipboard.writeText(c.dataset.cmd); toast("已複製指令"); } catch(err) { /* 不能複製就讓使用者自己選取 */ }
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
        const box = v.querySelector(".bkhosts + .bkcmd");
        box.dataset.cmd = cmd; txt(box, cmd); reveal(box, true);
        v.querySelectorAll("[data-link]").forEach(x => x.classList.toggle("on", x === b));
        say(`這是「${b.dataset.link}」的還原指令，點一下複製`, "ok");
      } catch(err) { say(err.message, "bad"); }
      b.disabled = false;
    });
  });
}

/* ═════════ 登入 ═════════ */
const LOGO = LOGOSVG("lg").replace("<svg", '<svg class="logo"');
function login(msg){
  $("#app").innerHTML = `<div class="login ${msg?"shake":""}">${LOGO}<h1>VPS 哨兵</h1>
    <input id="tok" class="field" type="password" placeholder="存取密碼" autocomplete="current-password">
    <label class="remember"><input type="checkbox" id="rem" ${REM ? "checked" : ""}><span>30 天內不用再登入</span></label>
    <div class="err">${msg||""}</div><button class="ubtn" data-login>進入</button>${PIN_ON ? pinBtn : ""}${PK_OK && store("vps-pk") ? pkBtn : ""}</div>`;
  $("#tok").addEventListener("keydown",e=>{ if(e.key==="Enter") doLogin(); });
  $("#rem").addEventListener("change", e => { REM = e.target.checked; });
  pkCall("/api/passkey-login", {action:"has"}).then(d => {   // 問主機有沒有設定 PIN 碼、有沒有登記手機金鑰，有才顯示
    const box = $("#app .login");
    if (!box) return;
    PIN_ON = !!d.pin;
    const add = h => { box.insertAdjacentHTML("beforeend", h); const b = box.lastElementChild;
      if (canAnim()) b.animate([{opacity:0, transform:"translateY(-4px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE}); };
    if (PIN_ON && !box.querySelector("[data-pinlogin]")) add(pinBtn);
    if (PK_OK && d.has && !box.querySelector("[data-pklogin]")) add(pkBtn);
  }).catch(() => {});
  fetch("/api/restore", {cache:"no-store"}).then(r => r.json()).then(d => {   // 剛裝好、正在等待還原：多一個入口
    const box = $("#app .login");
    if (d.active && box && !box.querySelector("[data-rsw]")) box.insertAdjacentHTML("beforeend", `<button class="linkish rswgo" data-rsw>從備份還原</button>`);
  }).catch(() => {});
}

/* ═════════ 從備份還原（安裝時選了「從備份還原」）═════════
   網址上的 ?restore=代碼 是安裝完成時終端機給的一次性代碼；有代碼才能上傳備份檔、開始還原 */
const RSW = {code: sessionStorage.getItem("vs-rsw") || "", poll: 0, down: 0};
function rswApi(path, opt = {}){
  return fetch(path, {...opt, cache:"no-store", headers:{...(opt.headers || {}), "X-Restore-Code": RSW.code}});
}
async function restoreScreen(){
  endSplash(); clearTimeout(timer);
  $("#app").innerHTML = `<div class="login rsw">${LOGO}<h1>從備份還原</h1>
    <p>上傳備份檔，主機就會回到備份時的樣子</p><div class="rswbody"></div></div>`;
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
  body.innerHTML = `<input class="field" id="rswcode" placeholder="還原代碼（安裝完成時終端機上顯示的）" autocomplete="off" value="${esc(RSW.code)}">
    <div class="err">${esc(err)}</div><button class="ubtn" data-rswcode>下一步</button>`;
  const go = () => { RSW.code = $("#rswcode").value.trim().toUpperCase(); sessionStorage.setItem("vs-rsw", RSW.code); rswShow(); };
  body.querySelector("[data-rswcode]").onclick = go;
  $("#rswcode").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
}
function rswForm(body){
  body.innerHTML = `<label class="ubtn ghost rswfile"><input type="file" accept=".vsbk" multiple hidden>${IC("archive")}<span class="rswname">選擇備份檔（.vsbk）</span></label>
    <input class="field" id="rswpw" type="password" placeholder="解開密碼" autocomplete="off">
    <small class="rswtip">備份檔在 Telegram（分段的全部一起選）或另一台的雲端硬碟「哨兵備份」裡；密碼用總密碼或 Telegram 附的都行</small>
    <div class="err"></div><button class="ubtn" data-rswgo>開始還原</button>`;
  const inp = body.querySelector("input[type=file]"), err = body.querySelector(".err"), go = body.querySelector("[data-rswgo]");
  const lab = body.querySelector(".rswname");
  inp.onchange = () => {
    const fs = [...inp.files], b = rswJoin(fs);
    lab.textContent = !fs.length ? "選擇備份檔（.vsbk）" : fs.length > 1 ? `${fs.length} 段（${bkSize(b.size || 0)}）` : `${fs[0].name}（${bkSize(fs[0].size)}）`;
    err.textContent = b.err || "";
  };
  go.onclick = async () => {
    const b = rswJoin([...inp.files]), f = b.blob, pw = $("#rswpw").value;
    if (b.err) return err.textContent = b.err;
    if (!f) return err.textContent = "請先選擇備份檔";
    if (!pw) return err.textContent = "請輸入解開密碼";
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
             : RSW.down ? "哨兵正在重新啟動，等一下就好…" : "請不要關掉這個頁面";
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
  const v = $("#tok").value.trim();
  const pin = PIN_ON && /^\d{4,8}$/.test(v);
  const b = $("#app [data-login]"); b.disabled = true;
  let d = {};
  try { const r = await fetch(pin ? "/api/pin-login" : "/api/login", {method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({[pin ? "pin" : "pw"]: pin ? await pinProof(v, () => pkCall("/api/pin-login", {action:"begin"})) : v, keep:REM, dev:devLabel(), os:devOs()})});
    d = await r.json().catch(() => ({})); }
  catch(e) { d = {message:"連線失敗，請稍後再試"}; }
  if (d.ok && d.token) { if (!pin) window._fresh = true; setTok(d.token, REM); return tick(); }   // 用密碼登入才把 PIN 碼輸錯的次數歸零
  login(d.message || (pin ? "PIN 碼不對" : "密碼不對，再試一次"));
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
  return Promise.resolve().then(run).finally(free);
}
const ONCE_SEL = "button,a,[role=button],[data-open],[data-dsel]";
document.addEventListener("click", e => {
  if (!e.target.closest || e.target.closest("#layer") || e.target.closest("#fly")) return;
  return onceClick(e.target.closest(ONCE_SEL), () => pageClick(e));
});
async function pageClick(e){
  if (e.target.closest("#layer") || e.target.closest("#fly")) return;
  if (e.target.closest("[data-fly]")) return flyEnter(e.target.closest("[data-fly]"));
  const t = e.target;
  if (t.closest("[data-login]")) return doLogin();
  if (t.closest("[data-pklogin]")) return pkLoginClick(t.closest("[data-pklogin]"));
  if (t.closest("[data-pinlogin]")) return pinLoginClick();
  if (t.closest("[data-rsw]")) return restoreScreen();
  const tb = t.closest("[data-tab]");
  if (tb) { if ($("#fly") && !tb.closest("#fly")) { flyClose(); if (TAB === tb.dataset.tab) return; } return setTab(tb.dataset.tab); }   // 機場起降開著時按分頁列：先關掉
  if (t.closest("[data-settings]")) return setTab("set");
  if (t.closest("[data-back]")) return closeDet();
  if (t.closest("[data-addhost]")) return addHostModal();
  const rg = t.closest("[data-range]");
  if (rg) { if (RANGE !== rg.dataset.range) { RANGE = rg.dataset.range; store("vps-range", RANGE); render(LIST); } return; }
  const tf = t.closest("[data-traffic]");
  if (tf) return trafficModal(tf.dataset.traffic, tf.dataset.label);
  if (t.closest("[data-refresh]")) return refreshNow(t.closest("[data-refresh]"));
  if (t.closest("[data-logout]")) {
    if (await modal({icon:"logout", cls:"theme", title:"要登出嗎？", text:"", ok:"登出"})) { sessCall({action:"out"}).catch(() => {}); setTok(""); LIST = []; clearTimeout(timer); DET = ""; showBack(); document.documentElement.classList.remove("lock"); login(); }
    return;
  }
  const th = t.closest("[data-toolh]");
  if (th) { if (TOOLH !== th.dataset.toolh) { TOOLH = th.dataset.toolh; store("vs-toolh", TOOLH); PSMOOTH = true; holdHeight(() => slideSel(() => render(LIST))); PSMOOTH = false; } pickShow(true); return; }
  const scg = t.closest("[data-setc]");
  if (scg) { if (SETC !== scg.dataset.setc) { SETC = scg.dataset.setc; store("vs-setc", SETC); slideSel(() => render(LIST)); } return; }
  const lf = t.closest("[data-logf]");
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
  if (dl) return dlModal(dl.dataset.dl, dl.dataset.name);
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
  const ce = t.closest("[data-cloudenc]");
  if (ce) return cloudEncrypt(view(), ce.dataset.cloudenc);
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
  const ds = t.closest("[data-dsel]");
  if (ds && !t.closest("[data-more]")) { DSEL = ds.dataset.dsel; store("vs-dsel", DSEL); if (TAB !== "home") return setTab("home"); return render(LIST); }
  const op = t.closest("[data-open]");
  if (op) return openDet(op.dataset.open);
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
function flyEnter(btn){ return flyLib().then(() => flyOpen(btn), () => toast("機場起降打不開，請再試一次", "bad")); }
/* ═════════ 定時抓資料 ═════════ */
let timer;
const T0 = performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms));
let BOOTED = false, REFRESHING = false;
function splashMsg(t){ const m = document.querySelector(".sp-msg"); if (m && m.textContent !== t) m.innerHTML = `<span>${esc(t)}</span>`; }
function endSplash(){
  if (BOOTED) return; BOOTED = true;
  if (store(FLYK)) setTimeout(() => flyLib().catch(() => {}), 2000);   // 用過機場起降：先在背景下載，按下去就能打開
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
const UIIN = new Set(["through", "rise", "pop", "expand", "collapse"]);   // 換分頁、換主機時整頁、整塊進出場的 CSS 動畫
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
/* 舊版存著的存取密碼、安裝時給的一鍵登入網址：換成這台裝置自己的登入鑰匙，瀏覽器裡就不再留著密碼 */
async function upgradeTok(){
  let r;
  await DEVP;
  try { r = await fetch("/api/login", {method:"POST", headers:{"Content-Type":"application/json"}, cache:"no-store",
    body:JSON.stringify({pw:getTok(), keep:!!store(KEY), dev:devLabel(), os:devOs()})}); }
  catch(e) { return true; }                                     // 連不上：照舊用，等一下 tick 自己會處理
  if (r.status === 401) { setTok(""); endSplash(); login("密碼不對，再試一次"); return false; }
  const d = await r.json().catch(() => ({}));
  if (d.ok && d.token) setTok(d.token);
  return true;
}
async function tick(){
  clearTimeout(timer);
  const id = ++TICKID;                          // 同時有好幾個在讀：只用最新的那一次，舊的結果不畫
  const rq = new URLSearchParams(location.search).get("restore");
  if (rq) { RSW.code = rq.trim().toUpperCase(); sessionStorage.setItem("vs-rsw", RSW.code); history.replaceState(null, "", location.pathname); }
  if (RSW.code) return restoreScreen();
  if (!getTok()) { endSplash(); return login(); }
  if (!/^vss_/.test(getTok()) && !await upgradeTok()) return;
  if (document.hidden && LIST.length) return true;   // 已經切到背景：不抓也不畫，回來時馬上更新
  try {
    if (!BOOTED) splashMsg("讀取主機狀態…");
    const since = Object.fromEntries(Object.entries(HIST).map(([k, h]) => [k, h.t[h.t.length - 1]]).filter(x => x[1]));
    const r = await fetch("/api/all" + (Object.keys(since).length ? "?since=" + encodeURIComponent(JSON.stringify(since)) : ""), {headers:{"X-Token":getTok()}, cache:"no-store", signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined});   // 網路卡住最多等 20 秒，不會一直轉
    if (r.status === 401) { const was = getTok(); setTok(""); LIST = []; for (const k in HIST) delete HIST[k]; endSplash(); return login(/^vss_/.test(was) ? "請重新登入" : "密碼不對，再試一次"); }
    const data = await r.json();
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
      if (!window._build) window._build = me.build;
      else if (me.build !== window._build) upwReload(`哨兵已更新到 ${me.version} ✨`);   // 這台的哨兵剛更新好：重新載入換上新畫面
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
      setTimeout(wxRun, 1200);                   // 畫面出來後再問位置、抓天氣，不拖慢開啟
    }
    if (BOOTED) await settle();
    if (id !== TICKID || !getTok()) return true;  // 等的時候登出了，或已經有更新的一次
    if (document.hidden && BOOTED) return true;    // 抓到一半切到背景：先不畫（資料留到回來那次一起畫）
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
/* 圖示一筆一筆畫出來（線條要先用 drawable() 加上 pathLength） */
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
/* 安卓 App 裡：下拉重新整理。圓形跟著手指長大、旋轉，拉夠了彈一下變形；放開就變成載入中的形狀，好了畫出勾勾再收起來
   一般瀏覽器（Safari、Chrome…）本身就會下拉重新整理，兩個一起會打架，所以只在 App 裡用（App 會放 VSApp 進來，網頁殼的 UA 也有「; wv)」） */
(function(){
  if (typeof VSApp === "undefined" && !/; wv\)/.test(navigator.userAgent)) return;
  document.documentElement.classList.add("inapp");
  const ptr = $("#ptr"), RND = blobSh(9, 0), CK = blobSh(9, .14);
  ptr.innerHTML = `<span class="pl" style="clip-path:${RND}"></span><span class="pg"></span>`;
  const pl = ptr.querySelector(".pl"), pg = ptr.querySelector(".pg");
  let y0 = null, d = 0, armed = false, rot = 0, gen = 0;   // gen：每拉一次加一，舊的那次收尾時不會動到新的這次
  const show = y => { ptr.style.transform = `translateY(${y}px)`; ptr.style.opacity = String(Math.max(0, Math.min(1, (y + 70) / 50))); };
  const shape = (p, r) => { rot = r; pl.style.transform = `rotate(${r}deg) scale(${.3 + .7 * p})`; };
  const hideUp = () => { ptr.classList.add("back"); show(-70); shape(0, rot); };
  addEventListener("touchstart", e => {
    if (DESK.matches || DET || $("#fly") || scrollY > 0 || REFRESHING || document.querySelector("#layer .veil") || !LIST.length) return;   // 機場起降打開時：往下滑是在捲看板
    y0 = e.touches[0].clientY; d = 0; armed = false; gen++;
    ptr.getAnimations({subtree: true}).forEach(a => a.cancel());
    ptr.classList.remove("back", "armed", "bad"); pl.style.clipPath = RND; pg.innerHTML = "";
  }, {passive:true});
  addEventListener("touchmove", e => {
    if (y0 === null) return;
    d = Math.max(0, e.touches[0].clientY - y0);
    if (scrollY > 0) { y0 = null; return hideUp(); }       // 變成往下捲：收起來，不要卡在半空中
    const pull = Math.min(110, d * .5), was = armed;
    armed = pull >= 64;
    if (armed !== was) {
      ptr.classList.toggle("armed", armed); pl.style.clipPath = armed ? CK : RND;
      if (armed && canAnim()) ptr.animate([{scale: 1}, {scale: 1.14}, {scale: 1}], {duration: T.mid, easing: EASE});
    }
    show(pull - 70); shape(Math.min(1, pull / 64), pull * 2.4);
  }, {passive:true});
  /* 手指被系統搶走（touchcancel）也要收起來，不然圖示會停在拉到一半的地方 */
  addEventListener("touchcancel", () => { if (y0 === null) return; y0 = null; hideUp(); }, {passive:true});
  addEventListener("touchend", async e => {
    if (y0 === null || e.touches.length) return; y0 = null;
    if (!armed) return hideUp();
    const g = gen;
    ptr.classList.add("back"); show(10); shape(1, rot);
    const stop = loader(pl, rot);
    let ok = false;
    try { ok = await refreshNow(); } catch(err) {}
    if (g !== gen) return;
    ptr.classList.toggle("bad", !ok);
    const st = stop(RND);
    pg.innerHTML = drawable(I(ok ? "chk" : "bang")); drawIn(pg.firstChild, T.fast);
    await st; await sleep(T.long);
    if (g === gen) hideUp();
  }, {passive:true});
})();
/* 瀏覽器裡的手機分頁列：往下捲藏起來、往上捲就出現 */
(function(){
  let y = scrollY, acc = 0;
  addEventListener("scroll", () => {
    const d = document.querySelector(".dock"), now = scrollY, dy = now - y; y = now;
    if (!d || DESK.matches || document.documentElement.classList.contains("full")) return;
    acc = Math.sign(dy) === Math.sign(acc) ? acc + dy : dy;
    const hid = d.classList.contains("hid");
    if (now < d.offsetHeight) { if (hid) d.classList.remove("hid"); }
    else if (acc > 24 && !hid) d.classList.add("hid");
    else if (acc < -12 && hid) d.classList.remove("hid");
  }, {passive:true});
})();
/* 手機：畫面中間左右滑，換到隔壁的分頁（最左、最右邊緣留給瀏覽器的上一頁；圖表、會左右捲的那排、輸入框不算） */
(function(){
  let x0 = null, y0 = 0, t0 = 0;
  addEventListener("touchstart", e => {
    x0 = null;
    if (DESK.matches || DET || $("#fly") || e.touches.length > 1 || document.querySelector("#layer .veil") || !LIST.length) return;
    const t = e.touches[0];
    if (t.clientX < 28 || t.clientX > innerWidth - 28) return;
    if (e.target.closest("input,textarea,select,canvas,.cbox,.dock,[data-noswipe],.fhrs,.fterm")) return;
    for (let el = e.target; el && el !== document.body; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return;
    x0 = t.clientX; y0 = t.clientY; t0 = performance.now();
  }, {passive:true});
  addEventListener("touchend", e => {
    if (x0 === null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || performance.now() - t0 > 700) return;   // 要明顯的橫滑，捲動時斜斜的不算
    const ks = TABS.map(([k]) => k), i = ks.indexOf(TAB) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < ks.length) setTab(ks[i]);
  }, {passive:true});
  addEventListener("touchcancel", () => { x0 = null; }, {passive:true});
})();
/* 按下去的水波紋：手指一碰就從那個點擴散；手機上等一下下，確定不是要捲動才出現 */
(function(){
  const SEL = ".hcard,.tb,.li:not(div),.fapc,.ubtn,.iconbtn,.icbtn,.hmenu button,.seg button,.rng button,.fchip,.addhost,.trf,.chats button,.blob,.sw button";
  addEventListener("pointerdown", e => {
    if (e.button || !canAnim()) return;
    const rb = e.target.closest(".rb"), el = rb ? rb.querySelector(".ri") : e.target.closest(SEL);
    if (!el || el.disabled) return;
    let box = null, up = false, t0 = 0;
    const pr = rb || el;                          // 按下去的樣子（縮一點）至少留 0.16 秒，輕點也看得到
    const press = () => { pr.classList.add("prs"); t0 = performance.now(); };
    const release = now => setTimeout(() => pr.classList.remove("prs"), now ? 0 : Math.max(0, 160 - (performance.now() - t0)));
    const start = () => {
      press();
      if (el.classList.contains("blob") || el.closest(".sw")) return;   // 圓形色塊不放水波紋
      const r = el.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;   // 按下去會縮一點：換回原本的大小來算
      const x = (e.clientX - r.left) * w / (r.width || 1), y = (e.clientY - r.top) * h / (r.height || 1);
      const R = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
      box = document.createElement("span"); box.className = "rip"; box._leaving = 1;   // 畫面更新時不要把它當成內容
      const dot = document.createElement("i"); dot.style.cssText = `left:${x - R}px;top:${y - R}px;width:${2 * R}px;height:${2 * R}px`;
      box.appendChild(dot); el.appendChild(box);
      dot.animate([{transform:"scale(.15)"}, {transform:"scale(1)"}], {duration:T.slow, easing:EASE, fill:"forwards"});
    };
    const fade = () => box && box.animate([{opacity:1}, {opacity:0}], {duration:T.mid, delay:T.fast / 2, easing:EASE, fill:"forwards"}).finished.then(() => box.remove(), () => box.remove());
    const t = e.pointerType === "mouse" ? (start(), 0) : setTimeout(() => { if (!up) start(); }, 70);
    const end = ev => {
      up = true; removeEventListener("pointerup", end); removeEventListener("pointercancel", end);
      if (ev.type === "pointercancel") { clearTimeout(t); release(true); if (!box) return; }   // 其實是在捲動：不出現
      else { if (!t0) { clearTimeout(t); start(); } release(false); }
      fade();
    };
    addEventListener("pointerup", end); addEventListener("pointercancel", end);
  }, {passive:true});
})();
/* 手機：從下面滑上來的面板，從頂端往下拉就關掉 */
(function(){
  const SHEET = matchMedia("(max-width:599px)");
  let d = null;
  addEventListener("touchstart", e => {
    const dl = e.target.closest("#layer .veil .dialog"), v = dl && dl.parentNode;
    if (!SHEET.matches || !dl || dl.scrollTop > 0 || !dl.querySelector(".form") || v.classList.contains("closing") || e.target.closest("input,textarea,select")) return;
    d = {dl, v, y0:e.touches[0].clientY, t0:performance.now(), dy:0, on:false};
  }, {passive:true});
  addEventListener("touchmove", e => {
    if (!d) return;
    d.dy = (e.touches[0].clientY - d.y0) / ZM();
    if (!d.on && (d.dy < 0 || d.dl.scrollTop > 0)) { d = null; return; }      // 往上滑：是要捲動內容
    if (d.dy > 6) d.on = true;
    if (d.on) d.dl.style.transform = `translateY(${Math.max(0, d.dy)}px)`;
  }, {passive:true});
  addEventListener("touchend", () => {
    if (!d) return; const {dl, v, dy, t0, on} = d; d = null;
    if (!on) return;
    if (dy > 110 || dy / (performance.now() - t0) > .6) { if (v._esc) { v.classList.add("flung"); return v._esc(); } }   // 拉得夠遠或甩得夠快：關掉
    dl.style.transform = "";
    if (canAnim()) dl.animate([{transform:`translateY(${dy}px)`}, {transform:"none"}], {duration:T.spf, easing:SPRING_F});
  }, {passive:true});
})();
document.addEventListener("visibilitychange",()=>{ if(!document.hidden && LIST.length && getTok()) tick(); });   // 登入、還原畫面不要重畫（打到一半的密碼、選好的檔案會不見）
SHARE ? flyLib().then(() => shareBoot(), () => setTimeout(() => location.reload(), 3000)) : tick();
/* 不是按鈕但點得動的（IP、備份密碼、還原指令）：用鍵盤選到後按 Enter 或空白鍵也行 */
document.addEventListener("keydown", e => {
  const t = e.target;
  if ((e.key === "Enter" || e.key === " ") && t.matches && t.matches('[role="button"]:not(button)')) { e.preventDefault(); t.click(); }
});
