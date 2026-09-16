import { useEffect, useState } from "react";
import { Loader2, Sparkles, Download, Rocket, Layers, Palette, Info } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { assetUrl } from "../lib/assetUrl";

const STYLES = [
  { id: "modern",  label: "Modern",  hint: "flat + bold geometry" },
  { id: "minimal", label: "Minimal", hint: "single glyph, breathing room" },
  { id: "playful", label: "Playful", hint: "rounded, cheerful colours" },
  { id: "premium", label: "Premium", hint: "luxury dark + gold" },
  { id: "tech",    label: "Tech",    hint: "neon, futuristic grid" },
];

const PRESET_COLORS = ["#E2FF3D", "#7C3AED", "#F97316", "#10B981",
                        "#EC4899", "#0EA5E9", "#F43F5E", "#111111"];

export default function PlayStoreAssets() {
  const [form, setForm] = useState({
    brand_name: "",
    tagline: "",
    style: "modern",
    primary_color: "#E2FF3D",
    icon_description: "",
    generate_icon: true,
    generate_feature: true,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const loadHistory = async () => {
    try {
      const { data } = await api.get("/studio/playstore-assets");
      setHistory(data || []);
    } catch { /* silent */ }
  };
  useEffect(() => { loadHistory(); }, []);

  const generate = async () => {
    if (!form.brand_name.trim()) return toast.error("Enter your brand name");
    if (!form.generate_icon && !form.generate_feature) {
      return toast.error("Pick at least one asset");
    }
    setBusy(true);
    const t = toast.loading("Generating Play Store assets… (~20s per image)");
    try {
      const { data } = await api.post("/studio/playstore-assets", form);
      setResult(data);
      toast.success("Assets ready — download below", { id: t });
      loadHistory();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Generation failed", { id: t });
    } finally {
      setBusy(false);
    }
  };

  const downloadAt = async (url, filename, targetW, targetH) => {
    try {
      const src = assetUrl(url);
      const res = await fetch(src);
      const blob = await res.blob();
      if (!targetW) {
        // straight download
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        return;
      }
      // Client-side resize to exact Play Store dimensions
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        // Cover fit
        const scale = Math.max(targetW / img.width, targetH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (targetW - w) / 2, (targetH - h) / 2, w, h);
        canvas.toBlob((b) => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          a.download = filename;
          a.click();
          URL.revokeObjectURL(a.href);
        }, "image/png", 1.0);
      };
      img.src = URL.createObjectURL(blob);
    } catch (e) {
      toast.error("Download failed");
    }
  };

  return (
    <div data-testid="playstore-assets-page" className="space-y-6 max-w-6xl">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ PLAY STORE KIT</div>
        <h1 className="text-3xl font-semibold tracking-tight">Ship your app in minutes.</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-2xl">
          Generate a 512×512 app icon and a 1024×500 feature graphic tuned for the
          Google Play Store — using your brand name, colour and style. Powered by
          Gemini Nano Banana.
        </p>
      </div>

      {/* Info tip */}
      <div className="surface rounded-xl p-4 flex items-start gap-3 border border-white/5" data-testid="ps-tip">
        <Info className="w-4 h-4 text-[#E2FF3D] mt-0.5 shrink-0" />
        <div className="text-xs text-zinc-300 leading-relaxed">
          <b>Google Play requires:</b> Hi-res icon <span className="text-white">512×512 PNG</span>{" "}
          + feature graphic <span className="text-white">1024×500 PNG/JPG</span>. Screenshots
          you'll capture in Android Studio separately.
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Form */}
        <div className="surface rounded-xl p-5 space-y-4" data-testid="ps-form">
          <div className="label-mono text-[#E2FF3D]">/ CONFIGURE · 12 CR</div>

          <div>
            <label className="label-mono text-zinc-500 text-[10px] mb-1 block">BRAND NAME *</label>
            <input data-testid="ps-brand-name" value={form.brand_name}
              onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
              placeholder="e.g. CineReel"
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30" />
          </div>

          <div>
            <label className="label-mono text-zinc-500 text-[10px] mb-1 block">TAGLINE (optional)</label>
            <input data-testid="ps-tagline" value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="AI video studio in your pocket"
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30" />
          </div>

          <div>
            <label className="label-mono text-zinc-500 text-[10px] mb-1 block">ICON SYMBOL (optional)</label>
            <input data-testid="ps-icon-desc" value={form.icon_description}
              onChange={(e) => setForm({ ...form, icon_description: e.target.value })}
              placeholder="e.g. film reel + lightning bolt"
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30" />
          </div>

          <div>
            <label className="label-mono text-zinc-500 text-[10px] mb-2 block">STYLE</label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button key={s.id} data-testid={`ps-style-${s.id}`}
                  onClick={() => setForm({ ...form, style: s.id })}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    form.style === s.id
                      ? "bg-[#E2FF3D] text-black font-semibold"
                      : "surface hover:border-white/30"
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-zinc-600 mt-1">
              {STYLES.find((s) => s.id === form.style)?.hint}
            </div>
          </div>

          <div>
            <label className="label-mono text-zinc-500 text-[10px] mb-2 block flex items-center gap-2">
              <Palette className="w-3 h-3" /> PRIMARY COLOUR
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button key={c} data-testid={`ps-color-${c.slice(1)}`}
                  onClick={() => setForm({ ...form, primary_color: c })}
                  className={`w-8 h-8 rounded-md border-2 transition ${
                    form.primary_color === c ? "border-white" : "border-white/10"
                  }`}
                  style={{ background: c }} />
              ))}
              <input type="color" value={form.primary_color}
                data-testid="ps-color-picker"
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                className="w-8 h-8 rounded-md bg-transparent border border-white/10 cursor-pointer" />
              <span className="text-xs text-zinc-400 font-mono">{form.primary_color}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-white/5">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" data-testid="ps-check-icon"
                checked={form.generate_icon}
                onChange={(e) => setForm({ ...form, generate_icon: e.target.checked })}
                className="accent-[#E2FF3D]" />
              App icon (512×512)
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" data-testid="ps-check-feature"
                checked={form.generate_feature}
                onChange={(e) => setForm({ ...form, generate_feature: e.target.checked })}
                className="accent-[#E2FF3D]" />
              Feature graphic (1024×500)
            </label>
          </div>

          <button data-testid="ps-generate" onClick={generate} disabled={busy}
            className="btn-volt rounded-full px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            {busy ? "Generating…" : "Generate assets"}
          </button>
        </div>

        {/* Result preview */}
        <div className="space-y-4" data-testid="ps-result">
          {/* Icon preview */}
          <div className="surface rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="label-mono text-[#E2FF3D]">/ APP ICON · 512×512</div>
              {result?.icon_url && (
                <button data-testid="ps-download-icon"
                  onClick={() => downloadAt(result.icon_url, `${form.brand_name || "app"}-icon-512.png`, 512, 512)}
                  className="rounded-full surface px-3 py-1 text-xs flex items-center gap-1 hover:border-white/30">
                  <Download className="w-3 h-3" /> Download PNG
                </button>
              )}
            </div>
            <div className="aspect-square w-40 rounded-2xl overflow-hidden bg-black/50 grid place-items-center">
              {result?.icon_url ? (
                <img src={assetUrl(result.icon_url)} alt="App icon" className="w-full h-full object-cover" />
              ) : (
                <Layers className="w-8 h-8 text-zinc-700" />
              )}
            </div>
            <div className="text-[10px] text-zinc-500 mt-2">
              Auto-resized to exact 512×512 PNG on download.
            </div>
          </div>

          {/* Feature graphic preview */}
          <div className="surface rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="label-mono text-[#E2FF3D]">/ FEATURE GRAPHIC · 1024×500</div>
              {result?.feature_url && (
                <button data-testid="ps-download-feature"
                  onClick={() => downloadAt(result.feature_url, `${form.brand_name || "app"}-feature-1024x500.png`, 1024, 500)}
                  className="rounded-full surface px-3 py-1 text-xs flex items-center gap-1 hover:border-white/30">
                  <Download className="w-3 h-3" /> Download PNG
                </button>
              )}
            </div>
            <div className="aspect-[1024/500] rounded-lg overflow-hidden bg-black/50 grid place-items-center">
              {result?.feature_url ? (
                <img src={assetUrl(result.feature_url)} alt="Feature graphic" className="w-full h-full object-cover" />
              ) : (
                <Sparkles className="w-8 h-8 text-zinc-700" />
              )}
            </div>
            <div className="text-[10px] text-zinc-500 mt-2">
              Auto-resized to exact 1024×500 PNG on download.
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <div className="label-mono text-zinc-500 mb-3">/ HISTORY ({history.length})</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {history.slice(0, 8).map((h) => (
              <button key={h.id} data-testid={`ps-history-${h.id}`}
                onClick={() => setResult({ icon_url: h.icon_url, feature_url: h.feature_url })}
                className="surface rounded-xl overflow-hidden text-left hover:border-white/30 transition">
                <div className="aspect-square bg-black/50">
                  {h.icon_url && <img src={assetUrl(h.icon_url)} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium truncate">{h.brand_name}</div>
                  <div className="label-mono text-zinc-500 text-[9px]">{h.style}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
