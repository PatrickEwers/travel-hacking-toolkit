# Thai 1000 · Flashcards

A dependency-free flashcard and exercise app for the 1000 most useful Thai words, with SuperMemo SM-2 spaced repetition, wrong-answer requeueing, and playable audio so you can practice the five tones.

**Live:** https://thai-flashcards-pi.vercel.app (Vercel project `thai-flashcards`, root directory `apps/thai-flashcards`, auto-deploys from this repo).

**Run it locally:** open `index.html` in any modern browser. No build step, no server needed. Progress is stored in the browser's local storage (export/import in Settings to move it between devices). To host it, copy this folder to any static host or serve it with `python3 -m http.server` from this directory.

## What's inside

| Path | Purpose |
|------|---------|
| `data/words.js` | 1000 words: Thai script, tone-marked romanization, English, category (24 categories, from greetings and numbers to food, transport, emergencies). |
| `js/sm2.js` | SM-2 scheduler, queue builder, forecast, and the tone parser. Pure functions, also runs in Node. |
| `js/audio.js` | Thai text-to-speech (browser voice first, Google Translate audio as fallback) and microphone recording for self-comparison. |
| `js/app.js` | The UI: study session, practice modes, browse, stats, settings. |
| `test/run.js` | `node test/run.js` checks the dataset and the scheduler math. |

## Study modes

- **Flashcards** – see the Thai word (or the English, or audio only; your choice in Settings), flip, grade yourself Again / Hard / Good / Easy. The predicted next interval is shown on each button.
- **Thai → English** and **English → Thai** – four-option quizzes, distractors drawn from the same category.
- **Listening** – audio only, pick the word you heard.
- **Tone drill** – one syllable is underlined; hear it and name its tone (mid, low, falling, high, rising). Per-tone accuracy is tracked on the Stats page so you can see which tones your ear still confuses.

Practice can draw from today's queue, words you have already seen, your hardest words (most lapses), or all 1000.

## Scheduling (SM-2)

Each card carries an easiness factor (EF, starts at 2.5), a repetition count and an interval.

- Grade ≥ 3 (Hard / Good / Easy): interval goes 1 day → 6 days → previous interval × EF. A brand-new card graded Easy jumps straight to 4 days.
- Grade < 3 (Again, or a wrong quiz answer): repetitions reset, interval becomes 1 day, the lapse counter increments, and the card is re-inserted three cards later in the current session until you get it right.
- EF is updated with Wozniak's formula `EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02))`, floored at 1.3, so cards you keep missing come back more often for good.
- When cards are due, the ones with the most lapses are shown first, then the most overdue. Cards with 4+ lapses are flagged as leeches.
- New cards enter in dataset order (most essential categories first), capped per day (default 20, adjustable).
- **Extra study** (Home, and after every session): review today's cards again, study ahead (cards due in the next 3 days), add 10 or 25 new words beyond the cap, or drill a whole category in any mode. A card already scheduled today does not have its interval stretched again by a repeat pass, but a wrong answer still resets it, so extra practice never inflates the spacing.

## Teacher lessons (priority deck)

`data/lessons.js` holds sentences from private lessons, grouped by lesson number: `[thai, romanization, english]`. On load they merge into the deck; a sentence whose Thai already exists in the dictionary tags that word instead of duplicating it.

Lesson cards are **priority** until mastered:

- they go to the front of the queue (due lesson cards before other due cards, new lesson cards before new dictionary words) and do not count against the daily new-card cap;
- their intervals are capped by a ladder of 1, 2, 4, 7, 14, 30 days per consecutive correct answer, so they come back far more often than SM-2 alone would schedule; a wrong answer restarts the ladder;
- **mastered** means six correct answers in a row (interval ≥ 21 days, reps ≥ 3), after which the card follows the normal SM-2 schedule;
- the lesson "Speak" drill starts English-first so you practise *saying* the Thai, then flip to hear and check; "Read" starts Thai-first. The direction switch on the study screen always applies, to lesson cards too.

Home shows per-lesson progress with Speak / Listen / quiz drills. To add a lesson, append an object to `data/lessons.js` in the same romanization system and run `node test/run.js`, which checks every item.

## Tones and audio

The romanization is a Paiboon-style "house system" chosen to match what Thai language schools use: unaspirated stops **g / bp / dt / j** (ก ป ต จ), aspirated **k / p / t / ch** (ข ค, ผ พ, ถ ท, ฉ ช); vowels a/aa, i/ee, u/oo, e/ay (เอ), o/oh (โอ), aw (ออ), ae (แ), eu (อือ), eua (เอือ), er (เออ), ia, ua, ai, ao, oi (ออย), oei (เ-ย). Tone is marked with one diacritic per syllable: `à` low, `â` falling, `á` high, `ǎ` rising, unmarked = mid. Syllables are colour-coded, and each shows a pitch-contour glyph and the Thai tone name (สามัญ, เอก, โท, ตรี, จัตวา).

Audio comes from the site's own `api/tts` endpoint (server-generated MP3, cached on the CDN). Opened as a local file, the app uses the browser's speech synthesis with a Thai voice instead. To get an offline voice:

- **macOS / iOS:** System Settings → Accessibility → Spoken Content → System Voice → Manage Voices → Thai (Kanya).
- **Windows:** Settings → Time & Language → Speech → Add voices → Thai.
- **Android:** Google Text-to-speech → Install voice data → Thai.
- **Chrome desktop** already ships an online "Google ไทย" voice.

When hosted (e.g. on Vercel), the app streams an MP3 per word from its own `api/tts` serverless function instead, which works on every device including iPhones on silent, and falls back to the device voice only if that fails.

Press 🔊 for normal speed, 🐢 for slow (better for hearing the contour), ● to record yourself, then 🎙 to play it back against the reference.

Keyboard: `Space` flip, `1`–`4` grade, `1`–`5` pick an answer, `P` play, `S` slow, `R` record, `Enter` continue.
