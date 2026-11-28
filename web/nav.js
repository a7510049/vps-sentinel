/* ═════════ 導覽：現在在哪一頁、瀏覽紀錄、浮在上面的選單和對話框 ═════════
   這個檔案只管「在哪裡」，畫面怎麼畫在 app.js。三種介面、手機和電腦寬度共用同一份位置：

   STK：一層一層，第一個是最底層（list 主機清單、all 紀錄、set 設定），後面是推進來的
        h:主機、i:主機資訊、set:分類（設定裡的一頁）。電腦寬度的左中右三欄也是從 STK 算出來（navDerive），
        所以寬窄互換、換介面時，選到的主機和打開的頁面都留著。
   瀏覽紀錄：每一筆都存一整份位置（vs:1、nv:{s:STK, m:SEL}），上一頁、下一頁、重新整理都照那一筆還原，
        不再靠「第幾層」去猜。u＝這一筆底下連著幾筆是它的上一層（app 裡的返回鈕能不能直接交給瀏覽器退）。
   浮層（選單、對話框、Android 搜尋列）：打開時記一筆 ov:代號，上一頁先關最上面的；自己關掉時把那筆退掉。
        關掉的同一刻又打開別的（選單點了開對話框、跳到別頁），直接沿用那一筆，不會多一格也不會被退回去。
   瀏覽器的上一頁是非同步的：自己退的那一下還沒回來之前，後面要改紀錄的動作先排隊（hNow），不會互相踩到。 */
let STK = ["list"];                 // 現在的位置（見上面）
let SEL = "all";                    // 電腦中間最後選的（設定蓋上來、換到別的分頁時中間照樣是它）
let MAIN = "all", LEFT = "list";    // 電腦寬度：中間是 all 或主機代號、左欄是清單或設定的哪一頁；由 STK 算出來
let NAVDIR = 0, NAVK = 0;           // 換畫面的方向（1 推進、-1 退回、0 原地換、2 換分頁）；現在這筆紀錄的編號
const isSetId = x => x === "set" || /^set:/.test(x);
const isHostId = x => /^[hi]:./.test(x);
const navSnap = () => ({s: STK.slice(), m: SEL});
const stkSave = () => { sstore("vs-stk", JSON.stringify(STK)); sstore("vs-main", SEL); };

/* 整理成這個介面合理的樣子：不存在的主機拿掉、分頁介面最底層是最後一個分頁、電腦介面最底層一定是清單 */
function navNorm(a){
  a = (Array.isArray(a) ? a : []).map(String).filter(x => ROOTS.includes(x) || isHostId(x) || /^set:\w+$/.test(x));
  if (LIST.length) a = a.filter(x => !isHostId(x) || LIST.some(s => keyOf(s) === x.slice(2)));
  a = a.filter((x, i) => !/^set:/.test(x) || (i > 0 && isSetId(a[i - 1])));
  if (TABS()) { let r = 0; a.forEach((x, i) => { if (ROOTS.includes(x)) r = i; }); a = a.slice(r); }
  else { a = a.filter((x, i) => i === 0 || x !== "list"); if (a[0] !== "list") a.unshift("list"); }
  if (!a.length || !ROOTS.includes(a[0])) a.unshift("list");
  return a.filter((x, i) => x !== a[i - 1]);
}
/* 電腦寬度：中間、左欄照 STK 算；最上面是主機資訊時右欄打開 */
function navDerive(){
  const hk = [...STK].reverse().find(isHostId);
  if (hk) SEL = hk.slice(2); else if (STK.includes("all")) SEL = "all";
  if (DESK.matches && hk && hk[0] === "i" && STK[STK.length - 1] === hk && !INFO) { INFO = true; store("vs-info", "1"); }
  MAIN = SEL !== "all" && LIST.some(s => keyOf(s) === SEL) ? SEL : "all";
  LEFT = [...STK].reverse().find(isSetId) || "list";
}
/* 兩份位置一不一樣 */
const navSame = (a, b) => !!a && !!b && a.m === b.m && (a.s || []).join("\n") === (b.s || []).join("\n");
function navDirOf(a, b){
  if (a.length === 1 && b.length === 1 && a[0] !== b[0]) return 2;
  return b.length > a.length ? 1 : b.length < a.length ? -1 : 0;
}

/* ── 瀏覽紀錄：一次只做一件事 ── */
const HQ = {busy: 0, q: [], t: 0};
function hNow(fn){ if (HQ.busy) HQ.q.push(fn); else fn(); }
function hGo(n){ hNow(() => { HQ.busy = 1; clearTimeout(HQ.t); HQ.t = setTimeout(hFree, 900); history.go(n); }); }   // 900 毫秒還沒回來（沒有上一筆）：照樣放行
const hBack = () => hGo(-1);
function hFree(){ clearTimeout(HQ.t); HQ.busy = 0; while (!HQ.busy && HQ.q.length) HQ.q.shift()(); }
const hCur = () => history.state || {};
/* 這一筆的東西已經不在了（選單、對話框關掉了，機場起降關掉了）：沒辦法還原，經過時跳過 */
function deadEntry(st){
  if (!st) return false;
  if (st.ov && !OVS.some(o => o.t === st.ov)) return true;
  if (st.fly && !document.getElementById("fly")) return true;
  if (st.frad && !(typeof FRAD !== "undefined" && FRAD)) return true;
  return false;
}
/* 記一筆新的位置（推進一層）：最上面那筆是剛關掉的浮層就直接拿來用 */
function hPush(extra = {}){
  const st = hCur(), reuse = deadEntry(st);
  const base = reuse ? st : {...st, k: (st.k || 0) + 1, u: (st.u || 0) + 1};
  const e = {...base, vs: 1, nv: navSnap(), ...extra};
  delete e.ov; delete e.fly; delete e.frad; Object.assign(e, extra);
  NAVK = e.k || 0;
  try { reuse ? history.replaceState(e, "") : history.pushState(e, ""); } catch(err) {}
}
/* 改寫現在這一筆（原地換、換分頁） */
function hReplace(extra = {}){
  const st = hCur(), e = {...st, vs: 1, nv: navSnap(), k: st.k || 0, u: st.u || 0, ...extra};
  try { history.replaceState(e, ""); } catch(err) {}
}
/* 給機場起降用：記一筆（帶 fly、frad 這類標記），位置照舊 */
function hMark(extra){ hNow(() => hPush(extra)); }

/* ── 換位置 ── */
function navPaint(dir){
  navDerive();
  const lay = $("#app .slayer");
  if (lay && DESK.matches && PLAT === "desktop" && !isSetId(LEFT) && canAnim() && !lay._out) {   // 電腦：設定那一層淡出後再換
    lay._out = 1; lay.style.pointerEvents = "none";
    const fin = () => { NAVDIR = 0; if (LIST.length) render(LIST); };
    return lay.animate([{opacity:1}, {opacity:0}], {duration:T.fast, easing:EXIT, fill:"forwards"}).finished.then(fin, fin);
  }
  NAVDIR = dir; if (LIST.length) render(LIST); NAVDIR = 0;
}
/* 換到 a（how：push 推進一層、replace 原地換）；排在還沒回來的上一頁後面 */
function navTo(a, how, dir){
  hNow(() => {
    if (deadEntry(hCur()) && how === "replace") { hBack(); return navTo(a, how, dir); }   // 剛關掉的選單那筆先退掉，再改這一筆
    const b = navNorm(a), d = dir != null ? dir : navDirOf(STK, b);
    if (b.join("\n") === STK.join("\n") && how !== "force") return;
    STK = b; navDerive(); stkSave();
    how === "push" ? hPush() : hReplace();
    navPaint(d);
  });
}
/* 往上退 n 層：紀錄裡底下就是上一層的，交給瀏覽器退（上一頁、下一頁才對得起來）；不是的話自己換 */
function navUp(n, target){
  hNow(() => {
    const st = hCur();
    if (deadEntry(st)) { hBack(); return navUp(n, target); }
    const u = st.u || 0;
    if (u >= n) return hGo(-n);
    if (u > 0) { hGo(-u); return hNow(() => navTo(target, "replace", -1)); }
    navTo(target, "replace", -1);
  });
}
/* 往哪裡去：list、all、set、set:分類、h:主機、i:主機 */
function navGo(id){
  closeMenu(); hideTip();
  if ($("#fly")) flyClose();
  if (TABS() && ROOTS.includes(id)) return tabGo(id);
  if (DESK.matches) return deskGo(id);
  if (id === "list") return STK.length > 1 && navUp(STK.length - 1, ["list"]);
  if (STK[STK.length - 1] === id) return;
  navTo([...STK, id], "push", 1);
}
/* 電腦寬度：點主機是換中間（原地換）、設定和設定裡的分類是推進一層、主機資訊是右欄開關 */
function deskGo(id){
  navDerive();
  const top = STK[STK.length - 1];
  if (id === "list") { const n = STK.length - STK.findIndex(isSetId); return isSetId(top) && navUp(n, STK.filter(x => !isSetId(x))); }
  if (isSetId(id)) return top !== id && navTo([...STK, id], "push", 1);
  if (id.startsWith("i:")) {
    const k = id.slice(2);
    INFO = MAIN !== k || !INFO; store("vs-info", INFO ? "1" : "0");
    if (MAIN !== k) return navTo([STK[0] === "set" ? "list" : STK[0], "h:" + k], "replace", 0);
    return render(LIST);
  }
  const m = id === "all" ? "all" : id.slice(2);
  if (MAIN === m && !isSetId(LEFT)) return;
  navTo(m === "all" ? [STK[0] === "set" ? "list" : STK[0], "all"] : ["list", "h:" + m], "replace", 0);
}
/* 返回鈕、Esc、往右滑：退一層（電腦寬度：先關設定，再收右欄） */
function navBack(){
  closeMenu(); hideTip();
  if (DESK.matches) {
    navDerive();
    if (STK.length > 1 && isSetId(STK[STK.length - 1])) return navUp(1, STK.slice(0, -1));
    if (INFO && MAIN !== "all") { INFO = false; store("vs-info", "0"); return render(LIST); }
    return;
  }
  if (STK.length > 1) navUp(1, STK.slice(0, -1));
}
/* iOS、Android：換分頁（像 Telegram 的分頁列）。離開「主機」記一筆（返回先回主機，不會一下就離開網站），
   分頁之間互換只改那一筆；回到「主機」＝退掉那一筆 */
function tabGo(id){
  closeMenu(); hideTip();
  if (STK.length === 1 && STK[0] === id) {   // 再點一次同一個分頁：捲回最上面
    const sc = $("#app .scr:not(.gone,.under) :is(.lscroll,.mscroll,.rscroll)");
    if (sc && sc.scrollTop) sc.scrollTo({top:0, behavior:canAnim() ? "smooth" : "auto"});
    return;
  }
  hNow(function go(){
    const st = hCur();
    if (deadEntry(st)) { hBack(); return hNow(go); }
    srchDrop();
    if (id === "list" && st.tb) return hBack();
    const was = STK;
    STK = navNorm([id]); navDerive(); stkSave();
    if (id !== "list" && !st.tb) hPush({tb:1}); else hReplace();
    navPaint(navDirOf(was, STK));
    const b = $("#app .tabbar .tbi.on");   // 分頁列是新畫的：選到的那塊底自己撐開（Android 的選取）
    if (b && PLAT === "android" && canAnim()) try { b.animate([{opacity:0, transform:"scale(.7)"}, {opacity:1, transform:"none"}], {duration:T.mid, easing:DEC, pseudoElement:"::before"}); } catch(e) {}
  });
}
/* 換了介面（iOS／Android／電腦）、寬窄互換、主機變少：位置整理一次，改寫現在這一筆 */
function navFix(){
  const b = navNorm(STK);
  navDerive();
  if (b.join("\n") !== STK.join("\n")) { STK = b; navDerive(); stkSave(); hNow(() => hReplace()); }
}

/* ── 上一頁、下一頁 ── */
addEventListener("popstate", () => {
  const ours = HQ.busy, st = history.state;
  if (ours) { clearTimeout(HQ.t); HQ.busy = 0; }
  if (!st || !st.vs) { hReplace({k:NAVK}); return hFree(); }   // 不是這裡記的（網址的 #）：改成現在的位置
  const back = (st.k || 0) <= NAVK;
  NAVK = st.k || 0;
  ovSync(st.ov || 0);
  const dead = deadEntry(st);
  if (st.nv && !navSame(st.nv, navSnap())) {
    const b = navNorm(st.nv.s), was = STK;
    SEL = st.nv.m || SEL; STK = b; navDerive(); stkSave();
    navPaint(navDirOf(was, b));
  }
  if (dead) { HQ.busy = 1; HQ.t = setTimeout(hFree, 900); return back ? history.back() : history.forward(); }   // 關掉的浮層那一筆：照原本的方向跳過去
  hFree();
});
/* 打開網頁：照這一筆紀錄（重新整理）或暫存（同一個分頁再打開）還原；沒有紀錄的話一層一層補上，返回才退得回去 */
function navBoot(){
  const st = history.state;
  let s;
  try { s = st && st.vs && st.nv ? st.nv.s : JSON.parse(sstore("vs-stk") || "null"); } catch(e) {}
  SEL = (st && st.vs && st.nv && st.nv.m) || sstore("vs-main") || "all";
  STK = navNorm(s || ["list"]); navDerive(); stkSave();
  if (st && st.vs) { NAVK = st.k || 0; if (st.ov || st.fly || st.frad) hReplace({ov:0, fly:0, frad:0}); return; }   // 重新整理：浮層、機場起降不會還在
  const all = STK, root = TABS() && all[0] !== "list" ? ["list", all[0]] : [all[0]];
  try {
    STK = [root[0]]; history.replaceState({...(st || {}), vs:1, nv:navSnap(), k:0, u:0}, "");
    let k = 0;
    if (root.length > 1) { STK = [root[1]]; history.pushState({vs:1, nv:navSnap(), k:++k, u:1, tb:1}, ""); }
    for (let i = 1; i < all.length; i++) { STK = all.slice(0, i + 1); history.pushState({vs:1, nv:navSnap(), k:++k, u:(history.state.u || 0) + 1, tb:history.state.tb || 0}, ""); }
    NAVK = k;
  } catch(e) {}
  STK = all;
}

/* ── 浮層：選單、對話框、Android 搜尋列 ── */
const OVS = [];                      // 開著的：{t 代號, el, close}
let OVT = Date.now();                // 代號一直往上加（重新整理前的舊代號一定比較小）
/* 打開時記一筆（close：被上一頁關掉時怎麼關；沒給的話選單用 closeMenu、對話框用它自己的 _esc） */
function histMark(el, close){
  if (!el || el._ovt) return;
  const o = {t: ++OVT, el, close: close || (() => { if (el === window._menu) closeMenu(); else if (el._esc) el._esc(); })};
  el._ovt = o.t; OVS.push(o);
  hNow(() => {
    if (!OVS.includes(o)) return;                 // 還沒輪到就已經關了
    const st = hCur();
    if (deadEntry(st) && st.ov) { try { history.replaceState({...st, ov:o.t}, ""); } catch(e) {} return; }   // 剛關掉的那個（例如選單點了開對話框）：沿用那一筆
    const e = {...st, vs:1, nv:navSnap(), k:(st.k || 0) + 1, u:(st.u || 0) + 1, ov:o.t};
    NAVK = e.k;
    try { history.pushState(e, ""); } catch(err) {}
  });
}
/* 自己關掉（點旁邊、×、Esc、點了選項）：把它那一筆退掉；同一刻又打開別的或換頁的話，那邊會直接沿用 */
function histDrop(el){
  const i = OVS.findIndex(o => o.el === el); if (i < 0) return;
  const o = OVS[i]; OVS.splice(i, 1);
  if (o.pop) return;                              // 是上一頁關的：紀錄已經退了
  setTimeout(() => hNow(() => { const st = hCur(); if (st.ov === o.t) hBack(); }), 0);
}
/* 上一頁到了某一筆：比它晚打開的浮層全部關掉（最上面的先關） */
function ovSync(at){
  for (const o of OVS.slice().reverse()) if (o.t > at) { o.pop = 1; const i = OVS.indexOf(o); if (i >= 0) OVS.splice(i, 1); try { o.close(); } catch(e) {} }
}
const ovOpen = () => OVS.length > 0;
