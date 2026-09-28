// Run with: node test/run.js
const assert = require("assert");
const SM2 = require("../js/sm2.js");
const WORDS = require("../data/words.js");
const LESSONS = require("../data/lessons.js");
const USAGE = require("../data/usage-notes.js");
let passed = 0;
function t(name, fn) { fn(); passed++; console.log("ok -", name); }

t("dataset has at least 1000 words", () => assert.ok(WORDS.length >= 1000, String(WORDS.length)));
t("thai keys are unique", () => assert.strictEqual(new Set(WORDS.map(w => w[0])).size, WORDS.length));
t("every entry has thai, romanization, english, category", () => {
  for (const w of WORDS) {
    assert.strictEqual(w.length, 4, JSON.stringify(w));
    assert.ok(/^[฀-๿0-9 .\-]+$/.test(w[0]), "thai: " + w[0]);
    assert.ok(/^[a-zàáâǎèéêěìíîǐòóôǒùúûǔ\- ]+$/.test(w[1].normalize("NFC")), "roman: " + w[1]);
    assert.ok(w[2].length > 0 && w[3].length > 0, JSON.stringify(w));
  }
});
t("every syllable resolves to one of the five tones", () => {
  const seen = {};
  for (const w of WORDS) for (const s of SM2.analyze(w[1])) { assert.ok(SM2.TONES.includes(s.tone)); seen[s.tone] = 1; }
  assert.deepStrictEqual(Object.keys(seen).sort(), [...SM2.TONES].sort());
});
t("tone parsing", () => {
  assert.deepStrictEqual(SM2.analyze("sà-wàt-dii").map(s => s.tone), ["low", "low", "mid"]);
  assert.deepStrictEqual(SM2.analyze("khâo-jai").map(s => s.tone), ["falling", "mid"]);
  assert.deepStrictEqual(SM2.analyze("phǒm").map(s => s.tone), ["rising"]);
  assert.deepStrictEqual(SM2.analyze("ráwn").map(s => s.tone), ["high"]);
  assert.strictEqual(SM2.stripTone("khǎo"), "khao");
});

t("SM-2 interval ladder 1 → 6 → round(6*EF)", () => {
  let c = SM2.newCard("x");
  c = SM2.review(c, 4, 100); assert.strictEqual(c.interval, 1); assert.strictEqual(c.due, 101);
  c = SM2.review(c, 4, 101); assert.strictEqual(c.interval, 6);
  c = SM2.review(c, 4, 107); assert.strictEqual(c.interval, Math.round(6 * c.ef));
  assert.strictEqual(c.reps, 3);
});
t("SM-2 easiness factor moves as in Wozniak's formula and floors at 1.3", () => {
  let c = SM2.newCard("x");
  c = SM2.review(c, 5, 0); assert.ok(Math.abs(c.ef - 2.6) < 1e-9);
  c = SM2.review(c, 3, 1); assert.ok(Math.abs(c.ef - 2.46) < 1e-9);
  for (let i = 0; i < 20; i++) c = SM2.review(c, 0, i);
  assert.strictEqual(c.ef, 1.3);
});
t("wrong answer (q<3) resets repetitions, schedules for tomorrow and counts a lapse", () => {
  let c = SM2.newCard("x");
  c = SM2.review(c, 4, 0); c = SM2.review(c, 4, 1); c = SM2.review(c, 4, 7);
  assert.ok(c.interval > 6);
  c = SM2.review(c, 1, 20);
  assert.strictEqual(c.reps, 0); assert.strictEqual(c.interval, 1); assert.strictEqual(c.due, 21); assert.strictEqual(c.lapses, 1);
  c = SM2.review(c, 4, 21); assert.strictEqual(c.interval, 1);
  c = SM2.review(c, 4, 22); assert.strictEqual(c.interval, 6);
});
t("new card graded easy jumps to 4 days", () => {
  const c = SM2.review(SM2.newCard("x"), 5, 0); assert.strictEqual(c.interval, 4);
});
t("queue: most-lapsed and most overdue due cards first, then limited new cards", () => {
  const cards = {
    a: Object.assign(SM2.newCard("a"), { seen: 3, due: 9, lapses: 0, reps: 2 }),
    b: Object.assign(SM2.newCard("b"), { seen: 3, due: 5, lapses: 2, reps: 0 }),
    c: Object.assign(SM2.newCard("c"), { seen: 3, due: 8, lapses: 0, reps: 2 }),
    d: Object.assign(SM2.newCard("d"), { seen: 3, due: 15, lapses: 9, reps: 0 })
  };
  const q = SM2.buildQueue(cards, ["a", "b", "c", "d", "e", "f", "g"], { day: 10, newLimit: 2 });
  assert.deepStrictEqual(q.due, ["b", "c", "a"]);
  assert.deepStrictEqual(q.fresh, ["e", "f"]);
  assert.strictEqual(q.remainingNew, 3);
});
t("stage + leech + forecast", () => {
  assert.strictEqual(SM2.stage(null), "new");
  assert.strictEqual(SM2.stage({ seen: 1, reps: 0, interval: 1 }), "relearning");
  assert.strictEqual(SM2.stage({ seen: 1, reps: 1, interval: 1 }), "learning");
  assert.strictEqual(SM2.stage({ seen: 5, reps: 3, interval: 30 }), "mature");
  assert.ok(SM2.isLeech({ lapses: 4 }) && !SM2.isLeech({ lapses: 3 }));
  const f = SM2.forecast({ a: { seen: 1, due: 10 }, b: { seen: 1, due: 12 }, c: { seen: 1, due: 3 }, d: { seen: 0, due: 11 } }, 4, 10);
  assert.deepStrictEqual(f, [2, 0, 1, 0]);
});
t("dictionary uses the house romanization (g/bp/dt, ee/oo/oh, no kh/ph/th onsets)", () => {
  for (const w of WORDS) for (const syl of SM2.syllables(w[1])) {
    const n = syl.normalize("NFD");
    assert.ok(!/^(kh|ph|th)/.test(n), w[1]);
    assert.ok(!/i[\u0300-\u036f]?i|u[\u0300-\u036f]?u/.test(n), w[1]);
  }
});
t("lessons: valid, unique, tone-parsable, same alphabet as dictionary", () => {
  const seen = new Set();
  for (const L of LESSONS) {
    assert.ok(Number.isInteger(L.lesson) && L.items.length, "lesson " + L.lesson);
    for (const it of L.items) {
      assert.strictEqual(it.length, 3, JSON.stringify(it));
      assert.ok(!seen.has(it[0]), "duplicate " + it[0]); seen.add(it[0]);
      assert.ok(/^[\u0E00-\u0E7F0-9 .\-]+$/.test(it[0]), it[0]);
      assert.ok(/^[a-zàáâǎèéêěìíîǐòóôǒùúûǔ\- ]+$/.test(it[1].normalize("NFC")), it[1]);
      for (const s of SM2.analyze(it[1])) assert.ok(SM2.TONES.includes(s.tone));
    }
  }
  // a lesson item that duplicates a dictionary word must spell it identically
  const dict = Object.fromEntries(WORDS.map(w => [w[0], w[1]]));
  for (const L of LESSONS) for (const it of L.items) if (dict[it[0]]) assert.strictEqual(it[1], dict[it[0]], it[0]);
});
t("priority queue: lesson cards first and exempt from the new-card cap; ladder caps intervals", () => {
  const cards = { a: Object.assign(SM2.newCard("a"), { seen: 2, due: 5, lapses: 3, reps: 1 }), p: Object.assign(SM2.newCard("p"), { seen: 2, due: 9, lapses: 0, reps: 1 }) };
  const q = SM2.buildQueue(cards, ["a", "p", "n1", "n2", "L1", "n3"], { day: 10, newLimit: 1, priority: id => id === "p" || id === "L1" });
  assert.deepStrictEqual(q.due, ["p", "a"]);
  assert.deepStrictEqual(q.fresh, ["L1", "n1"]);
  let c = SM2.newCard("L1");
  const ivs = [];
  for (let d = 0, i = 0; i < 7; i++) { c = SM2.capPriority(SM2.review(c, 4, d), d); ivs.push(c.interval); d += c.interval; }
  assert.deepStrictEqual(ivs.slice(0, 6), [1, 2, 4, 7, 14, 30]);
  assert.ok(!SM2.isMastered(Object.assign({}, c, { interval: 14, reps: 5 })));
  assert.ok(SM2.isMastered(Object.assign({}, c, { interval: 30, reps: 6 })));
  assert.ok(ivs[6] >= 30);
});
t("usage notes reference real words and valid levels; deprioritised cards sort last", () => {
  const ids = new Set(WORDS.map(w => w[0]));
  for (const [k, u] of Object.entries(USAGE)) { assert.ok(ids.has(k), k); assert.ok(["rare", "formal", "note"].includes(u.level), k); assert.ok(u.note, k); }
  const q = SM2.buildQueue({}, ["r1", "a", "f1", "b", "c"], { day: 0, newLimit: 3, deprioritize: id => id === "r1" || id === "f1" });
  assert.deepStrictEqual(q.fresh, ["a", "b", "c"]);
  const cards = { r1: Object.assign(SM2.newCard("r1"), { seen: 1, due: 0, lapses: 5 }), a: Object.assign(SM2.newCard("a"), { seen: 1, due: 0, lapses: 0 }) };
  assert.deepStrictEqual(SM2.buildQueue(cards, ["r1", "a"], { day: 0, deprioritize: id => id === "r1" }).due, ["a", "r1"]);
});
console.log("\n" + passed + " tests passed");
