/* ═════════ 機場起降：像機場那種會翻牌的看板（飛機即時位置來自業餘接收站，主要主機去抓） ═════════ */
const FLYEV = 10000;                                      // 每 10 秒更新
let FLYD = null, FLYT = 0, FLYSEL = "", FLYHOV = "", FLYSEQ = 0, FLYHR = "", FLYSTILL = false, FLYSW = 0, FLYDONE = false, FLYHUSH = 0, FLYBZ = 0, FLYLATER = 0, FLYDT = 0;   // FLYBZ：切換動畫跑到什麼時候（這段時間新資料先等）   // FLYDONE：已到／已飛的班機展開   // FLYHR：看板現在看哪個時段（幾點）
const flySave = () => store(FLYK, JSON.stringify({ap: FLYS.ap, tab: FLYS.tab, name: FLYS.name, term: FLYS.term || ""}));
const FLYTAB = [["arr", "抵達"], ["dep", "出發"], ["gnd", "機坪"], ["cargo", "貨機"]];
/* 分頁前面的小圖示（像機場指示牌）：降落、起飛、停機坪、貨物 */
const FLYPLN = (r, y) => `<g transform="translate(12 ${y}) rotate(${r}) scale(.72) translate(-12 -12)">${P.plane}</g>`;
const FLYTI = {arr: FLYPLN(90, 10) + '<path d="M3 21h18"/>', dep: FLYPLN(0, 10) + '<path d="M3 21h18"/>', gnd:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>', cargo:'<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9"/>', late:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
const flyTi = k => `<svg class="fti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FLYTI[k]}</svg>`;
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
/* 分頁上的班數：有變的那幾位數像看板的翻牌一樣上下翻過去（往上數或往下數，最多翻三張；個位先翻，十位接著） */
function flyRoll(e, was, n){
  const a = [...was].reverse(), b = [...n].reverse(), dur = T.fast * .6, up = +n > +was, tok = e._roll = (e._roll || 0) + 1;
  e.innerHTML = [...n].map((x, i) => `<i class="dg"><b>${a[n.length - 1 - i] ?? ""}</b></i>`).join("");   // 先擺舊數字，輪到才翻
  const flip = (g, from, to) => {                      // 翻一張：舊數字往後翻下去，新數字從上面翻下來
    const o = document.createElement("i"); o.className = "dgo"; o.textContent = from; g.append(o); g.firstChild.textContent = to;
    const nb = g.firstChild.animate([{transform:"perspective(3em) rotateX(90deg)"}, {transform:"perspective(3em) rotateX(90deg)", offset:.5}, {transform:"perspective(3em) rotateX(0)"}], {duration:dur * 2, easing:EASE});
    o.animate([{transform:"perspective(3em) rotateX(0)"}, {transform:"perspective(3em) rotateX(-90deg)", offset:.5}, {transform:"perspective(3em) rotateX(-90deg)"}], {duration:dur * 2, easing:EXIT, fill:"forwards"});
    return nb.finished.catch(() => {}).then(() => o.remove());
  };
  [...e.children].reverse().forEach(async (g, i) => {
    if (a[i] === b[i]) return;
    g.firstChild.textContent = a[i] ?? "";
    const to = +b[i], from = a[i] == null ? NaN : +a[i];
    let seq = [b[i] ?? ""];
    if (!isNaN(from) && !isNaN(to)) { seq = []; for (let k = from; k !== to; ) { k = (k + (up ? 1 : 9)) % 10; seq.push(String(k)); } seq = seq.slice(-3); }
    await sleep(i * dur);
    let cur = a[i] ?? "";
    for (const ch of seq) { if (e._roll !== tok || !g.isConnected) return; await flip(g, cur, ch); cur = ch; }
  });
}
/* 整排翻牌：每格依序晚一點點開始，像真的看板一格一格翻；不在畫面上的（still）直接換字 */
function flapSet(el, v, delay = 0, still = false){
  if (!el) return;
  const cs = [...el.children], want = flyPad(v, cs.length);
  cs.forEach((c, i) => { if (c.dataset.c !== want[i] || c._tok) flyFlip(c, want[i], delay + i * T.fast * .12, still || FLYSTILL); });   // 整塊換的時候直接換字，不翻
}
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
    cls: p.emg || /取消|轉降/.test(p.st) ? "bad" : /降落|剛起飛|跑道|登機|滑行/.test(p.st) ? "hot" : "", late: gap >= 15 ? gap : 0, early: gap <= -10 ? -gap : 0,
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
/* 手機、平板：抵達／出發那排捲出畫面後，上面中間浮出一顆小膠囊「抵達 23 ▾」，點了選分頁（不整排貼著擋住看板） */
function flyStuck(f){
  const t = f.querySelector(".ftabs"), sc = f.querySelector(".fscroll");
  if (!t || !sc || !window.IntersectionObserver) return;
  new IntersectionObserver(([e]) => { const away = !e.isIntersecting && e.boundingClientRect.top < e.rootBounds.top;
    f.classList.toggle("tabsaway", away); f.querySelector(".fmini").tabIndex = away ? 0 : -1; if (!away && window._menu && window._menu._fmini) closeMenu(); },
    {root: sc, rootMargin: "0px 100% 0px 100%"}).observe(t);
}
const flyNum = (f, k) => { const e = f.querySelector(`.ftabs [data-k="n-${k}"]`); return e ? e.dataset.n ?? e.textContent : ""; };   // 分頁上的班數（翻牌翻到一半也拿到新的）
function flyMini(f){
  const k = FLYS.tab, l = (FLYTAB.find(x => x[0] === k) || FLYTAB[0])[1], n = flyNum(f, k);
  txt(f.querySelector('[data-k="mini-l"]'), l); txt(f.querySelector('[data-k="mini-n"]'), n);
}
function flyMiniMenu(f, btn){
  if (window._menu && window._menu._fmini) return closeMenu();
  closeMenu();
  const m = document.createElement("div"); m.className = "lmenu hmenu fminim"; m._fmini = 1;
  m.innerHTML = FLYTAB.map(([k, l]) => `<button data-fmi="${k}"${FLYS.tab === k ? ` class="on"` : ""}>${FLYS.tab === k ? I("check") : `<span class="ckh"></span>`}<span>${l}</span><b>${esc(flyNum(f, k))}</b></button>`).join("");
  document.body.appendChild(m);
  placeMenu(m, btn, r => r.left + r.width / 2 - m.offsetWidth / 2);
  if (canAnim()) m.animate([{opacity:0, transform:"scale(.85,.4)"}, {opacity:1, transform:"none"}], {duration:T.spf, easing:SPRING_F});
  window._menu = m; histMark(m);
  setTimeout(() => m.addEventListener("click", e => {
    const b = e.target.closest("[data-fmi]"); closeMenu(); if (!b) return;
    const tb = f.querySelector(`.ftabs [data-ftab="${b.dataset.fmi}"]`); if (!tb) return;
    if (!tb.classList.contains("on")) tb.click();
    const sc = f.querySelector(".fscroll"), top = f.querySelector(".ftabs").offsetTop - 8;   // 換了分頁：回到那一排，從新清單的第一班開始看
    sc.scrollTo({top: Math.max(0, top), behavior: canAnim() ? "smooth" : "auto"});
  }), 0);
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
  if (t.tagName === "IMG" && t.classList.contains("flg")) { if (t.dataset.c) FLYNOFL.add(t.dataset.c); if (t.classList.contains("at")) t.style.visibility = "hidden"; else t.hidden = true; }   // 清單裡抓不到國旗也留位置，名字才對齊
  if (t.tagName === "IMG" && t.parentNode && t.parentNode.classList.contains("alg")) { FLYNOLG.add(t.parentNode.dataset.c); t.remove(); } }, true);
const FLYF = ["t", "fn", "pc", "st"], FLYX = ["pl", "al", "m", "reg", "bx"];   // 翻牌的欄位／一般文字的欄位（城市、航空公司、機型、註冊號用一般字比較好讀）
const FLYW = {t:5, fn:7, pc:3, st:4};             // 狀態最多四個中文字，每格都是中文字寬，長短不一也對齊
const FLYCOL = ["t", "fn", "pc", "pl", "fal", "al", "m", "reg", "bx", "st"];   // fal：航空公司標誌自己一欄，每列都對齊
const FLYHEAD = {arr:["抵達", "航班", "出發地", "", "", "航空公司", "機型", "註冊號", "", "狀態"],
  dep:["出發", "航班", "目的地", "", "", "航空公司", "機型", "註冊號", "", "狀態"], gnd:["", "航班", "從哪來／去哪", "", "", "航空公司", "機型", "註冊號", "", "狀態"],
  cargo:["時間", "航班", "從哪來／去哪", "", "", "航空公司", "機型", "註冊號", "", "狀態"]};
const FLYHEADF = {arr:["抵達", "航班", "出發地", "", "", "航空公司", "機型", "登機門", "行李", "狀態"], dep:["出發", "航班", "目的地", "", "", "航空公司", "機型", "登機門", "報到", "狀態"]};   // 有機場官網航班表時
const flyRow = i => `<div class="fr" data-i="${i}" role="button" tabindex="0">${FLYCOL.map(k => `<span class="fk ${k}">${FLYW[k] ? flap("", FLYW[k], k === "st" ? "zh" : "") + (k === "fn" ? `<span class="fsh"></span>` : "") : k === "fal" ? `<i class="alg none" data-c=""></i>` : k === "pl" ? `<img class="flg at" alt="" hidden><span class="plt"></span>` : ""}</span>`).join("")}<span class="ftag"></span><i class="br b1"></i><i class="br b2"></i></div>`;
function flyShell(){
  return `<div class="flyv" id="fly"><button class="fmini" data-fmini tabindex="-1"><span data-k="mini-l"></span><b data-k="mini-n"></b>${I("chev").replace("<svg", '<svg class="chv"')}</button><div class="fscroll"><div class="fwrap">
    <div class="ftop">${SHARE ? `<span class="fexp sub" data-k="left"></span>` : `<button class="icbtn" data-fback title="返回">${I("back")}</button>`}<span class="grow"></span>
      ${SHARE ? "" : `<button class="fchip fap" data-fshare>${I("share")}<span>分享</span></button>`}<button class="fchip fap fapb"${SHAREAP ? " disabled" : ` data-fpick title="換機場"`}>${flyApLg("")}<span class="fapn"></span>${SHAREAP ? "" : I("chev").replace("<svg", '<svg class="chv"')}</button></div>
    <div class="fhead"><div class="fcode">${flap("", 3, "xl")}</div><div class="fname"><b data-k="name"></b><span class="sub" data-k="city"></span></div>
      <div class="fclock" title="當地時間">${flap("", 5, "lg")}</div></div>
    <div class="fmain"><div class="fleft">
      <div class="seg ftabs" data-slide>${FLYTAB.map(([k, l]) => `<button class="${FLYS.tab === k ? "on" : ""}" data-ftab="${k}">${flyTi(k)}${l}<span class="fnw"><span class="fnl" hidden>還有</span><span class="fn" data-k="n-${k}"></span></span></button>`).join("")}</div>
      <div class="fterm" data-slide hidden></div><div class="fhrh"><span class="fhsel" hidden></span><div class="fsum sub" role="button" tabindex="0" hidden></div></div><div class="fhrs" hidden></div>
      <div class="board"><div class="fh">${FLYCOL.map(k => `<span class="fk ${k}"></span>`).join("")}</div><button class="fdone" data-fdone hidden><span></span>${I("chev").replace("<svg", '<svg class="chv"')}</button><div class="frows"></div><div class="fmsg sub" hidden></div><div class="fload"><i></i></div></div></div>
      <div class="radar"><div class="rin"><div class="rbox"><canvas class="rcv" aria-label="雷達"></canvas><i class="rsweep"></i><button class="icbtn rfull" data-rfull title="整頁雷達">${I("full")}</button></div>
        <div class="rq" hidden><div class="rqh"><span data-k="rq-t">進場排隊</span><b data-k="rq-nx"></b></div>
          <div class="rqt"><div class="rqk">${[5, 10, 15, 20].map(k => `<i style="left:${flyQx(k)}%"><small>${k}${k === 20 ? "<em>公里</em>" : ""}</small></i>`).join("")}</div><i class="rqrw"></i><div class="rqps"></div></div></div>
        <div class="rnote sub" hidden></div>
        <div class="rwx" hidden><div class="rah">${flap("", 1, "lg")}<div><b>塔台廣播</b><small data-k="wx-t"></small></div></div><div class="rad"></div></div>
        <div class="rleg"><span><i class="arr"></i>抵達<b data-k="rc-arr"></b></span><span><i class="dep"></i>出發<b data-k="rc-dep"></b></span><span><i class="gnd"></i>機坪<b data-k="rc-gnd"></b></span><span><i class="ov"></i>路過<b data-k="rc-over"></b></span>
          <span class="ralt">尾跡高度<i></i>1000<i></i>3000<i></i>6000<i></i>公尺</span><span class="rctl"><span class="rng fzm">${FLYZM.map(k => `<button data-fzm="${k}">${k}</button>`).join("")}</span></span></div></div></div>
    </div>
    <div class="ffoot sub"></div></div></div>${flySplash()}</div>`;
}
/* 載入畫面：小雷達掃描，一架飛機沿著進場線降落到跑道上，下面翻出機場代碼 */
const flySplash = () => `<div class="fsplash" aria-hidden="true"><div class="fsp"><i class="fsw"></i><i class="fsb b1"></i><i class="fsb b2"></i><i class="fsb b3"></i>
    <div class="fsap"><i class="fsln"></i><i class="fsrw"></i><i class="fspl">${I("plane")}</i></div></div>
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
  f._spT = setTimeout(() => {
    const sp = f.querySelector(".fsplash");
    sp.animate([{opacity:1}, {opacity:0, transform:"scale(1.04)"}], {duration:T.mid, easing:EXIT, fill:"forwards"}).finished.then(() => sp.remove(), () => sp.remove());
    f.classList.remove("splash");
    flyRise(f, T.fast * .5);
  }, Math.max(T.mid, T.long * 2 - (performance.now() - f._sp0)));   // 資料到了也多等一下：看板先在後面排好、長好
}
/* 打開、換機場資料到了：上面到下面一塊一塊浮上來。電腦上看板和雷達是同一張卡片（.fleft 拆開排），兩邊一起浮，不會一邊先出來 */
function flyRise(f, d0){
  if (!canAnim()) return;
  const wide = getComputedStyle(f.querySelector(".fleft")).display === "contents", gs = [];
  [...f.querySelectorAll(".fwrap>:not(.ftop):not(.fmain), .fmain>*")].forEach(e => {
    if (e.classList.contains("fleft") && wide) [...e.children].forEach(c => c.classList.contains("board") ? gs.push([c, f.querySelector(".radar")]) : gs.push([c]));
    else if (!(wide && e.classList.contains("radar"))) gs.push([e]);
  });
  gs.filter(g => g.some(e => !e.hidden)).forEach((g, i) => g.forEach(e => e.animate([{opacity:0, transform:"translateY(16px)"}, {opacity:1, transform:"none"}], {duration:T.slow, delay:d0 + i * T.fast * .35, easing:EASE, fill:"backwards"})));
}
/* 換機場：看板、雷達先淡掉，換成小飛機的載入畫面（翻出新機場代碼），資料在後面準備好才一塊一塊浮上來 */
function flySplashSwap(f){
  if (!canAnim()) return;
  clearTimeout(f._spT); f._spOff = 0; f._sp0 = performance.now();
  const set = () => { flapSet(f.querySelector(".fspc .sf"), FLYS.ap); txt(f.querySelector(".fspn"), FLYS.name || ""); };
  if (f.classList.contains("splash")) return set();         // 載入畫面還在：只換代碼
  f.querySelectorAll(".fsplash").forEach(e => e.remove());
  const els = [...f.querySelectorAll(".fwrap>:not(.ftop)")];
  els.forEach(e => e.getAnimations().forEach(a => a.cancel()));
  els.forEach(e => e.animate([{opacity:1}, {opacity:0}], {duration:T.fast, easing:EXIT, fill:"forwards", id:"fsw"}));
  f.insertAdjacentHTML("beforeend", flySplash());
  const sp = f.querySelector(".fsplash");
  f.classList.add("splash");
  sp.animate([{opacity:0, transform:"scale(.96)"}, {opacity:1, transform:"none"}], {duration:T.mid, delay:T.fast * .5, easing:EASE, fill:"backwards"});
  setTimeout(() => {                                          // 淡完：捲回最上面，拿掉淡出（splash 本身會藏著）
    els.forEach(e => e.getAnimations().forEach(a => { if (a.id === "fsw") a.cancel(); }));
    const sc = f.querySelector(".fscroll"); if (sc) sc.scrollTop = 0;
    if (f.classList.contains("splash")) set();
  }, T.fast + 20);
}
const FLYZM = [60, 30, 15], FLYGEO = {};                  // 雷達看多遠（公里）；底圖（海岸線、地名）每個機場抓一次
const flyR = () => FLYZM.includes(+FLYS.zm) ? +FLYS.zm : 60;
let FLYTRKON = store("vs-flytrk") !== "0";                 // 雷達上的常走路線：開關，記在這台瀏覽器
let FLYVEHON = store("vs-flyveh") !== "0";                 // 整頁雷達放大到機場時畫地勤車：開關，記在這台瀏覽器
const flyLayOn = () => FLYTRKON || FLYVEHON;
function flyVehSet(on){
  FLYVEHON = on; store("vs-flyveh", on ? "1" : "0");
  document.querySelectorAll("[data-rtrk]").forEach(b => b.classList.toggle("on", flyLayOn()));
  if (FRAD) { FRAD.rv.vt = performance.now(); FRAD.rv.kick(); }
}
/* 整頁雷達右上角的圖層：常走路線、地勤車各自開關 */
function flyLayMenu(btn){
  closeMenu();
  const it = (k, l, on) => `<button data-flay="${k}"${on ? ` class="on"` : ""}>${on ? I("check") : `<span class="ckh"></span>`}<span>${l}</span></button>`;
  const m = document.createElement("div"); m.className = "lmenu hmenu hlist";
  m.innerHTML = it("trk", "常走路線", FLYTRKON) + it("veh", "地勤車", FLYVEHON);
  document.body.appendChild(m);
  placeMenu(m, btn, r => r.right - m.offsetWidth);
  if (canAnim()) m.animate([{opacity:0, transform:"scale(.85,.4)"}, {opacity:1, transform:"none"}], {duration:T.spf, easing:SPRING_F});
  window._menu = m; histMark(m);
  m.addEventListener("click", e => { const b = e.target.closest("[data-flay]"); if (!b) return; b.dataset.flay === "trk" ? flyTrkSet(!FLYTRKON) : flyVehSet(!FLYVEHON); closeMenu(); });
}
function flyTrkSet(on){
  FLYTRKON = on; store("vs-flytrk", on ? "1" : "0");
  document.querySelectorAll("[data-ftrk]").forEach(b => { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  document.querySelectorAll("[data-rtrk]").forEach(b => b.classList.toggle("on", flyLayOn()));
  [$("#fly") && $("#fly")._rv, FRAD && FRAD.rv].forEach(v => v && v.trkOn());
}
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
const FLYWS = {q4:.068, wb:.062, nb:.036, tp:.027, ga:.012, heli:.012};   // 各種飛機大概的翼展（公里），放大到機場裡面時照這個大小畫
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
/* 地形（中央山脈這些）：高度表只抓一次，做成一張明暗圖（西北邊打光，山的東南面暗、西北面亮），畫在陸地上 */
let FLYTER = null, FLYTERQ = null, FLYTERI = null;
function flyTer(g){
  const tr = g && g.ter; if (!tr) return null;
  if (FLYTERI && FLYTERI._g === tr.join()) return FLYTERI;
  if (!FLYTER) { if (!FLYTERQ) FLYTERQ = api("/api/fly-terrain").then(r => r.ok ? r.arrayBuffer() : null).then(b => { FLYTER = b && new Uint8Array(b); }, () => { FLYTERQ = null; }); return null; }
  const [, , wk, hk, w, h] = tr, e = FLYTER; if (e.length !== w * h) return null;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const cx = c.getContext("2d"), im = cx.createImageData(w, h), D = im.data;
  const mx = 16 * 2.5 / (wk / w * 1000), my = 16 * 2.5 / (hk / h * 1000), L = [-.5, .5, .7071];   // 高度誇大 2.5 倍，平地看不出來的丘陵也有一點明暗
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const k = j * w + i, z = e[k]; if (!z) continue;
    const dx = (e[k + 1] - e[k - 1]) / 2 * mx, dy = (e[k - w] - e[k + w]) / 2 * my, n = Math.hypot(dx, dy, 1);
    const sh = (-dx * L[0] - dy * L[1] + L[2]) / n - L[2], v = Math.max(-1, Math.min(1, sh * 1.6)) - Math.min(.5, z / 160) * .5;   // 越高越暗一點
    const o = k * 4, a = Math.min(1, Math.abs(v));
    D[o] = D[o + 1] = D[o + 2] = v > 0 ? 255 : 0; D[o + 3] = Math.round(a * (v > 0 ? 70 : 100));
  }
  cx.putImageData(im, 0, 0);
  const b = document.createElement("canvas"), bx = b.getContext("2d"); b.width = w * 3; b.height = h * 3;   // 放大三倍再柔化：一公里一格放大後才不會一格一格的
  bx.filter = "blur(2px)"; bx.imageSmoothingQuality = "high"; bx.drawImage(c, 0, 0, b.width, b.height);
  b._g = tr.join(); FLYTERI = b;
  return b;
}
/* 常走的航線（主機記下每天抵達、出發的飛機飛過哪裡）：一格一公里，越常飛越濃 */
const FLYTRK = {};
/* 常走的路線：飛過的格子先柔化，夠常飛的連成一塊，再削成一格寬的中線（Zhang-Suen 細化），
   沿著中線串成一條條線、磨圓，越常飛越清楚。以前整片柔化，飛的人一多就整片霧 */
function flyTrkLines(d){
  if (!d || !d.length) return null;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < d.length; i += 3) { x0 = Math.min(x0, d[i]); x1 = Math.max(x1, d[i]); y0 = Math.min(y0, d[i + 1]); y1 = Math.max(y1, d[i + 1]); }
  x0 -= 2; y0 -= 2; const w = x1 - x0 + 3, h = y1 - y0 + 3, I = (x, y) => y * w + x;
  let v = new Float32Array(w * h);
  for (let i = 0; i < d.length; i += 3) v[I(d[i] - x0, d[i + 1] - y0)] = d[i + 2] > 9 ? d[i + 2] / 99 : d[i + 2] / 9;   // 舊主機給 1～9
  for (let k = 0; k < 2; k++) {                              // 柔化兩次（1-2-1），零星亂飛的格子被拉低、同一條路線連起來
    const o = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let t = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) t += v[I(x + i, y + j)] * (2 - Math.abs(i)) * (2 - Math.abs(j));
      o[I(x, y)] = t / 16;
    }
    v = o;
  }
  const B = new Uint8Array(w * h);
  const st0 = [];                                            // 夠常飛的格子當起點，往旁邊比較淡、但還連著的格子長出去（路線中間不會斷掉）
  for (let i = 0; i < w * h; i++) if (v[i] >= .4) { B[i] = 1; st0.push(i); }
  while (st0.length) { const i = st0.pop(), x = i % w; for (const j of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) if (j >= 0 && j < w * h && !B[j] && v[j] >= .22 && Math.abs(j % w - x) <= 1) { B[j] = 1; st0.push(j); } }
  const nb = (x, y) => [B[I(x, y - 1)], B[I(x + 1, y - 1)], B[I(x + 1, y)], B[I(x + 1, y + 1)], B[I(x, y + 1)], B[I(x - 1, y + 1)], B[I(x - 1, y)], B[I(x - 1, y - 1)]];
  for (let ch = 1; ch;) {                                    // Zhang-Suen：一層一層削，削到只剩一格寬
    ch = 0;
    for (const st of [0, 1]) {
      const del = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (!B[I(x, y)]) continue;
        const p = nb(x, y), n = p.reduce((a, b) => a + b, 0); if (n < 2 || n > 6) continue;
        let tr = 0; for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) tr++; if (tr !== 1) continue;
        if (st ? p[0] * p[2] * p[6] || p[0] * p[4] * p[6] : p[0] * p[2] * p[4] || p[2] * p[4] * p[6]) continue;
        del.push(I(x, y));
      }
      del.forEach(i => { B[i] = 0; }); ch += del.length;
    }
  }
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  const nbs = i => { const x = i % w, y = (i - x) / w, r = [];   // 斜的鄰居如果已經經過直角那格連著，就不算（不然轉角會多出小三角形）
    for (const [dx, dy] of N8) { const j = I(x + dx, y + dy); if (B[j] && !(dx && dy && (B[I(x + dx, y)] || B[I(x, y + dy)]))) r.push(j); } return r; };
  const ek = (a, b) => a < b ? a + "," + b : b + "," + a, used = new Set(), lines = [];
  const walk = (a, b) => {                                   // 從 a 走到 b，一直走到岔路或盡頭
    const pts = [a]; let p = a, c = b;
    for (;;) { used.add(ek(p, c)); pts.push(c); const n = nbs(c); if (n.length !== 2) break; const nx = n[0] === p ? n[1] : n[0]; if (used.has(ek(c, nx))) break; p = c; c = nx; }
    return pts;
  };
  for (let i = 0; i < w * h; i++) if (B[i] && nbs(i).length !== 2) nbs(i).forEach(j => { if (!used.has(ek(i, j))) lines.push(walk(i, j)); });
  for (let i = 0; i < w * h; i++) if (B[i]) nbs(i).forEach(j => { if (!used.has(ek(i, j))) lines.push(walk(i, j)); });   // 繞一圈的
  const P = [new Path2D(), new Path2D(), new Path2D()];
  let any = 0;
  lines.forEach(L => {
    if (L.length < 5 && (nbs(L[0]).length < 2 || nbs(L[L.length - 1]).length < 2)) return;   // 細化留下的小毛邊（一頭沒接東西的短線）
    const q = L.map(i => [i % w + x0, Math.floor(i / w) + y0]);
    const sm = q.map((p, k) => { if (!k || k === q.length - 1) return p; let sx = 0, sy = 0, n = 0; for (let j = Math.max(0, k - 2); j <= Math.min(q.length - 1, k + 2); j++) { sx += q[j][0]; sy += q[j][1]; n++; } return [sx / n, sy / n]; });
    const a = L.reduce((t, i) => t + v[i], 0) / L.length, p = P[a >= .75 ? 2 : a >= .58 ? 1 : 0];
    p.moveTo(sm[0][0], -sm[0][1]); sm.slice(1).forEach(([x, y]) => p.lineTo(x, -y)); any = 1;
  });
  return any ? P : null;
}
function flyTrk(f, code){
  const o = FLYTRK[code], use = () => [f._rv, FRAD && FRAD.rv].forEach(v => v && v.setTrk(FLYTRK[code] && FLYTRK[code].d));
  use();
  if (o && (o.q || Date.now() - o.t < 600000)) return;      // 10 分鐘問一次
  FLYTRK[code] = {...o, q:1};
  api("/api/flights?trk=" + encodeURIComponent(code), {headers:flyHdr()}).then(r => r.json()).then(d => { FLYTRK[code] = {t:Date.now(), d:d.ok ? d : o && o.d}; if (FLYD && FLYD.ap && FLYD.ap.code === code) use(); },
    () => { FLYTRK[code] = {t:Date.now() - 480000, d:o && o.d}; });
}
/* 雷達：地圖、尾跡、飛機、名字全部畫在一張畫布上（幾百個小方塊各自動畫在手機上會卡）；
   飛機在兩次更新之間照時間慢慢移過去；mini 是看板旁邊的圓形雷達，full 是點進去的整頁雷達 */
function radarView(cv, full){
  const ctx = cv.getContext("2d"), pl = new Map(), V = {cx:0, cy:0, s:1}, A = {};
  const R = {cv, full, pl, sel:"", only:"", geo:null, ga:0, gt:0, range:60, W:0, H:0, dpr:1, raf:0, last:0, busy:0, off:false};
  let col = {}, font = "", fs = 12;
  const now = () => performance.now();
  /* 顏色、字型跟著主題（每次有新資料時重讀，換深淺模式也會跟上） */
  R.theme = () => {
    const pr = document.createElement("i"); pr.className = "twr"; pr.style.cssText = "position:absolute;visibility:hidden"; cv.parentNode.appendChild(pr);   // 雷達一律是塔台螢幕的顏色（.twr），深淺模式都一樣
    const c = v => { pr.style.color = `var(${v})`; return getComputedStyle(pr).color; };
    col = {p:c("--p"), tx:c("--tx"), tx2:c("--tx2"), tx3:c("--tx3"), s2:c("--s2"), s3:c("--s3"), s4:c("--s4"), bad:c("--bad"), card:c("--card"), gnd:c("--tw-gnd"), ov:c("--tw-ov"), alt:[0, 1, 2, 3].map(i => c(`--alt${i}`))};
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
  const idle = () => { cv.parentNode.classList.toggle("off", !!(R.inv || R.hid)); if (!R.inv && !R.hid) R.kick(); };   // 看不到的時候掃描光也停下來（一直轉很耗電）
  if (!full && window.IntersectionObserver) new IntersectionObserver(es => { R.inv = !es[es.length - 1].isIntersecting; idle(); }).observe(cv);
  R.hide = on => { R.hid = on; if (!on) R.qt = 0; idle(); };                   // 整頁雷達蓋在上面：小雷達先不畫
  R.fit = r => Math.min(R.W, R.H) / 2 * (full ? .92 : 61 / 62) / r;   // 半徑 r 公里剛好放進畫面
  /* 視角：中心（公里）和比例（每公里幾點）；anim 時慢慢移過去 */
  R.view = (cx, cy, s, anim, d) => {
    if (anim && canAnim()) Object.assign(A, {t:now(), d:d || T.mid, a:{...V}, b:{cx, cy, s}});
    else { A.t = 0; Object.assign(V, {cx, cy, s}); }
    R.kick();
  };
  R.V = V;
  R.goal = () => A.t ? A.b : V;                             // 視角動畫要停在哪（滑鼠滾輪連續轉：從上一次的目標接著算）
  R.zoom = (r, anim) => { R.range = r; if (!full) R.view(0, 0, R.fit(r), anim); };
  R.setGeo = g => { if (R.geo === g) return; R.geo = g; R.gk = (R.gk || 0) + 1; R.gp = g && new Path2D(g.coast); R.gf = g && g.far ? new Path2D(g.far) : null; R.am = g && flyApm(g.apm); R.rws = g ? flyRws(g) : []; R.ga = 0; R.gt = now(); R.kick(); };
  R.trkOn = () => { R.tt = now(); R.kick(); };
  R.setTrk = d => { if (R.trk === d) return; R.trk = d; R.gk = (R.gk || 0) + 1; R.ti = null; R.td = now(); R.kick(); };
  /* 地勤車：只有整頁雷達放大到機場時畫；從現在的位置直直開到新的位置 */
  let VH = new Map();
  const vAt = (o, t) => { const k = Math.min(1, (t - o.t0) / FLYEV); return [o.x0 + (o.x1 - o.x0) * k, o.y0 + (o.y1 - o.y0) * k]; };
  R.setVeh = list => {
    const t = now(), m = new Map();
    (list || []).forEach(v => { if (v.x == null) return; const o = VH.get(v.id), [x, y] = o ? vAt(o, t) : [v.x, v.y]; m.set(v.id, {x0:x, y0:y, x1:v.x, y1:v.y, t0:t, cs:v.cs}); });
    VH = m; R.kick();
  };
  /* 新資料：每架飛機從現在畫的位置，花一次更新的時間慢慢移到新的位置 */
  R.setData = list => {
    const t = now(), seen = new Set();
    R.theme();
    list.forEach(p => {
      if (p.x == null || seen.has(p.id)) return;
      seen.add(p.id);
      let o = pl.get(p.id);
      let m0 = null, r0 = null;
      if (!o) { const q = flySnap(R.rws, p); o = {id:p.id, x0:q.x, y0:q.y, x1:q.x, y1:q.y, t0:t, a:pl.size && canAnim() ? 0 : 1, h:[]}; pl.set(p.id, o); }
      else {
        const [x, y] = R.at(o, t), far = Math.hypot(p.x - x, p.y - y) > 8;
        if (!far) { m0 = R.vel(o, t); r0 = R.hd(o, t); }        // 現在飛的方向、機頭方向：接著飛，不會在每次更新時折一下
        Object.assign(o, far ? {x0:p.x, y0:p.y} : {x0:x, y0:y}); o.t0 = t;   // 很遠才跳過去（snap 後的位置在下面設）
      }
      const q = flySnap(R.rws, p);                            // 在跑道上、對準跑道起降的：拉到跑道中線上，看起來跟跑道對齊
      o.x1 = q.x; o.y1 = q.y; o.p = q; o.gone = false;
      /* 轉彎走弧線：從現在飛的方向，順順地轉到新位置的方向（照速度、航向），不是一段一段直線 */
      const cx = o.x1 - o.x0, cy = o.y1 - o.y0, L = Math.hypot(cx, cy);
      const tan = m => { if (!m) return [cx, cy]; const n = Math.hypot(m[0], m[1]); if (!n || m[0] * cx + m[1] * cy <= 0) return [cx, cy]; const k = Math.min(n, L * 1.5) / n; return [m[0] * k, m[1] * k]; };
      const hv = q.ph !== "gnd" && q.alt && q.spd > 0 && q.trk != null ? (a => [Math.sin(a), Math.cos(a)].map(v => v * q.spd / 3600 * FLYEV / 1000))(q.trk * Math.PI / 180) : null;
      if (m0 && !Math.hypot(m0[0], m0[1]) && r0 != null) m0 = [Math.sin(r0 * Math.PI / 180) * L, Math.cos(r0 * Math.PI / 180) * L];   // 剛出現、還沒動過：從現在機頭的方向開始轉
      o.m0 = m0 && hv && L > .05 ? tan(m0) : null; o.m1 = o.m0 ? tan(hv) : null;
      o.r0 = r0 == null ? q.trk || 0 : r0; o.r1 = q.trk == null ? o.r0 : q.trk;
      const l = o.h[o.h.length - 1];
      if (p.ph !== "gnd" && (!l || l[0] !== q.x || l[1] !== q.y)) { o.h.push([q.x, q.y, p.alt]); if (o.h.length > 18) o.h.shift(); }
    });
    pl.forEach(o => { if (!seen.has(o.id)) o.gone = true; });
    R.kick();
  };
  const kOf = (o, t) => canAnim() ? Math.min(1, (t - o.t0) / FLYEV) : 1;
  R.at = (o, t) => {                                        // 有方向的：照兩頭的方向畫弧線（Hermite 曲線）；沒有的直直移過去
    const k = kOf(o, t);
    if (!o.m0 || k >= 1) return [o.x0 + (o.x1 - o.x0) * k, o.y0 + (o.y1 - o.y0) * k];
    const k2 = k * k, k3 = k2 * k, a = 2 * k3 - 3 * k2 + 1, b = k3 - 2 * k2 + k, c = 3 * k2 - 2 * k3, e = k3 - k2;
    return [a * o.x0 + b * o.m0[0] + c * o.x1 + e * o.m1[0], a * o.y0 + b * o.m0[1] + c * o.y1 + e * o.m1[1]];
  };
  R.vel = (o, t) => {                                       // 現在往哪邊飛（每段更新時間飛多遠）
    const k = kOf(o, t);
    if (!o.m0) return [o.x1 - o.x0, o.y1 - o.y0];
    if (k >= 1) return o.m1;
    const k2 = k * k, a = 6 * k2 - 6 * k, b = 3 * k2 - 4 * k + 1, c = -a, e = 3 * k2 - 2 * k;
    return [a * o.x0 + b * o.m0[0] + c * o.x1 + e * o.m1[0], a * o.y0 + b * o.m0[1] + c * o.y1 + e * o.m1[1]];
  };
  R.hd = (o, t) => {                                        // 機頭方向：走弧線的跟著飛的方向轉；其他的（地上、拉到跑道上）慢慢轉過去，不會一下跳到新方向
    if (o.r1 == null) return o.p ? o.p.trk || 0 : 0;
    const k = kOf(o, t);
    if (o.m0 && k < 1) { const [vx, vy] = R.vel(o, t); if (vx || vy) return Math.atan2(vx, vy) * 180 / Math.PI; }
    const k1 = Math.min(1, k * 3), d = ((o.r1 - o.r0) % 360 + 540) % 360 - 180;
    return o.r0 + d * EASEF(k1);
  };
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
    if (R.inv && !R.hid && R.onq) { R.calcQ(t); R.tm = setTimeout(R.kick, T.long); return; }   // 小雷達捲出畫面：不畫，只算排隊（排隊條照樣往前走）
    if (R.inv || R.hid) return;                             // 小雷達不在畫面上（手機上在看板下面）：不用畫，捲回來再畫
    if (!full && !A.t && scrolling()) { R.tm = setTimeout(R.kick, 120); return; }   // 手指在捲看板：小雷達先停一下，捲完再畫（捲動才順）
    const fading = o => o.gone || (o.on === false ? o.a > 0 : o.a < 1) || (o.dmT != null && o.dm !== o.dmT);   // 正在淡入淡出（雷達圈外的飛機一直是透明的，不算）
    if (R.sel !== R.ps) { R.ps = R.sel; R.st = t; }           // 換選到（滑鼠指著）的飛機：光圈跟看板那一列一樣慢慢亮起來
    if (R.focus !== R.pf) { R.pf = R.focus; R.ft1 = t; }      // 看板換分頁：飛機的濃淡跟著慢慢換
    const vk = full && (FLYVEHON || t - (R.vt || 0) < T.mid) && VH.size && Math.min(R.W, R.H) / 2 / V.s < 8;   // 地勤車畫得出來：它們在動也要重畫
    const moving = A.t || R.busy || R.lbusy || t - (R.vt || 0) < T.mid || (vk && [...VH.values()].some(o => t - o.t0 < FLYEV)) || t - (R.tt || 0) < T.mid || t - (R.td || 0) < T.mid || t - (R.st || 0) < T.fast || t - (R.ft1 || 0) < T.mid * 1.6 || [...pl.values()].some(o => fading(o) || t - o.t0 < FLYEV) || t - R.gt < T.mid;
    const fade = R.busy || R.lbusy || t - (R.tt || 0) < T.mid || t - (R.td || 0) < T.mid || t - (R.ft1 || 0) < T.mid * 1.6 || [...pl.values()].some(fading) || t - R.gt < T.mid;
    let v = 0;                                              // 照飛機在畫面上移動的快慢決定多久畫一次（移不到一點就不用重畫；整頁雷達拖曳、縮放時照樣每格都畫）
    if (!fade) pl.forEach(o => { if (o.vis && t - o.t0 < FLYEV) v = Math.max(v, Math.hypot(o.x1 - o.x0, o.y1 - o.y0)); });
    if (!fade && vk) VH.forEach(o => { if (t - o.t0 < FLYEV) v = Math.max(v, Math.hypot(o.x1 - o.x0, o.y1 - o.y0)); });
    const gap = A.t || R.busy ? 0 : t < FLYHUSH ? T.mid : fade ? 30 : Math.min(250, Math.max(33, .7 * FLYEV / (v * V.s || 1e-6)));   // 看板切換時先讓給切換動畫
    if (gap && t - R.last < gap && moving) { R.tm = setTimeout(R.kick, gap - (t - R.last)); return; }   // 等的時候不佔每一格畫面（一直要畫面會讓整頁的動畫都跟著在主執行緒算）
    R.last = t;
    R.draw(t);
    if (moving) R.raf = requestAnimationFrame(R.frame);
  };
  /* 排隊降落：每一架天上的抵達班機，看它對準哪一條跑道的哪一頭（不靠現在用哪條跑道的猜測，只有一架也算），照距離÷速度算幾分鐘後落地
     小雷達不在畫面上時也照樣算（雷達下面的排隊條要一直動） */
  R.calcQ = t => {
    R.q = [];
    if (!R.geo || !R.rws.length) { R.seq = new Map(); return; }
    const L = full ? 30 : 20;
      pl.forEach(o => {
        const p = o.p; if (o.gone || (R.inv ? 0 : o.a < .3) || p.ph !== "arr" || p.x == null || !p.alt || p.alt > 4500) return;
        const [x0, y0] = R.at(o, t); let b = null;
        R.rws.forEach((r, ri) => [[r.x1, r.y1, r.ux, r.uy], [r.x2, r.y2, -r.ux, -r.uy]].forEach(([x, y, ux, uy]) => {   // ux,uy：降落時飛的方向（從跑道頭往跑道裡）
          const dx = x0 - x, dy = y0 - y, al = -(dx * ux + dy * uy), lat = Math.abs(dx * uy - dy * ux), h = Math.atan2(ux, uy) * 180 / Math.PI;
          if (al <= -.3 || al > L + 5 || lat > Math.max(1.2, al * .12) || p.alt > 600 + al * 120) return;   // 在跑道頭外面、側偏不大、高度不會高過正常下滑太多
          if (p.trk != null && flyAdiff(p.trk, h) > 35) return;
          if (FLYD && FLYD.rdir != null && flyAdiff(h, FLYD.rdir) > 10) return;   // 現在往另一頭降落：順風邊往這邊飛的不是在進場
          if (!b || lat < b.lat) b = {al:Math.max(0, al), lat, x, y, ux, uy, ri};
        }));
        if (b) R.q.push([flyMins(b.al, p.spd || 250), o, b]);
      });
      R.q.sort((a, b) => a[0] - b[0]);
      R.q = R.q.slice(0, full ? 6 : 4);
      R.seq = new Map(R.q.map(([m, o], i) => [o.id, {n:i + 1, m}]));   // 清單用同樣的號碼、同樣的落地時間
      const sk = R.q.map(([, o], i) => o.id + i).join(); if (sk !== R.seqk) { R.seqk = sk; if (R.onseq) setTimeout(R.onseq); }   // 順序變了，清單跟著換
      if (R.onq && t - (R.qt || 0) > T.long) { R.qt = t; setTimeout(R.onq); }   // 進場排隊條：差不多每秒跟著飛機往前移
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
    /* 地圖、山、常走的路線：不常變，先畫在另一張畫布上，之後直接貼上去（每次都重畫山和路線，手機會卡） */
    const ga = R.geo ? EASEF(Math.min(1, (t - R.gt) / T.mid)) : 0;
    if (R.geo && R.gp) {
      const pr = x => canAnim() ? EASEF(Math.min(1, Math.max(0, (t - (x || 0)) / T.mid))) : 1;
      const tp = pr(R.tt), td = pr(R.td);                   // 常走路線：按開關慢慢出現、消失；資料到了慢慢浮出來（關著就不畫，不會閃一下）
      const ta = R.trk ? FLYTRKON ? Math.min(ga, tp, td) : 1 - tp : 0, ti = flyTer(R.geo);
      const zq = !A.t && !R.busy;                              // 停下來了：山用細的柔化
      const bk = [V.cx, V.cy, s, W, H, R.dpr, canAnim() ? ga : 1, ta, col.s2, col.s4, col.p, col.tx2, R.gk, !!ti, zq].join();
      const B = R.bg || (R.bg = document.createElement("canvas"));
      if (R.bk !== bk) {
        R.bk = bk;
        if (B.width !== cv.width || B.height !== cv.height) { B.width = cv.width; B.height = cv.height; }
        const g = B.getContext("2d"); g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); g.clearRect(0, 0, W, H);
        g.save(); g.globalAlpha = canAnim() ? ga : 1;
        g.translate(W / 2 - V.cx * s, H / 2 + V.cy * s); g.scale(s, s);
        g.lineWidth = 1 / s;
        if (R.gf) { const ba = g.globalAlpha; g.globalAlpha = ba * .55; g.fillStyle = col.s2; g.fill(R.gf); g.strokeStyle = col.s4; g.stroke(R.gf); g.globalAlpha = ba; }   // 台灣以外的陸地：淡淡的
        g.fillStyle = col.s2; g.fill(R.gp); g.strokeStyle = col.s4; g.stroke(R.gp);
        const tr = R.geo.ter;                                   // 山
        if (ti) {                                               // 只畫畫面看得到的那一塊（放大時整張山的圖會被放到好幾萬點寬，很慢）；縮放途中先用快的柔化，停下來再畫細的
          const m = 2 / s, x0 = Math.max(tr[0], V.cx - W / 2 / s - m), x1 = Math.min(tr[0] + tr[2], V.cx + W / 2 / s + m);
          const y0 = Math.max(-tr[1], -V.cy - H / 2 / s - m), y1 = Math.min(-tr[1] + tr[3], -V.cy + H / 2 / s + m);
          if (x1 > x0 && y1 > y0) {
            const kx = ti.width / tr[2], ky = ti.height / tr[3];
            g.save(); g.clip(R.gp); g.imageSmoothingQuality = zq ? "high" : "low"; g.globalAlpha *= .3;   // 山只留一點點明暗（塔台螢幕上整片花花的看久了不舒服）
            g.drawImage(ti, (x0 - tr[0]) * kx, (y0 + tr[1]) * ky, (x1 - x0) * kx, (y1 - y0) * ky, x0, y0, x1 - x0, y1 - y0); g.restore();
          }
        }
        else if (tr && FLYTERQ && !R.tq) R.tq = FLYTERQ.then(() => { R.tq = null; R.gt = now(); R.kick(); });
        const am = R.am ? Math.min(1, Math.max(0, (s - 12) / 14)) : 0, ba = g.globalAlpha;   // 放大到看得清楚機場：畫真的跑道、滑行道、機坪、航廈
        if (am > 0) {
          const A = R.am;
          g.globalAlpha = ba * am; g.fillStyle = col.s4; g.fill(A.ap);
          g.globalAlpha = ba * am * .45; g.fillStyle = col.tx3; g.fill(A.tm);
          g.globalAlpha = ba * am * .7; g.strokeStyle = col.tx3; g.lineJoin = "round"; g.lineCap = "round"; g.lineWidth = Math.max(.023, 1.2 / s); g.stroke(A.tw);
          g.globalAlpha = ba * am * .75; g.strokeStyle = col.tx3; g.lineCap = "butt";   // 跑道用灰色（飛機是主題色、深色），中間一條虛線
          A.rw.forEach(([w, p]) => { g.lineWidth = Math.max(w / 1000, 2 / s); g.stroke(p); });
          if (s > 40) { g.globalAlpha = ba * am * .9; g.strokeStyle = col.card; g.setLineDash([.03, .03]); A.rw.forEach(([w, p]) => { g.lineWidth = Math.max(w / 1000 * .03, .8 / s); g.stroke(p); }); g.setLineDash([]); }
          g.globalAlpha = ba;
        }
        g.lineCap = "round"; g.strokeStyle = col.tx3; g.lineWidth = (full ? 3 : 2.2) / s;
        const own = ([a, b, c, d]) => Math.hypot((a + c) / 2, (b + d) / 2) <= 4;   // 這個機場的跑道改畫真的位置（R.rws），飛機才會剛好對在線上
        g.beginPath(); (R.geo.rwy || []).forEach(r => { if (own(r)) return; g.moveTo(r[0], -r[1]); g.lineTo(r[2], -r[3]); }); g.stroke();
        if (am < 1) { g.globalAlpha = ba * (1 - am); g.beginPath(); R.rws.forEach(r => { g.moveTo(r.x1, -r.y1); g.lineTo(r.x2, -r.y2); }); g.stroke(); g.globalAlpha = ba; }
        if (R.trk && ta > 0) {                                // 常走的進場、離場路線：抵達用主題色、出發用灰色，細線，越常飛越清楚
          if (!R.ti) R.ti = {a:flyTrkLines(R.trk.arr), d:flyTrkLines(R.trk.dep)};
          g.lineJoin = g.lineCap = "round"; g.lineWidth = (full ? 1.6 : 1.3) / s;
          [[R.ti.d, col.tx], [R.ti.a, col.p]].forEach(([P, c]) => P && P.forEach((p, i) => { g.globalAlpha = ta * [.3, .55, .85][i]; g.strokeStyle = c; g.stroke(p); }));
        }
        g.restore();
      }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(B, 0, 0); ctx.restore();
    }
    /* 放大到機場裡：疊一層細格線（每 250 公尺），越放大越清楚，看起來像塔台的螢幕 */
    const apk = full ? Math.max(0, Math.min(1, (5 - Math.min(W, H) / 2 / s) / 2)) : 0;
    if (apk > 0) {
      const st = .25, [x0, y1] = R.km(0, 0), [x1, y0] = R.km(W, H);
      ctx.save(); ctx.globalAlpha = apk * .12; ctx.strokeStyle = col.p; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = Math.ceil(x0 / st) * st; x <= x1; x += st) { const sx = Math.round(R.xy(x, 0)[0]) + .5; ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
      for (let y = Math.ceil(y0 / st) * st; y <= y1; y += st) { const sy = Math.round(R.xy(0, y)[1]) + .5; ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
      ctx.stroke(); ctx.restore();
    }
    /* 導航台：整頁雷達放大時才畫（三角形是 VOR、點是 NDB） */
    const nv = [];
    if (R.geo && full && s > 3) {
      ctx.save(); ctx.globalAlpha = (canAnim() ? ga : 1) * .7; ctx.strokeStyle = ctx.fillStyle = col.tx3; ctx.lineWidth = 1.2;
      (R.geo.nav || []).forEach(([n, k, x, y]) => {
        if ([[0, 0], ...(R.geo.aps || []).map(a => [a[2], a[3]])].some(([ax, ay]) => Math.hypot(x - ax, y - ay) < 5)) return;   // 機場裡的導航台跟跑道疊在一起，不畫
        const [sx, sy] = R.xy(x, y); if (sx < -10 || sx > W + 10 || sy < (R.top || 0) || sy > H + 10) return;
        ctx.beginPath();
        if (k === "V") { ctx.moveTo(sx, sy - 4.5); ctx.lineTo(sx + 4, sy + 2.5); ctx.lineTo(sx - 4, sy + 2.5); ctx.closePath(); ctx.stroke(); }
        else { ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill(); }
        if (k === "V" || s > 8) nv.push([n, sx, sy]);
      });
      ctx.restore();
    }
    /* 現在用的跑道：進場那一頭往外畫延長線，每 2 公里一個刻度、每 5 公里長一點（整頁寫公里數），看得出排隊降落的飛機間隔多遠 */
    /* 排隊降落：每一架天上的抵達班機，看它對準哪一條跑道的哪一頭（不靠現在用哪條跑道的猜測，只有一架也算），照距離÷速度算幾分鐘後落地 */
    R.fin = []; R.calcQ(t);
    if (R.geo && R.rws.length) {
      const L = full ? 30 : 20;
      const ends = new Map();                                 // 要畫延長線的跑道頭：有飛機在排的；都沒有就照現在用的方向畫一條
      R.q.forEach(([, , b]) => ends.set(b.ri + ":" + (b.ux > 0 ? 1 : 0) + (b.uy > 0 ? 1 : 0), b));
      if (!ends.size && R.rwd != null) {
        const hd = R.rwd * Math.PI / 180, ux = Math.sin(hd), uy = Math.cos(hd), r = R.rws[0], a = r.x1 * ux + r.y1 * uy < r.x2 * ux + r.y2 * uy;
        ends.set("w", {x:a ? r.x1 : r.x2, y:a ? r.y1 : r.y2, ux, uy});
      }
      ctx.save(); ctx.globalAlpha = (canAnim() ? ga : 1) * .6; ctx.strokeStyle = ctx.fillStyle = col.p; ctx.lineWidth = full ? 1.4 : 1.1;
      ctx.font = `${Math.round(fs * .8)}px ${font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      [...ends.values()].forEach((F, n) => {
        const {x, y, ux, uy} = F, nx = uy, ny = -ux;
        ctx.beginPath(); ctx.moveTo(...R.xy(x, y)); ctx.lineTo(...R.xy(x - ux * L, y - uy * L));
        for (let k = 2; k <= L; k += 2) {
          const tk = (k % 10 ? k % 5 ? 2.5 : 4 : 5.5) / s, px = x - ux * k, py = y - uy * k;
          ctx.moveTo(...R.xy(px + nx * tk, py + ny * tk)); ctx.lineTo(...R.xy(px - nx * tk, py - ny * tk));
        }
        ctx.stroke();
        if (full && s > 5 && !n) {                             // 刻度旁寫公里數（只寫一條，兩條都寫會擠）
          const side = 12 / s;
          for (let k = 5; k <= L; k += 5) { const [sx, sy] = R.xy(x - ux * k + nx * side, y - uy * k + ny * side); if (sy > (R.top || 0) + fs) ctx.fillText(String(k), sx, sy); }
        }
        R.fin.push({x, y, ux, uy, L});
      });
      ctx.restore();
    } else R.seq = new Map();
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
    /* 地勤車：放大到 8 公里內慢慢出現（小方塊，不是飛機的樣子），再放大才寫名字；開關切換時慢慢出現、消失 */
    const half = Math.min(W, H) / 2 / s, vt = canAnim() ? EASEF(Math.min(1, (t - (R.vt || 0)) / T.mid)) : 1;
    const va = full && VH.size ? Math.max(0, Math.min(1, (8 - half) / 3)) * (FLYVEHON ? vt : 1 - vt) : 0;
    if (va > 0) {
      ctx.save(); ctx.font = `${Math.round(fs * .85)}px ${font}`; ctx.textBaseline = "middle";
      VH.forEach(o => {
        const [sx, sy] = R.xy(...vAt(o, t)); if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) return;
        const sq = (h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx - h, sy - h, h * 2, h * 2, r) : ctx.rect(sx - h, sy - h, h * 2, h * 2); ctx.fill(); };
        ctx.globalAlpha = va; ctx.fillStyle = col.card; sq(6.5, 3); ctx.fillStyle = col.tx2; sq(4.5, 2);   // 外面一圈底色：在跑道、滑行道上也分得出來
        if (o.cs && half < 3) { ctx.globalAlpha = va; ctx.fillStyle = col.tx2; ctx.fillText(o.cs, sx + 10, sy); }
      });
      ctx.restore();
    }
    /* 飛機：先算位置、透明度 */
    const vis = [], step = canAnim() ? dt / T.mid : 1;
    pl.forEach(o => {
      const on = want(o) && (full || Math.hypot(...R.at(o, t)) * s <= rr);
      o.k = on ? Math.min(1, (o.k ?? o.a) + step) : Math.max(0, (o.k ?? o.a) - step); o.on = on;
      o.a = on ? EASEF(o.k) : 1 - EASEF(1 - o.k);             // 淡入淡出用跟看板一樣的曲線（不是等速）
      o.dmT = !full && R.focus && o.id !== R.sel && o.p.ph !== R.focus && !(R.focus === "arr" && o.p.emg) ? .35 : 1;   // 看板在看抵達／出發：雷達上其他飛機淡一點，跟著看板一起換
      o.dm = o.dm == null || !canAnim() ? o.dmT : o.dm < o.dmT ? Math.min(o.dmT, o.dm + step * .7) : Math.max(o.dmT, o.dm - step * .7);
      o.v = o.a * EASEF(o.dm);
      if (o.gone && o.a <= 0) { pl.delete(o.id); return; }
      const [x, y] = R.at(o, t), [sx, sy] = R.xy(x, y);
      o.sx = sx; o.sy = sy; o.x = x; o.y = y; o.hd = R.hd(o, t); o.vis = o.a > .3 && sx > -20 && sx < W + 20 && sy > -20 && sy < H + 20;
      if (o.a > 0) vis.push(o);
    });
    const pc = o => o.p.emg ? col.bad : o.p.ph === "arr" ? col.p : o.p.ph === "dep" ? col.tx : o.p.ph === "gnd" || !o.p.alt ? col.gnd : col.ov;   // 抵達綠、出發藍、機坪黃、路過灰
    /* 尾跡：跟飛機同色、越舊越淡；路過的不畫；選到的那架照高度上色 */
    ctx.lineJoin = ctx.lineCap = "round";
    const ac = a => col.alt[a == null ? 0 : a < 1000 ? 0 : a < 3000 ? 1 : a < 6000 ? 2 : 3];   // 低的淺青、高的紫
    vis.forEach(o => {
      const sel = o.id === R.sel;
      if (!sel && o.p.ph === "over") return;
      if (o.h.length < 2 && !(o.h.length && o.p.ph !== "gnd")) return;
      const pts = [...o.h.slice(0, -1).map(([x, y, a]) => [...R.xy(x, y), a]), [o.sx, o.sy, o.p.alt]], n = pts.length - 1;
      const base = o.v * (sel ? 1 : R.sel && full ? .2 : .55);
      ctx.lineWidth = sel ? 2.4 : 1.1;
      if (!sel) ctx.strokeStyle = pc(o);
      for (let i = 1; i < pts.length; i++) {
        ctx.globalAlpha = base * (sel ? 1 : .15 + .85 * i / n);
        if (sel) ctx.strokeStyle = ac(pts[i - 1][2]);
        ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
      }
    });
    /* 機頭前面的短線：一分鐘後會飛到哪（小雷達半分鐘），拉遠時最長只畫一小段（不然高空飛得快的拖一大條，整片都是線）；
       路過的只畫一點點；選到的那架另外畫完整的 */
    ctx.lineWidth = 1;
    vis.forEach(o => {
      const p = o.p; if (o.id === R.sel || p.ph === "gnd" || !p.alt || !(p.spd > 0) || p.trk == null) return;
      const mx = (full ? 34 : 16) * (p.ph === "over" ? .5 : 1) / s;
      const d = Math.min(p.spd / 60 * (full ? 1 : .5), mx), hd = o.hd * Math.PI / 180, [ex, ey] = R.xy(o.x + Math.sin(hd) * d, o.y + Math.cos(hd) * d);
      ctx.globalAlpha = o.v * (p.ph === "over" ? full ? .25 : .15 : .45) * (R.sel && full ? .4 : 1); ctx.strokeStyle = pc(o);
      ctx.beginPath(); ctx.moveTo(o.sx, o.sy); ctx.lineTo(ex, ey); ctx.stroke();
    });
    const vo = R.sel && pl.get(R.sel);
    if (vo && vo.a > 0 && vo.p.ph !== "gnd" && vo.p.alt && vo.p.spd > 0) {
      const d = vo.p.spd / 60, hd = (vo.hd || 0) * Math.PI / 180, [ex, ey] = R.xy(vo.x + Math.sin(hd) * d, vo.y + Math.cos(hd) * d);
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
    const sk = canAnim() ? EASEF(Math.min(1, (t - (R.st || 0)) / T.fast)) : 1;
    const so2 = R.sel && pl.get(R.sel);
    if (so2 && so2.a > 0 && sk > 0) {                       // 選到的飛機後面一圈淡淡的光（看板那一列亮起來時，雷達這邊也一起亮）
      ctx.globalAlpha = so2.a * .35 * sk; ctx.fillStyle = col.p;
      ctx.beginPath(); ctx.arc(so2.sx, so2.sy, ps * 6.5 * (.6 + .4 * sk), 0, Math.PI * 2); ctx.fill();
    }
    const apv0 = full && Math.min(W, H) / 2 / s < 5;
    vis.forEach(o => {
      ctx.globalAlpha = o.v * (R.sel && full && o.id !== R.sel ? .55 : 1);
      ctx.save(); ctx.translate(o.sx, o.sy); ctx.rotate((o.hd || 0) * Math.PI / 180);
      const k0 = ps * (o.p.ph === "gnd" ? .6 : 1), k = apv0 ? Math.max(k0, (FLYWS[o.p.kind] || .036) * s / 6.4) : k0; o.pk = k; ctx.scale(k, k);   // 放大到機場裡面：照真的翼展大小畫
      const sh = FLYSH[o.p.kind] || FLYPL;                   // 照機型畫：四發、廣體、窄體、螺旋槳、小飛機、直升機
      ctx.lineJoin = "round"; ctx.lineWidth = 2.6 / k; ctx.strokeStyle = col.card; ctx.stroke(sh);   // 外面一圈底色：飛在跑道、滑行道上也分得出來
      if (o.id === R.sel) { const ga0 = ctx.globalAlpha; ctx.globalAlpha = ga0 * sk; ctx.lineWidth = 1.4 / k * 1.6; ctx.strokeStyle = col.p; ctx.stroke(sh); ctx.globalAlpha = ga0; }
      ctx.fillStyle = ctx.shadowColor = pc(o); ctx.shadowBlur = 7; ctx.fill(sh); ctx.restore();   // 螢光：飛機周圍一點點光暈
    });
    /* 排隊降落：對準跑道、在延長線上的抵達班機，照離跑道多遠編號，號碼放在延長線上對應的位置 */
    if (R.q.length) {                                       // 號碼放在延長線旁邊（不蓋住飛機），位置對著飛機離跑道多遠
      const br = full ? 8 : 6.5, off = (br * 2.4) / s;
      ctx.save(); ctx.font = `700 ${Math.round(br * 1.25)}px ${font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      R.q.forEach(([, o, F], i) => {
        const k = Math.min(F.al, (full ? 30 : 20)), [sx, sy] = R.xy(F.x - F.ux * k - F.uy * off, F.y - F.uy * k + F.ux * off);
        ctx.globalAlpha = o.v; ctx.fillStyle = col.p; ctx.beginPath(); ctx.arc(sx, sy, br, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col.card; ctx.fillText(String(i + 1), sx, sy + .5);
        rb.push([sx - br, sy - br, sx + br, sy + br]);       // 飛機名字避開號碼
      });
      ctx.restore();
    }
    /* 名字：擠在一起時換邊放，放不下就放遠一點拉線，再放不下先不顯示 */
    const apv = full && Math.min(W, H) / 2 / s < 5, onG = p => p.ph === "gnd" || !p.alt;   // 放大到機場裡面：地上的飛機也寫名字和停在哪
    const lf = Math.round(full ? fs : Math.max(9, rr / 21)), gz = full && Math.min(W, H) / 2 / s < 15, lab = vis.filter(o => o.vis && (o.id === R.sel || o.p.emg || o.p.hold || ((o.p.ph === "arr" || o.p.ph === "dep") && (gz || !onG(o.p))) || (full && o.p.ph === "over" && s > 14) || (apv && onG(o.p))));   // 路過的放大到 30 公里內才寫名字；地上的放大到 15 公里內才寫（不然全擠在機場上，蓋住跑道和要降落的；看板「機坪」有列）
    lab.forEach(o => { o.gtx = apv && onG(o.p) ? (o.p.gate ? `${o.p.gate} 登機門` : o.p.spd >= 3 ? (o.p.st && o.p.st !== "停在機坪" ? o.p.st : "滑行中") : "停在機坪") : null; });
    const used = flyPlace(ctx, lab, lf, ps * 3.4, full, font, R.sel, W, H, rb, R.top || 0), inLab = new Set(lab);
    /* 名字換邊放時滑過去、出現消失時淡入淡出（不會一下跳到另一邊、一下不見） */
    const lk = canAnim() ? 1 - Math.pow(.002, dt / T.mid) : 1, la = canAnim() ? dt / T.fast : 1;
    let lbusy = false;
    const lbl = vis.filter(o => {
      const on = inLab.has(o) && !!o.lp;
      if (on) { const tx = o.lp[0] - o.sx, ty = o.lp[1] - o.sy;
        if (!o.lo || !(o.la > 0)) o.lo = [tx, ty];
        else { o.lo[0] += (tx - o.lo[0]) * lk; o.lo[1] += (ty - o.lo[1]) * lk; if (Math.abs(tx - o.lo[0]) + Math.abs(ty - o.lo[1]) > .5) lbusy = true; else o.lo = [tx, ty]; }
        o.ld = [o.l1, o.l2, o.lk, o.lw, o.lh]; }
      o.la = Math.max(0, Math.min(1, (o.la || 0) + (on ? la : -la)));
      if (o.la > 0 && o.la < 1) lbusy = true;
      return o.la > 0 && o.lo && o.ld;
    });
    R.lbusy = lbusy;
    if (tw.length || nv.length) {
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
      ctx.globalAlpha = ta * .7; ctx.font = `${Math.round(fs * .8)}px ${font}`; ctx.textAlign = "left";
      nv.forEach(([n, x, y]) => {                           // 導航台代碼：放在符號右下，跟別的字撞到就不寫
        const w = ctx.measureText(n).width, a = [x + 6, y, x + 6 + w, y + fs * .9];
        if ([...used, ...pb, ...done].some(b => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1])) return;
        ctx.fillText(n, x + 6, y + fs * .45); done.push(a);
      });
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    }
    if (apk > 0) {                                          // 機場裡地上的飛機：四個角的瞄準框
      ctx.save(); ctx.strokeStyle = col.p; ctx.lineWidth = 1.5;
      lab.forEach(o => {
        if (!o.gtx) return;
        const r = Math.max(ps * 3.2, (o.pk || 0) * 3.8 + 3), c = r * .45; ctx.globalAlpha = o.v * apk * .8; ctx.beginPath();
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([dx, dy]) => { const x = o.sx + dx * r, y = o.sy + dy * r; ctx.moveTo(x, y - dy * c); ctx.lineTo(x, y); ctx.lineTo(x - dx * c, y); });
        ctx.stroke();
      });
      ctx.restore();
    }
    lbl.forEach(o => {
      const [l1, l2, lkk, lw, lh] = o.ld, lx = o.sx + o.lo[0], ly = o.sy + o.lo[1];
      ctx.globalAlpha = o.v * EASEF(o.la) * (R.sel && full && o.id !== R.sel ? .6 : 1);
      if (lkk.length > 1 || lkk !== lkk.toLowerCase()) {   // 名字放得比較遠：細線連到名字最近的那一邊
        const cx = Math.max(lx, Math.min(o.sx, lx + lw)), cy = Math.max(ly, Math.min(o.sy, ly + lh)), dd = Math.hypot(cx - o.sx, cy - o.sy) || 1, r0 = ps * 2.6;
        const ga0 = ctx.globalAlpha; ctx.globalAlpha = ga0 * .55; ctx.strokeStyle = col.tx3; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(o.sx + (cx - o.sx) / dd * r0, o.sy + (cy - o.sy) / dd * r0); ctx.lineTo(cx, cy); ctx.stroke(); ctx.globalAlpha = ga0;
      }
      ctx.fillStyle = o.p.emg ? col.bad : o.p.ph === "dep" ? col.tx : o.p.ph === "arr" ? col.p : o.p.ph === "over" ? col.ov : col.gnd;   // 名字跟飛機同色
      ctx.font = `600 ${lf}px ${font}`; ctx.fillText(l1, lx, ly + lf * .8);
      if (l2) { ctx.fillStyle = col.tx3; ctx.font = `${Math.round(lf * .85)}px ${font}`; ctx.fillText(l2, lx, ly + lf * 1.85); }
    });
    ctx.restore(); ctx.globalAlpha = 1;
  };
  return R;
}
/* 這個機場的跑道（公里）：有 OpenStreetMap 的用真的位置，同一條被切成好幾段的接回一條；沒有就用大約位置 */
/* 飛 path 公里要幾分鐘：最後 8 公里減速到大約 270 公里/時（跟主機算「幾分後」的 fly_mins 一樣） */
const flyRm = m => m >= 15 ? Math.round(m / 5) * 5 : Math.round(m);   // 15 分鐘以外只寫到 5 分鐘（跟主機 fly_rmin 一樣）
function flyMins(path, v){ v = Math.min(320, Math.max(150, v)); return (Math.max(0, path - 18) / v + Math.min(path, 18) / Math.min(v, 190)) * 60; }   // 跟主機 fly_mins 一樣
function flyRws(g){
  const seg = (g.apm && g.apm.rw || []).map(a => [a[1], a[2], a[a.length - 2], a[a.length - 1]]);
  const src = seg.length ? seg : (g.rwy || []).filter(([a, b, c, d]) => Math.hypot((a + c) / 2, (b + d) / 2) <= 4);
  const out = [];
  src.forEach(([x1, y1, x2, y2]) => {
    const len = Math.hypot(x2 - x1, y2 - y1); if (len < .3) return;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const r = out.find(r => Math.abs(r.ux * uy - r.uy * ux) < .05 && Math.abs((x1 - r.x1) * r.uy - (y1 - r.y1) * r.ux) < .08);
    if (!r) return out.push({x1, y1, x2, y2, ux, uy, len});
    const t = [0, r.len, (x1 - r.x1) * r.ux + (y1 - r.y1) * r.uy, (x2 - r.x1) * r.ux + (y2 - r.y1) * r.uy], a = Math.min(...t), b = Math.max(...t);
    Object.assign(r, {x1:r.x1 + r.ux * a, y1:r.y1 + r.uy * a, x2:r.x1 + r.ux * b, y2:r.y1 + r.uy * b, len:b - a});
  });
  out.tm = (g.apm && g.apm.tm || []).map(a => { const P = []; for (let i = 0; i + 1 < a.length; i += 2) P.push([a[i], a[i + 1]]); return P; });   // 航廈外框（停著的飛機機頭朝這裡）
  out.tw = [];                                              // 滑行道一小段一小段（地面滑行的飛機拉到上面）
  (g.apm && g.apm.tw || []).forEach(a => { for (let i = 0; i + 3 < a.length; i += 2) {
    const x1 = a[i], y1 = a[i + 1], len = Math.hypot(a[i + 2] - x1, a[i + 3] - y1);
    if (len > .001) out.tw.push({x1, y1, ux:(a[i + 2] - x1) / len, uy:(a[i + 3] - y1) / len, len});
  } });
  return out;
}
/* 停在登機門旁的飛機：訊號裡的方向常是關掉前的舊方向，改成機頭朝最近的航廈牆（250 公尺內；遠的停機位不動） */
function flyPark(tm, p){
  if (!tm || !tm.length) return p;
  let best = null;
  tm.forEach(P => { for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length], dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const k = l2 ? Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / l2)) : 0, qx = x1 + dx * k, qy = y1 + dy * k, d = Math.hypot(p.x - qx, p.y - qy);
    if (d <= .25 && (!best || d < best.d)) best = {d, qx, qy};
  } });
  if (!best || best.d < .005) return p;
  return {...p, trk:(Math.atan2(best.qx - p.x, best.qy - p.y) * 180 / Math.PI + 360) % 360};
}
/* 在滑行道上滑行的：拉到最近那條滑行道中線上（60 公尺內），機頭照滑行道方向；停著的（機坪上）不動 */
function flyTaxi(tw, p){
  if (!tw || !tw.length || !(p.spd >= 3) || p.spd >= 60) return p;
  let best = null;
  tw.forEach(r => {
    const dx = p.x - r.x1, dy = p.y - r.y1, t = Math.max(0, Math.min(r.len, dx * r.ux + dy * r.uy));
    const ex = p.x - (r.x1 + r.ux * t), ey = p.y - (r.y1 + r.uy * t), d = Math.hypot(ex, ey);
    if (d > .06) return;
    const hd = Math.atan2(r.ux, r.uy) * 180 / Math.PI, h = p.trk != null && flyAdiff(p.trk, hd) > 90 ? hd + 180 : hd;
    if (p.trk != null && flyAdiff(p.trk, h) > 40) return;   // 方向差太多（正在轉彎到別條）不拉
    const sc = d + (p.trk != null ? flyAdiff(p.trk, h) / 1500 : 0);
    if (!best || sc < best.sc) best = {sc, x:p.x - ex, y:p.y - ey, hd:(h + 360) % 360};
  });
  return best ? {...p, x:best.x, y:best.y, trk:best.hd} : p;
}
/* 快到機場、對準跑道起降和在跑道上滑跑的飛機：位置拉到跑道中線上、機頭轉成跑道方向（訊號有幾十公尺誤差，畫出來會歪在跑道旁邊）
   天上照雷達原本的位置：離跑道頭 3 公里內整個拉過去，到 8 公里慢慢放開；離中線 0.4～1.2 公里也一樣慢慢放開
   15 公里內對準的會記 rwi（延長線畫哪一條用）；回傳新的一份，原本的資料不動 */
function flySnap(rws, p){
  if (!rws || !rws.length || p.x == null || !(p.ph === "arr" || p.ph === "dep" || p.ph === "gnd")) return p;
  const gnd = p.ph === "gnd" || !p.alt;
  if (!gnd && p.alt > 5000) return p;
  if (gnd && !(p.spd >= 3)) return flyPark(rws.tm, p);    // 停著的：機頭朝最近的航廈
  if (gnd && !(p.spd >= 25)) return flyTaxi(rws.tw, p);    // 地面上慢的是在滑行道上（滑行道離跑道很近，慢的不拉到跑道）
  let best = null;
  rws.forEach((r, i) => {
    const dx = p.x - r.x1, dy = p.y - r.y1, t = dx * r.ux + dy * r.uy, lat = dx * r.uy - dy * r.ux;
    if (t < (gnd ? 0 : -15) || t > r.len + (gnd ? 0 : 15)) return;
    const hd = Math.atan2(r.ux, r.uy) * 180 / Math.PI;
    if (p.trk != null && Math.min(flyAdiff(p.trk, hd), flyAdiff(p.trk, hd + 180)) > (gnd ? 15 : 25)) return;
    if (Math.abs(lat) > (gnd ? .15 : 1.2) || (best && Math.abs(lat) >= Math.abs(best.lat))) return;
    best = {i, t, lat, hd: p.trk != null && flyAdiff(p.trk, hd) > 90 ? (hd + 180) % 360 : (hd + 360) % 360};
  });
  if (!best) return gnd ? flyTaxi(rws.tw, p) : p;
  const r = rws[best.i], far = Math.max(0, -best.t, best.t - r.len);
  const w = gnd ? 1 : Math.min(1, Math.max(0, (1.2 - Math.abs(best.lat)) / .8)) * Math.min(1, Math.max(0, (8 - far) / 5));
  if (w <= 0) return {...p, rwi:best.i};
  return {...p, x:p.x - r.uy * best.lat * w, y:p.y + r.ux * best.lat * w, trk:p.trk == null || w >= 1 ? best.hd : (p.trk + ((best.hd - p.trk + 540) % 360 - 180) * w + 360) % 360, rwi:best.i};   // 機頭跟著慢慢轉正，降落時不會歪
}
/* 機場地圖（OpenStreetMap）：做成畫布用的路徑；沒有資料回 null */
function flyApm(m){
  if (!m || !(m.rw || []).length) return null;
  const line = (P, a, i0) => { P.moveTo(a[i0], -a[i0 + 1]); for (let i = i0 + 2; i < a.length; i += 2) P.lineTo(a[i], -a[i + 1]); };
  const ap = new Path2D(), tm = new Path2D(), tw = new Path2D();
  (m.ap || []).forEach(a => { line(ap, a, 0); ap.closePath(); });
  (m.tm || []).forEach(a => { line(tm, a, 0); tm.closePath(); });
  (m.tw || []).forEach(a => line(tw, a, 0));
  return {ap, tm, tw, rw:m.rw.map(a => { const P = new Path2D(); line(P, a, 1); return [a[0] || 45, P]; })};
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
    if (o.p.hold) o.l2 = o.l2 ? "盤旋・" + o.l2 : "盤旋中";     // 在空中繞圈等降落
    if (o.gtx) o.l2 = o.gtx;                                // 機場裡：登機門或滑行中
    const w = Math.max(ctx.measureText(o.l1).width, o.l2 ? ctx.measureText(o.l2).width * .85 : 0) + 2, h = lf * (o.l2 ? 2.1 : 1.1), x = o.sx, y = o.sy;
    const G = gap * 2.6, D = G * .72;                       // 旁邊都放不下：放遠一點、拉一條細線連回飛機
    const c = {r:[x + gap, y - h / 2], l:[x - gap - w, y - h / 2], t:[x - w / 2, y - gap - h], b:[x - w / 2, y + gap * .9],
      R:[x + G, y - h / 2], L:[x - G - w, y - h / 2], T:[x - w / 2, y - G - h], B:[x - w / 2, y + G],
      RT:[x + D, y - D - h], RB:[x + D, y + D], LT:[x - D - w, y - D - h], LB:[x - D - w, y + D]};
    const order = [o.lk, "r", "l", "t", "b", "R", "L", "RT", "RB", "LT", "LB", "T", "B"].filter((v, i, a) => v && a.indexOf(v) === i);
    const k = order.find(k => !hit([c[k][0], c[k][1], c[k][0] + w, c[k][1] + h]));
    o.lk = k; o.lp = k ? c[k] : null; o.lw = w; o.lh = h;
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
const FLYQK = 25, flyQx = km => 92 * (1 - Math.min(km, FLYQK) / FLYQK);   // 進場排隊條：右邊是跑道，往左 25 公里
/* 進場排隊條：雷達上排隊降落的飛機（R.q）照離跑道頭多遠排在一條線上，慢慢往跑道滑過去；上面寫下一班 */
function flyQueue(f, d, rw){
  const el = f.querySelector(".rq"), v = f._rv; if (!el || !v || v.hid) return;   // 整頁雷達蓋著時小雷達不算排隊，先不動（不然圓點會被當成飛走了）
  const q = (v.q || []).filter(([, o]) => !o.gone), x = q[0] ? q[0][1].p : (d.arr || []).filter(p => p.x != null && p.eta != null && p.alt > 0).sort((a, b) => a.eta - b.eta)[0];
  const mn = q[0] ? q[0][0] : x && x.eta;
  txt(el.querySelector('[data-k="rq-nx"]'), q.length ? "" : x ? `下一班 ${x.fn || x.reg || ""} 約 ${flyRm(mn)} 分鐘後降落` : "");   // 線上已經有排隊的就不再寫一次下一班
  txt(el.querySelector('[data-k="rq-t"]'), rw ? `進場排隊・${rw.n} 跑道` : "進場排隊");
  const box = el.querySelector(".rqps"), seen = new Set();
  q.forEach(([m, o, b], i) => {
    const id = o.id; seen.add(id);
    let e = box.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!e) { e = document.createElement("span"); e.className = "rqp"; e.dataset.id = id; e.innerHTML = "<span><i></i><b></b><small></small></span>"; e.style.transform = `translateX(${flyQx(b.al)}%)`; box.appendChild(e); if (canAnim()) e.animate([{opacity:0}, {opacity:1}], {duration:T.mid, easing:EASE}); }
    if (e._bye) { e._bye = false; e.getAnimations().forEach(a => a.cancel()); if (canAnim()) e.animate([{opacity:0}, {opacity:1}], {duration:T.mid, easing:EASE}); }   // 正在淡出又回來了（例如看完整頁雷達）：停掉淡出、再淡入，不然會一直是透明的
    e.classList.toggle("up", i % 2 === 1); e.classList.toggle("emg", !!o.p.emg);
    const qx = flyQx(b.al); e.style.transform = `translateX(${qx}%)`;
    e.style.setProperty("--sh", `${Math.max(0, (14 - qx) / 14) * 50 - Math.max(0, (qx - 86) / 14) * 50}%`);   // 靠近兩頭：字往裡面靠，不超出框
    txt(e.querySelector("i"), String(i + 1)); txt(e.querySelector("b"), o.p.fn || o.p.reg || ""); txt(e.querySelector("small"), m < 1 ? "快落地" : `${flyRm(m)} 分`);
  });
  box.querySelectorAll(".rqp").forEach(e => { if (seen.has(e.dataset.id) || e._bye) return; e._bye = true;
    if (!canAnim()) return e.remove();
    e.animate([{opacity:1}, {opacity:0}], {duration:T.mid, easing:EXIT, fill:"forwards"}).finished.then(() => { if (e._bye) e.remove(); }, () => {}); });
  reveal(el, !!x);
}
/* 塔台廣播：METAR 的時間換成「資訊 A～Z」（每半小時換一個字母，跟機場廣播一樣），下面寫跑道、風、能見度、天氣、溫度 */
function flyWxRow(f, d, rw){
  const w = d.wx, out = [], kmh = k => Math.round(k * 1.852);
  flyQueue(f, d, rw);
  const sv = b => `<svg viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`;
  const tile = (ic, big, sub, tip) => `<div title="${esc(tip)}">${sv(ic)}<b class="num">${big}</b><small>${esc(sub)}</small></div>`;
  if (rw) out.push(tile('<rect x="13" y="3" width="8" height="28" rx="1.5" fill="currentColor" fill-opacity=".18" stroke="none"/><path d="M17 9v18" stroke-dasharray="2.5 3"/><path d="m13.5 8 3.5-4 3.5 4"/>',
    esc(rw.n), rw.wind ? "應該用" : "起降", `跑道 ${rw.n}`));
  if (w && w.ws != null) {   // 箭頭指向風吹過去的方向（東北風往西南吹）
    const dir = w.ws < 1 ? "無風" : w.wd < 0 ? "風向不定" : FLYDIR[Math.round(w.wd / 45) % 8] + "風";
    out.push(tile(`<circle cx="17" cy="17" r="14" stroke-opacity=".35"/><path d="M17 1.5v4" stroke-width="2.4"/>${w.ws >= 1 && w.wd >= 0 ? `<g transform="rotate(${w.wd} 17 17)"><path d="M17 8v18M11.5 20.5 17 26l5.5-5.5" stroke-width="2.6"/></g>` : `<circle cx="17" cy="17" r="2.5" fill="currentColor"/>`}`,
      w.ws < 1 ? "0" : kmh(w.ws), w.wg ? `陣風 ${kmh(w.wg)}` : "公里/時", `${dir} ${kmh(w.ws)} 公里/時${w.wg ? `，陣風 ${kmh(w.wg)}` : ""}`));
  }
  if (w && w.vis != null) {
    const [far, mid] = w.vis >= 9999 ? [.9, 1] : w.vis >= 5000 ? [.45, 1] : w.vis >= 3000 ? [.15, .7] : w.vis >= 1000 ? [.1, .3] : [.08, .12];   // 遠近的山：看得越遠，後面的山越清楚
    out.push(tile(`<path d="M8 24 17 6l6 10 3-4 7 12" stroke-opacity="${far}"/><path d="M1 27 8 16l7 11" stroke-opacity="${mid}"/><path d="M1 31q8-6 16-3t16-1v4z" fill="currentColor" stroke="none"/>`,
      w.vis >= 9999 ? "10+" : w.vis >= 1000 ? +(w.vis / 1000).toFixed(1) : w.vis, w.vis >= 1000 ? "公里" : "公尺", "能見度"));
  }
  if (w && (w.tmp != null || w.wx)) {
    const cl = '<path d="M9 22a6 6 0 1 1 1.6-11.8A8 8 0 0 1 26 13a5 5 0 0 1-1 9.9"/>';
    const ic = !w.wx ? '<path d="M15 5a3 3 0 0 1 6 0v13a6 6 0 1 1-6 0Z"/><path d="M18 12v10"/>'
      : w.wx === "雷雨" ? cl + '<path d="m18 18-3 6h5l-3 6"/>' : /雨/.test(w.wx) ? cl + '<path d="M11 26l-1.5 3M17 26l-1.5 3M23 26l-1.5 3"/>'
      : '<path d="M5 12h24M3 18h28M7 24h20"/>';
    out.push(tile(ic, w.tmp != null ? `${w.tmp}°` : "", w.wx || "溫度", `${w.wx ? w.wx + "，" : ""}${w.tmp != null ? w.tmp + "°C" : ""}`));
  }
  const el = f.querySelector(".rwx"), html = out.join("");
  const m = w && /\b(\d{2})(\d{2})(\d{2})Z\b/.exec(w.raw || "");
  const ltr = m ? String.fromCharCode(65 + ((+m[1] * 48 + +m[2] * 2 + (+m[3] >= 30 ? 1 : 0)) % 26)) : "";
  txt(el.querySelector('[data-k="wx-t"]'), m ? `${String((+m[2] + 8) % 24).padStart(2, "0")}:${m[3]}` : "");
  flapSet(el.querySelector(".rah .sf"), ltr || " ");
  const ad = el.querySelector(".rad");
  if (ad._h !== html) { ad._h = html; html ? swapHTML(ad, html) : ad.innerHTML = ""; }
  reveal(el, !!html);
}
const flyFocus = () => FLYS.tab === "arr" || FLYS.tab === "dep" ? FLYS.tab : "";   // 雷達跟著看板：看抵達時抵達的飛機清楚、其他淡一點
function flyRadar(f, d){
  const v = f._rv; if (!v) return;
  const rw = d.loading ? null : flyRwy(d);
  v.rwd = rw ? rw.h : null; if (FRAD && FRAD.rv) FRAD.rv.rwd = v.rwd;
  if (!d.loading) {
    flyWxRow(f, d, rw); v.onseq = () => f._rv === v && flyWxRow(f, d, rw);   // 雷達上排隊順序變了，「下一班」跟著換
    v.onq = () => f._rv === v && flyQueue(f, d, rw);
    [["arr", d.arr], ["dep", d.dep], ["gnd", d.gnd], ["over", [...d.over, ...(d.rest || [])]]].forEach(([k, l]) => txt(f.querySelector(`[data-k="rc-${k}"]`), String(l.filter(p => p.x != null).length)));
  }
  v.sel = FLYHOV || FLYSEL; v.focus = flyFocus(); v.setData(flyAll(d));
  f.querySelectorAll(".fr.hl").forEach(r => { if (r.dataset.id !== FLYHOV) r.classList.remove("hl"); });   // 列被換給別班了：不要留著亮
  if (!d.loading && d.ap && d.ap.code) flyTrk(f, d.ap.code);
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
  const rd = f.querySelector(".radar"), wide = getComputedStyle(f.querySelector(".fleft")).display === "contents", rt0 = rd.getBoundingClientRect().top;   // 電腦：雷達跟看板同一張卡片，上面幾排變了它也會跟著移
  const z = ZM(), s0 = span() / z, keys0 = hb._keys, was = new Set([hb, tb, sm, ...tb.querySelectorAll("[data-fterm]")].filter(shown));
  FLYSTILL = true; try { flyPaint(false); } finally { FLYSTILL = false; }
  b.classList.add("cvx"); const s1 = span() / z, bh = b.offsetHeight; b.classList.remove("cvx");   // 手機的列平常畫面外不排版（高度是估的），量的這一刻先排版
  fo.forEach(a => a.cancel()); b._fo = null;
  if (f._rv && f._rv.focus !== flyFocus()) { if (wide) FLYHUSH = 0; f._rv.focus = flyFocus(); f._rv.kick(); }   // 看板淡入的同時，雷達上的飛機也跟著換濃淡（電腦上同一張卡片，不能一邊動一邊停）
  const ins = [b, ...[hb, tb, sm, ...tb.querySelectorAll("[data-fterm]")].filter(e => shown(e) && !was.has(e) && !(e.parentNode === tb && !was.has(tb)))];   // 新出現的（整排新出來的，裡面的按鈕跟著那排一起）
  if (!hr && shown(hb) && was.has(hb) && hb._keys !== keys0) ins.push(hb);   // 時段那排還在、但時段變了：整排淡入；只有班數變的話只換數字
  ins.forEach(e => e.animate([{opacity:0, transform:"translateY(8px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE}));
  const h0 = bh - (s1 - s0), o = {duration:T.mid, easing:EASE};   // 總高度變了：看板的底慢慢移到新的位置，雷達跟著滑一次
  if (Math.abs(s1 - s0) > 1) b.animate([{height:Math.max(0, h0) + "px", overflow:"hidden"}, {height:bh + "px", overflow:"hidden"}], o);
  if (wide) { const dy = (rt0 - rd.getBoundingClientRect().top) / z; if (Math.abs(dy) > 1) rd.animate([{transform:`translateY(${dy}px)`}, {transform:"none"}], o); }
  else if (h0 < 0) rd.animate([{transform:`translateY(${h0}px)`}, {transform:"none"}], o);   // 上面多出來的比看板原本還高：差的那段由雷達補（剛好蓋在正在淡入的那幾排上）
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
  const pb = FLYPLC ? `<span class="fpn">${esc(FLYPLC.name)}${flyFlag(FLYPLC.cc)}</span>` : `<span class="fpn">${I("mpin")}地點</span>`;
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
const FLYCNX = {CN: "中國大陸", HK: "香港", MO: "澳門", KR: "韓國", AE: "阿聯", "CN+": "中國大陸・港澳"};
const flyCnName = c => FLYCNX[c] || (FLYCN && c ? FLYCN.of(c) : c) || "其他";
const flyCtry = pl => (pl && FLYD && FLYD.ccs && FLYD.ccs[pl.code]) || "";
const flyCg = c => c === "CN" || c === "HK" || c === "MO" ? "CN+" : c;   // 中國大陸、香港、澳門放成一組
const flyPlIs = (p, tab, sel) => { const pl = flyPl(p, tab); return sel.k[0] === "@" ? "@" + flyCg(flyCtry(pl)) === sel.k : flyPk(pl) === sel.k; };   // 「@JP」是整個國家
/* 地點清單照地區分段 */
const FLYRG = [["國內", "TW"], ["東北亞", "JP KR KP CN+ MN"], ["東南亞", "TH VN SG MY PH ID KH MM LA BN TL"], ["南亞", "IN NP BD LK MV PK BT"],
  ["中東", "AE QA TR SA IL KW OM BH JO IR IQ"], ["歐美", "US CA MX GB IE FR DE NL BE LU AT CH IT ES PT GR DK SE NO FI IS PL CZ SK HU RO BG HR SI RS UA RU BY LT LV EE"],
  ["大洋洲", "AU NZ GU MP PW FJ PG NC PF"]].map(([n, cs]) => [n, new Set(cs.split(" "))]);
const flyRg = c => { const i = FLYRG.findIndex(([, s]) => s.has(c)); return i < 0 ? FLYRG.length : i; };
function flyPlaces(){
  const d = FLYD, tab = FLYS.tab, m = new Map(), g = new Map();
  (d && d[tab] || []).filter(p => !FLYS.term || p.term === FLYS.term).forEach(p => {
    const pl = flyPl(p, tab), k = flyPk(pl); if (!k) return;
    const o = m.get(k) || {k, name: pl.name || pl.code, code: pl.code || "", cc: flyCc(pl), c: flyCtry(pl), lat: d.lat && d.lat[pl.code], n: 0}; o.n++; m.set(k, o); });
  m.forEach(o => { const c = flyCg(o.c), x = g.get(c) || {k: "@" + c, c, cc: c === "CN+" ? "CN" : c && c !== "TW" && !FLYNOFL.has(c) ? c : "", name: flyCnName(c), rg: c ? flyRg(c) : FLYRG.length, n: 0, items: []}; x.n += o.n; x.items.push(o); g.set(c, x); });
  const gs = [...g.values()].sort((a, b) => a.rg - b.rg || b.n - a.n || a.name.localeCompare(b.name, "zh-TW"));   // 先照地區，同地區班機多的國家在前
  gs.forEach(x => x.items.sort((a, b) => (a.c !== "CN") - (b.c !== "CN") || (a.c === "MO") - (b.c === "MO") || (b.lat ?? -99) - (a.lat ?? -99) || b.n - a.n));   // 城市由北到南；那一組是大陸城市、香港、澳門
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
  const row = (x, sub, fx) => `<button class="fplr${sub ? " sub" : ""}${sub === 2 ? " sf" : ""}${FLYPLC && FLYPLC.k === x.k ? " on" : ""}" data-fpl="${esc(x.k)}"><span class="lab">${sub !== 1 ? flyFlagAt(sub ? x.c === "CN" ? "" : x.cc : x.cc) : ""}${esc(x.name)}${fx ? `<span class="fplx${fx > 1 ? " open" : ""}" data-fx="${esc(x.k)}" role="button" aria-label="展開城市">${I("chev")}</span>` : ""}</span><span class="n">${x.n} 班</span>${ck}</button>`;
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
    const grp = g => { if (g.items.length === 1) return row({...g.items[0], cc: g.items[0].cc});
      const on = q || open.has(g.k);
      return row(g, 0, q ? 0 : on ? 2 : 1) + `<div class="fpls" data-fs="${esc(g.k)}"${on ? "" : " hidden"}>${g.items.map(x => row(x, g.c === "CN+" ? 2 : 1)).join("")}</div>`; };
    const html = (fs.length ? `<div class="fplh">航班</div>${fs.map(fl).join("")}` : "")
      + (!q ? `<button class="fplr${FLYPLC ? "" : " on"}" data-fpl=""><span class="lab">${flyFlagAt("")}全部地點</span><span class="n">${sum} 班</span>${ck}</button>` : "")
      + pls.map((g, i) => (!i || pls[i - 1].rg !== g.rg ? `<div class="fplh">${FLYRG[g.rg] ? FLYRG[g.rg][0] : "其他地區"}</div>` : "") + grp(g)).join("")
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
/* 時段長條圖：從最早到最晚每小時一根（沒有班機的也留位置），高度是班數；今天已經過去的淡一點，現在這個小時下面一個點；點或手指滑過去就看那個小時 */
function flyTl(hb, hrs, tz){
  const m = new Map(hrs.map(x => [x.k, x])), h0 = flyHM(Date.now(), tz).slice(0, 2), ks = [];
  const a = Math.min(...hrs.map(x => flyHi(x.k))), z = Math.max(...hrs.map(x => flyHi(x.k)));
  for (let i = a; i <= z && ks.length < 72; i++) ks.push(flyHk(i));
  const mx = Math.max(1, ...hrs.map(x => x.n)), keys = ks.join();
  if (hb._keys !== keys) {
    hb._keys = keys;
    hb.innerHTML = ks.map(k => { const i = flyHi(k), h = (i % 24 + 24) % 24, tm = i >= 24;   // 明天的時段：第一根前面空一點、寫「明」
      return `<button class="fhb${tm && h === 0 ? " tm0" : ""}" data-fhr="${k}"><i></i><small>${tm && h === 0 ? "明 0" : h}</small></button>`; }).join("");
  }
  [...hb.children].forEach(b => {
    const k = b.dataset.fhr, x = m.get(k), n = x ? x.n : 0;
    b.disabled = !n; b.classList.toggle("past", !!(x && x.past)); b.classList.toggle("now", k === h0); b.classList.toggle("lb", flyHi(k) % 6 === 0);
    b.style.setProperty("--h", (n / mx).toFixed(3)); b.setAttribute("aria-label", `${flyHl(k)} ${n} 班`);
  });
}
const flyHl = k => `${flyHi(k) >= 24 ? "明天 " : ""}${(flyHi(k) % 24 + 24) % 24} 點`;
/* 長條圖上面一行：選到的時段幾班 */
function flyHrSel(f, hrs){
  const e = f.querySelector(".fhsel"), x = hrs.find(y => y.k === FLYHR);
  if (!x) return;
  const t = `<b>${flyHl(x.k)}</b>${x.n} 班`;
  if (e._t !== t) { e._t = t; if (FLYSTILL || !canAnim() || e.hidden) e.innerHTML = t; else swapHTML(e, t); }
}
/* 官網航班表照「幾點」分成一段一段：已經過了的算在這一小時 */
const FLYDF = {};
const flyDay = (t, tz) => { const k = tz || ""; if (!FLYDF[k]) { try { FLYDF[k] = new Intl.DateTimeFormat("en-CA", {timeZone: tz || undefined}); } catch(e) { FLYDF[k] = new Intl.DateTimeFormat("en-CA"); } } return FLYDF[k].format(t); };
const flyHi = k => (k[0] === "+" ? 24 : k[0] === "-" ? -24 : 0) + +k.slice(-2);   // 時段代號 → 從今天 0 點算第幾小時（明天的前面加 +）
const flyHk = i => (i >= 24 ? "+" : i < 0 ? "-" : "") + String((i % 24 + 24) % 24).padStart(2, "0");
function flyHours(list, tz){
  const now = Date.now() / 1000, h0 = flyHM(Date.now(), tz).slice(0, 2), d0 = flyDay(Date.now(), tz), out = [];
  const hk = t => { const d = flyDay(t * 1000, tz); return (d > d0 ? "+" : d < d0 ? "-" : "") + flyHM(t * 1000, tz).slice(0, 2); };   // 明天凌晨的不能跟今天凌晨的算在一起
  list.forEach(p => { const t = p.at || p.est || p.sch || now, dn = flyDone(p) && t <= now, k = t <= now && !dn ? h0 : hk(t);   // 今天已到／已飛的照真的時間放進過去的時段
    p._hr = k; const o = out.find(x => x.k === k); o ? (o.n++, o.t = Math.min(o.t, t), o.past = o.past && dn) : out.push({k, n:1, t, past:dn && k !== h0}); });
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
  if (byHr && !hrs.some(x => x.k === FLYHR)) FLYHR = (hrs.find(x => !x.past) || hrs[hrs.length - 1]).k;   // 預設看現在這個小時（前面是今天已經過去的時段）
  const hb = f.querySelector(".fhrs"), sig = hrs.map(x => x.k + ":" + x.n).join(",");
  const sm = f.querySelector(".fsum"), st = d.fids && !d.loading && d.ok ? flySum(d) : "";   // 接下來一小時：幾班抵達、幾班出發、幾班延誤
  if (!d.loading) { flyRv(sm, !!st); if (st) flySumSet(sm, st); }
  f.classList.toggle("fwait", !!d.loading);
  if (!d.loading) flyRv(hb, byHr);                         // 等資料時時段那排留著（淡掉），不要收起來又長出來
  if (byHr && hb._sig !== sig) { hb._sig = sig; flyTl(hb, hrs, d.ap.tz); }   // 時段長條圖：班數變了只改高度，時段變了才重排
  if (byHr) hb.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.fhr === FLYHR));
  if (!d.loading) flyRv(f.querySelector(".fhsel"), byHr);
  if (byHr) flyHrSel(f, hrs);
  hb.classList.toggle("ftl", byHr);
  let list = byHr ? all.filter(p => p._hr === FLYHR).sort((a, b) => (a.at || a.est || a.sch) - (b.at || b.est || b.sch)) : all;
  const nd = d.fids && flyFT(FLYS.tab) ? list.filter(flyDone).length : 0, db = f.querySelector(".fdone");   // 已到／已飛的先收成一行，要來的排最上面
  const pastHr = byHr && (hrs.find(x => x.k === FLYHR) || {}).past;   // 過去的時段：全部都是已到／已飛，直接列出來，不用再收成一行
  if (nd && !FLYDONE && !pastHr) list = list.filter(p => !flyDone(p));
  f.querySelector(".board").classList.toggle("past", !!pastHr);
  if (!d.loading) { flyRv(db, nd > 0 && !pastHr); if (nd) { db.classList.toggle("on", FLYDONE); (FLYSTILL ? flySet : txt)(db.firstChild, `${FLYDONE ? "收起" : ""}${FLYS.tab === "arr" ? "已到" : "已飛"} ${nd} 班`); } }
  const n = list.length;
  flyWait(f, !!d.loading && d.ok);
  flyRv(msg, !d.ok || (!d.loading && !n));
  txt(msg, !d.ok ? d.error || "航班資料暫時拿不到" : d.loading ? "" : n ? "" : FLYPLC ? `沒有${FLYPLC.name}的班機` : d.night ? `現在不起降${d.first ? `，下一班 ${flyHM(d.first * 1000, d.ap.tz)}` : ""}` : d.fids && flyFT(FLYS.tab) ? `接下來沒有${FLYS.tab === "arr" ? "抵達" : "出發"}的班機` : FLYS.tab === "cargo" ? "目前沒有貨機" : FLYS.tab === "gnd" ? "目前沒有客機" : `附近現在沒有${FLYS.tab === "arr" ? "要降落" : "剛起飛"}的飛機`);
  const tz = d.ap.tz;
  flapSet(f.querySelector(".fcode .sf"), d.ap.code); flyApBtn(f, d.ap);
  txt(f.querySelector('[data-k="name"]'), d.ap.name); txt(f.querySelector('[data-k="city"]'), d.ap.city);
  flapSet(f.querySelector(".fclock .sf"), flyHM(Date.now(), tz));
  FLYTAB.forEach(([k]) => { const e = f.querySelector(`[data-k="n-${k}"]`), left = d.fids && flyFT(k), n = d.loading ? "" : String((d[k] || []).filter(p => !left || !flyDone(p)).length), was = e.dataset.n ?? e.textContent; if (was === n) return; e.dataset.n = n;
    e.previousSibling.hidden = !left;                       // 抵達、出發：只數還沒到／還沒飛的（已到的在「已到 N 班」）
    if (was && n && !FLYSTILL && canAnim()) flyRoll(e, was, n); else e.textContent = n; });
  flyMini(f);   // 班數變了：有變的那幾位數像翻牌一樣上下翻過去；不淡入：手機上淡入中剛好換分頁，數字會留著選到時的深色
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
  f.querySelector(".ffoot").innerHTML = d.night ? "" : (via ? `資料來自 ${via}` : "");
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
    const sig = p ? [p.id, p.fids ? v.t : "", v.st, v.reg, v.m].join("|") : "";   // 同一班的時間、狀態、登機門、機型變了：整列淡淡亮一下（看得出哪一班剛變）
    if (p && r._sig && r._sig !== sig && r.dataset.id === p.id && !off && anim !== false && canAnim()) { r.classList.remove("chg"); void r.offsetWidth; r.classList.add("chg"); }
    r._sig = sig;
    r.dataset.id = p ? p.id : ""; r.classList.toggle("bad", v.cls === "bad"); r.classList.toggle("hot", v.cls === "hot"); r.querySelector(".fk.t").classList.toggle("late", !!v.late); r.querySelector(".fk.t").classList.toggle("early", !!v.early); r.querySelector(".fk.reg").classList.toggle("gch", !!v.gch); r.querySelector(".fk.m").classList.toggle("gch", !!v.mch); r.classList.toggle("done", /已到|已飛/.test(v.st || "")); r.classList.toggle("empty", !p); r.classList.toggle("nopc", !!p && !v.pc); r.classList.toggle("nopl", !v.pl); r.classList.toggle("sel", !!p && p.id === FLYSEL);
    r.classList.toggle("onr", !!p && !!p.live && p.x != null && !flyDone(p) && (FLYS.tab === "arr" || FLYS.tab === "dep") && !!flyAl(p.fn));   // 雷達上看得到這班：標誌右下角一個點
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
  else if (FLYSTILL) {}                                     // 整塊換（看板淡出淡入）：列不用各自長出來
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
/* 接下來一小時：圖示＋數字（抵達、出發、延誤橘色；延誤 0 班就不放） */
function flySumSet(sm, [a, b, late]){
  if (!sm.querySelector(".fsn")) sm.innerHTML = `<span class="fsl">1 小時內</span>${["arr", "dep", "late"].map(k => `<span class="fsn ${k}" title="${{arr:"抵達", dep:"出發", late:"延誤"}[k]}">${flyTi(k)}<b></b></span>`).join("")}`;
  const n = sm.querySelectorAll(".fsn b");
  [a, b, late].forEach((v, i) => { const t = String(v); if (n[i].textContent !== t) (FLYSTILL ? (e => { e.textContent = t; }) : txt)(n[i], t); });
  sm.querySelector(".fsn.late").hidden = !late;
  sm.setAttribute("aria-label", `接下來一小時 抵達 ${a} 班、出發 ${b} 班${late ? `、延誤 ${late} 班` : ""}`);
}
function flySum(d){
  const now = Date.now() / 1000, up = p => p.fids && !/取消|已到|已飛/.test(p.st || "") && (p.est || p.sch) >= now - 300 && (p.est || p.sch) < now + 3600;
  const a = (d.arr || []).filter(up), b = (d.dep || []).filter(up), late = [...a, ...b].filter(p => p.est && p.est - p.sch >= 900).length;
  return a.length || b.length ? [a.length, b.length, late] : null;
}
/* 小標籤：最多一個，只放最要緊的（其他變更看字的顏色：時間早綠晚橘、登機門和機型改了是橘字） */
function flyTags(p, v){
  if (!p) return ["", ""];
  if (p.emg && !/緊急/.test(v.st || "")) return ["緊急", "bad"];   // 狀態翻牌已經寫「緊急狀況」：不用再多一個標籤
  if (flyDone(p)) return ["", ""];                          // 已經到了、飛了：變更都不用再提醒
  if (v.gch) return ["改登機門", "late"];
  if (v.late && !/延誤/.test(v.st || "")) return [`晚 ${flyMin(v.late)}`, "late"];   // 狀態已經寫「延誤」、時間也是橘字：不用再多一個標籤
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
  const fb = $("#fly .board"), fx = fb && fb.querySelector(".frows"), fm = fb && fb.querySelector(".fmsg");
  if (fx && canAnim()) {                                      // 只剩已到／已飛的班機：展開、收起會跟「接下來沒有…」互換，改成整塊換（不然會疊在一起、高度跳兩次）
    const vis = [...fx.children].filter(r => !r.hidden && !r._bye);
    if (FLYDONE ? !fm.hidden && !fm._hiding : vis.length && vis.every(r => r.classList.contains("done"))) return flyDoneSwap(fb, fx, fm);
  }
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
/* 「已到 N 班」跟「接下來沒有…」互換：舊的淡出，看板高度一次滑到新的高度，新的淡入；按鈕不動，只換字 */
async function flyDoneSwap(b, box, msg){
  const id = ++FLYSW, db = b.querySelector(".fdone"), old = [msg, ...box.children].filter(e => !e.hidden && !e._bye);
  if (db && !db.hidden) txt(db.firstChild, FLYDONE ? "收起" + db.firstChild.textContent : db.firstChild.textContent.replace(/^收起/, ""));
  FLYBZ = performance.now() + T.fast * .6 + T.mid + 60;
  const fo = old.map(e => e.animate([{opacity:1}, {opacity:0}], {duration:T.fast * .6, easing:EXIT, fill:"forwards"}));
  await Promise.all(fo.map(a => a.finished.catch(() => {})));
  if (id !== FLYSW) return fo.forEach(a => a.cancel());
  old.forEach(e => e.getAnimations().forEach(a => { if (!fo.includes(a)) a.finish(); }));
  const h0 = b.offsetHeight;
  FLYSTILL = true; try { flyPaint(false); } finally { FLYSTILL = false; }
  b.classList.add("cvx"); const h1 = b.offsetHeight; b.classList.remove("cvx");
  fo.forEach(a => a.cancel());
  [msg, ...box.children].filter(e => !e.hidden && !old.includes(e)).forEach(e => e.animate([{opacity:0, transform:"translateY(8px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE}));
  if (Math.abs(h1 - h0) > 1) b.animate([{height:h0 + "px", overflow:"hidden"}, {height:h1 + "px", overflow:"hidden"}], {duration:T.mid, easing:EASE});
}
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
/* 看板只傳有變的班機：主機對沒變的列只給代號，照上一次拿到的接回來（存成文字，畫面改過的欄位不會跟著帶過去） */
let FLYSLIM = {};
const FLYLS = ["arr", "dep", "gnd", "over", "rest", "cargo", "veh"];
function flyUnslim(d, pv){
  if (d.base) {
    if (!pv || pv.v !== d.base) return false;
    for (const k of FLYLS) {
      if (!d[k]) continue;
      for (let i = 0; i < d[k].length; i++) if (typeof d[k][i] === "string") { const j = pv.raw.get(k + ":" + d[k][i]); if (j == null) return false; d[k][i] = JSON.parse(j); }
    }
  }
  const raw = new Map(); FLYLS.forEach(k => (d[k] || []).forEach(p => raw.set(k + ":" + p.id, JSON.stringify(p))));
  FLYSLIM = {ap:d.ap && d.ap.code, v:d.v, raw};
  return true;
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
    const pv = FLYSLIM.ap === ap ? FLYSLIM : null;
    const r = await api("/api/flights?ap=" + encodeURIComponent(ap) + (pv ? "&v=" + pv.v : ""), {headers:flyHdr()});
    if (SHARE && r.status === 401) return shareGone("連結已經失效");
    let d = await r.json();
    if (d.ok && d.v && !flyUnslim(d, pv)) {                  // 接不回來（不該發生）：整張重拿
      FLYSLIM = {}; d = await (await api("/api/flights?ap=" + encodeURIComponent(ap), {headers:flyHdr()})).json(); flyUnslim(d, null);
    }
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
  const f = $("#fly"), z = ZM(), r = btn && btn.getBoundingClientRect(), x = $(".dash.d") ? 96 : 0;   // 電腦：從分頁列右邊開始
  if (r) f.style.cssText = `--ct:${r.top / z}px;--cb:${(innerHeight - r.bottom) / z}px;--cl:${Math.max(0, r.left / z - x)}px;--cr:${(innerWidth - r.right) / z}px`;
  if (!canAnim()) f.style.animation = "none";
  flyStuck(f);
  if (!SHARE) history.pushState({fly:1}, "");          // 分享連結只有這一頁，不能返回
  document.documentElement.classList.add("lock");
  setTimeout(() => { if (f.isConnected && !f._bye) document.documentElement.classList.add("flyon"); }, T.slow + 80);   // 很快又關掉的話不要加（不然關完後面的畫面會整個藏著）
  f._rv = radarView(f.querySelector(".rcv"), false); f._rv.range = flyR(); flyZoom(f, false);   // 雷達先建好：下面用現成資料畫的時候，底圖才放得上去
  if (FLYD && FLYD.ap && FLYD.ap.code === FLYS.ap) {         // 有上次的資料：小飛機照樣飛一趟，看板在後面直接排好（不一格一格翻），飛完一塊一塊浮上來
    flySplashOn(f);
    FLYSTILL = true; try { flyPaint(false); } finally { FLYSTILL = false; }
    flyRadar(f, FLYD);                                        // 雷達也用上次的資料先畫好（不然要等下一次抓到資料才出現飛機）
    flySplashOff(f);
    FLYBZ = performance.now() + T.long * 2 + T.slow + T.fast * 3;   // 浮完才換上剛抓到的新資料
  } else { flySplashOn(f); flyWait(f, true); }
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
  clearTimeout(FLYT); FLYSEL = FLYHOV = ""; FLYHR = ""; FLYPLC = null;   // 關掉再打開：地點回到全部
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
  const b = f.querySelector(".fapb"), lg = b && b.querySelector(".faplg"); if (!lg) return;
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
      FLYHOLD = new Promise(r => setTimeout(() => {           // 換成載入畫面、舊的淡完才把看板換成新機場（藏在後面換）
        if (FLYS.ap !== code) return r();
        flySplashSwap($("#fly")); setTimeout(() => { if (FLYS.ap === code) flyPaint(); r(); }, canAnim() ? T.fast + 30 : 0);
      }, hold));
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
  const tm = p.fids ? `<span class="fdt"><b class="num">${hm(p.est || p.sch)}</b>${p.est && hm(p.est) !== hm(p.sch) ? `<s class="num">${hm(p.sch)}</s>` : ""}</span>` : "";
  const end = (x, mine) => `<div class="fre"><b>${esc(x ? x.code : "—")}</b><small>${esc(x ? (x.guess ? "可能是 " : "") + x.name : "查不到")}${flyFlag(flyCc(x))}</small>${mine ? tm : ""}</div>`;
  const gmap = FLYGATE[d.ap.code] && !arr && p.gate && !flyDone(p) && !/取消/.test(p.st || "");   // 有登機門導引：登機門寫在地圖上面，下面不重複
  const vr = p.vr > 0.5 ? `，上升 ${p.vr} 公尺/秒` : p.vr < -0.5 ? `，下降 ${-p.vr} 公尺/秒` : "";
  const keys = [                                           // 登機證下半：最常看的幾項，大字（改過的小字寫原本的）
    [arr ? "抵達登機門" : "登機門", gmap ? "" : p.gate, [p.term, p.gate0 && p.gate ? `原本 ${p.gate0}` : ""].filter(Boolean).join("・")],
    [arr ? "行李轉盤" : "報到櫃台", (p.bx || "").replace(/^\S+ /, ""), ""],
    ["機型", p.model || p.t, p.type0 && (p.model || p.t) ? `原本 ${p.type0}` : p.t && p.model && p.t !== p.model ? p.t : ""],
    ["註冊號", p.reg, ""],
  ].filter(r => r[1]);
  const rows = [
    ["共掛班號", p.share && p.share.length ? p.share.join("、") : ""],
    ["高度", air && p.alt ? `${p.alt.toLocaleString()} 公尺${p.ph === "gnd" ? "" : vr}` : ""],   // 在地上：狀態已經寫了，不用再列「地面」「0 公里/時」
    ["速度", air && (p.alt || p.spd >= 5) ? `${p.spd} 公里/時` : ""],
    ["離機場", air ? `${p.d} 公里` : ""],
    ["呼號", p.cs && p.cs !== p.fn ? p.cs : ""],
    ["應答碼", p.sq],
    ["飛機訊號", air ? "" : p.seen ? `${hm(p.seen)} 之後收不到` : p.fids ? "收不到" : ""],
  ].filter(r => r[1]);
  const reg = encodeURIComponent(p.reg || "");
  v.innerHTML = `<div class="dialog finfo"><div class="form">
    <a class="fph" target="_blank" rel="noopener noreferrer" hidden></a>
    <div class="bpass"><div class="fih">${flyLogo(flyAl(p.fn), "lg")}<div class="lab"><b class="ffn">${esc(p.fn || p.reg || "—")}</b><small>${esc([p.al, p.use].filter(Boolean).join("・") || "航空公司不明")}</small></div>
      ${p.st ? `<span class="fst2${p.emg || /取消|轉降/.test(p.st) ? " bad" : ""}">${esc(p.st)}</span>` : ""}</div>
      ${p.org || p.dst ? `<div class="froute">${end(p.org, !arr)}<span class="fln"><i></i>${I("plane")}<i></i></span>${end(p.dst, arr)}</div>` : air && !p.alt ? "" : `<div class="fnr sub">航線不明</div>`}
      ${keys.length ? `<div class="bpcut"></div><div class="bpk">${keys.map(([k, val, sm]) => `<div><span>${k}</span><b>${esc(val)}</b>${sm ? `<small${/原本/.test(sm) ? ' class="was"' : ""}>${esc(sm)}</small>` : ""}</div>`).join("")}</div>` : ""}</div>
    <div class="fbad fown" hidden></div>
    ${p.emg || p.mil || p.rare ? `<div class="fbad${p.emg ? " bad" : ""}">${p.emg ? `${I("warn")}${esc(p.st)}（應答碼 ${esc(p.sq)}）` : p.mil ? "軍機" : "少見機型"}</div>` : ""}
    ${gmap ? `<div class="fgate"></div>` : ""}
    ${rows.length ? `<div class="fdl">${rows.map(([k, val]) => `<div><span>${k}</span><b>${esc(val)}</b></div>`).join("")}</div>` : ""}
    ${reg ? `<div class="group"><a class="li" href="https://www.jetphotos.com/registration/${reg}" target="_blank" rel="noopener noreferrer"><span class="lab">看這架的照片<small>JetPhotos</small></span>${EXT}</a>
      <a class="li" href="https://www.flightradar24.com/data/aircraft/${reg.toLowerCase()}" target="_blank" rel="noopener noreferrer"><span class="lab">飛行紀錄<small>Flightradar24</small></span>${EXT}</a></div>` : ""}
    </div><div class="btns">${p.x != null && p.live !== false ? `<button class="ubtn" data-frad>在雷達上看</button>` : ""}</div></div>`;
  $("#layer").appendChild(v);
  flyPhoto(v.querySelector(".fph"), p);
  flyOwner(v.querySelector(".fown"), p);
  if (v.querySelector(".fgate")) flyGate(v, v.querySelector(".fgate"), p, d.ap.code);
  const done = () => { if (v._d) return; v._d = 1; flyMeOff(v); v.classList.add("closing"); FLYSEL = ""; flyPaint(); setTimeout(() => v.remove(), 360); };
  v._esc = done;
  v.addEventListener("click", e => {
    if (e.target.closest("[data-frad]")) { done(); fradOpen(); return fradPick(p.id, true); }   // 打開整頁雷達、選好這架、移到中間
    if (e.target === v || e.target.closest("[data-r]")) done();
  });
}
document.addEventListener("click", e => {
  const f = e.target.closest && e.target.closest("#fly"); if (!f) return;
  const t = e.target;
  if (t.closest("[data-fback]")) return flyClose();
  if (t.closest("[data-fpick]")) return flyPick();
  if (t.closest("[data-fplace]")) return flyWhere();
  if (t.closest("[data-rfull]")) return fradOpen();
  if (t.closest("[data-fshare]")) return flyShare();
  if (t.closest("[data-fmini]")) return flyMiniMenu(f, t.closest("[data-fmini]"));
  const tb = t.closest("[data-ftab]");
  if (tb) { if (FLYS.tab !== tb.dataset.ftab) { FLYS.tab = tb.dataset.ftab; FLYHR = ""; flySave(); const s = tb.parentNode;
    slideSel(() => s.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === tb))); flyMini(f); flySwitch("tab"); } return; }
  if (t.closest("[data-ftrk]")) return flyTrkSet(!FLYTRKON);
  const zb = t.closest("[data-fzm]");
  if (zb) { if (+FLYS.zm !== +zb.dataset.fzm) { FLYS.zm = +zb.dataset.fzm; flySave(); flyZoom(f, true); } return; }
  const tm = t.closest("[data-fterm]");
  if (tm) { if ((FLYS.term || "") !== tm.dataset.fterm) { FLYS.term = tm.dataset.fterm; FLYHR = ""; flySave(); const s = tm.parentNode;
    slideSel(() => s.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === tm))); flySwitch(); } return; }
  if (t.closest("[data-fdone]")) { FLYDONE = !FLYDONE; return flyDoneOpen(); }
  if (t.closest(".fsum")) {                                 // 點「接下來一小時」：跳到抵達（在出發就留在出發）的這個小時
    const k = FLYS.tab === "dep" ? "dep" : "arr", b = FLYS.tab === k ? f.querySelector(".fhrs button:not(.past):not(:disabled)") : f.querySelector(`[data-ftab="${k}"]`);
    if (b && !b.classList.contains("on")) b.click();
    f.querySelector(".board").scrollIntoView({block:"nearest", behavior:canAnim() ? "smooth" : "auto"}); return;
  }
  const hr = t.closest("[data-fhr]");
  if (hr) { if (FLYHR !== hr.dataset.fhr) { FLYHR = hr.dataset.fhr; const s = hr.parentNode;
    slideSel(() => s.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === hr))); flySwitch("hr");
    flyNudge(s, hr); } return; }
  const r = t.closest(".fr[data-id]");
  if (r && r.dataset.id) return flyInfo(r.dataset.id);
});
/* 電腦：滑鼠指著看板的某一班，雷達上那架亮起來；指著雷達上的飛機，看板那一列亮起來 */
(function(){
  let raf = 0, ev = null;
  const hl = id => {
    const f = $("#fly"), v = f && f._rv; if (!v || id === FLYHOV) return;
    FLYHOV = id; v.sel = id || FLYSEL; v.kick();
    f.querySelectorAll(".fr.hl").forEach(r => r.classList.remove("hl"));
    const r = id && f.querySelector(`.frows>.fr[data-id="${CSS.escape(id)}"]`); if (r) r.classList.add("hl");
  };
  const look = () => {
    raf = 0; const e = ev, t = e.target, f = t.closest && t.closest("#fly"); if (!f || !f._rv) return hl("");
    const r = t.closest(".frows>.fr[data-id]");
    if (r) return hl(r.dataset.id && f._rv.pl.has(r.dataset.id) ? r.dataset.id : "");   // 雷達上沒有這架（還沒起飛、收不到訊號）就不亮
    if (t.classList.contains("rcv")) { const b = t.getBoundingClientRect(), z = ZM(), p = f._rv.hit((e.clientX - b.left) / z, (e.clientY - b.top) / z); return hl(p ? p.id : ""); }
    hl("");
  };
  document.addEventListener("pointermove", e => { if (e.pointerType !== "mouse") return; ev = e; if (!raf) raf = requestAnimationFrame(look); }, {passive:true});
})();
/* 時段長條圖：按著左右滑，滑到哪個小時就看哪個小時 */
(function(){
  let tl = null;
  document.addEventListener("pointerdown", e => { const b = e.target.closest && e.target.closest("#fly .fhrs.ftl .fhb"); tl = b ? b.parentNode : null; });
  addEventListener("pointermove", e => {
    if (!tl) return;
    const el = document.elementFromPoint(e.clientX, e.clientY), b = el && el.closest && el.closest(".fhb");
    if (b && b.parentNode === tl && !b.disabled && !b.classList.contains("on")) b.click();
  }, {passive:true});
  ["pointerup", "pointercancel"].forEach(k => addEventListener(k, () => { tl = null; }));
})();
/* 電腦：時段、航廈那一排可以用滑鼠拖著捲，滾輪也能左右捲（捲到頭再滾就捲整頁） */
(function(){
  const row = t => t.closest && t.closest("#fly :is(.fhrs,.fterm)");
  let d = null;
  document.addEventListener("pointerdown", e => {
    const s = e.pointerType === "mouse" && !e.button && row(e.target);
    if (s && s.scrollWidth > s.clientWidth) d = {s, x:e.clientX, l:s.scrollLeft, moved:false};
  });
  addEventListener("pointermove", e => {
    if (!d) return;
    const dx = (e.clientX - d.x) / ZM();
    if (!d.moved && Math.abs(dx) < 5) return;
    if (!d.moved) { d.moved = true; d.s.classList.add("drag"); }
    d.s.scrollLeft = d.l - dx;
  });
  addEventListener("pointerup", () => {
    if (!d) return;
    const m = d.moved; d.s.classList.remove("drag"); d = null;
    if (!m) return;
    const eat = e => { e.stopPropagation(); e.preventDefault(); };   // 拖完放開不算點一下
    addEventListener("click", eat, true); setTimeout(() => removeEventListener("click", eat, true));
  });
  document.addEventListener("wheel", e => {
    const s = row(e.target);
    if (!s || e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const max = s.scrollWidth - s.clientWidth;
    if (max <= 0 || (e.deltaY < 0 && s.scrollLeft <= 0) || (e.deltaY > 0 && s.scrollLeft >= max - 1)) return;
    e.preventDefault(); s.scrollBy({left:e.deltaY, behavior:Math.abs(e.deltaY) >= 50 && canAnim() ? "smooth" : "auto"});
  }, {passive:false});
})();
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
    <div class="frzm"><button class="icbtn${flyLayOn() ? " on" : ""}" data-rtrk title="圖層">${I("layers")}</button><button class="icbtn" data-rz="1" title="放大">${I("plus")}</button><button class="icbtn" data-rz="-1" title="縮小">${I("minus")}</button></div>
    <div class="frcard" hidden></div></div>
    <div class="frlist"><button class="frlh" data-rlist><span class="grow"></span><span class="chv">${I("chev")}</span></button><div class="frli"></div></div>`;
  document.body.appendChild(v);
  if (!canAnim()) v.style.animation = "none";
  history.pushState({fly:1, frad:1}, "");
  const cv = v.querySelector("canvas"), rv = radarView(cv, true);
  FRAD = {v, rv, sel:""}; rv.rwd = f._rv.rwd; rv.onseq = fradList;
  const top = () => { const b = v.querySelector(".frbar").getBoundingClientRect(), m = cv.getBoundingClientRect(), z = ZM(); rv.top = (b.bottom - m.top) / z + 4; };
  rv.resize(); top(); rv.view(0, 0, rv.fit(flyR() * .95));           // 一開始跟小雷達看到的範圍差不多，看起來就像它長大
  if (f._geo) { rv.setGeo(FLYGEO[f._geo]); rv.setTrk(FLYTRK[f._geo] && FLYTRK[f._geo].d); }
  fradData();
  if (window.ResizeObserver) new ResizeObserver(() => { if (FRAD && FRAD.rv === rv) { rv.resize(); top(); } }).observe(cv);
  fradGest(rv, cv);
  setTimeout(() => { if (FRAD && FRAD.rv === rv) { f._rv.hide(true); f.classList.add("under"); } }, canAnim() ? T.slow + 80 : 0);   // 後面的看板也先藏起來   // 長大完：後面的小雷達被蓋住了，先不畫
}
function fradClose(){ if (!FRAD) return; if (history.state && history.state.frad) history.back(); else fradShut(); }
function fradShut(){
  const F = FRAD; if (!F) return; FRAD = null;
  const f = $("#fly"), b = f && f.querySelector(".rbox"), v = F.v, end = () => { F.rv.stop(); v.remove(); };
  if (f) f.classList.remove("under");                        // 縮回去之前：後面的看板整個重畫
  if (f && f._rv) f._rv.hide(false);                        // 縮回去之前小雷達先畫好
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
  rv.setData(flyAll({arr:[], dep:[], gnd:[], over:[], ...d})); rv.setVeh(d.veh);
  v.querySelector(".frname").textContent = d.ap ? d.ap.name : "";
  fradList(); fradCard();
}
/* 畫面裡的飛機，照起降先後分段：降落（緊急優先、照雷達上排隊的號碼（兩條跑道合在一起照幾分鐘後落地排）、再照幾分後到）、起飛（在跑道上、滑行中、剛起飛）、剛降落、路過（由近到遠） */
function fradList(){
  if (!FRAD) return;
  const {v, rv} = FRAD, V = rv.V, half = [rv.W / 2 / V.s, rv.H / 2 / V.s], seq = rv.seq || new Map(), G = {arr:[], dep:[], land:[], gnd:[], over:[]}, apv = Math.min(rv.W, rv.H) / 2 / V.s < 5;   // 放大到機場裡面：停著的也列出來
  const tm = p => seq.has(p.id) ? seq.get(p.id).m : p.eta != null ? p.eta : 999;   // 幾分鐘後落地：排隊中的照雷達算的距離÷速度，其他照航班資料
  rv.pl.forEach(o => {
    const p = o.p;
    if (o.gone || !p) return;
    const k = p.ph === "arr" ? (p.alt ? "arr" : "land") : p.ph === "dep" ? "dep" : p.ph === "gnd" ? (flyOut(p) && p.spd >= 3 ? "dep" : apv ? "gnd" : "") : "over";   // 機坪上只算正要去起飛的；已經落地的另外放
    if (!k || (FRADF && (k === "land" ? "arr" : k === "gnd" ? (flyOut(p) ? "dep" : "arr") : k) !== FRADF)) return;
    const [x, y] = rv.at(o, performance.now());
    if (Math.abs(x - V.cx) > half[0] || Math.abs(y - V.cy) > half[1]) return;
    const d = p.d != null ? p.d : Math.hypot(x, y);
    const key = k === "arr" ? [p.emg ? 0 : 1, seq.has(p.id) ? seq.get(p.id).n : 99, tm(p), d] : k === "land" ? [d]
      : k === "gnd" ? [p.gate ? 0 : 1, String(p.gate || ""), d] : k === "dep" ? [p.emg ? 0 : 1, p.ph === "gnd" ? (/跑道/.test(p.st || "") ? 0 : 1) : 2, p.ph === "gnd" ? -(p.spd || 0) : d]
      : [p.emg ? 0 : 1, d];
    G[k].push([key, p, d]);
  });
  const cmp = (a, b) => { for (let i = 0; i < a[0].length; i++) if (a[0][i] !== b[0][i]) return typeof a[0][i] === "string" ? a[0][i].localeCompare(b[0][i], "en", {numeric:true}) : a[0][i] - b[0][i]; return 0; };
  Object.values(G).forEach(g => g.sort(cmp));
  const pl = p => p.ph === "arr" ? (p.org ? "從 " + p.org.name : "") : p.ph === "dep" || flyOut(p) ? (p.dst ? "往 " + p.dst.name : "") : [p.org && p.org.name, p.dst && p.dst.name].filter(Boolean).join(" → ");
  const vr = p => p.vr > 1 ? " ↑" : p.vr < -1 ? " ↓" : "";
  const rt = p => p.emg ? "緊急" : p.hold ? "盤旋中" : p.ph === "arr" && !p.alt ? (p.st || "已降落") : p.ph === "arr" && tm(p) < 999 ? (tm(p) < 1 ? "快到了" : `${tm(p) >= 15 ? "約 " : ""}${flyRm(tm(p))} 分後`) : p.ph === "gnd" ? (p.spd >= 3 ? (p.st || "滑行中") : p.gate ? p.gate + " 登機門" : "停在機坪") : p.ph === "dep" ? (p.st || "") : "";   // 右邊：抵達幾分後降落、出發的狀態
  const sub = p => p.ph === "gnd" || p.alt === 0 ? [p.model || p.t || p.use, "地面"] : [p.model || p.t || p.use, p.alt != null ? p.alt.toLocaleString() + " 公尺" + vr(p) : "", p.spd != null ? p.spd + " 公里/時" : ""];
  const row = (p, d) => { const n = seq.has(p.id) && seq.get(p.id).n; return `<button class="li frr${p.id === FRAD.sel ? " on" : ""}" data-rid="${esc(p.id)}" data-key="${esc(p.id)}">
    <span class="frlg">${flyLogo(flyAl(p.fn)) || `<i class="alg"></i>`}${n && p.ph === "arr" ? `<i class="frd frn">${n}</i>` : `<i class="frd ${p.emg ? "emg" : p.ph === "gnd" ? "gnd" : p.ph}"></i>`}</span>
    <span class="lab"><span class="l1"><b>${esc(p.fn || p.reg || "—")}</b> ${esc(pl(p) || p.al || "")}</span>
      <small>${sub(p).filter(Boolean).map(esc).join("・")}</small></span>
    <span class="frt${p.emg ? " bad" : ""}">${esc(rt(p))}<small>${p.ph === "gnd" ? "" : Math.round(d * 10) / 10 + " 公里"}</small></span></button>`; };
  let left = 60;
  const html = [["arr", "降落"], ["dep", "起飛"], ["land", "剛降落"], ["gnd", "機坪"], ["over", "路過"]].map(([k, l]) => {
    const g = G[k].slice(0, left); left -= g.length;
    return g.length ? `<div class="frg" data-key="g-${k}">${l}<span class="num">${G[k].length}</span></div>` + g.map(([, p, d]) => row(p, d)).join("") : "";
  }).join("");
  const li = v.querySelector(".frli");
  if (li._h !== html) { li._h = html; li.innerHTML = html || `<div class="calm">畫面裡沒有飛機</div>`; }
  const all = Object.values(G).reduce((t, g) => t + g.length, 0), q1 = rv.q && rv.q[0] && rv.q[0][1].p, a0 = q1 && G.arr.some(g => g[1].id === q1.id) ? q1 : G.arr.map(g => g[1]).filter(p => tm(p) < 999).sort((a, b) => tm(a) - tm(b))[0];   // 下一班：雷達上排第 1 號的（跟小雷達、號碼一樣）；沒有在排的才挑最快的
  const hh = `畫面裡 ${all} 架<small>${a0 && tm(a0) < 999 ? `下一班 ${esc(a0.fn || a0.reg || "")} ${tm(a0) < 1 ? "快到了" : (tm(a0) >= 15 ? "約 " : "") + flyRm(tm(a0)) + " 分後"}` : [["arr", "降落"], ["dep", "起飛"], ["land", "剛降落"], ["gnd", "機坪"], ["over", "路過"]].map(([k, l]) => G[k].length ? `${l} ${G[k].length}` : "").filter(Boolean).join("・")}</small>`;
  const h = v.querySelector(".frlh span");
  if (h._h !== hh) { h._h = hh; h.innerHTML = hh; }
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
    <div class="frkv">${kv("高度", p.ph === "gnd" || p.alt === 0 ? "地面" : p.alt != null ? p.alt.toLocaleString() + " 公尺" : "—")}${kv("速度", p.spd != null ? p.spd + " 公里/時" : "—")}${kv(p.ph === "arr" && p.eta != null ? "降落" : "離機場", p.ph === "arr" && p.eta != null ? (p.eta < 1 ? "快到了" : (p.eta >= 15 ? "約 " : "") + p.eta + " 分鐘後") : (p.d != null ? p.d + " 公里" : "—"))}${kv("機型", esc(p.model || p.t || "—"))}</div>`;
  if (!c._b) { c.innerHTML = `<a class="fph wide" target="_blank" rel="noopener noreferrer" hidden></a><div></div>`; c._b = c.lastChild; }
  if (c._h !== html) { c._h = html; c._b.innerHTML = html; }
  flyPhoto(c.firstChild, p);
  if (c._id !== p.id) { c._id = p.id; if (!c.hidden && canAnim()) c.animate([{opacity:.4, transform:"translateY(6px)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:EASE}); }
  reveal(c, true);
}
/* 飛機登記在哪家（adsbdb）：跟呼號的航空公司不一樣時講出來（例如金鵬的班號、飛機是順豐的） */
const FLYOWN = new Map();
function flyOwner(box, p){
  const al = /^([A-Z]{3})\d/.exec(p.cs || "");
  const reg = p.reg || "", hx = /^[0-9a-f]{6}$/.test(p.id || "") ? p.id : "", k = reg || hx;
  if (!box || !al || !k) return;
  if (!FLYOWN.has(k)) FLYOWN.set(k, api("/api/flights?owner=" + encodeURIComponent(reg) + "&hex=" + hx, {headers:flyHdr()}).then(r => r.json()).catch(() => { FLYOWN.delete(k); return null; }));
  FLYOWN.get(k).then(d => {
    if (!d || !d.op || !d.opn || d.op === al[1] || !box.isConnected) return;
    box.innerHTML = `${I("info")}這架飛機登記是${esc(d.opn)}的`;
    reveal(box, true);
  });
}
/* 飛機照片（Planespotters）：查得到就放在卡片最上面，寫攝影者、點了看原圖 */
const FLYPH = new Map();
/* 登機門導引（桃園）：航廈平面圖上標出登機門；按「我在哪」才用手機定位，畫一個「大概在這附近」的圈（室內誤差幾十公尺，不假裝準） */
const FLYGATE = {TPE: 1, TSA: 1, RMQ: 1, KHH: 1};           // 有登機門位置的機場（OpenStreetMap；官網表沒寫登機門的就不放）
const flyGateN = g => String(g || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^([A-Z]*)0+(?=\d)/, "$1");   // A05 → A5
async function flyGeoGet(code){
  if (!FLYGEO[code]) { const r = await api("/api/flights?geo=" + encodeURIComponent(code), {headers:flyHdr()}); const d = await r.json(); if (!d.ok) throw new Error(d.error || ""); FLYGEO[code] = d; }
  return FLYGEO[code];
}
async function flyGate(v, box, p, code){
  let g; try { g = await flyGeoGet(code); } catch(e) { g = {}; }
  if (!v.isConnected) return;
  const sm = [p.term, p.gate0 ? `原本 ${p.gate0}` : ""].filter(Boolean).join("・");
  const gn = flyGateN(p.gate), gs = g.gates || {}, key = Object.keys(gs).find(k => flyGateN(k) === gn), at = key && gs[key];
  const gq = encodeURIComponent(at ? `${at[2]},${at[3]}` : `${FLYS.name || code} ${p.term || ""} 登機門 ${gn}`);
  const gm = `<a class="ubtn ghost sm" href="https://www.google.com/maps/search/?api=1&query=${gq}" target="_blank" rel="noopener noreferrer">Google 地圖${EXT}</a>`;
  if (!at) return swapHTML(box, `<div class="fgh"><span class="lab">登機門 ${esc(gn)}<small>${esc(sm)}</small></span>${gm}</div>`);
  const m = (x, y) => [Math.round((x - at[0]) * 1000), Math.round((at[1] - y) * 1000)];   // 公尺，以登機門為中心、往下為正
  const poly = a => { const q = []; for (let i = 0; i + 1 < a.length; i += 2) q.push(m(a[i], a[i + 1]).join(",")); return q.join(" "); };
  const apm = g.apm || {}, near = a => { for (let i = 0; i + 1 < a.length; i += 2) { const [x, y] = m(a[i], a[i + 1]); if (Math.abs(x) < 2500 && Math.abs(y) < 2500) return true; } return false; };
  const ap = (apm.ap || []).filter(near).map(a => `<polygon class="fgap" points="${poly(a)}"/>`).join("");
  const tm = (apm.tm || []).filter(near).map(a => `<polygon class="fgtm" points="${poly(a)}"/>`).join("");
  const jb = (apm.jb || []).filter(near).map(a => `<polyline class="fgjb" points="${poly(a)}"/>`).join("");
  const dots = Object.entries(gs).filter(([k]) => flyGateN(k) !== gn).map(([k, q]) => { const [x, y] = m(q[0], q[1]);
    return Math.abs(x) < 2500 && Math.abs(y) < 2500 ? `<g class="fgo" transform="translate(${x} ${y})"><g class="fgk"><circle r="6"/><text y="-12">${esc(k)}</text></g></g>` : ""; }).join("");
  box.dataset.lat = at[2]; box.dataset.lon = at[3];
  swapHTML(box, `<div class="fgh"><span class="lab">登機門 ${esc(gn)}<small>${esc(sm)}</small></span>
      <button class="ubtn ghost sm" data-fme>${I("loc")}<span>我在哪</span></button>${gm}</div>
    <div class="fgm"><svg viewBox="-300 -200 600 400" preserveAspectRatio="xMidYMid slice"><g class="fgv">${ap}${tm}${jb}${dots}
      <g class="fme" hidden><circle class="acc" r="1"/><circle class="dot" r="1"/></g>
      <g class="fgt"><g class="fgk"><circle class="ring" r="16"/><circle r="9"/><text y="-22">${esc(gn)}</text></g></g></g></svg></div>`);
  box.querySelector("[data-fme]").addEventListener("click", () => v._gw != null ? flyMeOff(v, true) : flyMeOn(v, box, g, at));
}
function flyMeOn(v, box, g, at){
  const b = box.querySelector("[data-fme]");
  const say = t => { const st = box.querySelector(".fgs:not([data-bye])"); if (st) return txt(st, t);
    box.insertAdjacentHTML("beforeend", `<div class="fgs sub">${esc(t)}</div>`); if (canAnim()) enterBlock(box.lastElementChild, 0); };
  if (!navigator.geolocation || !isSecureContext) return say("這個瀏覽器拿不到位置");
  txt(b.querySelector("span"), "定位中…");
  v._gw = navigator.geolocation.watchPosition(pos => {
    if (!v.isConnected) return flyMeOff(v);
    const c = pos.coords, o = g.o || [0, 0, 1, 1];
    const x = ((c.longitude - o[1]) * o[2] - at[0]) * 1000, y = (at[1] - (c.latitude - o[0]) * o[3]) * 1000, d = Math.hypot(x, y);
    txt(b.querySelector("span"), "關掉定位");
    const me = box.querySelector(".fme");
    if (d > 3000) { me.classList.remove("on"); flyGateFit(box, 0, 0, 0); return say("你不在機場附近"); }
    const r = Math.max(30, Math.min(c.accuracy || 50, 400));
    me.removeAttribute("hidden"); me.style.transform = `translate(${x}px, ${y}px)`;
    me.querySelector(".acc").style.transform = `scale(${r})`;
    requestAnimationFrame(() => me.classList.add("on"));
    flyGateFit(box, x, y, r);
    say(d < Math.max(r, 100) ? "登機門就在附近" : `你大概在藍圈裡，離登機門約 ${Math.max(50, Math.round(d / 50) * 50).toLocaleString()} 公尺`);
  }, e => { flyMeOff(v); say(e.code === 1 ? "沒有位置權限" : "定位不到"); }, {enableHighAccuracy:true, maximumAge:5000, timeout:20000});
}
function flyMeOff(v, ui){
  if (v._gw != null) navigator.geolocation.clearWatch(v._gw);
  v._gw = null;
  const box = v.querySelector(".fgate"), b = box && box.querySelector("[data-fme] span"); if (!b) return;
  txt(b, "我在哪");
  if (!ui) return;
  const me = box.querySelector(".fme"), st = box.querySelector(".fgs:not([data-bye])");
  if (me) me.classList.remove("on");
  flyGateFit(box, 0, 0, 0);
  if (st) { st.dataset.bye = 1; canAnim() ? leaveBlock(st) : st.remove(); }
}
/* 畫面要同時看得到登機門和我：拉遠（最多 3 公里），點和字照原本大小，太遠時其他登機門的編號先藏起來 */
function flyGateFit(box, x, y, r){
  const v = box.querySelector(".fgv"); if (!v) return;
  const x0 = Math.min(-60, x - r), x1 = Math.max(60, x + r), y0 = Math.min(-60, y - r), y1 = Math.max(60, y + r);
  const sc = Math.min(1, 560 / (x1 - x0), 360 / (y1 - y0)), cx = sc < 1 ? (x0 + x1) / 2 : 0, cy = sc < 1 ? (y0 + y1) / 2 : 0;
  v.style.transform = `scale(${sc.toFixed(4)}) translate(${(-cx).toFixed(1)}px, ${(-cy).toFixed(1)}px)`;
  v.style.setProperty("--fz", (1 / sc).toFixed(3));
  v.classList.toggle("far", sc < .6);
}
function flyPhoto(box, p){
  const reg = p.reg || "", hx = /^[0-9a-f]{6}$/.test(p.id || "") ? p.id : "", k = reg || hx;
  if (!box || box._k === k) return;
  box._k = k;
  if (!k) return reveal(box, false);
  box.classList.add("old");                                  // 換了一架：舊照片先變淡，新的到了再換
  if (!FLYPH.has(k)) FLYPH.set(k, api("/api/flights?photo=" + encodeURIComponent(reg) + "&hex=" + hx, {headers:flyHdr()}).then(r => r.json())
    .then(d => d && d.ok && d.src ? new Promise(ok => { const im = new Image(); im.onload = () => ok(d); im.onerror = () => ok(null); im.src = d.big || d.src; }) : null, () => { FLYPH.delete(k); return null; }));
  FLYPH.get(k).then(d => {
    if (box._k !== k) return;
    box.classList.remove("old");
    if (!d) return reveal(box, false);
    box.href = d.link;
    box.innerHTML = `<img alt="" src="${esc(d.big || d.src)}">${d.by ? `<small>攝影：${esc(d.by)}</small>` : ""}`;
    if (!box.hidden && canAnim()) box.firstChild.animate([{opacity:0}, {opacity:1}], {duration:T.mid, easing:EASE});
    reveal(box, true);
  });
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
/* 點雷達上的機場：放大到整個機場（跑道、滑行道、登機門），地上的飛機寫名字和停在哪個登機門 */
function fradAp(rv, [sx, sy]){
  const [ox, oy] = rv.xy(0, 0); if (Math.hypot(sx - ox, sy - oy) > 28 || !rv.rws || !rv.rws.length) return false;
  const pts = rv.rws.flatMap(r => [[r.x1, r.y1], [r.x2, r.y2]]), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, r = Math.max(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy))) + .4;
  if (rv.V.s >= rv.fit(r) * .9) return false;             // 已經在機場裡了
  fradPick(""); rv.view(cx, cy, rv.fit(r), true); setTimeout(fradList, T.mid + T.fast);
  return true;
}
function fradGest(rv, cv){
  const P = new Map(); let g = null, tap = null, last = 0, lt = 0;
  const loc = e => { const r = cv.getBoundingClientRect(), z = ZM(); return [(e.clientX - r.left) / z, (e.clientY - r.top) / z]; };
  const lim = (cx, cy, s) => { s = Math.max(rv.fit(140), Math.min(rv.fit(.6), s)); return [Math.max(-140, Math.min(140, cx)), Math.max(-140, Math.min(140, cy)), s]; };
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
    rv.busy = 0; g = null; rv.kick(); done();
    if (!tap || performance.now() - tap.t > 400) return;
    const t = performance.now();
    if (t - last < 320) { last = 0; return rv.view(0, 0, rv.fit(flyR() * .95), true); }
    last = t;
    const p = rv.hit(...tap.p);
    if (!p && fradAp(rv, tap.p)) return;                     // 點機場：放大到整個機場
    fradPick(p ? p.id : "");
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => {
    e.preventDefault();
    /* 滾輪：跟按鈕一樣滑過去（每一格都畫），連續轉時從上一次的目標接著放大，滑鼠指著的地方停在原位 */
    const m = loc(e), w = rv.km(...m), dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    const s = lim(0, 0, rv.goal().s * Math.exp(-Math.max(-300, Math.min(300, dy)) * .0015))[2];
    rv.view(...lim(w[0] - (m[0] - rv.W / 2) / s, w[1] + (m[1] - rv.H / 2) / s, s), true, T.fast); done();
  }, {passive:false});
}
document.addEventListener("click", e => {
  if (!FRAD || !e.target.closest || !e.target.closest("#frad")) return;
  const t = e.target, rv = FRAD.rv;
  if (t.closest("[data-rback]")) return fradClose();
  if (t.closest("[data-rx]")) return fradPick("");
  if (t.closest("[data-rtrk]")) return flyLayMenu(t.closest("[data-rtrk]"));
  const z = t.closest("[data-rz]");
  if (z) { rv.view(rv.V.cx, rv.V.cy, Math.max(rv.fit(140), Math.min(rv.fit(.6), rv.V.s * (+z.dataset.rz > 0 ? 2 : .5))), true); return setTimeout(fradList, T.mid); }
  const rf = t.closest("[data-rf]");
  if (rf) { if (FRADF !== rf.dataset.rf) { FRADF = rf.dataset.rf; const s = rf.parentNode; slideSel(() => s.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === rf))); fradData(); } return; }
  if (t.closest("[data-rlist]")) return FRAD.v.classList.toggle("lopen");
  const row = t.closest("[data-rid]");
  if (row) { if (!DESK.matches) FRAD.v.classList.remove("lopen"); return fradPick(row.dataset.rid, true); }
});

/* ═════════ 機場起降分享：自己選能看多久、幾支手機、哪個機場 ═════════ */
let SHAREDEV = "", SHAREEND = 0, SHARET = 0, SHAREAP = "";
const flyHdr = () => SHARE ? {"X-Share":SHARE + ":" + SHAREDEV} : {"X-Token":getTok()};
const SHTIME = [[3600, "1 小時"], [21600, "6 小時"], [86400, "1 天"], [604800, "7 天"]], SHDEV = [[1, "1 支"], [3, "3 支"], [0, "不限"]];
const shLeft = s => { const h = Math.ceil(s / 3600); return h >= 24 ? `還有 ${Math.ceil(s / 86400 - .01)} 天` : s >= 5400 ? `還有 ${h} 小時` : `還有 ${Math.max(1, Math.ceil(s / 60))} 分鐘`; };
const shCall = body => api("/api/fly-share", {method:"POST", headers:{"X-Token":getTok(), "Content-Type":"application/json"}, body:JSON.stringify(body)}).then(r => r.json());
async function flyShare(){
  const o = (() => { try { return {secs:3600, devs:1, one:0, ...JSON.parse(store("vs-shopt") || "{}")}; } catch(e) { return {secs:3600, devs:1, one:0}; } })();
  const apn = FLYPLACE[FLYS.ap] || FLYS.ap, sg = (k, opts) => `<div class="seg" data-o="${k}">${opts.map(([v, l]) => `<button type="button" class="${o[k] === v ? "on" : ""}" data-v="${v}">${l}</button>`).join("")}</div>`;
  const v = document.createElement("div"); v.className = "veil";
  v.innerHTML = `<div class="dialog shd"><span class="ico big fly">${I("share")}</span><h3>分享機場起降</h3>
    <div class="form">
      <label>給誰<input class="field" data-k="name" maxlength="20" placeholder="可不填"></label>
      <label>能看多久${sg("secs", SHTIME)}</label>
      <label>幾支手機能看${sg("devs", SHDEV)}</label>
      <label>機場${sg("one", [[0, "四個都能看"], [1, `只看${esc(apn)}`]])}</label>
      <div class="lbl shl" hidden>已分享</div><div class="pklist"></div>
    </div>
    <div class="btns"><button class="ubtn" data-go>${navigator.share && matchMedia("(pointer:coarse)").matches ? "分享" : "複製連結"}</button></div></div>`;
  $("#layer").appendChild(v);
  const list = v.querySelector(".pklist"), lbl = v.querySelector(".shl"), go = v.querySelector("[data-go]");
  const draw = items => { reveal(lbl, items.length > 0);
    swapHTML(list, items.map(x => `<div class="pkrow"><span>${esc(x.name || "沒寫給誰")}<small>${x.ap ? `只看${FLYPLACE[x.ap] || x.ap}・` : ""}${shLeft(x.left)}・${x.used ? `${x.used}${x.max ? ` / ${x.max}` : ""} 支打開過` : "還沒打開"}</small></span>
      <button type="button" class="iconbtn" data-del="${esc(x.id)}" data-name="${esc(x.name || "")}" title="收回">${I("x")}</button></div>`).join("")); };
  shCall({op:"list"}).then(d => d.ok && v.isConnected && draw(d.list || []), () => {});
  v.querySelectorAll(".seg").forEach(g => g.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
    o[g.dataset.o] = +b.dataset.v; g.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); }));
  let busy = false;
  return new Promise(res => {
    const done = () => { if (v._d) return; v._d = 1; v.classList.add("closing"); setTimeout(() => { v.remove(); res(); }, 360); };
    v._esc = done;
    v.addEventListener("click", async e => {
      if (e.target === v || e.target.closest("[data-r]")) return done();
      if (busy) return;
      const del = e.target.closest("[data-del]");
      if (del) {
        const nm = del.dataset.name;
        if (!await modal({icon:"share", cls:"bad", title:nm ? `收回給「${nm}」的連結？` : "收回這個連結？", text:"打開過的手機也會立刻看不到。", ok:"收回"})) return;
        busy = true;
        const d = await shCall({op:"del", id:del.dataset.del}).catch(() => ({}));
        busy = false;
        if (d.ok) { draw(d.list || []); toast("已收回"); } else toast("收回失敗", "bad");
        return;
      }
      if (!e.target.closest("[data-go]")) return;
      busy = true; go.disabled = true;
      store("vs-shopt", JSON.stringify({secs:o.secs, devs:o.devs, one:o.one}));
      try {
        const d = await shCall({secs:o.secs, devs:o.devs, ap:o.one ? FLYS.ap : "", name:v.querySelector('[data-k="name"]').value.trim()});
        if (!d.ok) throw new Error(d.error || "做不出連結");
        const url = location.origin + "/s/" + d.code.slice(3);
        if (navigator.share && matchMedia("(pointer:coarse)").matches) { try { await navigator.share({title:"機場起降", url}); } catch(err) { /* 取消分享 */ } }
        else { await navigator.clipboard.writeText(url); toast("已複製連結"); }
        shCall({op:"list"}).then(x => x.ok && v.isConnected && draw(x.list || []), () => {});
      } catch(err) { toast(err.message || "複製不了", "bad"); }
      busy = false; go.disabled = false;
    });
  });
}
async function shareBoot(){
  document.title = "機場起降";
  const k = "vs-share:" + SHARE.slice(0, 12);
  try {
    const r = await api("/api/fly-claim", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({code:SHARE, dev:store(k)})}), d = await r.json();
    if (!d.ok) return shareGone(d.error);
    SHAREDEV = d.dev; store(k, d.dev); SHAREEND = Date.now() + d.left * 1000;
    if (d.ap) { SHAREAP = d.ap; FLYS.ap = d.ap; FLYS.name = ""; }      // 只分享一個機場：不能換
  } catch(e) { return shareGone(e.message); }
  endSplash(); flyOpen(); shareLeft();
}
/* 左上角：還剩幾分鐘 */
function shareLeft(){
  clearTimeout(SHARET);
  const m = Math.ceil((SHAREEND - Date.now()) / 60000), el = $("#fly [data-k=left]");
  if (m <= 0) return shareGone("連結已經失效");
  if (el) el.textContent = m > 90 ? shLeft(m * 60).replace("還有", "還能看") : `還能看 ${m} 分鐘`;
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
