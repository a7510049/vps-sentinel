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

async function open(req, code, again){
  const r = await fetch(again ? new Request(req, {cache:"reload"}) : req);
  const kid = r.headers.get("X-Alb-E");
  if (!kid || !r.ok) return r;
  const b = await r.arrayBuffer();
  for (const fresh of [false, true]) {
    try {
      const k = await keyOf(code, kid, fresh);
      if (!k) continue;
      const p = await crypto.subtle.decrypt({name:"AES-GCM", iv:b.slice(0, 12)}, k, b.slice(12));
      return new Response(p, {status:200, headers:{"Content-Type":r.headers.get("X-Alb-T") || "image/jpeg", "Cache-Control":"no-store"}});
    } catch (e) {}
  }
  return again ? new Response("", {status:502}) : open(req, code, true);   // 存著的是舊鑰匙加密的：重拿一次
}

self.addEventListener("fetch", e => {
  const q = e.request;
  if (q.method !== "GET" || q.mode === "navigate") return;   // 直接打開圖片網址：照樣是亂碼
  const m = new URL(q.url).pathname.match(/^\/a\/([A-Za-z0-9]{10})\/i\/[0-9a-f]{12}\/[slqxa]$/);
  if (!m) return;
  e.respondWith(open(q, m[1], false));
});
