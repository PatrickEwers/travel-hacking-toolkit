/* Thai audio: browser speech synthesis (preferred), Google Translate TTS fallback,
   plus microphone recording so you can compare your tone against the reference. */
(function (root) {
  "use strict";
  const state = { voices: [], ready: false, lastError: null, fallbackAudio: null };

  function refreshVoices() {
    if (!("speechSynthesis" in root)) return [];
    state.voices = root.speechSynthesis.getVoices() || [];
    state.ready = state.voices.length > 0;
    return state.voices;
  }
  if ("speechSynthesis" in root) {
    refreshVoices();
    root.speechSynthesis.onvoiceschanged = refreshVoices;
  }

  function thaiVoices() {
    refreshVoices();
    return state.voices.filter(v => /^th([-_]|$)/i.test(v.lang || ""));
  }

  function pickVoice(voiceURI) {
    const list = thaiVoices();
    if (!list.length) return null;
    if (voiceURI) { const v = list.find(x => x.voiceURI === voiceURI); if (v) return v; }
    // Prefer known natural voices when several exist.
    const pref = /google|kanya|premwadee|niwat|achara|narisa|natural/i;
    return list.find(v => pref.test(v.name)) || list[0];
  }

  function stop() {
    if ("speechSynthesis" in root) root.speechSynthesis.cancel();
    if (state.fallbackAudio) { try { state.fallbackAudio.pause(); } catch (e) {} state.fallbackAudio = null; }
  }

  function speakBrowser(text, opts) {
    return new Promise((resolve, reject) => {
      const voice = pickVoice(opts.voiceURI);
      if (!voice) return reject(new Error("no-thai-voice"));
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice; u.lang = voice.lang || "th-TH";
      u.rate = opts.rate || 0.9; u.pitch = 1; u.volume = 1;
      u.onend = () => resolve("browser");
      u.onerror = e => reject(new Error("tts-error:" + (e.error || "unknown")));
      root.speechSynthesis.cancel();
      root.speechSynthesis.speak(u);
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
      a.play().catch(err => reject(err));
    });
  }

  /* engine: "auto" | "browser" | "online" */
  async function speak(text, opts) {
    opts = opts || {};
    const engine = opts.engine || "auto";
    stop();
    try {
      if (engine === "online") return await speakOnline(text, opts);
      if (engine === "browser") return await speakBrowser(text, opts);
      try { return await speakBrowser(text, opts); }
      catch (e) { if (String(e.message).startsWith("no-thai-voice")) return await speakOnline(text, opts); throw e; }
    } catch (e) {
      state.lastError = e;
      throw e;
    }
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

  root.ThaiAudio = { speak, stop, thaiVoices, refreshVoices, pickVoice, startRecording, stopRecording,
    isRecording, playRecording, hasRecording: () => !!rec.url, state };
})(window);
