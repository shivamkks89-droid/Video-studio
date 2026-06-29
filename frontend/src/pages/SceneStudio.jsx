import { useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { assetUrl } from "../lib/assetUrl";

const RATIOS = ["9:16", "16:9", "1:1"];

export default function SceneStudio() {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  const gen = async () => {
    if (!prompt.trim()) return toast.error("Add a prompt");
    setBusy(true);
    try {
      const { data } = await api.post("/ai/scene-image", { prompt, aspect_ratio: aspect });
      if (!data.image_url) toast.message("Image generation returned no asset.");
      setResults([{ prompt, aspect, url: data.image_url }, ...results].slice(0, 12));
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="scene-studio" className="space-y-6">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ SCENE STUDIO</div>
        <h1 className="text-3xl font-semibold tracking-tight">Paint cinematic stills.</h1>
        <p className="text-zinc-400 mt-2 text-sm">Powered by Gemini Nano Banana.</p>
      </div>
      <div className="surface rounded-xl p-5 grid md:grid-cols-12 gap-4">
        <div className="md:col-span-8">
          <div className="label-mono text-zinc-500 mb-2">Prompt</div>
          <textarea data-testid="sc-prompt" value={prompt} onChange={(e)=>setPrompt(e.target.value)} rows={3}
            className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 resize-none"
            placeholder="Mumbai skyline at golden hour, drone aerial, cinematic, volumetric god rays, lens flare" />
        </div>
        <div className="md:col-span-4">
          <div className="label-mono text-zinc-500 mb-2">Aspect</div>
          <div className="flex gap-2">
            {RATIOS.map(r => (
              <button key={r} data-testid={`sc-ratio-${r}`} onClick={()=>setAspect(r)}
                className={`flex-1 surface rounded-lg py-2 text-sm transition ${aspect===r?"border-[#E2FF3D] text-[#E2FF3D]":""}`}>{r}</button>
            ))}
          </div>
          <button data-testid="sc-generate" onClick={gen} disabled={busy} className="btn-volt rounded-full w-full mt-4 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            {busy ? "Painting…" : "Generate"}
          </button>
        </div>
      </div>
      {results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {results.map((r, i) => (
            <div key={i} className="surface rounded-xl overflow-hidden">
              <div className={`relative ${r.aspect === "16:9" ? "ar-169" : r.aspect === "1:1" ? "ar-11" : "ar-916"} bg-[#0A0A0B]`}>
                {r.url ? <img src={assetUrl(r.url)} className="absolute inset-0 w-full h-full object-cover" alt="" /> :
                  <div className="absolute inset-0 grid place-items-center text-zinc-700"><ImageIcon className="w-8 h-8" /></div>}
              </div>
              <div className="p-3 text-xs text-zinc-500 line-clamp-3">{r.prompt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
