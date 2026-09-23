/* SM-2 spaced repetition + Thai tone helpers.
   Pure functions, no DOM. Works in the browser (global SM2) and Node (module.exports). */
(function (root) {
  "use strict";

  // ---------- Tones ----------
  // Romanization uses one diacritic per syllable:
  //   grave (à) = low, acute (á) = high, circumflex (â) = falling, caron (ǎ) = rising, none = mid.
  const TONE_INFO = {
    mid:     { label: "mid",     thai: "สามัญ", mark: "",  symbol: "→", color: "#94a3b8" },
    low:     { label: "low",     thai: "เอก",   mark: "◌่", symbol: "↘", color: "#60a5fa" },
    falling: { label: "falling", thai: "โท",    mark: "◌้", symbol: "↗↘", color: "#f87171" },
    high:    { label: "high",    thai: "ตรี",   mark: "◌๊", symbol: "↑", color: "#fb923c" },
    rising:  { label: "rising",  thai: "จัตวา", mark: "◌๋", symbol: "↘↗", color: "#4ade80" }
  };
  const TONES = Object.keys(TONE_INFO);

  const COMBINING = { "̀": "low", "́": "high", "̂": "falling", "̌": "rising" };

  function syllables(roman) {
    return String(roman).split(/[-\s]+/).filter(Boolean);
  }

  function syllableTone(syl) {
    const nfd = String(syl).normalize("NFD");
    for (const ch of nfd) if (COMBINING[ch]) return COMBINING[ch];
    return "mid";
  }

  function stripTone(syl) {
    return String(syl).normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
  }

  // [{text:"sà", plain:"sa", tone:"low"}, ...]
  function analyze(roman) {
    return syllables(roman).map(s => ({ text: s, plain: stripTone(s), tone: syllableTone(s) }));
  }

  // SVG path for a pitch contour (viewBox 0 0 60 40, y grows downward)
  const CONTOURS = {
    mid:     "M6 20 L54 20",
    low:     "M6 24 Q30 27 54 32",
    falling: "M6 16 Q22 4 32 14 T54 36",
    high:    "M6 20 Q34 18 54 6",
    rising:  "M6 22 Q24 34 34 28 T54 6"
  };

  // ---------- SM-2 ----------
  const DAY_MS = 86400000;
  function today() { return Math.floor(Date.now() / DAY_MS); }

  function newCard(id) {
    return { id, ef: 2.5, interval: 0, reps: 0, due: 0, lapses: 0, seen: 0, correct: 0, last: null };
  }

  function clampQ(q) { q = Number(q); if (!(q >= 0)) q = 0; return Math.min(5, Math.max(0, Math.round(q))); }

  /* SuperMemo SM-2 (Wozniak 1990):
       q >= 3 : correct. I(1)=1, I(2)=6, I(n)=round(I(n-1)*EF).
       q <  3 : lapse. Repetitions restart from 1 (interval 1 day), lapse count increments.
       EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)), floored at 1.3.
     Extension: a brand-new card graded 5 ("easy") skips straight to a 4-day interval. */
  function review(card, q, day) {
    q = clampQ(q);
    if (day === undefined) day = today();
    const c = Object.assign({}, card);
    c.seen = (c.seen || 0) + 1;
    if (q >= 3) {
      c.correct = (c.correct || 0) + 1;
      if (c.reps === 0) c.interval = q === 5 ? 4 : 1;
      else if (c.reps === 1) c.interval = 6;
      else c.interval = Math.round(c.interval * c.ef);
      c.reps += 1;
    } else {
      c.reps = 0;
      c.interval = 1;
      c.lapses = (c.lapses || 0) + 1;
    }
    c.ef = c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (c.ef < 1.3) c.ef = 1.3;
    c.due = day + c.interval;
    c.last = day;
    c.lastQ = q;
    return c;
  }

  // Preview the interval a grade would produce, without committing.
  function previewInterval(card, q) {
    return review(card, q, today()).interval;
  }

  function isDue(card, day) { return card.seen > 0 && card.due <= (day === undefined ? today() : day); }
  function isLeech(card) { return (card.lapses || 0) >= 4; }
  function stage(card) {
    if (!card || !card.seen) return "new";
    if (card.reps === 0) return "relearning";
    if (card.interval < 7) return "learning";
    if (card.interval < 21) return "young";
    return "mature";
  }

  /* Build today's queue.
       cards: {id -> card}, ids: ordered list of all word ids (dataset order = priority order),
       opts: { day, newLimit, filter(id) }
     Order: due cards first, most lapsed and most overdue first (wrong answers come back sooner
     and more often), then up to newLimit unseen cards. */
  function buildQueue(cards, ids, opts) {
    opts = opts || {};
    const day = opts.day === undefined ? today() : opts.day;
    const filter = opts.filter || (() => true);
    const due = [], fresh = [];
    for (const id of ids) {
      if (!filter(id)) continue;
      const c = cards[id];
      if (!c || !c.seen) fresh.push(id);
      else if (c.due <= day) due.push(c);
    }
    due.sort((a, b) => (b.lapses - a.lapses) || (a.due - b.due) || (a.ef - b.ef));
    const newLimit = opts.newLimit === undefined ? 20 : Math.max(0, opts.newLimit);
    return { due: due.map(c => c.id), fresh: fresh.slice(0, newLimit), remainingNew: fresh.length };
  }

  // Number of due cards per day for the next n days (forecast)
  function forecast(cards, n, day) {
    if (day === undefined) day = today();
    const out = new Array(n).fill(0);
    for (const id in cards) {
      const c = cards[id];
      if (!c.seen) continue;
      const d = Math.max(0, c.due - day);
      if (d < n) out[d] += 1;
    }
    return out;
  }

  const api = { TONES, TONE_INFO, CONTOURS, syllables, syllableTone, stripTone, analyze,
    today, newCard, review, previewInterval, isDue, isLeech, stage, buildQueue, forecast, DAY_MS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SM2 = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
