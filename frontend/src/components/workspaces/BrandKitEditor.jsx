import { useState } from "react";
import { Loader2, Palette, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { assetUrl } from "../../lib/assetUrl";

const FONTS = [["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"]];

export const BrandKitEditor = ({ ws, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kit, setKit] = useState({ primary: ws.color || "#E2FF3D", secondary: "#7C3AED", font: "sans", logo_url: null, ...(ws.brand_kit || {}) });
  const id = ws.workspace_id;

  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post(`/workspaces/${id}/logo`, fd);
      setKit((k) => ({ ...k, logo_url: data.logo_url }));
      toast.success("Logo uploaded");
    } catch (e) { toast.error(e.response?.data?.detail || "Upload failed"); } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/workspaces/${id}`, { brand_kit: kit });
      toast.success("Brand kit saved"); onSaved?.(); setOpen(false);
    } catch { toast.error("Save failed"); } finally { setBusy(false); }
  };

  if (!open) return (
    <button data-testid={`ws-kit-open-${id}`} onClick={() => setOpen(true)}
      className="w-full mt-3 flex items-center gap-2 rounded-lg bg-[#141416] px-3 py-2 text-xs hover:bg-[#1C1C1F] transition-colors">
      {kit.logo_url ? <img src={assetUrl(kit.logo_url)} alt="" className="w-5 h-5 rounded object-contain" /> : <Palette className="w-3.5 h-3.5 text-zinc-500" />}
      <span className="flex-1 text-left">{ws.brand_kit ? "Brand kit" : "Set up brand kit"}</span>
      <span className="w-3 h-3 rounded-full" style={{ background: kit.primary }} />
      <span className="w-3 h-3 rounded-full" style={{ background: kit.secondary }} />
    </button>
  );

  return (
    <div className="mt-3 rounded-lg bg-[#0A0A0B] border border-white/10 p-3 space-y-3" data-testid={`ws-kit-${id}`}>
      <label className="flex items-center gap-3 text-xs cursor-pointer">
        <div className="w-12 h-12 rounded-lg bg-[#141416] grid place-items-center overflow-hidden">
          {kit.logo_url ? <img src={assetUrl(kit.logo_url)} alt="logo" className="w-full h-full object-contain" /> : <Upload className="w-4 h-4 text-zinc-600" />}
        </div>
        <span className="text-zinc-400">Logo (PNG, transparent best)</span>
        <input data-testid={`ws-kit-logo-${id}`} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      <div className="flex gap-3">
        {[["primary", "Primary"], ["secondary", "Secondary"]].map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-xs text-zinc-400">
            <input data-testid={`ws-kit-${k}-${id}`} type="color" value={kit[k]} onChange={(e) => setKit({ ...kit, [k]: e.target.value })}
              className="w-7 h-7 rounded bg-transparent border border-white/10 cursor-pointer" />{l}
          </label>
        ))}
      </div>
      <div className="flex gap-1.5">
        {FONTS.map(([f, l]) => (
          <button key={f} data-testid={`ws-kit-font-${f}-${id}`} onClick={() => setKit({ ...kit, font: f })}
            className={`flex-1 rounded-full py-1 text-xs transition-colors ${kit.font === f ? "bg-white text-black font-semibold" : "bg-[#141416] hover:bg-[#1C1C1F]"}`}
            style={{ fontFamily: f === "serif" ? "Georgia, serif" : f === "mono" ? "monospace" : undefined }}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button data-testid={`ws-kit-save-${id}`} onClick={save} disabled={busy}
          className="btn-volt rounded-full px-3 py-1.5 text-xs flex items-center gap-1 disabled:opacity-60">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save kit
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 px-2">Cancel</button>
      </div>
    </div>
  );
};
