#!/usr/bin/env node
/* 跨平台操作測試（開發用，主機上不用裝；要 Node＋Playwright）
   自己在暫存資料夾開三台測試主機：東京（主要）、首爾（名字很長）、大阪（故意連不上），不碰正式主機。
   只用真的操作（點、長按、滑、鍵盤、瀏覽器上一頁／下一頁、重新整理、改視窗大小），結果看畫面和送出去的請求，不改程式裡的變數。

   用法：node tools/ui_e2e.js
   可選：ENGINES=chromium,webkit,firefox  PLATS=ios,android,desktop  THEMES=light,dark  SIZES=phone,desk
        ONLY=N01,S01（只跑這幾項）  SENTINEL_URL=已經在跑的測試哨兵（要配 SENTINEL_TOKEN；會跳過要改資料的 S01）
        PLAYWRIGHT_BROWSERS_PATH：WebKit、Firefox 裝在別的地方時指過去（Chromium 用預設的）
   注意：WebKit 不等於 iPhone Safari、Chromium 手機模擬不等於安卓實機；WebKit、Firefox 的手指滑動是在網頁裡送的模擬觸控事件，報告會寫出來。 */
const fs = require("fs"), os = require("os"), path = require("path"), net = require("net"), { spawn } = require("child_process");
const pw = require("playwright");
const ROOT = path.dirname(__dirname);
const ENGINES = (process.env.ENGINES || "chromium,webkit").split(","), PLATS = (process.env.PLATS || "ios,android,desktop").split(",");
const THEMES = (process.env.THEMES || "light,dark").split(","), SIZES = (process.env.SIZES || "phone,desk").split(",");
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const results = [];
let cur = "";
const ok = (id, name, cond, info = "") => { results.push({ctx: cur, id, name, pass: !!cond, info}); console.log(`  ${cond ? "✓" : "✗"} ${id} ${name}${!cond && info ? "：" + info : ""}`); };
const skip = (id, name, why) => { results.push({ctx: cur, id, name, pass: null, info: why}); console.log(`  – ${id} ${name}（沒跑：${why}）`); };
const want = id => !ONLY || ONLY.has(id);
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ── 測試用主機 ── */
const TOKEN = process.env.SENTINEL_TOKEN || "e2e-token-123";
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
async function fixture(){
  if (process.env.SENTINEL_URL) return {url: process.env.SENTINEL_URL, async stop(){}, own: false};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vs-e2e-")), pa = await freePort(), pb = await freePort(), dead = await freePort();
  const now = Math.floor(Date.now() / 1000);
  const evs = [["bad","磁碟用量超過 90%"],["ok","磁碟用量恢復正常"],["warn","有 3 個安全更新"],["info","SSH 登入：root 從 192.0.2.4"],["ok","哨兵更新到新版"],
    ["warn","記憶體用量偏高"],["ok","記憶體恢復正常"],["info","每日備份完成"],["bad","容器 n8n 停了"],["ok","容器 n8n 恢復"]];
  const ev = (n, off) => n.map(([k, t], i) => [now - off - i * 1700, k, t + (i >= 10 ? " " + i : "")]);
  const procs = [];
  for (const [name, port, peers, events] of [["首爾", pb, "", ev(evs.slice(0, 4), 300)],
      ["東京測試主機", pa, `首爾-名字特別長的一台測試主機=http://127.0.0.1:${pb},大阪=http://127.0.0.1:${dead}`, ev([...evs, ...evs, ...evs, ...evs], 60)]]) {
    const d = path.join(dir, String(port)); fs.mkdirSync(path.join(d, "data"), {recursive: true});
    fs.writeFileSync(path.join(d, "data", "state.json"), JSON.stringify({v: 1, events}));
    fs.writeFileSync(path.join(d, "test.conf"), `BIND=127.0.0.1\nPORT=${port}\nTOKEN=${TOKEN}\nNAME=${name}\nDATA_DIR=${d}/data\nTLS=off\n${peers ? "PEERS=" + peers + "\n" : ""}`);
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("SENTINEL_")));
    procs.push(spawn("python3", [path.join(ROOT, "sentinel.py")], {cwd: d, env: {...env, SENTINEL_CONF: path.join(d, "test.conf"), SENTINEL_REBOOT_CMD: "true"}, stdio: "ignore"}));
  }
  const url = `http://127.0.0.1:${pa}/`;
  for (let i = 0; i < 80; i++) { try { const r = await fetch(url + "api/all", {headers: {"X-Token": TOKEN}}); if (r.ok && (await r.json()).length === 3) break; } catch(e) {} await wait(250); }
  return {url, own: true, async stop(){
    await Promise.all(procs.map(p => new Promise(r => { if (p.exitCode != null) return r(); p.once("exit", r); p.kill(); setTimeout(r, 5000); })));
    try { fs.rmSync(dir, {recursive: true, force: true, maxRetries: 3}); } catch(e) {}
  }};
}

/* ── 打開一頁 ── */
async function open(br, engine, plat, phone, theme, url, extra = {}){
  const opt = {viewport: phone ? {width: 390, height: 844} : {width: 1440, height: 900}, hasTouch: phone, colorScheme: theme, reducedMotion: theme === "dark" ? "reduce" : "no-preference", ...extra};   // 深色那輪順便開「減少動態效果」
  if (phone && engine === "chromium") opt.isMobile = true;
  const ctx = await br.newContext(opt);
  await ctx.addInitScript(([plat, tok, theme]) => { try {
    if (location.protocol === "about:" || sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.setItem("vps-sentinel-token", tok); localStorage.setItem("vps-sentinel-token-exp", String(Date.now() + 9e8));
    localStorage.setItem("vps-prefs", JSON.stringify({plat, theme}));
  } catch(e) {} }, [plat, TOKEN, theme]);
  const p = await ctx.newPage(), errs = [], reqs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/flagcdn|open-meteo|ipinfo|favicon/.test(m.text())) errs.push(m.text()); });
  p.on("request", r => { if (r.method() === "POST") reqs.push({url: r.url(), body: r.postData() || ""}); });
  await p.goto("about:blank"); await p.goto(url);
  await p.waitForSelector(".crow", {timeout: 30000}); await p.waitForTimeout(900);
  return {ctx, p, errs, reqs};
}
/* 畫面上看得到的：最上面那一層的標題（首頁是大字「哨站」）、有幾層、開著的選單和視窗；夠寬時 title 是右邊主機那欄、left 是中間那欄 */
const look = p => p.evaluate(() => {
  const t = sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : ""; };
  const ph = !!document.querySelector(".dash.m");
  const tt = scr => t(scr + " .tbar .tbt b") || t(scr + " .hhd .hbr b");
  return {
    plat: document.documentElement.dataset.plat, phone: ph, url: location.href, hist: history.length,
    title: ph ? tt(".stage>.scr:not(.gone,.under)") : tt(".dcol>.scr:not(.gone)"),
    left: ph ? "" : tt(".pcol>.scr:not(.gone)"), side: !!document.querySelector(".sbar"),
    layers: document.querySelectorAll(".stage>.scr:not(.under)").length,
    tabs: !!document.querySelector(".tabbar"), dialogs: document.querySelectorAll("#layer .veil:not(.closing)").length,
    menus: [...document.querySelectorAll("body>.lmenu")].filter(m => m.style.pointerEvents !== "none").length,
    info: !!document.querySelector(".dcol>.scr:not(.gone)[data-key^='s:i:']"), hv: (document.querySelector("#app [data-hv].on") || {}).dataset?.hv || "",
    seg: (document.querySelector(".scr:not(.gone,.under) .mscroll[data-seg]") || {}).dataset?.seg || "",
  };
});
const settle = p => p.waitForTimeout(750);
/* 版面：最上面那一層的清單不能貼著標題列、兩塊清單之間要留空（看實際畫出來的位置，不看程式） */
const gaps = p => p.evaluate(() => {
  const scr = [...document.querySelectorAll(".stage>.scr:not(.gone,.under), .pcol>.scr:not(.gone)")].pop();
  const sc = scr && scr.querySelector(":scope>.rscroll"), hd = scr && scr.querySelector(":scope>.tbar"); if (!sc || !hd) return {ok: true, why: "沒有清單頁"};
  const kids = [...sc.children].filter(e => e.offsetHeight > 0), bad = [];
  const box = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return {top: r.top + parseFloat(cs.borderTopWidth), bot: r.bottom}; };
  if (kids[0] && kids[0].matches(".group") && box(kids[0]).top - hd.getBoundingClientRect().bottom < 8) bad.push("第一塊貼著標題列");
  kids.forEach((e, i) => { const n = kids[i + 1]; if (e.matches(".group") && n && n.matches(".group") && box(n).top - e.getBoundingClientRect().bottom < 8) bad.push("兩塊清單黏在一起"); });
  return {ok: !bad.length, why: bad.join("、")};
});
async function tap(p, sel, phone){ const el = p.locator(sel).first(); await el.waitFor({state: "visible", timeout: 8000}); if (phone) await el.tap(); else await el.click(); }
/* 真的觸控（Chromium 用 CDP 送，WebKit、Firefox 在網頁裡送模擬事件） */
async function touch(p, engine, pts, hold = 0){
  if (engine === "chromium") {
    const cdp = p._cdp || (p._cdp = await p.context().newCDPSession(p));
    const [x0, y0] = pts[0];
    await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: x0, y: y0}]});
    if (hold) await wait(hold);
    for (const [x, y] of pts.slice(1)) { await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x, y}]}); await wait(25); }
    await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
    return "真的觸控（CDP）";
  }
  await p.evaluate(async ([pts, hold]) => {
    const el = document.elementFromPoint(pts[0][0], pts[0][1]) || document.body;
    const real = (() => { try { new Touch({identifier: 1, target: el, clientX: 0, clientY: 0}); return true; } catch(e) { return false; } })();   // Linux 的 WebKit 不給 new Touch：用一般事件帶上手指位置
    const mk = (x, y) => real ? new Touch({identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y}) : {identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y};
    const fire = (type, x, y) => {
      const t = type === "touchend" ? [] : [mk(x, y)], c = [mk(x, y)];
      if (real) return el.dispatchEvent(new TouchEvent(type, {bubbles: true, cancelable: true, touches: t, changedTouches: c}));
      const e = new Event(type, {bubbles: true, cancelable: true}); Object.defineProperty(e, "touches", {value: t}); Object.defineProperty(e, "changedTouches", {value: c});
      el.dispatchEvent(e);
    };
    fire("touchstart", ...pts[0]);
    if (hold) await new Promise(r => setTimeout(r, hold));
    for (const [x, y] of pts.slice(1)) { fire("touchmove", x, y); await new Promise(r => setTimeout(r, 25)); }
    const l = pts[pts.length - 1]; fire("touchend", l[0], l[1]);
  }, [pts, hold]);
  return "模擬觸控事件";
}
const swipe = (p, engine, dx) => touch(p, engine, [[60, 420], ...Array.from({length: 8}, (_, i) => [60 + dx * (i + 1) / 8, 420])]);
const hostSel = name => `.crow[data-go^="h:"]:has-text("${name}")`;

/* ═════════ 手機寬度 ═════════ */
async function phoneFlow(o, engine, plat, url){
  const {p} = o;
  let s = await look(p);
  ok("N04", "畫面是這個平台、一開始在首頁", s.plat === plat && s.layers === 1 && s.title === "哨站" && s.tabs, JSON.stringify(s));
  const listTitle = s.title;
  if (want("N01")) {
    await tap(p, hostSel("東京"), true); await settle(p); s = await look(p);
    ok("N01", "點主機推進一層、標題是那台", s.title === "東京測試主機" && s.layers === 1, JSON.stringify(s));
    await tap(p, ".scr:not(.gone) .tbar .tav", true); await settle(p); s = await look(p);
    ok("N01", "點頭像到主機資訊", s.title === "主機資訊", s.title);
    await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p); s = await look(p);
    ok("N01", "返回鈕退一層到那台主機", s.title === "東京測試主機", s.title);
    await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p); s = await look(p);
    ok("N01", "再返回回到清單", s.title === listTitle && s.layers === 1, s.title);
  }
  if (want("N02")) {
    await tap(p, hostSel("東京"), true); await settle(p);
    await tap(p, ".scr:not(.gone) .tbar .tav", true); await settle(p);
    await p.goBack(); await settle(p); s = await look(p); ok("N02", "瀏覽器上一頁：退到主機", s.title === "東京測試主機", s.title);
    await p.goBack(); await settle(p); s = await look(p); ok("N02", "再上一頁：回到清單", s.title === listTitle, s.title);
    await p.goForward(); await settle(p); s = await look(p); ok("N02", "下一頁：回到主機", s.title === "東京測試主機", s.title);
    await p.goForward(); await settle(p); s = await look(p); ok("N02", "再下一頁：回到主機資訊", s.title === "主機資訊", s.title);
    await p.reload(); await p.waitForSelector(".tbar"); await settle(p); s = await look(p);
    ok("N02", "重新整理還在主機資訊", s.title === "主機資訊", s.title);
    await p.goBack(); await settle(p); s = await look(p); ok("N02", "重新整理後上一頁照樣退一層", s.title === "東京測試主機", s.title);
    await p.goBack(); await settle(p); s = await look(p); ok("N02", "沒有多出來的幽靈頁", s.title === listTitle && s.url.startsWith(url), JSON.stringify(s));
    await p.goBack(); await p.waitForTimeout(900);
    ok("N02", "清單再上一頁可以正常離開網站", p.url() === "about:blank", p.url());
    await p.goForward(); await p.waitForSelector(".crow", {timeout: 20000}); await settle(p);
  }
  if (want("N03") && plat === "ios") {   // iOS 主機頁沒有 ⋯（跟 Telegram 一樣只有頭像）：從主機資訊開對話框、從紀錄的篩選開選單
    await tap(p, hostSel("東京"), true); await settle(p);
    ok("N03", "iOS 主機頁沒有 ⋯", await p.locator(".scr:not(.gone) .tbar [data-more]").count() === 0);
    await tap(p, ".scr:not(.gone) .tbar .tav", true); await settle(p);
    await tap(p, ".scr:not(.gone) .qa[data-reboot]", true); await p.waitForTimeout(500); s = await look(p);
    ok("N03", "主機資訊點重開機：對話框打開", s.dialogs === 1, JSON.stringify(s));
    await p.goBack(); await p.waitForTimeout(600); s = await look(p);
    ok("N03", "上一頁先關對話框、還在主機資訊", s.dialogs === 0 && s.title === "主機資訊", JSON.stringify(s));
    await p.goBack(); await settle(p); await p.goBack(); await settle(p); s = await look(p);
    ok("N03", "再上一頁兩次回到清單（對話框那筆沒有留著）", s.title === listTitle, s.title);
    await tap(p, '[data-tab="all"]', true); await settle(p);
    ok("N03", "手機的紀錄篩選是系統選擇器（不是網頁選單）", await p.locator(".scr:not(.gone) select[data-logsel]").count() === 1 && await p.locator(".scr:not(.gone) [data-logmenu]").count() === 0);
    await tap(p, '[data-tab="home"]', true); await settle(p); s = await look(p);
    ok("N03", "回到首頁、沒有殘留", s.title === listTitle && s.menus === 0 && s.layers === 1, JSON.stringify(s));
  }
  if (want("N03") && plat !== "ios") {
    await tap(p, hostSel("東京"), true); await settle(p);
    await tap(p, ".scr:not(.gone) .tbar [data-more]", true); await p.waitForTimeout(350);
    ok("N03", "⋯ 選單打開", (await look(p)).menus === 1);
    await tap(p, ".lmenu [data-reboot]", true); await p.waitForTimeout(500); s = await look(p);
    ok("N03", "選單點了換成對話框（選單關、對話框開）", s.menus === 0 && s.dialogs === 1, JSON.stringify(s));
    await p.goBack(); await p.waitForTimeout(600); s = await look(p);
    ok("N03", "上一頁先關對話框、還在那台主機", s.dialogs === 0 && s.title === "東京測試主機", JSON.stringify(s));
    await p.goBack(); await settle(p); s = await look(p);
    ok("N03", "再上一頁才退回清單（選單那筆沒有留著）", s.title === listTitle, s.title);
    // 很快連按：開選單、關、馬上返回
    await tap(p, hostSel("東京"), true); await settle(p);
    await tap(p, ".scr:not(.gone) .tbar [data-more]", true); await p.waitForTimeout(120);
    await tap(p, ".scr:not(.gone) .tbar [data-more]", true); await p.waitForTimeout(60);
    await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p); s = await look(p);
    ok("N03", "選單剛關就按返回：直接回清單、沒有殘留", s.title === listTitle && s.menus === 0 && s.layers === 1, JSON.stringify(s));
  }
  if (want("N07")) {
    const row = p.locator(hostSel("東京")).first();
    await row.tap(); await row.tap({force: true, timeout: 800}).catch(() => {}); await row.tap({force: true, timeout: 800}).catch(() => {});
    await settle(p); s = await look(p);
    ok("N07", "連點三下只推進一層", s.title === "東京測試主機" && s.layers === 1, JSON.stringify(s));
    let how = await swipe(p, engine, 50); await settle(p); s = await look(p);
    ok("N07", `往右滑一點放手：留在原地（${how}）`, s.title === "東京測試主機" && s.layers === 1, JSON.stringify(s));
    how = await swipe(p, engine, 280); await settle(p); s = await look(p);
    ok("N07", `往右滑超過三成：退一層（${how}）`, s.title === listTitle && s.layers === 1, JSON.stringify(s));
    const bx = await p.locator(hostSel("東京")).first().boundingBox();
    how = await touch(p, engine, [[bx.x + 60, bx.y + 24]], 700); await settle(p); s = await look(p);
    ok("N07", `長按 0.7 秒（沒有長按選單）：最多推進一層、沒有殘留（${how}）`, s.layers === 1 && s.menus === 0 && s.dialogs === 0 && ["東京測試主機", listTitle].includes(s.title), JSON.stringify(s));
    if (s.title !== listTitle) { await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p); }
  }
  if (want("N05")) {   // 轉橫再轉回來：還在同一頁
    await tap(p, hostSel("東京"), true); await settle(p);
    await p.setViewportSize({width: 844, height: 390}); await p.waitForTimeout(700); s = await look(p);
    ok("N05", "轉成橫的：還在那台主機", s.title === "東京測試主機" && s.layers === 1, JSON.stringify(s));
    await p.setViewportSize({width: 390, height: 844}); await p.waitForTimeout(700); s = await look(p);
    ok("N05", "轉回直的：還在那台主機", s.title === "東京測試主機" && s.layers === 1, JSON.stringify(s));
    await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p);
  }
  if (want("U01")) {
    await tap(p, hostSel("東京"), true); await settle(p);
    ok("U01", "主機頁沒有重複的紀錄", await p.locator(".scr:not(.gone) .mscroll .tl").count() === 0);
    const sc = p.locator(".scr:not(.gone) .mscroll");
    const ov = await sc.evaluate(e => { e.scrollLeft = 60; return {w: e.scrollWidth - e.clientWidth, x: e.scrollLeft}; });
    ok("U01", "主機頁不能左右捲", ov.w <= 0 && ov.x === 0, JSON.stringify(ov));
    const how = await touch(p, engine, [[300, 500], ...Array.from({length: 6}, (_, i) => [300 - 30 * (i + 1), 502])]); await settle(p);
    const x2 = await sc.evaluate(e => e.scrollLeft); s = await look(p);
    ok("U01", `手指往左滑：畫面不會跟著左右跑（${how}）`, x2 === 0 && s.title === "東京測試主機", `${x2} ${s.title}`);
    await tap(p, ".scr:not(.gone) .tbar .tav", true); await settle(p);
    await tap(p, ".scr:not(.gone) .qa[data-logall]", true); await settle(p); s = await look(p);
    ok("U01", "主機資訊「紀錄」：到紀錄、只看這台", await p.locator(".scr:not(.gone) .fchipbar").isVisible() && await p.locator(".scr:not(.gone) .tl .ev").count() > 6, s.title);
    await tap(p, ".scr:not(.gone) [data-logclear]", true); await settle(p);
    for (let i = 0; i < 3 && (await look(p)).title !== listTitle; i++) { await p.goBack(); await settle(p); }
    ok("U01", "上一頁回到清單", (await look(p)).title === listTitle);
  }
  if (plat !== "desktop" && want("N06")) {
    const h0 = (await look(p)).hist;
    await tap(p, '[data-tab="all"]', true); await settle(p);
    await tap(p, '[data-tab="set"]', true); await settle(p); s = await look(p);
    ok("N06", "換到設定分頁、最多多一筆紀錄", s.title === "設定" && s.hist <= h0 + 1, `${s.title} ${h0}→${s.hist}`);
    await p.goBack(); await settle(p); s = await look(p);
    ok("N06", "別的分頁按返回：回首頁、沒離開網站", s.title === listTitle && p.url().startsWith(url), JSON.stringify(s));
    await p.locator(".lscroll").evaluate(e => e.scrollTo(0, 0));
    await tap(p, '[data-tab="all"]', true); await settle(p);
    await p.locator(".scr:not(.gone) .mscroll").evaluate(e => e.scrollTo(0, 0)); await p.waitForTimeout(200);
    ok("N06", "紀錄是最新的在最下面：捲上去後右下角出現「↓」", await p.locator(".scr:not(.gone).tlup .tldn").count() === 1);
    await tap(p, '[data-tab="all"]', true); await p.waitForTimeout(900);
    const y = await p.locator(".scr:not(.gone) .mscroll").evaluate(e => e.scrollHeight - e.scrollTop - e.clientHeight);
    ok("N06", "再點同一個分頁：回到最新（最下面）", y < 5, String(y));
    await tap(p, '[data-tab="home"]', true); await settle(p);
  }
  if (want("U02") && plat !== "desktop") {
    await tap(p, '[data-tab="all"]', true); await settle(p);
    await p.locator(".scr:not(.gone) select[data-logsel]").selectOption("f:bad"); await settle(p);   // 手機是系統選擇器：系統畫面測不到，直接選
    ok("U02", "紀錄篩選（系統選擇器）選「有狀況」", await p.locator(".scr:not(.gone) .fchipbar").isVisible());
    const sc = p.locator(".scr:not(.gone) .mscroll");
    await sc.evaluate(e => e.scrollTo(0, 300)); await p.waitForTimeout(250);
    const y0 = await sc.evaluate(e => e.scrollTop);
    const ev = p.locator('.scr:not(.gone) .ev.eb.go[data-go="h:@self"]').first();
    await ev.scrollIntoViewIfNeeded(); const y1 = await sc.evaluate(e => e.scrollTop);
    await ev.tap(); await settle(p); s = await look(p);
    ok("U02", "點一則紀錄：到那台主機", s.title === "東京測試主機", JSON.stringify(s));
    await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p); s = await look(p);
    const y2 = await p.locator(".scr:not(.gone) .mscroll").evaluate(e => e.scrollTop);
    ok("U02", "返回：篩選還在、捲到的位置還在", s.title === "紀錄" && await p.locator(".scr:not(.gone) .fchipbar").isVisible() && Math.abs(y2 - y1) < 40, `${s.title} ${y0}/${y1}→${y2}`);
    await tap(p, ".scr:not(.gone) [data-logclear]", true); await settle(p);
    await tap(p, '[data-tab="home"]', true); await settle(p);
  }
  if (want("U03")) {
    const lab = await p.evaluate(() => { const b = document.querySelector('.tabbar [data-tab="list"]'); return b ? b.getAttribute("aria-label") : ""; });
    const rows = await p.evaluate(() => [...document.querySelectorAll('.crow[data-go^="h:"]')].map(r => ({n: r.querySelector("b").textContent, badge: (r.querySelector(".cbg") || {}).textContent || "", off: !!r.querySelector(".cbg.bad svg"),
      bars: [...r.querySelectorAll(".mb .num")].map(x => x.textContent)})));
    const osaka = rows.find(r => r.n === "大阪"), tokyo = rows.find(r => r.n === "東京測試主機");
    ok("U03", "連不上的主機：標成連不上（不是數字）、三條都是「—」", osaka && osaka.off && osaka.bars.join() === "—,—,—", JSON.stringify(rows));
    ok("U03", "在線的主機：處理器、記憶體、磁碟三條是真的數字", tokyo && tokyo.bars.length === 3 && tokyo.bars.every(x => /^\d+%$/.test(x)), JSON.stringify(tokyo));
    ok("U03", "分頁列四個：首頁、主機、紀錄、設定", (await p.locator(".tabbar .tbi .tbn").allTextContents()).join() === "首頁,主機,紀錄,設定");
    ok("U03", "分頁列的數字寫清楚是幾台主機", /台主機/.test(lab || ""), lab);
    const hl = await p.locator(".hlth").first().textContent();
    ok("U03", "連線摘要：只講連線（1 台連不上、2／3 在線），點了到那台", /1 台連不上/.test(hl) && /2／3/.test(hl) && await p.locator(".hlth[data-go]").count() === 1, hl);
    ok("U03", "Telegram 還沒設定是一條提醒，不是一台主機", await p.locator(".lban[data-tg]").count() === 1 && await p.locator(".crow[data-tg]").count() === 0);
    ok("U03", "所有工具（每日備份、加密筆記、機場起降）跟主機分開", await p.locator('.hsec[data-key="hs:s"]').count() === 1 && await p.locator(".svr[data-bk]").count() === 1 && await p.locator(".svr[data-fly]").count() === 1);
    await tap(p, '[data-tab="list"]', true); await settle(p); s = await look(p);
    ok("U03", "主機分頁：全部主機、沒有工具", s.title === "主機" && await p.locator('.scr:not(.gone) .crow[data-go^="h:"]').count() === 3 && await p.locator(".scr:not(.gone) .svr").count() === 0, JSON.stringify(s));
    await tap(p, '[data-tab="home"]', true); await settle(p);
  }
  if (want("P01")) {   // 常用工具：最多 4 個、可以調順序、記在這台裝置；所有工具照樣在下面
    const pins = () => p.locator(".scr:not(.gone) .qgrid .qkn").allTextContents();
    const p0 = await pins();
    ok("P01", "常用工具預設放好（最多 4 個）", p0.length >= 1 && p0.length <= 4, p0.join());
    await tap(p, ".scr:not(.gone) [data-pinedit]", true); await settle(p);
    const first = p0[0];
    await p.locator(`.scr:not(.gone) .pinr:has-text("${first}") .tog`).first().click(); await settle(p);
    await tap(p, ".scr:not(.gone) [data-pinedit]", true); await settle(p);
    const p1 = await pins();
    ok("P01", "取消一個：常用工具少一個、所有工具裡還在", !p1.includes(first) && await p.locator(`.scr:not(.gone) .svr:has-text("${first}")`).count() === 1, p1.join());
    await tap(p, ".scr:not(.gone) [data-pinedit]", true); await settle(p);
    await p.locator(`.scr:not(.gone) .pinr:has-text("${first}") .tog`).first().click(); await settle(p);
    await p.locator(`.scr:not(.gone) .pinr:has-text("${first}") [data-pinup]`).first().click().catch(() => {}); await settle(p);
    await tap(p, ".scr:not(.gone) [data-pinedit]", true); await settle(p);
    const p2 = await pins();
    await p.reload(); await p.waitForSelector(".qgrid"); await settle(p);
    const p3 = await pins();
    ok("P01", "加回來、往前移一格，重新整理後順序還在", p2.includes(first) && p2.indexOf(first) < p2.length - 1 && p3.join() === p2.join(), `${p2.join()} → ${p3.join()}`);
    await p.evaluate(() => localStorage.removeItem("vs-pins")); await p.reload(); await p.waitForSelector(".qgrid"); await settle(p);
  }
  if (want("U04")) {
    await tap(p, '[data-tab="set"]', true);
    await settle(p);
    const cats = await p.locator(".scr:not(.gone) [data-go^='set:']").count();
    ok("U04", "設定首頁是分類", cats >= 3, String(cats));
    for (const [k, sel, nm] of [["int", "[data-tg]", "Telegram"], ["sec", "[data-pin]", "PIN 碼"], ["look", '[data-pref="plat"]', "介面"]]) {
      await tap(p, `.scr:not(.gone) [data-go="set:${k}"]`, true); await settle(p);
      ok("U04", `設定「${k}」裡找得到${nm}`, await p.locator(`.scr:not(.gone) ${sel}`).count() > 0);
      const g = await gaps(p); ok("U04", `設定「${k}」清單沒有貼著標題列、沒有黏在一起`, g.ok, g.why);
      if (k !== "look") { await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p); }
    }
    if (want("N04")) {
      const other = plat === "ios" ? "android" : plat === "android" ? "desktop" : "ios";
      await tap(p, `[data-pref="plat"][data-val="${other}"]`, true); await p.waitForTimeout(1100); s = await look(p);
      ok("N04", `在外觀換成 ${other}：馬上生效、還在外觀`, s.plat === other && s.title === "外觀", JSON.stringify(s));
      await p.reload(); await p.waitForSelector(".tbar"); await settle(p); s = await look(p);
      ok("N04", "重新整理後介面和位置都還在", s.plat === other && s.title === "外觀", JSON.stringify(s));
      await tap(p, `[data-pref="plat"][data-val="${plat}"]`, true); await p.waitForTimeout(1100); s = await look(p);
      ok("N04", "換回原本的介面：還在外觀", s.plat === plat && s.title === "外觀", JSON.stringify(s));
    }
    await p.goBack(); await settle(p); s = await look(p);
    ok("U04", "上一頁從外觀回到設定首頁", s.title === "設定", s.title);
    await tap(p, '[data-tab="home"]', true); await settle(p);
    s = await look(p); ok("U04", "回到首頁", s.title === listTitle, s.title);
  }
  if (want("N06")) {   // 搜尋：首頁主機和工具一起找、返回先收起搜尋；主機分頁各平台自己的寫法
    await tap(p, ".scr:not(.gone) [data-srch]", true); await settle(p);
    const fs = await p.evaluate(() => { const i = document.querySelector("#app [data-search]"); return i ? parseFloat(getComputedStyle(i).fontSize) : 0; });
    ok("N06", "搜尋框字不小於 16（iPhone 不會自己放大）", fs >= 16, String(fs));
    await p.locator("#app [data-search]").first().fill("大"); await settle(p);
    ok("N06", "首頁打字就篩選主機", await p.locator('.crow[data-go^="h:"]').count() === 1 && await p.locator(".svr").count() === 0);
    await p.locator("#app [data-search]").first().fill("備份"); await settle(p);
    ok("N06", "首頁也找得到工具", await p.locator('.crow[data-go^="h:"]').count() === 0 && await p.locator(".svr[data-bk]").count() === 1);
    await p.goBack(); await settle(p); s = await look(p);
    ok("N06", "搜尋時按返回：先收起搜尋、清掉字、沒離開", !(await p.locator(".hsr").count()) && await p.locator('.crow[data-go^="h:"]').count() === 3 && p.url().startsWith(url), JSON.stringify(s));
    await tap(p, '[data-tab="list"]', true); await settle(p);
    if (plat === "android") { await tap(p, ".scr:not(.gone) [data-srch]", true); await settle(p); }
    await p.locator("#app [data-search]").first().fill("大"); await settle(p);
    ok("N06", "主機分頁打字就篩選", await p.locator('.crow[data-go^="h:"]').count() === 1);
    if (plat === "android") {
      await p.goBack(); await settle(p); s = await look(p);
      ok("N06", "Android 搜尋時按返回：先收起搜尋、清掉字、還在主機分頁", !(await p.locator(".lhd.asr").count()) && await p.locator('.crow[data-go^="h:"]').count() === 3 && s.title === "主機", JSON.stringify(s));
    } else if (plat === "ios") {
      await tap(p, "[data-qsx]", true); await settle(p);
      ok("N06", "iOS 按「取消」清掉搜尋", await p.locator('.crow[data-go^="h:"]').count() === 3);
    } else {
      await p.locator("#app [data-search]").first().press("Escape"); await settle(p);
      ok("N06", "電腦介面按 Esc 清掉搜尋", await p.locator('.crow[data-go^="h:"]').count() === 3);
    }
    await tap(p, '[data-tab="home"]', true); await settle(p);
  }
}

/* ═════════ 電腦寬度 ═════════ */
async function deskFlow(o, engine, plat, url){
  const {p} = o;
  let s = await look(p);
  ok("N04", "畫面是這個平台：中間首頁、右邊一台主機", s.plat === plat && s.left === "哨站" && !!s.title, JSON.stringify(s));
  if (plat === "desktop") ok("D01", "電腦介面：左邊側欄四個分頁、沒有下面的分頁列", s.side && !s.tabs && (await p.locator(".sbar .sbl .sbi>span").allTextContents()).join() === "首頁,主機,紀錄,設定", JSON.stringify(s));
  else ok("D01", `${plat} 夠寬：分頁列在中間那欄下面、沒有側欄`, !s.side && await p.locator(".pcol .tabbar").count() === 1, JSON.stringify(s));
  if (want("N01")) {
    await p.locator(hostSel("東京")).first().click(); await settle(p); s = await look(p);
    ok("N01", "點主機：右邊換成那台、選到的那列標起來", s.title === "東京測試主機" && await p.locator(`${hostSel("東京")}.on`).count() === 1, s.title);
    const h0 = s.hist;
    await p.locator(hostSel("大阪")).first().click(); await settle(p); s = await look(p);
    ok("N01", "換一台主機：右邊跟著換、不多記瀏覽紀錄", s.title === "大阪" && s.hist === h0, JSON.stringify(s));
    await p.locator(".dcol .tbar [data-go^='i:']").first().click(); await settle(p); s = await look(p);
    ok("N01", "資訊鈕：右邊推進主機資訊", s.info && s.title === "主機資訊", JSON.stringify(s));
    await p.keyboard.press("Escape"); await settle(p); s = await look(p);
    ok("A01", "Esc 退回那台主機", !s.info && s.title === "大阪", JSON.stringify(s));
    await p.locator(".dcol .tbar [data-go^='i:']").first().click(); await settle(p);
    await p.locator(hostSel("東京")).first().click(); await settle(p); s = await look(p);
    ok("N01", "主機資訊開著時點別台：右邊換成那台主機", !s.info && s.title === "東京測試主機", JSON.stringify(s));
  }
  if (want("U01")) {
    await p.locator(hostSel("東京")).first().click(); await settle(p);
    const ov = await p.locator(".dcol .mscroll").evaluate(e => e.scrollWidth - e.clientWidth);
    ok("U01", "電腦：主機頁不能左右捲", ov <= 0, String(ov));
    await p.locator(".dcol .tbar [data-go^='i:']").first().click(); await settle(p);
    await p.click(".dcol .qa[data-logall]"); await settle(p); s = await look(p);
    ok("U01", "電腦：主機資訊「紀錄」到紀錄、只看這台", s.left === "紀錄" && await p.locator(".pcol .fchipbar").isVisible() && await p.locator(".pcol .tl .ev").count() > 6, JSON.stringify(s));
    await p.locator(".pcol [data-logclear]").click(); await settle(p);
    await p.click('[data-tab="home"]'); await settle(p);
    await p.keyboard.press("Escape"); await settle(p);
  }
  if (want("N02") || want("A01")) {
    await p.locator(hostSel("東京")).first().click(); await settle(p);
    await p.click('[data-tab="set"]'); await settle(p); s = await look(p);
    ok("N02", "中間換成設定、右邊還是那台", s.left === "設定" && s.title === "東京測試主機", JSON.stringify(s));
    await p.click('.pcol [data-go="set:look"]'); await settle(p); s = await look(p);
    ok("N02", "設定裡點分類：中間推進去", s.left === "外觀", s.left);
    await p.goBack(); await settle(p); s = await look(p);
    ok("N02", "上一頁回設定首頁", s.left === "設定", s.left);
    await p.goForward(); await settle(p); s = await look(p);
    ok("N02", "下一頁又到外觀", s.left === "外觀", s.left);
    await p.locator(".dcol .tbar [data-go^='i:']").first().click(); await settle(p); s = await look(p);
    ok("N02", "外觀開著時右邊推進主機資訊：兩欄各自一層", s.info && s.left === "外觀", JSON.stringify(s));
    await p.click(".pcol [data-navback]"); await settle(p); s = await look(p);
    ok("N02", "中間的返回只退中間、右邊主機資訊還在", s.left === "設定" && s.info, JSON.stringify(s));
    await p.click(".dcol [data-navback]"); await settle(p); s = await look(p);
    ok("N02", "右邊的返回只退右邊", s.left === "設定" && !s.info && s.title === "東京測試主機", JSON.stringify(s));
    await p.click('.pcol [data-go="set:look"]'); await settle(p);
    await p.keyboard.press("Escape"); await settle(p); s = await look(p);
    ok("A01", "Esc 退一層（外觀 → 設定）", s.left === "設定", s.left);
    await p.click('[data-tab="home"]'); await settle(p); s = await look(p);
    ok("N02", "回到首頁、右邊還是那台", s.left === "哨站" && s.title === "東京測試主機", JSON.stringify(s));
  }
  if (want("D01") && plat === "desktop") {   // 1280 以下側欄只剩圖示
    await p.setViewportSize({width: 1100, height: 900}); await settle(p);
    const lab = await p.locator(".sbar .sbi[data-tab='home'] span").isVisible();
    const w = await p.locator(".sbar").evaluate(e => e.offsetWidth);
    ok("D01", "1100 寬：側欄只剩圖示（滑鼠指著有名字）", !lab && w < 100 && await p.locator(".sbar .sbi[data-tab='home'][title='首頁']").count() === 1, String(w));
    await p.setViewportSize({width: 1440, height: 900}); await settle(p);
  }
  if (want("N05")) {   // 寬窄互換：選的主機、打開的視窗和打到一半的字都還在
    await p.locator(hostSel("東京")).first().click(); await settle(p);
    await p.locator(".dcol .tbar [data-go^='i:']").first().click(); await settle(p);
    await p.click(".dcol .qa[data-rename]"); await p.waitForTimeout(600);
    const inp = p.locator("#layer .veil input").first();
    await inp.fill("打到一半的名字");
    await p.setViewportSize({width: 1023, height: 900}); await p.waitForTimeout(900);
    s = await look(p);
    ok("N05", "1440→1023：一欄、還在那台的主機資訊、視窗還開著、字還在", s.phone && s.title === "主機資訊" && s.dialogs === 1 && await inp.inputValue() === "打到一半的名字", JSON.stringify(s));
    await p.setViewportSize({width: 1024, height: 900}); await p.waitForTimeout(900); s = await look(p);
    ok("N05", "1023→1024：回到多欄、還是那台、視窗還開著", !s.phone && s.title === "主機資訊" && s.dialogs === 1, JSON.stringify(s));
    await p.keyboard.press("Escape"); await p.waitForTimeout(600);
    ok("N05", "Esc 關掉、名字沒有被改", (await look(p)).dialogs === 0 && await p.locator(hostSel("東京")).count() === 1);
    await p.setViewportSize({width: 1440, height: 900}); await settle(p);
    await p.keyboard.press("Escape"); await settle(p);
  }
  if (want("U02")) {
    await p.click('[data-tab="all"]'); await settle(p);
    const ev = p.locator('.pcol .ev.eb.go[data-go="h:首爾-名字特別長的一台測試主機"]').first();
    if (await ev.count()) { await ev.click(); await settle(p); s = await look(p);
      ok("U02", "電腦：點一則紀錄，右邊換成那台主機、中間還是紀錄", /首爾/.test(s.title) && s.left === "紀錄", JSON.stringify(s)); }
    else skip("U02", "電腦：點紀錄到主機", "畫面上沒有那台的紀錄");
    await p.click('[data-tab="home"]'); await settle(p);
  }
  if (want("A01")) {   // 鍵盤：Tab 在視窗裡轉、Esc 關、焦點回到按鈕
    await p.locator(hostSel("大阪")).first().click(); await settle(p);
    await p.locator(".dcol .tbar [data-go^='i:']").first().click(); await settle(p);
    const rm = p.locator(".dcol [data-rmhost]").first();
    await rm.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(600);
    const f1 = await p.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
    ok("A01", "危險動作的視窗：焦點先放在「取消」", f1 === "取消", f1);
    for (let i = 0; i < 6; i++) await p.keyboard.press("Tab");
    const inside = await p.evaluate(() => !!document.activeElement.closest("#layer .veil"));
    ok("A01", "Tab 不會跑出視窗", inside);
    await p.keyboard.press("Escape"); await p.waitForTimeout(600);
    const back = await p.evaluate(() => document.activeElement && document.activeElement.matches("[data-rmhost]"));
    ok("A01", "Esc 關掉後焦點回到原本的按鈕", back);
    await p.keyboard.press("Escape"); await settle(p);
    await p.locator('[data-tab="list"]').first().focus(); await p.keyboard.press("Tab"); await p.keyboard.press("Shift+Tab");
    const fv = await p.evaluate(() => { const b = document.activeElement, c = getComputedStyle(b); return b.matches("[data-tab]") && (c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0); });
    ok("A01", "鍵盤焦點看得到（分頁鈕有框）", fv);
  }
}

/* ═════════ 自動更新、來回很多次 ═════════ */
async function refreshFlow(o, engine, plat, phone){
  const {p} = o;
  if (phone) { await tap(p, hostSel("東京"), true); await settle(p); }
  else { await p.locator(hostSel("東京")).first().click(); await settle(p); }
  await p.waitForFunction(() => document.querySelectorAll("#app .scr:not(.gone) .cbox svg").length >= 2, null, {timeout: 20000}).catch(() => {});   // 剛開的測試主機還沒有圖表資料：等圖表畫出來才開始量（不然量到的是圖表出現，不是自動更新）
  await p.waitForTimeout(1500);
  const n0 = (await p.evaluate(() => performance.getEntriesByType("resource").filter(e => /\/api\/all/.test(e.name)).length));
  await p.evaluate(() => {
    window._e2e = {scr: document.querySelector("#app .scr[data-key^='s:h:']"), muts: 0, adds: 0};
    new MutationObserver(ms => { for (const m of ms) { window._e2e.muts++; window._e2e.adds += m.addedNodes.length; } }).observe(document.querySelector("#app"), {childList: true, subtree: true});
  });
  if (!phone) {
    if (!(await p.locator("#app [data-search]").count())) { await p.click(".pcol [data-srch]"); await settle(p); }
    await p.locator("#app [data-search]").first().fill("東"); await p.locator("#app [data-search]").first().focus(); await settle(p);
  }
  const nodes0 = await p.evaluate(() => { window._e2e.adds = 0; window._e2e.muts = 0; return document.querySelectorAll("*").length; });
  await p.waitForTimeout(11500);
  const r = await p.evaluate(() => ({same: window._e2e.scr && window._e2e.scr.isConnected, n: document.querySelectorAll("*").length, adds: window._e2e.adds, muts: window._e2e.muts,
    q: (document.querySelector("#app [data-search]") || {}).value, focus: !!(document.activeElement && document.activeElement.matches("[data-search]")),
    api: performance.getEntriesByType("resource").filter(e => /\/api\/all/.test(e.name)).length, layers: document.querySelectorAll(".stage>.scr:not(.under)").length}));
  ok("R01", "自動更新真的有抓新資料（兩次以上）", r.api - n0 >= 2, `${n0}→${r.api}`);
  ok("R01", "自動更新：同一個畫面沿用、沒有重建", r.same, JSON.stringify(r));
  if (!phone) ok("R01", "自動更新：搜尋的字和焦點都還在", r.q === "東" && r.focus, JSON.stringify(r));
  ok("R02", "自動更新兩次：元素數穩定、加進來的元素不多", Math.abs(r.n - nodes0) < nodes0 * .1 && r.adds < 400, `元素 ${nodes0}→${r.n}、新增 ${r.adds}、變動 ${r.muts}`);
  if (phone) ok("R01", "自動更新後還是一層", r.layers === 1, String(r.layers));
  if (!phone) { await p.locator("#app [data-search]").first().fill(""); await p.keyboard.press("Escape"); await settle(p); }
  if (want("R03")) {
    const h0 = await p.evaluate(() => history.length), base = await p.evaluate(() => document.querySelectorAll("*").length);   // 搜尋清掉之後的元素數（電腦寬度搜尋時首頁比較短）
    for (let i = 0; i < 15; i++) {
      if (phone) { await p.goBack(); await p.waitForTimeout(260); await p.locator(hostSel(i % 2 ? "大阪" : "東京")).first().tap(); await p.waitForTimeout(260); }
      else { await p.locator(hostSel(i % 2 ? "大阪" : "東京")).first().click(); await p.waitForTimeout(220); }
    }
    await settle(p);
    const r2 = await p.evaluate(() => ({n: document.querySelectorAll("*").length, layers: document.querySelectorAll(".stage>.scr:not(.under)").length, menus: document.querySelectorAll(".lmenu").length, veils: document.querySelectorAll("#layer .veil").length, hist: history.length}));
    ok("R03", "來回 15 次：只剩一層、沒有殘留選單和視窗", (phone ? r2.layers === 1 : true) && r2.menus === 0 && r2.veils === 0, JSON.stringify(r2));
    ok("R03", "來回 15 次：元素數沒有一直變多", r2.n < base * 1.3, `${base}→${r2.n}`);
    ok("R03", "來回 15 次：瀏覽紀錄沒有一直變長", r2.hist - h0 <= (phone ? 2 : 1), `${h0}→${r2.hist}`);
  }
}

/* ═════════ 要小心的動作、連線出錯（只在 Chromium 跑一次，會改測試主機的資料） ═════════ */
async function safetyFlow(br, url, own){
  if (want("S01")) {
    cur = "chromium・ios・手機・S01";
    console.log("\n" + cur);
    const o = await open(br, "chromium", "ios", true, "light", url), {p, reqs} = o;
    await tap(p, hostSel("大阪"), true); await settle(p);
    await tap(p, ".scr:not(.gone) .tbar .tav", true); await settle(p);
    const rmReq = () => reqs.filter(r => /\/api\/peer\b/.test(r.url) && /"remove"/.test(r.body));
    await tap(p, ".scr:not(.gone) [data-rmhost]", true); await p.waitForTimeout(500);
    const btns = await p.$$eval("#layer .veil:not(.closing) .btns button", b => b.map(x => x.textContent.trim()));
    ok("S01", "移除主機的視窗有「取消」和「移除」", btns.includes("取消") && btns.includes("移除"), btns.join("、"));
    await tap(p, "#layer .veil [data-r='0']", true); await p.waitForTimeout(600);
    ok("S01", "按取消：視窗關掉、沒送出", (await look(p)).dialogs === 0 && rmReq().length === 0, String(rmReq().length));
    await tap(p, ".scr:not(.gone) [data-rmhost]", true); await p.waitForTimeout(500);
    await p.touchscreen.tap(195, 60); await p.waitForTimeout(600);
    ok("S01", "點旁邊：關掉、沒送出", (await look(p)).dialogs === 0 && rmReq().length === 0);
    await tap(p, ".scr:not(.gone) [data-rmhost]", true); await p.waitForTimeout(500);
    await p.goBack(); await p.waitForTimeout(600); let s = await look(p);
    ok("S01", "返回手勢：只關視窗、沒送出、還在主機資訊", s.dialogs === 0 && rmReq().length === 0 && s.title === "主機資訊", JSON.stringify(s));
    await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p); await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p);
    await tap(p, hostSel("東京"), true); await settle(p); await tap(p, ".scr:not(.gone) .tbar .tav", true); await settle(p);
    await tap(p, ".scr:not(.gone) [data-reboot]", true); await p.waitForTimeout(500);
    const rb = await p.$$eval("#layer .veil:not(.closing) .btns button", b => b.map(x => x.textContent.trim()));
    ok("S01", "重新開機的視窗也有「取消」", rb.includes("取消"), rb.join("、"));
    await tap(p, "#layer .veil [data-r='0']", true); await p.waitForTimeout(600);
    ok("S01", "重新開機按取消：沒送出", reqs.filter(r => /\/api\/reboot/.test(r.url)).length === 0);
    if (own) {
      await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p); await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p);
      await tap(p, hostSel("大阪"), true); await settle(p); await tap(p, ".scr:not(.gone) .tbar .tav", true); await settle(p);
      await tap(p, ".scr:not(.gone) [data-rmhost]", true); await p.waitForTimeout(500);
      const ok1 = p.locator("#layer .veil [data-r='1']");
      await ok1.tap(); await ok1.tap({force: true, timeout: 500}).catch(() => {});
      await p.waitForTimeout(2500); s = await look(p);
      const rq = rmReq();
      ok("S01", "按移除（連按兩下）：只送一次、送的是大阪", rq.length === 1 && /大阪/.test(rq[0] ? rq[0].body : ""), JSON.stringify(rq));
      ok("S01", "移除後自己回到首頁、大阪不見了", s.title === "哨站" && await p.locator(hostSel("大阪")).count() === 0, JSON.stringify(s));
    } else skip("S01", "真的移除一台", "用的是外面的哨兵，不改資料");
    ok("S01", "主控台沒有錯誤", !o.errs.length, o.errs.join(" | ").slice(0, 300));
    await o.ctx.close();
  }
  if (want("F03")) {
    cur = "chromium・desktop・電腦・F03";
    console.log("\n" + cur);
    const o = await open(br, "chromium", "desktop", false, "light", url), {p} = o;
    await p.locator(hostSel("東京")).first().click(); await settle(p);
    await p.route("**/api/all*", r => r.fulfill({status: 502, body: "bad gateway"}));
    await p.waitForTimeout(21000);
    let st = await p.evaluate(() => ({lost: document.documentElement.classList.contains("lost"), t: (document.querySelector(".dcol .tbar .tbt b") || {}).textContent}));
    ok("F03", "主機 502 超過 15 秒：標出連線中斷、畫面還在原本那台", st.lost && st.t === "東京測試主機", JSON.stringify(st));
    await p.unroute("**/api/all*"); await p.waitForTimeout(6500);
    st = await p.evaluate(() => ({lost: document.documentElement.classList.contains("lost"), t: (document.querySelector(".dcol .tbar .tbt b") || {}).textContent}));
    ok("F03", "恢復後自己接回來、還在原本那台", !st.lost && st.t === "東京測試主機", JSON.stringify(st));
    await p.route("**/api/all*", r => r.abort("connectionrefused")); await p.waitForTimeout(4000);
    ok("F03", "斷線時沒有跳錯誤、畫面還在", await p.locator(".dcol .tbar").count() === 1);
    await p.unroute("**/api/all*");
    await p.route("**/api/all*", r => r.fulfill({status: 401, body: "{}"})); await p.waitForTimeout(7000);
    ok("F03", "登入過期（401）：換成登入畫面", await p.locator("#tok").count() === 1);
    await p.unroute("**/api/all*");
    ok("F03", "主控台沒有預期外的錯誤", !o.errs.filter(e => !/502|401|Failed to load resource|ERR_CONNECTION_REFUSED/.test(e)).length, o.errs.join(" | ").slice(0, 300));
    await o.ctx.close();
  }
}

(async () => {
  const fx = await fixture();
  const t0 = Date.now();
  try {
    for (const engine of ENGINES) {
      let br;
      try { br = await pw[engine].launch(); } catch(e) { cur = engine; skip("ALL", `${engine} 全部`, "瀏覽器打不開：" + e.message.split("\n")[0]); continue; }
      for (const plat of PLATS) for (const size of SIZES) for (const theme of THEMES) {
        const phone = size === "phone";
        cur = `${engine}・${plat}・${phone ? "手機 390" : "電腦 1440"}・${theme === "dark" ? "深色" : "淺色"}`;
        console.log("\n" + cur);
        const o = await open(br, engine, plat, phone, theme, fx.url);
        try {
          if (phone) await phoneFlow(o, engine, plat, fx.url); else await deskFlow(o, engine, plat, fx.url);
          if (theme === THEMES[0] && (want("R01") || want("R02") || want("R03"))) await refreshFlow(o, engine, plat, phone);
        } catch (e) { ok("RUN", "流程跑完", false, e.message.split("\n")[0]); }
        ok("RUN", "主控台沒有錯誤", !o.errs.length, o.errs.join(" | ").slice(0, 300));
        await o.ctx.close();
      }
      await br.close();
    }
    if (want("S01") || want("F03")) {   // 會移除一台測試主機：放在所有引擎都跑完之後
      const br = await pw.chromium.launch();
      try { await safetyFlow(br, fx.url, fx.own); } catch (e) { ok("RUN", "流程跑完", false, e.message.split("\n")[0]); }
      await br.close();
    }
  } finally { await fx.stop(); }
  const pass = results.filter(r => r.pass === true).length, fail = results.filter(r => r.pass === false), nr = results.filter(r => r.pass === null).length;
  console.log(`\n通過 ${pass}、失敗 ${fail.length}、沒跑 ${nr}（${Math.round((Date.now() - t0) / 1000)} 秒）`);
  for (const f of fail) console.log(`  ✗ [${f.ctx}] ${f.id} ${f.name}：${f.info}`);
  if (process.env.E2E_JSON) fs.writeFileSync(process.env.E2E_JSON, JSON.stringify(results, null, 1));
  process.exit(fail.length ? 1 : 0);
})();
