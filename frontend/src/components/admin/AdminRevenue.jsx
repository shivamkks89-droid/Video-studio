import { useEffect, useState } from "react";
import { IndianRupee } from "lucide-react";
import { api } from "../../lib/api";

const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export const AdminRevenue = () => {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/admin/revenue").then(({ data }) => setD(data)).catch(() => {}); }, []);
  if (!d) return null;
  const max = Math.max(1, ...d.months.map((m) => m.revenue_inr));
  return (
    <div data-testid="admin-revenue">
      <div className="label-mono text-zinc-500 mb-3 flex items-center gap-2"><IndianRupee className="w-4 h-4 text-[#E2FF3D]" /> / REVENUE (RAZORPAY)</div>
      <div className="grid lg:grid-cols-3 gap-3">
        <div className="surface rounded-xl p-5">
          <div className="label-mono text-zinc-500 text-[10px]">TOTAL REVENUE</div>
          <div data-testid="revenue-total" className="text-3xl font-semibold mt-1">{inr(d.total_inr)}</div>
          <div className="label-mono text-zinc-500 text-[10px] mt-5 mb-2">ACTIVE PLANS</div>
          {Object.keys(d.active_plans).length === 0 && <div className="text-sm text-zinc-500">Koi active paid plan nahi</div>}
          {Object.entries(d.active_plans).map(([p, n]) => (
            <div key={p} data-testid={`active-plan-${p}`} className="flex justify-between text-sm capitalize"><span>{p}</span><span>{n}</span></div>
          ))}
        </div>
        <div className="surface rounded-xl p-5 lg:col-span-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="label-mono text-zinc-500 text-[10px]"><tr><th className="text-left pb-2">MONTH</th><th className="text-left pb-2 w-1/3"></th><th className="text-right pb-2">REVENUE</th><th className="text-right pb-2">NEW</th><th className="text-right pb-2">RENEWALS</th></tr></thead>
            <tbody>
              {d.months.length === 0 && <tr><td colSpan={5} className="text-zinc-500 py-3">Abhi koi paid payment nahi</td></tr>}
              {d.months.map((m) => (
                <tr key={m.month} data-testid={`revenue-month-${m.month}`} className="border-t border-white/5">
                  <td className="py-2">{m.month}</td>
                  <td className="py-2"><div className="h-2 rounded-full bg-[#E2FF3D]" style={{ width: `${(m.revenue_inr / max) * 100}%` }} /></td>
                  <td className="py-2 text-right">{inr(m.revenue_inr)}</td>
                  <td className="py-2 text-right">{m.new}</td>
                  <td className="py-2 text-right">{m.renewals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
