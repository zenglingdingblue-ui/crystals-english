/* Crystal's English — app logic (offline, no dependencies) */
(function () {
  "use strict";

  // ---------- data ----------
  const DECKS = (window.CE_DECKS || []).slice();
  const WORDS = [];
  const BY_ID = {};
  DECKS.forEach((d) => {
    d.words.forEach((w) => {
      w.deck = d.key;
      w.deckRef = d;
      WORDS.push(w);
      BY_ID[w.id] = w;
    });
  });
  const DECK_BY_KEY = Object.fromEntries(DECKS.map((d) => [d.key, d]));
  const SCENE = {
    meeting: "会议", email: "邮件", negotiation: "谈判", travel: "出差",
    smalltalk: "闲聊", ai: "AI", cloud: "云", leadership: "管理",
  };
  const LEVEL = { 1: "会用但用不好", 2: "听得懂说不出", 3: "新词" };
  const DAY = 86400000;

  // ---------- storage ----------
  const KEY = "crystals-english.v1";
  const DEFAULT_STATE = () => ({
    p: {},            // progress by word id
    f: [],            // favorites
    log: {},          // date -> {n, r}
    set: { dailyNew: 10, rate: 0.9, voice: "", theme: "auto" },
    today: { date: "", newIds: [] },
  });
  let S = DEFAULT_STATE();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      S = Object.assign(DEFAULT_STATE(), parsed);
      S.set = Object.assign(DEFAULT_STATE().set, parsed.set || {});
    }
  } catch (e) { /* storage unavailable */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function ensureToday() {
    const t = todayKey();
    if (S.today.date !== t) { S.today = { date: t, newIds: [] }; save(); }
  }
  ensureToday();
  function applyTheme() {
    const t = S.set.theme || "auto";
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }
  applyTheme();

  // ---------- spaced repetition (SM-2 lite) ----------
  function prog(id) { return S.p[id]; }
  function status(id) { const p = S.p[id]; return p ? p.s : 0; }
  function isDue(id, now) { const p = S.p[id]; return !!p && p.s > 0 && p.s < 3 && p.due <= (now || Date.now()); }
  function isDueMastered(id, now) { const p = S.p[id]; return !!p && p.s === 3 && p.due <= (now || Date.now()); }
  function rate(id, r) {
    // r: 0 没印象 / 1 模糊 / 2 掌握
    const now = Date.now();
    let p = S.p[id];
    const wasNew = !p;
    if (!p) p = S.p[id] = { s: 0, ef: 2.5, iv: 0, due: now, reps: 0, lapses: 0, last: 0 };
    p.last = now;
    if (r === 0) {
      p.s = 1; p.reps = 0; p.iv = 0; p.lapses += 1; p.ef = Math.max(1.3, p.ef - 0.2);
      p.due = now + 10 * 60000; // 10 分钟后，本次会话内还会再来一次
    } else if (r === 1) {
      p.s = p.s === 3 ? 2 : Math.max(1, p.s);
      p.iv = p.iv < 1 ? 1 : Math.max(1, Math.round(p.iv * 1.2));
      p.ef = Math.max(1.3, p.ef - 0.05);
      p.due = endOfDay(now + p.iv * DAY);
    } else {
      p.reps += 1;
      if (p.reps === 1) p.iv = 1;
      else if (p.reps === 2) p.iv = 3;
      else p.iv = Math.round(p.iv * p.ef);
      p.ef = Math.min(3.0, p.ef + 0.1);
      p.s = p.iv >= 21 ? 3 : 2;
      p.due = endOfDay(now + p.iv * DAY);
    }
    const t = todayKey();
    const l = S.log[t] || (S.log[t] = { n: 0, r: 0 });
    if (wasNew) l.n += 1; else if (r !== 0) l.r += 1;
    save();
  }
  function endOfDay(ts) { const d = new Date(ts); d.setHours(4, 0, 0, 0); return d.getTime(); } // 凌晨 4 点算新的一天
  function streak() {
    let n = 0; const d = new Date();
    if (!S.log[todayKey(d)]) d.setDate(d.getDate() - 1);
    while (S.log[todayKey(d)]) { n += 1; d.setDate(d.getDate() - 1); }
    return n;
  }
  function counts(deckKey) {
    const now = Date.now();
    const list = deckKey ? WORDS.filter((w) => w.deck === deckKey) : WORDS;
    const c = { total: list.length, learned: 0, mastered: 0, due: 0, fresh: 0 };
    list.forEach((w) => {
      const s = status(w.id);
      if (s > 0) c.learned += 1;
      if (s === 3) c.mastered += 1;
      if (s === 0) c.fresh += 1;
      if (isDue(w.id, now) || isDueMastered(w.id, now)) c.due += 1;
    });
    return c;
  }
  function remainingNewQuota() { ensureToday(); return Math.max(0, S.set.dailyNew - S.today.newIds.length); }

  // ---------- speech ----------
  let voices = [];
  function loadVoices() { try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; } }
  if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function pickVoice() {
    if (!voices.length) loadVoices();
    if (S.set.voice) { const v = voices.find((v) => v.name === S.set.voice); if (v) return v; }
    const pref = ["Samantha", "Ava", "Allison", "Zoe", "Nicky", "Evan", "Tom", "Aaron", "Google US English"];
    for (const n of pref) { const v = voices.find((v) => v.name.indexOf(n) === 0 && /en[-_]US/i.test(v.lang)); if (v) return v; }
    return voices.find((v) => /en[-_]US/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  }
  let speakingBtn = null;
  function speak(text, btn) {
    if (!("speechSynthesis" in window)) { toast("这台设备不支持语音朗读"); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = "en-US";
      u.rate = S.set.rate || 0.9;
      u.pitch = 1;
      if (speakingBtn) speakingBtn.classList.remove("speaking");
      speakingBtn = btn || null;
      if (btn) btn.classList.add("speaking");
      u.onend = u.onerror = () => { if (btn) btn.classList.remove("speaking"); if (speakingBtn === btn) speakingBtn = null; };
      speechSynthesis.speak(u);
    } catch (e) { toast("朗读失败"); }
  }

  // ---------- helpers ----------
  const $ = (sel, el) => (el || document).querySelector(sel);
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function attr(s) { return esc(s).replace(/\n/g, " "); }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function greeting() { const h = new Date().getHours(); return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }
  function dateLabel() { const d = new Date(); return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
  let toastTimer;
  function toast(msg) {
    let t = $(".toast"); if (t) t.remove();
    t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1800);
  }
  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.4 5.2L20 9l-4 3.9.9 5.6L12 15.8 7.1 18.5 8 12.9 4 9l5.6-.8z"/></svg>',
    library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5M20 18v3H6.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    heartOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  };
  function sayBtn(text, big) { return `<button class="say${big ? " big" : ""}" data-say="${attr(text)}" aria-label="朗读">${ICON.speaker}</button>`; }

  // ---------- navigation ----------
  const app = $("#app");
  let tab = "home";
  const overlays = []; // {el, onClose}
  function setTab(t) { tab = t; render(); window.scrollTo(0, 0); }
  function openOverlay(html, opts) {
    const el = document.createElement("div");
    el.className = "overlay";
    el.innerHTML = html;
    document.body.appendChild(el);
    const o = { el, onClose: opts && opts.onClose, mount: opts && opts.mount };
    overlays.push(o);
    try { history.pushState({ ov: overlays.length }, ""); } catch (e) {}
    if (o.mount) { try { o.mount(el); } catch (e) { console.error(e); el.innerHTML = `<div class="ov-top"><button class="iconbtn" data-close>${ICON.back}</button></div><div class="ov-body"><div class="empty"><div class="e">🫧</div>这一页打不开，请退出重试</div></div>`; } }
    return o;
  }
  function closeTop(fromPop) {
    const o = overlays.pop();
    if (!o) return;
    o.el.classList.add("closing");
    setTimeout(() => o.el.remove(), 220);
    if (o.onClose) o.onClose();
    if (!fromPop) { try { history.back(); } catch (e) {} }
  }
  window.addEventListener("popstate", () => { if (overlays.length) closeTop(true); });
  try { history.replaceState({ ov: 0 }, ""); } catch (e) {}

  // ---------- views ----------
  function render() {
    let html = "";
    if (tab === "home") html = viewHome();
    else if (tab === "library") html = viewLibrary();
    else if (tab === "search") html = viewSearch();
    else html = viewMe();
    app.innerHTML = `<div class="view">${html}</div>` + tabbar();
    if (tab === "search") { const i = $("#q"); if (i) { i.value = searchQ; renderSearchResults(); } }
  }
  function tabbar() {
    const t = (k, label) => `<button class="tab${tab === k ? " on" : ""}" data-tab="${k}">${ICON[k]}<span>${label}</span></button>`;
    return `<nav class="tabbar">${t("home", "今日")}${t("library", "词库")}${t("search", "搜索")}${t("me", "我的")}</nav>`;
  }

  function viewHome() {
    const c = counts();
    const quota = remainingNewQuota();
    const sessionSize = c.due + Math.min(quota, c.fresh);
    const st = streak();
    const wotd = WORDS[hashStr(todayKey()) % WORDS.length];
    let cta;
    if (sessionSize > 0) {
      cta = `<div class="big">今天的学习已经备好</div>
        <p>${c.due ? `${c.due} 个词到期复习` : "没有到期复习"} · ${Math.min(quota, c.fresh)} 个新词</p>
        <button class="btn light" data-act="study">开始学习 →</button>`;
    } else if (c.fresh === 0 && c.due === 0) {
      cta = `<div class="big">全部词库都学过了 🎉</div><p>到期的复习会自动出现在这里。也可以去词库里重温任意一组。</p><button class="btn light" data-tab="library">去词库看看</button>`;
    } else {
      cta = `<div class="big">今天的任务完成了 ✨</div><p>新词额度已用完，复习也清空了。想加练的话，去词库挑一组。</p><button class="btn light" data-act="extra">再来 5 个新词</button>`;
    }
    return `
      <div class="between">
        <div><div class="eyebrow">${esc(greeting())} · ${esc(dateLabel())}</div>
        <h1 class="brand">Crystal’s <em>English</em></h1></div>
        ${st ? `<span class="streak">🔥 ${st} 天</span>` : ""}
      </div>
      <div class="sub">为 Crystal 定制的职场英文语境库</div>
      <div class="card hero" style="margin-top:18px">${cta}</div>
      <div class="stats">
        <div class="stat"><b>${c.learned}</b><span>已学 / ${c.total}</span></div>
        <div class="stat"><b>${c.mastered}</b><span>已掌握</span></div>
        <div class="stat"><b>${c.due}</b><span>待复习</span></div>
      </div>
      <h2>今日一词 <small>Word of the day</small></h2>
      <button class="card wotd" data-word="${wotd.id}" style="--accent:${wotd.deckRef.color}">
        <div class="e">${wotd.emoji}</div>
        <div class="m"><div class="w">${esc(wotd.word)}</div><div class="g">${esc(wotd.gist)}</div></div>
        ${ICON.next.replace("<svg", '<svg width="20" height="20" style="color:var(--faint)"')}
      </button>
      <h2>词库 <small>${DECKS.length} 组 · ${WORDS.length} 词</small></h2>
      <div class="decks scroll">${DECKS.map(deckCard).join("")}</div>`;
  }

  function deckCard(d, wide) {
    const c = counts(d.key);
    const pct = c.total ? Math.round((c.learned / c.total) * 100) : 0;
    return `<button class="deck${wide ? " wide" : ""}" data-deck="${d.key}" style="--accent:${d.color}">
      <div><div class="t">${esc(d.title)}</div><div class="s">${esc(d.subtitle)}</div></div>
      <div><div class="bar"><i style="width:${pct}%"></i></div><div class="n">${c.learned}/${c.total} 已学${c.due ? ` · ${c.due} 待复习` : ""}</div></div>
      <span class="emo">${d.emoji}</span></button>`;
  }

  function viewLibrary() {
    return `<div class="eyebrow">Library</div><h1 class="brand">词库</h1>
      <div class="sub">按场景分组，每个词都带潜台词、邮件句和会议句。</div>
      <div class="decks" style="margin-top:18px">${DECKS.map((d) => deckCard(d)).join("")}</div>
      ${S.f.length ? `<h2>收藏 <small>${S.f.length} 词</small></h2><div class="wl">${S.f.map((id) => BY_ID[id]).filter(Boolean).map(wordItem).join("")}</div>` : ""}`;
  }

  function wordItem(w, hl) {
    if (typeof hl !== "string") hl = "";
    const s = status(w.id);
    const name = hl ? highlight(w.word, hl) : esc(w.word);
    const gist = hl ? highlight(w.gist, hl) : esc(w.gist);
    return `<button class="wi" data-word="${w.id}" style="--accent:${w.deckRef.color}">
      <div class="e">${w.emoji}</div>
      <div class="m"><div class="w">${name}</div><div class="g">${gist}</div></div>
      <span class="dot s${s}"></span></button>`;
  }
  function highlight(text, q) {
    const t = esc(text); if (!q) return t;
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    return t.replace(re, "<mark>$1</mark>");
  }

  let deckFilter = "all";
  function openDeck(key) {
    const d = DECK_BY_KEY[key];
    deckFilter = "all";
    const o = openOverlay("", { mount: (el) => renderDeck(el, d) });
    return o;
  }
  function renderDeck(el, d) {
    const c = counts(d.key);
    const quota = remainingNewQuota();
    let list = d.words;
    if (deckFilter === "new") list = list.filter((w) => status(w.id) === 0);
    else if (deckFilter === "learning") list = list.filter((w) => { const s = status(w.id); return s === 1 || s === 2; });
    else if (deckFilter === "mastered") list = list.filter((w) => status(w.id) === 3);
    else if (deckFilter === "fav") list = list.filter((w) => S.f.includes(w.id));
    const f = (k, label) => `<button class="chip ${deckFilter === k ? "on" : "neutral"}" data-filter="${k}">${label}</button>`;
    el.style.setProperty("--accent", d.color);
    el.innerHTML = `
      <div class="ov-top"><button class="iconbtn" data-close>${ICON.back}</button><div class="grow"></div></div>
      <div class="ov-body">
        <div class="deck wide" style="--accent:${d.color};width:100%;pointer-events:none">
          <div><div class="t" style="font-size:24px">${esc(d.title)}</div><div class="s">${esc(d.subtitle)} · ${c.total} 词</div></div>
          <div><div class="bar"><i style="width:${c.total ? Math.round((c.learned / c.total) * 100) : 0}%"></i></div><div class="n">${c.learned} 已学 · ${c.mastered} 已掌握 · ${c.due} 待复习</div></div>
          <span class="emo">${d.emoji}</span>
        </div>
        <p class="sub" style="margin:14px 2px 16px">${esc(d.intro)}</p>
        <div class="row">
          <button class="btn" data-act="study-deck" data-deck="${d.key}" style="flex:1">${c.due ? `复习 ${c.due} 个` : ""}${c.due && (quota || c.fresh) ? " + " : ""}${c.fresh ? `学 ${Math.min(Math.max(quota, 5), c.fresh)} 个新词` : ""}${!c.due && !c.fresh ? "重温一遍" : ""}</button>
          <button class="btn ghost" data-act="browse-deck" data-deck="${d.key}">浏览</button>
        </div>
        <div class="chips scroll" style="margin-top:18px">${f("all", "全部")}${f("new", "未学")}${f("learning", "学习中")}${f("mastered", "已掌握")}${f("fav", "收藏")}</div>
        <div class="legend"><span><i class="dot"></i>未学</span><span><i class="dot s1"></i>学习中</span><span><i class="dot s2"></i>复习中</span><span><i class="dot s3"></i>已掌握</span></div>
        <div class="wl">${list.length ? list.map(wordItem).join("") : '<div class="empty"><div class="e">🫧</div>这里还没有词</div>'}</div>
      </div>`;
    el.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => { deckFilter = b.dataset.filter; renderDeck(el, d); }));
  }

  // ---------- word detail ----------
  function wordDetail(w, opts) {
    opts = opts || {};
    const d = w.deckRef;
    const fav = S.f.includes(w.id);
    const rel = (w.related || []).map((r) => {
      const id = r.toLowerCase().replace(/\s+/g, "-");
      const t = BY_ID[id] || WORDS.find((x) => x.word.toLowerCase() === r.toLowerCase());
      return t ? `<button class="wchip link" data-word="${t.id}">${esc(r)} →</button>` : `<span class="wchip">${esc(r)}</span>`;
    }).join("");
    return `
      <div class="wd-head" style="--accent:${d.color}">
        <div class="scene">${w.emoji}</div>
        <div class="word">${esc(w.word)}</div>
        <div class="meta"><span class="pos">${esc(w.pos)}</span>${w.ipa ? `<span>${esc(w.ipa)}</span>` : ""}${sayBtn(w.word)}</div>
        <div class="gist">${esc(w.gist)}</div>
        <div class="tags"><span class="chip neutral">${d.emoji} ${esc(d.title)}</span>${(w.scene || []).map((s) => `<span class="chip neutral">${SCENE[s] || s}</span>`).join("")}<span class="chip neutral lvl">Lv${w.level} · ${LEVEL[w.level] || ""}</span></div>
      </div>
      <div class="sec"><div class="image"><div class="i">🖼️</div><div>${esc(w.image)}</div></div></div>
      <div class="sec"><div class="lab">潜台词 <em>· what they really mean</em></div><div class="nuance"><p>${esc(w.nuance)}</p></div></div>
      <div class="sec"><div class="lab">怎么用得更好 <em>· how to use it well</em></div><p>${esc(w.usage)}</p></div>
      <div class="sec"><div class="lab">语境示范 <em>· in context</em></div>
        <div class="ex"><div class="kind">📧 邮件里</div><div class="en">${sayBtn(w.email)}<span>${esc(w.email)}</span></div><div class="zh">${esc(w.emailZh)}</div></div>
        <div class="ex"><div class="kind">🗣️ 会议上</div><div class="en">${sayBtn(w.meeting)}<span>${esc(w.meeting)}</span></div><div class="zh">${esc(w.meetingZh)}</div></div>
      </div>
      ${w.upgrade ? `<div class="sec"><div class="lab">升级说法 <em>· level up</em></div><div class="upg"><div class="from">${esc(w.upgrade.from)}</div><div class="arrow">→</div><div class="to">${esc(w.upgrade.to)}</div><div class="why">${esc(w.upgrade.why)}</div></div></div>` : ""}
      ${(w.collocations || []).length ? `<div class="sec"><div class="lab">常见搭配 <em>· collocations</em></div><div class="chips">${w.collocations.map((c) => `<button class="wchip" data-say="${attr(c)}">${esc(c)}</button>`).join("")}</div></div>` : ""}
      ${rel ? `<div class="sec"><div class="lab">相关词 <em>· related</em></div><div class="chips">${rel}</div></div>` : ""}
      ${w.watchOut ? `<div class="sec"><div class="warn"><div>⚠️</div><div>${esc(w.watchOut)}</div></div></div>` : ""}
      ${opts.footer || ""}`;
  }
  function openWord(id, list) {
    const w = BY_ID[id]; if (!w) return;
    let idx = list ? list.indexOf(id) : -1;
    const o = openOverlay("", { mount: (el) => draw(el) });
    function draw(el) {
      const cur = list ? BY_ID[list[idx]] : w;
      const fav = S.f.includes(cur.id);
      el.style.setProperty("--accent", cur.deckRef.color);
      el.innerHTML = `
        <div class="ov-top"><button class="iconbtn" data-close>${ICON.back}</button><div class="grow"></div>
          ${list ? `<span class="counter">${idx + 1} / ${list.length}</span>` : ""}
          <button class="iconbtn${fav ? " on" : ""}" data-fav="${cur.id}">${fav ? ICON.heartOn : ICON.heart}</button></div>
        <div class="ov-body${list ? " has-bottom" : ""}">${wordDetail(cur)}</div>
        ${list ? `<div class="ov-bottom"><div class="row" style="max-width:640px;margin:0 auto"><button class="btn ghost" data-nav="-1" style="flex:1" ${idx <= 0 ? "disabled" : ""}>← 上一个</button><button class="btn" data-nav="1" style="flex:1" ${idx >= list.length - 1 ? "disabled" : ""}>下一个 →</button></div></div>` : ""}`;
      el.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => { idx += Number(b.dataset.nav); draw(el); $(".ov-body", el).scrollTop = 0; }));
      el.querySelector("[data-fav]").addEventListener("click", (ev) => { toggleFav(cur.id); draw(el); ev.stopPropagation(); });
    }
  }
  function toggleFav(id) {
    const i = S.f.indexOf(id);
    if (i >= 0) { S.f.splice(i, 1); toast("已取消收藏"); } else { S.f.push(id); toast("已收藏 ♥"); }
    save();
  }

  // ---------- study session ----------
  function buildSession(deckKey, extraNew) {
    ensureToday();
    const now = Date.now();
    const pool = deckKey ? WORDS.filter((w) => w.deck === deckKey) : WORDS;
    const due = shuffle(pool.filter((w) => isDue(w.id, now) || isDueMastered(w.id, now)));
    let quota = remainingNewQuota();
    if (extraNew) quota = extraNew;
    else if (deckKey) quota = Math.max(quota, 5);
    const fresh = pool.filter((w) => status(w.id) === 0).slice(0, quota);
    // 交错：先复习，再把新词均匀插进去
    const queue = due.slice();
    fresh.forEach((w, i) => { const pos = Math.min(queue.length, Math.round(((i + 1) * queue.length) / (fresh.length + 1)) + i); queue.splice(pos, 0, w); });
    return queue;
  }
  function startStudy(deckKey, extraNew) {
    const queue = buildSession(deckKey, extraNew);
    if (!queue.length) { toast("现在没有要学的词"); return; }
    const total = queue.length;
    const started = Date.now();
    let done = 0, learnedNew = 0, reviewed = 0, flipped = false, cur = null;
    const seenNew = new Set();
    const o = openOverlay("", { mount: (el) => { next(el); }, onClose: () => { speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel(); render(); } });
    function next(el) {
      cur = queue.shift();
      if (!cur) return finish(el);
      flipped = false;
      drawFront(el);
    }
    function head(el) {
      return `<div class="ov-top"><button class="iconbtn" data-close>${ICON.close}</button><div class="progress"><i style="width:${Math.round((done / total) * 100)}%"></i></div><span class="counter">${done} / ${total}</span></div>`;
    }
    function drawFront(el) {
      const isNew = status(cur.id) === 0;
      el.style.setProperty("--accent", cur.deckRef.color);
      el.innerHTML = head(el) + `
        <div class="ov-body">
          <div class="front">
            <div class="wd-head"><div class="scene">${cur.emoji}</div>
              <div class="word">${esc(cur.word)}</div>
              <div class="meta"><span class="pos">${esc(cur.pos)}</span>${cur.ipa ? `<span>${esc(cur.ipa)}</span>` : ""}${sayBtn(cur.word)}</div>
              <div class="tags"><span class="chip neutral">${isNew ? "✨ 新词" : "🔁 复习"}</span><span class="chip neutral">${cur.deckRef.emoji} ${esc(cur.deckRef.title)}</span></div>
            </div>
            <div class="q"><b>先想一想</b>${isNew ? "这个词在美国同事嘴里，通常是什么意思、带什么潜台词？" : "还记得它的潜台词和一句用法吗？"}</div>
            <div class="hint">想好了再翻开</div>
          </div>
        </div>
        <div class="ov-bottom"><button class="btn block" data-act="flip">翻开看看</button></div>`;
      el.querySelector('[data-act="flip"]').addEventListener("click", () => drawBack(el));
      const sb = el.querySelector(".say"); if (sb && S.set.autoSay !== false) setTimeout(() => speak(cur.word, sb), 250);
    }
    function drawBack(el) {
      flipped = true;
      el.innerHTML = head(el) + `<div class="ov-body has-bottom">${wordDetail(cur)}</div>
        <div class="ov-bottom"><div class="rate">
          <button class="r0" data-rate="0"><span class="e">😵</span>没印象<small>10 分钟后再来</small></button>
          <button class="r1" data-rate="1"><span class="e">🤔</span>有点模糊<small>明天再看</small></button>
          <button class="r2" data-rate="2"><span class="e">😎</span>掌握了<small>${nextLabel(cur.id)}</small></button>
        </div></div>`;
      el.querySelectorAll("[data-rate]").forEach((b) => b.addEventListener("click", () => {
        const r = Number(b.dataset.rate);
        const wasNew = status(cur.id) === 0;
        if (wasNew && !seenNew.has(cur.id)) { seenNew.add(cur.id); S.today.newIds.push(cur.id); learnedNew += 1; } else if (!wasNew) reviewed += 1;
        rate(cur.id, r);
        if (r === 0) queue.push(cur); else done += 1;
        if (r === 0 && queue.length === 1) toast("再看一遍就记住了");
        next(el);
        $(".ov-body", el) && ($(".ov-body", el).scrollTop = 0);
      }));
    }
    function nextLabel(id) {
      const p = prog(id);
      const reps = p ? p.reps + 1 : 1;
      const iv = reps === 1 ? 1 : reps === 2 ? 3 : Math.round((p.iv || 1) * p.ef);
      return iv >= 21 ? "标记为掌握" : `${iv} 天后复习`;
    }
    function finish(el) {
      const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
      confetti();
      el.innerHTML = `<div class="ov-top"><div class="grow"></div><button class="iconbtn" data-close>${ICON.close}</button></div>
        <div class="ov-body"><div class="done"><div class="e">💎</div><h2>漂亮，完成了</h2>
          <div class="sub">${learnedNew ? `新学 ${learnedNew} 个词` : ""}${learnedNew && reviewed ? " · " : ""}${reviewed ? `复习 ${reviewed} 个` : ""} · 用时约 ${mins} 分钟</div>
          <div class="stats" style="max-width:360px;margin:22px auto 0"><div class="stat"><b>${streak()}</b><span>连续天数</span></div><div class="stat"><b>${counts().learned}</b><span>累计已学</span></div><div class="stat"><b>${counts().mastered}</b><span>已掌握</span></div></div>
          <div style="margin-top:26px"><button class="btn" data-close>回到今日</button></div>
        </div></div>`;
    }
  }
  function confetti() {
    const c = document.createElement("div"); c.className = "confetti";
    const colors = ["#7C5CFF", "#F472B6", "#F59E0B", "#38BDF8", "#10B981"];
    for (let i = 0; i < 60; i++) { const s = document.createElement("i"); s.style.left = Math.random() * 100 + "vw"; s.style.background = colors[i % colors.length]; s.style.animationDelay = Math.random() * 0.8 + "s"; s.style.transform = `rotate(${Math.random() * 360}deg)`; c.appendChild(s); }
    document.body.appendChild(c); setTimeout(() => c.remove(), 3200);
  }

  // ---------- search ----------
  let searchQ = "", searchScene = "";
  function viewSearch() {
    return `<div class="eyebrow">Search</div><h1 class="brand">搜索</h1>
      <div class="search" style="margin-top:14px">${ICON.search.replace("<svg", '<svg width="20" height="20" style="color:var(--faint)"')}<input id="q" type="search" placeholder="词、中文意思、例句…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>
      <div class="chips scroll" style="margin-top:14px">${Object.keys(SCENE).map((k) => `<button class="chip ${searchScene === k ? "on" : "neutral"}" data-scene="${k}">${SCENE[k]}</button>`).join("")}</div>
      <div id="results" style="margin-top:14px"></div>`;
  }
  function renderSearchResults() {
    const box = $("#results"); if (!box) return;
    const q = searchQ.trim().toLowerCase();
    let list = WORDS;
    if (searchScene) list = list.filter((w) => (w.scene || []).includes(searchScene) || w.deck === searchScene);
    if (q) {
      const rank = (w) => {
        const word = w.word.toLowerCase();
        if (word === q) return 0;
        if (word.startsWith(q)) return 1;
        if (word.includes(q) || w.gist.toLowerCase().includes(q)) return 2;
        if ((w.collocations || []).some((c) => c.toLowerCase().includes(q))) return 3;
        if ([w.email, w.meeting, w.nuance, w.usage].some((t) => String(t).toLowerCase().includes(q))) return 4;
        return 9;
      };
      list = list.map((w) => [rank(w), w]).filter((x) => x[0] < 9).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    }
    if (!q && !searchScene) { box.innerHTML = `<div class="empty"><div class="e">🔎</div>输入英文或中文，或点上面的场景标签</div>`; return; }
    box.innerHTML = list.length ? `<div class="sub" style="margin-bottom:8px">${list.length} 个结果</div><div class="wl">${list.slice(0, 80).map((w) => wordItem(w, q)).join("")}</div>` : `<div class="empty"><div class="e">🫧</div>没找到「${esc(searchQ)}」</div>`;
  }

  // ---------- me / settings ----------
  function viewMe() {
    const c = counts();
    const days = Object.keys(S.log).length;
    const en = voices.filter((v) => /^en/i.test(v.lang));
    const seg = (vals, cur, key) => `<div class="seg">${vals.map((v) => `<button class="${String(v) === String(cur) ? "on" : ""}" data-set="${key}" data-val="${v}">${v}</button>`).join("")}</div>`;
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    return `<div class="eyebrow">Profile</div><h1 class="brand">Crystal</h1>
      <div class="sub">Director · Global Procurement · Lenovo</div>
      <div class="stats"><div class="stat"><b>${streak()}</b><span>连续天数</span></div><div class="stat"><b>${days}</b><span>学习天数</span></div><div class="stat"><b>${c.mastered}</b><span>已掌握</span></div></div>
      <h2>设置</h2>
      <div class="card">
        <div class="set"><div><div class="l">每日新词</div><div class="d">复习不限量，新词按这个额度</div></div>${seg([5, 10, 15, 20], S.set.dailyNew, "dailyNew")}</div>
        <div class="set"><div><div class="l">朗读语速</div><div class="d">${S.set.rate.toFixed(2)}x</div></div><input type="range" min="0.6" max="1.2" step="0.05" value="${S.set.rate}" data-range="rate"></div>
        <div class="set"><div><div class="l">发音人</div><div class="d">${en.length ? "iPhone 自带英语语音" : "等待系统加载语音"}</div></div><select data-select="voice"><option value="">自动 (en-US)</option>${en.map((v) => `<option value="${attr(v.name)}" ${S.set.voice === v.name ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")}</select></div>
        <div class="set"><div><div class="l">翻开前自动朗读</div></div>${seg(["开", "关"], S.set.autoSay === false ? "关" : "开", "autoSay")}</div>
        <div class="set"><div><div class="l">外观</div></div>${seg(["auto", "light", "dark"], S.set.theme || "auto", "theme")}</div>
      </div>
      <h2>离线与数据</h2>
      <div class="card">
        <div class="set"><div><div class="l">离线可用</div><div class="d">${sw ? "✓ 已缓存到本机，无网络也能用" : "首次打开后自动缓存"}</div></div><span class="chip ${sw ? "" : "neutral"}">${sw ? "就绪" : "准备中"}</span></div>
        <div class="set"><div><div class="l">词库</div><div class="d">${DECKS.length} 组 · ${WORDS.length} 词 · 全部内置</div></div></div>
        <div class="set"><div><div class="l danger">重置学习进度</div><div class="d">清空复习记录与收藏</div></div><button class="btn sm ghost danger" data-act="reset">重置</button></div>
      </div>
      <div class="foot"><b>Crystal’s English</b><br>Made with ♥ for Crystal · v1.0<br>纯离线 · 数据只保存在这台手机上</div>`;
  }

  // ---------- global event delegation ----------
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-say],[data-tab],[data-word],[data-deck],[data-act],[data-close],[data-set],[data-scene]");
    if (!t) return;
    if (t.dataset.say != null) { speak(t.dataset.say, t.classList.contains("say") ? t : null); return; }
    if (t.dataset.close != null) { closeTop(); return; }
    if (t.dataset.tab) { setTab(t.dataset.tab); return; }
    if (t.dataset.word) { openWord(t.dataset.word); return; }
    if (t.dataset.scene) { searchScene = searchScene === t.dataset.scene ? "" : t.dataset.scene; render(); return; }
    if (t.dataset.set) {
      const k = t.dataset.set, v = t.dataset.val;
      if (k === "dailyNew") S.set.dailyNew = Number(v);
      else if (k === "autoSay") S.set.autoSay = v === "开";
      else if (k === "theme") { S.set.theme = v; applyTheme(); }
      save(); render(); return;
    }
    if (t.dataset.deck && !t.dataset.act) { openDeck(t.dataset.deck); return; }
    const act = t.dataset.act;
    if (act === "study") startStudy();
    else if (act === "extra") startStudy(null, 5);
    else if (act === "study-deck") startStudy(t.dataset.deck);
    else if (act === "browse-deck") { const d = DECK_BY_KEY[t.dataset.deck]; openWord(d.words[0].id, d.words.map((w) => w.id)); }
    else if (act === "reset") { if (confirm("确定清空所有学习进度和收藏吗？")) { S = DEFAULT_STATE(); save(); render(); toast("已重置"); } }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.id === "q") { searchQ = t.value; renderSearchResults(); }
    else if (t.dataset.range === "rate") { S.set.rate = Number(t.value); save(); const d = t.closest(".set").querySelector(".d"); if (d) d.textContent = S.set.rate.toFixed(2) + "x"; }
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.select === "voice") { S.set.voice = t.value; save(); speak("Hello Crystal, this is your voice."); }
  });

  // ---------- service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then((reg) => {
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw && nw.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) toast("内容已更新，下次打开生效"); });
        });
      }).catch(() => {});
    });
  }

  if (!WORDS.length) { app.innerHTML = '<div class="view"><div class="empty"><div class="e">📭</div>词库还没加载</div></div>'; return; }
  render();
})();
