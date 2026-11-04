import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";

export const AdminFraudSettings = () => {
  const [f, setF] = useState(null);
  useEffect(() => { api.get("/admin/fraud-settings").then(({ data }) => setF(data)).catch(() => {}); }, []);
  if (!f) return null;
  const save = async () => {
    try { const { data } = await api.put("/admin/fraud-settings", f); setF(data); toast.success("Fraud settings saved"); }
    catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
  };
  const inp = "bg-[#0A0A0B] border border-white/10 rounded-md px-3 py-2 text-sm text-white";
  return (
    <div data-testid="admin-fraud-settings" className="surface rounded-xl p-4 mb-3 flex flex-wrap items-end gap-3 text-xs text-zinc-400">
      <label className="space-y-1 flex-1 min-w-[14rem]"><span>Alert email</span>
        <input data-testid="fraud-alert-email" type="email" value={f.alert_email} onChange={(e) => setF({ ...f, alert_email: e.target.value })} className={`${inp} w-full`} />
      </label>
      <label className="flex items-center gap-2 py-2">
        <input data-testid="fraud-auto-block" type="checkbox" checked={f.auto_block} onChange={(e) => setF({ ...f, auto_block: e.target.checked })} />
        <span>Auto-block jab ek phone pe</span>
        <input data-testid="fraud-auto-block-count" type="number" min={2} value={f.auto_block_accounts} onChange={(e) => setF({ ...f, auto_block_accounts: e.target.value })} className={`${inp} w-16`} />
        <span>ya zyada accounts</span>
      </label>
      <button data-testid="fraud-settings-save" onClick={save} className="btn-volt rounded-full px-5 py-2 text-sm">Save</button>
    </div>
  );
};
