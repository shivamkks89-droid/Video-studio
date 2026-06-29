import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Palette, Plus, Trash2 } from "lucide-react";

export default function BrandKit() {
  const [kits, setKits] = useState([]);
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState("#E2FF3D");
  const [secondary, setSecondary] = useState("#0A0A0B");
  const [accent, setAccent] = useState("#FFFFFF");
  const [font, setFont] = useState("Outfit");
  const [logo, setLogo] = useState("");

  const load = async () => { const { data } = await api.get("/brand-kits"); setKits(data); };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name) return toast.error("Add a kit name");
    try {
      await api.post("/brand-kits", { name, primary_color: primary, secondary_color: secondary, accent_color: accent, font, logo_url: logo });
      toast.success("Brand kit saved"); setName(""); setLogo(""); load();
    } catch { toast.error("Could not save"); }
  };
  const del = async (id) => {
    await api.delete(`/brand-kits/${id}`); load();
  };

  return (
    <div data-testid="brand-kit-page" className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-4">
        <div>
          <div className="label-mono text-zinc-500 mb-2">/ BRAND KIT</div>
          <h1 className="text-3xl font-semibold tracking-tight">Lock in your brand.</h1>
        </div>
        <form onSubmit={create} className="surface rounded-xl p-5 space-y-4">
          <Inp label="Kit name" value={name} setValue={setName} testid="bk-name" />
          <div className="grid grid-cols-3 gap-3">
            <ColorInp label="Primary" value={primary} setValue={setPrimary} testid="bk-primary" />
            <ColorInp label="Secondary" value={secondary} setValue={setSecondary} testid="bk-secondary" />
            <ColorInp label="Accent" value={accent} setValue={setAccent} testid="bk-accent" />
          </div>
          <Inp label="Font" value={font} setValue={setFont} testid="bk-font" />
          <Inp label="Logo URL" value={logo} setValue={setLogo} testid="bk-logo" />
          <button data-testid="bk-save" className="btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Save kit</button>
        </form>
      </div>
      <div className="lg:col-span-7 space-y-3">
        {kits.length === 0 && (
          <div className="surface rounded-xl p-10 text-center">
            <Palette className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <div className="text-zinc-500">No brand kits yet.</div>
          </div>
        )}
        {kits.map((k) => (
          <div key={k.kit_id} data-testid={`bk-card-${k.kit_id}`} className="surface rounded-xl p-5 flex items-center gap-4">
            <div className="flex gap-1">
              <div style={{ background: k.primary_color }} className="w-8 h-8 rounded-full border border-white/10" />
              <div style={{ background: k.secondary_color }} className="w-8 h-8 rounded-full border border-white/10" />
              <div style={{ background: k.accent_color }} className="w-8 h-8 rounded-full border border-white/10" />
            </div>
            <div className="flex-1">
              <div className="font-medium">{k.name}</div>
              <div className="label-mono text-zinc-500">{k.font}</div>
            </div>
            {k.logo_url && <img src={k.logo_url} alt="" className="w-10 h-10 object-contain" />}
            <button onClick={() => del(k.kit_id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Inp({ label, value, setValue, testid }) {
  return (
    <div>
      <div className="label-mono text-zinc-500 mb-1.5">{label}</div>
      <input data-testid={testid} value={value} onChange={(e) => setValue(e.target.value)}
        className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30" />
    </div>
  );
}
function ColorInp({ label, value, setValue, testid }) {
  return (
    <div>
      <div className="label-mono text-zinc-500 mb-1.5">{label}</div>
      <div className="flex items-center gap-2 bg-[#0A0A0B] border border-white/10 rounded-lg p-1">
        <input data-testid={testid} type="color" value={value} onChange={(e)=>setValue(e.target.value)} className="w-8 h-8 bg-transparent border-0" />
        <span className="label-mono text-zinc-400">{value}</span>
      </div>
    </div>
  );
}
