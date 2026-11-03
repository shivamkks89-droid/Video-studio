import { useState } from "react";
import { CinematicTextRenderer } from "../components/CinematicTextRenderer";

const SAMPLE = "Har kahani ek sapne se shuru hoti hai";
const autoTime = (text, dur) => {
  const w = text.trim().split(/\s+/).filter(Boolean), s = dur / (w.length || 1);
  return w.map((word, i) => ({ word, start_time: +(i * s).toFixed(2), end_time: +((i + 1) * s).toFixed(2) }));
};
const box = "w-full rounded-lg bg-white/5 border border-white/10 p-3 text-sm text-white";

export default function KineticTest() {
  const [text, setText] = useState(SAMPLE);
  const [json, setJson] = useState(JSON.stringify(autoTime(SAMPLE, 4), null, 1));
  const [src, setSrc] = useState("");
  const [url, setUrl] = useState("");
  let ts = [], err = "";
  try { ts = JSON.parse(json); if (!Array.isArray(ts)) throw new Error("Array chahiye"); } catch (e) { ts = []; err = e.message; }

  const fill = () => {
    const a = new Audio(src);
    a.onloadedmetadata = () => setJson(JSON.stringify(autoTime(text, a.duration || 4), null, 1));
    if (!src) setJson(JSON.stringify(autoTime(text, 4), null, 1));
  };

  return (
    <div data-testid="kinetic-test-page" className="p-4 lg:p-8 grid lg:grid-cols-2 gap-8 text-white">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Kinetic Text Test</h1>
        <textarea data-testid="kinetic-script-input" className={box} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2">
          <input data-testid="kinetic-audio-url-input" className={box} placeholder="Audio link (https://...mp3)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button data-testid="kinetic-audio-url-btn" className="px-4 rounded-lg bg-white/10" onClick={() => setSrc(url)}>Load</button>
        </div>
        <input data-testid="kinetic-audio-file-input" type="file" accept="audio/*" className="text-sm" onChange={(e) => e.target.files[0] && setSrc(URL.createObjectURL(e.target.files[0]))} />
        <button data-testid="kinetic-auto-time-btn" className="px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold" onClick={fill}>Auto timing (audio length se)</button>
        <textarea data-testid="kinetic-timestamps-input" className={`${box} font-mono`} rows={10} value={json} onChange={(e) => setJson(e.target.value)} />
        {err && <p data-testid="kinetic-json-error" className="text-red-400 text-xs">JSON error: {err}</p>}
      </div>
      <CinematicTextRenderer text={text} timestamps={ts} audioSrc={src} />
    </div>
  );
}
