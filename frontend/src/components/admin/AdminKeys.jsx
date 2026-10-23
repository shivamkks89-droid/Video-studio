import { useEffect, useState } from "react";
import { KeyRound, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";

const SOURCE = { admin: "Set by admin", deploy: "Deploy key", none: "Not set" };

const KeyRow = ({ k, onDone }) => {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (value) => {
    setBusy(true);
    try {
      const { data } = await api.put("/admin/keys", { name: k.name, value });
      toast.success(`${k.label}: ${data.detail}`);
      setVal(""); onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); } finally { setBusy(false); }
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center py-3 border-b border-white/5" data-testid={`key-row-${k.name}`}>
      <div className="md:col-span-4">
        <div className="text-sm font-medium">{k.label}</div>
        <div className="text-[11px] text-zinc-500 font-mono">{k.name} · {k.masked || "—"} · {SOURCE[k.source]}</div>
      </div>
      <input data-testid={`key-input-${k.name}`} type="password" autoComplete="off" value={val} onChange={(e) => setVal(e.target.value)}
        placeholder="Paste new key" className="md:col-span-5 bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30" />
      <div className="md:col-span-3 flex gap-2">
        <button data-testid={`key-save-${k.name}`} disabled={busy || !val.trim()} onClick={() => save(val)}
          className="btn-volt rounded-full px-4 py-2 text-xs flex items-center gap-1 disabled:opacity-50">
          {busy && <Loader2 className="w-3 h-3 animate-spin" />} Test & save
        </button>
        {k.source === "admin" && (
          <button data-testid={`key-revert-${k.name}`} disabled={busy} onClick={() => save("")} title="Revert to deploy key"
            className="surface rounded-full px-3 py-2 text-xs flex items-center gap-1 hover:border-white/30"><RotateCcw className="w-3 h-3" /></button>
        )}
      </div>
    </div>
  );
};

export const AdminKeys = () => {
  const [keys, setKeys] = useState([]);
  const [log, setLog] = useState([]);
  const load = () => {
    api.get("/admin/keys").then(({ data }) => setKeys(data)).catch(() => {});
    api.get("/admin/keys/log").then(({ data }) => setLog(data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  return (
    <section className="surface rounded-xl p-5" data-testid="admin-keys">
      <div className="label-mono text-[#E2FF3D] flex items-center gap-2 mb-1"><KeyRound className="w-3 h-3" /> / API KEYS</div>
      <p className="text-xs text-zinc-500 mb-2">Naya key test hokar turant live ho jaata hai — redeploy ki zaroorat nahi.</p>
      {keys.map((k) => <KeyRow key={k.name} k={k} onDone={load} />)}
      <div className="mt-4" data-testid="key-log">
        <div className="label-mono text-zinc-500 text-[10px] mb-2">/ CHANGE LOG</div>
        {log.length === 0 ? <div className="text-xs text-zinc-600">Abhi tak koi change nahi.</div> : (
          <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
            {log.map((l, i) => (
              <div key={i} data-testid={`key-log-${i}`} className="py-2 text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-zinc-500 font-mono">{new Date(l.at).toLocaleString()}</span>
                <span className="text-white">{l.label}</span>
                <span className={l.action === "reverted" ? "text-amber-400" : "text-[#E2FF3D]"}>{l.action} → {l.masked || "—"}</span>
                <span className="text-zinc-400">by {l.by}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
