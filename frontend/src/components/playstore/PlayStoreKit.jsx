import { useState } from "react";
import { Loader2, Package, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { assetUrl } from "../../lib/assetUrl";

const saveBlob = (blob, name) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

const CopyRow = ({ label, text, id }) => (
  <div className="rounded-lg border border-white/10 p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="label-mono text-zinc-500">{label} · {text.length} chars</span>
      <button data-testid={`kit-copy-${id}`} onClick={() => { navigator.clipboard.writeText(text); toast.success(`${label} copy ho gaya`); }}
        className="text-xs flex items-center gap-1 rounded-full px-3 py-1 border border-white/15"><Copy className="w-3 h-3" /> Copy</button>
    </div>
    <p className="text-sm mt-1.5 whitespace-pre-line max-h-40 overflow-y-auto">{text}</p>
  </div>
);

export const PlayStoreKit = () => {
  const [appId, setAppId] = useState("");
  const [kit, setKit] = useState(null);
  const [busy, setBusy] = useState(false);

  const make = async () => {
    if (!appId.trim()) return toast.error("Play Store ID ya link daalein");
    if (!window.confirm("Poora kit (listing text, feature graphic, 4 screenshots, 15s promo video) — 20 CR. Banayein?")) return;
    setBusy(true); setKit(null);
    try {
      const { data } = await api.post("/studio/playstore-kit", { app_id: appId.trim() });
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const { data: k } = await api.get(`/studio/playstore-kit/${data.kit_id}`);
        if (k.status === "complete") { setKit(k); toast.success("Kit ready!"); return; }
        if (k.status === "failed") { toast.error(`Kit nahi bana (credits wapas): ${k.error || ""}`); return; }
      }
      toast.error("Bahut der lag gayi, thodi der baad dobara try karein");
    } catch (e) { toast.error(e?.response?.data?.detail || "Kit nahi bana"); }
    finally { setBusy(false); }
  };
  const zip = async () => {
    const { data } = await api.get(`/studio/playstore-kit/${kit.id}/zip`, { responseType: "blob" });
    saveBlob(data, `playstore-kit-${kit.app_id}.zip`);
  };

  return (
    <div data-testid="playstore-kit" className="surface rounded-xl p-5 space-y-4 border border-[#E2FF3D]/20">
      <div className="flex items-center gap-2 font-semibold"><Package className="w-5 h-5 text-[#E2FF3D]" /> All-in-one Play Store Kit</div>
      <p className="text-xs text-zinc-400">Play Store ID ya link daalo — title, short + full description, feature graphic, 4 screenshot designs aur 15 sec promo video ek saath. Fixed 20 CR.</p>
      <div className="flex gap-2 flex-wrap">
        <input data-testid="kit-app-id" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="com.example.app ya Play Store link"
          className="flex-1 min-w-[220px] bg-transparent border border-white/10 rounded-full px-4 py-2 text-sm" />
        <button data-testid="kit-generate" onClick={make} disabled={busy} className="btn-volt rounded-full px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Ban raha hai (~1 min)…</> : "Kit banao · 20 CR"}
        </button>
      </div>
      {kit && (
        <div data-testid="kit-result" className="space-y-3">
          <button data-testid="kit-download-zip" onClick={zip} className="btn-volt rounded-full px-5 py-2 text-sm flex items-center gap-2"><Download className="w-4 h-4" /> Poora kit ZIP download</button>
          <CopyRow id="title" label="Title" text={kit.listing.title} />
          <CopyRow id="short" label="Short description" text={kit.listing.short} />
          <CopyRow id="full" label="Full description" text={kit.listing.full} />
          <img data-testid="kit-feature" src={assetUrl(kit.feature_text_url)} alt="Feature graphic" className="w-full rounded-lg" />
          <div className="grid grid-cols-4 gap-2">
            {(kit.screenshot_urls || []).map((u, i) => <img key={u} data-testid={`kit-shot-${i}`} src={assetUrl(u)} alt={`Screenshot ${i + 1}`} className="rounded-md" />)}
          </div>
          <video data-testid="kit-promo" src={assetUrl(kit.promo_url)} controls className="w-48 rounded-lg" />
        </div>
      )}
    </div>
  );
};
