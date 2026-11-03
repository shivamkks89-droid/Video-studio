import { useEffect, useRef, useState } from "react";

const W = 1080, H = 1920;
const ease = (x) => { const c = 1.70158; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const rgb = (h) => (h.replace("#", "").match(/../g) || ["ff", "b0", "40"]).map((x) => parseInt(x, 16));

export const CinematicTextRenderer = ({ text = "", timestamps = [], audioSrc = "", color = "#FFB040", font = "Georgia, serif", title = "CineReel video", anim = "pop", images = [], logo = "", onRecorded }) => {
  const accent = rgb(color);
  const cv = useRef(null), au = useRef(null), ac = useRef(null), dest = useRef(null), rec = useRef(null);
  const ts = useRef(timestamps);
  const [recording, setRecording] = useState(false);
  const [msg, setMsg] = useState("");
  const [file, setFile] = useState(null);
  ts.current = timestamps;
  const bg = useRef([]), lg = useRef(null);
  const load = (u) => new Promise((r) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => r(im); im.onerror = () => r(null); im.src = u; });
  const imgKey = images.map((x) => x.url).join("|");
  useEffect(() => { Promise.all(images.map((x) => load(x.url).then((im) => im && { ...x, im }))).then((a) => { bg.current = a.filter(Boolean); }); }, [imgKey]); // eslint-disable-line
  useEffect(() => { lg.current = null; if (logo) load(logo).then((im) => { lg.current = im; }); }, [logo]);

  useEffect(() => {
    const ctx = cv.current.getContext("2d");
    const ps = Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2.4 + 0.4, v: Math.random() * 0.4 + 0.1, a: Math.random() * 0.5 + 0.1 }));
    let raf;
    const draw = (now) => {
      const t = au.current?.currentTime || 0, k = now / 1000;
      ctx.fillStyle = "#06060a"; ctx.fillRect(0, 0, W, H);
      const B = bg.current;
      if (B.length) {
        let n = B.findIndex((b) => t < b.end); if (n < 0) n = B.length - 1;
        const b = B[n], pz = clamp((t - b.start) / Math.max(0.5, b.end - b.start)), fade = clamp((t - b.start) / 0.6);
        const prev = B[n - 1];
        const cover = (im, z, al) => {
          const sc = Math.max(W / im.width, H / im.height) * z, w = im.width * sc, h = im.height * sc;
          ctx.globalAlpha = al; ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); ctx.globalAlpha = 1;
        };
        if (prev && fade < 1) cover(prev.im, 1.12, 1);
        cover(b.im, 1 + 0.12 * pz, prev ? fade : 1);
        ctx.fillStyle = "rgba(4,4,8,0.58)"; ctx.fillRect(0, 0, W, H);
      }
      const gx = W / 2 + Math.sin(k * 0.3) * 220, gy = H / 2 + Math.cos(k * 0.22) * 320;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 900);
      g.addColorStop(0, `rgba(${accent.join(",")},0.16)`); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (const p of ps) {
        p.y -= p.v; p.x += Math.sin(k + p.r) * 0.2;
        if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
        ctx.fillStyle = `rgba(255,240,220,${p.a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
      const L = ts.current;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (!L.length) {
        ctx.fillStyle = "#e8e8ee"; ctx.font = `600 64px ${font}`; ctx.fillText(text.slice(0, 28) || "Add timestamps", W / 2, H / 2);
      } else {
        let i = L.findIndex((w) => t < w.end_time); if (i < 0) i = L.length - 1;
        const cur = L[i], d = Math.max(0.01, cur.end_time - cur.start_time);
        const on = t >= cur.start_time, pr = on ? clamp((t - cur.start_time) / d) : 0;
        const shift = on ? ease(clamp((t - cur.start_time) / 0.25)) : 0;
        for (let j = -4; j <= 4; j++) {
          const w = L[i + j]; if (!w) continue;
          const off = j - shift + 1 - (on ? 0 : 1);
          const y = H / 2 + (j === 0 ? 0 : off * 150 + Math.sign(j) * 60);
          if (j === 0) {
            const e = on ? ease(clamp((t - cur.start_time) / 0.22)) : 0;
            const s = anim === "pop" ? (on ? 0.6 + 0.4 * e : 0.75) : 1;
            ctx.save(); ctx.translate(W / 2 + (anim === "slide" ? (1 - e) * 260 : 0), y); ctx.scale(s, s);
            if (anim === "slide") ctx.globalAlpha = on ? clamp(e + 0.2) : 0.3;
            ctx.fillStyle = `rgb(${mix([255, 255, 255], accent, on ? clamp(pr * 1.5) : 0).join(",")})`;
            ctx.shadowColor = `rgba(${accent.join(",")},0.6)`; ctx.shadowBlur = 40;
            ctx.font = `800 150px ${font}`;
            const shown = anim === "type" ? w.word.slice(0, on ? Math.max(1, Math.ceil(w.word.length * clamp(pr * 2))) : 0) : w.word;
            if (anim === "type") { ctx.textAlign = "left"; ctx.fillText(shown, -ctx.measureText(w.word).width / 2, 0); ctx.textAlign = "center"; }
            else ctx.fillText(shown, 0, 0);
            ctx.restore();
          } else {
            ctx.fillStyle = `rgba(150,150,160,${clamp(0.55 - Math.abs(j) * 0.11)})`;
            ctx.font = `500 ${64 - Math.abs(j) * 6}px ${font}`; ctx.fillText(w.word, W / 2, y);
          }
        }
      }
      if (lg.current) {
        const lw = 160, lh = lw * lg.current.height / lg.current.width;
        ctx.globalAlpha = 0.85; ctx.drawImage(lg.current, W - lw - 60, 80, lw, lh); ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [text, color, font, anim]);

  const record = async () => {
    if (recording) return rec.current?.stop();
    const a = au.current; if (!a?.src) return setMsg("Pehle audio add karo");
    try {
      if (!ac.current) {
        ac.current = new AudioContext();
        const src = ac.current.createMediaElementSource(a);
        dest.current = ac.current.createMediaStreamDestination();
        src.connect(dest.current); src.connect(ac.current.destination);
      }
      await ac.current.resume();
      const stream = new MediaStream([...cv.current.captureStream(30).getVideoTracks(), ...dest.current.stream.getAudioTracks()]);
      const mime = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 }), chunks = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        a.pause(); setRecording(false);
        const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
        const f = new File(chunks, `cinereel-kinetic.${ext}`, { type: mime.split(";")[0] }); setFile(f); onRecorded?.(f); import("../lib/firebase").then((m) => m.trackEvent("kinetic_record", { ext }));
        const el = Object.assign(document.createElement("a"), { href: URL.createObjectURL(f), download: f.name });
        el.click(); setMsg(ext === "mp4" ? "MP4 download ho gaya" : "Is browser me MP4 support nahi, WebM download hua");
      };
      a.onended = () => r.state === "recording" && r.stop();
      rec.current = r; a.currentTime = 0; r.start(250); await a.play(); setRecording(true); setMsg("Recording...");
    } catch (e) { setMsg(`Recording fail: ${e.message}`); setRecording(false); }
  };

  const shareWA = async () => {
    try {
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title, text: title });
    } catch (e) { if (e.name === "AbortError") return; }
    const t = encodeURIComponent(`${title} — video download ho chuka hai, WhatsApp me attach karke bhejo`);
    if (window.Capacitor?.isNativePlatform?.()) window.location.href = `whatsapp://send?text=${t}`;
    else window.open(`https://wa.me/?text=${t}`, "_blank", "noopener");
    setMsg("Video downloads me save hai — WhatsApp me attach karo");
  };

  return (
    <div data-testid="cinematic-text-renderer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <canvas ref={cv} width={W} height={H} data-testid="cinematic-canvas" style={{ width: "min(100%, 360px)", aspectRatio: "9/16", borderRadius: 16, background: "#06060a", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }} />
      <audio ref={au} src={audioSrc || undefined} crossOrigin="anonymous" controls data-testid="cinematic-audio" style={{ width: "min(100%, 360px)" }} />
      <button onClick={record} data-testid="cinematic-record-btn" style={{ padding: "10px 22px", borderRadius: 999, border: 0, fontWeight: 700, cursor: "pointer", background: recording ? "#e5484d" : `rgb(${accent.join(",")})`, color: "#111" }}>
        {recording ? "Stop & Download" : "Record 1080x1920 Video"}
      </button>
      {file && !recording && (
        <button onClick={shareWA} data-testid="cinematic-whatsapp-btn" style={{ padding: "8px 18px", borderRadius: 999, border: 0, fontWeight: 700, cursor: "pointer", background: "#25D366", color: "#111" }}>Share on WhatsApp</button>
      )}
      {msg && <p data-testid="cinematic-status" style={{ fontSize: 12, color: "#aaa", margin: 0 }}>{msg}</p>}
    </div>
  );
};

export default CinematicTextRenderer;
