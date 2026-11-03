import { useEffect, useRef, useState } from "react";

const W = 1080, H = 1920;
const ease = (x) => { const c = 1.70158; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export const CinematicTextRenderer = ({ text = "", timestamps = [], audioSrc = "", accent = [255, 176, 64] }) => {
  const cv = useRef(null), au = useRef(null), ac = useRef(null), dest = useRef(null), rec = useRef(null);
  const ts = useRef(timestamps);
  const [recording, setRecording] = useState(false);
  const [msg, setMsg] = useState("");
  ts.current = timestamps;

  useEffect(() => {
    const ctx = cv.current.getContext("2d");
    const ps = Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2.4 + 0.4, v: Math.random() * 0.4 + 0.1, a: Math.random() * 0.5 + 0.1 }));
    let raf;
    const draw = (now) => {
      const t = au.current?.currentTime || 0, k = now / 1000;
      ctx.fillStyle = "#06060a"; ctx.fillRect(0, 0, W, H);
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
        ctx.fillStyle = "#e8e8ee"; ctx.font = "600 64px Georgia, serif"; ctx.fillText(text.slice(0, 28) || "Add timestamps", W / 2, H / 2);
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
            const s = on ? 0.6 + 0.4 * ease(clamp((t - cur.start_time) / 0.22)) : 0.75;
            ctx.save(); ctx.translate(W / 2, y); ctx.scale(s, s);
            ctx.fillStyle = `rgb(${mix([255, 255, 255], accent, on ? clamp(pr * 1.5) : 0).join(",")})`;
            ctx.shadowColor = `rgba(${accent.join(",")},0.6)`; ctx.shadowBlur = 40;
            ctx.font = "800 150px Georgia, serif"; ctx.fillText(w.word, 0, 0); ctx.restore();
          } else {
            ctx.fillStyle = `rgba(150,150,160,${clamp(0.55 - Math.abs(j) * 0.11)})`;
            ctx.font = `500 ${64 - Math.abs(j) * 6}px Georgia, serif`; ctx.fillText(w.word, W / 2, y);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [text, accent]);

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
        const el = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(chunks, { type: mime })), download: `cinereel-kinetic.${ext}` });
        el.click(); setMsg(ext === "mp4" ? "MP4 download ho gaya" : "Is browser me MP4 support nahi, WebM download hua");
      };
      a.onended = () => r.state === "recording" && r.stop();
      rec.current = r; a.currentTime = 0; r.start(250); await a.play(); setRecording(true); setMsg("Recording...");
    } catch (e) { setMsg(`Recording fail: ${e.message}`); setRecording(false); }
  };

  return (
    <div data-testid="cinematic-text-renderer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <canvas ref={cv} width={W} height={H} data-testid="cinematic-canvas" style={{ width: "min(100%, 360px)", aspectRatio: "9/16", borderRadius: 16, background: "#06060a", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }} />
      <audio ref={au} src={audioSrc || undefined} crossOrigin="anonymous" controls data-testid="cinematic-audio" style={{ width: "min(100%, 360px)" }} />
      <button onClick={record} data-testid="cinematic-record-btn" style={{ padding: "10px 22px", borderRadius: 999, border: 0, fontWeight: 700, cursor: "pointer", background: recording ? "#e5484d" : `rgb(${accent.join(",")})`, color: "#111" }}>
        {recording ? "Stop & Download" : "Record 1080x1920 Video"}
      </button>
      {msg && <p data-testid="cinematic-status" style={{ fontSize: 12, color: "#aaa", margin: 0 }}>{msg}</p>}
    </div>
  );
};

export default CinematicTextRenderer;
