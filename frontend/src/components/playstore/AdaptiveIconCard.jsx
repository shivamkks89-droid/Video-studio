import { useState } from "react";
import { Download, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { api, API } from "../../lib/api";
import { saveBlob } from "./saveBlob";

const SHAPES = [
  { id: "circle", label: "Pixel / circle" },
  { id: "squircle", label: "Samsung / squircle" },
  { id: "foreground", label: "Foreground layer" },
  { id: "background", label: "Background layer" },
  { id: "monochrome", label: "Themed (Android 13+)" },
];

export const AdaptiveIconCard = () => {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/studio/adaptive-icon.zip", { responseType: "blob" });
      saveBlob(data, "cinereel-adaptive-icon.zip");
      toast.success("Adaptive icon ZIP downloaded");
    } catch {
      toast.error("Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface rounded-xl p-5 space-y-4" data-testid="adaptive-icon-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label-mono text-[#E2FF3D] flex items-center gap-2">
            <Smartphone className="w-3 h-3" /> / ADAPTIVE ICON · FREE
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl leading-relaxed">
            Foreground + background + themed layers for every density. Already installed in the
            Android project — har launcher (Pixel, Samsung, OnePlus, Xiaomi) pe sahi shape milega.
          </p>
        </div>
        <button data-testid="adaptive-icon-download" onClick={download} disabled={busy}
          className="btn-volt rounded-full px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          Download ZIP
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {SHAPES.map((s) => (
          <div key={s.id} className="text-center" data-testid={`adaptive-preview-${s.id}`}>
            <div className="aspect-square rounded-lg bg-[repeating-conic-gradient(#1a1a1d_0%_25%,#111113_0%_50%)] bg-[length:16px_16px] grid place-items-center p-2">
              <img src={`${API}/studio/adaptive-icon/preview/${s.id}.png`} alt={s.label}
                className={`w-full h-full object-contain ${s.id === "monochrome" ? "opacity-80" : ""}`} />
            </div>
            <div className="text-[10px] text-zinc-500 mt-1 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
