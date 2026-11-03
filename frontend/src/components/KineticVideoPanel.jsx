import { useEffect, useState } from "react";
import { Type } from "lucide-react";
import { api } from "../lib/api";
import { assetUrl } from "../lib/assetUrl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { CinematicTextRenderer } from "./CinematicTextRenderer";

const FONTS = { "Cinematic Serif": "Georgia, serif", Outfit: "Outfit, sans-serif", Bold: "Impact, 'Arial Black', sans-serif", Mono: "'Courier New', monospace", Clean: "Helvetica, Arial, sans-serif" };
const scriptText = (s = {}) => [s.hook, s.body, s.cta].filter(Boolean).join(" ") || (s.scenes || []).map((x) => x.voiceover).join(" ");
const evenSplit = (text, dur) => {
  const w = text.split(/\s+/).filter(Boolean), d = dur / (w.length || 1);
  return w.map((word, i) => ({ word, start_time: i * d, end_time: (i + 1) * d }));
};

export const KineticVideoPanel = ({ project, onRefresh }) => {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState("#FFB040");
  const [font, setFont] = useState(FONTS["Cinematic Serif"]);
  const [kits, setKits] = useState([]);
  const [dur, setDur] = useState(0);
  const text = scriptText(project.script);
  const words = project.caption_words || [];
  const exact = words.length > 0;
  const ts = exact ? words.map((w) => ({ word: w.word, start_time: w.start, end_time: w.end })) : evenSplit(text, dur || 10);
  const src = assetUrl(project.audio_url);

  useEffect(() => {
    if (!open) return;
    api.get("/brand-kits").then(({ data }) => setKits(Array.isArray(data) ? data : data.kits || [])).catch(() => {});
    const a = new Audio(src); a.onloadedmetadata = () => setDur(a.duration);
  }, [open, src]);

  useEffect(() => {
    if (!open || project.word_timing_status !== "pending") return;
    const t = setInterval(onRefresh, 4000);
    return () => clearInterval(t);
  }, [open, project.word_timing_status, onRefresh]);

  const applyKit = (id) => {
    const k = kits.find((x) => x.kit_id === id); if (!k) return;
    setColor(k.primary_color || color);
    setFont(`${k.font || "Outfit"}, sans-serif`);
  };

  const status = exact ? "Exact word timing (audio se)" : project.word_timing_status === "pending" ? "Exact timing ban rahi hai… tab tak estimate" : "Estimated timing (audio se exact timing nahi mili)";

  return (
    <>
      <button data-testid="kinetic-video-open-btn" onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-full px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 bg-amber-400 text-black active:scale-95 transition-transform">
        <Type className="w-4 h-4" /> Kinetic Video
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="kinetic-video-dialog" className="max-w-md max-h-[92vh] overflow-y-auto bg-[#0A0A0B] border-white/10 text-white">
          <DialogHeader><DialogTitle>Kinetic Video</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <input data-testid="kinetic-color-input" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded bg-transparent" />
            <select data-testid="kinetic-font-select" value={font} onChange={(e) => setFont(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-2">
              {Object.entries(FONTS).map(([k, v]) => <option key={k} value={v}>{k}</option>)}
              {!Object.values(FONTS).includes(font) && <option value={font}>{font.split(",")[0]}</option>}
            </select>
            {kits.length > 0 && (
              <select data-testid="kinetic-brandkit-select" defaultValue="" onChange={(e) => applyKit(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-2">
                <option value="" disabled>Brand kit</option>
                {kits.map((k) => <option key={k.kit_id} value={k.kit_id}>{k.name}</option>)}
              </select>
            )}
          </div>
          <p data-testid="kinetic-timing-status" className="text-[11px] text-zinc-400">{status}</p>
          <CinematicTextRenderer text={text} timestamps={ts} audioSrc={src} color={color} font={font} title={project.title} />
        </DialogContent>
      </Dialog>
    </>
  );
};
