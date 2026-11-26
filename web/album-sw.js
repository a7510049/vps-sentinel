/* 相簿的照片是加密送來的：在看的人的瀏覽器裡解開，再交給網頁（直接抓網址、用下載工具拿到的是亂碼） */
const KEYS = new Map();                                       // "相簿代碼|鑰匙代號" → 解密鑰匙（Promise）
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

function keyOf(code, kid, fresh){
  const id = code + "|" + kid;
  if (!fresh && KEYS.has(id)) return KEYS.get(id);
  const p = fetch(`/a/${code}/k`, {credentials:"same-origin", cache:"no-store"}).then(r => r.ok ? r.json() : null).then(j => {
    if (!j || !j.k) return null;
    const k = crypto.subtle.importKey("raw", b64(j.k), "AES-GCM", false, ["decrypt"]);
    if (j.id !== kid) { KEYS.set(code + "|" + j.id, k); return null; }
    return k;
  }).catch(() => null);
  KEYS.set(id, p);
  p.then(k => { if (!k) KEYS.delete(id); });
  return p;
}

/* 解開過的照片在這裡留一份（只在記憶體，關掉就沒了）：同一張再用到（看大圖、換大小、捲回來）直接給，不用再下載、再解開；iPhone 不留的話看大圖會先糊一秒 */
const MEM = new Map(), MEMMAX = 96 * 1024 * 1024;
let memSz = 0;
function memPut(u, buf, type){
  if (buf.byteLength > 12 * 1024 * 1024) return;
  if (MEM.has(u)) { memSz -= MEM.get(u).buf.byteLength; MEM.delete(u); }
  MEM.set(u, {buf, type}); memSz += buf.byteLength;
  for (const [k, v] of MEM) { if (memSz <= MEMMAX) break; MEM.delete(k); memSz -= v.buf.byteLength; }
}
const memRes = h => new Response(h.buf.slice(0), {status:200, headers:{"Content-Type":h.type, "Cache-Control":"no-store"}});

async function open(req, code, again){
  const hit = MEM.get(req.url);
  if (hit && !again) { MEM.delete(req.url); MEM.set(req.url, hit); return memRes(hit); }   // 最近用到的放最後，滿了先丟最久沒用的
  const r = await fetch(again ? new Request(req, {cache:"reload"}) : req);
  const kid = r.headers.get("X-Alb-E");
  if (!kid || !r.ok) return r;
  const b = await r.arrayBuffer();
  for (const fresh of [false, true]) {
    try {
      const k = await keyOf(code, kid, fresh);
      if (!k) continue;
      const p = await crypto.subtle.decrypt({name:"AES-GCM", iv:b.slice(0, 12)}, k, b.slice(12));
      const h = {buf:p, type:r.headers.get("X-Alb-T") || "image/jpeg"};
      memPut(req.url, p, h.type);
      return memRes(h);
    } catch (e) {}
  }
  return again ? new Response("", {status:502}) : open(req, code, true);   // 存著的是舊鑰匙加密的：重拿一次
}

self.addEventListener("message", e => {
  const d = e.data;
  if (!d || d.type !== "clear" || typeof d.code !== "string") return;
  const pref = `${self.location.origin}/a/${d.code}/`;
  for (const [k, v] of MEM) { if (k.startsWith(pref)) { MEM.delete(k); memSz -= v.buf.byteLength; } }
  for (const k of [...KEYS.keys()]) { if (k.startsWith(d.code + "|")) KEYS.delete(k); }
});

self.addEventListener("fetch", e => {
  const q = e.request;
  if (q.method !== "GET" || q.destination !== "image") return;   // 只解開網頁上的 <img>：直接打開網址、「儲存圖片」、下載都照樣是亂碼
  const u = new URL(q.url);
  if (u.origin !== self.location.origin) return;
  const m = u.pathname.match(/^\/a\/([A-Za-z0-9]{10})\/i\/[0-9a-f]{12}\/[slqxady]$/);
  if (!m) return;
  e.respondWith(open(q, m[1], false));
});
