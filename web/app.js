const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function store(k, v){ try { if (v === undefined) return localStorage.getItem(k) || ""; v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch(e){ return ""; } }
const KEY = "vps-sentinel-token";
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
const api = (path, opt) => fetch(path, opt).catch(() => { throw new Error("連線失敗，請稍後再試"); });
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
  power:'<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  plane:'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  tack:'<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  off:'<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M2 2l20 20"/>',
};
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
  return d ? `${d} 天 ${h} 小時` : h ? `${h} 小時 ${m} 分` : `${m} 分鐘`; }
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
  return `<img class="flag" src="https://flagcdn.com/w80/${cc.toLowerCase()}.png" alt="${emo}" title="${esc(regionOf(cc))}"
    onerror="FLAGFAIL['${cc}']=1;this.outerHTML='<span class=emoji>${emo}</span>'">`;  /* 外層 .fw 會留著，發光不會跑掉 */
}
const regionOf = cc => { try { return REGION && /^[A-Z]{2}$/.test(cc) ? REGION.of(cc) : cc; } catch(e) { return cc; } };   // 國家代碼打錯也不會讓整頁打不開
const place = s => s.geo ? [s.geo.cc ? regionOf(s.geo.cc) : "", s.geo.city].filter(Boolean).join(" ") : "";
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
/* 雲端硬碟一鍵登入：一次性登入票用表單送出，不放在網址上（網址列、瀏覽紀錄都看不到）；票用過一次就失效 */
const cloudHref = c => c.ticket ? c.url : (c.login || c.url);    // 沒有登入票的是還沒更新的主機，照舊用它給的網址
const ssoAttr = s => s.cloud && s.cloud.ticket ? ` data-sso="${esc(keyOf(s))}"` : "";
const TK_USED = new Set();
function openCloud(s){
  const c = s && s.cloud;
  if (!c || !c.ticket || TK_USED.has(c.ticket) || !safeUrl(c.login)) return false;   // 票用過了：直接開雲端硬碟（剛剛已經拿到通行證）
  TK_USED.add(c.ticket);
  const f = document.createElement("form"), i = document.createElement("input");
  Object.assign(f, {method: "post", action: c.login, target: "_blank", rel: "noopener noreferrer", hidden: true});
  Object.assign(i, {type: "hidden", name: "t", value: c.ticket});
  f.append(i); document.body.append(f); f.submit(); f.remove();
  return true;
}
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest("a[data-sso]");
  if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0 && openCloud(LIST.find(x => keyOf(x) === a.dataset.sso))) e.preventDefault();
}, true);
const linkSt = x => x.up === false ? `打不開：${x.err || "連不上"}` : x.up ? `正常・${x.ms} 毫秒` : x.err ? "剛剛沒回應，再確認一次中…" : "還沒檢查";
/* 主機名稱旁的「⋯」：編輯、重新開機、移除（雲端硬碟、下載、連結都在「工具」） */
const moreBtn = s => (s.online || s.node) ? `<button class="iconbtn" title="更多" data-more="${esc(keyOf(s))}">${I("more")}</button>` : "";
function alerts(s){
  const k = t => esc(String(t).replace(/^\d+\s*|\s*[（(]?\d+(\.\d+)?\s*%[）)]?$/g, ""));   // 只拿掉會變的數字，名稱裡的數字要留（app-1、app-2 是兩件事）
  const al = (s.problems||[]).map(p=>`<div class="alert bad" data-key="b:${k(p)}">${I("warn")}${esc(p)}</div>`)
    .concat((s.notices||[]).map(p=>`<div class="alert warn" data-key="w:${k(p)}">${I("alert")}${esc(p)}</div>`));
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
function updateInfo(s){
  const n = s.updates ? s.updates.total : 0, u = s.update;
  if (u && u.running) return n ? `正在安裝 ${n} 個更新…` : `正在檢查更新…`;
  let info = s.updates ? (n ? `${n} 個更新可安裝${s.updates.security?`（${s.updates.security} 個安全性）`:""}` : "已經是最新版 ✨") : "";
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
function pathOf(vals, W, H, max){
  if (!vals || vals.length < 2) return null;
  const n = vals.length, y = v => H - Math.max(0, Math.min(v/max, 1)) * (H-4) - 2;
  const d = vals.map((v,i)=>`${i?"L":"M"}${(i/(n-1)*W).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return {line:d, area:`${d} L${W},${H} L0,${H} Z`};
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
function chart(id, series, o={}){
  const N = o.n || 150, raw = series;
  series = series.map(s => ({...s, data: resample(s.data, N)}));
  const W = 600, H = o.h || 170, all = series.flatMap(s=>s.data||[]);
  if (all.length < 4) return `<div class="wait" style="height:${H}px">收集資料中…</div>`;
  const max = o.max || (o.grid ? niceMax(Math.max(1, ...all) * 1.1, o.bin) : Math.max(1, ...all) * 1.2);
  if (o.t) CHD[id] = {t: o.t, ser: raw, fmt: o.fmt || (v => v)};
  const yax = o.grid && o.fmt ? `<div class="yax">${[.25,.5,.75].map(f=>`<span style="top:${f*100}%">${o.fmt(max*(1-f))}</span>`).join("")}</div>` : "";
  let g = "";
  if (o.grid) for (const f of [.25,.5,.75]) g += `<line class="gl" x1="0" x2="${W}" y1="${(H*f).toFixed(1)}" y2="${(H*f).toFixed(1)}"/>`;
  const defs = series.map((s,i)=>`<linearGradient id="${id}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:${o.fade??.3}"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient>`).join("");
  const body = series.map((s,i)=>{ const p = pathOf(s.data, W, H, max); if (!p) return "";
    return `<path d="${p.area}" fill="url(#${id}${i})"/><path d="${p.line}" fill="none" style="stroke:${s.color}" stroke-width="${o.sw||2.4}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="miter"/>`; }).join("");
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
  return chart(id, series(h), {...o, t: h.t});
}
const cid = (s, k) => "g" + Math.abs([...keyOf(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))|0, 7)) + k;
const COL = {cpu:"var(--c-cpu)", mem:"var(--c-mem)", rx:"var(--c-rx)", tx:"var(--c-tx)"};
/* 概念 → [顏色樣式, 圖示] */
const ICO = {cpu:["cpu","cpu"], mem:["mem","mem"], disk:["disk","disk"], load:["load","gauge"], down:["down","down"], up:["up","up"],
  net:["net","net"], trend:["trend","trend"], month:["month","month"], box:["box","box"], bell:["bell","bell"], info:["info","info"],
  flag:["flag","flag"], keep:["keep","shield"], key:["key","key"], finger:["finger","finger"], pin:["pin","pin"], link:["link","link"], archive:["archive","archive"], sun:["sun","sun"], quote:["quote","quote"], dl:["dl","dl"], cloud:["cloud","cloud"], fly:["fly","plane"]};
const IC = (k, cls="sm") => `<span class="ico ${cls} ${ICO[k][0]}">${I(ICO[k][1])}</span>`;

/* ═════════ 共用的小元件 ═════════ */
/* 標誌：主題色的圓角方塊＋白色盾牌 */
const LOGOSVG = id => `<svg viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lb${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--seed) 70%,#fff)"/><stop offset="1" style="stop-color:color-mix(in srgb,var(--seed) 82%,#000)"/></linearGradient><mask id="lm${id}"><rect width="512" height="512" fill="#fff"/><path d="M204 258l36 36 72-76" fill="none" stroke="#000" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="512" height="512" rx="128" fill="url(#lb${id})"/><path d="M256 108 371 150c9 3 15 12 15 22v72c0 84-52 140-122 168-5 2-11 2-16 0-70-28-122-84-122-168v-72c0-10 6-19 15-22Z" fill="#fff" mask="url(#lm${id})" transform="translate(256 262) scale(.88) translate(-256 -258)"/></svg>`;
const BRAND = LOGOSVG("br");
const CHEV = I("chev").replace("<svg", '<svg class="chev"'), EXT = I("ext").replace("<svg", '<svg class="ext"');
/* 波浪進度條：波浪那段會慢慢往前流，數字變了寬度用彈簧變過去 */
const WAVE = (() => { let d = "M0 6"; for (let x = 0; x < 480; x += 12) d += ` Q${x + 6} ${x % 24 ? 12 : 0} ${x + 12} 6`;
  return `<svg viewBox="0 0 480 12" aria-hidden="true"><path d="${d}"/></svg>`; })();
const wave = (pct, t = tier(pct)) => `<div class="wv ${t}" style="--v:${Math.max(0, Math.min(100, +pct || 0)).toFixed(1)}%"><div class="wf">${WAVE}</div><i class="wr"></i></div>`;
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
function headline(list){
  const is = issuesOf(list), hosts = new Set(is.map(x => keyOf(x.s)));
  if (!is.length) return list.length > 1 ? `${list.length} 台主機都正常` : "主機一切正常";
  if (is.length === 1) return is[0].t ? `${is[0].s.name}・${is[0].t}` : `${is[0].s.name} 連不上`;
  if (hosts.size === 1) return `${is[0].s.name} 有 ${is.length} 件事要留意`;
  return `${hosts.size} 台主機要留意`;
}
function hero(list, time){
  const lv = list.some(s => lvOf(s) === "bad") ? "bad" : list.some(s => lvOf(s) === "warn") ? "warn" : "ok", g = greet();
  const txt = `<div class="hello meta"><span class="live"></span>${g.hi}・${time} 更新</div><h1 class="headline" data-x>${esc(headline(list))}</h1><p class="quote">${esc(g.quote)}</p>`;
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
const hm = t => new Date(t * 1000).toLocaleTimeString("zh-TW", {hour:"2-digit", minute:"2-digit", hour12:false});
const evRow = (e, many, tf = ago) => `<div class="ev" data-key="${esc(e.k)}|${e.kind}:${esc(e.text)}"><span class="dot ${e.kind}"></span><div class="et"><div>${many ? `<span class="eh">${esc(e.h)}</span>` : ""}${esc(e.text)}</div><div class="sub">${WORD[e.kind] || ""}・${tf(e.t)}${e.n > 1 ? `・共 ${e.n} 次` : ""}</div></div></div>`;
const evList = (ev, many) => ev.length ? `<div class="evs" data-key="evs" data-keyed>${ev.map(e => evRow(e, many)).join("")}</div>` : `<div class="calm" data-key="calm">目前沒有事件</div>`;
const dayOf = t => { const d = new Date(t * 1000), n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
  return d.toDateString() === n.toDateString() ? "今天" : d.toDateString() === y.toDateString() ? "昨天" : `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };

/* ═════════ 首頁的主機卡片（手機） ═════════ */
const mrow = (l, p) => `<div class="mr"><span class="ml">${l}</span>${wave(p)}<span class="mv ${tier(p)}">${num(p)}%</span></div>`;
function hostCard(s, i){
  const lv = lvOf(s), k = keyOf(s);
  let b = `<div class="hcard ${lv}" data-key="${esc(k)}" data-keyed data-open="${esc(k)}" role="button" tabindex="0" style="--i:${i}">
    <div class="ct" data-key="ct">${avatar(s)}<div class="nm"><div class="cn">${esc(s.name)}</div><div class="cp">${esc(place(s) || s.os || "")}</div></div>${I("chev")}</div>`;
  if (!s.online) return b + offBox(s) + `</div>`;
  const d0 = disk0(s), ft = [PREF.show.traffic && s.traffic ? `本月 ${size(s.traffic.used)}` : "", `開機 ${up(s.uptime)}`].filter(Boolean).join("・");
  return b + alerts(s) + `<div class="mrows" data-key="mr">${mrow("處理器", s.cpu)}${mrow("記憶體", s.mem.pct)}${mrow("磁碟", d0.pct)}</div><div class="cfoot" data-key="cf">${ft}</div></div>`;
}
const offBox = (s, sub) => `<div class="offline" data-key="off">${I("off")}<div>連不上這台主機<div class="sub">${s.last_seen && !sub ? esc(seen(s)) + "<br>" : ""}${esc(s.error || "")}</div>${peerBtn(s)}</div></div>`;
/* 主機列表最後的「新增主機」：貼上新主機的配對暗號 */
const addHostBtn = cls => `<button class="${cls}" data-addhost data-key="+add">${I("plus")}<span>新增主機</span></button>`;

/* ═════════ 一台主機的內容：手機的整頁、電腦的欄位共用 ═════════ */
const subOf = s => s.online ? `<span title="核心版本 ${esc(s.kernel)}">${esc([place(s), s.os].filter(Boolean).join("・"))}</span>・開機 ${up(s.uptime)}`
  : (s.last_seen ? `離線・${ago(s.last_seen)}` : "目前連不上");
function hostBody(s, ph){
  let h = `<div class="hb" data-key="hb" data-keyed><div class="hhead" data-key="hh">${avatar(s)}<div class="nm"><h2 class="hname">${esc(s.name)}</h2><div class="hsub">${subOf(s)}</div></div>${ph ? "" : `<span class="hacts">${moreBtn(s)}</span>`}</div>`;
  if (!s.online) return h + offBox(s, 1) + `</div>`;   // 標題下面已經寫了「離線・多久前」
  h += alerts(s) + tiles(s) + factsRow(s, ph);
  const hs = PREF.show.chart ? histFor(s) : null;
  if (PREF.show.chart) h += `<div class="cc" data-key="cp"><div class="cch"><span class="lg"><i style="background:${COL.cpu}"></i>處理器</span><span class="lg"><i style="background:${COL.mem}"></i>記憶體</span>${rangeSeg()}</div>
    <div class="cbox">${chartOr(hs, cid(s, ph ? "m" : "a"), x => [{data:x.cpu, color:COL.cpu, name:"處理器"}, {data:x.mem, color:COL.mem, name:"記憶體"}], {max:100, grid:1, fmt:v => Math.round(v) + "%", h: ph ? 130 : 150})}</div></div>`;
  if (PREF.show.net) h += `<div class="cc" data-key="np"><div class="nets"><div class="nt">${IC("down")}<div><div class="nv">${rate(s.net.rx)}</div><div class="nl">下載</div></div></div><div class="nt">${IC("up")}<div><div class="nv">${rate(s.net.tx)}</div><div class="nl">上傳</div></div></div></div>
    ${hs ? `<div class="cbox wide">${chartOr(hs, cid(s, ph ? "n" : "b"), x => [{data:x.rx, color:COL.rx, name:"下載"}, {data:x.tx, color:COL.tx, name:"上傳"}], {grid:1, bin:1, fmt:rate, h: ph ? 96 : 110})}</div>` : ""}</div>`;
  h += trafficCard(s) + itemsCard(s);
  return h + `</div>`;
}
/* 四格：處理器、記憶體、磁碟、負載 */
function tiles(s){
  const d0 = disk0(s), l = +s.load[0] || 0, lr = l / (s.cores || 1), [lw, lt] = LOADW(lr);
  const of = (a, b) => `${size(a)} / ${size(b)}`;
  const t = (k, label, val, pct, sub, tt = tier(pct)) => `<div class="tile ${tt}" data-key="t:${k}"><div class="th">${IC(k)}${label}</div><div class="tv">${val}</div>${wave(pct, tt)}<div class="ts">${sub}</div></div>`;
  return `<div class="tiles" data-key="tiles">${t("cpu", "處理器", `${num(s.cpu)}<small>%</small>`, s.cpu, `${s.cores} 核`)}`
    + t("mem", "記憶體", `${num(s.mem.pct)}<small>%</small>`, s.mem.pct, of(s.mem.used, s.mem.total))
    + t("disk", "磁碟", `${num(d0.pct)}<small>%</small>`, d0.pct, of(d0.used, d0.total))
    + t("load", "負載", `<span class="wd">${lw}</span>`, Math.min(100, lr / 2 * 100), `${l.toFixed(2)}／${s.cores} 核`, lt) + `</div>`;
}
/* IPv6：沒有 IPv6 的主機不顯示 */
function v6line(s, shown){
  const v = s.ipv6;
  if (!v) return "";
  if (!v.addr) return `<span class="v6 warn">IPv6 位址不見了</span>`;
  const st = v.ok === false ? `<i class="ld bad"></i>連不出去` : v.ok ? `<i class="ld ok"></i>正常` : `<i class="ld"></i>檢查中`;
  return shown ? `<span class="v6 a" data-copy="${esc(v.addr)}" title="點一下複製">${esc(v.addr)}</span>`
    : `<span class="v6 ${v.ok === false ? "warn" : ""}">IPv6 ${st}</span>`;
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
    if (c != null) f.push(`<span class="fc" title="現在的網路連線數${avg != null ? `（平常約 ${Math.round(avg)} 條）` : ""}">連線<b class="num">${Number(c).toLocaleString("zh-TW")}</b>${cw ? `<em class="${cw.includes("多") ? "warn" : ""}">${cw}</em>` : ""}</span>`);
    const ip = s.geo && s.geo.ip, org = s.geo && s.geo.org;
    if (ip) f.push(`<span class="fc">IP<b class="ipb ${shown ? "on" : ""}" tabindex="0" role="button" ${shown ? `data-copy="${esc(ip)}" title="點一下複製（15 秒後會自動遮起來）"` : `data-reveal="${esc(k)}" title="點一下顯示"`}>${esc(ip)}</b></span>`);
    if (s.ipv6) f.push(`<span class="fc" data-xw>${v6line(s, shown)}</span>`);
    if (org && !sameOrg(org, s.name)) f.push(`<span class="fc">${esc(org)}</span>`);
    (s.disks || []).slice(1).forEach(d => f.push(`<span class="fc">磁碟 ${esc(d.path)}<b class="num ${tier(d.pct)}">${num(d.pct)}%</b></span>`));
    if (s.mem.swap_total) f.push(`<span class="fc">虛擬記憶體<b class="num">${num(s.mem.swap_pct)}%</b></span>`);
  }
  return f.length ? `<div class="fcs" data-key="fcs">${f.join("")}</div>` : "";
}
/* 本月流量：點了開流量設定 */
function trafficCard(s){
  const t = s.traffic; if (!t || !PREF.show.traffic) return "";
  return `<button class="cc trf" data-key="tf" data-traffic="${esc(s.node || "")}" data-label="${esc(s.name)}" title="流量設定"><div class="trow">${IC("month")}<span>本月流量</span><span class="tbig">${size(t.used)}${t.limit ? `<small>／ ${size(t.limit)}</small>` : ""}</span></div>
    ${t.limit ? wave(t.pct) : ""}<div class="tsm"><span>${t.projected ? `預估月底 ${size(t.projected)}` : "預估累積中"}</span><span>${t.reset_day} 號重置・還有 ${t.days_left} 天</span></div></button>`;
}
/* 容器與服務：一個一個小膠囊，有分組（docker compose 專案、系統服務）就加小標題 */
const boxSummary = items => { const bad = items.filter(x => x.st === "bad").length;
  return bad ? `<b>${bad} 個異常</b>` : `${items.filter(x => x.st === "ok").length} 個正常`; };
function itemsCard(s){
  if (!PREF.show.items) return "";
  const items = itemsOf(s); if (!items.length) return "";
  const groups = [...new Set(items.map(x => x.g))], head = groups.length > 1 || groups[0];
  let c = "";
  for (const g of groups) {
    const gi = items.filter(x => x.g === g);
    if (head) c += `<div class="grp" data-key="grp:${esc(g)}">${g ? esc(g) : "其他容器"}<span>${gi.filter(x => x.st === "ok").length}／${gi.length}</span></div>`;
    c += gi.map(x => `<span class="chip" data-key="${x.t}:${esc(x.n)}" title="${x.t}：${esc(x.n)}・${esc(x.s)}"><span class="dot ${x.st}"></span><span>${esc(x.sn || x.n)}${x.st === "ok" ? "" : `・${esc(x.s)}`}</span></span>`).join("");
  }
  return `<div class="cc" data-key="ib"><div class="cch"><span class="ct2">${IC("box")}容器與服務</span><span class="sum">${boxSummary(items)}</span></div><div class="chips" data-key="chips" data-keyed>${c}</div></div>`;
}
/* 常用連結（工具分頁）：每個連結多久打得開 */
const linkRow = (x, sub) => `<a class="li" data-key="lk:${esc(x.url)}" href="${esc(x.url)}"${x.sso ? ` data-sso="${esc(x.sso)}"` : ""} target="_blank" rel="noopener noreferrer"><span class="lk"><i class="ld ${x.up === false ? "bad" : x.up ? "ok" : ""}"></i></span><span class="lab">${esc(x.name)}<small>${sub}</small></span>${EXT}</a>`;
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
    <div class="btns"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn" data-r="1">儲存</button></div></div>`;
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
    ? `<button class="rb${TAB === k ? " on" : ""}${k === "set" && nw ? " hasnew" : ""}" data-tab="${k}"><span class="ri">${I(ic)}</span>${l}</button>`
    : `<button class="tb${TAB === k ? " on" : ""}${k === "set" && nw ? " hasnew" : ""}" data-tab="${k}" title="${l}">${I(ic)}<span class="t">${l}</span></button>`).join("");
}
function page(list, time){
  return TAB === "tools" ? toolsPage(list) : TAB === "log" ? logPage(list) : TAB === "set" ? setPage(list)
    : DESK.matches ? homeDesk(list, time) : homePhone(list, time);
}
/* 手機：首頁是每台一張卡片，點了從卡片長出那台的整頁 */
function renderPhone(list, time){
  const s = DET && list.find(x => keyOf(x) === DET);
  return `<div class="dash m" data-key="m"><main class="view v-${TAB}" data-key="v:${TAB}">${page(list, time)}</main><nav class="dock" data-key="dock" data-slide>${navBtns(false, list)}</nav>${s ? detail(s) : ""}</div>`;
}
/* 電腦：左邊直排分頁；首頁每台主機一欄並排（主機多就是小卡片），右邊是天氣和最近發生的事 */
function renderDesk(list, time){
  const s = DET && list.find(x => keyOf(x) === DET);
  return `<div class="dash d" data-key="d"><nav class="rail" data-key="rail" data-slide=".ri"><div class="brand">${BRAND}</div>${navBtns(true, list)}
    <div class="rfoot"><button class="iconbtn" data-refresh title="重新整理">${I("upd")}</button></div></nav>
    <main class="view v-${TAB}" data-key="v:${TAB}">${page(list, time)}</main>${s ? detail(s) : ""}</div>`;
}
function homePhone(list, time){
  const ev = allEvents(list).slice(0, 3);
  return hero(list, time) + `<div class="lbl" data-key="lh">主機</div><div class="hosts" data-key="hosts" data-keyed>${list.map(hostCard).join("")}${addHostBtn("addhost")}</div>
    <div class="lbl" data-key="le">最近發生${ev.length ? `<button data-tab="log">全部紀錄</button>` : ""}</div>${evList(ev, list.length > 1)}`;
}
/* 電腦一排放得下幾台：螢幕夠寬放三台；主機比這個多就改成小卡片，點了才看整頁 */
const deskCols = () => innerWidth >= 1800 ? 3 : 2;
const cardMode = list => !DESK.matches || list.length > deskCols();
function homeDesk(list, time){
  const n = Math.min(deskCols(), Math.max(1, list.length)), ev = allEvents(list).slice(0, 8);
  const hosts = cardMode(list)
    ? `<div class="hosts wall" data-key="wall" data-keyed data-grid>${list.map(hostCard).join("")}${addHostBtn("addhost")}</div>`
    : `<div class="cols" data-key="cols" data-keyed data-grid style="--n:${n}">${list.map((s, i) => `<section class="hp ${lvOf(s)}" data-key="${esc(keyOf(s))}" style="--i:${i}">${hostBody(s, false)}</section>`).join("")}${addHostBtn("addhost")}</div>`;
  return `<div class="dhome" data-key="dh"><div class="dmain" data-key="dm">${hero(list, time)}${hosts}</div>
    <aside class="aside" data-key="as"><div class="wxw">${greet().wx}</div><div class="lbl">最近發生${ev.length ? `<button data-tab="log">全部紀錄</button>` : ""}</div>${evList(ev, list.length > 1)}</aside></div>`;
}
/* 那台主機的整頁（從卡片的位置展開；電腦上左邊的分頁列留著） */
function detail(s){
  const r = OPENR || {t:0, b:0, l:0, r:0};
  return `<div class="det${DETX ? " closing" : ""}" data-key="det:${esc(keyOf(s))}" style="--ct:${r.t}px;--cb:${r.b}px;--cl:${r.l}px;--cr:${r.r}px"><div class="dscroll">
    <div class="dtop"><button class="icbtn" data-back title="返回">${I("back")}</button><span class="dtt">${esc(s.name)}</span><span class="hacts">${moreBtn(s)}</span></div>
    ${hostBody(s, true)}</div></div>`;
}
/* 工具：雲端硬碟、遠端下載、每日備份、常用連結；好幾台時上面一排主機名稱（可以左右滑）選一台，只顯示那台的 */
let TOOLH = store("vs-toolh"), ORDER = [];
function toolsPage(list){
  const on = list.filter(s => s.online).sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b)));
  let h = `<div class="${DESK.matches ? "wide" : "narrow"}" data-key="tools"><h1 class="ptitle">工具</h1>`;
  if (!on.length) return h + `<div class="calm">連不上任何主機</div></div>`;
  const s = on.find(x => keyOf(x) === TOOLH) || on.find(x => !x.node) || on[0], k = esc(keyOf(s)), node = esc(s.node || ""), name = esc(s.name);
  const dot = x => lvOf(x) === "ok" ? "" : `<span class="dot ${lvOf(x)}"></span>`;
  h += `<div class="group fly1" data-key="g-fly"><button class="li" data-key="fly" data-fly>${IC("fly", "")}<span class="lab">機場起降<small>${esc(FLYS.name || "即時抵達、出發的飛機")}</small></span>${CHEV}</button></div>`;
  if (on.length > 1) h += hpick(on, s, dot);
  return h + toolsBody(s, k, node, name) + `</div>`;
}
function toolsBody(s, k, node, name){
  const c = s.cloud && safeUrl(cloudHref(s.cloud)) ? s.cloud : null;
  let h = `<div data-key="tb:${k}" data-sw><div class="group" data-key="g-t:${k}">`;
  if (c) h += `<a class="li col" data-key="cl" href="${esc(cloudHref(c))}"${ssoAttr(s)} target="_blank" rel="noopener noreferrer"><span class="rt">${IC("cloud", "")}<span class="lab">雲端硬碟<small>${c.total ? `已用 ${size(c.used)} / ${size(c.total)}` : ""}</small></span>${EXT}</span>${c.total ? wave(c.pct) : ""}</a>
    <button class="li" data-key="dl" data-dl="${node}" data-name="${name}">${IC("dl", "")}<span class="lab">遠端下載<small>貼上連結，存到雲端硬碟</small></span>${CHEV}</button>`;
  h += `<button class="li" data-key="bk" data-bk="${node}" data-label="${name}">${IC("archive", "")}<span class="lab">每日備份<small class="bkst" data-n="${node}" data-keep data-ld>讀取中…</small></span>${CHEV}</button></div>`;
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
/* 單選的一排（data-slide）：選取底色從舊的那一個彈性滑到新的，跟著新的大小、圓角變形；滑的途中再按別的就從現在的位置轉向 */
let SPTS;   // SPRING 曲線的轉折點（JS 自己算動畫時用）
function springAt(t){
  if (!SPTS) { const m = SPRING.match(/^linear\((.*)\)$/);
    SPTS = m ? m[1].split(",").map((x, i, a) => { const [v, p] = x.trim().split(/\s+/); return [p ? parseFloat(p) / 100 : i / (a.length - 1), +v]; }) : [[0, 0], [.3, .8], [.6, 1.04], [1, 1]]; }
  for (let i = 1; i < SPTS.length; i++) if (t <= SPTS[i][0]) { const [p0, v0] = SPTS[i - 1], [p1, v1] = SPTS[i]; return v0 + (v1 - v0) * (t - p0) / ((p1 - p0) || 1); }
  return 1;
}
function slideSel(change){
  const z = ZM(), was = canAnim() ? [...document.querySelectorAll("[data-slide]")].map(b => {
    const g = b.querySelector(":scope>.slide"), on = selOf(b);
    return [b.dataset.key, g ? g._now : on && boxIn(b, on, z)];
  }) : [];
  change();
  was.forEach(([k, from]) => {
    const b = document.querySelector(`[data-slide][data-key="${k}"]`), on = b && selOf(b);
    if (!from || !on) return;
    const old = b.querySelector(":scope>.slide"); if (old) { old._stop = 1; old.remove(); }
    const to0 = boxIn(b, on, z);
    if (Math.abs(to0.x - from.x) < 1 && Math.abs(to0.y - from.y) < 1) return;
    const g = document.createElement("i"); g.className = "slide"; g._leaving = 1; b.prepend(g); b.classList.add("sliding");   // _leaving：重畫時不要把它當成內容
    const dur = T.sp, t0 = performance.now(), lerp = (a, c, p) => a + (c - a) * p;
    g.animate([{opacity:1}, {opacity:1}], {duration:dur, id:"ui"});              // 滑完之前，自動更新先等一下
    const step = now => {
      if (g._stop || !g.isConnected) return;
      const p = Math.min(1, (now - t0) / dur), e = springAt(p), on2 = selOf(b);
      if (!on2 || !b.isConnected) return g.remove();
      const to = boxIn(b, on2, z), c = {x:lerp(from.x, to.x, e), y:lerp(from.y, to.y, e), w:lerp(from.w, to.w, e), h:lerp(from.h, to.h, e), r:from.r.map((r, i) => Math.max(0, lerp(r, to.r[i], e)))};
      g._now = c;
      Object.assign(g.style, {transform:`translate(${c.x}px,${c.y}px)`, width:c.w + "px", height:c.h + "px", borderRadius:c.r.map(r => r + "px").join(" ")});
      if (p < 1) return requestAnimationFrame(step);
      on2.style.transition = "none"; b.classList.remove("sliding"); on2.offsetWidth; on2.style.transition = ""; g.remove();   // 換回它自己的底色，同一格畫面，不會閃
    };
    step(t0);
  });
}
/* 選到的那一個；data-slide=".ri" 這種是底色在它裡面的那一塊（電腦左邊分頁的圖示底） */
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
  const D = DESK.matches, many = list.length > 1, hk = D && many && list.some(x => keyOf(x) === LOGH) ? LOGH : "";
  const all = allEvents(list), byH = all.filter(e => !hk || e.k === hk), ev = byH.filter(LOGK[LOGF] || LOGK[""]);
  const F = [["", "全部"], ["bad", "有狀況"], ["other", "恢復與通知"]];
  let rows = "", day = "";
  for (const e of ev) { const d = dayOf(e.t); if (d !== day) { day = d; rows += `<div class="day" data-key="d:${d}">${d}</div>`; } rows += evRow(e, many, hm); }
  const body = ev.length ? `<div class="evs" data-key="evs" data-keyed data-sw>${rows}</div>` : `<div class="calm" data-key="calm" data-sw>目前沒有事件</div>`;
  if (D) {   // 電腦：右邊放篩選和各台的則數
    const row = (attr, on, l, n) => `<button class="li${on ? " on" : ""}" ${attr}><span class="lab">${l}</span><span class="val num">${n}</span></button>`;
    const kf = LOGK[LOGF] || LOGK[""];
    let side = `<div class="lbl">篩選</div><div class="pane group" data-key="lf" data-slide>${F.map(([k, l]) => row(`data-logf="${k}"`, LOGF === k, l, byH.filter(LOGK[k]).length)).join("")}</div>`;
    if (many) side += `<div class="lbl" data-key="lhh">主機</div><div class="pane group" data-key="lhs" data-keyed data-slide>${row(`data-logh="" data-key="lh:"`, !hk, "全部主機", all.filter(kf).length)}${list.map(x => row(`data-logh="${esc(keyOf(x))}" data-key="lh:${esc(keyOf(x))}"`, hk === keyOf(x), esc(x.name), all.filter(e => e.k === keyOf(x) && kf(e)).length)).join("")}</div>`;
    return `<div class="wide" data-key="log"><h1 class="ptitle">紀錄</h1><div class="split rside" data-key="lsplit"><div class="smain" data-key="lm">${body}</div><aside class="side" data-key="ls">${side}</aside></div></div>`;
  }
  const chip = (k, l) => `<button class="fchip${LOGF === k ? " on" : ""}" data-logf="${k}"><span class="ck">${I("check")}</span>${l}</button>`;
  return `<div class="narrow" data-key="log"><h1 class="ptitle">紀錄</h1><div class="fchips" data-key="lfc" data-slide>${F.map(([k, l]) => chip(k, l)).join("")}</div>${body}</div>`;
}
/* 主題色：照色相排一圈（色票本身用 style.css 的 [data-accent] 算出預覽） */
const ACCENTS = [["red", "紅"], ["orange", "橘"], ["amber", "琥珀"], ["lime", "萊姆"], ["green", "綠"], ["teal", "青綠"],
  ["cyan", "天藍"], ["blue", "藍"], ["indigo", "靛藍"], ["purple", "紫"], ["pink", "粉紅"]];
/* 設定：上面是這台裝置的外觀、通知與登入；下面「主機」好幾台時跟工具一樣一排主機名稱選一台，只顯示那台的 */
const SHOWS = [["trend", "歷史曲線圖", "chart"], ["net", "網路速度", "net"], ["box", "容器與服務", "items"], ["info", "連線數與 IP", "info"],
  ["flag", "國旗", "flag"], ["month", "每月流量", "traffic"], ["sun", "天氣", "weather", "用這台裝置的位置"], ["quote", "心情小語", "quote"]];
const showSum = () => { const n = SHOWS.filter(x => PREF.show[x[2]]).length; return n === SHOWS.length ? "全部顯示" : n ? `顯示 ${n} 項` : "全部隱藏"; };
const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(getP(k)) === String(v) ? "on" : ""}" data-pref="${k}" data-val="${v}">${l}</button>`).join("")}</div>`;
const tog = (k, l) => `<input type="checkbox" class="tog" data-pref="${k}" aria-label="${l}" ${getP(k) ? "checked" : ""}>`;
function setPage(list){
  const on = list.filter(s => s.online).sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b))), self = on.some(s => !s.node);
  const go = (attr, ic, l, st) => `<button class="li" ${attr}>${IC(ic, "")}<span class="lab">${l}<small class="${st}" data-keep data-ld>讀取中…</small></span>${CHEV}</button>`;
  const sw = ACCENTS.map(([v, l]) => `<button class="${PREF.accent === v ? "on" : ""}" data-pref="accent" data-val="${v}" data-accent="${v}" title="${l}" aria-label="${l}">${I("check")}</button>`).join("")
    + `<button class="rbsw${PREF.accent === "rainbow" ? " on" : ""}" data-pref="accent" data-val="rainbow" title="彩虹" aria-label="彩虹">${I("check")}</button>`;
  const D = DESK.matches;   // 電腦：左欄是這台裝置的設定，右欄是主機
  const look = `<div class="lbl">外觀</div><div class="group">
      <div class="li col"><span class="lab">主題</span>${seg("theme", [["auto", "自動"], ["light", "淺色"], ["dark", "深色"]])}</div>
      <div class="li col"><span class="lab">主題色</span><div class="sw">${sw}</div></div>
      <div class="li col"><span class="lab">配色風格</span>${seg("tone", [["soft", "柔和"], ["vivid", "鮮明"], ["calm", "素雅"]])}</div>
      <div class="li col"><span class="lab">文字大小</span>${seg("size", [["s", "小"], ["m", "中"], ["l", "大"]])}</div>
      <label class="li"><span class="lab">動畫</span>${tog("motion", "動畫")}</label>
      <button class="li" data-shows>${IC("trend", "")}<span class="lab">要顯示的內容<small class="showst">${showSum()}</small></span>${CHEV}</button></div>`;
  const sec = `<div class="lbl" data-key="lsec">通知與登入</div><div class="group" data-key="g-sec">${go("data-tg", "bell", "Telegram 通知", "tgst")}${PK_OK && self ? go("data-pk", "finger", "手機金鑰登入", "pkst") : ""}${self ? go("data-pin", "pin", "PIN 碼登入", "pinst") : ""}</div>`
    + (self && !SHARE ? `<div class="lbl" data-key="lsky">機場起降</div><div class="group" data-key="g-sky">${go("data-sky", "fly", "OpenSky 帳號", "skyst")}</div>` : "");
  const out = `<div class="sp" data-key="sp"></div><div class="group" data-key="g-out"><button class="li" data-logout><span class="ico info">${I("logout")}</span><span class="lab">登出</span></button>
      <button class="li" data-reset><span class="ico info">${I("upd")}</span><span class="lab">恢復預設值<small>外觀設定只存在這台裝置</small></span></button></div>`;
  let h = "";
  if (on.length) {
    const s = on.find(x => keyOf(x) === TOOLH) || on.find(x => !x.node) || on[0], k = esc(keyOf(s)), node = esc(s.node || "");
    h += `<div class="lbl" data-key="lh">主機<button data-selfcheck>檢查新版</button></div><div class="selfsum" data-key="selfsum" data-keep data-ld></div>`;
    if (on.length > 1) h += hpick(on, s, x => x.self_has ? `<span class="dot info"></span>` : "");
    h += `<div class="group" data-key="g-h:${k}" data-sw><div class="selfbox" data-key="self" data-n="${node}" data-keep data-ld><div class="selfwait">讀取中…</div></div>${sysRow(s)}<button class="li" data-newtok="${node}" data-label="${esc(s.name)}">${IC("key", "")}<span class="lab">換一組新密碼<small>舊密碼會立刻失效</small></span>${CHEV}</button>`
      + (s.keep ? `<label class="li">${IC("keep", "")}<span class="lab">Oracle 防回收${keepLine(s.keep)}</span><input type="checkbox" class="tog" data-keepalive="${node}" aria-label="Oracle 防回收" ${s.keep.on ? "checked" : ""}></label>` : "")
      + (s.node ? "" : go("data-pair", "link", "配對暗號", "pairst")) + `</div>`;
  }
  return `<div class="${D ? "wide" : "narrow"}" data-key="set"><h1 class="ptitle">設定</h1>`
    + (D ? `<div class="scols" data-key="scols"><div class="scol" data-key="sc1">${look}${out}</div><div class="scol" data-key="sc2">${sec}${h}</div></div>` : look + sec + h + out) + `</div>`;
}
/* 系統更新（作業系統的套件）：跟哨兵、雲端硬碟的版本放在一起 */
const sysRow = s => s.update && s.update.supported ? `<div class="selfrow" data-key="sys"><div class="cl2 first"><span class="ico info">${I("layers")}</span><span>系統<small data-x>${updateInfo(s) || "還沒檢查"}</small></span>${updateBtn(s)}</div></div>` : "";
/* 要顯示的內容、畫面更新頻率：收在一個視窗裡（手機從下面滑上來） */
function showsModal(){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog showsd"><h3>要顯示的內容</h3>
    <div class="form"><div class="group">${SHOWS.map(([ic, l, k, sm]) => `<label class="li">${IC(ic, "")}<span class="lab">${l}${sm ? `<small>${sm}</small>` : ""}</span>${tog("show." + k, l)}</label>`).join("")}</div>
      <div class="group"><div class="li col"><span class="lab">畫面更新頻率</span>${seg("refresh", [[3, "3 秒"], [5, "5 秒"], [10, "10 秒"], [30, "30 秒"]])}</div></div></div>
    <div class="btns"><button class="ubtn" data-r="0">完成</button></div></div>`;
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
function tween(el, from, to, d){
  cancelAnimationFrame(el._raf);
  if (!isFinite(from) || !isFinite(to) || !canAnim() || behind(el)) { el.textContent = (+to).toFixed(d); return; }
  let t0 = null; const dur = T.slow;
  const stepf = now => {
    if (t0 === null) t0 = now;                                   // 用第一格畫面當起點，時間不會倒退
    const k = scrolling() ? 1 : Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
    el.textContent = (from + (to - from) * e).toFixed(d);
    if (k < 1) el._raf = requestAnimationFrame(stepf); else el.textContent = (+to).toFixed(d);
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
const still = el => el.getAnimations({subtree:true}).forEach(n => { if (!n.animationName) n.cancel(); else if (isFinite(n.effect.getComputedTiming().endTime)) n.finish(); });
/* 換分頁：舊的那頁留在原地很快淡出（不佔位置），新的那頁接著淡入（CSS 的 through） */
function through(a, b){
  const par = a.offsetParent;
  if (!canAnim() || !par) return a.replaceWith(b);
  const z = ZM(), r = a.getBoundingClientRect(), R = par.getBoundingClientRect();
  a.replaceWith(b);
  a._leaving = 1;
  Object.assign(a.style, {position:"absolute", left:(r.left - R.left) / z - par.clientLeft + "px", top:(r.top - R.top) / z - par.clientTop + "px", width:r.width / z + "px",
    height:Math.min(r.height / z, innerHeight / z * 2) + "px", overflow:"hidden", margin:"0", pointerEvents:"none", animation:"none"});
  b.after(a); still(a);
  a.animate([{opacity:1}, {opacity:0}], {duration:T.fast / 2, easing:EXIT, fill:"forwards", id:"ui"}).onfinish = () => a.remove();
  b.style.animationDelay = T.fast / 2 + "ms";
}
/* 換成另一台主機的內容（data-sw）：舊的留在原地很快淡出，新的接著淡入浮上來；
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
  b.animate([{opacity:0, transform:"translateY(8px) scale(.985)"}, {opacity:1, transform:"none"}], {duration:T.mid, delay:T.fast / 2, easing:EASE, fill:"backwards", id:"ui"});
  const own = [b.style.height, b.style.overflow];         // 自己本來就有的高度（例如曲線圖「讀取中」那格）要留著
  b.style.height = h0 + "px"; b.style.overflow = "hidden";
  const t0 = performance.now(), dur = T.mid + T.fast / 2;
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
    c.setAttribute("data-key", n > 1 ? `${k}#${n}` : k); }
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
      if (at.name==="d" && a.tagName==="path" && morphPath(a, a.getAttribute("d"), at.value)) continue;
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
  ORDER = list.map(keyOf);                     // 原本的順序（工具的主機列不跟著告警重排，免得按到別台）
  list = [...list].map(tidy).sort((a, b) => LVRANK[lvOf(a)] - LVRANK[lvOf(b)]);
  LIST = list;
  if (DET && (!cardMode(list) || !list.some(s => keyOf(s) === DET))) { DET = ""; DETX = false; showBack(); document.documentElement.classList.remove("lock"); }
  const time = new Date().toLocaleTimeString("zh-TW", {hour12:false});
  paint(DESK.matches ? renderDesk(list, time) : renderPhone(list, time));
  if (TIPX) drawTip(...TIPX);
  loadStatus(); pickShow(PSMOOTH);
}
let PSMOOTH = false;   // 點主機名稱換台時，那一排平順地滑到選到的那台
DESK.addEventListener("change", () => { applyPrefs(); if (LIST.length) render(LIST); });
/* 電腦版一次並排幾台：螢幕夠寬才放三台 */
let WIDE = innerWidth >= 1800;
addEventListener("resize", () => { const w = innerWidth >= 1800; if (w !== WIDE) { WIDE = w; if (DESK.matches && LIST.length) render(LIST); } }, {passive:true});

/* ═════════ 對話框、通知 ═════════ */
function modal({icon, cls="box", title, text, input, ok="確定", cancel="取消"}){
  return new Promise(res => {
    const v = document.createElement("div"); v.className = "veil";
    v.innerHTML = `<div class="dialog">${icon?`<div class="ico big ${cls}">${I(icon)}</div>`:""}<h3>${esc(title)}</h3>${text?`<p>${esc(text)}</p>`:""}
      ${input!==undefined?`<input class="field" maxlength="40" value="${esc(input)}">`:""}
      <div class="btns"><button class="ubtn ghost" data-r="0">${cancel}</button><button class="ubtn ${cls === "bad" || cls === "warn" ? cls : ""}" data-r="1">${ok}</button></div></div>`;
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
  scrollTo(0, 0); slideSel(() => render(LIST));
}
/* 工具、設定頁上「讀取中…」的狀態：換到那一頁時讀一次（之後自動更新不會蓋掉） */
const view = () => $("#app .view");
function loadStatus(){
  const r = view(); if (!r || !r.querySelector("[data-ld]")) return;
  r.querySelectorAll("[data-ld]").forEach(x => x.removeAttribute("data-ld"));
  tgStatus(r); selfStatus(r); pkStatus(r); pinStatus(r); pairStatus(r); bkStatus(r); skyStatus(r);
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
addEventListener("popstate", () => { if (DET) shutDet(); });
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
    <div class="btns"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn" data-save>測試並儲存</button></div></div>`;
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
      <div class="btns"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn" data-r="1">儲存</button></div></div>`;
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
  window._menu = m;
  setTimeout(() => m.addEventListener("click", () => closeMenu()), 0);
}
function closeMenu(){
  const m = window._menu; if (!m) return; window._menu = null;
  if (!canAnim()) return m.remove();
  m.animate([{opacity:1}, {opacity:0, transform:"scale(.95,.8)"}], {duration:T.fast, easing:EXIT, fill:"forwards"}).finished.then(() => m.remove());
}
addEventListener("scroll", closeMenu, {passive:true, capture:true});
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
    : d.has ? `<span class="new">有新版可以更新</span>` : d.err ? esc(d.err) : "已經是最新版 ✨";
  const ch = d.has && d.changes && d.changes.length ? `<ul class="chg">${d.changes.slice(0, 5).map(c => `<li>${esc(c.split("\n")[0])}</li>`).join("")}</ul>` : "";
  const c = d.cloud;
  const cst = !c ? "" : c.running ? `<span class="spin"></span>更新中…` : c.has ? `<span class="new">官方有新版可以更新</span>` : c.err ? `<span class="warn">${esc(c.err)}</span>` : c.has === false ? "已經是最新版 ✨" : "還沒檢查";
  const crow = c ? `<div class="cl2">${IC("cloud", "")}<span>雲端硬碟<small>${c.version ? `版本 ${esc(c.version)}・` : ""}${cst}</small></span>
    ${c.has && !c.running ? `<button class="ubtn sm" data-cloudup="${node}">更新</button>` : ""}</div>` : "";
  const srow = `<div class="cl2 first"><span class="ico theme">${I("upd")}</span><span>哨兵<small>${d.version ? `版本 ${esc(d.version)}・${esc(d.build || "")}・` : ""}${st}</small>${ch}</span>
    ${d.has && !d.running ? `<button class="ubtn sm" data-selfup="${node}">更新</button>` : ""}</div>`;
  swapHTML(box, `<div class="selfrow">${srow}${crow}</div>`);
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
  const started = all ? (all > 1 ? `已開始更新 ${all} 個項目` : `已開始更新「${jobName(go[0])}」`) : "";
  if (all || fail.length) toast([started, ...fail].filter(Boolean).join("；"), fail.length ? "bad" : "ok");   // 不管成功失敗都只跳一則
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
    } catch(e) { fail.push(`${jobName(j)}：${e.message}`); }
  }
  return go;
}
/* 更新完自動套用：盯著剛開始更新的項目，全部好了才跳一則通知、更新設定面板上的版本號；
   這台的哨兵換新版時自動重新載入網頁。記在分頁裡，重新載入後會接著盯
   wait：等第一台（first）確定沒問題才更新的；held：已經有結果、等全部好了一起說的 */
const UPW = (() => { let o = {}; try { o = JSON.parse(sstore("vs-upw") || "{}"); } catch(e) {}
  if (Array.isArray(o)) o = {jobs: o};
  return {jobs: o.jobs || [], wait: o.wait || [], first: o.first || "", held: o.held || [], timer: 0}; })();
function upwSave(){ const {jobs, wait, first, held} = UPW; sstore("vs-upw", jobs.length || wait.length || held.length ? JSON.stringify({jobs, wait, first, held}) : ""); }
function upwPanel(){ const b = TAB === "set" && view(); if (b) selfStatus(b, "fresh"); }
const upwSay = (list) => { const bad = list.filter(x => !x[1]), good = list.filter(x => x[1]);
  return [good.length ? (good.length > 1 ? `${good.length} 個項目都更新好了 ✨` : good[0][0]) : "", ...bad.map(x => x[0])].filter(Boolean).join("；"); };
function upwReload(msg){
  if (window._reloading) return; window._reloading = true;
  if (!UPW.jobs.length && !UPW.wait.length) { msg = upwSay([...UPW.held, [msg, true]]); UPW.held = []; }
  else UPW.held.push([msg, true]);
  upwSave();
  if (msg) sstore("vs-upmsg", msg);
  toast("哨兵已更新到新版，重新載入中…");
  setTimeout(() => location.reload(), 1400);
}
function upwRun(){
  clearTimeout(UPW.timer);
  if (!UPW.jobs.length || window._reloading) return;
  UPW.timer = setTimeout(upwStep, 3000);
}
async function upwStep(){
  const nodes = [...new Set(UPW.jobs.map(j => j.node))], done = [];
  let mine = "";                                                        // 這台的哨兵換好的新版本號
  await Promise.all(nodes.map(async node => {
    let d; try { d = await selfCall(node, "status"); } catch(e) { return; }   // 正在重新啟動，連不上是正常的
    for (const j of UPW.jobs.filter(x => x.node === node)) {
      const age = Date.now() - j.t0;
      if (j.kind === "cloud") {
        const c = d.cloud; if (!c || c.running) continue;
        if (age < 4000) continue;                                       // 剛開始的那一下可能還沒跑起來
        const v = c.version || "";
        done.push([j, c.err && !v ? `「${j.name}」的雲端硬碟更新失敗：${c.err}` : v && v !== j.from ? `「${j.name}」的雲端硬碟已更新到 ${v} ✨` : `「${j.name}」的雲端硬碟更新完成 ✨`, !(c.err && !v)]);
      } else if (j.from && d.build && d.build !== j.from) {
        if (!node) { mine = d.version; done.push([j, "", true]); continue; }   // 這台：等一下換上新畫面
        done.push([j, `「${j.name}」的哨兵已更新到 ${d.version} ✨`, true]);
      } else if (!d.running && age > 15000) {
        done.push([j, d.last && d.last.ok === false ? `「${j.name}」的哨兵更新失敗，已保留原本的版本` : `「${j.name}」的哨兵${j.from ? "已經是最新版" : "更新完成"} ✨`, !(d.last && d.last.ok === false)]);
      }
    }
  }));
  if (window._reloading) return;
  if (mine) { UPW.jobs = UPW.jobs.filter(j => !done.some(x => x[0] === j)); UPW.held.push(...done.filter(x => x[1]).map(x => [x[1], x[2]])); return upwReload(`哨兵已更新到 ${mine} ✨`); }
  for (const j of UPW.jobs) if (Date.now() - j.t0 > 15 * 60000 && !done.some(x => x[0] === j)) done.push([j, `「${j.name}」${j.kind === "cloud" ? "的雲端硬碟" : "的哨兵"}更新太久沒回應，請到主機上看看`, false]);
  if (done.length) {
    UPW.jobs = UPW.jobs.filter(j => !done.some(x => x[0] === j));
    UPW.held.push(...done.map(x => [x[1], x[2]]));
    const fx = UPW.wait.length && done.find(x => x[0].kind === "self" && x[0].node === UPW.first);
    if (fx && fx[2]) { const fail = []; await upwStart(UPW.wait, fail); fail.forEach(f => UPW.held.push([f, false])); UPW.wait = []; }   // 第一台沒問題：換其他台
    else if (fx) { UPW.held.push([`其他 ${UPW.wait.length} 台先不更新`, false]); UPW.wait = []; }
    if (!UPW.jobs.length && !UPW.wait.length) {                         // 全部都有結果了：合成一則
      const bad = UPW.held.some(x => !x[1]);
      toast(upwSay(UPW.held), bad ? "bad" : "ok"); UPW.held = [];
    }
    upwSave(); upwPanel(); tick();                                      // 設定面板的版本號、齒輪上的紅點馬上跟著變
  }
  upwRun();
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
    txt(el, d.on ? `已開啟・由 ${d.bot || "機器人"} 傳送・${d.keep ? `保留 ${d.keep >= 24 ? Math.round(d.keep/24) + " 天" : d.keep + " 小時"}` : "不自動刪除"}` : d.has_token ? "還沒選要傳到哪裡" : "還沒設定");
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
    <div class="btns three"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn ghost" data-test>測試</button><button class="ubtn" data-save>儲存</button></div>
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
  : d.out ? `今天的次數用完了，${flyHM(d.out * 1000)} 恢復` : "還沒設定・每天只能查 400 次";
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
    <div class="btns"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn" data-save>儲存</button></div>
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
    text:"其他裝置要用新密碼重新登入。", ok:"換新密碼"});
  if (!ok) return;
  let d = {};
  try {
    const r = await fetch("/api/token?node=" + encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok()}});
    d = await r.json().catch(() => ({}));
    if (r.status === 404) return toast("那台主機還沒更新到新版，先更新再換密碼", "bad");
    if (!r.ok || !d.ok || !d.token) return toast(d.message || "換密碼失敗", "bad");
  } catch(e) { return toast("連線失敗，請稍後再試", "bad"); }
  if (!node) {
    setTok(d.token);
    if (LIST.some(x => !x.node && x.cloud))          // 這台裝置的雲端硬碟通行證也換新
      fetch("/api/cloud-login", {method:"POST", headers:{"X-Token":getTok()}}).catch(() => {});
  }
  const cp = await modal({icon:"ok", cls:"theme", title:"已換成新密碼", input:d.token, ok:"複製密碼", cancel:"關閉",
    text: node ? "這邊已記住新密碼。直接打開那台時，用新密碼登入。"
               : "請記下新密碼，其他裝置要用它重新登入。"});
  if (cp) {
    try { await navigator.clipboard.writeText(d.token); toast("已複製新密碼"); }
    catch(e) { toast("沒辦法自動複製，請手動選取密碼複製", "bad"); }
  }
}
function restart(){ clearTimeout(timer); timer = setTimeout(tick, (PREF.refresh || 5) * 1000); }
addEventListener("keydown", e => { if (e.key === "Escape") { const v = [...document.querySelectorAll("#layer .veil")].pop(); if (v && v._esc) v._esc(); } });

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
function devName(){
  const u = navigator.userAgent;
  return /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android 手機" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows 電腦" : "我的裝置";
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
    authenticatorData:bu(c.response.authenticatorData), signature:bu(c.response.signature)});
  if (!d.ok || !d.token) throw new Error(d.message || "登入失敗");
  return d.token;
}
async function pkStatus(root){
  const el = root.querySelector(".pkst"); if (!el) return;
  try { const d = await pkCall("/api/passkey", {action:"list"}, 1);
    txt(el, d.keys && d.keys.length ? `已登記 ${d.keys.length} 支` : "還沒登記");
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
    <div class="btns"><button class="ubtn ghost" data-r="0">關閉</button><button class="ubtn" data-add>登記${me}</button></div></div>`;
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

/* ═════════ PIN 碼登入：4～8 位數字，連續輸錯 5 次暫停 15 分鐘，累計 10 次自動關閉 ═════════ */
const pinCall = body => pkCall("/api/pin", body, 1);
async function pinStatus(root){
  const el = root.querySelector(".pinst"); if (!el) return;
  try { const d = await pinCall({action:"status"});
    txt(el, !d.on ? "還沒設定" : d.locked ? `輸錯太多次，暫停中（還有 ${Math.ceil(d.locked / 60)} 分鐘）` : "已設定");
    el.classList.toggle("on", !!d.on && !d.locked);
  } catch(e) { txt(el, e.message); }
}
async function pinModal(){
  const st = await pinCall({action:"status"}).catch(() => ({}));
  const v = document.createElement("div"); v.className = "veil";
  const inp = k => `<input class="field" data-k="${k}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password">`;
  v.innerHTML = `<div class="dialog pindlg">${IC("pin","big")}<h3>${st.on ? "換一組 PIN 碼" : "設定 PIN 碼"}</h3>
    <p>用短短的數字登入</p>
    <div class="form">
      <label>新的 PIN 碼${inp("a")}<small>4～8 位數字，輸錯太多次會暫停</small></label>
      <label>再輸入一次${inp("b")}</label>
      <div class="msg"></div></div>
    <div class="btns ${st.on ? "three" : ""}">${st.on ? `<button class="ubtn ghost" data-off>關閉 PIN 碼</button>` : ""}<button class="ubtn ghost" data-r="0">取消</button><button class="ubtn" data-save>儲存</button></div></div>`;
  $("#layer").appendChild(v);
  const q = k => v.querySelector(`[data-k="${k}"]`), msg = v.querySelector(".msg");
  setTimeout(() => q("a").focus(), 60);
  v.addEventListener("input", e => {                // 只留數字（全形數字也換成半形）
    const f = e.target; if (!f.matches("[data-k]")) return;
    const d = f.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, "").slice(0, 8);
    if (d !== f.value) f.value = d;
  });
  return new Promise(res => {
    let busy = false;
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    const bad = t => { msg.className = "msg bad"; msg.textContent = t; };
    const save = async () => {
      const a = q("a").value.trim(), b = q("b").value.trim();
      if (!/^\d{4,8}$/.test(a)) return bad("PIN 碼要是 4 到 8 位數字");
      if (a !== b) return bad("兩次輸入的不一樣");
      busy = true;
      const d = await pinCall({action:"set", pin:a}).catch(e => ({message:e.message}));
      busy = false;
      if (d.ok) { toast(d.message); done(); } else bad(d.message || "設定失敗");
    };
    v.addEventListener("keydown", e => { if (e.key === "Enter" && !busy) { e.target === q("a") ? q("b").focus() : save(); } });
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      if (busy) return;
      if (e.target.closest("[data-save]")) return save();
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
    txt(el, n ? `已配對 ${n} 台` : "還沒配對");
    el.classList.toggle("on", n > 0);
  } catch(e) { txt(el, e.message); }
}
async function pairModal(){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog pkd pairdlg">${IC("link","big")}<h3>配對暗號</h3>
    <p>在主要主機按「新增主機」，貼上暗號</p>
    <div class="form"><div class="pklist"></div><div class="pcode"></div><div class="msg"></div></div>
    <div class="btns"><button class="ubtn ghost" data-r="0">關閉</button><button class="ubtn" data-gen>產生暗號</button></div></div>`;
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
    <div class="btns"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn warn" data-go>繼續</button></div></div>`;
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
    if (d.mode === "pw") { txt.textContent = "沒設定 Telegram，請輸入這台的密碼或 PIN 碼"; inp.type = "password"; inp.placeholder = "密碼或 PIN 碼"; }
    else { txt.innerHTML = `請輸入 Telegram 收到的驗證碼 <a href="#" data-again>重傳</a>`; inp.inputMode = "numeric"; inp.maxLength = 6; inp.placeholder = "6 位數驗證碼"; say(d.message); }
    inp.value = ""; setTimeout(() => inp.focus(), 60);
  };
  const boot = async () => {
    const code = inp.value.trim();
    if (!code) return inp.focus();
    wait("重新開機中…");
    const d = await call({action:"go", code});
    busy = false; go.disabled = false; go.textContent = "重新開機";
    if (d.ok) { toast(`「${name}」正在重新開機`); done(); } else { say(d.message || "沒有成功", 1); inp.select(); }
  };
  inp.addEventListener("input", () => { if (inp.inputMode === "numeric") inp.value = inp.value.replace(/\D/g, ""); });
  inp.addEventListener("keydown", e => { if (e.key === "Enter" && !busy) { e.preventDefault(); boot(); } });
  v.addEventListener("click", e => {
    if (e.target === v || e.target.closest("[data-r]")) return done();
    if (e.target.closest("[data-again]")) { e.preventDefault(); if (!busy) ask(); return; }
    if (e.target.closest("[data-go]") && !busy) asked ? boot() : ask();
  });
}
/* 遠端下載：貼上連結，主機直接下載到它的雲端硬碟「下載」資料夾；開著時每秒更新進度（只改有變的地方，不整塊重畫） */
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
    <div class="btns one"><button class="ubtn ghost" data-r="0">關閉</button></div></div>`;
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
        r.innerHTML = `${I("dl")}<span><b></b><small></small><div class="track"><div class="fill"></div></div></span>
          <button type="button" class="iconbtn" data-retry title="重新下載">${I("upd")}</button><button type="button" class="iconbtn" data-del>${I("x")}</button>`;
        r._new = 1;
      }
      const now = [...list.children].filter(x => !x._leaving);
      if (now[i] !== r) list.insertBefore(r, now[i] || null);
      if (r._new) { r._new = 0; if (canAnim()) enterBlock(r, 0); }
      const set = (el, t) => { if (el.textContent !== t) el.textContent = t; };
      set(r.querySelector("b"), j.name || j.label || "檔案");
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
    <div class="btns"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn" data-go>連接</button></div></div>`;
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
  return `<small class="kpst${low ? " bad" : ""}">${Math.min(7, Math.max(1, Math.ceil(k.days)))} 天處理器 ${k.p95}%・門檻 20%${k.now ? "・補量中" : ""}</small>`;
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
    try { const [t, c] = bkLine(await bkGet(el.dataset.n)); txt(el, t); el.className = "bkst " + c; }
    catch(e) { txt(el, e.message); el.className = "bkst"; }
  }));
}
function bkRows(d){
  const L = d.last, row = (ok, t, sub) => `<li class="${ok === null ? "" : ok ? "ok" : "bad"}">${ok === null ? "" : I(ok ? "ok" : "warn")}<span>${t}${sub ? `<small>${esc(sub)}</small>` : ""}</span></li>`;
  let h = "";
  if (L) {
    h += row(null, `<b>上次備份</b>${esc(when(L.t))}${L.size ? `・${bkSize(L.size)}` : ""}`);
    if (L.msg) h += row(false, esc(L.msg));
    h += (L.to || []).map(x => row(x.ok, x.ok ? esc(x.where) : `${esc(x.where)}沒有成功`, x.msg)).join("");
    if (L.items && L.items.length) h += row(null, `<b>備份內容</b>${esc(L.items.join("、"))}`);
    if (L.big && L.big.length) h += row(null, `<b>太大沒備份</b>${esc(L.big.map(p => p.split("/").pop()).join("、"))}`);
  } else h += row(null, d.on ? "還沒備份過" : "每日備份已關閉");
  if (!d.tg) h += row(null, `<small>開啟 Telegram 通知會多存一份</small>`);
  return h;
}
/* 這台存著哪些主機的備份（每台主機都存著每一台的） */
const bkCopies = d => (d.copies || []).map(c => `<li>${I("archive")}<span><b>${esc(c.name)}${c.me ? "（這台）" : ""}</b>${+c.count || 0} 份<small>最新：${esc(when(c.t))}・${bkSize(c.size)}</small></span></li>`).join("")
  || `<li><span>還沒有備份</span></li>`;
async function bkModal(node, label){
  let d = await bkGet(node).catch(e => ({err:e.message}));
  if (d.err) return toast(d.err, "bad");
  const v = document.createElement("div"); v.className = "veil";
  const multi = LIST.length > 1;
  v.innerHTML = `<div class="dialog bkdlg">${IC("archive","big")}<h3>每日備份${multi ? `：${esc(label)}` : ""}</h3>
    <p>每天自動加密備份，每台主機都存一份</p>
    <div class="form">
      <ul class="bkrows">${bkRows(d)}</ul>
      <div class="lbl">${d.where === "雲端硬碟" ? "這台的雲端硬碟裡有" : "這台主機上有"}${d.where === "雲端硬碟" ? `<small>「${esc(d.folder)}」資料夾</small>` : ""}<ul class="bkrows bkcopies">${bkCopies(d)}</ul>
        <button class="linkish bkchg" data-restore>怎麼還原？</button></div>
      <div class="lbl">解開密碼（所有主機共用）<b class="bkkey" tabindex="0" role="button" title="點一下顯示">${esc(d.key)}</b>
        <small>沒有它誰都打不開，請另外記好</small>
        <button class="linkish bkchg" data-chg>改成自己的密碼</button>
        <span class="bknew" hidden><input class="field" type="password" maxlength="128" autocomplete="new-password" placeholder="至少 8 個字"><button class="ubtn sm" data-setkey>儲存</button></span></div>
      <label class="bkon"><span>每天 ${+d.hour || 0} 點自動備份</span><input type="checkbox" class="tog" ${d.on ? "checked" : ""}></label>
      <div class="msg"></div></div>
    <div class="btns three"><button class="ubtn ghost" data-dl>下載</button><button class="ubtn ghost" data-r="0">關閉</button><button class="ubtn" data-run>立即備份</button></div></div>`;
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
      busy(runb); swapHTML(rows, bkRows(d)); swapHTML(v.querySelector(".bkcopies"), bkCopies(d));
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
    <div class="btns one"><button class="ubtn" data-r="0">關閉</button></div></div>`;
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
    <input id="tok" class="field" type="password" placeholder="${PIN_ON ? "存取密碼或 PIN 碼" : "存取密碼"}" autocomplete="current-password">
    <label class="remember"><input type="checkbox" id="rem" ${REM ? "checked" : ""}><span>30 天內不用再登入</span></label>
    <div class="err">${msg||""}</div><button class="ubtn" data-login>進入</button>${PK_OK && store("vps-pk") ? pkBtn : ""}</div>`;
  $("#tok").addEventListener("keydown",e=>{ if(e.key==="Enter") doLogin(); });
  $("#rem").addEventListener("change", e => { REM = e.target.checked; });
  pkCall("/api/passkey-login", {action:"has"}).then(d => {   // 問主機有沒有設定 PIN 碼、有沒有登記手機金鑰，有才顯示
    const box = $("#app .login");
    if (!box) return;
    PIN_ON = !!d.pin; $("#tok").placeholder = PIN_ON ? "存取密碼或 PIN 碼" : "存取密碼";
    if (!PK_OK || !d.has || box.querySelector("[data-pklogin]")) return;
    box.insertAdjacentHTML("beforeend", pkBtn);
    const b = box.lastElementChild;
    if (canAnim()) b.animate([{opacity:0, transform:"translateY(-4px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE});
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
  body.innerHTML = `<label class="ubtn ghost rswfile"><input type="file" accept=".vsbk" hidden>${IC("archive")}<span class="rswname">選擇備份檔（.vsbk）</span></label>
    <input class="field" id="rswpw" type="password" placeholder="解開密碼" autocomplete="off">
    <small class="rswtip">備份檔在 Telegram 或另一台的雲端硬碟「哨兵備份」裡；密碼用總密碼或 Telegram 附的都行</small>
    <div class="err"></div><button class="ubtn" data-rswgo>開始還原</button>`;
  const inp = body.querySelector("input[type=file]"), err = body.querySelector(".err"), go = body.querySelector("[data-rswgo]");
  const lab = body.querySelector(".rswname");
  inp.onchange = () => { const f = inp.files[0]; lab.textContent = f ? `${f.name}（${bkSize(f.size)}）` : "選擇備份檔（.vsbk）"; err.textContent = ""; };
  go.onclick = async () => {
    const f = inp.files[0], pw = $("#rswpw").value;
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
/* 輸入 4～8 位數字、主機又有設定 PIN 碼：當成 PIN 碼；其他都當成存取密碼 */
async function doLogin(){
  const v = $("#tok").value.trim();
  if (!(PIN_ON && /^\d{4,8}$/.test(v))) { window._fresh = true; setTok(v, REM); return tick(); }   // 用密碼登入才把 PIN 碼輸錯的次數歸零
  const b = $("#app [data-login]"); b.disabled = true;
  let d = {};
  try { const r = await fetch("/api/pin-login", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({pin:v})});
    d = await r.json().catch(() => ({})); }
  catch(e) { d = {message:"連線失敗，請稍後再試"}; }
  if (d.ok && d.token) { setTok(d.token, REM); return tick(); }
  login(d.message || "PIN 碼不對");
}
const pkBtn = `<button class="ubtn ghost pkbtn" data-pklogin>${I("finger")}用手機金鑰登入</button>`;
async function pkLoginClick(b){
  const err = $("#app .login .err");
  b.disabled = true; err.textContent = "";
  try { setTok(await pkLogin(), REM); store("vps-pk", "1"); window._fresh = true; return tick(); }
  catch(e) { if (e.name !== "NotAllowedError" && e.name !== "AbortError") err.textContent = pkErr(e); }
  b.disabled = false;
}

/* ═════════ 點擊 ═════════ */
document.addEventListener("click", async e => {
  if (e.target.closest("#layer") || e.target.closest("#fly")) return;
  if (e.target.closest("[data-fly]")) return flyOpen(e.target.closest("[data-fly]"));
  const t = e.target;
  if (t.closest("[data-login]")) return doLogin();
  if (t.closest("[data-pklogin]")) return pkLoginClick(t.closest("[data-pklogin]"));
  if (t.closest("[data-rsw]")) return restoreScreen();
  const tb = t.closest("[data-tab]");
  if (tb) return setTab(tb.dataset.tab);
  if (t.closest("[data-settings]")) return setTab("set");
  if (t.closest("[data-back]")) return closeDet();
  if (t.closest("[data-addhost]")) return addHostModal();
  const rg = t.closest("[data-range]");
  if (rg) { if (RANGE !== rg.dataset.range) { RANGE = rg.dataset.range; store("vps-range", RANGE); render(LIST); } return; }
  const tf = t.closest("[data-traffic]");
  if (tf) return trafficModal(tf.dataset.traffic, tf.dataset.label);
  if (t.closest("[data-refresh]")) return refreshNow(t.closest("[data-refresh]"));
  if (t.closest("[data-logout]")) {
    if (await modal({icon:"logout", cls:"theme", title:"要登出嗎？", text:"", ok:"登出"})) { setTok(""); LIST = []; clearTimeout(timer); DET = ""; showBack(); document.documentElement.classList.remove("lock"); login(); }
    return;
  }
  const th = t.closest("[data-toolh]");
  if (th) { if (TOOLH !== th.dataset.toolh) { TOOLH = th.dataset.toolh; store("vs-toolh", TOOLH); PSMOOTH = true; slideSel(() => render(LIST)); PSMOOTH = false; } pickShow(true); return; }
  const lf = t.closest("[data-logf]");
  if (lf) { if (LOGF !== lf.dataset.logf) { LOGF = lf.dataset.logf; slideSel(() => render(LIST)); } return; }
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
  const op = t.closest("[data-open]");
  if (op) return openDet(op.dataset.open);
});

/* ═════════ 機場起降：像機場那種會翻牌的看板（飛機即時位置來自業餘接收站，主要主機去抓） ═════════ */
const FLYK = "vs-fly", FLYEV = 10000;                     // 記住選的機場和分頁；每 10 秒更新
const FLYS = (() => { try { return {ap:"", tab:"arr", ...JSON.parse(store(FLYK) || "{}")}; } catch(e) { return {ap:"", tab:"arr"}; } })();
let FLYD = null, FLYT = 0, FLYSEL = "", FLYSEQ = 0, FLYHR = "", FLYSTILL = false, FLYSW = 0, FLYDONE = false, FLYHUSH = 0, FLYBZ = 0, FLYLATER = 0, FLYDT = 0;   // FLYBZ：切換動畫跑到什麼時候（這段時間新資料先等）   // FLYDONE：已到／已飛的班機展開   // FLYHR：看板現在看哪個時段（幾點）
const flySave = () => store(FLYK, JSON.stringify({ap: FLYS.ap, tab: FLYS.tab, name: FLYS.name, term: FLYS.term || ""}));
const FLYTAB = [["arr", "抵達"], ["dep", "出發"], ["gnd", "機坪"], ["cargo", "貨機"]];
const flyFT = tab => tab === "arr" || tab === "dep";       // 照官網表排的分頁（機坪、貨機是收得到訊號的飛機）
const FLYCH = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:.";
const flyWide = ch => /[⺀-￿]/.test(ch);
/* 一格翻牌：上下兩半，換字時上半往下翻、下半接著翻下來 */
const FLYNAR = {W:"nw", M:"nm"};                          // 比格子寬的字母：壓窄一點，不然左右會被切掉
const flyTx = (b, ch) => { if (!FLYNAR[ch]) return void (b.textContent = ch === " " ? "\u00a0" : ch);
  const n = document.createElement("span"); n.className = FLYNAR[ch]; n.textContent = ch; b.replaceChildren(n); };
const flyCh = ch => ch === " " ? "&nbsp;" : FLYNAR[ch] ? `<span class="${FLYNAR[ch]}">${ch}</span>` : esc(ch);
const flyCell = ch => `<i class="c${flyWide(ch) ? " w" : ""}" data-c="${esc(ch)}"><b class="u">${flyCh(ch)}</b><b class="d">${flyCh(ch)}</b></i>`;
const flyPad = (v, n) => { const a = [...String(v || "").toUpperCase()].slice(0, n); while (a.length < n) a.push(" "); return a; };
const flap = (v, n, cls = "") => `<span class="sf ${cls}" data-n="${n}">${flyPad(v, n).map(flyCell).join("")}</span>`;
function flyOnce(c, a, b, tok){
  const u = c.children[0], d = c.children[1], dur = T.fast * .5;
  c.dataset.c = b; c.classList.toggle("w", flyWide(b) || flyWide(a));
  const fu = document.createElement("b"), fd = document.createElement("b");
  fu.className = "u f"; flyTx(fu, a); fd.className = "d f"; flyTx(fd, b);
  flyTx(u, b); c.append(fu, fd);
  const end = () => { fu.remove(); fd.remove(); if (c._tok === tok) { flyTx(d, b); c.classList.toggle("w", flyWide(b)); } };   // 中途被換掉的就不要再寫回舊字
  return fu.animate([{transform:"perspective(5em) rotateX(0)"}, {transform:"perspective(5em) rotateX(-90deg)"}], {duration:dur, easing:EXIT}).finished
    .then(() => { fu.remove(); return fd.animate([{transform:"perspective(5em) rotateX(90deg)"}, {transform:"perspective(5em) rotateX(0)"}], {duration:dur, easing:EASE}).finished; })
    .then(end, end);
}
let FLYN = 0;                                             // 現在有幾格正在翻：太多的話每格只翻一張，不然飛機多時會卡
async function flyFlip(c, to, delay, still){
  const tok = c._tok = (c._tok || 0) + 1, from = c.dataset.c, fl = c.querySelectorAll(".f");
  if (fl.length) {                                        // 還在翻的牌先收掉、字擺正，不然切換時會留下舊字
    fl.forEach(e => { e.getAnimations().forEach(a => a.cancel()); e.remove(); });
    flyTx(c.children[0], from); flyTx(c.children[1], from); c.classList.toggle("w", flyWide(from));
  }
  if (from === to) return;
  if (still || !canAnim() || document.hidden) { flyTx(c.children[0], to); flyTx(c.children[1], to); c.dataset.c = to; c.classList.toggle("w", flyWide(to)); return; }
  let seq = [to];
  const i = FLYCH.indexOf(from), j = FLYCH.indexOf(to);
  if (i >= 0 && j >= 0 && FLYN < 60) { seq = []; for (let k = (i + 1) % FLYCH.length; ; k = (k + 1) % FLYCH.length) { seq.push(FLYCH[k]); if (k === j) break; } seq = seq.slice(-2); }   // 照字母順序翻過去（只翻最後幾張）
  FLYN++;
  try {
    if (delay) await sleep(delay);
    for (const ch of seq) { if (c._tok !== tok) return; await flyOnce(c, c.dataset.c, ch, tok); }
  } finally { FLYN--; }
}
/* 整排翻牌：每格依序晚一點點開始，像真的看板一格一格翻；不在畫面上的（still）直接換字 */
function flapSet(el, v, delay = 0, still = false){
  if (!el) return;
  const cs = [...el.children], want = flyPad(v, cs.length);
  cs.forEach((c, i) => { if (c.dataset.c !== want[i] || c._tok) flyFlip(c, want[i], delay + i * T.fast * .12, still); });
}
const FLYFMT = {};                                         // 每個時區的時間格式只建一次（每次都建很慢）
const flyHM = (t, tz) => { const k = tz || "";
  if (!FLYFMT[k]) { try { FLYFMT[k] = new Intl.DateTimeFormat("zh-TW", {hour:"2-digit", minute:"2-digit", hourCycle:"h23", timeZone: tz || undefined}); } catch(e) { FLYFMT[k] = new Intl.DateTimeFormat("zh-TW", {hour:"2-digit", minute:"2-digit", hourCycle:"h23"}); } }
  return FLYFMT[k].format(t); };
const FLYDEP = {};                                        // 每架飛機估出來的起飛時間（第一次看到就固定，不會一直跳）
const flyOut = p => p.io ? p.io === "dep" : !!(p.dst && FLYD && FLYD.ap && p.dst.code !== FLYD.ap.code);   // 機坪上這架是要飛走的（不是剛降落）
const flyGo = (p, tab) => tab === "gnd" ? flyOut(p) : tab === "cargo" ? p.ph === "dep" || p.ph === "gnd" && flyOut(p) : false;   // 機坪、貨機：算在「起飛」那一段
const flyPl = (p, tab) => tab === "cargo" ? flyPl(p, p.ph === "gnd" ? "gnd" : p.ph) : tab === "arr" ? p.org : tab === "dep" ? p.dst : flyOut(p) ? p.dst : p.org;   // 這一列要寫的地方（從哪來／去哪）
const flyPk = pl => pl ? pl.code || pl.name || "" : "";
const FLYNOFL = new Set();                                 // 抓不到的國旗
const flyCc = pl => { const c = pl && FLYD && FLYD.ccs && FLYD.ccs[pl.code]; return c && c !== "TW" && !FLYNOFL.has(c) ? c : ""; };   // 國內的不放國旗
const flyFlag = c => c ? `<img class="flg" alt="" data-c="${c}" src="/api/fly-logo?k=@${c}">` : "";
const flyFlagAt = c => c ? flyFlag(c).replace('class="flg"', 'class="flg at"') : `<i class="flg at none"></i>`;   // 清單裡：國旗放在名字前面、沒有國旗也留位置，名字才會對齊
const FLYNARROW = matchMedia("(max-width:899px)");      // 手機：換機型只寫新的（標籤寫了換機型，點開看原本的），地名才不會被擠掉
/* 一列看板的內容：時間、航班、從哪來／去哪、航空公司、機型、註冊號、狀態 */
const flyDone = p => /已到|已飛/.test(p.st || "");
/* 手機：太長的航空公司名稱換成常見的簡稱（放不下會被切掉） */
const FLYALS = {"荷蘭皇家航空":"荷航", "泰國獅子航空":"泰獅航", "中國國際航空":"國航", "菲律賓亞洲航空":"菲亞航", "泰國亞洲航空":"泰亞航", "印尼亞洲航空":"印尼亞航",
  "泰國越捷航空":"泰越捷", "泰國全亞洲航空":"泰亞航X", "馬來西亞航空":"馬航", "北海道國際航空":"北海道航空", "衣索比亞航空":"衣航", "日本越洋航空":"日本越洋",
  "日本貨物航空":"日貨航", "中國郵政航空":"郵政航空", "太陽富國航空":"太陽富國"};   // 台灣新聞、機場看板常用的叫法；其他超過 5 個字的拿掉「航空」
const flyAlShort = a => FLYALS[a] || (a.length > 5 ? a.replace(/航空$/, "") : a);
function flyRowV(p, tab, tz){
  if (!p) return {t:"", fn:"", pc:"", pl:"", al:"", m:"", reg:"", st:"", cls:""};
  let t = "";
  if (p.fids && tab !== "gnd") t = flyHM((p.est || p.sch) * 1000, tz);
  else if ((tab === "arr" || tab === "cargo" && p.ph === "arr") && p.eta != null) t = flyHM(Date.now() + p.eta * 60e3, tz);
  else if (tab === "dep") { if (!FLYDEP[p.id]) FLYDEP[p.id] = Date.now() - (p.spd > 50 ? p.d / p.spd * 3600e3 : 0); t = flyHM(FLYDEP[p.id], tz); }
  const pl = flyPl(p, tab);
  const done = flyDone(p);
  const mch = !!(!done && p.fids && tab !== "gnd" && p.type0 && (p.model || p.t) && p.st !== "取消");   // 換機型
  const gap = !done && p.fids && tab !== "gnd" && p.sch && p.st !== "取消" ? Math.round(((p.lag ? Date.now() / 1000 : p.est || p.sch) - p.sch) / 60) : 0;   // 比表定晚（正）或早（負）幾分鐘；過了時間還沒到的算到現在
  const soon = p.fids && tab !== "gnd" && !p.lag && !/取消|轉降|已到|已飛/.test(p.st || "") ? Math.ceil(((p.est || p.sch) - Date.now() / 1000) / 60) : 0;   // 一小時內要到／要飛：還有幾分
  return {t, fn: p.fn || p.reg, pc: pl ? pl.code : "", pl: pl ? pl.name || "" : "", al: FLYNARROW.matches ? flyAlShort(p.al || "") : p.al || "", m: p.model || p.t || "", mch, reg: (FLYD.fids && flyFT(tab) ? p.gate : p.reg) || "", st: p.st, gch: !!(!done && FLYD.fids && flyFT(tab) && p.gate0 && p.gate && p.st !== "取消"),
    cls: p.emg || /取消|轉降/.test(p.st) ? "bad" : /落地|剛起飛|跑道|登機|滑行/.test(p.st) ? "hot" : "", late: gap >= 15 ? gap : 0, early: gap <= -10 ? -gap : 0,
    soon: soon > 0 && soon <= 60 ? soon : 0, cc: flyCc(pl), gout: flyGo(p, tab), sh: p.share && p.share.length ? `+${p.share.length}` : "", bx: p.fids && tab !== "gnd" && p.st !== "取消" ? p.bx || "" : ""};
}
const flyRight = (v, n) => " ".repeat(Math.max(0, n - [...(v || "")].length)) + (v || "");   // 狀態靠右
const flyMin = m => m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ""}` : `${m} 分`;
/* 捲動看板：一列一列浮現（一開始就在畫面上的不動） */
function flyObs(f){
  if (f._io || !window.IntersectionObserver) return f._io;
  return f._io = new IntersectionObserver(es => {
    let k = 0;
    es.forEach(e => {
      const r = e.target; r.classList.toggle("vis", e.isIntersecting);
      if (!e.isIntersecting) { r._out = 1; return; }
      flyBeat(r);                                            // 捲進畫面的列：閃框對回同一個節拍
      const go = r._out && !r.hidden && !r.classList.contains("empty") && canAnim() && !r.getAnimations().length && !f.querySelector(".board.wait") && scrolling();   // 只有手指捲進來的才浮現（自動更新、切換時列被擠進畫面不算）
      r._out = 0;
      if (go) r.animate([{opacity:0, transform:"translateY(16px)"}, {opacity:1, transform:"none"}], {duration:T.mid, delay:Math.min(k++, 6) * T.fast * .3, easing:EASE, fill:"backwards"});
    });
  }, {root: f.querySelector(".fscroll")});
}
/* 航空公司標誌：航班號前兩碼（BR、CI、5J）認得的航空公司，抓公開的標誌圖（只有標誌、不含字）；不認得或抓不到就留著代碼小方塊 */
const FLYNOLG = new Set();
const flyLgOk = c => !FLYNOLG.has(c) && !!(FLYD && FLYD.als && FLYD.als.includes(c));
const flyAl = fn => { const m = /^([A-Z0-9]{2})\d/.exec(fn || ""); return m && /[A-Z]/.test(m[1]) ? m[1] : ""; };
const flyLogo = (c, cls = "") => { if (!c) return ""; const ft = FLYFIT[c];    // 已經量過的標誌：直接用量好的樣子，不會先白底再跳
  return ft ? `<i class="alg ok ${ft.cls} ${cls}" data-c="${c}"${ft.bg ? ` style="background:${ft.bg}"` : ""}>${c}<img alt="" src="${ft.src}"></i>`
    : `<i class="alg ${cls}" data-c="${c}">${c}${flyLgOk(c) ? `<img alt="" loading="lazy" src="/api/fly-logo?k=${c}&v=${FLYD.lgv || ""}">` : ""}</i>`; };
/* 航空公司標誌（主機存好的，同一個網站才讀得到顏色）：本身是方形色塊的，裁掉白邊、整格填滿它的顏色；碰到四個角的縮小一點，圓角才不會切到 */
const FLYFIT = {};
function flyFit(img){
  const t = img.parentNode, c = t && t.dataset.c; if (!c || FLYFIT[c] || img.src.startsWith("data:")) return;
  try {
    const n = 48, w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return;
    const cv = document.createElement("canvas"); cv.width = cv.height = n;
    const g = cv.getContext("2d", {willReadFrequently: true}), k = Math.min(n / w, n / h), ox = (n - w * k) / 2, oy = (n - h * k) / 2;
    g.drawImage(img, ox, oy, w * k, h * k);
    const d = g.getImageData(0, 0, n, n).data, px = (x, y) => [...d.subarray((y * n + x) * 4, (y * n + x) * 4 + 4)];
    const wh = p => p[0] > 235 && p[1] > 235 && p[2] > 235, ink = p => p[3] > 200 && !wh(p);
    let x0 = n, y0 = n, x1 = -1, y1 = -1;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const p = px(x, y); if (p[3] > 24 && !wh(p)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
    if (x1 - x0 < 4 || y1 - y0 < 4) return;
    const cs = [px(x0 + 1, y0 + 1), px(x1 - 1, y0 + 1), px(x0 + 1, y1 - 1), px(x1 - 1, y1 - 1)], bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const tile = cs.every(p => ink(p) && Math.abs(p[0] - cs[0][0]) + Math.abs(p[1] - cs[0][1]) + Math.abs(p[2] - cs[0][2]) < 60) && Math.abs(bw - bh) < n * .15;
    let ft = {cls: "", bg: "", src: img.src};
    if (tile) {
      const s = 1 / k, cc = document.createElement("canvas"); cc.width = Math.max(1, Math.round(bw * s)); cc.height = Math.max(1, Math.round(bh * s));
      cc.getContext("2d").drawImage(img, (x0 - ox) * s, (y0 - oy) * s, bw * s, bh * s, 0, 0, cc.width, cc.height);
      ft = {cls: "fill", bg: `rgb(${cs[0][0]},${cs[0][1]},${cs[0][2]})`, src: cc.toDataURL()};
    } else if ([px(2, 2), px(n - 3, 2), px(2, n - 3), px(n - 3, n - 3)].some(ink)) ft.cls = "pad";
    FLYFIT[c] = ft;
    document.querySelectorAll(`.alg[data-c="${c}"]`).forEach(e => { if (ft.cls) e.classList.add(ft.cls); if (ft.bg) e.style.background = ft.bg; const im = e.querySelector("img"); if (im && im.src !== ft.src) im.src = ft.src; });
  } catch(e) {}
}
function flyLogoSet(el, c){   // 換了航空公司，或主機剛抓到這家的標誌：換上去
  if (el.dataset.c === (c || "") && !(c && flyLgOk(c) && !el.querySelector("img"))) return;
  el.dataset.c = c || ""; el.outerHTML = c ? flyLogo(c) : `<i class="alg none" data-c=""></i>`; }
document.addEventListener("load", e => { const t = e.target; if (t.tagName !== "IMG" || !t.parentNode) return;
  if (t.parentNode.classList.contains("alg")) { flyFit(t); t.parentNode.classList.add("ok"); }
  if (t.parentNode.classList.contains("faplg")) t.parentNode.classList.add("ok");
  if (t.classList.contains("flg")) t.classList.add("ok"); }, true);
document.addEventListener("error", e => { const t = e.target; if (t.tagName === "IMG" && t.parentNode && t.parentNode.classList.contains("faplg")) t.remove();
  if (t.tagName === "IMG" && t.classList.contains("flg")) { if (t.dataset.c) FLYNOFL.add(t.dataset.c); t.hidden = true; }
  if (t.tagName === "IMG" && t.parentNode && t.parentNode.classList.contains("alg")) { FLYNOLG.add(t.parentNode.dataset.c); t.remove(); } }, true);
const FLYF = ["t", "fn", "pc", "st"], FLYX = ["pl", "al", "m", "reg", "bx"];   // 翻牌的欄位／一般文字的欄位（城市、航空公司、機型、註冊號用一般字比較好讀）
const FLYW = {t:5, fn:7, pc:3, st:4};             // 狀態最多四個中文字，每格都是中文字寬，長短不一也對齊
const FLYCOL = ["t", "fn", "pc", "pl", "fal", "al", "m", "reg", "bx", "st"];   // fal：航空公司標誌自己一欄，每列都對齊
const FLYHEAD = {arr:["預計抵達", "航班", "出發地", "", "", "航空公司", "機型", "註冊號", "", "狀態"],
  dep:["起飛", "航班", "目的地", "", "", "航空公司", "機型", "註冊號", "", "狀態"], gnd:["", "航班", "從哪來／去哪", "", "", "航空公司", "機型", "註冊號", "", "狀態"],
  cargo:["時間", "航班", "從哪來／去哪", "", "", "航空公司", "機型", "註冊號", "", "狀態"]};
const FLYHEADF = {arr:["抵達", "航班", "出發地", "", "", "航空公司", "機型", "登機門", "行李", "狀態"], dep:["起飛", "航班", "目的地", "", "", "航空公司", "機型", "登機門", "報到", "狀態"]};   // 有機場官網航班表時
const flyRow = i => `<div class="fr" data-i="${i}" role="button" tabindex="0">${FLYCOL.map(k => `<span class="fk ${k}">${FLYW[k] ? flap("", FLYW[k], k === "st" ? "zh" : "") + (k === "fn" ? `<span class="fsh"></span>` : "") : k === "fal" ? `<i class="alg none" data-c=""></i>` : k === "pl" ? `<img class="flg at" alt="" hidden><span class="plt"></span>` : ""}</span>`).join("")}<span class="ftag"></span><i class="br b1"></i><i class="br b2"></i></div>`;
function flyShell(){
  return `<div class="flyv" id="fly"><div class="fscroll"><div class="fwrap">
    <div class="ftop">${SHARE ? `<span class="fexp sub" data-k="left"></span>` : `<button class="icbtn" data-fback title="返回">${I("back")}</button>`}<span class="grow"></span>
      ${SHARE ? "" : `<button class="fchip fap" data-fshare>${I("share")}<span>分享</span></button>`}<button class="fchip fap fapb" data-fpick title="換機場">${flyApLg("")}<span class="fapn"></span>${I("chev").replace("<svg", '<svg class="chv"')}</button></div>
    <div class="fhead"><div class="fcode">${flap("", 3, "xl")}</div><div class="fname"><b data-k="name"></b><span class="sub" data-k="city"></span></div>
      <div class="fclock"><span class="sub">當地時間</span>${flap("", 5, "lg")}</div></div>
    <div class="fmain"><div class="fleft">
      <div class="seg ftabs" data-slide>${FLYTAB.map(([k, l]) => `<button class="${FLYS.tab === k ? "on" : ""}" data-ftab="${k}">${l}<span class="fn" data-k="n-${k}"></span></button>`).join("")}</div>
      <div class="fterm" data-slide hidden></div><div class="fhrs" data-slide hidden></div><div class="fsum sub" hidden></div>
      <div class="board"><div class="fh">${FLYCOL.map(k => `<span class="fk ${k}"></span>`).join("")}</div><button class="fdone" data-fdone hidden><span></span>${I("chev").replace("<svg", '<svg class="chv"')}</button><div class="frows"></div><div class="fmsg sub" hidden></div><div class="fload"><i></i></div></div></div>
      <div class="radar"><div class="rbox"><canvas class="rcv" aria-label="雷達"></canvas><i class="rsweep"></i><button class="icbtn rfull" data-rfull title="整頁雷達">${I("full")}</button></div>
        <div class="rnote sub" hidden></div>
        <div class="rwx" hidden></div>
        <div class="rleg"><span><i class="arr"></i>抵達<b data-k="rc-arr"></b></span><span><i class="dep"></i>出發<b data-k="rc-dep"></b></span><span><i></i>機坪<b data-k="rc-gnd"></b></span><span><i></i>路過<b data-k="rc-over"></b></span>
          <span class="ralt">尾跡高度<i></i>1000<i></i>3000<i></i>6000<i></i>公尺</span><span class="rng fzm">${FLYZM.map(k => `<button data-fzm="${k}">${k}</button>`).join("")}</span></div></div>
    </div>
    <div class="ffoot sub"></div></div></div>${flySplash()}</div>`;
}
/* 第一次打開、資料還沒到：一架小飛機沿著虛線航線飛過去，下面翻出機場代碼 */
const FLYARC = "M14 76 Q110 -14 206 76";
const flySplash = () => `<div class="fsplash" aria-hidden="true"><div class="fsp">
    <svg viewBox="0 0 220 90" width="220" height="90"><defs><mask id="fspm"><path class="fspr" d="${FLYARC}" pathLength="1"/></mask></defs>
      <path class="fsd0" d="${FLYARC}"/><path class="fsd" d="${FLYARC}" mask="url(#fspm)"/><circle cx="14" cy="76" r="4"/><circle cx="206" cy="76" r="4"/></svg>
    <i class="fspl">${I("plane")}</i></div>
  <div class="fspc">${flap("", 3, "xl")}</div><div class="fspn sub"></div></div>`;
function flySplashOn(f){
  if (!canAnim()) return f.querySelector(".fsplash").remove();
  f.classList.add("splash"); f._sp0 = performance.now(); flyApBtn(f, {code: FLYS.ap});
  setTimeout(() => { if (f.classList.contains("splash")) { flapSet(f.querySelector(".fspc .sf"), FLYS.ap); txt(f.querySelector(".fspn"), FLYS.name || ""); } }, T.mid);
}
/* 資料到了：載入畫面淡掉，上面到下面一塊一塊浮上來（至少讓飛機飛一段，不會一閃就不見） */
function flySplashOff(f){
  if (!f.classList.contains("splash") || f._spOff) return;
  f._spOff = 1;
  setTimeout(() => {
    const sp = f.querySelector(".fsplash");
    sp.animate([{opacity:1}, {opacity:0, transform:"scale(1.04)"}], {duration:T.mid, easing:EXIT, fill:"forwards"}).finished.then(() => sp.remove(), () => sp.remove());
    f.classList.remove("splash");
    [...f.querySelectorAll(".fwrap>:not(.ftop), .fmain>*")].filter(e => !e.classList.contains("fmain")).forEach((e, i) =>
      e.animate([{opacity:0, transform:"translateY(16px)"}, {opacity:1, transform:"none"}], {duration:T.slow, delay:T.fast * .5 + i * T.fast * .35, easing:EASE, fill:"backwards"}));
  }, Math.max(0, T.long * 2 - (performance.now() - f._sp0)));
}
const FLYZM = [60, 30, 15], FLYGEO = {};                  // 雷達看多遠（公里）；底圖（海岸線、地名）每個機場抓一次
const flyR = () => FLYZM.includes(+FLYS.zm) ? +FLYS.zm : 60;
const FLYPL = new Path2D("M0-3.4.55-1.3 3.2.3v.65L.55.25.42 2.1 1.4 2.8v.4L0 2.8-1.4 3.2v-.4l.98-.7-.13-1.85L-3.2.95V.3L-.55-1.3Z");
/* 各種機型的樣子（機頭朝上）：機身長 L、寬 w，機翼展開 S、往後掠 sw、翼根／翼尖寬 c／ct，尾翼展開 T，引擎位置 e，螺旋槳 pr */
function flyShape(o){
  const p = new Path2D(), {L, w, S, sw = 0, c, ct, wy = 0, T: tS, e = [], er = [.24, .5], pr = []} = o;
  p.ellipse(0, 0, w / 2, L / 2, 0, 0, Math.PI * 2);
  const poly = (k, pts) => { (k < 0 ? pts.slice().reverse() : pts).forEach(([x, y], i) => i ? p.lineTo(k * x, y) : p.moveTo(k * x, y)); p.closePath(); };   // 左右都順時針，疊在機身上才不會變成洞
  const ty = L / 2 - c * .55;                                 // 水平尾翼的位置
  [-1, 1].forEach(k => {
    poly(k, [[w * .4, wy - c / 2], [S / 2, wy + sw - ct / 2], [S / 2, wy + sw + ct / 2], [w * .4, wy + c / 2]]);
    poly(k, [[w * .3, ty - c * .3], [tS / 2, ty + sw * .3], [tS / 2, ty + sw * .3 + ct * .7], [w * .3, ty + c * .3]]);
  });
  e.forEach(([x, y]) => [-1, 1].forEach(k => { p.moveTo(k * x + er[0], y); p.ellipse(k * x, y, er[0], er[1], 0, 0, Math.PI * 2); }));
  pr.forEach(([x, y, r]) => [-1, 1].forEach(k => { if (!x && k > 0) return; p.rect(k * x - r, y - .06, r * 2, .12); }));
  return p;
}
function flyHeli(){
  const p = new Path2D();
  p.ellipse(0, -.4, .55, 1.1, 0, 0, Math.PI * 2); p.rect(-.12, .4, .24, 2.3); p.rect(-.5, 2.5, 1, .18);
  [45, -45].forEach(a => { const b = new Path2D(); b.rect(-2.8, -.14, 5.6, .28); p.addPath(b, new DOMMatrix().translate(0, -.4).rotate(a)); });   // 主旋翼
  return p;
}
const FLYSH = {
  q4: flyShape({L:8.2, w:1.05, S:8, sw:1.8, c:2, ct:.45, wy:-.4, T:3, e:[[1.45, -.85], [2.65, -.25]], er:[.27, .55]}),
  wb: flyShape({L:7.6, w:1, S:7.4, sw:1.6, c:1.9, ct:.45, wy:-.3, T:2.8, e:[[1.6, -.72]], er:[.34, .66]}),
  nb: flyShape({L:6.4, w:.75, S:6, sw:1.25, c:1.5, ct:.4, wy:-.2, T:2.3, e:[[1.3, -.55]], er:[.25, .5]}),
  tp: flyShape({L:5.4, w:.62, S:6.4, sw:0, c:.8, ct:.5, wy:-.6, T:2, e:[[1.35, -.8]], er:[.2, .55], pr:[[1.35, -1.38, .75]]}),
  ga: flyShape({L:4, w:.5, S:4.8, sw:0, c:.7, ct:.5, wy:-.5, T:1.6, pr:[[0, -2.02, .65]]}),
  heli: flyHeli(),
};
/* 曲線（跟 CSS 的 cubic-bezier 一樣），畫布上的動畫用 */
function bez(x1, y1, x2, y2){
  const f = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; f(x1, x2, t) < x ? lo = t : hi = t; } return f(y1, y2, t); };
}
const EASEF = bez(.2, 0, 0, 1);
/* 雷達：地圖、尾跡、飛機、名字全部畫在一張畫布上（幾百個小方塊各自動畫在手機上會卡）；
   飛機在兩次更新之間照時間慢慢移過去；mini 是看板旁邊的圓形雷達，full 是點進去的整頁雷達 */
function radarView(cv, full){
  const ctx = cv.getContext("2d"), pl = new Map(), V = {cx:0, cy:0, s:1}, A = {};
  const R = {cv, full, pl, sel:"", only:"", geo:null, ga:0, gt:0, range:60, W:0, H:0, dpr:1, raf:0, last:0, busy:0, off:false};
  let col = {}, font = "", fs = 12;
  const now = () => performance.now();
  /* 顏色、字型跟著主題（每次有新資料時重讀，換深淺模式也會跟上） */
  R.theme = () => {
    const pr = document.createElement("i"); pr.style.cssText = "position:absolute;visibility:hidden"; cv.parentNode.appendChild(pr);
    const c = v => { pr.style.color = `var(${v})`; return getComputedStyle(pr).color; };
    col = {p:c("--p"), tx:c("--tx"), tx2:c("--tx2"), tx3:c("--tx3"), s2:c("--s2"), s3:c("--s3"), s4:c("--s4"), bad:c("--bad"), card:c("--card"), alt:[0, 1, 2, 3].map(i => c(`--alt${i}`))};
    pr.style.fontSize = "var(--fs-xs)"; fs = parseFloat(getComputedStyle(pr).fontSize) || 12;
    font = getComputedStyle(cv).fontFamily; pr.remove();
  };
  R.resize = () => {
    const r = cv.getBoundingClientRect(), z = ZM(), w = r.width / z, h = r.height / z;
    if (!w || !h) return;
    R.dpr = Math.min(3, devicePixelRatio || 1) * z; R.W = w; R.H = h;
    cv.width = Math.round(w * R.dpr); cv.height = Math.round(h * R.dpr);
    if (!full) { V.s = R.fit(R.range); V.cx = V.cy = 0; }
    R.kick();
  };
  R.fit = r => Math.min(R.W, R.H) / 2 * (full ? .92 : 61 / 62) / r;   // 半徑 r 公里剛好放進畫面
  /* 視角：中心（公里）和比例（每公里幾點）；anim 時慢慢移過去 */
  R.view = (cx, cy, s, anim) => {
    if (anim && canAnim()) Object.assign(A, {t:now(), d:T.mid, a:{...V}, b:{cx, cy, s}});
    else { A.t = 0; Object.assign(V, {cx, cy, s}); }
    R.kick();
  };
  R.V = V;
  R.zoom = (r, anim) => { R.range = r; if (!full) R.view(0, 0, R.fit(r), anim); };
  R.setGeo = g => { if (R.geo === g) return; R.geo = g; R.gp = g && new Path2D(g.coast); R.gf = g && g.far ? new Path2D(g.far) : null; R.ga = 0; R.gt = now(); R.kick(); };
  /* 新資料：每架飛機從現在畫的位置，花一次更新的時間慢慢移到新的位置 */
  R.setData = list => {
    const t = now(), seen = new Set();
    R.theme();
    list.forEach(p => {
      if (p.x == null || seen.has(p.id)) return;
      seen.add(p.id);
      let o = pl.get(p.id);
      if (!o) { o = {id:p.id, x0:p.x, y0:p.y, x1:p.x, y1:p.y, t0:t, a:pl.size && canAnim() ? 0 : 1, h:[]}; pl.set(p.id, o); }
      else {
        const [x, y] = R.at(o, t), far = Math.hypot(p.x - x, p.y - y) > 8;
        Object.assign(o, far ? {x0:p.x, y0:p.y} : {x0:x, y0:y}); o.t0 = t;
      }
      o.x1 = p.x; o.y1 = p.y; o.p = p; o.gone = false;
      const l = o.h[o.h.length - 1];
      if (p.ph !== "gnd" && (!l || l[0] !== p.x || l[1] !== p.y)) { o.h.push([p.x, p.y, p.alt]); if (o.h.length > 18) o.h.shift(); }
    });
    pl.forEach(o => { if (!seen.has(o.id)) o.gone = true; });
    R.kick();
  };
  R.at = (o, t) => { const k = canAnim() ? Math.min(1, (t - o.t0) / FLYEV) : 1; return [o.x0 + (o.x1 - o.x0) * k, o.y0 + (o.y1 - o.y0) * k]; };
  R.xy = (x, y) => [R.W / 2 + (x - V.cx) * V.s, R.H / 2 - (y - V.cy) * V.s];   // 公里 → 畫面上的點
  R.km = (sx, sy) => [V.cx + (sx - R.W / 2) / V.s, V.cy - (sy - R.H / 2) / V.s];
  const want = o => !o.gone && (!R.only || o.p.ph === R.only || (R.only === "arr" && o.p.emg && o.p.ph === "arr"));
  /* 點一下：找最近的飛機 */
  R.hit = (sx, sy) => {
    let best = null, bd = 22;
    pl.forEach(o => { if (!o.vis) return; const d = Math.hypot(o.sx - sx, o.sy - sy); if (d < bd) { bd = d; best = o; } });
    return best && best.p;
  };
  R.kick = () => { if (!R.raf && !R.off) { clearTimeout(R.tm); R.tm = 0; R.raf = requestAnimationFrame(R.frame); } };
  R.stop = () => { cancelAnimationFrame(R.raf); clearTimeout(R.tm); R.raf = R.tm = 0; R.off = true; };
  R.frame = t => {
    R.raf = 0;
    if (R.off || !cv.isConnected) return;
    if (document.hidden) return;
    const fading = o => o.gone || (o.on === false ? o.a > 0 : o.a < 1);   // 正在淡入淡出（雷達圈外的飛機一直是透明的，不算）
    const moving = A.t || R.busy || [...pl.values()].some(o => fading(o) || t - o.t0 < FLYEV) || t - R.gt < T.mid;
    const fade = R.busy || [...pl.values()].some(fading) || t - R.gt < T.mid;
    let v = 0;                                              // 小雷達：照飛機在畫面上移動的快慢決定多久畫一次（移不到一點就不用重畫）
    if (!fade && !full) pl.forEach(o => { if (o.vis && t - o.t0 < FLYEV) v = Math.max(v, Math.hypot(o.x1 - o.x0, o.y1 - o.y0)); });
    const gap = A.t || R.busy ? 0 : t < FLYHUSH ? T.mid : fade || full ? 30 : Math.min(250, Math.max(33, .7 * FLYEV / (v * V.s || 1e-6)));   // 看板切換時先讓給切換動畫
    if (gap && t - R.last < gap && moving) { R.tm = setTimeout(R.kick, gap - (t - R.last)); return; }   // 等的時候不佔每一格畫面（一直要畫面會讓整頁的動畫都跟著在主執行緒算）
    R.last = t;
    R.draw(t);
    if (moving) R.raf = requestAnimationFrame(R.frame);
  };
  R.draw = t => {
    if (!R.W) return;
    if (A.t) {                                              // 視角動畫：比例照倍數變，看起來才像等速放大
      const k = EASEF(Math.min(1, (t - A.t) / A.d));
      V.cx = A.a.cx + (A.b.cx - A.a.cx) * k; V.cy = A.a.cy + (A.b.cy - A.a.cy) * k; V.s = A.a.s * Math.pow(A.b.s / A.a.s, k);
      if (k >= 1) A.t = 0;
    }
    if (!col.p) R.theme();                                  // 還沒拿到資料前就要畫（例如先載入底圖）
    const W = R.W, H = R.H, s = V.s, dt = Math.min(64, t - (R.ft || t)); R.ft = t;
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const [ox, oy] = R.xy(0, 0), rr = Math.min(W, H) / 2 * 61 / 62;
    ctx.save();
    if (!full) { ctx.beginPath(); ctx.arc(W / 2, H / 2, rr, 0, Math.PI * 2); ctx.clip(); }
    /* 地圖 */
    const ga = R.geo ? Math.min(1, (t - R.gt) / T.mid) : 0;
    if (R.geo && R.gp) {
      ctx.save(); ctx.globalAlpha = canAnim() ? ga : 1;
      ctx.translate(W / 2 - V.cx * s, H / 2 + V.cy * s); ctx.scale(s, s);
      ctx.lineWidth = 1 / s;
      if (R.gf) { const ba = ctx.globalAlpha; ctx.globalAlpha = ba * .55; ctx.fillStyle = col.s2; ctx.fill(R.gf); ctx.strokeStyle = col.s4; ctx.stroke(R.gf); ctx.globalAlpha = ba; }   // 台灣以外的陸地：淡淡的
      ctx.fillStyle = col.s2; ctx.fill(R.gp); ctx.strokeStyle = col.s4; ctx.stroke(R.gp);
      ctx.lineCap = "round"; ctx.strokeStyle = col.tx3; ctx.lineWidth = (full ? 3 : 2.2) / s;
      ctx.beginPath(); (R.geo.rwy || []).forEach(([a, b, c, d]) => { ctx.moveTo(a, -b); ctx.lineTo(c, -d); }); ctx.stroke();
      ctx.restore();
    }
    /* 現在用的跑道：進場那一頭往外畫一條虛線（飛機排隊降落的路線） */
    if (R.geo && R.rwd != null) {
      const hd = R.rwd * Math.PI / 180, ux = Math.sin(hd), uy = Math.cos(hd);
      ctx.save(); ctx.globalAlpha = (canAnim() ? ga : 1) * .55; ctx.strokeStyle = col.p; ctx.lineWidth = full ? 1.6 : 1.2; ctx.setLineDash([6, 5]);
      ctx.beginPath();
      (R.geo.rwy || []).forEach(([a, b, c, d]) => {
        if (Math.hypot((a + c) / 2, (b + d) / 2) > 4) return;   // 只畫這個機場的跑道
        const [x, y] = a * ux + b * uy < c * ux + d * uy ? [a, b] : [c, d];   // 降落那一頭
        ctx.moveTo(...R.xy(x, y)); ctx.lineTo(...R.xy(x - ux * 18, y - uy * 18));
      });
      ctx.stroke(); ctx.restore();
    }
    /* 距離圈：整頁的照比例挑好讀的距離；小雷達固定三圈 */
    ctx.strokeStyle = col.s4; ctx.lineWidth = 1; ctx.fillStyle = col.tx3; ctx.font = `${Math.round(fs * (full ? 1 : .85))}px ${font}`;
    const rings = full ? flyRings(Math.max(W, H) / s / 2) : [1, 2, 3].map(i => R.range * i / 3);
    const rb = [];                                          // 距離字的位置，飛機名字要避開
    rings.forEach((km, i) => {
      const r = km * s; if (r < 8) return;
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.stroke();
      const lx = ox + r * .7071 + 3, ly = oy - r * .7071, tx = km + (full || i === 2 ? " 公里" : "");
      if (full && ly < (R.top || 0) + fs) return;           // 被上面的按鈕擋住就不寫
      ctx.fillText(tx, lx, ly); rb.push([lx, ly - fs, lx + ctx.measureText(tx).width, ly + 2]);
    });
    ctx.setLineDash([2, 3]); ctx.beginPath();
    if (full) { ctx.moveTo(ox - 8, oy); ctx.lineTo(ox + 8, oy); ctx.moveTo(ox, oy - 8); ctx.lineTo(ox, oy + 8); }
    else { ctx.moveTo(W / 2 - rr, H / 2); ctx.lineTo(W / 2 + rr, H / 2); ctx.moveTo(W / 2, H / 2 - rr); ctx.lineTo(W / 2, H / 2 + rr); }
    ctx.stroke(); ctx.setLineDash([]);
    if (!full) { ctx.textAlign = "center"; ctx.fillText("北", W / 2, H / 2 - rr + fs); ctx.textAlign = "left"; }
    /* 掃描：畫在上面那層 .rsweep（只是轉動，不用每格重畫整張雷達） */
    /* 地名、其他機場 */
    const tw = [];
    if (R.geo) {
      ctx.globalAlpha = (canAnim() ? ga : 1) * .8; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = col.tx3;
      ctx.font = `${Math.round(fs * (full ? 1 : .9))}px ${font}`;
      const tier = full ? (s > 9 ? 2 : 1) : 1;
      R.geo.towns.forEach(([n, x, y, lv]) => {                // 地名等飛機名字放好之後再寫，跟名字撞到的先不寫
        if ((lv || 1) > tier || (R.geo.aps || []).some(a => Math.hypot(a[2] - x, a[3] - y) < 6)) return;   // 跟機場名字疊在一起的地名不放
        const [sx, sy] = R.xy(x, y);
        if (!full && Math.hypot(sx - W / 2, sy - H / 2) > rr - fs) return;
        if (sx < -40 || sx > W + 40 || sy < -20 || sy > H + 20) return;
        tw.push([n, sx, sy, lv]);
      });
      ctx.fillStyle = col.tx2; ctx.font = `600 ${Math.round(fs * (full ? 1 : .85))}px ${font}`;
      (R.geo.aps || []).forEach(([c, n, x, y]) => {
        const [sx, sy] = R.xy(x, y);
        if (!full && Math.hypot(sx - W / 2, sy - H / 2) > rr - fs) return;
        if (full && sy < (R.top || 0) + fs) return;
        const t = full ? n : n.replace("機場", ""), w = ctx.measureText(t).width;
        ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(t, sx, sy + fs); rb.push([sx - w / 2, sy - 4, sx + w / 2, sy + fs * 1.6]);   // 飛機名字也要避開機場名字
      });
      ctx.globalAlpha = 1; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
    ctx.beginPath(); ctx.arc(ox, oy, full ? 4 : 3, 0, Math.PI * 2); ctx.fillStyle = col.p; ctx.fill();
    /* 飛機：先算位置、透明度 */
    const vis = [], step = canAnim() ? dt / T.mid : 1;
    pl.forEach(o => {
      const on = want(o) && (full || Math.hypot(...R.at(o, t)) * s <= rr);
      o.a = on ? Math.min(1, o.a + step) : Math.max(0, o.a - step); o.on = on;
      if (o.gone && o.a <= 0) { pl.delete(o.id); return; }
      const [x, y] = R.at(o, t), [sx, sy] = R.xy(x, y);
      o.sx = sx; o.sy = sy; o.x = x; o.y = y; o.vis = o.a > .3 && sx > -20 && sx < W + 20 && sy > -20 && sy < H + 20;
      if (o.a > 0) vis.push(o);
    });
    const pc = o => o.p.emg ? col.bad : o.p.ph === "arr" ? col.p : o.p.ph === "dep" ? col.tx : col.tx3;
    /* 尾跡：跟飛機同色、越舊越淡；路過的不畫；選到的那架照高度上色 */
    ctx.lineJoin = ctx.lineCap = "round";
    const ac = a => col.alt[a == null ? 0 : a < 1000 ? 0 : a < 3000 ? 1 : a < 6000 ? 2 : 3];   // 低的淺青、高的紫
    vis.forEach(o => {
      const sel = o.id === R.sel;
      if (!sel && o.p.ph === "over") return;
      if (o.h.length < 2 && !(o.h.length && o.p.ph !== "gnd")) return;
      const pts = [...o.h.slice(0, -1).map(([x, y, a]) => [...R.xy(x, y), a]), [o.sx, o.sy, o.p.alt]], n = pts.length - 1;
      const base = o.a * (sel ? 1 : R.sel && full ? .2 : .55);
      ctx.lineWidth = sel ? 2.4 : 1.1;
      if (!sel) ctx.strokeStyle = pc(o);
      for (let i = 1; i < pts.length; i++) {
        ctx.globalAlpha = base * (sel ? 1 : .15 + .85 * i / n);
        if (sel) ctx.strokeStyle = ac(pts[i - 1][2]);
        ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
      }
    });
    /* 機頭前面的短線：只畫選到的那架，一分鐘後會飛到哪 */
    const vo = R.sel && pl.get(R.sel);
    if (vo && vo.a > 0 && vo.p.ph !== "gnd" && vo.p.alt && vo.p.spd > 0) {
      const d = vo.p.spd / 60, hd = (vo.p.trk || 0) * Math.PI / 180, [ex, ey] = R.xy(vo.x + Math.sin(hd) * d, vo.y + Math.cos(hd) * d);
      ctx.globalAlpha = vo.a * .8; ctx.strokeStyle = pc(vo); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(vo.sx, vo.sy); ctx.lineTo(ex, ey); ctx.stroke();
    }
    /* 選到的抵達班機：虛線連到機場 */
    const so = R.sel && pl.get(R.sel);
    if (so && full && so.p.ph === "arr" && so.a > 0) {
      ctx.globalAlpha = so.a * .8; ctx.setLineDash([5, 5]); ctx.strokeStyle = col.p; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(so.sx, so.sy); ctx.lineTo(ox, oy); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();                                          // 名字可以超出圓圈一點點
    ctx.save();
    if (!full) { ctx.beginPath(); ctx.arc(W / 2, H / 2, rr + fs * 3, 0, Math.PI * 2); ctx.clip(); }
    const ps = full ? 2.9 : Math.min(2.6, Math.max(2, rr / 75));   // 飛機大小
    vis.forEach(o => {
      ctx.globalAlpha = o.a * (R.sel && full && o.id !== R.sel ? .55 : 1);
      ctx.save(); ctx.translate(o.sx, o.sy); ctx.rotate((o.p.trk || 0) * Math.PI / 180);
      const k = ps * (o.p.ph === "gnd" ? .6 : 1); ctx.scale(k, k);
      const sh = FLYSH[o.p.kind] || FLYPL;                   // 照機型畫：四發、廣體、窄體、螺旋槳、小飛機、直升機
      if (o.id === R.sel) { ctx.lineWidth = 1.4 / k * 1.6; ctx.strokeStyle = col.p; ctx.stroke(sh); }
      ctx.fillStyle = pc(o); ctx.fill(sh); ctx.restore();
    });
    /* 名字：擠在一起時換邊放，放不下先不顯示 */
    const lf = Math.round(full ? fs : Math.max(9, rr / 21)), lab = vis.filter(o => o.vis && (o.id === R.sel || o.p.emg || o.p.ph === "arr" || o.p.ph === "dep" || (full && o.p.ph === "over" && s > 3)));
    const used = flyPlace(ctx, lab, lf, ps * 3.4, full, font, R.sel, W, H, rb, R.top || 0);
    if (tw.length) {
      ctx.globalAlpha = (canAnim() ? ga : 1) * .8; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = col.tx3;
      ctx.font = `${Math.round(fs * (full ? 1 : .9))}px ${font}`;
      const pb = vis.filter(o => o.a > .3).map(o => [o.sx - ps * 3, o.sy - ps * 3, o.sx + ps * 3, o.sy + ps * 3]);
      const ta = ctx.globalAlpha, done = [];
      tw.forEach(([n, x, y, lv]) => {                       // 地名彼此也不重疊；台灣以外的字淡一點
        const w = ctx.measureText(n).width / 2, a = [x - w, y - fs * .6, x + w, y + fs * .6];
        if (full && y < (R.top || 0) + fs) return;
        if (a[0] < 2 || a[2] > W - 2 || [...used, ...pb, ...done].some(b => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1])) return;
        ctx.globalAlpha = ta * (lv === 0 ? .6 : 1); ctx.fillText(n, x, y); done.push(a);
      });
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
    lab.forEach(o => {
      if (!o.lp) return;
      ctx.globalAlpha = o.a * (R.sel && full && o.id !== R.sel ? .6 : 1);
      ctx.fillStyle = o.p.emg ? col.bad : o.id === R.sel ? col.p : o.p.ph === "over" ? col.tx3 : col.tx2;
      ctx.font = `600 ${lf}px ${font}`; ctx.fillText(o.l1, o.lp[0], o.lp[1] + lf * .8);
      if (o.l2) { ctx.fillStyle = col.tx3; ctx.font = `${Math.round(lf * .85)}px ${font}`; ctx.fillText(o.l2, o.lp[0], o.lp[1] + lf * 1.85); }
    });
    ctx.restore(); ctx.globalAlpha = 1;
  };
  return R;
}
/* 顏色加透明度（畫布用） */
function flyAlpha(c, a){ return c.startsWith("rgb(") ? c.replace("rgb(", "rgba(").replace(")", `, ${a})`) : c.replace(/\)$/, ` / ${a})`); }
/* 整頁雷達的距離圈：照畫面大小挑 1、2、5、10… 公里 */
function flyRings(span){
  const st = [1, 2, 5, 10, 20, 40, 80, 120].find(v => v >= span / 4) || 160;
  return [1, 2, 3, 4].map(i => st * i).filter(v => v <= span * 1.6);
}
/* 名字的位置：右、左、上、下輪流試，重要的（選到的、緊急、近的）先放 */
function flyPlace(ctx, lab, lf, gap, full, font, sel, W, H, rb, top){
  const box = [...rb], hit = a => box.some(b => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) || a[0] < 2 || a[1] < top + 2 || a[2] > W - 2 || a[3] > H - 2;   // 超出畫面、被上面的按鈕擋住也算放不下
  lab.forEach(o => box.push([o.sx - gap * .6, o.sy - gap * .6, o.sx + gap * .6, o.sy + gap * .6]));
  ctx.font = `600 ${lf}px ${font}`;
  lab.map(o => [o, o.id === sel ? -2 : o.p.emg ? -1 : Math.hypot(o.x, o.y)]).sort((a, b) => a[1] - b[1]).forEach(([o]) => {
    o.l1 = o.p.fn || o.p.reg || "";
    const vr = o.p.vr > 1 ? " ↑" : o.p.vr < -1 ? " ↓" : "";     // 爬升／下降
    const near = (o.p.ph === "arr" || o.p.ph === "dep") && Math.hypot(o.x, o.y) < 12;   // 高度、速度只寫選到的、快落地／剛起飛的
    o.l2 = (o.id === sel || near) && o.p.alt != null && o.p.alt > 0 && o.p.ph !== "gnd" ? full ? `${o.p.alt.toLocaleString()} 公尺${vr}・${o.p.spd} 公里/時` : `${o.p.alt.toLocaleString()}${vr}` : "";
    const w = Math.max(ctx.measureText(o.l1).width, o.l2 ? ctx.measureText(o.l2).width * .85 : 0) + 2, h = lf * (o.l2 ? 2.1 : 1.1), x = o.sx, y = o.sy;
    const c = {r:[x + gap, y - h / 2], l:[x - gap - w, y - h / 2], t:[x - w / 2, y - gap - h], b:[x - w / 2, y + gap * .9]};
    const order = [o.lk, "r", "l", "t", "b"].filter((v, i, a) => v && a.indexOf(v) === i);
    const k = order.find(k => !hit([c[k][0], c[k][1], c[k][0] + w, c[k][1] + h]));
    o.lk = k; o.lp = k ? c[k] : null;
    if (k) box.push([c[k][0], c[k][1], c[k][0] + w, c[k][1] + h]);
  });
  return box;
}
async function flyGeo(f, code){
  if (f._geoq === code) return;
  f._geoq = code;
  if (!FLYGEO[code]) {
    try { const r = await api("/api/flights?geo=" + encodeURIComponent(code), {headers:flyHdr()}); const d = await r.json(); if (!d.ok) { f._geoq = ""; return; } FLYGEO[code] = d; }
    catch(e) { f._geoq = ""; return; }
  }
  if (!$("#fly") || f._geo === code || !FLYD || !FLYD.ap || FLYD.ap.code !== code) { if (f._geoq === code) f._geoq = ""; return; }   // 抓到時已換機場：下次換回來要能再放
  f._geo = code;
  [f._rv, FRAD && FRAD.rv].forEach(v => v && v.setGeo(FLYGEO[code]));
}
/* 換機場：舊的底圖收掉 */
function flyGeoOff(f){
  if (!f._geo) return;
  f._geo = f._geoq = "";
  [f._rv, FRAD && FRAD.rv].forEach(v => v && v.setGeo(null));
}
/* 放大縮小：地圖、飛機、距離圈一起慢慢縮放 */
function flyZoom(f, anim){
  if (f._rv) f._rv.zoom(flyR(), anim);
  f.querySelectorAll(".fzm button").forEach(b => b.classList.toggle("on", +b.dataset.fzm === flyR()));
}
const flyAll = d => [...d.arr, ...d.dep, ...d.gnd, ...d.over, ...(d.rest || [])];
/* 現在用哪條跑道：機場附近低空的飛機往哪個方向飛；沒有飛機就看風向（逆風起降） */
const FLYRWN = {TPE: [53, "05", "23"], TSA: [96, "10", "28"], RMQ: [3, "36", "18"], KHH: [93, "09", "27"]};   // 跑道方向（正北起算）、兩頭的編號
const flyAdiff = (a, b) => { const k = Math.abs((((a - b) % 360) + 360) % 360); return k > 180 ? 360 - k : k; };
function flyRwy(d){
  const r = FLYRWN[d.ap && d.ap.code]; if (!r) return null;
  let a = 0, b = 0;
  [...d.arr, ...d.dep, ...d.gnd].forEach(p => {
    if (p.x == null || p.trk == null || Math.hypot(p.x, p.y) > 15) return;
    if (!(p.ph === "gnd" ? p.spd >= 60 : p.alt != null && p.alt < 1200)) return;
    const k = flyAdiff(p.trk, r[0]); if (k < 30) a++; else if (k > 150) b++;
  });
  const w = d.wx, one = a || b ? a >= b : w && w.wd > 0 && w.ws >= 3 ? flyAdiff(w.wd, r[0]) < 90 : null;
  return one == null ? null : {h: one ? r[0] : (r[0] + 180) % 360, n: one ? r[1] : r[2], wind: !(a || b)};
}
/* 雷達下面那排：跑道、風、能見度、天氣、溫度 */
const FLYDIR = ["北", "東北", "東", "東南", "南", "西南", "西", "西北"];
function flyWxRow(f, d, rw){
  const w = d.wx, out = [], kmh = k => Math.round(k * 1.852);
  if (rw) out.push(`<span class="on">${rw.wind ? `應該用 ${rw.n} 跑道` : `${rw.n} 跑道起降`}</span>`);
  if (w && w.ws != null) out.push(`<span>${w.ws < 1 ? "無風" : `${w.wd < 0 ? "風向不定" : FLYDIR[Math.round(w.wd / 45) % 8] + "風"} ${kmh(w.ws)} 公里/時${w.wg ? `，陣風 ${kmh(w.wg)}` : ""}`}</span>`);
  if (w && w.vis != null) out.push(`<span>${w.vis >= 9999 ? "能見度 10 公里以上" : `能見度 ${w.vis >= 1000 ? +(w.vis / 1000).toFixed(1) + " 公里" : w.vis + " 公尺"}`}</span>`);
  if (w && w.wx) out.push(`<span>${esc(w.wx)}</span>`);
  if (w && w.tmp != null) out.push(`<span>${w.tmp}°C</span>`);
  const el = f.querySelector(".rwx"), html = out.join("");
  if (el._h !== html) { el._h = html; html ? swapHTML(el, html) : el.innerHTML = ""; }
  reveal(el, !!html);
}
function flyRadar(f, d){
  const v = f._rv; if (!v) return;
  const rw = d.loading ? null : flyRwy(d);
  v.rwd = rw ? rw.h : null; if (FRAD && FRAD.rv) FRAD.rv.rwd = v.rwd;
  if (!d.loading) {
    flyWxRow(f, d, rw);
    [["arr", d.arr], ["dep", d.dep], ["gnd", d.gnd], ["over", [...d.over, ...(d.rest || [])]]].forEach(([k, l]) => txt(f.querySelector(`[data-k="rc-${k}"]`), String(l.filter(p => p.x != null).length)));
  }
  v.sel = FLYSEL; v.setData(flyAll(d));
  if (FRAD) fradData();
}
/* 換分頁、換時段：航廈、時段那兩排和看板一起淡出，看不到的時候一次換好（收起、長出來都不用動畫），再一起淡入；
   下面的雷達只跟著總高度滑一次（以前每一排各自收起、長出來，整塊會上下跳好幾下） */
const flyRv = (el, on) => { if (!FLYSTILL) return reveal(el, on); if (el.hidden === !on && !el._hiding) return; el.getAnimations().forEach(a => a.cancel()); el._hiding = false; el.style.overflow = ""; el.hidden = !on; };
const flySet = (el, t) => { if (el.textContent !== t) el.textContent = t; };
async function flySwitch(mode){   // mode："hr" 換時段、"tab" 換分頁、不給是換航廈或地點；按鈕那幾排切換後還在就不動，真的要出現、消失的才淡入淡出
  const hr = mode === "hr", tab = mode === "tab";
  const f = $("#fly"), b = f && f.querySelector(".board"), id = ++FLYSW;
  if (!b || !canAnim()) return flyPaint();
  const tabs = f.querySelector(".ftabs"), hb = f.querySelector(".fhrs"), tb = f.querySelector(".fterm"), sm = f.querySelector(".fsum");
  const next = !!(FLYD && FLYD.fids && flyFT(FLYS.tab));   // 換過去的分頁有沒有航廈、時段
  const shown = e => e && !e.hidden && !e.closest("[hidden]");
  const els = [b, ...(tab && !next ? [hb, ...tb.querySelectorAll("[data-fterm]")] : [])].filter(shown);   // 會消失的按鈕先跟看板一起淡出
  const span = () => b.getBoundingClientRect().bottom - tabs.getBoundingClientRect().bottom;   // 分頁下面到看板底部的總高度
  (b._fo || []).forEach(a => a.cancel());
  FLYHUSH = performance.now() + T.fast + T.mid * 2;        // 切換動畫跑完前雷達先少畫幾張
  FLYBZ = performance.now() + T.fast * .6 + T.mid + 60;   // 淡出＋淡入跑完前，自動更新先等（不然舊的列還在收、新的列長出來會疊在一起）
  const fo = b._fo = els.map(e => e.animate([{opacity:1}, {opacity:0}], {duration:T.fast * .6, easing:EXIT, fill:"forwards"}));
  await Promise.all(fo.map(a => a.finished.catch(() => {})));
  if (id !== FLYSW) return;
  b.querySelectorAll(".frows>.fr").forEach(r => r.getAnimations().forEach(a => a.finish()));   // 上一次更新還在收起、長出、滑動的列直接到位
  b.getAnimations().forEach(a => { if (!fo.includes(a)) a.finish(); });
  const z = ZM(), s0 = span() / z, keys0 = hb._keys, was = new Set([hb, tb, sm, ...tb.querySelectorAll("[data-fterm]")].filter(shown));
  FLYSTILL = true; try { flyPaint(false); } finally { FLYSTILL = false; }
  b.classList.add("cvx"); const s1 = span() / z, bh = b.offsetHeight; b.classList.remove("cvx");   // 手機的列平常畫面外不排版（高度是估的），量的這一刻先排版
  fo.forEach(a => a.cancel()); b._fo = null;
  const ins = [b, ...[hb, tb, sm, ...tb.querySelectorAll("[data-fterm]")].filter(e => shown(e) && !was.has(e) && !(e.parentNode === tb && !was.has(tb)))];   // 新出現的（整排新出來的，裡面的按鈕跟著那排一起）
  if (!hr && shown(hb) && was.has(hb) && hb._keys !== keys0) ins.push(hb);   // 時段那排還在、但時段變了：整排淡入；只有班數變的話只換數字
  ins.forEach(e => e.animate([{opacity:0, transform:"translateY(8px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE}));
  const h0 = bh - (s1 - s0), o = {duration:T.mid, easing:EASE};   // 總高度變了：看板的底慢慢移到新的位置，雷達跟著滑一次
  if (Math.abs(s1 - s0) > 1) b.animate([{height:Math.max(0, h0) + "px", overflow:"hidden"}, {height:bh + "px", overflow:"hidden"}], o);
  if (h0 < 0) f.querySelector(".radar").animate([{transform:`translateY(${h0}px)`}, {transform:"none"}], o);   // 上面多出來的比看板原本還高：差的那段由雷達補（剛好蓋在正在淡入的那幾排上）
}
/* 點到被切掉一半的時段：那一排自己捲到剛好整格露出來（不置中；只捲這一排，整頁不會跟著左右動） */
function flyNudge(s, b){
  if (s.scrollWidth <= s.clientWidth) return;
  const z = ZM(), R = s.getBoundingClientRect(), r = b.getBoundingClientRect(), pad = 16;
  const l = (r.left - R.left) / z, w = r.width / z, cw = s.clientWidth;
  const to = l < pad ? s.scrollLeft + l - pad : l + w > cw - pad ? s.scrollLeft + l + w - cw + pad : null;
  if (to != null) s.scrollTo({left: to, behavior: canAnim() ? "smooth" : "auto"});
}
/* 地點、航廈那一排：「地點 ▾」點了選只看哪裡來／去哪的班機；桃園官網表有兩個以上航廈時多「全部／第一航廈／第二航廈」；回傳有沒有在分航廈 */
let FLYPLC = null;                                          // 只看這個地點（換機場就清掉）
function flyTerms(f, d){
  const tb = f.querySelector(".fterm"), src = d.loading ? [] : d[FLYS.tab] || [];
  const ts = d.fids && flyFT(FLYS.tab) ? [...new Set(src.map(p => p.term).filter(Boolean))].sort() : [];
  const on = ts.length > 1;
  if (!d.loading) flyRv(tb, on || src.length > 1 || !!FLYPLC);
  if (FLYS.term && !ts.includes(FLYS.term)) FLYS.term = "";
  const pb = FLYPLC ? `<span class="fpn">${esc(FLYPLC.name)}${flyFlag(FLYPLC.cc)}</span>` : `<span class="fpn">地點</span>`;
  let b = tb.querySelector("[data-fplace]");
  if (!b) { tb.insertAdjacentHTML("afterbegin", `<button class="fchip fplace" data-fplace>${pb}${I("chev").replace("<svg", '<svg class="chv"')}</button>`); b = tb.firstElementChild; b._pb = pb; }
  b.classList.toggle("set", !!FLYPLC);
  if (b._pb !== pb) {                                       // 換了地點：按鈕的字淡入、寬度慢慢變（不是整排重畫）
    const w0 = b.offsetWidth; b._pb = pb; b.querySelector(".fpn").outerHTML = pb;
    if (canAnim() && tb.isConnected && !tb.hidden) { const w1 = b.offsetWidth;
      if (w0 !== w1) b.animate([{width: w0 + "px", overflow: "hidden"}, {width: w1 + "px", overflow: "hidden"}], {duration: T.sp, easing: SPRING});
      b.querySelector(".fpn").animate([{opacity: 0}, {opacity: 1}], {duration: T.mid, easing: EASE}); }
  }
  const sig = on ? ts.join(",") : "";
  if (tb._sig !== sig) { tb._sig = sig;                      // 航廈有變（換分頁、換機場）：只換航廈那幾顆，新的淡入
    tb.querySelectorAll("[data-fterm]").forEach(x => x.remove());
    b.insertAdjacentHTML("afterend", (on ? ["", ...ts] : []).map(t => `<button class="fchip" data-fterm="${esc(t)}">${t ? esc(t) : "全部"}</button>`).join(""));
    if (canAnim() && !tb.hidden && !FLYSTILL) tb.querySelectorAll("[data-fterm]").forEach((x, i) => x.animate([{opacity: 0, transform: "scale(.9)"}, {opacity: 1, transform: "none"}], {duration: T.mid, delay: i * T.fast * .2, easing: EASE, fill: "backwards"})); }
  tb.querySelectorAll("[data-fterm]").forEach(b => b.classList.toggle("on", b.dataset.fterm === (FLYS.term || "")));
  return on;
}
/* 現在這個分頁（和航廈）有哪些地點、各幾班：同一國的放在一起（班機多的國家在前），城市由北到南 */
const FLYCN = (() => { try { return new Intl.DisplayNames(["zh-Hant-TW"], {type: "region"}); } catch(e) { return null; } })();
const FLYCNX = {HK: "香港", MO: "澳門", KR: "韓國", AE: "阿聯"};
const flyCnName = c => FLYCNX[c] || (FLYCN && c ? FLYCN.of(c) : c) || "其他";
const flyCtry = pl => (pl && FLYD && FLYD.ccs && FLYD.ccs[pl.code]) || "";
const flyPlIs = (p, tab, sel) => { const pl = flyPl(p, tab); return sel.k[0] === "@" ? "@" + flyCtry(pl) === sel.k : flyPk(pl) === sel.k; };   // 「@JP」是整個國家
function flyPlaces(){
  const d = FLYD, tab = FLYS.tab, m = new Map(), g = new Map();
  (d && d[tab] || []).filter(p => !FLYS.term || p.term === FLYS.term).forEach(p => {
    const pl = flyPl(p, tab), k = flyPk(pl); if (!k) return;
    const o = m.get(k) || {k, name: pl.name || pl.code, code: pl.code || "", cc: flyCc(pl), c: flyCtry(pl), lat: d.lat && d.lat[pl.code], n: 0}; o.n++; m.set(k, o); });
  m.forEach(o => { const x = g.get(o.c) || {k: "@" + o.c, c: o.c, cc: o.c && o.c !== "TW" && !FLYNOFL.has(o.c) ? o.c : "", name: flyCnName(o.c), n: 0, items: []}; x.n += o.n; x.items.push(o); g.set(o.c, x); });
  const gs = [...g.values()].sort((a, b) => !a.c - !b.c || b.n - a.n || a.name.localeCompare(b.name, "zh-TW"));
  gs.forEach(x => x.items.sort((a, b) => (b.lat ?? -99) - (a.lat ?? -99) || b.n - a.n));
  return gs;
}
const flyFnN = s => (s || "").toUpperCase().replace(/\s+/g, "").replace(/^([A-Z0-9]{2})0+(?=\d)/, "$1");   // CI054、ci 54 都算同一班
/* 「地點 ▾」：上面搜尋（航班號或地名），下面是地點清單 */
function flyWhere(){
  const d = FLYD; if (!d) return;
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog fplc"><div class="form"><input class="field" type="search" placeholder="搜尋航班或地點" enterkeyhint="search" autocomplete="off"><div class="fpll"></div></div></div>`;
  $("#layer").appendChild(v);
  const box = v.querySelector(".fpll"), inp = v.querySelector("input"), tz = d.ap && d.ap.tz;
  const ck = `<span class="fon">${I("check")}</span>`;
  const row = (x, sub, fx) => `<button class="fplr${sub ? " sub" : ""}${FLYPLC && FLYPLC.k === x.k ? " on" : ""}" data-fpl="${esc(x.k)}"><span class="lab">${sub ? "" : flyFlagAt(x.cc)}${esc(x.name)}${fx ? `<span class="fplx${fx > 1 ? " open" : ""}" data-fx="${esc(x.k)}" role="button" aria-label="展開城市">${I("chev")}</span>` : ""}</span><span class="n">${x.n} 班</span>${ck}</button>`;
  const open = new Set();                                  // 有好幾個城市的國家每次打開都先收起來，點國旗旁邊的箭頭才展開
  const draw = first => {
    const q = inp.value.trim(), Q = flyFnN(q), gs = flyPlaces(), sum = gs.reduce((a, x) => a + x.n, 0);
    const hit = x => x.name.includes(q) || x.code && x.code.includes(q.toUpperCase());
    const pls = gs.map(g => !q || g.name.includes(q) ? g : {...g, items: g.items.filter(hit)}).filter(g => g.items.length);
    const seen = new Set(), fs = Q.length < 2 ? [] : [...d.arr, ...d.dep, ...d.gnd].filter(p => {
      if (seen.has(p.id) || ![p.fn, ...(p.share || [])].some(x => flyFnN(x).includes(Q))) return false; seen.add(p.id); return true; }).slice(0, 8);
    const tabOf = p => d.arr.includes(p) ? "arr" : d.dep.includes(p) ? "dep" : "gnd";
    const fl = p => { const t = tabOf(p), pl = flyPl(p, t), go = t === "dep" || t === "gnd" && flyOut(p);
      return `<button class="fplr" data-fid="${esc(p.id)}">${flyLogo(flyAl(p.fn))}<span class="lab">${esc(p.fn || p.reg || "")}<small>${pl ? `${go ? "往" : "從"} ${esc(pl.name || pl.code)}` : ""}${p.fids && t !== "gnd" ? `・${flyHM((p.est || p.sch) * 1000, tz)}` : ""}${p.st ? `・${esc(p.st)}` : ""}</small></span></button>`; };
    // 這個國家只有一個城市（香港、曼谷）：一列就好；其他國家先一列國家（點了看整國），下面是城市
    const grp = g => { if (g.items.length === 1) return row({...g.items[0], cc: g.cc});
      const on = q || open.has(g.k);
      return row(g, 0, q ? 0 : on ? 2 : 1) + `<div class="fpls" data-fs="${esc(g.k)}"${on ? "" : " hidden"}>${g.items.map(x => row(x, 1)).join("")}</div>`; };
    const html = (fs.length ? `<div class="fplh">航班</div>${fs.map(fl).join("")}` : "")
      + (fs.length && pls.length ? `<div class="fplh">地點</div>` : "")
      + (!q ? `<button class="fplr${FLYPLC ? "" : " on"}" data-fpl=""><span class="lab">${flyFlagAt("")}全部地點</span><span class="n">${sum} 班</span>${ck}</button>` : "")
      + pls.map(grp).join("")
      + (!fs.length && !pls.length ? `<div class="calm">找不到「${esc(q)}」</div>` : "");
    first ? box.innerHTML = html : swapHTML(box, html);       // 打字時：新出現的淡入，清單高度慢慢變
  };
  draw(true); inp.addEventListener("input", () => draw());
  if (DESK.matches) inp.focus();                            // 手機不自己跳出鍵盤
  const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => v.remove(), 360); };
  v._esc = done;
  v.addEventListener("click", e => {
    if (e.target === v) return done();
    const fx = e.target.closest("[data-fx]");
    if (fx) { const k = fx.dataset.fx, on = !open.has(k); on ? open.add(k) : open.delete(k);
      fx.classList.toggle("open", on); return reveal(box.querySelector(`[data-fs="${CSS.escape(k)}"]`), on); }
    const a = e.target.closest("[data-fid]");
    if (a) { done(); return setTimeout(() => flyInfo(a.dataset.fid), canAnim() ? T.fast * 2 : 0); }
    const b = e.target.closest("[data-fpl]"); if (!b) return;
    const k = b.dataset.fpl, x = flyPlaces().flatMap(g => [g, ...g.items]).find(y => y.k === k);
    v.querySelectorAll(".fplr").forEach(y => y.classList.toggle("on", y === b));
    setTimeout(() => { done(); if ((FLYPLC ? FLYPLC.k : "") === k) return;
      FLYPLC = k && x ? {k, name: x.name, cc: x.cc || flyCc({code: x.code})} : null; FLYHR = "";
      setTimeout(flySwitch, canAnim() ? T.fast * 2 : 0); }, canAnim() ? T.fast : 0);   // 勾勾先移過去、視窗關完才換看板
  });
}
/* 官網航班表照「幾點」分成一段一段：已經過了的算在這一小時 */
function flyHours(list, tz){
  const now = Date.now() / 1000, h0 = flyHM(Date.now(), tz).slice(0, 2), out = [];
  list.forEach(p => { const t = p.at || p.est || p.sch || now, k = t <= now ? h0 : flyHM(t * 1000, tz).slice(0, 2);
    p._hr = k; const o = out.find(x => x.k === k); o ? (o.n++, o.t = Math.min(o.t, t)) : out.push({k, n:1, t}); });
  return out.sort((a, b) => a.t - b.t);                    // 延誤到後面時段的班機：時段還是照時間排
}
/* 資料還沒到：看板先藏起來、中間轉載入圖形，到了再一次翻出來（不然會看到一半空白一半舊的） */
function flyWait(f, on){
  const b = f.querySelector(".board"), ld = b.querySelector(".fload i");
  if (on) {
    b._h0 = null; b._sh = (b._sh || 0) + 1;
    if (b.classList.contains("wait")) return;
    const h = b.offsetHeight, full = b.querySelector(".fr:not([hidden])");
    b.getAnimations().forEach(a => a.cancel());
    b.classList.add("wait"); ld.style.clipPath = blobSh(9, 0); b._ld = loader(ld); b._wt = performance.now();
    if (full) {                                             // 換機場：舊的列先淡掉；等久了（T.long）看板才縮回載入的大小、載入圖形出來，很快就到的話直接換
      const lh = parseFloat(getComputedStyle(b).minHeight) || h; b.style.height = lh + "px";
      if (canAnim() && h !== lh) b._shr = b.animate([{height:h + "px"}, {height:lh + "px"}], {duration:T.sp, delay:T.long, easing:SPRING, fill:"backwards"});
    }
    return;
  }
  if (b.classList.contains("wait") && b._h0 == null) b._h0 = b.offsetHeight;   // 列換好之後（flyPaint 最後）再拿掉 wait、從原本的高度長到新的高度
}
/* 字都換好了才開始淡入（換字那一下比較久，動畫放在後面才不會一開始就跳格） */
function flyShow(b){
  const id = b._sh = (b._sh || 0) + 1; b._h0 = null;
  const e = performance.now() - (b._wt || 0), at = !canAnim() ? 0 : e < T.mid ? T.mid : e >= T.long && e < T.long + T.sp ? T.long + T.sp : e;   // 舊的列淡完、看板縮完才換上新的（資料太快回來也不會半途折返）
  setTimeout(() => requestAnimationFrame(() => {
    if (b._sh !== id) return;
    const h0 = b.offsetHeight;                              // 現在看到的高度（縮到一半、還沒縮都對）
    if (b._shr) { b._shr.cancel(); b._shr = null; }        // 還沒開始縮：不縮了，直接從原本的高度變成新的高度
    b.classList.remove("wait"); b.style.height = ""; if (b._ld) { b._ld(); b._ld = null; }
    const h1 = b.offsetHeight;
    if (canAnim() && h0 !== h1) b.animate([{height: h0 + "px"}, {height: h1 + "px"}], {duration: T.sp, easing: SPRING});   // 彈簧：跟其他地方變大變小一樣的手感
  }), Math.max(0, at - e));
}
function flyPaint(anim){
  const f = $("#fly"); if (!f || !FLYD) return;
  clearTimeout(FLYLATER);
  const d = {arr:[], dep:[], gnd:[], over:[], ...FLYD}, msg = f.querySelector(".fmsg");
  if (!d.ap) d.ap = {code: FLYS.ap, name: FLYS.name || "", city: "", tz: ""};
  const tl = flyTerms(f, d), src = tl && FLYS.tab !== "cargo" ? d[FLYS.tab].filter(p => !FLYS.term || p.term === FLYS.term) : d[FLYS.tab] || [];   // 桃園：照航廈分
  let all = FLYPLC ? src.filter(p => flyPlIs(p, FLYS.tab, FLYPLC)) : src;   // 只看某個地點
  if (FLYS.tab === "gnd" || FLYS.tab === "cargo") all = [...all].sort((a, b) => flyGo(a, FLYS.tab) - flyGo(b, FLYS.tab));   // 機坪、貨機：降落的在前、起飛的在後
  const byHr = d.fids && flyFT(FLYS.tab) && all.length > 0, hrs = byHr ? flyHours(all, d.ap.tz) : [];
  if (byHr && !hrs.some(x => x.k === FLYHR)) FLYHR = hrs[0].k;
  const hb = f.querySelector(".fhrs"), sig = hrs.map(x => x.k + ":" + x.n).join(",");
  const sm = f.querySelector(".fsum"), st = d.fids && !d.loading && d.ok ? flySum(d) : "";   // 接下來一小時：幾班抵達、幾班出發、幾班延誤
  if (!d.loading) { flyRv(sm, !!st); if (st) (FLYSTILL ? flySet : txt)(sm, st); }
  f.classList.toggle("fwait", !!d.loading);
  if (!d.loading) flyRv(hb, byHr);                         // 等資料時時段那排留著（淡掉），不要收起來又長出來
  const keys = hrs.map(x => x.k).join(",");
  if (byHr && hb._sig !== sig && hb._keys === keys) {   // 時段一樣、只有班數變了：只換數字，按鈕不重畫
    hb._sig = sig; hrs.forEach((x, i) => { const n = hb.children[i] && hb.children[i].querySelector(".n"); if (n) (FLYSTILL ? flySet : txt)(n, `${x.n} 班`); });
  }
  if (byHr && hb._sig !== sig) {                      // 時段有變（整點過了、班機變多變少）才重排這一排
    hb._sig = sig; hb._keys = keys;
    hb.innerHTML = hrs.map(x => `<button class="fchip${x.k === FLYHR ? " on" : ""}" data-fhr="${x.k}">${+x.k} 點<span class="n">${x.n} 班</span></button>`).join("");
  }
  if (byHr) hb.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.fhr === FLYHR));
  let list = byHr ? all.filter(p => p._hr === FLYHR).sort((a, b) => (a.at || a.est || a.sch) - (b.at || b.est || b.sch)) : all;
  const nd = d.fids && flyFT(FLYS.tab) ? list.filter(flyDone).length : 0, db = f.querySelector(".fdone");   // 已到／已飛的先收成一行，要來的排最上面
  if (nd && !FLYDONE) list = list.filter(p => !flyDone(p));
  if (!d.loading) { flyRv(db, nd > 0); if (nd) { db.classList.toggle("on", FLYDONE); (FLYSTILL ? flySet : txt)(db.firstChild, `${FLYDONE ? "收起" : ""}${FLYS.tab === "arr" ? "已到" : "已飛"} ${nd} 班`); } }
  const n = list.length;
  flyWait(f, !!d.loading && d.ok);
  flyRv(msg, !d.ok || (!d.loading && !n));
  txt(msg, !d.ok ? d.error || "航班資料暫時拿不到" : d.loading ? "" : n ? "" : FLYPLC ? `沒有${FLYPLC.name}的班機` : d.night ? "半夜沒有班機，6 點後再來看" : d.fids && flyFT(FLYS.tab) ? `接下來沒有${FLYS.tab === "arr" ? "抵達" : "起飛"}的班機` : FLYS.tab === "cargo" ? "目前沒有貨機" : FLYS.tab === "gnd" ? "目前沒有客機" : `附近現在沒有${FLYS.tab === "arr" ? "要降落" : "剛起飛"}的飛機`);
  const tz = d.ap.tz;
  flapSet(f.querySelector(".fcode .sf"), d.ap.code); flyApBtn(f, d.ap);
  txt(f.querySelector('[data-k="name"]'), d.ap.name); txt(f.querySelector('[data-k="city"]'), d.ap.city);
  flapSet(f.querySelector(".fclock .sf"), flyHM(Date.now(), tz));
  FLYTAB.forEach(([k]) => { f.querySelector(`[data-k="n-${k}"]`).textContent = d.loading ? "" : String((d[k] || []).length); });   // 不淡入：手機上淡入中剛好換分頁，數字會留著選到時的深色
  f.querySelectorAll(".fh .fk").forEach((h, i) => (FLYSTILL ? (e, t) => { e.textContent = t; } : txt)(h, (d.fids && FLYHEADF[FLYS.tab] || FLYHEAD[FLYS.tab])[i]));
  f.querySelector(".board").dataset.tab = FLYS.tab; f.querySelector(".board").dataset.fids = d.fids ? "1" : "";
  if (d.loading && d.ok) { flyRadar(f, d); flyGeoOff(f); f.querySelector(".ffoot").textContent = ""; return; }   // 等資料：舊的列留著淡出（不先翻成空白），舊機場的飛機收掉
  const bd = f.querySelector(".board"), was = FLYSTILL;
  if (bd._h0 != null) FLYSTILL = true;                      // 資料剛到：整塊看板直接換好字再淡入，不要幾百格一起翻（會卡）
  try { flyRows(f, d, list, n, byHr, tz, anim); } finally { FLYSTILL = was; }
  bd.classList.toggle("none", !n);
  if (!was) flyRadar(f, d);                                 // 換分頁、換時段時雷達沒變，不用重畫
  const rn = f.querySelector(".rnote");                     // OpenSky 今天的次數用完：雷達上的飛機會少很多
  reveal(rn, !!d.skyout); if (d.skyout) txt(rn, `OpenSky 今天的查詢次數用完了，${flyHM(d.skyout * 1000, tz)} 恢復`);
  if (d.ap && d.ap.code && f._geo !== d.ap.code) flyGeo(f, d.ap.code);
  const via = (d.srcs || [[d.src, d.home]]).filter(x => x[0]).map(([n, h]) => h ? `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a>` : esc(n)).join("、");
  if (bd._h0 != null) flyShow(bd);
  f.querySelector(".ffoot").innerHTML = d.night ? "" : `${via ? `資料來自 ${via}・` : ""}路過 ${d.over ? d.over.length : 0} 架・每 10 秒更新`;
}
function flyRows(f, d, list, n, byHr, tz, anim){
  const box = f.querySelector(".frows"), want = Math.min(40, n);   // 有幾班就幾列，不放空格子；一班都沒有就只留一句話
  if (FLYSTILL) anim = false;
  const put = FLYSTILL ? (el, t) => { if (el.textContent !== t) el.textContent = t; } : txt;   // 看板淡出時直接換字，不用每格各自淡入
  const grow = r => { if (canAnim() && anim !== false) r.animate([{opacity:0, transform:"translateY(8px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE}); };
  const cur = [...box.children].filter(r => !r.hidden && !r._bye), items = list.slice(0, want), fresh = new Set();
  // 自動更新、照時段看：同一班機留在自己那一列，換時段或狀態離開的慢慢收起來、新來的長出來（不是每列往上翻成下一班）
  const keyed = canAnim() && anim !== false && cur.some(r => items.some(p => p.id === r.dataset.id));
  let rows;
  if (keyed) rows = flyKeyed(box, cur, items, fresh);
  else {
    [...box.children].slice(0, want).forEach(r => { if (r.hidden || r._bye) { r.getAnimations().forEach(a => a.cancel()); r._bye = 0; if (r.hidden) { r.hidden = false; grow(r); } } });
    while (box.children.length < want) {               // 看板的列數跟著變：新的一列從下面長出來（用過的列藏起來留著，下次直接拿來用）
      box.insertAdjacentHTML("beforeend", flyRow(box.children.length));
      grow(box.lastElementChild);
    }
    [...box.children].slice(want).forEach(flyBye);
    rows = [...box.children].slice(0, want);
  }
  const io = flyObs(f), vh = innerHeight, offs = FLYSTILL ? [] : rows.map(r => { const rc = r.getBoundingClientRect(); return rc.bottom < 0 || rc.top > vh; });   // 先一次量好哪幾列在畫面外
  rows.forEach((r, i) => {
    const p = items[i], v = flyRowV(p, FLYS.tab, tz), off = offs[i] || FLYSTILL || fresh.has(r);   // 新長出來的列直接寫好字
    if (io && !r._obs) { r._obs = 1; io.observe(r); }
    // 已經到了、飛了：淡一點、只留小標籤，不再閃
    r.dataset.id = p ? p.id : ""; r.classList.toggle("bad", v.cls === "bad"); r.classList.toggle("hot", v.cls === "hot"); r.querySelector(".fk.t").classList.toggle("late", !!v.late); r.querySelector(".fk.t").classList.toggle("early", !!v.early); r.querySelector(".fk.reg").classList.toggle("gch", !!v.gch); r.querySelector(".fk.m").classList.toggle("gch", !!v.mch); r.classList.toggle("done", /已到|已飛/.test(v.st || "")); r.classList.toggle("empty", !p); r.classList.toggle("nopc", !!p && !v.pc); r.classList.toggle("nopl", !v.pl); r.classList.toggle("sel", !!p && p.id === FLYSEL);
    const g = (FLYS.tab === "gnd" || FLYS.tab === "cargo") && !!p, gh = g && (i === 0 || items[i - 1] && flyGo(items[i - 1], FLYS.tab) !== v.gout) ? (FLYS.tab === "gnd" ? v.gout ? "準備起飛" : "剛降落" : v.gout ? "起飛" : "降落") : "";   // 機坪、貨機：降落、起飛分兩段，每段第一列上面寫標題
    r.classList.toggle("gh", !!gh); if ((r.dataset.gh || "") !== gh) r.dataset.gh = gh;
    FLYF.forEach((k, j) => flapSet(r.querySelector(`.fk.${k} .sf`), k === "st" ? flyRight(v.st, FLYW.st) : v[k], i * T.fast * .35 + j * T.fast * .2, off));
    FLYX.forEach(k => put(r.querySelector(k === "pl" ? ".plt" : `.fk.${k}`), v[k]));
    const fl = r.querySelector(".flg");
    if ((fl.dataset.c || "") !== v.cc) { fl.dataset.c = v.cc; fl.classList.remove("ok"); v.cc ? fl.src = `/api/fly-logo?k=@${v.cc}` : fl.removeAttribute("src"); fl.hidden = !v.cc; }
    flyLogoSet(r.querySelector(".fk.fal .alg"), p ? flyAl(p.fn) : "");
    const [tag, tk] = flyTags(p, v), tc = "ftag" + (tag ? " on" + (tk ? " " + tk : "") : ""), te = r.querySelector(".ftag");
    if (te.textContent !== tag || te.className !== tc) { const was = te.textContent; te.textContent = tag; te.className = tc;
      if (was && tag && canAnim() && !off) te.animate([{opacity:0, transform:"scale(.9)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE}); }   // 換字（例如 12 分後 → 11 分後）：淡入
    put(r.querySelector(".fsh"), v.sh);
    const rg = r.querySelector(".fk.reg"); if ((rg.dataset.bx || "") !== v.bx) rg.dataset.bx = v.bx;   // 手機：轉盤／櫃台接在登機門後面
  });
  const fr = [...fresh];
  if (!FLYSTEP) { clearTimeout(FLYDT); box.querySelectorAll(":scope>.fr.pend").forEach(r => r.classList.remove("pend")); }   // 一般更新：還沒放出來的直接放出來
  if (FLYSTEP) fr.forEach(r => r.classList.add("pend"));
  else if (fr.length > 3) {                                      // 一次來很多列（例如展開「已飛 N 班」）：不撐高度，一列一列淡入，下面的列整塊滑下去（只動位置和透明度，手機不卡）
    const gap = T.fast * .25, last = Math.min(fr.length - 1, 12);
    fr.forEach((r, i) => r.animate([{opacity:0, transform:"translateY(-6px)"}, {opacity:1, transform:"none"}], {duration:T.mid, delay:Math.min(i, 12) * gap, easing:EASE, fill:"backwards"}));
    FLYBZ = Math.max(FLYBZ, performance.now() + last * gap + T.mid + 60);
  } else {                                                  // 一兩列：從 0 撐開（手機的列平常畫面外不排版，量到的是預估高度，先一起排版再一起量）
    fr.forEach(r => { r.style.contentVisibility = "visible"; });
    const hs = fr.map(r => getComputedStyle(r).height);
    fr.forEach((r, i) => { r.style.contentVisibility = "";
      r.animate([{height:"0px", opacity:0, paddingTop:0, paddingBottom:0, overflow:"hidden"}, {height:hs[i], opacity:1, overflow:"hidden"}], {duration:T.mid, easing:EASE}); });
  }
  if (box._flip) { box._flip(); box._flip = null; }
  flyBeat(box);
}
function flySum(d){
  const now = Date.now() / 1000, up = p => p.fids && !/取消|已到|已飛/.test(p.st || "") && (p.est || p.sch) >= now - 300 && (p.est || p.sch) < now + 3600;
  const a = (d.arr || []).filter(up), b = (d.dep || []).filter(up), late = [...a, ...b].filter(p => p.est && p.est - p.sch >= 900).length;
  return a.length || b.length ? `接下來一小時 抵達 ${a.length} 班・出發 ${b.length} 班${late ? `・延誤 ${late} 班` : ""}` : "";
}
/* 小標籤：最多一個，只放最要緊的（其他變更看字的顏色：時間早綠晚橘、登機門和機型改了是橘字） */
function flyTags(p, v){
  if (!p) return ["", ""];
  if (p.emg) return ["緊急", "bad"];
  if (flyDone(p)) return ["", ""];                          // 已經到了、飛了：變更都不用再提醒
  if (v.gch) return ["改登機門", "late"];
  if (v.late) return [`晚 ${flyMin(v.late)}`, "late"];
  if (v.mch) return ["換機型", "late"];
  if (p.mil) return ["軍機", ""];
  if (p.rare) return ["少見", ""];
  return v.soon ? [`${v.soon} 分後`, "soon"] : ["", ""];
}
/* 一列收起來（藏起來留著，下次直接拿來用） */
function flyBye(r){
  if (r._bye || r.hidden) return; r._bye = 1;
  const end = () => { if (r._bye) { r.hidden = true; r._bye = 0; r.dataset.id = ""; } };
  canAnim() && !FLYSTILL ? r.animate([{opacity:1, height:getComputedStyle(r).height}, {opacity:0, height:"0px", paddingTop:0, paddingBottom:0, marginTop:0}], {duration:T.mid, easing:EASE}).finished.then(end, () => {}) : end();
}
/* 展開「已飛 N 班」：新的列先藏著（.pend），每一小段時間放兩列出來撐開（一次塞二十幾列、每列一起撐高度，手機會卡一下） */
function flyDoneOpen(){
  clearTimeout(FLYDT);
  FLYSTEP = FLYDONE && canAnim(); try { flyPaint(); } finally { FLYSTEP = false; }
  const f = $("#fly"), box = f && f.querySelector(".frows"); if (!box) return;
  const step = () => {
    const pend = [...box.querySelectorAll(":scope>.fr.pend")]; if (!pend.length) return;
    const add = pend.slice(0, 2);
    add.forEach(r => { r.classList.remove("pend"); r.style.contentVisibility = "visible"; });
    const hs = add.map(r => getComputedStyle(r).height);   // 一起排版、一起量（不要量一列改一列）
    add.forEach((r, i) => { r.style.contentVisibility = "";
      r.animate([{height:"0px", opacity:0, paddingTop:0, paddingBottom:0, overflow:"hidden"}, {height:hs[i], opacity:1, overflow:"hidden"}], {duration:T.mid, easing:EASE}); });
    FLYBZ = Math.max(FLYBZ, performance.now() + T.mid + 120);
    if (pend.length > 2) FLYDT = setTimeout(step, T.fast * .5);
  };
  step();
}
let FLYSTEP = false;
/* 一次走掉很多列（例如收起「已飛 N 班」）：一起淡出，再一次收起來，留下的列整塊滑上去（不是每列各自縮高度，手機會卡） */
function flyByeMany(box, gone, keep){
  gone.forEach(r => { r._bye = 1; });
  const fs = gone.map(r => r.animate([{opacity:1}, {opacity:0}], {duration:T.fast, easing:EXIT, fill:"forwards"}));
  FLYBZ = Math.max(FLYBZ, performance.now() + T.fast + T.mid + 60);
  Promise.all(fs.map(a => a.finished)).then(() => {
    const z = ZM(), live = keep.filter(r => r.isConnected && !r.hidden), y0 = live.map(r => r.getBoundingClientRect().top);
    gone.forEach(r => { if (!r._bye) return; r.getAnimations().forEach(a => a.cancel()); r.hidden = true; r._bye = 0; r.dataset.id = ""; });
    live.forEach((r, i) => { const dy = (y0[i] - r.getBoundingClientRect().top) / z;
      if (Math.abs(dy) > 1) r.animate([{transform:`translateY(${dy}px)`}, {transform:"none"}], {duration:T.mid, easing:EASE}); });
  }, () => {});
}
/* 照班機對列：留下來的列不動（順序變了就滑過去），走掉的在原地收起來，新來的拿空的列 */
function flyKeyed(box, cur, items, fresh){
  const byId = new Map(cur.filter(r => r.dataset.id).map(r => [r.dataset.id, r])), ids = new Set(items.map(p => p.id));
  cur.forEach(r => r.getAnimations().forEach(a => a.finish()));
  FLYBZ = Math.max(FLYBZ, performance.now() + T.mid + 60);   // 還在浮現、滑動的列先到位再量位置（不然會從錯的地方滑過來、疊到別列）
  const pool = [...box.children].filter(r => r.hidden && !r._bye), y0 = new Map(cur.map(r => [r, r.getBoundingClientRect().top]));
  const rows = items.map(p => {
    let r = byId.get(p.id);
    if (!r) {
      r = pool.shift();
      if (r) { r.getAnimations().forEach(a => a.cancel()); r.hidden = false; } else { box.insertAdjacentHTML("beforeend", flyRow(box.children.length)); r = box.lastElementChild; }
      fresh.add(r);
    }
    return r;
  });
  const gone = cur.filter(r => !ids.has(r.dataset.id)), order = [...rows];
  gone.forEach(g => {                                       // 走掉的列放回原本的位置再收起來
    let k = -1; for (let j = cur.indexOf(g) - 1; j >= 0 && k < 0; j--) k = order.indexOf(cur[j]);
    order.splice(k + 1, 0, g);
  });
  order.forEach((r, i) => { if (box.children[i] !== r) box.insertBefore(r, box.children[i]); });
  if (gone.length > 3 && canAnim() && !FLYSTILL) flyByeMany(box, gone, rows); else gone.forEach(flyBye);
  box._flip = () => { const z = ZM();                      // 每列的字和分段標題都換好之後才量（標題多出來的空間也一起滑過去）
    rows.forEach(r => { if (fresh.has(r) || !y0.has(r)) return; const dy = (y0.get(r) - r.getBoundingClientRect().top) / z;
      if (Math.abs(dy) > 1) r.animate([{transform:`translateY(${dy}px)`}, {transform:"none"}], {duration:T.mid, easing:EASE}); }); };
  return rows;
}
/* 橘框、紅框的呼吸全部對齊同一個節拍（各列開始的時間不同，不然會一閃一閃不同步） */
function flyBeat(box){
  if (!box.getAnimations) return;
  box.querySelectorAll(".fr.bad").forEach(r => r.getAnimations({subtree:true}).forEach(a => { if (a.animationName === "breathe" && a.startTime !== 0) a.startTime = 0; }));   // 只看有紅框的列（整塊看板的動畫很多，全部問一次很慢）
}
async function flyLoad(anim){
  clearTimeout(FLYT);
  if (!$("#fly")) return;
  FLYT = setTimeout(() => flyLoad(), FLYEV);
  if (document.hidden) return;
  if (!["TPE", "TSA", "RMQ", "KHH"].includes(FLYS.ap)) { FLYS.ap = await flyNear() || "TPE"; flySave(); }   // 以前選過的國外機場也換回台灣的
  const ap = FLYS.ap, seq = ++FLYSEQ, same = () => seq === FLYSEQ && ap === FLYS.ap && $("#fly");   // 換了機場：之前還沒回來的不要蓋掉新的
  const mine = FLYD && FLYD.ap && FLYD.ap.code === ap;
  try {
    const r = await api("/api/flights?ap=" + encodeURIComponent(ap), {headers:flyHdr()});
    if (SHARE && r.status === 401) return shareGone("連結已經失效");
    const d = await r.json();
    await FLYHOLD;
    if (!same()) return;
    FLYD = !d.ok && mine && FLYD.ok && !FLYD.loading ? {...FLYD, ok:false, error:d.error} : !d.ok ? {...FLYD, arr:[], dep:[], gnd:[], over:[], loading:false, ok:false, error:d.error} : d;
    if (d.ok && FLYS.name !== d.ap.name) { FLYS.name = d.ap.name; flySave(); }
    if (d.ok && d.loading) { clearTimeout(FLYT); FLYT = setTimeout(() => flyLoad(), 1500); }   // 官網航班表還在抓：轉圈圈等一下再問
  } catch(e) { if (!same()) return; FLYD = {...(mine ? FLYD : {arr:[], dep:[], gnd:[], over:[], ap:FLYD && FLYD.ap}), loading:false, ok:false, error:e.message}; }
  flyLater(anim);
  const f = $("#fly"); if (f && FLYD && !FLYD.loading) flySplashOff(f);
}
/* 自動更新的新資料：正在切換或列還在滑動時先等，動完再換上（不然舊的列還在收、新的列長出來會疊在一起） */
function flyLater(anim){
  clearTimeout(FLYLATER);
  const w = FLYBZ - performance.now();
  if (w > 0) FLYLATER = setTimeout(() => flyLater(anim), w); else flyPaint(anim);
}
let FLYPIN = [], FLYHOLD = Promise.resolve();
async function flyList(q){
  const r = await api("/api/flights?q=" + encodeURIComponent(q), {headers:flyHdr()});
  const d = await r.json(); if (!d.ok) throw new Error(d.error || "讀不到");
  FLYPIN = d.pin || [];
  return d;
}
/* 沒選過機場：用天氣那邊記下的位置，在常用機場裡挑最近的 */
async function flyNear(){
  const m = wxMem(); if (m.lat == null) return "";
  try { if (!FLYPIN.length) await flyList(""); } catch(e) { return ""; }
  const dd = a => (a.lat - m.lat) ** 2 + ((a.lon - m.lon) * Math.cos(m.lat * Math.PI / 180)) ** 2;
  return FLYPIN.length ? FLYPIN.slice().sort((a, b) => dd(a) - dd(b))[0].code : "";
}
function flyOpen(btn){
  if ($("#fly")) return;
  closeMenu();
  document.body.insertAdjacentHTML("beforeend", flyShell());
  const f = $("#fly"), z = ZM(), r = btn && btn.getBoundingClientRect();
  if (r) f.style.cssText = `--ct:${r.top / z}px;--cb:${(innerHeight - r.bottom) / z}px;--cl:${r.left / z}px;--cr:${(innerWidth - r.right) / z}px`;
  if (!canAnim()) f.style.animation = "none";
  if (!SHARE) history.pushState({fly:1}, "");          // 分享連結只有這一頁，不能返回
  document.documentElement.classList.add("lock");
  setTimeout(() => { if ($("#fly")) document.documentElement.classList.add("flyon"); }, T.slow + 80);
  f._rv = radarView(f.querySelector(".rcv"), false); f._rv.range = flyR(); flyZoom(f, false);   // 雷達先建好：下面用現成資料畫的時候，底圖才放得上去
  if (FLYD && FLYD.ap && FLYD.ap.code === FLYS.ap) { f.querySelector(".fsplash").remove(); flyPaint(false); } else { flySplashOn(f); flyWait(f, true); }
  flyLoad(false);
  f.querySelector(".rcv").addEventListener("click", e => {    // 點雷達打開整頁雷達；點到飛機就順便選好那一架
    const r = e.currentTarget.getBoundingClientRect(), z = ZM(), p = f._rv.hit((e.clientX - r.left) / z, (e.clientY - r.top) / z);
    fradOpen(); if (p) fradPick(p.id);
  });
  if (window.ResizeObserver) new ResizeObserver(() => f._rv.resize()).observe(f.querySelector(".rbox"));   // 雷達變大變小：畫布跟著重設
}
function flyClose(){ if (!$("#fly") || SHARE) return; if (history.state && history.state.fly) history.back(); else flyShut(); }
function flyShut(){
  const f = $("#fly"); if (!f || f._bye) return; f._bye = 1;
  clearTimeout(FLYT); FLYSEL = ""; FLYHR = ""; FLYPLC = null;   // 關掉再打開：地點回到全部
  if (FRAD) fradShut();
  if (f._rv) f._rv.stop();
  document.documentElement.classList.remove("flyon");
  const end = () => { f.remove(); if (!DET) document.documentElement.classList.remove("lock"); };
  if (!canAnim()) return end();
  f.classList.add("closing"); setTimeout(end, T.mid);
}
addEventListener("popstate", () => { if ($("#fly") && !SHARE && !(history.state && history.state.fly)) flyShut(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && $("#fly")) flyLoad(); });
/* 換機場：只有台灣四個機場（官網航班表準）；標誌由瀏覽器從各機場官網抓，抓不到就留代碼 */
const FLYAPLG = {TPE: 2, TSA: 0, RMQ: 0, KHH: 1};   // 圖由主機從各機場官網抓好存著（fly_logo）
// 0：一般；1：圖本身就是滿版的方塊，不留白邊；2：橫的標誌，只露出左邊的圖案（右邊是白字，白底上看不到）
const FLYAPC = ["", " full", " crop"];
const FLYPLACE = {TPE:"桃園", TSA:"松山", RMQ:"台中", KHH:"高雄"};   // 右上角按鈕寫地名就好
const flyApLg = c => `<span class="faplg${FLYAPC[FLYAPLG[c] || 0]}" data-c="${esc(c)}">${esc(c)}${c in FLYAPLG ? `<img alt="" src="/api/fly-logo?k=${esc(c)}">` : ""}</span>`;
function flyApBtn(f, ap){
  const b = f.querySelector("[data-fpick]"), lg = b && b.querySelector(".faplg"); if (!lg) return;
  if (lg.dataset.c !== ap.code) lg.outerHTML = flyApLg(ap.code);
  txt(b.querySelector(".fapn"), FLYPLACE[ap.code] || ap.city || ap.code);
}
async function flyPick(){
  const v = document.createElement("div"); v.className = "veil";
  const row = a => `<button class="fapc${a.code === FLYS.ap ? " on" : ""}" data-ap="${esc(a.code)}" data-key="${esc(a.code)}">
    ${flyApLg(a.code)}
    <span class="lab">${esc(a.name)}<small>${esc(a.city)}・${esc(a.code)}</small></span><span class="fon">${I("check")}</span></button>`;
  const home = () => `<div class="fapg">${FLYPIN.map(row).join("")}</div>`;
  v.innerHTML = `<div class="dialog fpick"><div class="fapl" data-sw>${FLYPIN.length ? home() : `<div class="calm">讀取中…</div>`}</div></div>`;   // 點旁邊空白處就關
  $("#layer").appendChild(v);
  const box = v.querySelector(".fapl");
  const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => v.remove(), 360); };
  v._esc = done;
  if (!FLYPIN.length) flyList("").then(() => swapHTML(box, home()), e => swapHTML(box, `<div class="calm">${esc(e.message)}</div>`));
  v.addEventListener("click", e => {
    if (e.target === v || e.target.closest("[data-r]")) return done();
    const b = e.target.closest("[data-ap]"); if (!b) return;
    const code = b.dataset.ap, a = FLYPIN.find(x => x.code === code) || {}, name = a.name || code, sm = a.city || "";
    v.querySelectorAll(".fapc").forEach(x => x.classList.toggle("on", x === b));   // 勾勾先移過去再關
    if (FLYS.ap !== code) {                // 先把看板翻成空的、標題換成新機場，等資料回來
      FLYS.ap = code; FLYS.name = name; flySave(); FLYSEL = ""; FLYHR = ""; FLYPLC = null;
      FLYD = {ok:true, loading:true, ap:{code, name, city: sm, tz:""}, arr:[], dep:[], gnd:[], over:[]};
      const hold = canAnim() ? T.fast * 2 + 40 : 0;          // 視窗先關完，看板才開始換（同時做會卡）；資料照樣先去抓
      FLYHOLD = new Promise(r => setTimeout(() => { if (FLYS.ap === code) flyPaint(); r(); }, hold));
      flyLoad();
    }
    setTimeout(done, canAnim() ? T.fast : 0);
  });
}
/* 點一架：飛機迷想看的都在這（照片、註冊號、機型、高度、速度） */
function flyInfo(id){
  const d = FLYD, p = d && [...d.arr, ...d.dep, ...d.gnd, ...d.over, ...(d.rest || [])].find(x => x.id === id); if (!p) return;
  FLYSEL = id; flyPaint();
  const v = document.createElement("div"); v.className = "veil";
  const hm = t => t ? flyHM(t * 1000, d.ap.tz) : "", air = p.alt != null, arr = p.ph === "arr" || (p.ph === "gnd" && p.dst && p.dst.code === d.ap.code);
  const tm = p.fids ? `<span class="frt"><b class="num">${hm(p.est || p.sch)}</b>${p.est && hm(p.est) !== hm(p.sch) ? `<s class="num">${hm(p.sch)}</s>` : ""}</span>` : "";
  const end = (x, mine) => `<div class="fre"><b>${esc(x ? x.code : "—")}</b><small>${esc(x ? (x.guess ? "可能是 " : "") + x.name : "查不到")}${flyFlag(flyCc(x))}</small>${mine ? tm : ""}</div>`;
  const vr = p.vr > 0.5 ? `，上升 ${p.vr} 公尺/秒` : p.vr < -0.5 ? `，下降 ${-p.vr} 公尺/秒` : "";
  const rows = [
    ["機型", [p.model, p.t && p.t !== p.model ? p.t : ""].filter(Boolean).join("・") + (p.type0 && (p.model || p.t) ? `（原本 ${p.type0}）` : "")],
    ["註冊號", p.reg],
    [arr ? "抵達登機門" : "登機門", [p.gate, p.term].filter(Boolean).join("・") + (p.gate0 && p.gate ? `（原本 ${p.gate0}）` : "")],
    [arr ? "行李轉盤" : "報到櫃台", (p.bx || "").replace(/^\S+ /, "")],
    ["共掛班號", p.share && p.share.length ? p.share.join("、") : ""],
    ["高度", air ? (p.alt ? `${p.alt.toLocaleString()} 公尺${p.ph === "gnd" ? "" : vr}` : "地面") : ""],
    ["速度", air ? `${p.spd} 公里/時` : ""],
    ["離機場", air ? `${p.d} 公里` : ""],
    ["呼號", p.cs && p.cs !== p.fn ? p.cs : ""],
    ["應答碼", p.sq],
    ["飛機訊號", air ? "" : p.seen ? `${hm(p.seen)} 之後收不到` : p.fids ? "收不到" : ""],
  ].filter(r => r[1]);
  const reg = encodeURIComponent(p.reg || "");
  v.innerHTML = `<div class="dialog finfo"><div class="form">
    <div class="fih">${flyLogo(flyAl(p.fn), "lg")}<div class="lab"><b class="ffn">${esc(p.fn || p.reg || "—")}</b><small>${esc([p.al, p.use].filter(Boolean).join("・") || "航空公司不明")}</small></div>
      ${p.st ? `<span class="fst2${p.emg || /取消|轉降/.test(p.st) ? " bad" : ""}">${esc(p.st)}</span>` : ""}</div>
    ${p.emg || p.mil || p.rare ? `<div class="fbad${p.emg ? " bad" : ""}">${p.emg ? `${I("warn")}${esc(p.st)}（應答碼 ${esc(p.sq)}）` : p.mil ? "軍機" : "少見機型"}</div>` : ""}
    ${p.org || p.dst ? `<div class="froute">${end(p.org, !arr)}<span class="fln"><i></i>${I("plane")}<i></i></span>${end(p.dst, arr)}</div>` : `<div class="fnr sub">航線不明</div>`}
    ${rows.length ? `<div class="fdl">${rows.map(([k, val]) => `<div><span>${k}</span><b>${esc(val)}</b></div>`).join("")}</div>` : ""}
    ${reg ? `<div class="group"><a class="li" href="https://www.jetphotos.com/registration/${reg}" target="_blank" rel="noopener noreferrer"><span class="lab">看這架的照片<small>JetPhotos</small></span>${EXT}</a>
      <a class="li" href="https://www.flightradar24.com/data/aircraft/${reg.toLowerCase()}" target="_blank" rel="noopener noreferrer"><span class="lab">飛行紀錄<small>Flightradar24</small></span>${EXT}</a></div>` : ""}
    </div><div class="btns"><button class="ubtn ghost" data-r="0">關閉</button></div></div>`;
  $("#layer").appendChild(v);
  const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); FLYSEL = ""; flyPaint(); setTimeout(() => v.remove(), 360); };
  v._esc = done;
  v.addEventListener("click", e => { if (e.target === v || e.target.closest("[data-r]")) done(); });
}
document.addEventListener("click", e => {
  const f = e.target.closest && e.target.closest("#fly"); if (!f) return;
  const t = e.target;
  if (t.closest("[data-fback]")) return flyClose();
  if (t.closest("[data-fpick]")) return flyPick();
  if (t.closest("[data-fplace]")) return flyWhere();
  if (t.closest("[data-rfull]")) return fradOpen();
  if (t.closest("[data-fshare]")) return flyShare(t.closest("[data-fshare]"));
  const tb = t.closest("[data-ftab]");
  if (tb) { if (FLYS.tab !== tb.dataset.ftab) { FLYS.tab = tb.dataset.ftab; FLYHR = ""; flySave(); const s = tb.parentNode;
    slideSel(() => s.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === tb))); flySwitch("tab"); } return; }
  const zb = t.closest("[data-fzm]");
  if (zb) { if (+FLYS.zm !== +zb.dataset.fzm) { FLYS.zm = +zb.dataset.fzm; flySave(); flyZoom(f, true); } return; }
  const tm = t.closest("[data-fterm]");
  if (tm) { if ((FLYS.term || "") !== tm.dataset.fterm) { FLYS.term = tm.dataset.fterm; FLYHR = ""; flySave(); const s = tm.parentNode;
    slideSel(() => s.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === tm))); flySwitch(); } return; }
  if (t.closest("[data-fdone]")) { FLYDONE = !FLYDONE; return flyDoneOpen(); }
  const hr = t.closest("[data-fhr]");
  if (hr) { if (FLYHR !== hr.dataset.fhr) { FLYHR = hr.dataset.fhr; const s = hr.parentNode;
    slideSel(() => s.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === hr))); flySwitch("hr");
    flyNudge(s, hr); } return; }
  const r = t.closest(".fr[data-id]");
  if (r && r.dataset.id) return flyInfo(r.dataset.id);
});
document.addEventListener("keydown", e => {
  if (!$("#fly")) return;
  if (e.key === "Escape" && !document.querySelector("#layer .veil")) FRAD ? fradClose() : flyClose();
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("#fly .fr")) { e.preventDefault(); e.target.click(); }
});
setInterval(() => { const c = document.querySelector("#fly .fclock .sf"); if (c && FLYD && FLYD.ap) flapSet(c, flyHM(Date.now(), FLYD.ap.tz)); }, 5000);

/* ═════════ 整頁雷達：點小雷達長大成整頁，可以縮放、拖曳、點飛機看細節 ═════════ */
let FRAD = null, FRADF = "";                                // 開著的整頁雷達；篩選（空的是全部）
const FRADT = [["", "全部"], ["arr", "抵達"], ["dep", "出發"], ["over", "路過"]];
function fradOpen(){
  const f = $("#fly"); if (!f || FRAD || !f._rv) return;
  const r = f.querySelector(".rbox").getBoundingClientRect(), z = ZM();
  const v = document.createElement("div"); v.className = "frad"; v.id = "frad";
  v.style.cssText = `--ct:${r.top / z}px;--cb:${(innerHeight - r.bottom) / z}px;--cl:${r.left / z}px;--cr:${(innerWidth - r.right) / z}px`;
  v.innerHTML = `<div class="frmap"><canvas aria-label="雷達"></canvas><div class="frsc"></div>
    <div class="frtop"><button class="icbtn" data-rback title="返回">${I("back")}</button><b class="frname"></b></div>
    <div class="frbar"><div class="seg frchips" data-slide>${FRADT.map(([k, l]) => `<button class="${FRADF === k ? "on" : ""}" data-rf="${k}">${l}</button>`).join("")}</div></div>
    <div class="frzm"><button class="icbtn" data-rz="1" title="放大">${I("plus")}</button><button class="icbtn" data-rz="-1" title="縮小">${I("minus")}</button></div>
    <div class="frcard" hidden></div></div>
    <div class="frlist"><button class="frlh" data-rlist><span class="grow"></span><span class="chv">${I("chev")}</span></button><div class="frli"></div></div>`;
  document.body.appendChild(v);
  if (!canAnim()) v.style.animation = "none";
  history.pushState({fly:1, frad:1}, "");
  const cv = v.querySelector("canvas"), rv = radarView(cv, true);
  FRAD = {v, rv, sel:""}; rv.rwd = f._rv.rwd;
  const top = () => { const b = v.querySelector(".frbar").getBoundingClientRect(), m = cv.getBoundingClientRect(), z = ZM(); rv.top = (b.bottom - m.top) / z + 4; };
  rv.resize(); top(); rv.view(0, 0, rv.fit(flyR() * .95));           // 一開始跟小雷達看到的範圍差不多，看起來就像它長大
  if (f._geo) rv.setGeo(FLYGEO[f._geo]);
  fradData();
  if (window.ResizeObserver) new ResizeObserver(() => { if (FRAD && FRAD.rv === rv) { rv.resize(); top(); } }).observe(cv);
  fradGest(rv, cv);
}
function fradClose(){ if (!FRAD) return; if (history.state && history.state.frad) history.back(); else fradShut(); }
function fradShut(){
  const F = FRAD; if (!F) return; FRAD = null;
  const f = $("#fly"), b = f && f.querySelector(".rbox"), v = F.v, end = () => { F.rv.stop(); v.remove(); };
  if (!canAnim() || !b) return end();
  const r = b.getBoundingClientRect(), z = ZM();
  v.style.cssText = `--ct:${r.top / z}px;--cb:${(innerHeight - r.bottom) / z}px;--cl:${r.left / z}px;--cr:${(innerWidth - r.right) / z}px`;
  F.rv.view(0, 0, F.rv.fit(flyR() * .95), true);
  v.classList.add("closing"); setTimeout(end, T.mid);
}
addEventListener("popstate", () => { if (FRAD && !(history.state && history.state.frad)) fradShut(); });
/* 新資料、換篩選、選飛機：重畫清單和小卡 */
function fradData(){
  if (!FRAD || !FLYD) return;
  const {v, rv} = FRAD, d = FLYD;
  rv.sel = FRAD.sel; rv.only = FRADF;
  rv.setData(flyAll({arr:[], dep:[], gnd:[], over:[], ...d}));
  v.querySelector(".frname").textContent = d.ap ? d.ap.name : "";
  fradList(); fradCard();
}
/* 畫面裡的飛機，照離機場多遠排 */
function fradList(){
  if (!FRAD) return;
  const {v, rv} = FRAD, V = rv.V, half = [rv.W / 2 / V.s, rv.H / 2 / V.s], out = [];
  rv.pl.forEach(o => {
    const p = o.p;
    if (o.gone || !p || p.ph === "gnd" || (FRADF && p.ph !== FRADF)) return;
    const [x, y] = rv.at(o, performance.now());
    if (Math.abs(x - V.cx) > half[0] || Math.abs(y - V.cy) > half[1]) return;
    out.push([p.d != null ? p.d : Math.hypot(x, y), p]);      // 離機場由近到遠
  });
  out.sort((a, b) => a[0] - b[0]);
  const pl = p => p.ph === "arr" ? (p.org ? "從 " + p.org.name : "") : p.ph === "dep" ? (p.dst ? "往 " + p.dst.name : "") : [p.org && p.org.name, p.dst && p.dst.name].filter(Boolean).join(" → ");
  const html = out.slice(0, 60).map(([, p]) => `<button class="li frr${p.id === FRAD.sel ? " on" : ""}" data-rid="${esc(p.id)}" data-key="${esc(p.id)}"><i class="frd ${p.emg ? "emg" : p.ph}"></i>
    <span class="lab"><b>${esc(p.fn || p.reg || "—")}</b> ${esc(pl(p) || p.al || "")}<small>${[p.use, p.alt != null ? p.alt.toLocaleString() + " 公尺" + (p.vr > 1 ? " ↑" : p.vr < -1 ? " ↓" : "") : "", p.d != null ? p.d + " 公里" : ""].filter(Boolean).join("・")}</small></span></button>`).join("");
  const li = v.querySelector(".frli");
  if (li._h !== html) { li._h = html; li.innerHTML = html || `<div class="calm">畫面裡沒有飛機</div>`; }
  const h = v.querySelector(".frlh span"), t = `畫面裡 ${out.length} 架`;
  if (h.textContent !== t) h.textContent = t;
}
/* 選到的飛機：下面浮出小卡 */
function fradCard(){
  if (!FRAD) return;
  const c = FRAD.v.querySelector(".frcard"), o = FRAD.sel && FRAD.rv.pl.get(FRAD.sel), p = o && !o.gone && o.p;
  if (!p) { reveal(c, false); c._id = ""; return; }
  const kv = (k, val) => `<div class="fkv"><small>${k}</small><b class="num">${val}</b></div>`;
  const ap = x => x ? `<b>${esc(x.code)}</b><small>${esc((x.guess ? "可能是 " : "") + x.name)}</small>` : `<b>—</b><small>查不到</small>`;
  const html = `<div class="frch">${flyLogo(flyAl(p.fn), "lg")}<div><b class="frfn">${esc(p.fn || p.reg || "—")}</b><span class="sub">${esc([p.al, p.use].filter(Boolean).join("・"))}</span></div><span class="fst">${esc(p.st || "")}</span>
      <button class="icbtn" data-rx title="關閉">${I("x")}</button></div>
    ${p.org || p.dst ? `<div class="frrt"><div>${ap(p.org)}</div><span class="sub">${I("plane")}</span><div>${ap(p.dst)}</div></div>` : `<div class="frrt sub">航線不明</div>`}
    <div class="frkv">${kv("高度", p.alt != null ? p.alt.toLocaleString() + " 公尺" : "—")}${kv("速度", p.spd != null ? p.spd + " 公里/時" : "—")}${kv(p.ph === "arr" && p.eta != null ? "落地" : "離機場", p.ph === "arr" && p.eta != null ? (p.eta < 1 ? "快到了" : p.eta + " 分鐘後") : (p.d != null ? p.d + " 公里" : "—"))}${kv("機型", esc(p.model || p.t || "—"))}</div>`;
  if (c._h !== html) { c._h = html; c.innerHTML = html; }
  if (c._id !== p.id) { c._id = p.id; if (!c.hidden && canAnim()) c.animate([{opacity:.4, transform:"translateY(6px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE}); }
  reveal(c, true);
}
function fradPick(id, center){
  if (!FRAD) return;
  FRAD.sel = FRAD.sel === id && !center ? "" : id || "";
  FRAD.rv.sel = FRAD.sel;
  const o = FRAD.sel && FRAD.rv.pl.get(FRAD.sel);
  if (o && FRADF && o.p.ph !== FRADF) {                      // 選到的飛機被篩選藏起來了：換到它那一類
    FRADF = FRADT.some(([k]) => k === o.p.ph) ? o.p.ph : "";
    const box = FRAD.v.querySelector(".frchips");
    slideSel(() => box.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.rf === FRADF)));
    FRAD.rv.only = FRADF; FRAD.rv.kick();
  }
  if (o && center) { const [x, y] = FRAD.rv.at(o, performance.now()); FRAD.rv.view(x, y, Math.max(FRAD.rv.V.s, FRAD.rv.fit(20)), true); }
  FRAD.rv.kick(); fradList(); fradCard();
  if (o && center) setTimeout(fradList, T.mid + T.fast);       // 畫面移過去之後再數一次
}
/* 手勢：一指拖曳、兩指縮放、滾輪縮放、點一下選飛機、點兩下回到機場 */
function fradGest(rv, cv){
  const P = new Map(); let g = null, tap = null, last = 0, lt = 0;
  const loc = e => { const r = cv.getBoundingClientRect(), z = ZM(); return [(e.clientX - r.left) / z, (e.clientY - r.top) / z]; };
  const lim = (cx, cy, s) => { s = Math.max(rv.fit(140), Math.min(rv.fit(3), s)); return [Math.max(-140, Math.min(140, cx)), Math.max(-140, Math.min(140, cy)), s]; };
  const begin = () => {
    const pts = [...P.values()], m = [(pts[0][0] + (pts[1] || pts[0])[0]) / 2, (pts[0][1] + (pts[1] || pts[0])[1]) / 2];
    g = {m, d: pts[1] ? Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) : 0, s: rv.V.s, w: rv.km(...m)};
  };
  const done = () => { clearTimeout(lt); lt = setTimeout(fradList, T.fast); };
  cv.addEventListener("pointerdown", e => {
    cv.setPointerCapture(e.pointerId); P.set(e.pointerId, loc(e));
    tap = P.size === 1 ? {p: loc(e), t: performance.now()} : null;
    rv.busy = 1; rv.kick(); begin();
  });
  cv.addEventListener("pointermove", e => {
    if (!P.has(e.pointerId) || !g) return;
    P.set(e.pointerId, loc(e));
    const pts = [...P.values()], m = [(pts[0][0] + (pts[1] || pts[0])[0]) / 2, (pts[0][1] + (pts[1] || pts[0])[1]) / 2];
    if (tap && Math.hypot(m[0] - tap.p[0], m[1] - tap.p[1]) > 8) tap = null;
    const s = pts[1] && g.d ? g.s * Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) / g.d : g.s;
    rv.view(...lim(g.w[0] - (m[0] - rv.W / 2) / s, g.w[1] + (m[1] - rv.H / 2) / s, s));   // 手指下的那個點跟著手指走
  });
  const up = e => {
    if (!P.delete(e.pointerId)) return;
    if (P.size) return begin();
    rv.busy = 0; g = null; done();
    if (!tap || performance.now() - tap.t > 400) return;
    const t = performance.now();
    if (t - last < 320) { last = 0; return rv.view(0, 0, rv.fit(flyR() * .95), true); }
    last = t;
    const p = rv.hit(...tap.p); fradPick(p ? p.id : "");
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => {
    e.preventDefault();
    const m = loc(e), w = rv.km(...m), s = rv.V.s * Math.exp(-e.deltaY * .0015);
    rv.view(...lim(w[0] - (m[0] - rv.W / 2) / s, w[1] + (m[1] - rv.H / 2) / s, s)); done();
  }, {passive:false});
}
document.addEventListener("click", e => {
  if (!FRAD || !e.target.closest || !e.target.closest("#frad")) return;
  const t = e.target, rv = FRAD.rv;
  if (t.closest("[data-rback]")) return fradClose();
  if (t.closest("[data-rx]")) return fradPick("");
  const z = t.closest("[data-rz]");
  if (z) { rv.view(rv.V.cx, rv.V.cy, Math.max(rv.fit(140), Math.min(rv.fit(3), rv.V.s * (+z.dataset.rz > 0 ? 2 : .5))), true); return setTimeout(fradList, T.mid); }
  const rf = t.closest("[data-rf]");
  if (rf) { if (FRADF !== rf.dataset.rf) { FRADF = rf.dataset.rf; const s = rf.parentNode; slideSel(() => s.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === rf))); fradData(); } return; }
  if (t.closest("[data-rlist]")) return FRAD.v.classList.toggle("lopen");
  const row = t.closest("[data-rid]");
  if (row) { if (!DESK.matches) FRAD.v.classList.remove("lopen"); return fradPick(row.dataset.rid, true); }
});

/* ═════════ 機場起降分享：1 小時內有效，第一支打開的手機才看得到 ═════════ */
const SHARE = location.pathname === "/fly" ? new URLSearchParams(location.hash.slice(1)).get("s") || "" : "";
let SHAREDEV = "", SHAREEND = 0, SHARET = 0;
const flyHdr = () => SHARE ? {"X-Share":SHARE + ":" + SHAREDEV} : {"X-Token":getTok()};
async function flyShare(b){
  if (b._busy) return; b._busy = 1;
  try {
    const r = await api("/api/fly-share", {method:"POST", headers:{"X-Token":getTok()}}), d = await r.json();
    if (!d.ok) throw new Error(d.error || "做不出連結");
    const url = location.origin + "/fly#s=" + d.code;
    if (navigator.share && matchMedia("(pointer:coarse)").matches) { try { await navigator.share({title:"機場起降", url}); } catch(e) { /* 取消分享 */ } }
    else { await navigator.clipboard.writeText(url); toast("已複製連結：1 小時內有效，只能一支手機看"); }
  } catch(e) { toast(e.message || "複製不了", "bad"); }
  b._busy = 0;
}
async function shareBoot(){
  document.title = "機場起降";
  const k = "vs-share:" + SHARE.slice(0, 12);
  try {
    const r = await api("/api/fly-claim", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({code:SHARE, dev:store(k)})}), d = await r.json();
    if (!d.ok) return shareGone(d.error);
    SHAREDEV = d.dev; store(k, d.dev); SHAREEND = Date.now() + d.left * 1000;
  } catch(e) { return shareGone(e.message); }
  endSplash(); flyOpen(); shareLeft();
}
/* 左上角：還剩幾分鐘 */
function shareLeft(){
  clearTimeout(SHARET);
  const m = Math.ceil((SHAREEND - Date.now()) / 60000), el = $("#fly [data-k=left]");
  if (m <= 0) return shareGone("連結已經失效");
  if (el) el.textContent = `還能看 ${m} 分鐘`;
  SHARET = setTimeout(shareLeft, 15000);
}
function shareGone(msg){
  clearTimeout(SHARET); clearTimeout(FLYT);
  const f = $("#fly"); if (f) { if (f._rv) f._rv.stop(); f.remove(); }
  if (FRAD) { FRAD.rv.stop(); FRAD.v.remove(); FRAD = null; }
  document.documentElement.classList.remove("lock", "flyon");
  $("#app").innerHTML = `<div class="sgone"><span class="ico fly">${I("plane")}</span><b>${esc(msg)}</b><span class="sub">請朋友再分享一次</span></div>`;
  endSplash();
}
/* ═════════ 定時抓資料 ═════════ */
let timer;
const T0 = performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms));
let BOOTED = false, REFRESHING = false;
function splashMsg(t){ const m = document.querySelector(".sp-msg"); if (m && m.textContent !== t) m.innerHTML = `<span>${esc(t)}</span>`; }
function endSplash(){
  if (BOOTED) return; BOOTED = true;
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
    im.onerror = () => { FLAGFAIL[cc] = 1; res(); }; im.src = `https://flagcdn.com/w80/${cc.toLowerCase()}.png`;
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
let TICKID = 0;
async function tick(){
  clearTimeout(timer);
  const id = ++TICKID;                          // 同時有好幾個在讀：只用最新的那一次，舊的結果不畫
  const rq = new URLSearchParams(location.search).get("restore");
  if (rq) { RSW.code = rq.trim().toUpperCase(); sessionStorage.setItem("vs-rsw", RSW.code); history.replaceState(null, "", location.pathname); }
  if (RSW.code) return restoreScreen();
  if (!getTok()) { endSplash(); return login(); }
  try {
    if (!BOOTED) splashMsg("讀取主機狀態…");
    const r = await fetch("/api/all", {headers:{"X-Token":getTok()}, cache:"no-store", signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined});   // 網路卡住最多等 20 秒，不會一直轉
    if (r.status === 401) { setTok(""); LIST = []; endSplash(); return login("密碼不對，再試一次"); }
    const data = await r.json();
    if (id !== TICKID || !getTok()) return true;
    const me = data.find(x => !x.node);
    if (window._fresh) { window._fresh = false; fetch("/api/pin", {method:"POST", headers:{"X-Token":getTok()}, body:'{"action":"login"}'}).catch(() => {}); }  // 登入成功：PIN 碼輸錯的次數歸零
    if (new URLSearchParams(location.search).get("go") === "cloud" && me && me.cloud && !window._goCloud) {   // 從雲端硬碟跳過來登入：登入好了就送回去
      window._goCloud = true;
      await fetch("/api/cloud-login", {method:"POST", headers:{"X-Token":getTok()}}).catch(() => {});
      return location.replace("/cloud/");
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
      upwRun();
      setTimeout(wxRun, 1200);                   // 畫面出來後再問位置、抓天氣，不拖慢開啟
    }
    if (BOOTED) await settle();
    if (id !== TICKID || !getTok()) return true;  // 等的時候登出了，或已經有更新的一次
    render(data);
  } catch(e) {
    if (id !== TICKID) return false;
    if (!BOOTED) splashMsg("連線不上，正在重試…");
    const m = document.querySelector(".meta"); if (m) m.innerHTML = `<span class="live off"></span>連線中斷，重試中…`;
    timer = setTimeout(tick, 3000); return false;
  }
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
/* 手機：下拉重新整理。圓形跟著手指長大、旋轉，拉夠了彈一下變形；放開就變成載入中的形狀，好了畫出勾勾再收起來 */
(function(){
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
SHARE ? shareBoot() : tick();
/* 不是按鈕但點得動的（IP、備份密碼、還原指令）：用鍵盤選到後按 Enter 或空白鍵也行 */
document.addEventListener("keydown", e => {
  const t = e.target;
  if ((e.key === "Enter" || e.key === " ") && t.matches && t.matches('[role="button"]:not(button)')) { e.preventDefault(); t.click(); }
});
