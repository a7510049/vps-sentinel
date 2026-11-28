/* ═════════ PIN 碼：自己做的數字鍵盤（每次打開數字位置都打亂），PIN 碼不原樣送出 ═════════
   主機給鹽、次數、一次性題目 → 這裡算 PBKDF2(PIN 碼) 再對題目算 HMAC，只送答案；主機只存 PBKDF2 的結果，對得上就過。
   首頁（塞進 app.js 前面）和被監看那頁（/pin.js）共用 */
const PINENC = new TextEncoder();
const pinHex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const pinUnhex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
/* 沒有 https 的網址（例如直接用 IP 打開）瀏覽器不給 crypto.subtle：用這段自己算 SHA-256 */
function pinSha(m){
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const l = m.length, n = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(n); b.set(m); b[l] = 0x80;
  const dv = new DataView(b.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], W = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) W[i] = (W[i - 16] + (r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3)) + W[i - 7] + (r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10))) | 0;
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    [a, bb, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer); H.forEach((v, i) => ov.setUint32(i * 4, v)); return out;
}
function pinHmacJs(key, msg){
  if (key.length > 64) key = pinSha(key);
  const k = new Uint8Array(64); k.set(key);
  const ip = k.map(x => x ^ 0x36), op = k.map(x => x ^ 0x5c), cat = (a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; };
  return pinSha(cat(op, pinSha(cat(ip, msg))));
}
async function pinHmac(key, msg){
  if (window.crypto && crypto.subtle) {
    const k = await crypto.subtle.importKey("raw", key, {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
  }
  return pinHmacJs(key, msg);
}
async function pinKdf(pin, saltHex, n){                       // PBKDF2-HMAC-SHA256，32 位元組，回傳十六進位（跟主機存的一樣）
  const salt = pinUnhex(saltHex);
  if (window.crypto && crypto.subtle) {
    const k = await crypto.subtle.importKey("raw", PINENC.encode(pin), "PBKDF2", false, ["deriveBits"]);
    return pinHex(await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt, iterations:n}, k, 256));
  }
  const key = PINENC.encode(pin), s1 = new Uint8Array(salt.length + 4); s1.set(salt); s1[salt.length + 3] = 1;
  let u = pinHmacJs(key, s1); const t = u.slice();
  for (let i = 1; i < n; i++) { u = pinHmacJs(key, u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; if (!(i & 4095)) await new Promise(r => setTimeout(r)); }
  return pinHex(t);
}
/* 拿題目算答案：begin() 回傳 {salt, n, nonce}（主機沒設定 PIN 碼回 {pin:false}） */
async function pinProof(pin, begin){
  const b = await begin();
  if (!b || !b.nonce) throw new Error(b && b.pin === false ? "這台主機沒有設定 PIN 碼" : "主機還沒更新到新版");
  const h = await pinKdf(pin, b.salt, b.n);
  return {nonce: b.nonce, proof: pinHex(await pinHmac(PINENC.encode(h), PINENC.encode(b.nonce)))};
}
/* 設定新的 PIN 碼：鹽在這裡產生，只送 PBKDF2 的結果 */
async function pinMake(pin){
  const salt = pinHex(crypto.getRandomValues(new Uint8Array(16))), n = 200000;
  return {salt, n, hash: await pinKdf(pin, salt, n)};
}
const pinWeak = p => new Set(p).size === 1 || "0123456789".includes(p) || "9876543210".includes(p);
/* 打亂數字的順序（用瀏覽器的亂數，不用 Math.random） */
function pinShuffle(){
  const a = [..."0123456789"], r = crypto.getRandomValues(new Uint32Array(10));
  for (let i = 9; i > 0; i--) { const j = r[i] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/* 數字鍵盤：box 裡畫上圓點和 12 顆鍵（9 顆數字、左下 opt.left（例如手機金鑰，沒有就空著）、1 顆數字、刪除），每次打開、輸錯都重新打亂
   確定鈕是 opt.okBtn（視窗下面那顆），沒給就在鍵盤下面放一顆；opt.ok(pin) 按確定（或打滿 8 碼）時呼叫；回傳 {clear, again, busy}；電腦上也可以直接按鍵盤的數字 */
function pinPad(box, opt){
  let pin = "", busy = false;
  const ico = {del:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5H9l-6 7 6 7h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"/><path d="m12 9 6 6m0-6-6 6"/></svg>'};   // 退格鍵：共用圖示系統的 backspace（被監看那頁沒有 icons.js，這裡抄一份同樣的線條）
  const L = opt.left;
  const draw = () => {
    const d = pinShuffle();
    box.innerHTML = `<div class="ppdots" aria-live="polite"></div><div class="ppkeys">${d.slice(0, 9).map(x => `<button type="button" data-pk="${x}">${x}</button>`).join("")}`
      + (L ? `<button type="button" class="ppfn ppl" data-pleft aria-label="${L.label}">${L.html}</button>` : `<i></i>`)
      + `<button type="button" data-pk="${d[9]}">${d[9]}</button><button type="button" class="ppfn" data-pdel aria-label="刪除">${ico.del}</button></div>`
      + (opt.okBtn ? "" : `<button type="button" class="ppgo" data-pok>確定</button>`);
    dots();
  };
  const dots = () => {
    const el = box.querySelector(".ppdots"); if (!el) return;
    el.innerHTML = Array.from({length: Math.max(4, pin.length)}, (_, i) => `<i${i < pin.length ? ' class="on"' : ""}></i>`).join("");
    el.setAttribute("aria-label", `已輸入 ${pin.length} 碼`);
    const ok = opt.okBtn || box.querySelector("[data-pok]"); if (ok) ok.disabled = pin.length < 4 || busy;
  };
  const go = () => { if (pin.length >= 4 && !busy) opt.ok(pin); };
  const key = ch => {
    if (busy) return;
    if (ch === "del") pin = pin.slice(0, -1);
    else if (pin.length < 8) pin += ch;
    dots();
    if (pin.length === 8) go();
  };
  box.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || !box.contains(b)) return;
    e.preventDefault();
    if (b.hasAttribute("data-pdel")) key("del"); else if (b.hasAttribute("data-pok")) go(); else if (b.hasAttribute("data-pleft")) { if (!busy) L.on(); } else if (b.dataset.pk) key(b.dataset.pk);
  });
  const kd = e => {
    if (!box.isConnected) return document.removeEventListener("keydown", kd);
    if (e.target.closest && e.target.closest("input,textarea")) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); key(e.key); }
    else if (e.key === "Backspace") { e.preventDefault(); key("del"); }
    else if (e.key === "Enter") { e.preventDefault(); go(); }
  };
  document.addEventListener("keydown", kd);
  if (opt.okBtn) opt.okBtn.addEventListener("click", e => { e.preventDefault(); go(); });
  box.classList.add("ppad");
  draw();
  return {
    clear(){ pin = ""; dots(); },
    again(){ pin = ""; draw(); box.classList.remove("ppbad"); void box.offsetWidth; box.classList.add("ppbad"); },   // 輸錯：清掉、重新打亂、晃一下
    busy(v){ busy = v; box.classList.toggle("ppwait", v); dots(); },
  };
}
