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

  function stopOnline() {
    if (state.fallbackAudio) { try { state.fallbackAudio.pause(); } catch (e) { /* ignore */ } state.fallbackAudio = null; }
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
      const url = "https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&ttsspeed=" +
        ((opts.rate || 0.9) < 0.75 ? "0.3" : "1") + "&q=" + encodeURIComponent(text);
      const a = new Audio(url);
      state.fallbackAudio = a;
      a.onended = () => resolve("online");
      a.onerror = () => reject(new Error("online-tts-failed"));
      a.play().then(() => { state.unlocked = true; }).catch(err => reject(new Error("online-play-blocked:" + (err && err.name || err))));
    });
  }

  /* engine: "auto" | "browser" | "online" */
  async function speak(text, opts) {
    opts = opts || {};
    const engine = opts.engine || "auto";
    state.lastText = text; state.lastError = null;
    stopOnline();
    try {
      let result;
      if (engine === "online") result = await speakOnline(text, opts);
      else if (engine === "browser") result = await speakBrowser(text, opts);
      else {
        try { result = await speakBrowser(text, opts); }
        catch (e) {
          const m = String(e.message);
          if (m.startsWith("no-thai-voice") || m.startsWith("no-speech-api") || /voice-unavailable|language-unavailable|synthesis-unavailable|synthesis-failed/.test(m)) {
            result = await speakOnline(text, opts);
          } else throw e;
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
      unlocked: state.unlocked
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
