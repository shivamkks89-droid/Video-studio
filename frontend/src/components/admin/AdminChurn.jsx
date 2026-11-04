import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserMinus, Mail } from "lucide-react";
import { api } from "../../lib/api";

export const AdminChurn = () => {
  const [rows, setRows] = useState([]);
  const load = () => api.get("/admin/churn").then(({ data }) => setRows(data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const winback = async (id) => {
    try { await api.post(`/admin/churn/${id}/winback`); toast.success("Win-back email bheja"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Email nahi gaya"); }
  };
  return (
    <div data-testid="admin-churn">
      <div className="label-mono text-zinc-500 mb-3 flex items-center gap-2"><UserMinus className="w-4 h-4 text-amber-400" /> / NOT RENEWED · LAST 30 DAYS ({rows.length})</div>
      <div className="surface rounded-xl divide-y divide-white/5">
        {rows.length === 0 && <div className="p-4 text-sm text-zinc-500">Sab ne renew kiya, ya abhi koi plan khatam nahi hua</div>}
        {rows.map((r) => (
          <div key={r.user_id} data-testid={`churn-row-${r.user_id}`} className="p-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-white">{r.email}</span>
            <span className="text-zinc-500 text-xs flex-1 capitalize">{r.plan} · ₹{r.amount_inr} · {r.days_ago} din pehle khatam{r.winback_at ? ` · email bheja ${new Date(r.winback_at).toLocaleDateString()}` : ""}</span>
            <button data-testid={`churn-winback-${r.user_id}`} onClick={() => winback(r.user_id)} className="text-xs flex items-center gap-1 text-[#E2FF3D]"><Mail className="w-3.5 h-3.5" /> Win-back email</button>
          </div>
        ))}
      </div>
    </div>
  );
};
