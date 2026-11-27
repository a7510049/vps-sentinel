#!/usr/bin/env node
/* 跨平台操作測試（開發用，主機上不用裝）：iOS／Android／電腦三種介面 × Chromium、WebKit 兩種引擎，真的去點、滑、返回。
   用法：先用測試設定檔跑一台哨兵（不要連正式主機），再
     SENTINEL_URL=http://127.0.0.1:18931/ SENTINEL_TOKEN=測試密碼 node tools/ui_e2e.js
   可選：ENGINES=chromium,webkit  PLATS=ios,android,desktop  QUICK=1（跳過等自動更新那段）
   注意：WebKit 不等於 iPhone Safari、Chromium 手機模擬不等於安卓實機，結果只能當參考。 */
const { chromium, webkit } = require("playwright");
const URL0 = process.env.SENTINEL_URL || "http://127.0.0.1:18931/", TOK = process.env.SENTINEL_TOKEN || "";
const ENGINES = (process.env.ENGINES || "chromium,webkit").split(","), PLATS = (process.env.PLATS || "ios,android,desktop").split(",");
let fails = 0, passes = 0;
const ok = (name, cond, info = "") => { if (cond) { passes++; console.log("  ✓ " + name); } else { fails++; console.log("  ✗ " + name + (info ? "：" + info : "")); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(br, plat, phone, engine){
  const ctx = await br.newContext({viewport: phone ? {width: 390, height: 844} : {width: 1440, height: 900}, hasTouch: phone, isMobile: phone && engine === "chromium"});
  await ctx.addInitScript(([plat, tok]) => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.setItem("vps-sentinel-token", tok); localStorage.setItem("vps-sentinel-token-exp", String(Date.now() + 9e8));
    localStorage.setItem("vps-prefs", JSON.stringify({plat, theme: "light"}));
  }, [plat, TOK]);
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL0); await p.waitForSelector(".crow", {timeout: 20000}); await wait(800);
  return {ctx, p, errs};
}
const st = p => p.evaluate(() => ({stk: STK.join(">"), scr: document.querySelectorAll(".stage>.scr").length, plat: document.documentElement.dataset.plat, hist: history.length, url: location.href, top: (document.querySelector(".stage>.scr:not(.gone,.under)") || {}).dataset?.key || ""}));
const settle = p => p.waitForTimeout(700);
const tap = async (p, sel, phone) => { const el = p.locator(sel).first(); if (phone) await el.tap(); else await el.click(); };

async function phoneFlow(p, plat, engine, errs){
  const s0 = await st(p);
  ok("畫面是這個平台", s0.plat === plat, s0.plat);
  ok("最底層一層", s0.stk === "list" && s0.scr === 1, JSON.stringify(s0));
  // 真的點：主機 → 主機頁 → 資訊；瀏覽器上一頁一次退一層
  await tap(p, '.crow[data-go^="h:"]', true); await settle(p);
  let s = await st(p); ok("點主機推進一層", s.stk.split(">").length === 2 && s.scr === 1, JSON.stringify(s));
  await tap(p, ".tbar .tav", true); await settle(p);
  s = await st(p); ok("點頭像到主機資訊", s.stk.split(">").length === 3, s.stk);
  await p.goBack(); await settle(p);
  s = await st(p); ok("上一頁退一層", s.stk.split(">").length === 2 && s.scr === 1, JSON.stringify(s));
  await tap(p, "[data-navback]", true); await settle(p);
  s = await st(p); ok("返回鈕退回清單", s.stk === "list" && s.scr === 1, JSON.stringify(s));
  ok("退到底還在網站裡", s.url.startsWith(URL0), s.url);
  // 快速連點：只推進一層，不會多出看不見的層
  const row = p.locator('.crow[data-go^="h:"]').first();
  await row.tap(); await row.tap({force: true}).catch(() => {}); await row.tap({force: true}).catch(() => {});
  await settle(p); s = await st(p);
  ok("連點三下只推進一層", s.stk.split(">").length === 2 && s.scr === 1, JSON.stringify(s));
  await p.goBack(); await settle(p);
  // 長按：不推進兩次、不出錯
  const bx = await row.boundingBox();
  await p.touchscreen.tap(bx.x + 40, bx.y + 20).catch(() => {});
  await settle(p); s = await st(p); ok("長按／點一下後畫面正常", s.scr === 1, JSON.stringify(s));
  if (s.stk !== "list") { await p.goBack(); await settle(p); }
  // 選單：打開、點旁邊關、再打開、Esc 關
  await tap(p, '.crow[data-go^="h:"]', true); await settle(p);
  if (await p.locator(".tbar [data-more]").count()) {
    await tap(p, ".tbar [data-more]", true); await p.waitForTimeout(300);
    ok("⋯ 選單打開", await p.locator(".lmenu").count() === 1);
    await p.touchscreen.tap(200, 700); await p.waitForTimeout(400);
    ok("點旁邊關掉選單", await p.locator(".lmenu").count() === 0);
    await tap(p, ".tbar [data-more]", true); await p.waitForTimeout(300);
    ok("關掉後馬上能再打開", await p.locator(".lmenu").count() === 1);
    await p.goBack(); await p.waitForTimeout(400);
    s = await st(p); ok("返回先關選單、不退層", await p.locator(".lmenu").count() === 0 && s.stk.split(">").length === 2, JSON.stringify(s));
  }
  // 往右滑返回（只有 Chromium 能用 CDP 送觸控移動）
  if (engine === "chromium") {
    const cdp = await p.context().newCDPSession(p);
    const swipe = async (dx) => {
      const pts = x => [{x, y: 420}];
      await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: pts(60)});
      for (let i = 1; i <= 8; i++) { await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: pts(60 + dx * i / 8)}); await wait(30); }
      await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
      await settle(p);
    };
    await swipe(50); s = await st(p);
    ok("滑一點點放手：留在原地、底下那層拿掉", s.stk.split(">").length === 2 && s.scr === 1, JSON.stringify(s));
    await swipe(260); s = await st(p);
    ok("往右滑超過三成：退一層", s.stk === "list" && s.scr === 1, JSON.stringify(s));
  } else { await tap(p, "[data-navback]", true); await settle(p); }
  // 分頁列（iOS、Android）：換分頁不留瀏覽紀錄，重新整理後還在同一個分頁
  if (plat !== "desktop") {
    const h0 = (await st(p)).hist;
    await tap(p, '[data-tab="all"]', true); await settle(p);
    await tap(p, '[data-tab="set"]', true); await settle(p);
    s = await st(p); ok("換到設定分頁", s.stk === "set", s.stk);
    if (plat === "ios") ok("iOS 換分頁不留瀏覽紀錄", s.hist === h0, `${h0}→${s.hist}`);
    else {   // Android（MainTabsActivity.onBackPressed）：不在第一個分頁時返回先回「主機」，而且不離開網站
      ok("Android 換分頁最多多一筆紀錄", s.hist <= h0 + 1, `${h0}→${s.hist}`);
      await p.goBack(); await settle(p); s = await st(p);
      ok("Android 在別的分頁按返回：回主機分頁", s.stk === "list" && s.url.startsWith(URL0), JSON.stringify(s));
      await tap(p, '[data-tab="set"]', true); await settle(p);
    }
    await p.reload(); await p.waitForSelector(".tabbar"); await settle(p);
    s = await st(p); ok("重新整理後還在設定分頁", s.stk === "set", s.stk);
    // 換平台：在設定裡換成另一個，重新整理還記得
    const other = plat === "ios" ? "android" : "ios";
    await tap(p, `[data-pref="plat"][data-val="${other}"]`, true); await p.waitForTimeout(900);
    s = await st(p); ok("在外觀換平台馬上生效", s.plat === other && s.stk === "set", JSON.stringify(s));
    await p.reload(); await p.waitForSelector(".crow,.tabbar"); await settle(p);
    s = await st(p); ok("重新整理後平台還在", s.plat === other, s.plat);
    await tap(p, `[data-pref="plat"][data-val="${plat}"]`, true); await p.waitForTimeout(900);
    await tap(p, '[data-tab="list"]', true); await settle(p);
  } else {
    await tap(p, "[data-mainmenu]", true); await p.waitForTimeout(400);
    ok("主選單從左邊滑出來", await p.locator(".mdrw").count() === 1);
    await tap(p, '.mdrw [data-go="set"]', true); await settle(p);
    s = await st(p); ok("主選單點設定推進設定", s.stk === "list>set" && (await p.locator(".mdrw").count()) === 0, s.stk);
    await p.goBack(); await settle(p);
    s = await st(p); ok("上一頁退出設定", s.stk === "list", s.stk);
  }
  // 搜尋框：手機上字至少 16（iPhone 不會自己放大）
  if (plat === "android") { await tap(p, "[data-srch]", true); await settle(p); }
  const fs = await p.evaluate(() => { const i = document.querySelector("#app [data-search]"); return i ? parseFloat(getComputedStyle(i).fontSize) : 0; });
  ok("搜尋框字不小於 16", fs >= 16, String(fs));
  await p.locator("#app [data-search]").first().fill("東");
  await settle(p);
  const n = await p.locator('.crow[data-go^="h:"]').count();
  ok("打字就篩選", n >= 1 && n < 3, String(n));
  if (plat === "android") await tap(p, "[data-srchx]", true); else await tap(p, "[data-qsx],.lhd .srch", true).catch(() => {});
  await p.evaluate(() => { QS = ""; render(LIST); }); await settle(p);
}

async function deskFlow(p, plat){
  let s = await st(p); ok("畫面是這個平台", s.plat === plat, s.plat);
  await p.locator('.crow[data-go^="h:"]').first().click(); await settle(p);
  ok("中間換成主機", await p.locator(".mcol .scr[data-key^='s:h:']").count() === 1);
  if (plat === "desktop") {
    await p.click("[data-mainmenu]"); await p.waitForTimeout(400);
    await p.click('.mdrw [data-go="set"]'); await settle(p);
    ok("設定是蓋在中間的一層", await p.locator(".slayer .slbox").count() === 1);
    await p.keyboard.press("Escape"); await p.waitForTimeout(500);
    ok("Esc 關掉設定那層", await p.locator(".slayer").count() === 0);
    await p.click("[data-mainmenu]"); await p.waitForTimeout(400);
    await p.mouse.click(1300, 450); await p.waitForTimeout(400);
    ok("點旁邊關掉主選單", await p.locator(".mdrw").count() === 0);
  } else {
    await p.click('[data-tab="set"]'); await settle(p);
    ok("左欄換成設定", await p.locator(".lcol .scr[data-key='s:set']").count() === 1);
    await p.click('[data-tab="list"]'); await settle(p);
  }
}

/* 自動更新兩次：畫面元素不重建、沒有多出的層、元素數不暴增 */
async function refreshFlow(p, phone){
  if (process.env.QUICK) return;
  if (phone) { await p.locator('.crow[data-go^="h:"]').last().tap(); await settle(p); }
  const before = await p.evaluate(() => { window._e2eScr = document.querySelector("#app .scr[data-key^='s:h:']"); return document.querySelectorAll("*").length; });
  await p.waitForTimeout(11500);
  const r = await p.evaluate(() => ({same: window._e2eScr && window._e2eScr.isConnected, n: document.querySelectorAll("*").length, layers: document.querySelectorAll(".stage>.scr").length}));
  ok("自動更新兩次：畫面沿用、不重建", r.same, JSON.stringify(r));
  ok("自動更新後元素數穩定", Math.abs(r.n - before) < before * .15, `${before}→${r.n}`);
  if (phone) ok("自動更新後還是一層", r.layers === 1, String(r.layers));
  // 長時間：來回 15 次
  if (phone) {
    for (let i = 0; i < 15; i++) { await p.goBack(); await p.waitForTimeout(250); await p.locator('.crow[data-go^="h:"]').first().tap(); await p.waitForTimeout(250); }
    await settle(p);
    const r2 = await p.evaluate(() => ({n: document.querySelectorAll("*").length, layers: document.querySelectorAll(".stage>.scr").length, rip: document.querySelectorAll(".rip").length, menus: document.querySelectorAll(".lmenu,.mdrw").length}));
    ok("來回 15 次後只剩一層、沒有殘留", r2.layers === 1 && r2.rip === 0 && r2.menus === 0, JSON.stringify(r2));
    ok("來回 15 次後元素數沒有一直變多", r2.n < before * 1.3, `${before}→${r2.n}`);
  }
}

(async () => {
  for (const engine of ENGINES) {
    const br = await (engine === "webkit" ? webkit : chromium).launch();
    for (const plat of PLATS) for (const phone of [true, false]) {
      console.log(`\n${engine}・${plat}・${phone ? "手機 390" : "電腦 1440"}`);
      const {ctx, p, errs} = await open(br, plat, phone, engine);
      try { if (phone) await phoneFlow(p, plat, engine, errs); else await deskFlow(p, plat); await refreshFlow(p, phone); }
      catch (e) { ok("流程跑完", false, e.message.split("\n")[0]); }
      ok("主控台沒有錯誤", !errs.length, errs.join(" | ").slice(0, 300));
      await ctx.close();
    }
    await br.close();
  }
  console.log(`\n通過 ${passes}、失敗 ${fails}`);
  process.exit(fails ? 1 : 0);
})();
