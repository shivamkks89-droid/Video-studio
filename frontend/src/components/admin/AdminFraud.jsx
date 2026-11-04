import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, Check, Ban } from "lucide-react";
import { api } from "../../lib/api";

const KIND = {
  disposable_email: "Disposable email", multi_account_device: "Same device, many accounts", multi_account_ip: "Same IP, many accounts",
  credit_burst: "Too many renders fast", payment_bad_signature: "Fake payment signature", payment_reuse: "Payment reused", payment_mismatch: "Payment amount mismatch",
};

export const AdminFraud = () => {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("open");
  const load = () => api.get(`/admin/fraud?status=${status}`).then(({ data }) => setRows(data)).catch(() => toast.error("Fraud alerts load nahi hue"));
  useEffect(() => { load(); }, [status]); // eslint-disable-line
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); load(); } catch (e) { toast.error(e.response?.data?.detail || "Failed"); } };

  return (
    <div data-testid="admin-fraud">
      <div className="flex items-center justify-between mb-3">
        <div className="label-mono text-zinc-500 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-400" /> / FRAUD ALERTS ({rows.length})</div>
        <select data-testid="admin-fraud-status" value={status} onChange={(e) => setStatus(e.target.value)} className="bg-[#0A0A0B] border border-white/10 rounded-md px-2 py-1 text-xs">
          <option value="open">Open</option><option value="resolved">Resolved</option>
        </select>
      </div>
      <div className="surface rounded-xl divide-y divide-white/5">
        {rows.length === 0 && <div className="p-4 text-sm text-zinc-500">Koi alert nahi 🎉</div>}
        {rows.map((r) => (
          <div key={r.alert_id} data-testid={`fraud-row-${r.alert_id}`} className="p-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-red-500/10 text-red-300 px-2 py-0.5 text-xs">{KIND[r.kind] || r.kind}</span>
            <span className="text-white">{r.email}</span>
            <span className="text-zinc-500 text-xs flex-1 min-w-[12rem]">{r.detail} · {new Date(r.created_at).toLocaleString()}</span>
            <button data-testid={`fraud-block-${r.alert_id}`} onClick={() => act(() => api.post(`/admin/users/${r.user_id}/block`, { blocked: !r.blocked }), r.blocked ? "Unblocked" : "Blocked")}
              className={`text-xs flex items-center gap-1 ${r.blocked ? "text-emerald-400" : "text-red-400"}`}><Ban className="w-3.5 h-3.5" /> {r.blocked ? "Unblock" : "Block user"}</button>
            {r.status === "open" && (
              <button data-testid={`fraud-resolve-${r.alert_id}`} onClick={() => act(() => api.post(`/admin/fraud/${r.alert_id}/resolve`), "Resolved")}
                className="text-xs flex items-center gap-1 text-zinc-300"><Check className="w-3.5 h-3.5" /> Resolve</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
