import { useEffect, useRef, useState } from "react";
import { UserPlus, Loader2, Upload, Trash2, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { assetUrl } from "../lib/assetUrl";

const STYLES = [
  { id: "presenter", label: "Presenter" },
  { id: "ugc", label: "UGC Creator" },
  { id: "corporate", label: "Corporate" },
  { id: "influencer", label: "Influencer" },
  { id: "cinematic", label: "Cinematic" },
];

export default function AvatarStudio() {
  const [avatars, setAvatars] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState({ name: "My Presenter", prompt: "young Indian woman, warm smile, TV presenter",
    style: "presenter", gender: "female", age_range: "25-34" });
  const [busy, setBusy] = useState(false);
  const [uploadName, setUploadName] = useState("Uploaded avatar");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const [a, s] = await Promise.all([api.get("/avatars"), api.get("/avatars/status")]);
      setAvatars(a.data || []);
      setStatus(s.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    if (!gen.prompt.trim() || !gen.name.trim()) return toast.error("Name + description required");
    setBusy(true);
    const t = toast.loading("Generating avatar via Nano Banana…");
    try {
      const { data } = await api.post("/avatars/generate", gen);
      setAvatars((prev) => [data, ...prev]);
      toast.success(`"${data.name}" generated`, { id: t });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Generate failed", { id: t });
    } finally { setBusy(false); }
  };

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Max 10 MB");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", uploadName);
      fd.append("style", "presenter");
      const { data } = await api.post("/avatars/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAvatars((prev) => [data, ...prev]);
      toast.success("Avatar uploaded");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this avatar?")) return;
    try {
      await api.delete(`/avatars/${id}`);
      setAvatars((prev) => prev.filter((a) => a.avatar_id !== id));
      toast.success("Deleted");
    } catch (e) { toast.error("Delete failed"); }
  };

  if (loading) return (
    <div className="grid place-items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-zinc-500"/></div>
  );

  const hasLipsync = status?.lipsync?.some((p) => p.configured);

  return (
    <div data-testid="avatar-studio" className="space-y-6">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ AVATAR STUDIO</div>
        <h1 className="text-3xl font-semibold tracking-tight">Talking-head presenters, on demand.</h1>
        <p className="text-zinc-400 text-sm mt-2">
          Generate AI presenter images (Nano Banana) or upload your own. Pair with any voice — real lip-sync when you connect HeyGen/D-ID.
        </p>
      </div>

      {/* Provider status */}
      {status && (
        <div className="surface rounded-xl p-4 flex items-start gap-3" data-testid="av-provider-status">
          <Info className="w-4 h-4 text-[#E2FF3D] mt-0.5"/>
          <div className="flex-1 text-xs text-zinc-300">
            <div className="mb-1">
              <b>Image Generation:</b> {status.generators.map(g => g.name).join(", ")} <span className="text-green-400">✓ Active</span>
            </div>
            <div>
              <b>Lip-Sync:</b>{" "}
              {hasLipsync ? (
                <span className="text-green-400">
                  {status.lipsync.filter(p => p.configured).map(p => p.name).join(", ")} ✓
                </span>
              ) : (
                <span className="text-amber-400">
                  Not configured — add HEYGEN_API_KEY or DID_API_KEY to backend .env for real talking avatars.
                  Meanwhile you can still pair avatar image + voice as a still-frame ad.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Generator */}
        <div className="surface rounded-xl p-5 space-y-3" data-testid="av-gen-form">
          <div className="label-mono text-[#E2FF3D]">/ GENERATE AVATAR · 15 CR</div>
          <input data-testid="av-name" value={gen.name} onChange={(e)=>setGen({...gen,name:e.target.value})}
            placeholder="Avatar name" className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"/>
          <textarea data-testid="av-prompt" value={gen.prompt} onChange={(e)=>setGen({...gen,prompt:e.target.value})} rows={3}
            placeholder="e.g. young Indian woman, warm smile, TV presenter"
            className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none"/>
          <div>
            <div className="label-mono text-zinc-500 mb-2 text-[10px]">STYLE</div>
            <div className="flex gap-2 flex-wrap">
              {STYLES.map((s) => (
                <button key={s.id} data-testid={`av-style-${s.id}`} onClick={()=>setGen({...gen,style:s.id})}
                  className={`rounded-full px-3 py-1.5 text-xs ${gen.style===s.id ? "bg-[#E2FF3D] text-black font-semibold" : "surface"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select data-testid="av-gender" value={gen.gender} onChange={(e)=>setGen({...gen,gender:e.target.value})}
              className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-xs">
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non_binary">Non-binary</option>
            </select>
            <select data-testid="av-age" value={gen.age_range} onChange={(e)=>setGen({...gen,age_range:e.target.value})}
              className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-xs">
              <option value="18-24">18-24</option>
              <option value="25-34">25-34</option>
              <option value="35-45">35-45</option>
              <option value="45+">45+</option>
            </select>
          </div>
          <button data-testid="av-generate" onClick={generate} disabled={busy}
            className="btn-volt rounded-full px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
            {busy ? "Generating…" : "Generate avatar"}
          </button>
        </div>

        {/* Upload */}
        <div className="surface rounded-xl p-5 space-y-3" data-testid="av-upload-form">
          <div className="label-mono text-[#E2FF3D]">/ UPLOAD YOUR OWN</div>
          <input value={uploadName} onChange={(e)=>setUploadName(e.target.value)} placeholder="Avatar name"
            className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"/>
          <div className="text-xs text-zinc-400">
            Upload a portrait photo (PNG/JPG, ≤10 MB). Best results: front-facing, well-lit, single person, plain background.
          </div>
          <input ref={fileRef} type="file" accept="image/*" data-testid="av-upload-file"
            onChange={(e)=>upload(e.target.files?.[0])} className="hidden"/>
          <button data-testid="av-upload-btn" onClick={()=>fileRef.current?.click()} disabled={uploading}
            className="rounded-full surface px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
            {uploading ? "Uploading…" : "Choose image"}
          </button>
        </div>
      </div>

      {/* Library */}
      <div>
        <div className="label-mono text-zinc-500 mb-3">/ MY AVATARS ({avatars.length})</div>
        {avatars.length === 0 ? (
          <div className="surface rounded-xl p-10 text-center">
            <UserPlus className="w-8 h-8 text-zinc-700 mx-auto mb-3"/>
            <div className="text-zinc-400">No avatars yet. Generate or upload one above.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {avatars.map((av) => (
              <div key={av.avatar_id} data-testid={`av-card-${av.avatar_id}`} className="surface rounded-xl overflow-hidden">
                <div className="aspect-[3/4] bg-black">
                  <img src={assetUrl(av.image_url)} alt={av.name} className="w-full h-full object-cover"/>
                </div>
                <div className="p-3">
                  <div className="text-sm font-medium truncate">{av.name}</div>
                  <div className="label-mono text-zinc-500 text-[10px] mb-2">
                    {av.style} · {av.gender || "—"} · {av.source}
                  </div>
                  <div className="flex justify-between gap-2">
                    <button className="text-[10px] text-zinc-400"
                      onClick={()=>{navigator.clipboard.writeText(av.avatar_id); toast.success("ID copied");}}>
                      Copy ID
                    </button>
                    <button data-testid={`av-del-${av.avatar_id}`} onClick={()=>del(av.avatar_id)}
                      className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
