/* Word-by-word gloss for multi-word cards.
   Segments the romanization (syllables split on "-" and spaces), matches the longest run of syllables
   that is a known word, and confirms each match by finding its Thai script in the sentence, in order,
   so homophones with different spellings cannot be confused. Pure; usable from Node. */
(function (root) {
  "use strict";
  const MAX_RUN = 6;

  // entries: iterable of {thai, roman, en}. Returns an index keyed by hyphen-joined syllables.
  function buildIndex(entries) {
    const idx = Object.create(null);
    for (const e of entries) {
      const key = String(e.roman).normalize("NFC").split(/[-\s]+/).filter(Boolean).join("-");
      (idx[key] || (idx[key] = [])).push({ thai: e.thai, en: e.en });
    }
    return idx;
  }

  /* word: {thai, roman}. Returns { parts: [{thai, roman, en}|{roman, unmatched:true}], matched, unmatched }
     or null when a gloss would not help (single word, or too little matched). */
  function gloss(word, idx) {
    const tokens = String(word.roman).normalize("NFC").split(/[-\s]+/).filter(Boolean);
    if (tokens.length < 2) return null;
    const parts = []; let cursor = 0, i = 0, matched = 0, unmatched = 0;
    while (i < tokens.length) {
      let hit = null;
      for (let len = Math.min(MAX_RUN, tokens.length - i); len >= 1; len--) {
        const key = tokens.slice(i, i + len).join("-");
        const cands = idx[key];
        if (!cands) continue;
        let best = null;
        for (const c of cands) {
          if (c.thai === word.thai) continue;                 // the card itself is not a gloss of itself
          const pos = word.thai.indexOf(c.thai, cursor);
          if (pos >= 0 && (!best || pos < best.pos)) best = { thai: c.thai, roman: key, en: c.en, pos };
        }
        if (best) { hit = best; i += len; break; }
      }
      if (hit) { parts.push({ thai: hit.thai, roman: hit.roman, en: hit.en }); cursor = hit.pos + hit.thai.length; matched++; }
      else if (word.thai[cursor] === "\u0E46" && parts.length && parts[parts.length - 1].roman === tokens[i]) {
        // ๆ repeats the previous word (e.g. เย็นๆ "yen yen")
        parts.push({ thai: "ๆ", roman: tokens[i], en: "(repeat: " + parts[parts.length - 1].en.split(" / ")[0] + ")" }); cursor += 1; matched++; i++;
      }
      else { parts.push({ roman: tokens[i], unmatched: true }); unmatched++; i++; }
    }
    if (matched < 2 || unmatched > matched) return null;
    return { parts, matched, unmatched };
  }

  const api = { buildIndex, gloss };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Gloss = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
