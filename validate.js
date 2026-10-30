// node validate.js data/deck-xxx.js [more files]
const fs = require("fs");
const vm = require("vm");
const files = process.argv.slice(2);
const REQ = ["id","word","pos","ipa","emoji","level","scene","image","gist","nuance","usage","email","emailZh","meeting","meetingZh","collocations","related"];
const SCENES = new Set(["meeting","email","negotiation","travel","smalltalk","ai","cloud","leadership"]);
const ctx = { window: {} };
vm.createContext(ctx);
let ok = true;
for (const f of files) {
  try { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); }
  catch (e) { console.error(`✗ ${f}: 语法错误 ${e.message}`); ok = false; }
}
const decks = ctx.window.CE_DECKS || [];
const ids = new Map();
for (const d of decks) {
  for (const k of ["key","title","subtitle","emoji","color","intro","words"]) if (d[k] == null) { console.error(`✗ deck ${d.key}: 缺字段 ${k}`); ok = false; }
  for (const w of d.words || []) {
    for (const k of REQ) if (w[k] == null || (w[k] === "" && k !== "ipa")) { console.error(`✗ ${d.key}/${w.id || w.word}: 缺字段 ${k}`); ok = false; }
    if (ids.has(w.id)) { console.error(`✗ 重复 id: ${w.id} (${ids.get(w.id)} 与 ${d.key})`); ok = false; }
    ids.set(w.id, d.key);
    for (const s of w.scene || []) if (!SCENES.has(s)) { console.error(`✗ ${w.id}: 非法 scene ${s}`); ok = false; }
    if (w.gist && w.gist.length > 40) console.warn(`! ${w.id}: gist 偏长 (${w.gist.length})`);
    if (w.email === w.meeting) { console.error(`✗ ${w.id}: email 与 meeting 例句相同`); ok = false; }
  }
  console.log(`${ok ? "✓" : "·"} ${d.key} "${d.title}": ${(d.words||[]).length} 词`);
}
console.log(ok ? `全部通过，共 ${ids.size} 词` : "有错误");
process.exit(ok ? 0 : 1);
