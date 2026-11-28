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
/* 畫面上看得到的：最上面那一層的標題、有幾層、開著的選單和視窗 */
const look = p => p.evaluate(() => {
  const vis = el => !!el && !!(el.offsetWidth || el.offsetHeight);
  const t = sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : ""; };
  const ph = !!document.querySelector(".dash.m");
  const lay = document.querySelector(".slayer:not([style*='pointer-events: none'])");
  return {
    plat: document.documentElement.dataset.plat, phone: ph, url: location.href, hist: history.length,
    title: ph ? (t(".stage>.scr:not(.gone,.under) .tbar .tbt b") || (document.querySelector(".stage>.scr:not(.gone,.under) .lhd") ? "主機" : "")) : lay ? t(".slayer .tbar .tbt b") : t(".mcol .scr .tbar .tbt b"),
    left: ph ? "" : t(".lcol .scr .tbar .tbt b"), layer: !!lay,
    layers: document.querySelectorAll(".stage>.scr:not(.under)").length,
    tabs: !!document.querySelector(".tabbar"), dialogs: document.querySelectorAll("#layer .veil:not(.closing)").length,
    menus: [...document.querySelectorAll("body>.lmenu,body>.mdrw")].filter(m => m.style.pointerEvents !== "none").length,
    info: !!document.querySelector(".rcol.on"), hv: (document.querySelector("#app [data-hv].on") || {}).dataset?.hv || "",
    seg: (document.querySelector(".scr:not(.gone,.under) .mscroll[data-seg]") || {}).dataset?.seg || "",
  };
});
const settle = p => p.waitForTimeout(750);
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
  ok("N04", "畫面是這個平台、一開始在清單", s.plat === plat && s.layers === 1 && (s.title === "主機" || s.title === "哨站"), JSON.stringify(s));
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
  if (want("N03")) {
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
    ok("U01", "主機頁直接看得到「監控／紀錄」分頁", await p.locator(".scr:not(.gone) [data-hv='ev']").isVisible());
    await tap(p, ".scr:not(.gone) [data-hv='ev']", true); await settle(p);
    const n = await p.locator(".scr:not(.gone) .hev .ev").count(); s = await look(p);
    ok("U01", "點一下就是這台全部的紀錄（不只 6 筆）", s.seg === "ev" && n > 6, `${s.seg} ${n}`);
    await p.locator(".scr:not(.gone) .mscroll").evaluate(e => e.scrollTo(0, 400)); await p.waitForTimeout(200);
    await tap(p, ".scr:not(.gone) [data-hv='mon']", true); await settle(p);
    await tap(p, ".scr:not(.gone) [data-hv='ev']", true); await settle(p);
    const y = await p.locator(".scr:not(.gone) .mscroll").evaluate(e => e.scrollTop);
    ok("U01", "換回紀錄：捲到的位置還在", Math.abs(y - 400) < 40, String(y));
    await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p);
    await tap(p, hostSel("東京"), true); await settle(p); s = await look(p);
    ok("U01", "再點進來還是上次看的那一頁", s.seg === "ev", s.seg);
    await tap(p, ".scr:not(.gone) [data-hv='mon']", true); await settle(p);
    await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p);
  }
  if (plat !== "desktop" && want("N06")) {
    const h0 = (await look(p)).hist;
    await tap(p, '[data-tab="all"]', true); await settle(p);
    await tap(p, '[data-tab="set"]', true); await settle(p); s = await look(p);
    ok("N06", "換到設定分頁、最多多一筆紀錄", s.title === "設定" && s.hist <= h0 + 1, `${s.title} ${h0}→${s.hist}`);
    await p.goBack(); await settle(p); s = await look(p);
    ok("N06", "別的分頁按返回：回主機分頁、沒離開網站", s.title === listTitle && p.url().startsWith(url), JSON.stringify(s));
    await p.locator(".lscroll").evaluate(e => e.scrollTo(0, 0));
    await tap(p, '[data-tab="all"]', true); await settle(p);
    await p.locator(".scr:not(.gone) .mscroll").evaluate(e => e.scrollTo(0, 500)); await p.waitForTimeout(200);
    await tap(p, '[data-tab="all"]', true); await p.waitForTimeout(900);
    const y = await p.locator(".scr:not(.gone) .mscroll").evaluate(e => e.scrollTop);
    ok("N06", "再點同一個分頁：捲回最上面", y < 5, String(y));
    await tap(p, '[data-tab="list"]', true); await settle(p);
  }
  if (want("U02") && plat !== "desktop") {
    await tap(p, '[data-tab="all"]', true); await settle(p);
    await tap(p, ".scr:not(.gone) [data-logmenu]", true); await p.waitForTimeout(350);
    await tap(p, '.lmenu [data-logf="bad"]', true); await settle(p);
    ok("U02", "紀錄篩選「有狀況」", await p.locator(".scr:not(.gone) .fchipbar").isVisible());
    const sc = p.locator(".scr:not(.gone) .mscroll");
    await sc.evaluate(e => e.scrollTo(0, 300)); await p.waitForTimeout(250);
    const y0 = await sc.evaluate(e => e.scrollTop);
    const ev = p.locator('.scr:not(.gone) .ev.eb.go[data-go="h:@self"]').first();
    await ev.scrollIntoViewIfNeeded(); const y1 = await sc.evaluate(e => e.scrollTop);
    await ev.tap(); await settle(p); s = await look(p);
    ok("U02", "點一則紀錄：到那台主機的「紀錄」", s.title === "東京測試主機" && s.seg === "ev", JSON.stringify(s));
    await tap(p, ".scr:not(.gone) [data-navback]", true); await settle(p); s = await look(p);
    const y2 = await p.locator(".scr:not(.gone) .mscroll").evaluate(e => e.scrollTop);
    ok("U02", "返回：篩選還在、捲到的位置還在", s.title === "紀錄" && await p.locator(".scr:not(.gone) .fchipbar").isVisible() && Math.abs(y2 - y1) < 40, `${s.title} ${y0}/${y1}→${y2}`);
    await tap(p, ".scr:not(.gone) [data-logclear]", true); await settle(p);
    await tap(p, '[data-tab="list"]', true); await settle(p);
  }
  if (want("U03")) {
    const lab = await p.evaluate(() => { const b = document.querySelector('.tabbar [data-tab="list"]'); return b ? b.getAttribute("aria-label") : ""; });
    const rows = await p.evaluate(() => [...document.querySelectorAll('.crow[data-go^="h:"]')].map(r => ({n: r.querySelector("b").textContent, badge: (r.querySelector(".cbg") || {}).textContent || "", off: !!r.querySelector(".cbg.bad svg")})));
    const osaka = rows.find(r => r.n === "大阪");
    ok("U03", "連不上的主機：標成連不上（不是數字）", osaka && osaka.off, JSON.stringify(rows));
    if (plat !== "desktop") ok("U03", "分頁列的數字寫清楚是幾台主機", /台主機/.test(lab || ""), lab);
    ok("U03", "Telegram 還沒設定是一條提醒，不是一台主機", await p.locator(".lban[data-tg]").count() === 1 && await p.locator(".crow[data-tg]").count() === 0);
    ok("U03", "工具（機場起降）跟主機分開", await p.locator('.lsec[data-key="sec:tools"]').count() === 1);
  }
  if (want("U04")) {
    if (plat === "desktop") { await tap(p, "[data-mainmenu]", true); await p.waitForTimeout(450); await tap(p, '.mdrw [data-go="set"]', true); }
    else await tap(p, '[data-tab="set"]', true);
    await settle(p);
    const cats = await p.locator(".scr:not(.gone) [data-go^='set:']").count();
    ok("U04", "設定首頁是分類", cats >= 3, String(cats));
    for (const [k, sel, nm] of [["int", "[data-tg]", "Telegram"], ["sec", "[data-pin]", "PIN 碼"], ["look", '[data-pref="plat"]', "介面"]]) {
      await tap(p, `.scr:not(.gone) [data-go="set:${k}"]`, true); await settle(p);
      ok("U04", `設定「${k}」裡找得到${nm}`, await p.locator(`.scr:not(.gone) ${sel}`).count() > 0);
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
    if (plat === "desktop") { await p.goBack(); await settle(p); } else { await tap(p, '[data-tab="list"]', true); await settle(p); }
    s = await look(p); ok("U04", "回到清單", s.title === listTitle, s.title);
  }
  if (want("N06")) {   // 搜尋：打字篩選、取消；Android 返回先收起搜尋
    if (plat === "android") { await tap(p, "[data-srch]", true); await settle(p); }
    const fs = await p.evaluate(() => { const i = document.querySelector("#app [data-search]"); return i ? parseFloat(getComputedStyle(i).fontSize) : 0; });
    ok("N06", "搜尋框字不小於 16（iPhone 不會自己放大）", fs >= 16, String(fs));
    await p.locator("#app [data-search]").first().fill("大");
    await settle(p);
    ok("N06", "打字就篩選", await p.locator('.crow[data-go^="h:"]').count() === 1);
    if (plat === "android") {
      await p.goBack(); await settle(p); s = await look(p);
      ok("N06", "Android 搜尋時按返回：先收起搜尋、清掉字、沒離開", !(await p.locator(".lhd.asr").count()) && await p.locator('.crow[data-go^="h:"]').count() === 3 && p.url().startsWith(url), JSON.stringify(s));
    } else if (plat === "ios") {
      await tap(p, "[data-qsx]", true); await settle(p);
      ok("N06", "iOS 按「取消」清掉搜尋", await p.locator('.crow[data-go^="h:"]').count() === 3);
    } else {
      await p.locator("#app [data-search]").first().press("Escape"); await settle(p);
      ok("N06", "電腦介面按 Esc 清掉搜尋", await p.locator('.crow[data-go^="h:"]').count() === 3);
    }
  }
}

/* ═════════ 電腦寬度 ═════════ */
async function deskFlow(o, engine, plat, url){
  const {p} = o;
  let s = await look(p);
  ok("N04", "畫面是這個平台", s.plat === plat, s.plat);
  if (want("N01")) {
    await p.locator(hostSel("東京")).first().click(); await settle(p); s = await look(p);
    ok("N01", "點主機：中間換成那台", s.title === "東京測試主機", s.title);
    const i0 = s.info;
    await p.locator(".mcol .tbar [data-go^='i:']").first().click(); await settle(p); s = await look(p);
    ok("N01", "資訊鈕開關右欄", s.info !== i0, `${i0}→${s.info}`);
    if (!s.info) { await p.locator(".mcol .tbar [data-go^='i:']").first().click(); await settle(p); }
    await p.locator(hostSel("大阪")).first().click(); await settle(p); s = await look(p);
    ok("N01", "換一台主機：中間跟著換、右欄還開著", s.title === "大阪" && s.info, JSON.stringify(s));
    await p.keyboard.press("Escape"); await settle(p); s = await look(p);
    ok("A01", "Esc 收起右欄", !s.info, JSON.stringify(s));
  }
  if (want("U01")) {
    await p.locator(hostSel("東京")).first().click(); await settle(p);
    await p.locator(".mcol [data-hv='ev']").click(); await settle(p);
    ok("U01", "電腦也是一下就到這台的紀錄", (await look(p)).seg === "ev" && await p.locator(".mcol .hev .ev").count() > 6);
    await p.locator(".mcol [data-hv='mon']").click(); await settle(p);
  }
  if (want("N02") || want("A01")) {
    if (plat === "desktop") {
      await p.click("[data-mainmenu]"); await p.waitForTimeout(450);
      ok("N03", "主選單從左邊滑出來", (await look(p)).menus === 1);
      await p.click('.mdrw [data-go="set"]'); await settle(p); s = await look(p);
      ok("N02", "設定是蓋在中間的一層", s.layer && s.title === "設定" && s.menus === 0, JSON.stringify(s));
      await p.click('.slayer [data-go="set:look"]'); await settle(p); s = await look(p);
      ok("N02", "設定裡點分類：同一層裡推進去", s.layer && s.title === "外觀", s.title);
      await p.goBack(); await settle(p); s = await look(p);
      ok("N02", "上一頁回設定首頁", s.layer && s.title === "設定", s.title);
      await p.goForward(); await settle(p); s = await look(p);
      ok("N02", "下一頁又到外觀", s.layer && s.title === "外觀", s.title);
      await p.keyboard.press("Escape"); await settle(p); s = await look(p);
      ok("A01", "Esc 退一層（外觀 → 設定）", s.layer && s.title === "設定", s.title);
      await p.keyboard.press("Escape"); await p.waitForTimeout(700); s = await look(p);
      ok("A01", "再 Esc 關掉設定、回到原本那台主機", !s.layer && s.title === "東京測試主機", JSON.stringify(s));
      await p.click("[data-mainmenu]"); await p.waitForTimeout(450);
      await p.mouse.click(1300, 450); await p.waitForTimeout(450);
      ok("N03", "點旁邊關掉主選單", (await look(p)).menus === 0);
    } else {
      await p.click('[data-tab="set"]'); await settle(p);
      ok("N02", "左欄換成設定", (await look(p)).left === "設定");
      await p.click('.lcol [data-go="set:look"]'); await settle(p);
      ok("N02", "左欄推進到外觀", (await look(p)).left === "外觀");
      await p.goBack(); await settle(p);
      ok("N02", "上一頁回設定", (await look(p)).left === "設定");
      await p.click('[data-tab="list"]'); await settle(p);
      ok("N02", "回到主機清單、中間還是那台", (await look(p)).title === "東京測試主機");
    }
  }
  if (want("N05")) {   // 寬窄互換：選的主機、打開的視窗和打到一半的字都還在
    await p.locator(hostSel("東京")).first().click(); await settle(p);
    await p.locator(".mcol .tbar [data-more]").click(); await p.waitForTimeout(350);
    await p.click(".lmenu [data-rename]"); await p.waitForTimeout(600);
    const inp = p.locator("#layer .veil input").first();
    await inp.fill("打到一半的名字");
    await p.setViewportSize({width: 1023, height: 900}); await p.waitForTimeout(900);
    s = await look(p);
    ok("N05", "1440→1023：還是那台、視窗還開著、字還在", s.phone && s.title === "東京測試主機" && s.dialogs === 1 && await inp.inputValue() === "打到一半的名字", JSON.stringify(s));
    await p.setViewportSize({width: 1024, height: 900}); await p.waitForTimeout(900); s = await look(p);
    ok("N05", "1023→1024：回到三欄、還是那台、視窗還開著", !s.phone && s.title === "東京測試主機" && s.dialogs === 1, JSON.stringify(s));
    await p.keyboard.press("Escape"); await p.waitForTimeout(600);
    ok("N05", "Esc 關掉、名字沒有被改", (await look(p)).dialogs === 0 && await p.locator(hostSel("東京")).count() === 1);
    await p.setViewportSize({width: 1440, height: 900}); await settle(p);
  }
  if (want("U02")) {
    await p.locator(".crow[data-go='all']").click().catch(() => p.click('[data-tab="all"]')); await settle(p);
    const ev = p.locator('.mcol .ev.eb.go[data-go="h:首爾-名字特別長的一台測試主機"]').first();
    if (await ev.count()) { await ev.click(); await settle(p); s = await look(p);
      ok("U02", "電腦：點一則紀錄到那台主機的紀錄", /首爾/.test(s.title) && s.seg === "ev", JSON.stringify(s)); }
    else skip("U02", "電腦：點紀錄到主機", "畫面上沒有那台的紀錄");
  }
  if (want("A01")) {   // 鍵盤：Tab 在視窗裡轉、Esc 關、焦點回到按鈕
    await p.locator(hostSel("大阪")).first().click(); await settle(p);
    if (!(await look(p)).info) { await p.locator(".mcol .tbar [data-go^='i:']").first().click(); await settle(p); }
    const rm = p.locator(".rcol [data-rmhost]").first();
    await rm.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(600);
    const f1 = await p.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
    ok("A01", "危險動作的視窗：焦點先放在「取消」", f1 === "取消", f1);
    for (let i = 0; i < 6; i++) await p.keyboard.press("Tab");
    const inside = await p.evaluate(() => !!document.activeElement.closest("#layer .veil"));
    ok("A01", "Tab 不會跑出視窗", inside);
    await p.keyboard.press("Escape"); await p.waitForTimeout(600);
    const back = await p.evaluate(() => document.activeElement && document.activeElement.matches("[data-rmhost]"));
    ok("A01", "Esc 關掉後焦點回到原本的按鈕", back);
  }
}

/* ═════════ 自動更新、來回很多次 ═════════ */
async function refreshFlow(o, engine, plat, phone){
  const {p} = o;
  if (phone) { await tap(p, hostSel("東京"), true); await settle(p); }
  else { await p.locator(hostSel("東京")).first().click(); await settle(p); }
  const n0 = (await p.evaluate(() => performance.getEntriesByType("resource").filter(e => /\/api\/all/.test(e.name)).length));
  await p.evaluate(() => {
    window._e2e = {scr: document.querySelector("#app .scr[data-key^='s:h:']"), muts: 0, adds: 0};
    new MutationObserver(ms => { for (const m of ms) { window._e2e.muts++; window._e2e.adds += m.addedNodes.length; } }).observe(document.querySelector("#app"), {childList: true, subtree: true});
  });
  if (!phone) {
    if (!(await p.locator("#app [data-search]").count())) { await p.click("[data-srch]"); await settle(p); }
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
    const h0 = await p.evaluate(() => history.length);
    for (let i = 0; i < 15; i++) {
      if (phone) { await p.goBack(); await p.waitForTimeout(260); await p.locator(hostSel(i % 2 ? "大阪" : "東京")).first().tap(); await p.waitForTimeout(260); }
      else { await p.locator(hostSel(i % 2 ? "大阪" : "東京")).first().click(); await p.waitForTimeout(220); }
    }
    await settle(p);
    const r2 = await p.evaluate(() => ({n: document.querySelectorAll("*").length, layers: document.querySelectorAll(".stage>.scr:not(.under)").length, menus: document.querySelectorAll(".lmenu,.mdrw").length, veils: document.querySelectorAll("#layer .veil").length, hist: history.length}));
    ok("R03", "來回 15 次：只剩一層、沒有殘留選單和視窗", (phone ? r2.layers === 1 : true) && r2.menus === 0 && r2.veils === 0, JSON.stringify(r2));
    ok("R03", "來回 15 次：元素數沒有一直變多", r2.n < nodes0 * 1.3, `${nodes0}→${r2.n}`);
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
      ok("S01", "移除後自己回到清單、大阪不見了", s.title === "主機" && await p.locator(hostSel("大阪")).count() === 0, JSON.stringify(s));
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
    let st = await p.evaluate(() => ({lost: document.documentElement.classList.contains("lost"), t: (document.querySelector(".mcol .tbar .tbt b") || {}).textContent}));
    ok("F03", "主機 502 超過 15 秒：標出連線中斷、畫面還在原本那台", st.lost && st.t === "東京測試主機", JSON.stringify(st));
    await p.unroute("**/api/all*"); await p.waitForTimeout(6500);
    st = await p.evaluate(() => ({lost: document.documentElement.classList.contains("lost"), t: (document.querySelector(".mcol .tbar .tbt b") || {}).textContent}));
    ok("F03", "恢復後自己接回來、還在原本那台", !st.lost && st.t === "東京測試主機", JSON.stringify(st));
    await p.route("**/api/all*", r => r.abort("connectionrefused")); await p.waitForTimeout(4000);
    ok("F03", "斷線時沒有跳錯誤、畫面還在", await p.locator(".mcol .tbar").count() === 1);
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
