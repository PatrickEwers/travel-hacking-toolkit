/* Thai audio: browser speech synthesis (preferred), Google Translate TTS fallback,
   plus microphone recording so you can compare your tone against the reference. */
(function (root) {
  "use strict";
  const state = { voices: [], ready: false, lastError: null, lastEngine: null, lastText: null,
    fallbackAudio: null, current: null, unlocked: false };
  const synth = "speechSynthesis" in root ? root.speechSynthesis : null;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function refreshVoices() {
    if (!synth) return [];
    const v = synth.getVoices() || [];
    if (v.length) { state.voices = v; state.ready = true; }
    return state.voices;
  }
  if (synth) {
    refreshVoices();
    synth.addEventListener && synth.addEventListener("voiceschanged", refreshVoices);
    // Some browsers only populate the list after a first (silent) call.
    if (!state.voices.length) setTimeout(refreshVoices, 300);
  }

  function thaiVoices() {
    refreshVoices();
    return state.voices.filter(v => /^th([-_]|$)/i.test(v.lang || ""));
  }

  function pickVoice(voiceURI) {
    const list = thaiVoices();
    if (!list.length) return null;
    if (voiceURI) { const v = list.find(x => x.voiceURI === voiceURI); if (v) return v; }
    const pref = /google|kanya|premwadee|niwat|achara|narisa|natural/i;
    return list.find(v => pref.test(v.name)) || list[0];
  }

  // One shared <audio> element. iOS only allows play() inside a user gesture, but once an element has
  // played (even a silent clip) during a gesture, its src can be swapped and replayed later.
  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
  let player = null;
  function getPlayer() {
    if (!player && typeof root.Audio !== "undefined") { player = new root.Audio(); player.preload = "auto"; player.setAttribute && player.setAttribute("playsinline", ""); }
    return player;
  }
  function unlock() {
    if (state.unlockedMedia) return;
    const p = getPlayer(); if (!p) return;
    try { p.src = SILENT; const pr = p.play(); if (pr && pr.then) pr.then(() => { state.unlockedMedia = true; }).catch(() => {}); } catch (e) { /* ignore */ }
  }
  if (typeof document !== "undefined") ["pointerdown", "touchend", "keydown"].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

  function ttsUrl(text, slow) {
    const local = typeof location !== "undefined" && /^https?:$/.test(location.protocol);
    if (local) return "api/tts?q=" + encodeURIComponent(text) + (slow ? "&slow=1" : "");
    return "https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&ttsspeed=" + (slow ? "0.24" : "1") + "&q=" + encodeURIComponent(text);
  }

  function stopOnline() {
    const p = getPlayer();
    if (p && !p.paused) { try { p.pause(); } catch (e) { /* ignore */ } }
  }
  function stop() {
    if (synth) synth.cancel();
    stopOnline();
  }

  /* Resolves when the utterance finishes. A cancelled/interrupted utterance (because a newer one
     started) resolves too: it is not a failure the user needs to hear about. */
  function speakBrowser(text, opts) {
    return new Promise((resolve, reject) => {
      if (!synth || typeof root.SpeechSynthesisUtterance === "undefined") return reject(new Error("no-speech-api"));
      const voice = pickVoice(opts.voiceURI);
      // If the voice list has loaded and holds no Thai voice, let the caller fall back.
      if (!voice && state.voices.length) return reject(new Error("no-thai-voice"));
      const u = new root.SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = (voice && voice.lang) || "th-TH";
      u.rate = opts.rate || 0.9; u.pitch = 1; u.volume = 1;
      let settled = false;
      u.onend = () => { if (settled) return; settled = true; state.unlocked = true; resolve("browser"); };
      u.onerror = e => {
        if (settled) return; settled = true;
        const code = (e && e.error) || "unknown";
        if (code === "canceled" || code === "interrupted") return resolve("canceled");
        reject(new Error("tts-error:" + code));
      };
      // Keep a reference: Chrome garbage-collects utterances mid-speech and never fires onend.
      state.current = u;
      const go = () => {
        try {
          if (synth.paused) synth.resume();
          synth.speak(u);
          // Safari sometimes queues an utterance and never starts it. Nudge it.
          if (isIOS) setTimeout(() => { if (!settled && synth.paused) synth.resume(); }, 250);
        } catch (err) { if (!settled) { settled = true; reject(err); } }
      };
      if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(go, 60); } else go();
    });
  }

  function speakOnline(text, opts) {
    return new Promise((resolve, reject) => {
      const p = getPlayer();
      if (!p) return reject(new Error("no-audio-element"));
      let settled = false;
      const done = v => { if (!settled) { settled = true; resolve(v); } };
      const fail = e => { if (!settled) { settled = true; reject(e); } };
      p.onended = () => done("online");
      p.onerror = () => fail(new Error("online-tts-failed"));
      p.onpause = () => { if (p.currentTime > 0 && !p.ended) done("canceled"); };
      p.src = ttsUrl(text, opts.slow || (opts.rate || 0.9) < 0.75);
      p.playbackRate = 1;
      p.load();
      const pr = p.play();
      if (pr && pr.then) pr.then(() => { state.unlockedMedia = true; }).catch(err => fail(new Error("online-play-blocked:" + (err && err.name || err))));
    });
  }

  /* engine: "auto" (server audio, then browser voice) | "browser" | "online" */
  async function speak(text, opts) {
    opts = opts || {};
    const engine = opts.engine || "auto";
    state.lastText = text; state.lastError = null;
    stopOnline();
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
    try {
      let result;
      if (engine === "online") result = await speakOnline(text, opts);
      else if (engine === "browser") result = await speakBrowser(text, opts);
      else {
        try { result = await speakOnline(text, opts); }
        catch (e) {
          state.lastOnlineError = String(e.message);
          if (/online-play-blocked/.test(String(e.message))) throw e;
          result = await speakBrowser(text, opts);
        }
      }
      if (result !== "canceled") state.lastEngine = result;
      return result;
    } catch (e) {
      state.lastError = String(e && e.message || e);
      throw e;
    }
  }

  function diagnostics() {
    const th = thaiVoices();
    return {
      speechApi: !!synth,
      isIOS,
      voicesLoaded: state.voices.length,
      thaiVoices: th.map(v => v.name + " (" + v.lang + ")"),
      lastEngine: state.lastEngine,
      lastError: state.lastError,
      lastOnlineError: state.lastOnlineError || null,
      serverAudio: typeof location !== "undefined" && /^https?:$/.test(location.protocol),
      unlocked: state.unlocked || !!state.unlockedMedia
    };
  }

  // ---------- Recorder ----------
  const rec = { recorder: null, chunks: [], url: null, stream: null };
  async function startRecording() {
    if (!navigator.mediaDevices || !root.MediaRecorder) throw new Error("recording-unsupported");
    rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec.chunks = [];
    rec.recorder = new MediaRecorder(rec.stream);
    rec.recorder.ondataavailable = e => { if (e.data.size) rec.chunks.push(e.data); };
    rec.recorder.start();
  }
  function stopRecording() {
    return new Promise(resolve => {
      if (!rec.recorder) return resolve(null);
      rec.recorder.onstop = () => {
        const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || "audio/webm" });
        if (rec.url) URL.revokeObjectURL(rec.url);
        rec.url = URL.createObjectURL(blob);
        rec.stream.getTracks().forEach(t => t.stop());
        rec.recorder = null;
        resolve(rec.url);
      };
      rec.recorder.stop();
    });
  }
  function isRecording() { return !!rec.recorder && rec.recorder.state === "recording"; }
  function playRecording() {
    if (!rec.url) return Promise.resolve();
    const a = new Audio(rec.url);
    return a.play();
  }

  const api = { speak, stop, thaiVoices, refreshVoices, pickVoice, diagnostics, startRecording, stopRecording,
    isRecording, playRecording, hasRecording: () => !!rec.url, state, isIOS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ThaiAudio = api;
})(typeof window !== "undefined" ? window : globalThis);
