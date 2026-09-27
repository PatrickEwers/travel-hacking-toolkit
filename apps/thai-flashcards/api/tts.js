// Vercel serverless function: returns MP3 speech for a Thai phrase.
// GET /api/tts?q=สวัสดี&slow=1
// Proxies Google Translate's TTS endpoint server-side (browsers cannot call it directly on iOS),
// and lets Vercel's CDN cache each phrase for a year.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchGoogle(q, slow) {
  const url = "https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&ttsspeed=" +
    (slow ? "0.24" : "1") + "&q=" + encodeURIComponent(q);
  const r = await fetch(url, { headers: { "User-Agent": UA, "Referer": "https://translate.google.com/", "Accept": "audio/mpeg,*/*" } });
  if (!r.ok) throw new Error("google " + r.status);
  const type = r.headers.get("content-type") || "";
  const buf = Buffer.from(await r.arrayBuffer());
  if (!/audio|octet-stream/.test(type) && buf.length < 1000) throw new Error("google returned " + type);
  return buf;
}

module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || "").trim().slice(0, 200);
  const slow = String((req.query && req.query.slow) || "") === "1";
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Accept-Ranges", "bytes");
  if (!q) { res.status(400).json({ error: "missing q" }); return; }
  let buf;
  try { buf = await fetchGoogle(q, slow); }
  catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "tts upstream failed", detail: String(e.message || e) });
    return;
  }
  const len = buf.length;
  res.setHeader("Content-Type", "audio/mpeg");
  // Safari (especially iOS) probes media with Range requests and refuses to play when the server ignores them.
  const range = req.headers && req.headers.range;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(String(range));
  if (m && (m[1] !== "" || m[2] !== "")) {
    let start = m[1] === "" ? Math.max(0, len - Number(m[2])) : Number(m[1]);
    let end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), len - 1) : len - 1;
    if (start >= len || start > end) {
      res.setHeader("Content-Range", "bytes */" + len);
      res.status(416).end();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + len);
    res.setHeader("Content-Length", String(end - start + 1));
    res.status(206);
    if (req.method === "HEAD") { res.end(); return; }
    res.send(buf.subarray(start, end + 1));
    return;
  }
  res.setHeader("Content-Length", String(len));
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=31536000, immutable");
  res.status(200);
  if (req.method === "HEAD") { res.end(); return; }
  res.send(buf);
};
module.exports.fetchGoogle = fetchGoogle;
