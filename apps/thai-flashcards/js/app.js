/* Thai 1000 flashcards: UI, session logic, persistence. Depends on THAI_WORDS, SM2, ThaiAudio. */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const STORE_KEY = "thai-flashcards-v1";
  const CAT_LABELS = { greetings: "Greetings", people: "People", numbers: "Numbers", time: "Time", questions: "Questions",
    grammar: "Grammar", verbs: "Verbs", adjectives: "Adjectives", food: "Food & drink", travel: "Travel", places: "Places",
    shopping: "Shopping", body: "Body & health", family: "Family", home: "Home", nature: "Nature", animals: "Animals",
    colors: "Colors", clothing: "Clothing", work: "Work & study", adverbs: "Adverbs", classifiers: "Classifiers",
    emergency: "Emergency", tech: "Tech", lesson: "Teacher lessons" };
  const DEFAULTS = { newPerDay: 20, front: "thai", autoplay: true, rate: 0.9, slowRate: 0.55, voiceURI: "",
    engine: "auto", categories: [], practiceSource: "queue", showRoman: true, browseBy: "roman" };
  const GRADES = [
    { q: 1, cls: "again", label: "Again", key: "1" },
    { q: 3, cls: "hard", label: "Hard", key: "2" },
    { q: 4, cls: "good", label: "Good", key: "3" },
    { q: 5, cls: "easy", label: "Easy", key: "4" }
  ];
  const MODES = {
    flash:   { ic: "🃏", name: "Flashcards", desc: "See the word, flip, grade yourself. The core SM-2 loop." },
    mc:      { ic: "🇹🇭", name: "Thai → English", desc: "Read (and hear) the Thai word, pick the meaning." },
    reverse: { ic: "🔁", name: "English → Thai", desc: "See the meaning, pick the Thai word." },
    listen:  { ic: "🎧", name: "Listening", desc: "Audio only. Pick the word you heard." },
    tone:    { ic: "🎵", name: "Tone drill", desc: "Hear a syllable, name its tone. Trains your ear for the 5 tones." }
  };

  const WORDS = THAI_WORDS.map((w, i) => ({ id: w[0], thai: w[0], roman: w[1], en: w[2], cat: w[3], idx: i, syl: SM2.analyze(w[1]) }));
  const BY_ID = Object.fromEntries(WORDS.map(w => [w.id, w]));
  const CATS = [...new Set(WORDS.map(w => w.cat))];
  // Teacher lessons: a sentence whose Thai already exists in the dictionary tags that word; others become new cards.
  const LESSONS = typeof THAI_LESSONS !== "undefined" ? THAI_LESSONS : [];
  const USAGE = typeof THAI_USAGE !== "undefined" ? THAI_USAGE : {};
  const USAGE_LABEL = { rare: "⚠ not in everyday use", formal: "formal · you'll hear it, not say it", note: "ⓘ spoken form differs" };
  const isDeprioritized = id => { const u = USAGE[id]; return !!u && (u.level === "rare" || u.level === "formal"); };
  const GLOSSARY = typeof THAI_GLOSSARY !== "undefined" ? THAI_GLOSSARY : [];
  const GLOSS_SKIP = new Set(typeof THAI_GLOSS_SPLIT !== "undefined" ? THAI_GLOSS_SPLIT : []);
  const LESSON_RANK = {}; let rankN = 0;
  const addLesson = (w, n) => { if (w.lesson == null) w.lesson = n; w.lessons = w.lessons || []; if (!w.lessons.includes(n)) w.lessons.push(n); };
  const rankOf = id => { if (!(id in LESSON_RANK)) LESSON_RANK[id] = rankN++; };
  // Pass 1: each lesson item becomes a card (or tags the matching dictionary word).
  for (const L of LESSONS) for (const it of L.items) {
    let w = BY_ID[it[0]];
    if (!w) { w = { id: it[0], thai: it[0], roman: it[1], en: it[2], cat: "lesson", idx: WORDS.length, syl: SM2.analyze(it[1]) }; WORDS.push(w); BY_ID[w.id] = w; }
    addLesson(w, L.lesson);
  }
  // Building blocks for the gloss: dictionary words and the glossary, never other lesson sentences.
  const GLOSS_INDEX = Gloss.buildIndex(WORDS.filter(w => w.cat !== "lesson").concat(GLOSSARY.map(g => ({ thai: g[0], roman: g[1], en: g[2] }))));
  // Pass 2: every word inside a lesson sentence gets its own lesson card, introduced just before the sentence.
  for (const L of LESSONS) for (const it of L.items) {
    const g = Gloss.gloss({ thai: it[0], roman: it[1] }, GLOSS_INDEX, { skip: GLOSS_SKIP });
    if (g) for (const part of g.parts) {
      if (part.unmatched || part.thai === "ๆ") continue;
      let w = BY_ID[part.thai];
      if (!w) { w = { id: part.thai, thai: part.thai, roman: part.roman, en: part.en, cat: "lesson", derived: true, idx: WORDS.length, syl: SM2.analyze(part.roman) }; WORDS.push(w); BY_ID[w.id] = w; }
      addLesson(w, L.lesson);
      w.inSentences = w.inSentences || [];
      if (!w.inSentences.includes(it[0])) w.inSentences.push(it[0]);
      rankOf(w.id);
    }
    rankOf(it[0]);
  }
  const ALL_IDS = WORDS.map(w => w.id);
  const lessonIds = n => WORDS.filter(w => w.lessons && w.lessons.includes(n)).map(w => w.id).sort((a, b) => LESSON_RANK[a] - LESSON_RANK[b]);
  const glossCache = {};
  function glossHtml(w) {
    if (!(w.id in glossCache)) glossCache[w.id] = Gloss.gloss(w, GLOSS_INDEX, { skip: GLOSS_SKIP });
    const g = glossCache[w.id];
    if (!g) return "";
    return `<div class="gloss">${g.parts.map(p => p.unmatched
      ? `<span class="gpart unmatched"><span class="gr">${esc(p.roman)}</span></span>`
      : `<button class="gpart" data-action="play" data-text="${esc(p.thai)}" title="Play this word"><span class="gt">${esc(p.thai)}</span><span class="gr">${romanHtml({ roman: p.roman, syl: SM2.analyze(p.roman) })}</span><span class="ge">${esc(p.en)}</span></button>`).join("")}</div>`;
  }
  // On a word card: the lesson sentences it comes from, tappable to hear them.
  function inLessonsHtml(w) {
    const ids = (w.inSentences || []).filter(id => id !== w.id).slice(0, 3);
    if (!ids.length) return "";
    return `<div class="in-lessons"><div class="meta">In your lessons</div>${ids.map(id => { const x = BY_ID[id]; return `<button class="inl" data-action="play" data-text="${esc(x.thai)}" title="Play the sentence"><span class="roman">${romanHtml(x)}</span><span class="en">${esc(x.en)}</span></button>`; }).join("")}</div>`;
  }
  const lessonBadge = w => w.lessons ? `<span class="badge prio" title="From lesson ${w.lessons.join(" and ")}">L${w.lessons.join("·")}</span>` : "";

  // ---------- persistence ----------
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.v === 1) { s.settings = Object.assign({}, DEFAULTS, s.settings); s.toneStats = s.toneStats || {}; s.log = s.log || {}; s.cards = s.cards || {}; return s; }
    } catch (e) { /* fall through */ }
    return { v: 1, cards: {}, log: {}, toneStats: {}, streak: { last: null, count: 0 }, settings: Object.assign({}, DEFAULTS) };
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast("Could not save progress (storage blocked?)"); } }
  const getCard = id => state.cards[id] || null;
  const ensureCard = id => state.cards[id] || (state.cards[id] = SM2.newCard(id));
  function dayLog(day) { day = day === undefined ? SM2.today() : day; return state.log[day] || (state.log[day] = { reviews: 0, correct: 0, new: 0 }); }
  function activeFilter() { const c = state.settings.categories; return c.length ? id => BY_ID[id].lesson != null || c.includes(BY_ID[id].cat) : () => true; }
  // Lesson cards are priority until mastered (6 correct answers in a row on the tight ladder).
  const isPriority = id => BY_ID[id].lesson != null && !SM2.isMastered(getCard(id));
  const frontFor = () => state.settings.front;
  function updateStreak(day) {
    const s = state.streak || (state.streak = { last: null, count: 0 });
    if (s.last === day) return;
    s.count = s.last === day - 1 ? s.count + 1 : 1;
    s.last = day;
  }
  function currentStreak() { const s = state.streak; if (!s || s.last == null) return 0; const d = SM2.today(); return (s.last === d || s.last === d - 1) ? s.count : 0; }

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  let toastTimer;
  function toast(msg, ms) { let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), ms || 3200); }
  function contourSvg(tone, w) { w = w || 48; return `<svg viewBox="0 0 60 40" width="${w}" height="${Math.round(w * 2 / 3)}" aria-hidden="true"><path d="${SM2.CONTOURS[tone]}" fill="none" stroke="${SM2.TONE_INFO[tone].color}" stroke-width="4" stroke-linecap="round"/></svg>`; }
  // Render romanization with tone colours, keeping the original separators: "-" inside a word, spaces between words.
  function romanHtml(word, hl, plain) {
    let i = 0;
    return word.roman.split(/(-|\s+)/).map(part => {
      if (part === "-") return '<span class="sep">-</span>';
      if (/^\s+$/.test(part)) return '<span class="sep">&nbsp;</span>';
      if (!part) return "";
      const s = word.syl[i], idx = i++;
      const isHl = hl === idx;
      const style = hl == null ? "" : (isHl ? "text-decoration:underline;text-underline-offset:6px;font-weight:700" : "opacity:.55");
      const text = plain && !isHl ? s.plain : (plain && isHl && !session.answered ? s.plain : s.text);
      return `<span class="syl tone-${hl == null || isHl ? s.tone : "mid"}" style="${style}">${esc(text)}</span>`;
    }).join("");
  }
  function toneChips(word) {
    return `<div class="tones">` + word.syl.map(s => `<div class="tone-chip">${contourSvg(s.tone, 40)}<div class="lbl"><span class="tone-${s.tone}">${esc(s.text)} · ${s.tone}</span><small>${SM2.TONE_INFO[s.tone].thai}</small></div></div>`).join("") + `</div>`;
  }
  function playBtns(word, opts) {
    opts = opts || {};
    return `<div class="audio-row">
      <button class="btn" data-action="play" data-text="${esc(word.thai)}" title="Play (P)">🔊 Play</button>
      <button class="btn" data-action="play" data-slow="1" data-text="${esc(word.thai)}" title="Slow (S)">🐢 Slow</button>
      ${opts.noRecord ? "" : `<button class="btn rec ${ThaiAudio.isRecording() ? "on" : ""}" data-action="record" title="Record yourself (R)">${ThaiAudio.isRecording() ? "■ Stop" : "● Record me"}</button>
      <button class="btn" data-action="playrec" ${ThaiAudio.hasRecording() ? "" : "disabled"} title="Play your recording">🎙 Me</button>`}
    </div>`;
  }
  function describeAudioError(m) {
    if (m.includes("no-speech-api")) return "This browser has no speech engine and online audio failed.";
    if (m.includes("no-thai-voice")) return "No Thai voice found in this browser. See Settings → Audio for how to install one.";
    if (m.includes("online-play-blocked") || m.includes("not-allowed")) return "The browser blocked playback. Tap Play again (first tap unlocks audio on iPhone).";
    if (m.includes("online-tts-failed")) return "Server audio failed and no Thai voice is installed on this device. See Settings → Audio → Diagnostics.";
    if (m.includes("audio-busy")) return "Speech engine is busy. Try again in a second.";
    if (m.includes("synthesis") || m.includes("unavailable")) return "The Thai voice failed to start. On iPhone check the ringer switch, or set engine to Online in Settings.";
    return "Audio error: " + m;
  }
  function play(text, slow) {
    const s = state.settings;
    ThaiAudio.speak(text, { rate: slow ? s.slowRate : s.rate, voiceURI: s.voiceURI, engine: s.engine })
      .then(() => { if (ui.audioTest) { ui.audioTest = false; render(); } })
      .catch(e => {
        const m = String(e && e.message || e);
        toast(describeAudioError(m), 6000);
        if (state.view === "settings") render();
      });
  }
  function stageBadge(card, word) { const st = SM2.stage(card); const w = word || (card ? BY_ID[card.id] : null); const prio = w && w.lesson != null && !SM2.isMastered(card); return `<span class="badge ${st}">${st}</span>${prio ? ' <span class="badge prio">priority</span>' : ""}${card && SM2.isLeech(card) ? ' <span class="badge leech">leech</span>' : ""}`; }
  function usagePill(w) { const u = USAGE[w.id]; return u ? `<div class="usage-pill ${u.level}">${USAGE_LABEL[u.level]}</div>` : ""; }
  function usageNote(w) { const u = USAGE[w.id]; if (!u) return ""; return `<div class="usage-note ${u.level}"><b>${USAGE_LABEL[u.level]}.</b> ${esc(u.note)}${u.use ? ` <span class="use">Say instead: <b>${esc(u.use)}</b></span>` : ""}</div>`; }
  function catBadge(w) { return `<span class="cat badge${w.lesson != null ? " prio" : ""}">${w.lesson != null ? "Lesson " + w.lesson : (CAT_LABELS[w.cat] || w.cat)}</span>`; }
  function dueText(card) { if (!card || !card.seen) return "new"; const d = card.due - SM2.today(); return d <= 0 ? "due now" : d === 1 ? "tomorrow" : "in " + d + " d"; }

  // ---------- session ----------
  let session = null;
  function startSession(kind, opts) {
    opts = opts || {};
    const filter = activeFilter();
    const day = SM2.today();
    let ids;
    const src = opts.source || (kind === "flash" ? "queue" : state.settings.practiceSource);
    const cap = n => n > 0 ? n : Infinity;
    if (src === "today") {
      ids = ALL_IDS.filter(id => filter(id) && getCard(id) && getCard(id).last === day);
    } else if (src === "ahead") {
      ids = ALL_IDS.filter(id => filter(id) && getCard(id) && getCard(id).seen && getCard(id).due > day && getCard(id).due <= day + (opts.days || 3))
        .sort((a, b) => getCard(a).due - getCard(b).due).slice(0, 60);
    } else if (src === "lesson") {
      const rank = id => { const c = getCard(id); return (SM2.isMastered(c) ? 1e6 : 0) - ((c ? c.lapses : 0) * 1000) + (c && c.seen ? Math.max(0, c.due - day) : 500); };
      ids = lessonIds(opts.lesson).sort((a, b) => rank(a) - rank(b));
    } else if (src === "category") {
      const cat = opts.category;
      const weight = id => { const c = getCard(id); return c && c.seen ? (c.lapses * 1000) + Math.max(0, 50 - (c.due - day)) : 0; };
      ids = ALL_IDS.filter(id => BY_ID[id].cat === cat).sort((a, b) => weight(b) - weight(a)).slice(0, opts.limit || 40);
    } else if (src === "queue") {
      const newAllowed = opts.extraNew != null ? opts.extraNew : Math.max(0, state.settings.newPerDay - dayLog(day).new);
      const q = SM2.buildQueue(state.cards, ALL_IDS, { priority: isPriority, deprioritize: isDeprioritized, priorityRank: id => LESSON_RANK[id] ?? Infinity, day, newLimit: newAllowed, filter });
      ids = opts.extraNew != null ? q.fresh : q.due.concat(q.fresh);
    }
    if (src === "today" || src === "ahead" || src === "category" || src === "lesson") { if (kind === "tone") ids = ids.filter(id => BY_ID[id].syl.length <= 3); }
    else if (src !== "queue") {
      let pool = ALL_IDS.filter(filter);
      if (src === "learned") pool = pool.filter(id => getCard(id) && getCard(id).seen);
      if (src === "hard") pool = pool.filter(id => getCard(id) && getCard(id).lapses > 0).sort((a, b) => getCard(b).lapses - getCard(a).lapses);
      if (kind === "tone") pool = pool.filter(id => BY_ID[id].syl.length <= 3);
      ids = src === "hard" ? pool.slice(0, 20) : shuffle(pool).slice(0, 20);
    }
    if (!ids.length) { toast(src === "queue" ? "Nothing due and today's new-card limit is reached. Pick an extra-study option below." : "No words match this source yet."); state.view = "home"; render(); return; }
    session = { kind, source: src, queue: ids, idx: 0, relearn: new Set(), flipped: false, answered: false, right: 0, wrong: 0, total: ids.length, start: Date.now(), q: null, current: null, shownAt: 0, lastResult: null };
    state.view = "session";
    nextCard();
  }
  function requeue(id) { session.queue.splice(Math.min(session.queue.length, session.idx + 3), 0, id); }
  function nextCard() {
    if (session.idx >= session.queue.length) { session.current = null; render(); return; }
    session.current = session.queue[session.idx];
    session.flipped = false; session.answered = false; session.lastResult = null; session.shownAt = Date.now();
    buildQuestion();
    render();
    const w = BY_ID[session.current];
    const front = frontFor(w);
    if (state.settings.autoplay && ui.interacted) {
      if (session.kind === "flash" && front !== "english") play(w.thai);
      else if (session.kind === "mc" || session.kind === "listen") play(w.thai);
      else if (session.kind === "tone") play(session.q.syllableThai || w.thai);
    }
  }
  function buildQuestion() {
    const w = BY_ID[session.current], k = session.kind;
    if (k === "flash") { session.q = null; return; }
    if (k === "tone") {
      const i = Math.floor(Math.random() * w.syl.length);
      session.q = { sylIndex: i, answer: w.syl[i].tone };
      return;
    }
    const keyOf = x => (k === "mc" ? x.en : x.thai);
    const used = new Set([keyOf(w)]);
    const pick = (pool, n) => { const out = []; for (const x of shuffle(pool.slice())) { if (out.length >= n) break; if (used.has(keyOf(x))) continue; used.add(keyOf(x)); out.push(x); } return out; };
    const others = WORDS.filter(x => x.id !== w.id);
    let d = pick(others.filter(x => x.cat === w.cat), 3);
    if (d.length < 3) d = d.concat(pick(others, 3 - d.length));
    session.q = { options: shuffle([w].concat(d)).map(x => x.id), answer: w.id };
  }
  function grade(id, q, extra) {
    const day = SM2.today();
    const prev = getCard(id);
    const wasNew = !prev || !prev.seen;
    const log = dayLog(day);
    const reviewedToday = prev && prev.last === day && !wasNew;
    if (session.relearn.has(id)) {
      log.reviews++;
      if (q >= 3) { session.relearn.delete(id); log.correct++; }
      else requeue(id);
    } else if (reviewedToday && q >= 3) {
      // Extra pass on a card already scheduled today: count it, but don't stretch the interval again.
      log.reviews++; log.correct++;
    } else {
      const wasPriority = isPriority(id);
      state.cards[id] = SM2.review(ensureCard(id), q, day);
      if (wasPriority) state.cards[id] = SM2.capPriority(state.cards[id], day);
      log.reviews++; if (q >= 3) log.correct++; if (wasNew) log.new++;
      if (q < 3) { session.relearn.add(id); requeue(id); }
    }
    if (extra && extra.tone) { const t = state.toneStats[extra.tone] || (state.toneStats[extra.tone] = { n: 0, ok: 0 }); t.n++; if (q >= 3) t.ok++; }
    if (q >= 3) session.right++; else session.wrong++;
    updateStreak(day);
    save();
  }
  function advance() { session.idx++; nextCard(); }
  function flip() {
    if (!session || session.flipped || !session.current) return;
    if (ThaiAudio.isRecording()) { ThaiAudio.stopRecording().then(() => render()); }
    session.flipped = true;
    render();
    // English-first cards: hear the answer as soon as it is revealed so you can compare with what you said.
    if (state.settings.autoplay && frontFor(BY_ID[session.current]) === "english") play(BY_ID[session.current].thai);
  }

  // ---------- views ----------
  const TABS = [["home", "Home"], ["session", "Study"], ["practice", "Practice"], ["browse", "Browse"], ["stats", "Stats"], ["settings", "Settings"]];
  function render() {
    const v = state.view || "home";
    $("#tabs").innerHTML = TABS.map(([k, l]) => `<button data-action="nav" data-view="${k}" class="${v === k ? "active" : ""}">${l}</button>`).join("");
    const due = SM2.buildQueue(state.cards, ALL_IDS, { priority: isPriority, deprioritize: isDeprioritized, priorityRank: id => LESSON_RANK[id] ?? Infinity, day: SM2.today(), newLimit: 0, filter: activeFilter() }).due.length;
    $("#headerRight").innerHTML = `<span class="badge">${due} due</span><span class="badge">🔥 ${currentStreak()}</span>`;
    const views = { home: viewHome, session: viewSession, practice: viewPractice, browse: viewBrowse, stats: viewStats, settings: viewSettings };
    $("#main").innerHTML = (views[v] || viewHome)();
    if (v === "browse") { const inp = $("#search"); if (inp && ui.focusSearch) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); ui.focusSearch = false; } }
  }

  function counts() {
    const c = { new: 0, learning: 0, young: 0, mature: 0, relearning: 0 };
    for (const id of ALL_IDS) c[SM2.stage(getCard(id))]++;
    return c;
  }
  function viewHome() {
    const day = SM2.today(), log = dayLog(day), c = counts();
    const q = SM2.buildQueue(state.cards, ALL_IDS, { priority: isPriority, deprioritize: isDeprioritized, priorityRank: id => LESSON_RANK[id] ?? Infinity, day, newLimit: Math.max(0, state.settings.newPerDay - log.new), filter: activeFilter() });
    const acc = log.reviews ? Math.round(100 * log.correct / log.reviews) : null;
    const lessonFresh = q.fresh.filter(id => BY_ID[id].lesson != null).length;
    const lessonDue = q.due.filter(id => BY_ID[id].lesson != null).length;
    return `
      <div class="grid">
        <div class="tile"><div class="k">Due now</div><div class="v">${q.due.length}</div></div>
        <div class="tile"><div class="k">New today</div><div class="v">${q.fresh.length - lessonFresh}<small>of ${state.settings.newPerDay}${lessonFresh ? " + " + lessonFresh + " lesson" : ""}</small></div></div>
        <div class="tile"><div class="k">Reviews today</div><div class="v">${log.reviews}${acc != null ? `<small>${acc}% right</small>` : ""}</div></div>
        <div class="tile"><div class="k">Learned</div><div class="v">${c.learning + c.young + c.mature + c.relearning}<small>/ ${ALL_IDS.length}</small></div></div>
        ${LESSONS.length ? `<div class="tile"><div class="k">Lesson cards mastered</div><div class="v">${lessonStats().mastered}<small>/ ${lessonStats().total}</small></div></div>` : ""}
      </div>
      <div class="panel">
        <h2>Today's session</h2>
        <p>${q.due.length} due review${q.due.length === 1 ? "" : "s"}${lessonDue ? " (" + lessonDue + " from lessons)" : ""}${lessonFresh ? ", " + lessonFresh + " new lesson sentence" + (lessonFresh === 1 ? "" : "s") : ""} and ${q.fresh.length - lessonFresh} new word${q.fresh.length - lessonFresh === 1 ? "" : "s"}. Lesson cards come first. Wrong answers come back within the same session and again tomorrow.</p>
        <div class="row" style="margin-top:12px">
          ${q.due.length + q.fresh.length ? `<button class="btn primary" data-action="start" data-kind="flash">▶ Study flashcards</button>
          <button class="btn" data-action="start" data-kind="mc">Quiz the queue</button>` : `<span class="meta">All caught up for today. Keep going with the options below.</span>`}
        </div>
      </div>
      ${lessonsPanel()}
      ${extraStudyPanel()}
      <div class="panel">
        <h2>How it works</h2>
        <p><b>SM-2</b> (the SuperMemo 2 algorithm): every card has an easiness factor starting at 2.5. Grade it <i>Good</i> and the interval goes 1 day → 6 days → interval × EF. Grade it <i>Again</i> and it restarts from 1 day, its EF drops, and it is re-queued a few cards later in the same session. Cards with the most lapses are shown first when due.</p>
        <p><b>Usage marks</b>: <span class="tone-falling">⚠ not in everyday use</span> flags textbook forms Thais don't say (the card tells you what to say instead); <span class="tone-high">formal</span> marks words you'll read or hear but wouldn't say. Both are introduced only after everything else. <span class="tone-low">ⓘ</span> notes where the spoken form differs from the written one.</p>
        <p><b>Tones</b>: the romanization carries one tone mark per syllable — <span class="tone-low">à low</span>, <span class="tone-falling">â falling</span>, <span class="tone-high">á high</span>, <span class="tone-rising">ǎ rising</span>, plain = mid. Press 🔊 to hear the word, 🐢 for a slow version, ● to record yourself and compare.</p>
        <div class="tones" style="justify-content:flex-start">${SM2.TONES.map(t => `<div class="tone-chip">${contourSvg(t, 40)}<div class="lbl"><span class="tone-${t}">${t}</span><small>${SM2.TONE_INFO[t].thai}</small></div></div>`).join("")}</div>
      </div>`;
  }

  function lessonStats(n) {
    const ids = n == null ? WORDS.filter(w => w.lesson != null).map(w => w.id) : lessonIds(n);
    const cards = ids.map(getCard);
    return { total: ids.length, seen: cards.filter(c => c && c.seen).length, mastered: cards.filter(SM2.isMastered).length,
      priorityDue: ids.filter(id => isPriority(id) && (!getCard(id) || !getCard(id).seen || getCard(id).due <= SM2.today())).length };
  }
  function lessonsPanel() {
    if (!LESSONS.length) return "";
    return `<div class="panel">
      <h2>Teacher lessons</h2>
      <p>Lesson sentences jump the queue and repeat on a tight ladder (1, 2, 4, 7, 14, 30 days) until you have said each one right six times in a row. A slip restarts the ladder. Mastered sentences settle into the normal schedule. Every word inside a lesson sentence also gets its own card, introduced just before the sentence, with the sentences it comes from shown on its back. The direction switch on the study screen applies to lesson cards too; Speak starts English-first, Read starts Thai-first.</p>
      <div class="list" style="margin-top:10px">${LESSONS.map(L => { const st = lessonStats(L.lesson); const pct = st.total ? Math.round(100 * st.mastered / st.total) : 0; return `<div class="wrow">
        <div class="main" style="flex-direction:column;align-items:stretch;gap:6px"><div><b>Lesson ${L.lesson}</b> · ${esc(L.title)} <span class="meta">${st.total} cards · ${st.seen} seen · ${st.mastered} mastered${st.priorityDue ? " · " + st.priorityDue + " to practise now" : ""}</span></div><div class="progress"><div style="width:${pct}%"></div></div></div>
        <div class="right"><button class="btn sm" data-action="start" data-kind="flash" data-source="lesson" data-lesson="${L.lesson}" data-front="english" title="English first: say the Thai, flip to check">🗣 Speak</button><button class="btn sm" data-action="start" data-kind="flash" data-source="lesson" data-lesson="${L.lesson}" data-front="thai" title="Thai first: read it, flip for the meaning">📖 Read</button><button class="btn sm" data-action="start" data-kind="listen" data-source="lesson" data-lesson="${L.lesson}">🎧 Listen</button><button class="btn sm" data-action="start" data-kind="reverse" data-source="lesson" data-lesson="${L.lesson}">EN→ไทย quiz</button></div></div>`; }).join("")}</div>
    </div>`;
  }
  function extraStudyPanel() {
    const day = SM2.today(), filter = activeFilter();
    const today = ALL_IDS.filter(id => filter(id) && getCard(id) && getCard(id).last === day).length;
    const ahead = ALL_IDS.filter(id => filter(id) && getCard(id) && getCard(id).seen && getCard(id).due > day && getCard(id).due <= day + 3).length;
    const unseen = ALL_IDS.filter(id => filter(id) && !(getCard(id) && getCard(id).seen)).length;
    const kind = ui.extraKind || "flash";
    return `<div class="panel">
      <h2>Extra study</h2>
      <p>Go beyond today's schedule. Repeating a card you already reviewed today won't stretch its interval again, but getting it wrong still resets it, so the spacing stays honest.</p>
      <div class="row" style="margin:8px 0 12px"><label>Mode&nbsp;<select data-input="extraKind">${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${kind === k ? "selected" : ""}>${m.ic} ${m.name}</option>`).join("")}</select></label></div>
      <div class="row">
        <button class="btn" data-action="start" data-kind="${kind}" data-source="today" ${today ? "" : "disabled"}>🔁 Review today's ${today} card${today === 1 ? "" : "s"} again</button>
        <button class="btn" data-action="start" data-kind="${kind}" data-source="ahead" ${ahead ? "" : "disabled"}>⏩ Study ahead (${ahead} due in 3 days)</button>
        <button class="btn" data-action="start" data-kind="flash" data-extra="10" ${unseen ? "" : "disabled"}>＋ 10 new words</button>
        <button class="btn" data-action="start" data-kind="flash" data-extra="25" ${unseen ? "" : "disabled"}>＋ 25 new words</button>
      </div>
      <div class="row" style="margin-top:10px"><label>Drill a category&nbsp;<select data-input="extraCat"><option value="">choose…</option>${CATS.map(c => `<option value="${c}" ${ui.extraCat === c ? "selected" : ""}>${CAT_LABELS[c] || c} (${WORDS.filter(w => w.cat === c).length})</option>`).join("")}</select></label>
        <button class="btn" data-action="start" data-kind="${kind}" data-source="category" ${ui.extraCat ? "" : "disabled"}>▶ Drill ${ui.extraCat ? (CAT_LABELS[ui.extraCat] || ui.extraCat) : "category"}</button></div>
    </div>`;
  }

  function viewPractice() {
    const src = state.settings.practiceSource;
    return `
      <div class="panel">
        <h2>Practice modes</h2>
        <p>Every answer feeds the scheduler: a wrong answer pushes the card back to tomorrow, a right one advances it.</p>
        <div class="row" style="margin:10px 0 14px">
          <label>Words from&nbsp;
            <select data-setting="practiceSource">
              <option value="queue" ${src === "queue" ? "selected" : ""}>today's queue (due + new)</option>
              <option value="learned" ${src === "learned" ? "selected" : ""}>words I've seen (random 20)</option>
              <option value="hard" ${src === "hard" ? "selected" : ""}>my hardest words (most lapses)</option>
              <option value="all" ${src === "all" ? "selected" : ""}>all 1000 (random 20)</option>
            </select></label>
        </div>
        <div class="mode-grid">
          ${Object.entries(MODES).map(([k, m]) => `<button class="mode" data-action="start" data-kind="${k}"><div class="ic">${m.ic}</div><b>${m.name}</b><span>${m.desc}</span></button>`).join("")}
        </div>
      </div>`;
  }

  function viewSession() {
    if (!session) return viewPractice();
    if (!session.current) {
      const mins = Math.max(1, Math.round((Date.now() - session.start) / 60000));
      const q = SM2.buildQueue(state.cards, ALL_IDS, { priority: isPriority, deprioritize: isDeprioritized, priorityRank: id => LESSON_RANK[id] ?? Infinity, day: SM2.today(), newLimit: 0, filter: activeFilter() });
      return `<div class="panel done">
        <div class="big">🎉 Session complete</div>
        <p>${session.right} right · ${session.wrong} wrong · ${session.total} cards · ${mins} min</p>
        <p>${q.due.length ? q.due.length + " cards still due today." : "Nothing else is due today. Come back tomorrow, the schedule does the rest."}</p>
        <div class="row" style="justify-content:center;margin-top:12px">
          ${q.due.length ? `<button class="btn primary" data-action="start" data-kind="${session.kind}">Continue</button>` : ""}
          <button class="btn" data-action="nav" data-view="practice">Practice modes</button>
          <button class="btn" data-action="nav" data-view="home">Home</button>
        </div></div>${lessonsPanel()}${extraStudyPanel()}`;
    }
    const w = BY_ID[session.current], card = getCard(w.id);
    const fronts = [["thai", "ไทย → EN"], ["english", "EN → ไทย"], ["audio", "🔊 → ไทย"]];
    const dirSwitch = session.kind === "flash" ? `<span class="seg">${fronts.map(f => `<button class="${state.settings.front === f[0] ? "on" : ""}" data-action="front" data-front="${f[0]}" title="Card front">${f[1]}</button>`).join("")}</span>` : "";
    const bar = `<div class="session-bar"><span>${MODES[session.kind].name}</span>${dirSwitch}<div class="progress"><div style="width:${Math.round(100 * session.idx / session.queue.length)}%"></div></div><span>${session.idx + 1} / ${session.queue.length}</span>${session.relearn.size ? `<span class="badge leech">${session.relearn.size} relearning</span>` : ""}<button class="btn sm ghost" data-action="end">End</button></div>`;
    if (session.kind === "flash") return bar + viewFlash(w, card);
    if (session.kind === "tone") return bar + viewTone(w, card);
    return bar + viewChoice(w, card);
  }

  function cardBack(w, card, opts) {
    return `<div class="card">
      ${catBadge(w)}<span class="stage">${stageBadge(card, w)}</span>
      <div class="thai">${esc(w.thai)}</div>
      <div class="roman">${romanHtml(w)}</div>
      ${toneChips(w)}
      <div class="en">${esc(w.en)}</div>
      ${glossHtml(w)}
      ${inLessonsHtml(w)}
      ${usageNote(w)}
      ${playBtns(w, opts)}
      <div class="meta">${card && card.seen ? `interval ${card.interval} d · EF ${card.ef.toFixed(2)} · ${card.lapses} lapse${card.lapses === 1 ? "" : "s"} · ${card.correct}/${card.seen} right` : "first time seeing this card"}</div>
    </div>`;
  }
  function viewFlash(w, card) {
    const front = frontFor(w);
    if (!session.flipped) {
      let inner;
      if (front === "english") inner = `<div class="en prompt">${esc(w.en)}</div><div class="meta">${w.lesson != null ? "lesson sentence · " : ""}say it in Thai, then flip to check</div><div class="audio-row"><button class="btn rec ${ThaiAudio.isRecording() ? "on" : ""}" data-action="record" title="Record yourself (R)">${ThaiAudio.isRecording() ? "■ Stop" : "● Record me"}</button></div>`;
      else if (front === "audio") inner = `<button class="speaker" data-action="play" data-text="${esc(w.thai)}" title="Play">🔊</button><div class="meta">listen, then flip</div>`;
      else inner = `<div class="thai">${esc(w.thai)}</div>${state.settings.showRoman ? `<div class="roman">${romanHtml(w)}</div>` : ""}${playBtns(w, { noRecord: true })}`;
      return `<div class="card clickable" data-action="flip">${catBadge(w)}<span class="stage">${stageBadge(card, w)}</span>${usagePill(w)}${inner}<div class="hint">tap or press space to flip</div></div>
        <div class="kbd-help">Space flip · P play · S slow</div>`;
    }
    const base = card && card.seen ? card : SM2.newCard(w.id);
    const relearn = session.relearn.has(w.id);
    return cardBack(w, card) + `<div class="grades">${GRADES.map(g => {
      const iv = relearn ? (g.q >= 3 ? "leave relearn" : "again soon") : ((isPriority(w.id) ? SM2.capPriority(SM2.review(base, g.q)).interval : SM2.previewInterval(base, g.q)) + " d");
      return `<button class="${g.cls}" data-action="grade" data-q="${g.q}"><span>${g.label}</span><small>${iv}</small><kbd>${g.key}</kbd></button>`;
    }).join("")}</div><div class="kbd-help">1 again · 2 hard · 3 good · 4 easy · P play · S slow · R record</div>`;
  }
  function viewChoice(w, card) {
    const k = session.kind, q = session.q;
    let prompt;
    if (k === "mc") prompt = `<div class="thai">${esc(w.thai)}</div>${state.settings.showRoman ? `<div class="roman">${romanHtml(w)}</div>` : ""}${playBtns(w, { noRecord: true })}`;
    else if (k === "reverse") prompt = `<div class="en prompt">${esc(w.en)}</div>`;
    else prompt = `<button class="speaker" data-action="play" data-text="${esc(w.thai)}">🔊</button><div class="audio-row"><button class="btn sm" data-action="play" data-slow="1" data-text="${esc(w.thai)}">🐢 Slow</button></div><div class="meta">which word did you hear?</div>`;
    const opts = q.options.map((id, i) => {
      const o = BY_ID[id];
      let cls = "";
      if (session.answered) { if (id === q.answer) cls = "correct"; else if (id === session.lastResult) cls = "wrong"; }
      const label = k === "mc" ? esc(o.en) : `<span class="thai">${esc(o.thai)}</span>${session.answered && state.settings.showRoman ? `<span class="roman" style="font-size:.9rem">${romanHtml(o)}</span>` : ""}`;
      return `<button class="${cls}" data-action="choose" data-id="${esc(id)}" ${session.answered ? "disabled" : ""}><kbd>${i + 1}</kbd>${label}</button>`;
    }).join("");
    let fb = "";
    if (session.answered) {
      const ok = session.lastResult === q.answer;
      fb = `<div class="feedback ${ok ? "ok" : "bad"}"><div class="title">${ok ? "✔ Correct" : "✘ Not quite"}</div>
        <div class="thai small">${esc(w.thai)}</div><div class="roman">${romanHtml(w)}</div>${toneChips(w)}<div class="en">${esc(w.en)}</div>${glossHtml(w)}${inLessonsHtml(w)}${usageNote(w)}${playBtns(w)}
        <button class="btn primary" data-action="next">Continue ⏎</button></div>`;
    }
    return `<div class="card">${catBadge(w)}<span class="stage">${stageBadge(card, w)}</span>${usagePill(w)}${prompt}</div><div class="options">${opts}</div>${fb}<div class="kbd-help">1–4 choose · P play · ⏎ continue</div>`;
  }
  function viewTone(w, card) {
    const q = session.q, s = w.syl[q.sylIndex];
    const chips = SM2.TONES.map((t, i) => {
      let cls = "";
      if (session.answered) { if (t === q.answer) cls = "correct"; else if (t === session.lastResult) cls = "wrong"; }
      return `<button class="tone-chip big ${cls}" data-action="tone" data-tone="${t}" ${session.answered ? "disabled" : ""}>${contourSvg(t, 56)}<div class="lbl"><span class="tone-${t}">${t}</span><small>${SM2.TONE_INFO[t].thai} · ${i + 1}</small></div></button>`;
    }).join("");
    const shownRoman = romanHtml(w, q.sylIndex, true);
    let fb = "";
    if (session.answered) {
      const ok = session.lastResult === q.answer;
      fb = `<div class="feedback ${ok ? "ok" : "bad"}"><div class="title">${ok ? "✔ " + s.tone + " tone" : "✘ It was the " + s.tone + " tone (" + SM2.TONE_INFO[s.tone].thai + ")"}</div>
        <div class="roman">${romanHtml(w)}</div>${toneChips(w)}<div class="en">${esc(w.en)}</div>${playBtns(w)}<button class="btn primary" data-action="next">Continue ⏎</button></div>`;
    }
    return `<div class="card">${catBadge(w)}<span class="stage">${stageBadge(card, w)}</span>
      <div class="thai">${esc(w.thai)}</div>
      <div class="roman">${shownRoman}</div>
      <div class="meta">what tone is the underlined syllable?</div>
      ${playBtns(w, { noRecord: true })}</div>
      <div class="tones" style="margin-top:14px">${chips}</div>${fb}<div class="kbd-help">1–5 choose tone · P play · S slow · ⏎ continue</div>`;
  }

  const ui = { search: "", cat: "", stage: "", lesson: "", shown: 150, focusSearch: false, interacted: false, audioTest: false };
  const sortKey = {
    roman: w => SM2.stripTone(w.roman).toLowerCase().replace(/[^a-z ]/g, "").trim(),
    en: w => w.en.toLowerCase().replace(/[()"'?!.,…]/g, "").replace(/^(to|a|an|the)\s+/, "").trim()
  };
  function viewBrowse() {
    const by = state.settings.browseBy === "en" ? "en" : "roman";
    const term = ui.search.trim().toLowerCase();
    const termPlain = SM2.stripTone(term);
    let rows = WORDS;
    if (ui.lesson === "any") rows = rows.filter(w => w.lessons);
    else if (ui.lesson === "none") rows = rows.filter(w => !w.lessons);
    else if (ui.lesson) rows = rows.filter(w => w.lessons && w.lessons.includes(Number(ui.lesson)));
    if (ui.cat) rows = rows.filter(w => w.cat === ui.cat);
    if (ui.stage) rows = rows.filter(w => SM2.stage(getCard(w.id)) === ui.stage || (ui.stage === "leech" && getCard(w.id) && SM2.isLeech(getCard(w.id))) || (ui.stage.startsWith("usage:") && USAGE[w.id] && USAGE[w.id].level === ui.stage.slice(6)));
    if (term) rows = rows.filter(w => w.thai.includes(term) || SM2.stripTone(w.roman).includes(termPlain) || w.en.toLowerCase().includes(term));
    const keyed = rows.map(w => [sortKey[by](w), w]).sort((a, b) => a[0].localeCompare(b[0]));
    const total = keyed.length, shown = keyed.slice(0, ui.shown);
    let lastLetter = "";
    const list = shown.map(([k, w]) => {
      const c = getCard(w.id);
      const letter = /^[a-z]/.test(k) ? k[0].toUpperCase() : "#";
      const head = letter !== lastLetter ? `<div class="letter">${letter}</div>` : "";
      lastLetter = letter;
      const main = by === "en"
        ? `<div class="bh en-h">${esc(w.en)}</div><div class="bs"><span class="roman">${romanHtml(w)}</span><span class="thai-s">${esc(w.thai)}</span></div>`
        : `<div class="bh roman">${romanHtml(w)}</div><div class="bs"><span class="en">${esc(w.en)}</span><span class="thai-s">${esc(w.thai)}</span></div>`;
      return `${head}<div class="wrow"><div class="main brow">${main}</div>
        <div class="right">${lessonBadge(w)}${USAGE[w.id] ? `<span class="badge usage-${USAGE[w.id].level}" title="${esc(USAGE[w.id].note)}">${USAGE[w.id].level}</span>` : ""}<span class="due">${dueText(c)}</span>${stageBadge(c, w)}<button class="btn icon" data-action="play" data-text="${esc(w.thai)}" title="Play">🔊</button></div></div>`;
    }).join("");
    return `<div class="toolbar">
        <span class="seg"><button class="${by === "roman" ? "on" : ""}" data-action="browseBy" data-by="roman">Romanized A–Z</button><button class="${by === "en" ? "on" : ""}" data-action="browseBy" data-by="en">English A–Z</button></span>
        <input type="search" id="search" placeholder="${by === "en" ? "Search English, romanization or Thai…" : "Search romanization, English or Thai…"}" value="${esc(ui.search)}" data-input="search">
      </div>
      <div class="toolbar">
        <select data-input="lesson"><option value="">All words</option>${LESSONS.map(L => `<option value="${L.lesson}" ${ui.lesson === String(L.lesson) ? "selected" : ""}>Lesson ${L.lesson}: ${esc(L.title)}</option>`).join("")}<option value="any" ${ui.lesson === "any" ? "selected" : ""}>Any lesson</option><option value="none" ${ui.lesson === "none" ? "selected" : ""}>Not from a lesson</option></select>
        <select data-input="cat"><option value="">All categories</option>${CATS.filter(c => c !== "lesson").map(c => `<option value="${c}" ${ui.cat === c ? "selected" : ""}>${CAT_LABELS[c] || c}</option>`).join("")}</select>
        <select data-input="stage"><option value="">Any stage</option>${["new", "learning", "relearning", "young", "mature", "leech"].map(s => `<option value="${s}" ${ui.stage === s ? "selected" : ""}>${s}</option>`).join("")}<option disabled>──</option><option value="usage:rare" ${ui.stage === "usage:rare" ? "selected" : ""}>⚠ not in everyday use</option><option value="usage:formal" ${ui.stage === "usage:formal" ? "selected" : ""}>formal / heard not said</option><option value="usage:note" ${ui.stage === "usage:note" ? "selected" : ""}>ⓘ spoken form differs</option></select>
      </div>
      <p class="meta" style="margin:0 0 10px">${total} word${total === 1 ? "" : "s"}${total > shown.length ? `, showing ${shown.length}` : ""}</p>
      <div class="list">${list}</div>
      ${total > shown.length ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" data-action="more">Show ${Math.min(150, total - shown.length)} more</button></div>` : ""}`;
  }

  function viewStats() {
    const day = SM2.today(), c = counts();
    let reviews = 0, correct = 0;
    for (const d in state.log) { reviews += state.log[d].reviews; correct += state.log[d].correct; }
    const hist = []; for (let i = 13; i >= 0; i--) { const l = state.log[day - i] || { reviews: 0, correct: 0, new: 0 }; hist.push({ d: day - i, ...l }); }
    const maxH = Math.max(1, ...hist.map(h => h.reviews));
    const fc = SM2.forecast(state.cards, 7, day); const maxF = Math.max(1, ...fc);
    const hard = ALL_IDS.map(getCard).filter(x => x && x.lapses > 0).sort((a, b) => b.lapses - a.lapses || a.ef - b.ef).slice(0, 10);
    const dayName = d => new Date(d * SM2.DAY_MS).toLocaleDateString(undefined, { weekday: "short" });
    return `<div class="grid">
        <div class="tile"><div class="k">New</div><div class="v">${c.new}</div></div>
        <div class="tile"><div class="k">Learning</div><div class="v">${c.learning + c.relearning}</div></div>
        <div class="tile"><div class="k">Young (&lt;21 d)</div><div class="v">${c.young}</div></div>
        <div class="tile"><div class="k">Mature</div><div class="v">${c.mature}</div></div>
        <div class="tile"><div class="k">Total reviews</div><div class="v">${reviews}<small>${reviews ? Math.round(100 * correct / reviews) + "% right" : ""}</small></div></div>
        <div class="tile"><div class="k">Streak</div><div class="v">🔥 ${currentStreak()}<small>days</small></div></div>
      </div>
      <div class="panel"><h2>Reviews, last 14 days</h2><div class="bars">${hist.map(h => `<div class="bar ${h.d === day ? "today" : ""}" title="${h.reviews} reviews, ${h.new} new"><div style="height:${Math.round(100 * h.reviews / maxH)}%"></div><span>${h.reviews || ""}</span></div>`).join("")}</div></div>
      <div class="panel"><h2>Due in the next 7 days</h2><div class="bars">${fc.map((n, i) => `<div class="bar ${i === 0 ? "today" : ""}"><div style="height:${Math.round(100 * n / maxF)}%"></div><span>${i === 0 ? "today" : dayName(day + i)} ${n}</span></div>`).join("")}</div></div>
      ${LESSONS.length ? `<div class="panel"><h2>Teacher lessons</h2><div class="tone-acc">${LESSONS.map(L => { const st = lessonStats(L.lesson); return `<div class="t"><div><b>Lesson ${L.lesson}</b><small>${st.mastered} / ${st.total} mastered · ${st.seen} seen</small></div></div>`; }).join("")}</div></div>` : ""}
      <div class="panel"><h2>Tone recognition</h2><p>From the tone drill. Which tones your ear still confuses.</p>
        <div class="tone-acc">${SM2.TONES.map(t => { const s = state.toneStats[t]; return `<div class="t">${contourSvg(t, 40)}<div><b class="tone-${t}">${t}</b><small>${s && s.n ? Math.round(100 * s.ok / s.n) + "% of " + s.n : "no data"}</small></div></div>`; }).join("")}</div></div>
      <div class="panel"><h2>Hardest words</h2>${hard.length ? `<div class="list">${hard.map(cd => { const w = BY_ID[cd.id]; return `<div class="wrow"><div class="main"><span class="thai">${esc(w.thai)}</span><span class="roman">${romanHtml(w)}</span><span class="en">${esc(w.en)}</span></div><div class="right"><span class="due">${cd.lapses} lapses · EF ${cd.ef.toFixed(2)}</span><button class="btn icon" data-action="play" data-text="${esc(w.thai)}">🔊</button></div></div>`; }).join("")}</div>
        <div class="row" style="margin-top:10px"><button class="btn" data-action="start" data-kind="flash" data-src="hard">Drill my hardest words</button></div>` : "<p>No lapses yet. Keep going.</p>"}</div>`;
  }

  function audioDiagnostics() {
    const d = ThaiAudio.diagnostics();
    const rows = [
      ["Speech engine in this browser", d.speechApi ? "yes" : "no"],
      ["Voices loaded", d.voicesLoaded ? String(d.voicesLoaded) : "none yet (tap a Play button once, then reopen Settings)"],
      ["Thai voices", d.thaiVoices.length ? d.thaiVoices.join(", ") : "none"],
      ["Server audio", d.serverAudio ? (ui.serverAudio === undefined ? "checking…" : ui.serverAudio) : "not available from a local file"],
      ["Last playback", d.lastError ? "failed: " + esc(d.lastError) : (d.lastEngine ? "ok via " + (d.lastEngine === "online" ? "server audio" : "browser voice") : "not tried yet")]
    ];
    if (d.serverAudio && ui.serverAudio === undefined) {
      ui.serverAudio = null;
      fetch("api/tts?q=" + encodeURIComponent("สวัสดี")).then(r => { ui.serverAudio = r.ok ? "ok (" + (r.headers.get("content-type") || "") + ")" : "failed: HTTP " + r.status; }).catch(e => { ui.serverAudio = "failed: " + e.message; }).then(() => { if (state.view === "settings") render(); });
    }
    const iosNote = d.isIOS ? `<p style="margin-top:8px"><b>iPhone / iPad:</b> the ringer (silent) switch mutes browser speech. Flip it to ring, or set Engine to <i>Online</i>, which plays as normal media and ignores the switch. If no Thai voice is listed: Settings → Accessibility → Spoken Content → Voices → Thai → download Kanya.</p>` : "";
    return `<div class="setting" style="display:block"><label>Diagnostics<small>What the app can see about audio on this device.</small></label>
      <table style="margin-top:8px;font-size:.85rem;border-collapse:collapse">${rows.map(r => `<tr><td style="color:var(--muted);padding:2px 12px 2px 0;vertical-align:top">${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table>${iosNote}</div>`;
  }
  function viewSettings() {
    const s = state.settings, voices = ThaiAudio.thaiVoices();
    const catOn = c => !s.categories.length || s.categories.includes(c);
    return `<div class="panel"><h2>Scheduling</h2>
      <div class="setting"><label>New words per day<small>How many unseen words enter the queue each day.</small></label><input type="number" min="0" max="200" value="${s.newPerDay}" data-setting="newPerDay" style="width:90px"></div>
      <div class="setting"><label>Card front<small>What you see before flipping.</small></label>
        <select data-setting="front"><option value="thai" ${s.front === "thai" ? "selected" : ""}>Thai script (+ audio)</option><option value="english" ${s.front === "english" ? "selected" : ""}>English meaning</option><option value="audio" ${s.front === "audio" ? "selected" : ""}>Audio only</option></select></div>
      <div class="setting"><label>Show romanization on the front<small>Hide it once you can read Thai script.</small></label><input type="checkbox" data-setting="showRoman" ${s.showRoman ? "checked" : ""}></div>
      <div class="setting" style="display:block"><label>Categories to study<small>Deselect what you don't need. Applies to the queue and practice.</small></label>
        <div class="cats" style="margin-top:8px">${CATS.map(c => `<label class="${catOn(c) ? "" : "off"}"><input type="checkbox" data-cat="${c}" ${catOn(c) ? "checked" : ""}>${CAT_LABELS[c] || c}</label>`).join("")}</div></div>
    </div>
    <div class="panel"><h2>Audio</h2>
      <div class="setting"><label>Auto-play<small>Speak the word when a card appears.</small></label><input type="checkbox" data-setting="autoplay" ${s.autoplay ? "checked" : ""}></div>
      <div class="setting"><label>Engine<small>Server audio streams an MP3 per word from this site (needs internet, plays on every device). Browser voice uses a Thai voice installed on your device.</small></label>
        <select data-setting="engine"><option value="auto" ${s.engine === "auto" ? "selected" : ""}>Auto (server audio, then browser voice)</option><option value="online" ${s.engine === "online" ? "selected" : ""}>Server audio only (works on iPhone in silent mode)</option><option value="browser" ${s.engine === "browser" ? "selected" : ""}>Browser voice only (offline)</option></select></div>
      <div class="setting"><label>Thai voice<small>${voices.length ? voices.length + " Thai voice" + (voices.length > 1 ? "s" : "") + " found." : "No Thai voice installed. macOS: System Settings → Accessibility → Spoken Content → add Thai (Kanya). Windows: Settings → Time & Language → add Thai speech. Android: Google TTS → install Thai. Chrome desktop has Google ไทย online."}</small></label>
        <select data-setting="voiceURI" ${voices.length ? "" : "disabled"}><option value="">Auto</option>${voices.map(v => `<option value="${esc(v.voiceURI)}" ${s.voiceURI === v.voiceURI ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")}</select></div>
      <div class="setting"><label>Speed<small>Normal ${s.rate.toFixed(2)} · Slow ${s.slowRate.toFixed(2)}</small></label><div class="row"><input type="range" min="0.5" max="1.2" step="0.05" value="${s.rate}" data-setting="rate"><input type="range" min="0.3" max="0.9" step="0.05" value="${s.slowRate}" data-setting="slowRate"></div></div>
      <div class="setting"><label>Test</label><div class="row"><button class="btn" data-action="play" data-text="สวัสดีครับ ขอบคุณมาก">🔊 สวัสดีครับ</button><button class="btn" data-action="play" data-slow="1" data-text="สวัสดีครับ ขอบคุณมาก">🐢 slow</button></div></div>
      ${audioDiagnostics()}
    </div>
    <div class="panel"><h2>Data</h2>
      <div class="setting"><label>Backup<small>Progress lives in this browser's local storage. Export to move it to another device.</small></label><div class="row"><button class="btn" data-action="export">⬇ Export JSON</button><label class="btn">⬆ Import JSON<input type="file" accept="application/json" data-input="import" class="hidden"></label></div></div>
      <div class="setting"><label>Reset<small>Deletes all review history.</small></label><button class="btn danger" data-action="reset">Reset progress</button></div>
    </div>`;
  }

  // ---------- events ----------
  ["pointerdown", "keydown", "touchstart"].forEach(ev => document.addEventListener(ev, () => { ui.interacted = true; }, { capture: true, passive: true }));
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action;
    if (a !== "flip" && el.closest('[data-action="flip"]')) e.stopPropagation();
    if (a === "nav") { const v = el.dataset.view; if (v === "session" && !session) { startSession("flash"); return; } state.view = v; render(); }
    else if (a === "start") {
      if (el.dataset.src) state.settings.practiceSource = el.dataset.src;
      const o = {};
      if (el.dataset.extra) o.extraNew = Number(el.dataset.extra);
      if (el.dataset.source) { o.source = el.dataset.source; if (o.source === "category") o.category = ui.extraCat; if (o.source === "lesson") o.lesson = Number(el.dataset.lesson); }
      if (el.dataset.front) { state.settings.front = el.dataset.front; save(); }
      startSession(el.dataset.kind, o);
    }
    else if (a === "end") { session = null; state.view = "home"; render(); }
    else if (a === "flip") { flip(); }
    else if (a === "browseBy") { state.settings.browseBy = el.dataset.by; save(); ui.shown = 150; render(); }
    else if (a === "more") { ui.shown += 150; render(); }
    else if (a === "front") { state.settings.front = el.dataset.front; save(); if (session) { session.flipped = false; render(); } else render(); }
    else if (a === "grade") { if (session && session.flipped) { grade(session.current, Number(el.dataset.q)); advance(); } }
    else if (a === "choose") { if (session && !session.answered) { const id = el.dataset.id; session.answered = true; session.lastResult = id; const ok = id === session.q.answer; grade(session.current, ok ? (Date.now() - session.shownAt < 3500 ? 5 : 4) : 1); render(); if (!ok || session.kind === "listen") play(BY_ID[session.current].thai); } }
    else if (a === "tone") { if (session && !session.answered) { const t = el.dataset.tone; session.answered = true; session.lastResult = t; const ok = t === session.q.answer; grade(session.current, ok ? 4 : 1, { tone: session.q.answer }); render(); } }
    else if (a === "next") { if (session && session.answered) advance(); }
    else if (a === "play") { play(el.dataset.text, !!el.dataset.slow); }
    else if (a === "record") { toggleRecord(); }
    else if (a === "playrec") { ThaiAudio.playRecording().catch(() => toast("Nothing recorded yet.")); }
    else if (a === "export") { exportJson(); }
    else if (a === "reset") { if (confirm("Delete all progress? This cannot be undone.")) { const settings = state.settings; state = { v: 1, cards: {}, log: {}, toneStats: {}, streak: { last: null, count: 0 }, settings }; session = null; save(); state.view = "home"; render(); toast("Progress reset."); } }
  });
  document.addEventListener("change", e => {
    const el = e.target;
    if (el.dataset.setting) {
      const k = el.dataset.setting; let v = el.type === "checkbox" ? el.checked : el.value;
      if (el.type === "number" || el.type === "range") v = Number(v);
      state.settings[k] = v; save();
      if (k === "practiceSource") return;
      render();
    } else if (el.dataset.cat) {
      const on = CATS.filter(c => { const box = document.querySelector(`[data-cat="${c}"]`); return box && box.checked; });
      state.settings.categories = on.length === CATS.length ? [] : on; save(); render();
    } else if (el.dataset.input === "cat") { ui.cat = el.value; ui.shown = 150; render(); }
    else if (el.dataset.input === "lesson") { ui.lesson = el.value; ui.shown = 150; render(); }
    else if (el.dataset.input === "stage") { ui.stage = el.value; ui.shown = 150; render(); }
    else if (el.dataset.input === "extraKind") { ui.extraKind = el.value; render(); }
    else if (el.dataset.input === "extraCat") { ui.extraCat = el.value; render(); }
    else if (el.dataset.input === "import") { importJson(el.files[0]); }
  });
  document.addEventListener("input", e => { if (e.target.dataset.input === "search") { ui.search = e.target.value; ui.shown = 150; ui.focusSearch = true; render(); } });
  document.addEventListener("keydown", e => {
    if (e.target.matches("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!session || !session.current) return;
    const w = BY_ID[session.current], k = e.key;
    if (k === "p" || k === "P") { play(w.thai); e.preventDefault(); return; }
    if (k === "s" || k === "S") { play(w.thai, true); e.preventDefault(); return; }
    if (k === "r" || k === "R") { toggleRecord(); e.preventDefault(); return; }
    if (session.kind === "flash") {
      if ((k === " " || k === "Enter") && !session.flipped) { flip(); e.preventDefault(); }
      else if (session.flipped && "1234".includes(k) && k) { grade(w.id, GRADES["1234".indexOf(k)].q); advance(); e.preventDefault(); }
    } else if (session.kind === "tone") {
      if (!session.answered && "12345".includes(k) && k) { document.querySelectorAll('[data-action="tone"]')["12345".indexOf(k)].click(); e.preventDefault(); }
      else if (session.answered && (k === " " || k === "Enter")) { advance(); e.preventDefault(); }
    } else {
      if (!session.answered && "1234".includes(k) && k) { const b = document.querySelectorAll('[data-action="choose"]')["1234".indexOf(k)]; if (b) b.click(); e.preventDefault(); }
      else if (session.answered && (k === " " || k === "Enter")) { advance(); e.preventDefault(); }
    }
  });

  async function toggleRecord() {
    try {
      if (ThaiAudio.isRecording()) { await ThaiAudio.stopRecording(); render(); toast("Recorded. Press 🎙 Me to hear yourself, 🔊 to compare."); }
      else { await ThaiAudio.startRecording(); render(); toast("Recording… press ■ Stop when done."); }
    } catch (e) { toast("Microphone unavailable: " + (e.message || e)); }
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "thai-flashcards-progress.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importJson(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { const s = JSON.parse(r.result); if (!s || s.v !== 1 || !s.cards) throw new Error("not a progress file"); state = s; state.settings = Object.assign({}, DEFAULTS, s.settings); state.toneStats = s.toneStats || {}; save(); render(); toast("Progress imported."); } catch (e) { toast("Import failed: " + e.message); } };
    r.readAsText(file);
  }

  // ---------- boot ----------
  state.view = "home";
  render();
  if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = () => { ThaiAudio.refreshVoices(); if (state.view === "settings") render(); };
})();
