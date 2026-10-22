import { useState } from "react";
import { Download, Images, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { assetUrl } from "../../lib/assetUrl";
import { saveBlob } from "./saveBlob";
import { ShotSourcePicker } from "./ShotSourcePicker";

const EMPTY = Array.from({ length: 6 }, () => ({ headline: "", sub: "" }));

export const ScreenshotGenerator = () => {
  const [source, setSource] = useState("video");
  const [projectId, setProjectId] = useState(null);
  const [files, setFiles] = useState([]);
  const [brand, setBrand] = useState("CineReel AI");
  const [bgStyle, setBgStyle] = useState("brand");
  const [items, setItems] = useState(EMPTY);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);

  const writeAI = async () => {
    setBusy("ai");
    try {
      const { data } = await api.post("/studio/playstore-screenshots/headlines",
        { brand_name: brand, project_id: source === "video" ? projectId : null, source });
      setItems(data.items);
      toast.success(`Headlines ready · ${data.credits_left} credits left`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "AI failed");
    } finally { setBusy(""); }
  };

  const compose = async () => {
    if (items.some((i) => !i.headline.trim())) return toast.error("Sab 6 headlines bharo (ya AI se likhwao)");
    if (source === "video" && !projectId) return toast.error("Pick a rendered project");
    if (source === "app" && !files.length) return toast.error("Upload at least 1 app screen");
    const fd = new FormData();
    fd.append("source", source); fd.append("items", JSON.stringify(items));
    fd.append("bg_style", bgStyle); fd.append("brand_name", brand);
    if (projectId) fd.append("project_id", projectId);
    files.forEach((f) => fd.append("files", f));
    setBusy("compose");
    try {
      const { data } = await api.post("/studio/playstore-screenshots", fd);
      setResult(data);
      toast.success("6 screenshots ready");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Compose failed");
    } finally { setBusy(""); }
  };

  const downloadZip = async () => {
    const { data } = await api.get(`/studio/playstore-screenshots/${result.id}/zip`, { responseType: "blob" });
    saveBlob(data, "playstore-screenshots.zip");
  };

  const setItem = (i, k, v) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  return (
    <div className="surface rounded-xl p-5 space-y-5" data-testid="screenshot-generator">
      <div>
        <div className="label-mono text-[#E2FF3D] flex items-center gap-2"><Images className="w-3 h-3" /> / PLAY STORE SCREENSHOTS · 1080×1920</div>
        <p className="text-xs text-zinc-400 mt-1">6 hero screenshots, phone frame + headline ke saath. AI headlines 2 CR · compose free.</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <ShotSourcePicker {...{ source, setSource, projectId, setProjectId, files, setFiles }} />
          <input data-testid="shots-brand-name" value={brand} onChange={(e) => setBrand(e.target.value)}
            placeholder="App name" className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30" />
          <div className="flex gap-2">
            {[["brand", "Brand dark gradient"], ["multi", "Har screenshot alag colour"]].map(([id, l]) => (
              <button key={id} data-testid={`shots-bg-${id}`} onClick={() => setBgStyle(id)}
                className={`flex-1 rounded-full px-3 py-1.5 text-xs transition-colors ${bgStyle === id ? "bg-white text-black font-semibold" : "surface hover:border-white/30"}`}>{l}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button data-testid="shots-ai-headlines" onClick={writeAI} disabled={!!busy}
              className="surface rounded-full px-4 py-2 text-xs flex items-center gap-2 hover:border-white/30 disabled:opacity-60">
              {busy === "ai" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} AI headlines · 2 CR
            </button>
            <button data-testid="shots-compose" onClick={compose} disabled={!!busy}
              className="btn-volt rounded-full px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-60">
              {busy === "compose" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Images className="w-3 h-3" />} Compose 6 screenshots
            </button>
          </div>
        </div>
        <div className="space-y-2" data-testid="shots-headlines">
          {items.map((it, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="label-mono text-zinc-600 text-[10px] pt-2.5 w-5">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex-1 grid sm:grid-cols-2 gap-1.5">
                <input data-testid={`shots-headline-${i}`} value={it.headline} onChange={(e) => setItem(i, "headline", e.target.value)}
                  placeholder="Headline" maxLength={60} className="bg-[#0A0A0B] border border-white/10 rounded-md px-2 py-1.5 text-xs outline-none focus:border-white/30" />
                <input data-testid={`shots-sub-${i}`} value={it.sub} onChange={(e) => setItem(i, "sub", e.target.value)}
                  placeholder="Sub-line (optional)" maxLength={80} className="bg-[#0A0A0B] border border-white/10 rounded-md px-2 py-1.5 text-xs outline-none focus:border-white/30" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {result && (
        <div className="space-y-3" data-testid="shots-result">
          <div className="flex items-center justify-between">
            <div className="label-mono text-zinc-500">/ RESULT</div>
            <button data-testid="shots-download-zip" onClick={downloadZip}
              className="rounded-full surface px-3 py-1 text-xs flex items-center gap-1 hover:border-white/30"><Download className="w-3 h-3" /> Download all (ZIP)</button>
          </div>
          <div className="flex lg:grid lg:grid-cols-6 gap-3 overflow-x-auto pb-2 snap-x">
            {result.urls.map((u, i) => (
              <a key={u} href={assetUrl(u)} target="_blank" rel="noreferrer" data-testid={`shots-img-${i}`}
                className="shrink-0 w-32 lg:w-auto snap-start rounded-lg overflow-hidden border border-white/10 hover:border-white/30 transition-colors">
                <img src={assetUrl(u)} alt={`Screenshot ${i + 1}`} className="w-full aspect-[9/16] object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
