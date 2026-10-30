// node build.js — 把 data/ 下的词库注入 index.html，并生成 sw.js 的离线缓存清单
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const decks = fs.readdirSync("data").filter((f) => /^deck-.*\.js$/.test(f)).sort();
const order = ["deck-meeting.js", "deck-email.js", "deck-negotiation.js", "deck-ai.js", "deck-cloud.js", "deck-leadership.js", "deck-smalltalk.js"];
decks.sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)));
const tags = decks.map((f) => `  <script src="./data/${f}"></script>`).join("\n");
let html = fs.readFileSync("index.html", "utf8");
html = html.replace(/  <!-- DECKS -->[\s\S]*?<script src="\.\/app\.js"><\/script>/, `  <!-- DECKS -->\n${tags}\n  <script src="./app.js"></script>`);
fs.writeFileSync("index.html", html);

const assets = ["./", "./index.html", "./style.css", "./app.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png", "./icons/apple-touch-icon.png",
  ...decks.map((f) => `./data/${f}`)];
const hash = crypto.createHash("md5");
for (const a of assets) { const p = a === "./" ? "index.html" : a.slice(2); if (fs.existsSync(p)) hash.update(fs.readFileSync(p)); }
const version = hash.digest("hex").slice(0, 10);
const sw = `/* Crystal's English — service worker (offline first). build ${version} */
const CACHE = "crystals-english-${version}";
const ASSETS = ${JSON.stringify(assets, null, 2)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => (req.mode === "navigate" ? caches.match("./index.html") : undefined));
    })
  );
});
`;
fs.writeFileSync("sw.js", sw);
console.log(`注入 ${decks.length} 个词库: ${decks.join(", ")}\nsw.js 版本 ${version}，缓存 ${assets.length} 个文件`);
