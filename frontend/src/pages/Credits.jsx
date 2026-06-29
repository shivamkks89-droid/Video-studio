import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Credits() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/credits/history").then(({data}) => setItems(data)); }, []);
  return (
    <div data-testid="credits-page" className="space-y-6">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ CREDITS & USAGE</div>
        <h1 className="text-4xl font-semibold tracking-tight">Track every render.</h1>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <Stat title="Available credits" value={user?.credits} testid="stat-credits" />
        <Stat title="Plan" value={user?.plan?.toUpperCase()} testid="stat-plan" />
        <Stat title="Lifetime actions" value={items.length} testid="stat-actions" />
      </div>
      <div className="surface rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="label-mono text-zinc-500 bg-[#1C1C1F]">
            <tr><th className="text-left p-3">DATE</th><th className="text-left p-3">REASON</th><th className="text-right p-3">DELTA</th></tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan="3" className="p-10 text-center text-zinc-500">No usage yet.</td></tr>
            )}
            {items.map(t => (
              <tr key={t.txn_id} className="border-t border-white/5">
                <td className="p-3 text-zinc-400">{new Date(t.created_at).toLocaleString()}</td>
                <td className="p-3">{t.reason}</td>
                <td className={`p-3 text-right ${t.delta>0?"text-emerald-400":"text-red-400"}`}>{t.delta>0?"+":""}{t.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Stat({ title, value, testid }) {
  return (
    <div data-testid={testid} className="surface rounded-xl p-6">
      <div className="label-mono text-zinc-500 mb-2">{title}</div>
      <div className="text-3xl font-semibold">{value}</div>
    </div>
  );
}
