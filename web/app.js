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
const u0 = new URL(location.href);
if (u0.searchParams.get("t")) { setTok(u0.searchParams.get("t"), true); history.replaceState(null, "", "/"); }

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
  ext:'<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H10"/>',
  cloud:'<path d="M17.5 19a4.5 4.5 0 1 0-1.3-8.8A6 6 0 0 0 4.6 12.5 3.5 3.5 0 0 0 6.5 19Z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>',
  pin:'<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7.5 12h.01M12 12h.01M16.5 12h.01"/>',
  finger:'<path d="M12 10a2 2 0 0 0-2 2c0 1-.1 2.5-.26 4M14 13.1c0 2.4 0 6.4-1 8.9M17.3 21c.1-.6.4-2.3.5-3M2 12a10 10 0 0 1 18-6M2 16h.01M21.8 16c.2-2 .13-5.35 0-6M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2M8.65 22c.2-.66.45-1.3.57-2M9 6.8a6 6 0 0 1 9 5.2v2"/>',
  chev:'<path d="m6 9 6 6 6-6"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>',
  warn:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
  ok:'<circle cx="12" cy="12" r="9.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  upd:'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  off:'<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M2 2l20 20"/>',
};
const I = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;

/* ═════════ 個人設定（存在這台裝置） ═════════ */
const DEF = {theme:"auto", accent:"blue", glass:50, bg:"aurora", motion:true, perf:"auto", density:"cozy", size:"m", refresh:5,
  show:{chart:true, net:true, items:true, info:true, flag:true, traffic:true}};
let PREF = (() => { try { const p = JSON.parse(store("vps-prefs") || "{}"); return {...DEF, ...p, show:{...DEF.show, ...(p.show||{})}}; } catch(e){ return JSON.parse(JSON.stringify(DEF)); } })();
const getP = k => k.split(".").reduce((o,x)=>o && o[x], PREF);
function setP(k, v){ const ks = k.split("."); let o = PREF; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; store("vps-prefs", JSON.stringify(PREF)); }
const DARKQ = matchMedia("(prefers-color-scheme: dark)");
const TOUCH = matchMedia("(pointer: coarse)");
let SLOW = false;   // 實測發現這台裝置畫不動完整效果
try { SLOW = sessionStorage.getItem("vps-slow") === "1"; } catch(e) {}
function isLite(){ return PREF.perf === "lite" || (PREF.perf === "auto" && (TOUCH.matches || innerWidth < 1024 || SLOW)); }
/* 「自動」模式：開啟後量 1.2 秒的實際順暢度，畫不動就自動改用輕量效果 */
function probePerf(){
  if (PREF.perf !== "auto" || isLite() || !PREF.motion) return;
  let n = 0, t0 = 0;
  const f = t => {
    if (!t0) t0 = t;
    n++;
    if (t - t0 < 1200) return requestAnimationFrame(f);
    const fps = n * 1000 / (t - t0);
    if (fps < 40) {
      SLOW = true; try { sessionStorage.setItem("vps-slow", "1"); } catch(e) {}
      applyPrefs();
    }
  };
  setTimeout(() => requestAnimationFrame(f), 1500);     // 等進場動畫跑完再量
}
/* 各國國旗配色：[亮色, 主色, 輔助色] */
const FLAGPAL = {
  JP:["#ff7a8a","#d3002d","#ffb3c1"], HK:["#ff7b6e","#de2910","#ffc4bd"], SG:["#ff6b7a","#ef3340","#ffc2c9"],
  TW:["#ff5a5a","#1f3fbf","#6b8cff"], CN:["#ffde00","#de2910","#ff8a3d"], KR:["#5b9bff","#cd2e3a","#0047a0"],
  US:["#6b8cff","#b22234","#3c3b6e"], GB:["#5b7cff","#c8102e","#012169"], CA:["#ff6b6b","#d80621","#ffb3b3"],
  AU:["#5b7cff","#e4002b","#012169"], NZ:["#5b7cff","#c8102e","#012169"], DE:["#ffce00","#dd0000","#ff8a00"],
  FR:["#5b8cff","#ef4135","#0055a4"], NL:["#ff8a3d","#21468b","#ae1c28"], BE:["#fdda24","#ef3340","#ff9a3d"],
  LU:["#00a1de","#ef3340","#7fd3f5"], CH:["#ff6b5e","#da291c","#ffc2bd"], AT:["#ff6b7a","#ed2939","#ffc2c9"],
  IT:["#4ccf86","#ce2b37","#009246"], ES:["#f1bf00","#aa151b","#ff7a45"], PT:["#ffcc00","#da291c","#046a38"],
  IE:["#ff883e","#169b62","#7fd6a8"], SE:["#fecc00","#006aa7","#4dabff"], NO:["#ff6b7a","#ba0c2f","#00205b"],
  FI:["#7fb2ff","#002f6c","#cfe0ff"], DK:["#ff6b7a","#c8102e","#ffc2cc"], PL:["#ff6b8a","#dc143c","#ffc2cf"],
  CZ:["#5b8cff","#d7141a","#11457e"], UA:["#ffd500","#0057b7","#4d9bff"], RU:["#5b8cff","#d52b1e","#0039a6"],
  TR:["#ff5a63","#e30a17","#ffc2c5"], IL:["#6b9bff","#0038b8","#a8c8ff"], AE:["#4cc38a","#ff0000","#00732f"],
  IN:["#ff9933","#138808","#4dd0a0"], VN:["#ffcd00","#da251d","#ff7a3d"], TH:["#6b7bff","#a51931","#2d2a4a"],
  MY:["#ffcc00","#cc0001","#2b4bd9"], ID:["#ff6b6b","#ce1126","#ffc2c2"], PH:["#fcd116","#0038a8","#ce1126"],
  BR:["#ffdf00","#009c3b","#3e7bff"], MX:["#4cc38a","#ce1126","#006847"], AR:["#74acdf","#2f6fb5","#f6b40e"],
  CL:["#5b8cff","#d52b1e","#0039a6"], ZA:["#ffb612","#007749","#de3831"],
};
const FLAGDEF = ["#38bdf8","#6366f1","#22d3ee"];
let FLAGCC = null, MSEL = "";
function flagCC(){
  const k = DESK.matches ? SEL : (MSEL || SEL);
  const s = LIST.find(x=>keyOf(x)===k) || LIST[0]; return (s && s.geo && s.geo.cc) || "";
}
/* 手機：找出畫面中間的那張卡片 */
let scrollRaf = 0;
function trackCenter(){
  if (DESK.matches || PREF.accent !== "flag") return;
  const mid = innerHeight * 0.45; let best = null, bestD = 1e9;
  document.querySelectorAll("#app .grid > .card").forEach(c => {
    const r = c.getBoundingClientRect();
    const d = (r.top <= mid && r.bottom >= mid) ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (d < bestD) { bestD = d; best = c; }
  });
  const k = best ? best.getAttribute("data-key") : "";
  if (k && k !== MSEL) { MSEL = k; flagAccent(); }
}
let scrollStop = 0;
addEventListener("scroll", () => {
  if (isLite()) { clearTimeout(scrollStop); scrollStop = setTimeout(trackCenter, 140); return; }
  if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; trackCenter(); });
}, {passive:true});
function flagAccent(){
  const h = document.documentElement;
  if (PREF.accent !== "flag") { if (FLAGCC !== null) { ["--a1","--a2","--a3"].forEach(k=>h.style.removeProperty(k)); FLAGCC = null; } return; }
  const cc = flagCC(); if (cc === FLAGCC) return;
  FLAGCC = cc; const p = FLAGPAL[cc] || FLAGDEF;
  h.style.setProperty("--a1", p[0]); h.style.setProperty("--a2", p[1]); h.style.setProperty("--a3", p[2]);
}
function applyPrefs(){
  const h = document.documentElement, dark = PREF.theme === "dark" || (PREF.theme === "auto" && DARKQ.matches), g = PREF.glass / 100;
  h.dataset.mode = dark ? "dark" : "light"; h.dataset.accent = PREF.accent; h.dataset.bg = PREF.bg;
  h.dataset.motion = PREF.motion ? "on" : "off"; h.dataset.density = PREF.density;
  h.style.setProperty("--ga", (dark ? .02 + g * .17 : .22 + g * .62).toFixed(3));
  const lite = isLite(); h.dataset.lite = lite ? "on" : "off";
  h.style.setProperty("--blur", Math.round(lite ? 10 + g * 12 : 14 + g * 26) + "px");
  h.style.setProperty("--zoom", {s:.92, m:1, l:1.1}[PREF.size] || 1);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#06080f" : "#eef1f7";
  try { flagAccent(); } catch(e) {}   /* 第一次執行時主機清單還沒準備好 */
}
DARKQ.addEventListener("change", applyPrefs);
applyPrefs();

/* ═════════ 小工具 ═════════ */
const DESK = matchMedia("(min-width: 1024px)");
let LIST = [], SEL = store("vps-sel"), FILTER = "";
const open = {};
function size(b){ if(!b) return "0 B"; const u=["B","KB","MB","GB","TB"]; let i=0; while(b>=1024&&i<4){b/=1024;i++} return (b<10&&i?b.toFixed(1):Math.round(b))+" "+u[i]; }
const rate = b => size(b)+"/s";
function up(s){ const d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60);
  return d ? `${d} 天 ${h} 小時` : h ? `${h} 小時 ${m} 分` : `${m} 分鐘`; }
const num = (v, d=0) => `<span class="num" data-v="${(+v).toFixed(d)}" data-d="${d}">${(+v).toFixed(d)}</span>`;
const keyOf = s => s.node || s.name || "";
const lvOf = s => s.level || (s.online ? "ok" : "bad");
const tier = p => p>=90 ? "b" : p>=75 ? "w" : "";
const track = pct => `<div class="track"><div class="fill ${tier(pct)}" style="width:${Math.max(0,Math.min(pct,100))}%"></div></div>`;
const STATE = {running:"執行中",exited:"已停止",restarting:"重啟中",paused:"暫停",created:"未啟動",dead:"故障",
  active:"執行中",inactive:"未執行",failed:"失敗",activating:"啟動中",unknown:"未知"};
let REGION; try { REGION = new Intl.DisplayNames(["zh-TW"], {type:"region"}); } catch(e) {}
const FLAGFAIL = {};
function flag(cc){
  if (!/^[A-Z]{2}$/.test(cc||"")) return "";
  const emo = String.fromCodePoint(...[...cc].map(c=>127397+c.charCodeAt(0)));
  if (FLAGFAIL[cc]) return `<span class="emoji">${emo}</span>`;
  return `<img class="flag" src="https://flagcdn.com/w80/${cc.toLowerCase()}.png" alt="${emo}" title="${esc(REGION?REGION.of(cc):cc)}"
    onerror="FLAGFAIL['${cc}']=1;this.outerHTML='<span class=emoji>${emo}</span>'">`;  /* 外層 .fw 會留著，發光不會跑掉 */
}
const place = s => s.geo ? [(REGION&&s.geo.cc)?REGION.of(s.geo.cc):s.geo.cc, s.geo.city].filter(Boolean).join(" ") : "";
function when(t){ const d=new Date(t*1000), now=new Date();
  const hm=d.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false});
  return d.toDateString()===now.toDateString() ? `今天 ${hm}` : `${d.getMonth()+1}/${d.getDate()} ${hm}`; }
/* 「3 分鐘前」「昨天 19:42」這種好讀的時間 */
function ago(t){
  const d = Date.now()/1000 - t, dt = new Date(t*1000), now = new Date();
  const hm = dt.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false});
  if (d < 45) return "剛剛";
  if (d < 3600) return `${Math.round(d/60)} 分鐘前`;
  if (d < 6*3600) return `${Math.floor(d/3600)} 小時前`;
  if (dt.toDateString() === now.toDateString()) return `今天 ${hm}`;
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (dt.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${dt.getMonth()+1}/${dt.getDate()} ${hm}`;
}
const seen = s => s.last_seen ? `最後連上：${ago(s.last_seen)}` : "";
function avatar(s){
  const f = PREF.show.flag && s.geo ? flag(s.geo.cc) : "";
  const lv = lvOf(s), tip = {ok:"運作正常", warn:"需要留意", bad:"出問題了"}[lv];
  const inner = f ? `<span class="fw">${f}</span>` : `<span class="fw round"><span class="letter">${esc([...(s.name||"?")][0])}</span></span>`;
  return `<div class="avatar ${lv}" title="${tip}">${inner}</div>`;
}
function stline(s){
  const lv = lvOf(s), t = s.online ? {ok:"運作正常", warn:"需要留意", bad:"出問題了"}[lv] : "連不上這台主機";
  return `<span class="stx ${lv}" data-x><span class="dot pulse ${lv}"></span>${t}</span>`;
}
function stchip(s){
  const lv = lvOf(s), t = s.online ? {ok:"運作正常", warn:"需要留意", bad:"出問題了"}[lv] : "連不上";
  return `<span class="stchip ${lv}" data-x><span class="dot pulse ${lv}"></span>${t}</span>`;
}
const safeUrl = u => /^https?:\/\/[^\s"'<>]+$/i.test(u || "") ? u : "";
const linksOf = s => (s.links || (s.panel ? [{name:"管理後台", url:s.panel}] : []))
  .map(x => x.fixed && s.cloud && s.cloud.login ? {...x, url: s.cloud.login} : x).filter(x => safeUrl(x.url));   // 雲端硬碟用一鍵登入網址
const linkSt = x => x.up === false ? `打不開：${x.err || "連不上"}` : x.up ? `正常・${x.ms} 毫秒` : x.err ? "剛剛沒回應，再確認一次中…" : "還沒檢查";
const editBtn = s => { if (!s.online) return ""; const L = linksOf(s);
  return `<button class="iconbtn" title="編輯名稱與常用連結" data-rename="${esc(s.node||"")}" data-name="${esc(s.name)}">${I("edit")}</button>`
  + (L.length === 1 ? `<a class="iconbtn plink ${L[0].up===false?"down":""}" href="${esc(L[0].url)}" target="_blank" rel="noopener noreferrer" title="打開 ${esc(L[0].name)}（${esc(linkSt(L[0]))}）">${I("ext")}</a>`
    : L.length > 1 ? `<button class="iconbtn plink ${L.some(x=>x.up===false)?"down":""}" data-links="${esc(keyOf(s))}" title="常用連結">${I("ext")}</button>` : ""); };
function alerts(s){
  const k = t => esc(String(t).replace(/[\d.]+/g, ""));
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
function itemsSummary(items){
  const bad = items.filter(x=>x.st==="bad").length, okn = items.filter(x=>x.st==="ok").length, off = items.length-bad-okn;
  return `${okn} 個正常${off?`・${off} 個沒在用`:""}${bad?`・<b>${bad} 個異常</b>`:""}`;
}
const itemRow = (x,j) => `<div class="item" data-key="${x.t}:${esc(x.n)}" style="transition-delay:${j*35}ms"><span class="dot ${x.st}"></span><span class="n" title="${x.t}：${esc(x.n)}">${esc(x.sn||x.n)}</span><span class="tag">${esc(x.s)}</span></div>`;
/* 有分組（docker compose 專案、系統服務）就加小標題，名稱前面重複的專案名稱拿掉 */
function itemsHTML(items){
  const groups = [...new Set(items.map(x => x.g))];
  const head = groups.length > 1 || groups[0];
  let j = 0, h = "";
  for (const g of groups) {
    const gi = items.filter(x => x.g === g);
    if (head) h += `<div class="grp" data-key="grp:${esc(g)}" style="transition-delay:${j*35}ms">${g ? esc(g) : "其他容器"}<span>${gi.filter(x=>x.st==="ok").length}／${gi.length}</span></div>`;
    h += gi.map(x => itemRow(x, j++)).join("");
  }
  return h;
}
function updateInfo(s){
  const n = s.updates ? s.updates.total : 0, u = s.update;
  if (u && u.running) return n ? `正在安裝 ${n} 個更新…<br>大約 1～5 分鐘，好了會通知你` : `正在檢查有沒有新的更新…<br>有的話會順便裝好，完成會通知你`;
  let info = s.updates ? (n ? `有 ${n} 個套件可以更新${s.updates.security?`（含 ${s.updates.security} 個安全更新）`:""}` : "系統已經是最新的 ✨") : "";
  if (u && u.last) info += `${info?"<br>":""}上次更新${u.last.ok?"成功":`<span style="color:var(--bad)">失敗</span>`}・${when(u.last.time)}`;
  return info;
}
/* 按鈕永遠是同一個樣子（只在進行中變淡、不能按），進度和結果都寫在左邊的說明文字 */
function updateBtn(s){
  const u = s.update, n = s.updates ? s.updates.total : 0;
  if (!u || !u.supported) return "";
  return `<button class="ubtn" data-update="${esc(s.node||"")}" data-label="${esc(s.name)}" data-n="${n}" ${u.running ? "disabled" : ""}>${I("upd").replace("<svg","<svg style=\"width:15px;height:15px\"")}檢查更新</button>`;
}
function greet(n, total){
  const h = new Date().getHours();
  const hi = h < 5 ? "夜深了 🌙" : h < 11 ? "早安 ☀️" : h < 14 ? "午安 🌤️" : h < 18 ? "下午好 ☕" : "晚安 🌙";
  const word = total > 1 ? "所有主機" : "主機";
  const line = n.bad ? `有 ${n.bad} 台<em>出問題了</em>` : n.warn ? `有 ${n.warn} 台<em>需要留意</em>` : `${word}都<em>很健康</em>`;
  return {hi, line};
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
  if (all.length < 4) return `<div class="wait" style="height:${H}px">收集資料中，約 1 分鐘後出現…</div>`;
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
const RLABEL = {"30m":"30 分鐘", "24h":"24 小時", "7d":"7 天"};
function rangeSeg(){
  return `<span class="rng">${[["30m","30分"],["24h","24時"],["7d","7天"]].map(([v,l])=>`<button class="${RANGE===v?"on":""}" data-range="${v}">${l}</button>`).join("")}</span>`;
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
      fetch(`/api/history?range=${RANGE}&node=${encodeURIComponent(s.node || "")}`, {headers:{"X-Token":getTok()}})
        .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || "讀取失敗")))
        .then(d => { HCACHE[k] = {at: Date.now(), data: d}; if (LIST.length) render(LIST); })
        .catch(err => { HCACHE[k] = {at: Date.now(), err: String(err)}; if (LIST.length) render(LIST); });
    }
  }
  return c && c.data ? c.data : (c && c.err ? {err: c.err} : null);
}
function xlabel(h){
  if (RANGE === "30m") return `${minutes(h)} 分鐘前`;
  if (!h || !h.t || h.t.length < 2) return RLABEL[RANGE] + "前";
  const hrs = (h.t[h.t.length-1] - h.t[0]) / 3600;
  return hrs >= 36 ? `${Math.round(hrs/24)} 天前` : `${Math.max(1, Math.round(hrs))} 小時前`;
}
function chartOr(h, id, series, o){
  if (!h) return `<div class="wait" style="height:${o.h||170}px">讀取中…</div>`;
  if (h.err) return `<div class="wait" style="height:${o.h||170}px">${esc(h.err)}</div>`;
  if (RANGE !== "30m" && (!h.t || h.t.length < 2)) return `<div class="wait" style="height:${o.h||170}px">資料累積中，${RANGE==="24h"?"約 10 分鐘":"約 1 小時"}後開始出現</div>`;
  return chart(id, series(h), {...o, t: h.t});
}
const minutes = h => (h && h.t && h.t.length > 1) ? Math.max(1, Math.round((h.t[h.t.length-1]-h.t[0])/60)) : 30;
const cid = (s, k) => "g" + Math.abs([...keyOf(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))|0, 7)) + k;
const COL = {cpu:"var(--c-cpu)", mem:"var(--c-mem)", rx:"var(--c-rx)", tx:"var(--c-tx)"};
/* 概念 → [顏色樣式, 圖示] */
const ICO = {cpu:["cpu","cpu"], mem:["mem","mem"], disk:["disk","disk"], load:["load","gauge"], down:["down","down"], up:["up","up"],
  net:["net","net"], trend:["trend","trend"], month:["month","month"], box:["box","box"], bell:["bell","bell"], info:["info","info"],
  layers:["theme","layers"], flag:["theme","flag"], key:["theme","key"], finger:["theme","finger"], pin:["theme","pin"]};
const IC = (k, cls="sm") => `<span class="ico ${cls} ${ICO[k][0]}">${I(ICO[k][1])}</span>`;

/* ═════════ 手機版 ═════════ */
function metric(icon, label, pct, detail){
  return `<div class="metric">${IC(icon, "")}
    <div class="row"><span>${label}<span class="sub">${detail}</span></span><b>${num(pct)}<small>%</small></b></div>${track(pct)}</div>`;
}
function mcard(s, i){
  const lv = lvOf(s), key = keyOf(s);
  let h = `<div class="card glass ${lv==="ok"?"":lv}" data-key="${esc(key)}" data-keyed style="--i:${i}"><div class="head" data-key="hd">${avatar(s)}
    <div class="nm"><h2><span>${esc(s.name)}</span>${editBtn(s)}</h2><div class="sub">${s.online ? esc(place(s) || s.os) : (s.last_seen ? `離線・${ago(s.last_seen)}` : "目前連不上")}</div></div>`;
  if (!s.online) return h + `</div><div class="offline" data-key="off">${I("off")}<div>連不上這台主機<div class="sub">${s.last_seen?esc(seen(s))+"<br>":""}${esc(s.error||"")}</div>${peerBtn(s)}</div></div></div>`;
  h += `<span class="uptime">開機 ${up(s.uptime)}</span></div>` + alerts(s);
  h += `<div class="metrics" data-key="mt">` + metric("cpu", "處理器", s.cpu, `${s.cores} 核`) +
       metric("mem", "記憶體", s.mem.pct, `${size(s.mem.used)} / ${size(s.mem.total)}`) +
       s.disks.map(d=>metric("disk", "磁碟"+(d.path==="/"?"":" "+esc(d.path)), d.pct, `${size(d.used)} / ${size(d.total)}`)).join("") + `</div>`
       + (s.cloud && safeUrl(s.cloud.login || s.cloud.url) ? `<a class="cloudm" data-key="cl" href="${esc(s.cloud.login || s.cloud.url)}" target="_blank" rel="noopener noreferrer">${I("cloud")}<span>雲端硬碟</span>
          ${s.cloud.total ? `<b>${size(s.cloud.used)}<small> / ${size(s.cloud.total)}</small></b>` : ""}${I("ext")}</a>` : "");
  if (PREF.show.chart && s.hist) { const hh = histFor(s);
    h += `<div class="spark" data-key="sp"><div class="lbl"><span><i style="background:${COL.cpu};margin-left:0"></i>處理器<i style="background:${COL.mem}"></i>記憶體</span>${rangeSeg()}</div>
      ${chartOr(hh, cid(s,"m"), x => [{data:x.cpu,color:COL.cpu},{data:x.mem,color:COL.mem}], {max:100, h:64, fade:.25, sw:2, n:100})}</div>`; }
  h += `<div class="stats" data-key="st" data-keyed><div class="stat" data-key="load"><div class="k">${IC("load")}負載</div><div class="v">${num(s.load[0],2)}</div></div>` +
       (PREF.show.net ? `<div class="stat" data-key="down"><div class="k">${IC("down")}下載</div><div class="v num">${rate(s.net.rx)}</div></div>
        <div class="stat" data-key="up"><div class="k">${IC("up")}上傳</div><div class="v num">${rate(s.net.tx)}</div></div>` : "") + `</div>`;
  h += trafficLine(s);
  const items = itemsOf(s);
  if (PREF.show.items && items.length) h += `<div class="more ${open[key]?"open":""}" data-key="mo"><button class="more-head" data-toggle="${esc(key)}">${IC("box")}<span>容器與服務：${itemsSummary(items)}</span><span class="chev">${I("chev")}</span></button>
      <div class="collapse"><div><div class="list" data-keyed>${itemsHTML(items)}</div></div></div></div>`;
  const info = updateInfo(s), btn = updateBtn(s);
  if (info || btn) h += `<div class="foot" data-key="ft"><div class="sub" data-x>${info}</div>${btn}</div>`;
  return h + `</div>`;
}
function summary(n, clickable){
  const p = (k, label) => `<button class="pill glass ${k} ${FILTER===k?"on":""}" ${clickable?`data-filter="${k}"`:""}><span class="dot ${k}"></span>${label} <b class="num">${n[k]}</b></button>`;
  return `<div class="summary ${FILTER&&clickable?"filtering":""}"><span class="pind" data-keep></span>${p("ok","正常")}${p("warn","注意")}${p("bad","異常")}</div>`;
}
function renderMobile(list, n, time){
  const many = true;
  const shown = FILTER ? list.filter(s=>lvOf(s)===FILTER) : list, g = greet(n, list.length);
  return `<div class="dash m" data-key="m"><header class="bar"><span class="mini">VPS 哨兵</span><span class="grow"></span>
    <button class="cap glass ${list.some(s=>s.self_has)?"hasnew":""}" data-settings title="設定">${I("gear")}</button><button class="cap glass" data-logout title="登出">${I("logout")}</button></header>
    <div class="hero"><div class="hello">${g.hi}</div><h1 data-x>${g.line}</h1><div class="meta"><span class="live"></span>更新於 ${time}</div></div>
    ${summary(n, many)}
    <div class="grid" data-keyed>${shown.length ? shown.map(mcard).join("") : `<div class="empty" data-key="empty">這個分類目前沒有主機 👍</div>`}</div></div>`;
}

/* ═════════ 電腦版 ═════════ */
function hostItem(s, on){
  let h = `<button class="host ${on?"on":""}" data-sel="${esc(keyOf(s))}" data-key="${esc(keyOf(s))}"><div class="head">${avatar(s)}
    <div class="nm"><h2><span>${esc(s.name)}</span></h2><div class="sub">${s.online ? esc(place(s) || s.os) : (s.last_seen ? `離線・${ago(s.last_seen)}` : "連不上")}</div></div></div>`;
  if (s.online) h += `<div class="minis"><div><div class="k">處理器<b>${num(s.cpu)}%</b></div>${track(s.cpu)}</div>
    <div><div class="k">記憶體<b>${num(s.mem.pct)}%</b></div>${track(s.mem.pct)}</div></div>`;
  return h + `</button>`;
}
/* 雲端硬碟入口：放在磁碟卡片標題旁，點了直接打開 */
function cloudChip(s){
  const c = s.cloud, href = c && (c.login || c.url); if (!c || !safeUrl(href)) return "";
  const L = (s.links || []).find(x => x.fixed), down = L && L.up === false;
  const use = c.total ? `${size(c.used)} / ${size(c.total)}` : "";
  return `<a class="cchip ${down ? "down" : c.pct >= 90 ? "warn" : ""}" href="${esc(href)}" target="_blank" rel="noopener noreferrer"
    title="打開雲端硬碟${use ? `（已用 ${use}）` : ""}${down ? `・目前打不開：${esc(L.err || "")}` : ""}">${I("cloud")}<span>雲端${c.total ? ` ${num(c.pct)}%` : ""}</span>${I("ext")}</a>`;
}
function ring(icon, label, pct, sub, i, extra = ""){
  const r = 52, Cc = 2*Math.PI*r, off = Cc*(1-Math.max(0,Math.min(pct,100))/100);
  return `<div class="gauge glass panel" style="--i:${i}"><div class="ph">${IC(icon)}<h3>${label}</h3>${extra}</div>
    <div class="gwrap"><svg viewBox="0 0 120 120"><circle class="rt" cx="60" cy="60" r="${r}"/>
    <circle class="rv ${tier(pct)}" cx="60" cy="60" r="${r}" style="--c:${Cc.toFixed(1)};stroke-dasharray:${Cc.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}"/></svg>
    <div class="gin"><b>${num(pct)}<small>%</small></b><span>${sub}</span></div></div></div>`;
}
/* 主機概況：只放上面沒出現過、又真的有用的數字 */
/* IPv6：固定一行（有沒有設定都佔同樣位置，每台主機的版面一樣高） */
function v6line(s, shown){
  const v = s.ipv6;
  if (!v) return "";                                       // 沒有 IPv6：不特別顯示
  if (!v.addr) return `<span class="v6 warn">IPv6 位址不見了</span>`;
  const st = v.ok === false ? `<i class="ld bad"></i>連不出去` : v.ok ? `<i class="ld ok"></i>正常` : `<i class="ld"></i>檢查中`;
  return shown ? `<span class="v6 a" data-copy="${esc(v.addr)}" title="點一下複製">${esc(v.addr)}</span>`
    : `<span class="v6 ${v.ok === false ? "warn" : ""}">IPv6 ${st}</span>`;
}
/* 主機概況：每個數字都附上「代表什麼」，一眼看懂 */
const IPSHOW = {};                    // 哪幾台的 IP 目前是顯示狀態（到期自動再遮起來）
function sysPanel(s){
  const l = s.load[0], lr = l / (s.cores || 1);
  const [lw, lt] = lr < .7 ? ["輕鬆", "ok"] : lr < 1 ? ["有點忙", "warn"] : lr < 2 ? ["忙碌", "warn"] : ["超載", "bad"];
  const c = s.conns, avg = s.conns_avg;
  const cw = c == null ? "" : avg == null ? "統計中" : (c > avg * 2 && c - avg > 20) ? "比平常多很多" : (avg > 10 && c < avg * .3) ? "比平常少很多" : "跟平常差不多";
  const ip = s.geo && s.geo.ip, org = s.geo && s.geo.org, k = keyOf(s), shown = IPSHOW[k] > Date.now();
  const extra = s.disks.slice(1).map(d => `磁碟 ${esc(d.path)} ${num(d.pct)}%`)
    .concat(s.mem.swap_total ? [`虛擬記憶體 ${num(s.mem.swap_pct)}%`] : []);
  return `<div class="panel glass sysp" data-key="fp" style="--i:4"><div class="ph">${IC("info")}<h3>主機概況</h3></div>
    <div class="facts2">
      <div class="fr" title="最近 1／5／15 分鐘的平均負載：${s.load.map(x=>x.toFixed(2)).join("／")}（${s.cores} 核心，超過 ${s.cores} 就算忙）">
        <span class="k">負載</span><b class="${lt}">${lw}</b><span class="d">${l.toFixed(2)}／${s.cores} 核</span>
        <div class="lbar"><i class="${lt}" style="width:${Math.min(100, lr / 2 * 100).toFixed(0)}%"></i></div></div>
      <div class="fr" title="這台主機現在有多少條網路連線；「平常」是最近 1 小時的平均${avg != null ? `（約 ${Math.round(avg)} 條）` : ""}">
        <span class="k">連線</span><b>${c == null ? "—" : Number(c).toLocaleString("zh-TW")} <small>條</small></b><span class="d ${cw.includes("多很多") ? "warn" : ""}">${cw}</span></div>
      ${ip ? `<div class="fr"><span class="k">IP</span><b class="ipb ${shown ? "on" : ""}" ${shown ? `data-copy="${esc(ip)}" title="點一下複製（15 秒後會自動遮起來）"` : `data-reveal="${esc(k)}" title="點一下顯示"`}>${esc(ip)}</b>
        ${s.ipv6 || org ? `<span class="d org">${v6line(s, shown)}${org ? `<span class="on2">${s.ipv6 ? "・" : ""}${esc(org)}</span>` : ""}</span>` : ""}</div>` : ""}
    </div>${extra.length ? `<div class="fx">${extra.join("・")}</div>` : ""}</div>`;
}
function detail(s){
  const key = keyOf(s), where = place(s);
  let h = `<div class="detail" data-key="detail" data-keyed><div class="panel glass dhead" data-key="dh" style="--i:0">
      <div style="min-width:0" data-key="dl" data-keyed><h2 class="nmh" data-key="nm" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span>${esc(s.name)}</span>${editBtn(s)}</h2>
      <div class="sub dsub" data-key="ds">${s.online ? `<span title="核心版本 ${esc(s.kernel)}">${where?esc(where)+"・":""}${esc(s.os)}・開機 ${up(s.uptime)}</span>` : `<span>${s.last_seen ? esc(seen(s)) : "目前沒有回應"}</span>`}</div>${s.online ? alerts(s) : ""}</div>
      ${s.online ? `<div class="act"><div class="sub" data-x style="line-height:1.6;font-weight:600">${updateInfo(s)}</div>${updateBtn(s)}</div>` : ""}</div>`;
  if (!s.online) return h + `<div class="panel glass bigoff" data-key="off" style="--i:1"><b>連不上這台主機</b>${esc(s.error||"")}${peerBtn(s)}</div></div>`;
  const fp = PREF.show.info ? sysPanel(s) : "";
  const d0 = s.disks[0] || {pct:0, used:0, total:0};
  h += `<div class="gauges" data-key="gg" style="${fp?"":"grid-template-columns:repeat(3,minmax(0,1fr))"}">${ring("cpu", "處理器", s.cpu, `${s.cores} 核心`, 1)}
        ${ring("mem", "記憶體", s.mem.pct, `${size(s.mem.used)} / ${size(s.mem.total)}`, 2)}
        ${ring("disk", "磁碟", d0.pct, `${size(d0.used)} / ${size(d0.total)}`, 3, cloudChip(s))}${fp}</div>`;
  const hs = histFor(s), xl = `<div class="xl" style="align-items:center"><span>${xlabel(hs)}</span>${rangeSeg()}<span>現在</span></div>`;
  const cp = PREF.show.chart ? `<div class="panel glass" data-key="cp" style="--i:4"><div class="ph">${IC("trend")}<h3>處理器與記憶體</h3><div class="legend">
      <span><i style="background:${COL.cpu}"></i>處理器<b>${num(s.cpu)}%</b></span><span><i style="background:${COL.mem}"></i>記憶體<b>${num(s.mem.pct)}%</b></span></div></div>
      <div class="cbox">${chartOr(hs, cid(s,"a"), x => [{data:x.cpu,color:COL.cpu,name:"處理器"},{data:x.mem,color:COL.mem,name:"記憶體"}], {max:100, grid:1, fmt:v=>Math.round(v)+"%"})}</div>${xl}</div>` : "";
  const np = PREF.show.net ? `<div class="panel glass" data-key="np" style="--i:5"><div class="ph">${IC("net")}<h3>網路速度</h3><div class="legend">
      <span><i style="background:${COL.rx}"></i>下載<b class="num">${rate(s.net.rx)}</b></span><span><i style="background:${COL.tx}"></i>上傳<b class="num">${rate(s.net.tx)}</b></span></div></div>
      <div class="cbox">${chartOr(hs, cid(s,"b"), x => [{data:x.rx,color:COL.rx,name:"下載"},{data:x.tx,color:COL.tx,name:"上傳"}], {grid:1, bin:1, fmt:rate})}</div>${xl}</div>` : "";
  if (cp || np) h += `<div class="charts" data-key="ch" data-keyed style="${cp&&np?"":"grid-template-columns:1fr"}">${cp}${np}</div>`;
  const items = itemsOf(s);
  const ip = PREF.show.items ? `<div class="panel glass" data-key="ip" style="--i:6"><div class="ph">${IC("box")}<h3>容器與服務</h3><span class="sub" style="margin-left:auto;font-weight:700">${items.length?itemsSummary(items).replace("<b>",'<b style="color:var(--bad)">'):""}</span></div>
      ${items.length ? `<div class="tbl" data-keyed>${itemsHTML(items)}</div>` : `<div class="sub">沒有偵測到容器或服務</div>`}</div>` : "";
  const ep = eventsPanel(s), tp = trafficPanel(s);
  if (ip || ep || tp) h += `<div class="lower" data-key="lw" data-keyed>${tp}${ep}${ip}</div>`;
  return h + `</div>`;
}
function overview(list){
  const on = list.filter(s => s.online);
  if (!on.length) return "";
  const tr = PREF.show.traffic ? on.filter(s => s.traffic) : [];
  const score = s => s.traffic.limit ? Math.max(s.traffic.pct || 0, s.traffic.projected ? s.traffic.projected / s.traffic.limit * 100 : 0) : -1;
  tr.sort((a, b) => score(b) - score(a));
  const rows = tr.slice(0, 4).map(s => { const t = s.traffic, over = t.limit && t.projected > t.limit;
    return `<div class="tq" data-key="${esc(keyOf(s))}"><div class="r"><span class="nm">${esc(s.name)}</span><b class="num">${t.limit ? num(t.pct) + "%" : size(t.used)}</b></div>
      ${t.limit ? track(t.pct) : ""}<div class="s ${over?"warn":""}">${t.limit ? `${size(t.used)} / ${size(t.limit)}・` : "沒有設定上限・"}${over ? "照目前速度會超過" : `還有 ${t.days_left} 天重置`}</div></div>`; }).join("");
  const items = on.flatMap(itemsOf), ok = items.filter(x=>x.st==="ok").length, bad = items.filter(x=>x.st==="bad").length, off = items.length-ok-bad;
  const pc = v => items.length ? (v / items.length * 100).toFixed(1) : 0;
  if (!rows && !items.length) return "";
  return `<div class="ovw" data-keyed>${rows ? `<div class="tqw" data-key="tqw"><h4>${IC("month")}本月流量</h4><div class="tqs" data-keyed>${rows}</div></div>` : ""}
    ${items.length ? `<div class="bar2" data-key="b2"><i style="width:${pc(ok)}%;background:var(--ok)"></i><i style="width:${pc(off)}%;background:var(--faint)"></i><i style="width:${pc(bad)}%;background:var(--bad)"></i></div>
    <div class="cap2" data-key="c2"><span>全部容器與服務</span><span>${ok} 正常${off?`・${off} 沒在用`:""}${bad?`・${bad} 異常`:""}</span></div>` : ""}</div>`;
}
const CNT = {both:"上傳＋下載", out:"只算上傳", in:"只算下載", max:"取較大的"};
function trafficBars(t, id){
  const W = 600, H = 64, n = Math.max(t.cycle_days, t.daily.length), bw = W / n, gap = Math.min(4, bw * .25);
  const max = Math.max(1, ...t.daily.map(d => d.rx + d.tx));
  const rects = t.daily.map((d, i) => {
    const x = i * bw + gap / 2, w = Math.max(1, bw - gap), hr = d.rx / max * (H - 2), ht = d.tx / max * (H - 2);
    return `<rect x="${x.toFixed(1)}" y="${(H - hr - ht).toFixed(1)}" width="${w.toFixed(1)}" height="${ht.toFixed(1)}" rx="2" style="fill:${COL.tx}"><title>${d.d}：上傳 ${size(d.tx)}</title></rect>`
         + `<rect x="${x.toFixed(1)}" y="${(H - hr).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, hr).toFixed(1)}" rx="2" style="fill:${COL.rx}"><title>${d.d}：下載 ${size(d.rx)}</title></rect>`;
  }).join("");
  const rest = n > t.daily.length ? `<rect x="${(t.daily.length * bw).toFixed(1)}" y="${H-3}" width="${((n - t.daily.length) * bw).toFixed(1)}" height="3" rx="1.5" style="fill:var(--track)"/>` : "";
  return `<svg class="bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${rects}${rest}</svg>`;
}
function trafficPanel(s){
  const t = s.traffic; if (!t || !PREF.show.traffic) return "";
  const pct = t.pct, lim = t.limit;
  const pp = t.projected && lim ? Math.round(t.projected / lim * 100) : null;
  const proj = t.projected ? `${size(t.projected)}${pp != null ? `<div class="sub" style="font-weight:700;${pp>100?"color:var(--warn)":""}">上限的 ${pp}%</div>` : ""}` : "累積中";
  return `<div class="panel glass trf" data-key="tp" style="--i:9"><div class="ph">${IC("month")}<h3>本月流量</h3>
      <span class="sub" style="margin-left:auto;font-weight:700">${CNT[t.count]}</span><button class="iconbtn" data-traffic="${esc(s.node||"")}" data-label="${esc(s.name)}" title="流量設定">${I("gear")}</button></div>
    <div class="tgrid"><div class="tl"><div class="big"><b class="num">${size(t.used)}</b><span>${lim ? `／ ${size(lim)}` : "沒有設定上限"}</span>${pct!=null?`<span style="margin-left:auto;color:var(--text)">${num(pct,1)}%</span>`:""}</div>
    ${lim ? track(pct) : ""}
    <div class="rows"><div><div class="k"><i class="kd" style="background:${COL.rx}"></i>下載</div><b class="num">${size(t.rx)}</b></div><div><div class="k"><i class="kd" style="background:${COL.tx}"></i>上傳</div><b class="num">${size(t.tx)}</b></div>
      <div><div class="k">預估月底</div><b>${proj}</b></div><div><div class="k">${t.reset_day} 號重置</div><b>還有 ${t.days_left} 天</b></div></div></div>
    <div class="tr">${trafficBars(t)}
    <div class="xl"><span>${t.start.slice(5).replace("-","/")}</span><span>${t.prev!=null?`上個週期 ${size(t.prev)}`:""}</span><span>${t.end.slice(5).replace("-","/")}</span></div>
    ${t.partial ? `<div class="note">從 ${new Date(t.since*1000).toLocaleDateString("zh-TW",{month:"numeric",day:"numeric"})} 開始統計，之前的流量沒有算進去</div>` : ""}</div></div></div>`;
}
function trafficLine(s){
  const t = s.traffic; if (!t || !PREF.show.traffic) return "";
  const lim = t.limit;
  return `<div class="tline" data-key="tl" data-traffic="${esc(s.node||"")}" data-label="${esc(s.name)}">
    <div class="r1">${IC("month")}本月流量<b class="num">${size(t.used)}${lim?`<small>／ ${size(lim)}</small>`:""}</b></div>
    ${lim ? track(t.pct) : ""}
    <div class="r2"><span>${t.projected ? `預估月底 ${size(t.projected)}` : "預估累積中"}</span><span>${t.reset_day} 號重置・還有 ${t.days_left} 天</span></div></div>`;
}
async function trafficModal(node, label){
  const s = LIST.find(x => (x.node || "") === node), t = s && s.traffic;
  if (!t) return;
  let mode = t.count;
  const days = Array.from({length:28}, (_, i) => `<option value="${i+1}" ${t.reset_day===i+1?"selected":""}>每月 ${i+1} 號</option>`).join("");
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog glass pop">${IC("month","big")}<h3>「${esc(label)}」流量設定</h3>
    <div class="form">
      <label>每月流量上限（GB）<input class="field" type="number" inputmode="decimal" min="0" step="any" value="${t.limit ? +(t.limit/1073741824).toFixed(3) : ""}" placeholder="不限制就留空"></label>
      <label>每月幾號重置<select class="field">${days}</select></label>
      <label>怎麼計算<div class="seg" style="flex-wrap:wrap">${Object.entries(CNT).map(([k,l])=>`<button type="button" class="${mode===k?"on":""}" data-m="${k}">${l}</button>`).join("")}</div>
        <small>甲骨文等很多主機商只算「上傳」；不確定就選「上傳＋下載」</small></label>
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
/* 同一件事反覆發生：只留最新一筆，標上次數 */
function mergeEv(ev){
  const m = new Map();
  for (const e of ev) { const k = e.kind + ":" + e.text, x = m.get(k); x ? x.n++ : m.set(k, {...e, n:1}); }
  return [...m.values()];
}
function eventsPanel(s){
  const ev = s.events;
  if (!ev) return "";
  const word = {bad:"異常", warn:"注意", ok:"恢復", info:"通知"};
  return `<div class="panel glass" data-key="ep" style="--i:8"><div class="ph">${IC("bell")}<h3>事件紀錄</h3><span class="sub" style="margin-left:auto;font-weight:700">最近 ${ev.length} 筆</span></div>
    ${ev.length ? `<div class="evs" data-keyed>${mergeEv(ev).map(e=>`<div class="ev" data-key="${e.kind}:${esc(e.text)}"><span class="dot ${e.kind}"></span><div><div>${esc(e.text)}</div><div class="sub">${word[e.kind]||""}・${ago(e.t)}${e.n>1?`・共 ${e.n} 次`:""}</div></div></div>`).join("")}</div>`
      : `<div class="calm">目前沒有事件，一切平靜 ☕</div>`}</div>`;
}
function renderDesk(list, n, time){
  const sel = list.find(s=>keyOf(s)===SEL) || list[0], g = greet(n, list.length);
  return `<div class="dash d" data-key="d"><aside class="side glass">
      <div class="brand"><svg class="" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lbbr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--a1) 70%,#fff)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient><linearGradient id="lhbr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="lmbr"><rect width="512" height="512" fill="#fff"/><path d="M204 258l36 36 72-76" fill="none" stroke="#000" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="512" height="512" rx="115" fill="url(#lbbr)"/><rect width="512" height="512" rx="115" fill="url(#lhbr)"/><path d="M256 108 371 150c9 3 15 12 15 22v72c0 84-52 140-122 168-5 2-11 2-16 0-70-28-122-84-122-168v-72c0-10 6-19 15-22Z" fill="#fff" mask="url(#lmbr)" transform="translate(256 262) scale(.88) translate(-256 -258)"/></svg><div><h1>VPS 哨兵</h1><div class="meta"><span class="live"></span>更新於 ${time}</div></div></div>
      <div class="greet">${g.hi}<br><b>${g.line.replace(/<\/?em>/g,"")}</b></div>
      ${summary(n, true)}
      <div class="hosts" data-keyed>${(FILTER ? list.filter(s=>lvOf(s)===FILTER) : list).map(s=>hostItem(s, s===sel)).join("") || `<div class="empty" data-key="empty">這個分類目前沒有主機 👍</div>`}</div>
      ${overview(list)}
      <div class="side-foot"><span class="sub">${list.length} 台主機</span>
        <button class="iconbtn ${REFRESHING?"spinning":""}" data-refresh title="重新整理">${I("upd")}</button>
        <button class="iconbtn ${list.some(s=>s.self_has)?"hasnew":""}" data-settings title="設定">${I("gear")}</button><button class="iconbtn" data-logout title="登出">${I("logout")}</button></div>
    </aside>${sel ? detail(sel) : ""}</div>`;
}
function skeleton(){
  return DESK.matches
    ? `<div class="dash d" data-key="sk"><aside class="side glass skel" style="height:520px"></aside><div class="detail"><div class="panel glass skel" style="height:96px"></div><div class="panel glass skel" style="height:240px"></div><div class="panel glass skel" style="height:260px"></div></div></div>`
    : `<div class="dash m" data-key="sk"><div class="hero"><div class="hello">連線中…</div><h1>正在讀取<em>主機狀態</em></h1></div><div class="grid"><div class="card glass skel"></div></div></div>`;
}

/* ═════════ 只更新有變動的地方 ═════════ */
/* 曲線變形：兩條路徑的數字一一對應，每一格畫面算一次中間值（iPhone 也能動） */
const NUM = /-?\d+(?:\.\d+)?/g;
/* 不在畫面上的曲線就不做變形動畫，直接換成新的（手機上兩台主機的曲線常常有一半在畫面外） */
const SEEN = new WeakMap();
const seenIO = window.IntersectionObserver ? new IntersectionObserver(es => es.forEach(e => SEEN.set(e.target, e.isIntersecting))) : null;
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
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
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
  if (!isFinite(from) || !isFinite(to) || !canAnim()) { el.textContent = (+to).toFixed(d); return; }
  let t0 = null; const dur = T.slow;
  const stepf = now => {
    if (t0 === null) t0 = now;                                   // 用第一格畫面當起點，時間不會倒退
    const k = Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
    el.textContent = (from + (to - from) * e).toFixed(d);
    if (k < 1) el._raf = requestAnimationFrame(stepf); else el.textContent = (+to).toFixed(d);
  };
  el._raf = requestAnimationFrame(stepf);
}
/* 共用動畫規則（跟 CSS 的 --t-*、--ease 一致） */
const T = {fast:200, mid:350, slow:600};
const EASE = "cubic-bezier(.22,1,.36,1)", SPRING = "cubic-bezier(.34,1.4,.64,1)", EXIT = "cubic-bezier(.4,0,1,1)";
const canAnim = () => PREF.motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
/* 讓元素平順地離開：先淡出、收起高度，再移除 */
const BLOCK = ".alert,.item,.grp,.tq,.tqw,.card,.host,.empty,.spark,.ev,.more,.foot,.alerts,.offline,.strip,.charts,.lower,.gauges";
const TILE = ".panel,.stat,.tile,.gauge";
function flipSiblings(parent, change){
  const kids = [...parent.children].filter(c => !c._leaving), r0 = kids.map(c => c.getBoundingClientRect());
  change();
  kids.forEach((c, i) => { if (!c.isConnected) return; const r = c.getBoundingClientRect(), dx = r0[i].left - r.left, dy = r0[i].top - r.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) c.animate([{transform:`translate(${dx}px,${dy}px)`}, {transform:"none"}], {duration:T.mid, easing:EASE, id:"ui"}); });
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
function morph(a, b){
  if (a.nodeType!==b.nodeType || a.nodeName!==b.nodeName ||
      (a.nodeType===1 && (a.getAttribute("data-key")||"")!==(b.getAttribute("data-key")||""))) { a.replaceWith(b); return; }
  if (a.nodeType===3 || a.nodeType===8){ if (a.nodeValue!==b.nodeValue) a.nodeValue=b.nodeValue; return; }
  if (a.nodeType!==1) return;
  if (!a._xing && a.isEqualNode(b)) return;                  // 整塊都沒變（圖示、標題…）：直接跳過，不用一個一個比
  if (a.classList.contains("ubtn") && a.innerHTML !== b.innerHTML) {
    return flipWidth(a, () => { patch(a, b); a.animate([{opacity:.35}, {opacity:1}], {duration:T.mid, easing:EASE}); });
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
function keyedPatch(a, b){
  const old = new Map();
  [...a.children].forEach(c => { if (!c._leaving) old.set(c.getAttribute("data-key") || "", c); });
  // 項目的順序、數量都沒變時，不會有東西移位，就不用量位置（量位置會逼瀏覽器整頁重新排版）
  const moved = [...old.keys()].join("\n") !== [...b.children].map(c => c.getAttribute("data-key") || "").join("\n");
  const anim = canAnim(), first = new Map();
  if (anim && moved) old.forEach((c, k) => first.set(k, c.getBoundingClientRect()));
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
    if (el !== ref) a.insertBefore(el, ref || null);
    prev = el;
  });
  const leaving = [...old.values()];
  // 會撐開／收起空間的進出場，留下的項目會跟著空間自然移動，不另外移位
  const flowing = anim && [...leaving, ...fresh].some(x => x.nodeType === 1 && !x.matches(TILE));
  leaving.forEach(c => leave(c));
  if (anim) fresh.forEach((el, j) => {
    if (el.nodeType !== 1) return;
    if (el.matches(TILE)) el.animate([{opacity:0, transform:"scale(.95)"}, {opacity:1, transform:"none"}], {duration:T.mid, delay:j*50, easing:EASE, fill:"backwards", id:"ui"});
    else enterBlock(el, (leaving.length ? 200 : 0) + j*90);   // 有東西要離開時，等它先淡出再進來
  });
  if (anim && moved && !flowing) keep.forEach(([k, el]) => {   // 只有單純換位置時才平滑移位
    const f = first.get(k), l = el.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{transform:`translate(${dx}px,${dy}px)`}, {transform:"none"}], {duration:T.mid, easing:EASE, id:"ui"});
  });
}
function patch(a, b){
  if (a.hasAttribute("data-keep")) return;     /* 由程式自己控制的元素（例如滑動光圈），不要被重畫蓋掉 */
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of [...b.attributes]) if (a.getAttribute(at.name)!==at.value){
    if (at.name==="data-v") tween(a, parseFloat(a.getAttribute("data-v"))||0, parseFloat(at.value)||0, +b.getAttribute("data-d")||0);
    if (at.name==="d" && a.tagName==="path" && morphPath(a, a.getAttribute("d"), at.value)) continue;
    a.setAttribute(at.name, at.value);
  }
  if (a.hasAttribute("data-v")) return;
  if (a.hasAttribute("data-keyed")) return keyedPatch(a, b);
  const ac=[...a.childNodes].filter(n=>!n._leaving), bc=[...b.childNodes];
  bc.forEach((n,i)=>{ if (ac[i]) morph(ac[i], n); else a.appendChild(n); });
  for (let i=bc.length;i<ac.length;i++) leave(ac[i]);
}
function paint(html){
  const tpl = document.createElement("template"); tpl.innerHTML = html.trim();
  const cur = $("#app .dash");
  if (cur) morph(cur, tpl.content.firstElementChild); else { $("#app").innerHTML = ""; $("#app").appendChild(tpl.content.firstElementChild); }
}
function edgeFades(el){
  const t = el.scrollTop > 2, b = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
  if (el.classList.contains("ft") !== t) el.classList.toggle("ft", t);
  if (el.classList.contains("fb") !== b) el.classList.toggle("fb", b);
}
document.addEventListener("scroll", e => { const el = e.target; if (el.matches && el.matches(".hosts,.evs,.tbl,.kv")) edgeFades(el); }, {capture:true, passive:true});
function placePind(){
  document.querySelectorAll("#app .summary").forEach(sm => {
    const ind = sm.querySelector(".pind"), on = sm.querySelector(".pill.on");
    if (!ind) return;
    const st = c => ["ok","warn","bad"].find(x => ind.classList.contains(x)) || "";
    if (on) {
      const pos = `translate(${on.offsetLeft}px,${on.offsetTop}px)`;
      if (!ind.classList.contains("show")) {         // 第一次出現：直接在原地放大浮現，不要從左邊拉過來
        ind.classList.add("noanim");
        ind.style.width = on.offsetWidth + "px"; ind.style.height = on.offsetHeight + "px";
        ind.style.transform = pos + " scale(.82)"; ind.className = "pind noanim " + on.dataset.filter;
        void ind.offsetWidth; ind.classList.remove("noanim");
      }
      ind.style.width = on.offsetWidth + "px"; ind.style.height = on.offsetHeight + "px";
      ind.style.transform = pos + " scale(1)"; ind.className = "pind show " + on.dataset.filter;
    } else if (ind.classList.contains("show")) {    // 取消篩選：原地縮小淡出
      ind.style.transform = ind.style.transform.replace("scale(1)", "scale(.82)"); ind.className = "pind " + st();
    }
  });
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
  LIST = list; flagAccent();
  const n = {ok:0,warn:0,bad:0}; list.forEach(s=>n[lvOf(s)]++);
  const time = new Date().toLocaleTimeString("zh-TW",{hour12:false});
  paint(DESK.matches ? renderDesk(list, n, time) : renderMobile(list, n, time));
  placePind();
  document.querySelectorAll("#app .hosts,#app .evs,#app .tbl,#app .kv").forEach(edgeFades);
  if (TIPX) drawTip(...TIPX);
  trackCenter();
}
DESK.addEventListener("change", () => { applyPrefs(); if (LIST.length) render(LIST); });

/* ═════════ 對話框、通知 ═════════ */
function modal({icon, cls="box", title, text, input, ok="確定", cancel="取消"}){
  return new Promise(res => {
    const v = document.createElement("div"); v.className = "veil";
    v.innerHTML = `<div class="dialog glass pop">${icon?`<div class="ico big ${cls}">${I(icon)}</div>`:""}<h3>${esc(title)}</h3>${text?`<p>${esc(text)}</p>`:""}
      ${input!==undefined?`<input class="field" maxlength="40" value="${esc(input)}">`:""}
      <div class="btns"><button class="ubtn ghost" data-r="0">${cancel}</button><button class="ubtn" data-r="1">${ok}</button></div></div>`;
    $("#layer").appendChild(v);
    const inp = v.querySelector("input");
    const done = r => { if (v._d) return; v._d = 1; v.classList.add("closing"); const val = r ? (inp ? inp.value : true) : null;
      setTimeout(()=>{ v.remove(); res(val); }, 360); };
    v._esc = () => done(0);
    if (inp) { setTimeout(()=>{ inp.focus(); inp.select(); }, 60); inp.addEventListener("keydown", e => { if (e.key==="Enter") done(1); if (e.key==="Escape") done(0); }); }
    v.addEventListener("click", e => { if (e.target === v) return done(0); const b = e.target.closest("[data-r]"); if (b) done(+b.dataset.r); });
  });
}
/* 切換主機：舊內容先淡出，換成全新的一頁，再一塊一塊浮上來（不讓兩台的內容互相變形） */
let SWID = 0;
/* 要動的是每一塊玻璃本身：如果讓外層容器變透明，裡面玻璃的模糊會暫時「看不到」背景而變暗，結束時又突然亮起來 */
function swParts(root){
  const g = [...root.querySelectorAll(".glass")].filter(el => !el.parentElement.closest(".glass"));
  return g.concat([...root.children].filter(c => !c.classList.contains("glass") && !c.querySelector(".glass")));
}
async function switchHost(){
  const id = ++SWID, old = $("#app .detail");
  if (!old || !DESK.matches || !canAnim()) return render(LIST);
  old.setAttribute("data-keep", "");               // 淡出期間左邊選單照常更新，右邊先不動
  const R = document.documentElement; R.classList.add("qacc");
  clearTimeout(R._qacc); R._qacc = setTimeout(() => R.classList.remove("qacc"), 400);
  render(LIST);
  const t0 = performance.now();
  const outs = swParts(old).map(el => {
    const o0 = +getComputedStyle(el).opacity;     // 連點時從目前的透明度接著淡，不要閃回來
    el.getAnimations().forEach(x => x.cancel());
    return el.animate([{opacity:o0, transform:"none"}, {opacity:0, transform:"translateY(-6px)"}],
      {duration:T.fast, easing:EXIT, fill:"forwards", id:"ui"}).finished.catch(()=>{});
  });
  await Promise.all(outs);
  const sel = LIST.find(s => keyOf(s) === SEL);
  if (sel && RANGE !== "30m") {                    // 24 小時／7 天：等新主機的資料一下，避免先看到「讀取中」
    const k = keyOf(sel) + "|" + RANGE;
    while (HCACHE[k] && HCACHE[k].loading && performance.now() - t0 < 600) await new Promise(r => setTimeout(r, 30));
  }
  if (id !== SWID || !old.isConnected) return;     // 又點了別台：交給最新那次處理
  const tpl = document.createElement("template"); tpl.innerHTML = sel ? detail(sel).trim() : "";
  const fresh = tpl.content.firstElementChild;
  if (!fresh) { old.remove(); return render(LIST); }
  old.replaceWith(fresh);
  fresh.getAnimations({subtree:true}).forEach(x => x.animationName === "rise" && x.cancel());  // 不跑第一次載入的浮現，改用下面較快的版本
  render(LIST);
  const parts = swParts(fresh), tops = parts.map(el => Math.round(el.getBoundingClientRect().top / 40));
  const rows = [...new Set(tops)].sort((x, y) => x - y);       // 同一排的一起出現，由上往下
  parts.forEach((el, i) => {
    el.animate([{opacity:0, transform:"translateY(10px)"}, {opacity:1, transform:"none"}],
      {duration:T.mid, delay:rows.indexOf(tops[i]) * 50, easing:EASE, fill:"backwards", id:"ui"});
  });
}
/* 滑鼠移到曲線上：顯示那個時間點的數值 */
let TIPX = null;
function tipEls(){
  let t = $("#ctip");
  if (!t) { t = document.createElement("div"); t.id = "ctip"; t.className = "glass pop"; document.body.appendChild(t);
    const l = document.createElement("div"); l.id = "cline"; document.body.appendChild(l); }
  return [t, $("#cline")];
}
function hideTip(){ TIPX = null; const t = $("#ctip"); if (t) { t.classList.remove("show"); $("#cline").classList.remove("show"); } }
function drawTip(x, y){
  const el = document.elementFromPoint(x, y), box = el && el.closest && el.closest(".cbox");
  const svg = box && box.querySelector("svg.chart[data-cid]"), d = svg && CHD[svg.dataset.cid];
  if (!d || !d.ser[0] || !d.ser[0].data || d.ser[0].data.length < 2) return hideTip();
  TIPX = [x, y];
  const r = svg.getBoundingClientRect(), f = Math.max(0, Math.min(1, (x - r.left) / r.width));
  const n = d.ser[0].data.length, i = Math.round(f * (n - 1)), t = d.t && d.t[i];
  const dt = t ? new Date(t * 1000) : null, hm = dt ? dt.toLocaleTimeString("zh-TW", {hour:"2-digit", minute:"2-digit", hour12:false}) : "";
  const when = !dt ? "" : RANGE === "7d" ? `${dt.getMonth()+1}/${dt.getDate()} ${hm}` : hm;
  const [tip, line] = tipEls();
  tip.innerHTML = `<div class="tt">${when}</div>` + d.ser.map(s => `<div class="tr2"><i style="background:${s.color}"></i>${esc(s.name||"")}<b class="num">${d.fmt(s.data[i] ?? 0)}</b></div>`).join("");
  const lx = r.left + f * r.width;
  line.style.cssText = `left:${lx}px;top:${r.top}px;height:${r.height}px`;
  const w = tip.offsetWidth || 150, left = lx + 14 + w > innerWidth - 8 ? lx - 14 - w : lx + 14;
  tip.style.left = left + "px"; tip.style.top = (r.top + 6) + "px";
  tip.classList.add("show"); line.classList.add("show");
}
document.addEventListener("pointermove", e => {
  if (e.pointerType !== "mouse") return;
  if (e.target.closest && e.target.closest(".cbox")) drawTip(e.clientX, e.clientY); else if (TIPX) hideTip();
}, {passive:true});
addEventListener("scroll", () => { if (TIPX) hideTip(); }, {passive:true});
document.addEventListener("pointerleave", hideTip);
/* 整頁平順切換：支援的瀏覽器會淡入淡出，不支援就直接換 */
function smooth(fn, theme, relayout){
  const motion = PREF.motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!motion) return fn();
  if (isLite()) {                       // 輕量模式：蓋一層舊底色再淡出，便宜又順
    if (theme || relayout) {
      const x = document.createElement("div"); x.className = "xfade";
      x.style.background = getComputedStyle(document.documentElement).backgroundColor;
      if (!theme) x.style.animationDuration = ".38s";
      document.body.appendChild(x); setTimeout(() => x.remove(), 500);
      window._vt = (window._vt || 0) + 1; setTimeout(() => window._vt--, 420);
    }
    return requestAnimationFrame(fn);
  }
  if (!document.startViewTransition) return fn();
  window._vt = (window._vt || 0) + 1;
  document.startViewTransition(fn).finished.finally(() => { window._vt--; });
}
function toast(msg, type="ok"){
  const t = document.createElement("div"); t.className = `toast glass pop ${type}`;
  t.innerHTML = `${I(type==="ok"?"ok":"warn")}<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(t);
  setTimeout(()=>{ t.classList.add("out"); setTimeout(()=>t.remove(), 400); }, 2600);
}

/* ═════════ 設定面板 ═════════ */
function settingsBody(){
  const seg = (k, opts) => `<div class="seg"><span class="ind"></span>${opts.map(([v,l])=>`<button class="${String(getP(k))===String(v)?"on":""}" data-pref="${k}" data-val="${v}">${l}</button>`).join("")}</div>`;
  const tog = k => `<input type="checkbox" class="tog" data-pref="${k}" ${getP(k)?"checked":""}>`;
  const sw = [["blue","#38bdf8,#6366f1"],["purple","#a78bfa,#d946ef"],["green","#34d399,#14b8a6"],["orange","#fbbf24,#f97316"],["pink","#f472b6,#f43f5e"]]
    .map(([v,c])=>`<button class="${PREF.accent===v?"on":""}" data-pref="accent" data-val="${v}" style="background:linear-gradient(135deg,${c})"></button>`).join("")
    + (() => { const p = FLAGPAL[flagCC()] || FLAGDEF;
      return `<button class="flagsw ${PREF.accent==="flag"?"on":""}" data-pref="accent" data-val="flag" title="跟著國旗" style="background:conic-gradient(${p[1]} 0 33%,${p[0]} 0 66%,${p[2]} 0)"><span>旗</span></button>`; })();
  return `
  <div class="sec"><h4>外觀</h4><div class="group">
    <div class="opt"><span class="lab">主題</span>${seg("theme",[["auto","自動"],["light","淺色"],["dark","深色"]])}</div>
    <div class="opt" style="flex-wrap:wrap"><span class="lab">主題色<small>選「旗」會跟著主機的國旗變色（手機跟著畫面中間的卡片）</small></span><div class="sw" style="flex-basis:100%;padding:4px 2px 2px">${sw}</div></div>
    <div class="opt" style="flex-wrap:wrap"><span class="lab">玻璃效果<small>往左越透明、往右越霧面</small></span>
      <div class="slider" style="flex-basis:100%"><span>清透</span><input type="range" min="0" max="100" value="${PREF.glass}" data-pref="glass"><span>霧面</span></div></div>
    <div class="opt"><span class="lab">背景</span>${seg("bg",[["aurora","流光"],["mesh","漸層"],["plain","純色"]])}</div>
  </div></div>
  <div class="sec"><h4>版面</h4><div class="group">
    <div class="opt"><span class="lab">文字大小</span>${seg("size",[["s","小"],["m","中"],["l","大"]])}</div>
    <div class="opt"><span class="lab">卡片</span>${seg("density",[["cozy","寬鬆"],["compact","緊湊"]])}</div>
    <div class="opt"><span class="lab">動畫效果</span>${tog("motion")}</div>
    <div class="opt" style="flex-wrap:wrap"><span class="lab">效能模式<small>「自動」會在手機、或偵測到畫面不順的電腦上，關掉比較吃效能的效果</small></span>
      <div style="flex-basis:100%">${seg("perf",[["auto","自動"],["lite","流暢優先"],["full","完整效果"]])}</div></div>
  </div></div>
  <div class="sec"><h4>要顯示的內容</h4><div class="group">
    <div class="opt">${IC("trend")}<span class="lab">歷史曲線圖</span>${tog("show.chart")}</div>
    <div class="opt">${IC("net")}<span class="lab">網路速度</span>${tog("show.net")}</div>
    <div class="opt">${IC("box")}<span class="lab">容器與服務</span>${tog("show.items")}</div>
    <div class="opt">${IC("info")}<span class="lab">主機概況<small>電腦版才有</small></span>${tog("show.info")}</div>
    <div class="opt">${IC("flag")}<span class="lab">國旗</span>${tog("show.flag")}</div>
    <div class="opt">${IC("month")}<span class="lab">每月流量</span>${tog("show.traffic")}</div>
  </div></div>
  <div class="sec"><h4>軟體更新<button class="linkish" data-selfcheck>檢查新版</button></h4><div class="group selfbox"><div class="opt"><span class="lab"><small>讀取中…</small></span></div></div></div>
  <div class="sec"><h4>通知</h4><div class="group">
    <button class="opt optbtn" data-tg>${IC("bell")}<span class="lab">Telegram 通知<small class="tgst">讀取中…</small></span><span class="chev">${I("chev")}</span></button>
  </div></div>
  ${LIST.some(s => s.online) ? `<div class="sec"><h4>安全</h4><div class="group">${PK_OK && LIST.some(s => !s.node && s.online) ?
    `<button class="opt optbtn" data-pk>${IC("finger")}<span class="lab">手機金鑰登入<small class="pkst">讀取中…</small></span><span class="chev">${I("chev")}</span></button>` : ""}${LIST.some(s => !s.node && s.online) ?
    `<button class="opt optbtn" data-pin>${IC("pin")}<span class="lab">PIN 碼登入<small class="pinst">讀取中…</small></span><span class="chev">${I("chev")}</span></button>` : ""}${LIST.filter(s => s.online).map(s =>
    `<button class="opt optbtn" data-newtok="${esc(s.node||"")}" data-label="${esc(s.name)}">${IC("key")}<span class="lab">換一組新密碼${LIST.length > 1 ? `：${esc(s.name)}` : ""}<small>擔心密碼外流時用，舊密碼會馬上失效</small></span><span class="chev">${I("chev")}</span></button>`).join("")}</div></div>` : ""}
  <div class="sec"><h4>資料</h4><div class="group">
    <div class="opt"><span class="lab">自動更新<small>多久抓一次最新狀態</small></span>${seg("refresh",[[3,"3 秒"],[5,"5 秒"],[10,"10 秒"],[30,"30 秒"]])}</div>
  </div></div>
  <button class="ubtn ghost reset" data-reset>恢復預設值</button>
  <p class="sub" style="text-align:center;margin-top:12px">外觀設定只存在這台裝置上；Telegram 通知存在主機上</p>`;
}
function moveInd(seg){
  const on = seg.querySelector("button.on"), ind = seg.querySelector(".ind");
  if (!on || !ind) return;
  ind.style.width = on.offsetWidth + "px"; ind.style.transform = `translateX(${on.offsetLeft}px)`;
}
/* 手機展開／收起「容器與服務」：先量好最後的高度，再用固定的數字做高度動畫。
   電腦版用的格線撐開法每一格都要重算整個格線，iPhone 上會卡 */
function foldLite(more, on){
  const c = more.querySelector(".collapse");
  if (!c) return;
  const h0 = c.getBoundingClientRect().height;
  c.getAnimations().forEach(a => a.cancel());
  if (on) {
    more.classList.add("open");
    const h1 = c.getBoundingClientRect().height;
    c.animate([{height:h0 + "px", overflow:"hidden"}, {height:h1 + "px", overflow:"hidden"}], {duration:T.mid, easing:EASE, id:"ui"});
  } else {                                        // 收起：動畫跑完才真的關上，裡面的字不會先消失
    c.animate([{height:h0 + "px", overflow:"hidden"}, {height:"0px", overflow:"hidden"}], {duration:T.mid, easing:EASE, fill:"forwards", id:"ui"})
      .finished.then(a => { if (!open[more.querySelector("[data-toggle]").dataset.toggle]) more.classList.remove("open"); a.cancel(); }).catch(() => {});
  }
}
function initSegs(root){
  // 先一次量完所有按鈕的位置，再一次寫回去；量一個寫一個的話，每一組都要整頁重新排版一次（手機上開設定會頓將近半秒）
  const segs = [...root.querySelectorAll(".seg")].map(sg => { sg.classList.add("noanim"); return [sg.querySelector("button.on"), sg.querySelector(".ind")]; });
  const pos = segs.map(([on, ind]) => on && ind ? [on.offsetWidth, on.offsetLeft] : null);
  segs.forEach(([, ind], i) => { if (pos[i]) { ind.style.width = pos[i][0] + "px"; ind.style.transform = `translateX(${pos[i][1]}px)`; } });
  requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll(".seg").forEach(sg => sg.classList.remove("noanim"))));
}
/* 其他主機連不上：可以直接在網頁上改它的連線網址（例如網域、連接埠換了） */
const peerBtn = s => s.node ? `<button class="ubtn ghost sm peerfix" data-peeredit="${esc(s.node)}">${I("edit")}更改連線網址</button>` : "";
function peerModal(s){
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog glass pop"><div class="ico big theme">${I("off")}</div><h3>更改「${esc(s.name)}」的連線網址</h3>
    <p>網域、連接埠換了，或是改用網域連線時，在這裡換成新的網址</p>
    <div class="form">
      <label>網址<input class="field" data-k="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://網域:9443 或 http://IP:8787" value="${esc(s.peer_url || "")}">
        <small>就是平常打開那台哨兵用的網址</small></label>
      <label>密碼<input class="field" data-k="token" autocomplete="off" spellcheck="false" placeholder="沒變就留空">
        <small>那台的密碼（TOKEN）有換才需要填</small></label>
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
      else { msg.className = "msg bad"; msg.textContent = (d.message || "儲存失敗") + (d.test_failed ? "。確定網址沒錯的話，可以按「仍然儲存」。" : "");
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
    v.innerHTML = `<div class="dialog glass pop hostd"><div class="ico big theme">${I("edit")}</div><h3>編輯主機</h3>
      <div class="form">
        <label>名稱<input class="field" data-k="name" maxlength="40" value="${esc(name)}"><small>中文、英文、表情符號都可以</small></label>
        <div class="lbl">常用連結
          <small>這台主機上的網頁，例如 3x-ui 後台、n8n。只有一個時，點名稱旁的 ↗ 直接打開；有好幾個時會先出現選單</small>
          <div class="lrows">${(links.length ? links : [{name:"", url:""}]).map(row).join("")}</div>
          <button type="button" class="ubtn ghost addl" data-add>＋ 新增連結</button></div>
      </div>
      <div class="btns"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn" data-r="1">儲存</button></div></div>`;
    $("#layer").appendChild(v);
    const box = v.querySelector(".lrows");
    const sync = () => { v.querySelector("[data-add]").style.display = box.children.length >= 6 ? "none" : ""; };
    const done = ok => { if (v._d) return; v._d = 1; v.classList.add("closing");
      const val = ok ? {name: v.querySelector('[data-k="name"]').value.trim(),
        links: [...box.querySelectorAll(".lrow")].map(r => ({name: r.querySelector(".ln").value.trim(), url: r.querySelector(".lu").value.trim()})).filter(x => x.url)} : null;
      setTimeout(() => { v.remove(); res(val); }, 360); };
    v._esc = () => done(0);
    setTimeout(() => v.querySelector('[data-k="name"]').focus(), 60);
    v.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input")) done(1); });
    v.addEventListener("click", e => {
      if (e.target === v) return done(0);
      const b = e.target.closest("[data-r]"); if (b) return done(+b.dataset.r);
      if (e.target.closest("[data-add]")) { box.insertAdjacentHTML("beforeend", row()); const r = box.lastElementChild;
        if (canAnim()) r.animate([{opacity:0, transform:"translateY(-4px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE});
        r.querySelector(".ln").focus(); return sync(); }
      const d = e.target.closest("[data-del]");
      if (d) { const r = d.closest(".lrow");
        if (box.children.length === 1) { r.querySelectorAll("input").forEach(i => i.value = ""); return; }
        r.remove(); sync(); }
    });
    sync();
  });
}
/* 有好幾個常用連結：點 ↗ 出現小選單 */
function linksMenu(btn, s){
  closeMenu();
  const m = document.createElement("div"); m.className = "lmenu glass pop";
  m.innerHTML = linksOf(s).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><i class="ld ${x.up===false?"bad":x.up?"ok":""}"></i><span>${esc(x.name)}<small>${esc(linkSt(x))}</small></span>${I("ext")}</a>`).join("");
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(), w = m.offsetWidth;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
  m.style.top = (r.bottom + 8) + "px";
  if (canAnim()) m.animate([{opacity:0, transform:"translateY(-6px) scale(.97)"}, {opacity:1, transform:"none"}], {duration:T.fast, easing:EASE});
  window._menu = m;
  setTimeout(() => m.addEventListener("click", () => closeMenu()), 0);
}
function closeMenu(){
  const m = window._menu; if (!m) return; window._menu = null;
  if (!canAnim()) return m.remove();
  m.animate([{opacity:1}, {opacity:0, transform:"translateY(-4px) scale(.98)"}], {duration:T.fast, easing:EXIT, fill:"forwards"}).finished.then(() => m.remove());
}
addEventListener("scroll", closeMenu, {passive:true, capture:true});
addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
/* ═════════ 更新哨兵本身 ═════════ */
async function selfCall(node, action){
  const r = await fetch("/api/self?node=" + encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify({action})});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || (r.status === 404 ? "這台還是舊版，請先手動更新一次" : "讀取失敗"));
  return d;
}
const SELFST = {};
async function selfStatus(root, force){
  const box = root.querySelector(".selfbox"); if (!box) return;
  const hosts = LIST.filter(x => x.online);
  const res = await Promise.all(hosts.map(h => selfCall(h.node || "", force ? "check" : "status").then(d => [h, d]).catch(e => [h, {err: e.message, old: true}])));
  if (!box.isConnected) return;
  res.forEach(([h, d]) => SELFST[keyOf(h)] = d);
  const pend = res.reduce((n, [, d]) => n + (d.has && !d.running ? 1 : 0) + (d.cloud && d.cloud.has && !d.cloud.running ? 1 : 0), 0);
  const rows = res.map(([h, d]) => {
    const node = esc(h.node || "");
    const st = d.running ? `<span class="spin"></span>更新中…` : d.old || d.supported === false ? `<span class="warn">${esc(d.err)}</span>`
      : d.has ? `<span class="new">有新版可以更新</span>` : d.err ? esc(d.err) : "已經是最新版 ✨";
    const ch = d.has && d.changes && d.changes.length ? `<ul class="chg">${d.changes.slice(0, 5).map(c => `<li>${esc(c.split("\n")[0])}</li>`).join("")}</ul>` : "";
    const c = d.cloud;
    const cst = !c ? "" : c.running ? `<span class="spin"></span>更新中…` : c.has ? `<span class="new">官方有新版可以更新</span>` : c.err ? `<span class="warn">${esc(c.err)}</span>` : c.has === false ? "已經是最新版 ✨" : "還沒檢查";
    const crow = c ? `<div class="cl2"><span>${I("cloud")}雲端硬碟<small>${c.version ? `版本 ${esc(c.version)}・` : ""}${cst}</small></span>
      ${c.has && !c.running ? `<button class="ubtn sm" data-cloudup="${node}">更新</button>` : ""}</div>` : "";
    const srow = `<div class="cl2 first"><span>${I("upd")}哨兵<small>${d.version ? `版本 ${esc(d.version)}・${esc(d.build || "")}・` : ""}${st}</small>${ch}</span>
      ${d.has && !d.running ? `<button class="ubtn sm" data-selfup="${node}">更新</button>` : ""}</div>`;
    return `<div class="opt selfrow"><div class="lab"><b class="hn">${esc(h.name)}</b>${srow}${crow}</div></div>`;
  }).join("");
  box.innerHTML = rows + (pend > 1 ? `<div class="opt"><span class="lab"></span><button class="ubtn sm" data-selfup="*">全部更新</button></div>` : "");
}
/* jobs：[{node, kind:"self"|"cloud"}]；不給就是「全部更新」 */
async function selfUpdate(root, jobs){
  if (!jobs) { jobs = [];
    for (const [k, d] of Object.entries(SELFST)) { const node = (LIST.find(x => keyOf(x) === k) || {}).node || "";
      if (d.has && !d.running) jobs.push({node, kind:"self"});
      if (d.cloud && d.cloud.has && !d.cloud.running) jobs.push({node, kind:"cloud"}); } }
  const onlyCloud = jobs.every(j => j.kind === "cloud");
  const ok = await modal({icon:"upd", cls:"theme", title: onlyCloud ? "更新雲端硬碟？" : "開始更新？",
    text: onlyCloud ? "會下載官方最新的穩定版並重新啟動，\n大約 30 秒～1 分鐘，期間暫時打不開，檔案和帳號都會保留。"
      : "會下載新版並自動重新啟動，\n大約 10～60 秒，你的設定和檔案都會保留。", ok:"開始更新"});
  if (!ok) return;
  const okn = [], fail = [];
  jobs.sort((a, b) => (a.node === "" && a.kind === "self") - (b.node === "" && b.kind === "self"));   // 這台的哨兵最後更新（更新完畫面會重新載入）
  for (const j of jobs) {
    const name = ((LIST.find(x => (x.node || "") === j.node) || {}).name || "主機") + (j.kind === "cloud" ? " 的雲端硬碟" : "");
    try { await selfCall(j.node, j.kind === "cloud" ? "cloud_update" : "update"); okn.push(name); } catch(e) { fail.push(`${name}：${e.message}`); }
  }
  if (okn.length) toast(okn.length > 1 ? `已開始更新 ${okn.length} 個項目，大約 1 分鐘內完成` : `已開始更新「${okn[0]}」`);   // 只跳一則
  if (fail.length) setTimeout(() => toast(fail.join("；"), "bad"), okn.length ? 600 : 0);
  setTimeout(() => selfStatus(root), 1500);
  const poll = setInterval(() => { if (!root.isConnected) return clearInterval(poll); selfStatus(root); }, 5000);
  setTimeout(() => clearInterval(poll), 120000);
}
/* ═════════ Telegram 通知設定 ═════════ */
async function tgCall(body){
  const r = await fetch("/api/telegram", {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(body)});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || (r.status === 404 ? "這台主機還沒更新到新版" : "發生錯誤"));
  return d;
}
async function tgStatus(root){
  const el = root.querySelector(".tgst"); if (!el) return;
  try { const d = await tgCall({action:"status"});
    el.textContent = d.on ? `已開啟・由 ${d.bot || "機器人"} 傳送・${d.keep ? `保留 ${d.keep >= 24 ? Math.round(d.keep/24) + " 天" : d.keep + " 小時"}` : "不自動刪除"}` : d.has_token ? "還沒設定要傳到哪裡" : "還沒設定，點這裡開始";
    el.classList.toggle("on", !!d.on);
  } catch(e) { el.textContent = e.message; }
}
async function tgModal(){
  const st = await tgCall({action:"status"}).catch(() => ({}));
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog glass pop tgd">${IC("bell","big")}<h3>Telegram 通知</h3>
    <p>主機出問題、恢復正常、更新完成時，傳訊息到你的 Telegram</p>
    <div class="form">
      <label>① 機器人密碼<input class="field" data-k="token" autocomplete="off" spellcheck="false" placeholder="${st.has_token ? "已經設定過，不用改就留空" : "123456789:AAH…"}">
        <small>在 Telegram 搜尋 <b>@BotFather</b>，傳送 <b>/newbot</b>，照著取好名字，最後它給你的那一串就是密碼</small></label>
      <div class="lbl">② 要傳到哪裡
        <small>先在 Telegram 傳一句話給你的機器人（要傳到群組，就把機器人加進群組再講一句話），然後按「自動尋找」</small>
        <button type="button" class="ubtn ghost find" data-find>${I("search")}自動尋找</button>
        <div class="chats"></div>
        <input class="field" data-k="chat" inputmode="text" autocomplete="off" placeholder="可以留空，會自動找" value="${esc(st.chat || "")}"></div>
      <div class="lbl">③ 通知保留多久
        <small>時間到了會自動從 Telegram 刪掉，聊天室不會越堆越多（Telegram 最多只能刪 2 天內的訊息）</small>
        <div class="seg keep">${[[0,"不刪除"],[1,"1 小時"],[6,"6 小時"],[24,"1 天"],[47,"2 天"]].map(([h,l])=>`<button type="button" data-keep="${h}" class="${(+st.keep||0)===h?"on":""}">${l}</button>`).join("")}</div></div>
      <div class="msg" aria-live="polite"></div>
    </div>
    <div class="btns three"><button class="ubtn ghost" data-r="0">取消</button><button class="ubtn ghost" data-test>測試</button><button class="ubtn" data-save>儲存</button></div>
    ${st.on ? `<button class="linkbtn" data-off>關閉 Telegram 通知</button>` : ""}</div>`;
  $("#layer").appendChild(v);
  const q = k => v.querySelector(`[data-k="${k}"]`), msg = v.querySelector(".msg");
  const say = (t, cls) => { msg.textContent = t || ""; msg.className = "msg " + (cls || ""); };
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
        box.innerHTML = d.chats.map(c => `<button type="button" data-chat="${esc(c.id)}">${esc(c.name)}</button>`).join("");
        if (d.chats.length === 1) { q("chat").value = d.chats[0].id; box.firstChild.classList.add("on"); }
        say(d.chats.length > 1 ? `找到 ${d.chats.length} 個聊天，點一下要傳去哪裡` : `找到了！通知會傳到「${d.chats[0].name}」`, "ok");
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
function openSettings(){
  if ($(".sheetv")) return;
  const v = document.createElement("div"); v.className = "veil sheetv";
  v.innerHTML = `<div class="sheet glass pop"><div class="grab"></div><div class="top"><h3>外觀與設定</h3><button class="iconbtn" data-close>${I("x")}</button></div><div class="sbody">${settingsBody()}</div></div>`;
  $("#layer").appendChild(v);
  const sheet = v.querySelector(".sheet"), body = v.querySelector(".sbody"), top = v.querySelector(".top");
  body.addEventListener("scroll", () => top.classList.toggle("under", body.scrollTop > 4), {passive:true});
  initSegs(body);
  tgStatus(body); selfStatus(body); pkStatus(body); pinStatus(body);
  sheet.addEventListener("animationend", e => { if (e.target === sheet && !v._d) sheet.classList.add("ready"); });
  const close = () => { if (v._d) return; v._d = 1; sheet.classList.remove("back"); v.classList.add("closing"); setTimeout(()=>v.remove(), 380); };
  v._esc = close;

  v.addEventListener("click", e => {
    if (e.target === v || e.target.closest("[data-close]")) return close();
    if (e.target.closest("[data-tg]")) return tgModal().then(() => tgStatus(body));
    if (e.target.closest("[data-pk]")) return pkModal().then(() => pkStatus(body));
    if (e.target.closest("[data-pin]")) return pinModal().then(() => pinStatus(body));
    const nt = e.target.closest("[data-newtok]");
    if (nt) return newToken(nt.dataset.newtok, nt.dataset.label);
    const sc = e.target.closest("[data-selfcheck]");
    if (sc) { sc.disabled = true; sc.textContent = "檢查中…"; return selfStatus(body, true).finally(() => { sc.disabled = false; sc.textContent = "檢查新版"; }); }
    const su = e.target.closest("[data-selfup]");
    if (su) return selfUpdate(body, su.dataset.selfup === "*" ? null : [{node: su.dataset.selfup, kind:"self"}]);
    const cu = e.target.closest("[data-cloudup]");
    if (cu) return selfUpdate(body, [{node: cu.dataset.cloudup, kind:"cloud"}]);
    const b = e.target.closest("[data-val]");
    if (b) {
      const raw = b.dataset.val, k = b.dataset.pref;
      if (String(getP(k)) === raw) return;
      setP(k, /^\d+$/.test(raw) ? +raw : raw);
      const box = b.parentElement;                 // 原地切換，不重畫整個面板
      box.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      if (box.classList.contains("seg")) moveInd(box);
      changed(k);
    }
    if (e.target.closest("[data-reset]")) {
      PREF = JSON.parse(JSON.stringify(DEF)); store("vps-prefs", JSON.stringify(PREF));
      smooth(() => { body.innerHTML = settingsBody(); initSegs(body); applyPrefs(); if (LIST.length) render(LIST); }, true);
      restart(); toast("已恢復預設值");
    }
  });
  v.addEventListener("change", e => { const t = e.target; if (t.classList.contains("tog")) { setP(t.dataset.pref, t.checked); setTimeout(() => changed(t.dataset.pref), 180); } });
  v.addEventListener("input", e => { const t = e.target; if (t.type === "range") { setP("glass", +t.value); applyPrefs(); } });

  // 手機：往下滑關閉
  let y0 = null, dy = 0, t0 = 0;
  const startDrag = e => { if (DESK.matches || e.target.closest("button")) return; y0 = e.clientY; dy = 0; t0 = performance.now();
    sheet.classList.add("ready"); sheet.classList.remove("back"); sheet.style.transition = "none"; sheet.setPointerCapture?.(e.pointerId); };
  const moveDrag = e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`;
    v.style.opacity = String(1 - Math.min(dy / 600, .5)); };
  const endDrag = () => { if (y0 === null) return; y0 = null; sheet.style.transition = "";
    const fast = dy / Math.max(1, performance.now() - t0) > .6;
    if (dy > 120 || (fast && dy > 30)) { v.style.opacity = ""; close(); }
    else { sheet.classList.add("back"); sheet.style.transform = ""; v.style.opacity = ""; } };
  [".grab", ".top"].forEach(sel => sheet.querySelector(sel).addEventListener("pointerdown", startDrag));
  sheet.addEventListener("pointermove", moveDrag); sheet.addEventListener("pointerup", endDrag); sheet.addEventListener("pointercancel", endDrag);

  function changed(k){
    const big = ["theme","accent","bg","size","density","perf"].includes(k) || k.startsWith("show.");
    const run = () => { applyPrefs(); if (LIST.length) render(LIST); };
    // 文字大小、卡片密度會讓整頁重新排版；電腦版開關面板會讓格子重排 → 用淡入淡出蓋過去
    const relayout = ["size","density","perf"].includes(k) || (DESK.matches && k.startsWith("show."));
    big && k !== "accent" ? smooth(run, ["theme","bg"].includes(k), relayout) : run();
    if (k === "refresh") restart();
  }
}
/* 換密碼：換好後顯示新密碼給你複製，這台裝置會自動改用新密碼 */
async function newToken(node, label){
  const ok = await modal({icon:"key", cls:"theme", title:`換掉「${label}」的密碼？`,
    text:"換好之後，其他手機、電腦要用新密碼重新登入；雲端硬碟也要重新從哨兵點進去。", ok:"換新密碼"});
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
    text: node ? "這邊已經記住新密碼，可以照常看到這台。直接打開那台的網址時，請用這組新密碼登入。"
               : "這台裝置已經改用新密碼。請把新密碼記下來，其他裝置要用它重新登入。"});
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
  const r = await fetch(path, {method:"POST", headers:{...(auth ? {"X-Token":getTok()} : {}), "Content-Type":"application/json"}, body:JSON.stringify(body)});
  const d = await r.json().catch(() => ({}));
  if (r.status === 404) throw new Error("主機還沒更新到新版，先更新再試");
  return d;
}
const pkErr = e => e && e.name === "InvalidStateError" ? `這${isPhone() ? "支手機" : "台裝置"}已經登記過了`
  : e && e.name === "NotAllowedError" ? "已取消，或等太久了" : e && e.name === "SecurityError" ? "網址不符，請用平常的網域網址打開哨兵"
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
    el.textContent = d.keys && d.keys.length ? `已登記 ${d.keys.length} 支，登入時用指紋或臉部辨識` : "還沒登記，點這裡開始";
    el.classList.toggle("on", !!(d.keys && d.keys.length));
  } catch(e) { el.textContent = e.message; }
}
async function pkModal(){
  const v = document.createElement("div"); v.className = "veil";
  const me = isPhone() ? "這支手機" : "這台裝置";
  v.innerHTML = `<div class="dialog glass pop pkd">${IC("finger","big")}<h3>手機金鑰登入</h3>
    <p>登記之後，登入時用指紋或臉部辨識就好，不用再輸入密碼</p>
    <div class="form"><div class="pklist"></div>
      <label class="pkadd">幫${me}取個名字<input class="field" data-k="name" maxlength="20" value="${esc(devName())}">
        <small>最多 5 支。換密碼後金鑰照樣能用，原本的密碼也還是可以登入</small></label>
      <div class="msg"></div></div>
    <div class="btns"><button class="ubtn ghost" data-r="0">關閉</button><button class="ubtn" data-add>登記${me}</button></div></div>`;
  $("#layer").appendChild(v);
  const list = v.querySelector(".pklist"), msg = v.querySelector(".msg"), add = v.querySelector("[data-add]"), lab = v.querySelector(".pkadd");
  const day = t => { const d = new Date(t * 1000); return `${d.getMonth()+1}/${d.getDate()}`; };
  let keys = [], max = 5, busy = false;
  const draw = () => {
    list.innerHTML = keys.map(k => `<div class="pkrow">${I("finger")}<span>${esc(k.name)}<small>${day(k.added)} 登記${k.used ? `・${day(k.used)} 用過` : "・還沒用過"}</small></span>
      <button type="button" class="iconbtn" data-del="${esc(k.id)}" data-name="${esc(k.name)}" title="刪掉這支">${I("x")}</button></div>`).join("");
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
        if (!await modal({icon:"finger", cls:"bell", title:`刪掉「${del.dataset.name}」？`, text:"刪掉之後，它就不能再用指紋或臉部辨識登入哨兵。", ok:"刪除"})) return;
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
    el.textContent = !d.on ? "還沒設定，點這裡開始" : d.locked ? `輸錯太多次，暫停中（還有 ${Math.ceil(d.locked / 60)} 分鐘）` : "已設定，登入時可以直接輸入 PIN 碼";
    el.classList.toggle("on", !!d.on && !d.locked);
  } catch(e) { el.textContent = e.message; }
}
async function pinModal(){
  const st = await pinCall({action:"status"}).catch(() => ({}));
  const v = document.createElement("div"); v.className = "veil";
  const inp = k => `<input class="field" data-k="${k}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password">`;
  v.innerHTML = `<div class="dialog glass pop pindlg">${IC("pin","big")}<h3>${st.on ? "換一組 PIN 碼" : "設定 PIN 碼"}</h3>
    <p>登入時輸入 PIN 碼就能進去，不用打一長串密碼</p>
    <div class="form">
      <label>新的 PIN 碼${inp("a")}<small>4 到 8 位數字。連續輸錯 5 次會暫停 15 分鐘，累計輸錯 10 次會自動關閉</small></label>
      <label>再輸入一次${inp("b")}</label>
      <div class="msg"></div></div>
    <div class="btns ${st.on ? "three" : ""}">${st.on ? `<button class="ubtn ghost" data-off>關閉 PIN 碼</button>` : ""}<button class="ubtn ghost" data-r="0">取消</button><button class="ubtn" data-save>儲存</button></div></div>`;
  $("#layer").appendChild(v);
  const q = k => v.querySelector(`[data-k="${k}"]`), msg = v.querySelector(".msg");
  setTimeout(() => q("a").focus(), 60);
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

/* ═════════ 登入 ═════════ */
function login(msg){
  $("#app").innerHTML = `<div class="login glass ${msg?"shake":""}"><svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lblg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--a1) 70%,#fff)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient><linearGradient id="lhlg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="lmlg"><rect width="512" height="512" fill="#fff"/><path d="M204 258l36 36 72-76" fill="none" stroke="#000" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="512" height="512" rx="115" fill="url(#lblg)"/><rect width="512" height="512" rx="115" fill="url(#lhlg)"/><path d="M256 108 371 150c9 3 15 12 15 22v72c0 84-52 140-122 168-5 2-11 2-16 0-70-28-122-84-122-168v-72c0-10 6-19 15-22Z" fill="#fff" mask="url(#lmlg)" transform="translate(256 262) scale(.88) translate(-256 -258)"/></svg><h1>VPS 哨兵</h1><p>輸入存取密碼就能看到你的主機</p>
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
}
let REM = true, PIN_ON = false;
/* 輸入 4～8 位數字、主機又有設定 PIN 碼：當成 PIN 碼；其他都當成存取密碼 */
async function doLogin(){
  const v = $("#tok").value.trim();
  window._fresh = true;
  if (!(PIN_ON && /^\d{4,8}$/.test(v))) { setTok(v, REM); return tick(); }
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
  if (e.target.closest("#layer")) return;
  const t = e.target;
  if (t.closest("[data-login]")) return doLogin();
  if (t.closest("[data-pklogin]")) return pkLoginClick(t.closest("[data-pklogin]"));
  if (t.closest("[data-settings]")) return openSettings();
  const rg = t.closest("[data-range]");
  if (rg) { if (RANGE !== rg.dataset.range) { RANGE = rg.dataset.range; store("vps-range", RANGE); render(LIST); } return; }
  const tf = t.closest("[data-traffic]");
  if (tf) return trafficModal(tf.dataset.traffic, tf.dataset.label);
  if (t.closest("[data-refresh]")) return refreshNow(t.closest("[data-refresh]"));
  if (t.closest("[data-logout]")) {
    if (await modal({icon:"logout", cls:"info", title:"要登出嗎？", text:"登出後要重新輸入密碼才能看到主機。", ok:"登出"})) { setTok(""); LIST = []; clearTimeout(timer); login(); }
    return;
  }
  const tg = t.closest("[data-toggle]");
  if (tg) { const k = tg.dataset.toggle; open[k] = !open[k]; return isLite() && canAnim() ? foldLite(tg.parentElement, open[k]) : tg.parentElement.classList.toggle("open", open[k]); }
  const fl = t.closest("[data-filter]");
  if (fl) {
    FILTER = FILTER===fl.dataset.filter ? "" : fl.dataset.filter;
    if (canAnim()) fl.animate([{transform:"scale(1)"}, {transform:"scale(.9)"}, {transform:"scale(1.05)"}, {transform:"scale(1)"}],
                              {duration:T.mid, easing:SPRING});
    return render(LIST);
  }

  const pe = t.closest("[data-peeredit]");
  if (pe) { e.stopPropagation(); const s = LIST.find(x => (x.node || "") === pe.dataset.peeredit); return s && peerModal(s); }
  const lk = t.closest("[data-links]");
  if (lk) { e.stopPropagation(); const s = LIST.find(x => keyOf(x) === lk.dataset.links); if (window._menu) return closeMenu(); return s && linksMenu(lk, s); }
  if (window._menu && !t.closest(".lmenu")) closeMenu();
  const rn = t.closest("[data-rename]");
  if (rn) {
    e.stopPropagation();
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
    { IPSHOW[k] = Date.now() + 15000; setTimeout(() => { if (IPSHOW[k] <= Date.now()) { delete IPSHOW[k]; render(LIST); } }, 15100); }   // 15 秒後自動再遮起來
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
  const hs = t.closest("[data-sel]");
  if (hs) {
    if (hs.dataset.sel === SEL) return;
    SEL = hs.dataset.sel; store("vps-sel", SEL); scrollTo({top:0, behavior:"smooth"});
    return switchHost();
  }

  const ub = t.closest("[data-update]");
  if (ub) {
    const node = ub.dataset.update, label = ub.dataset.label, n = +ub.dataset.n;
    const ok = await modal({icon:"upd", cls:"theme", title: n ? `更新「${label}」？` : `檢查「${label}」的更新？`,
      text: n ? `會在背景安裝 ${n} 個套件更新，大約 1～5 分鐘。\n期間部分服務可能會短暫重新啟動。` : "目前沒有偵測到更新，\n要重新檢查並安裝最新的更新嗎？", ok: n ? "開始更新" : "檢查"});
    if (!ok) return;
    ub.disabled = true;
    try {
      const r = await fetch("/api/update?node="+encodeURIComponent(node), {method:"POST", headers:{"X-Token":getTok()}});
      const d = await r.json().catch(()=>({}));
      if (!(r.ok && d.ok)) toast(d.message || d.error || "無法開始更新", "bad");
    } catch(err) { toast("連線失敗，請稍後再試", "bad"); }
    return tick();
  }
});
addEventListener("scroll", () => document.body.classList.toggle("scrolled", scrollY > 40), {passive:true});

/* ═════════ 定時抓資料 ═════════ */
let timer;
const T0 = performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms));
let BOOTED = false, REFRESHING = false;
function splashMsg(t){ const m = document.querySelector(".sp-msg"); if (m && m.textContent !== t) m.innerHTML = `<span>${esc(t)}</span>`; }
function endSplash(){
  if (BOOTED) return; BOOTED = true;
  probePerf();
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
/* 等介面動畫（收起、展開、移位）播完再更新畫面，最多等 0.9 秒，避免兩邊搶著動 */
function uiBusy(){ return document.getAnimations().some(a => a.id === "ui" && a.playState === "running"); }
async function settle(){
  const t0 = performance.now();
  while (uiBusy() && performance.now() - t0 < 900) await sleep(60);
  await new Promise(r => requestAnimationFrame(r));       // 對齊下一格畫面再改
}
async function tick(){
  clearTimeout(timer);
  if (!getTok()) { endSplash(); return login(); }
  try {
    if (!BOOTED) splashMsg("讀取主機狀態…");
    const r = await fetch("/api/all", {headers:{"X-Token":getTok()}, cache:"no-store"});
    if (r.status === 401) { setTok(""); LIST = []; endSplash(); return login("密碼不對，再試一次"); }
    const data = await r.json();
    const me = data.find(x => !x.node);
    if (window._fresh) { window._fresh = false; fetch("/api/pin", {method:"POST", headers:{"X-Token":getTok()}, body:'{"action":"login"}'}).catch(() => {}); }  // 登入成功：PIN 碼輸錯的次數歸零
    if (new URLSearchParams(location.search).get("go") === "cloud" && me && me.cloud && !window._goCloud) {   // 從雲端硬碟跳過來登入：登入好了就送回去
      window._goCloud = true;
      await fetch("/api/cloud-login", {method:"POST", headers:{"X-Token":getTok()}}).catch(() => {});
      return location.replace("/cloud/");
    }
    if (me && me.build) {
      if (!window._build) window._build = me.build;
      else if (me.build !== window._build && !window._reloading) {   // 這台的哨兵剛更新好：重新載入換上新畫面
        window._reloading = true; toast("哨兵已更新到新版，重新載入中…");
        setTimeout(() => location.reload(), 1400);
      }
    }
    if (!BOOTED) {
      splashMsg("準備畫面…");
      // 字型和國旗最多等 1.5 秒；啟動畫面至少顯示 0.7 秒，避免一閃而過
      await Promise.race([Promise.all([document.fonts ? document.fonts.ready : null, preloadFlags(data)]), sleep(1500)]);
      const wait = 700 - (performance.now() - T0); if (wait > 0) await sleep(wait);
      endSplash();
    }
    if (BOOTED) await settle();
    render(data);
  } catch(e) {
    if (!BOOTED) splashMsg("連線不上，正在重試…");
    const m = document.querySelector(".meta"); if (m) m.innerHTML = `<span class="live off"></span>連線中斷，重試中…`;
    timer = setTimeout(tick, 3000); return false;
  }
  const busy = LIST.some(s => s.update && s.update.running);   // 更新中就看得勤一點
  timer = setTimeout(tick, busy ? 2000 : (PREF.refresh || 5) * 1000);
  return true;
}
/* 手動重新整理（按鈕或下拉） */
async function refreshNow(btn){
  if (REFRESHING) return; REFRESHING = true;
  btn && btn.classList.add("spinning");
  const [ok] = await Promise.all([tick(), sleep(600)]);
  REFRESHING = false; btn && btn.classList.remove("spinning");
  document.querySelectorAll("[data-refresh]").forEach(b => b.classList.remove("spinning"));
  return ok;
}
/* 手機：下拉重新整理 */
(function(){
  const ptr = $("#ptr"); ptr.innerHTML = I("down");
  let y0 = null, d = 0, armed = false;
  const show = (y, rot) => { ptr.style.transform = `translateY(${y}px) rotate(${rot}deg)`; ptr.style.opacity = String(Math.min(1, (y + 70) / 60)); };
  addEventListener("touchstart", e => {
    if (DESK.matches || scrollY > 0 || REFRESHING || document.querySelector("#layer .veil") || !LIST.length) return;
    y0 = e.touches[0].clientY; d = 0; armed = false; ptr.classList.remove("back","spin","done"); ptr.innerHTML = I("down");
  }, {passive:true});
  addEventListener("touchmove", e => {
    if (y0 === null) return;
    d = Math.max(0, e.touches[0].clientY - y0);
    if (scrollY > 0) { y0 = null; return; }
    const pull = Math.min(110, d * .5);
    armed = pull >= 64;
    show(pull - 70, armed ? 180 : pull * 2.6);
  }, {passive:true});
  addEventListener("touchend", async () => {
    if (y0 === null) return; y0 = null;
    ptr.classList.add("back");
    if (!armed) { show(-70, 0); return; }
    ptr.innerHTML = I("upd"); ptr.classList.add("spin"); show(10, 0);
    const ok = await refreshNow();
    ptr.classList.remove("spin"); if (ok) ptr.classList.add("done");
    ptr.innerHTML = I(ok ? "ok" : "warn");
    setTimeout(() => show(-70, 0), 550);
  });
})();
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) tick(); });
tick();
