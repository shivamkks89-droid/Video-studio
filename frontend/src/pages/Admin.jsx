import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link } from "react-router-dom";
import { Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);

  const load = async () => {
    const [s, u] = await Promise.all([api.get("/admin/analytics"), api.get("/admin/users")]);
    setStats(s.data); setUsers(u.data);
  };
  useEffect(() => { load(); }, []);

  const update = async (uid, payload) => {
    try { await api.put(`/admin/users/${uid}`, payload); toast.success("Updated"); load(); }
    catch { toast.error("Failed"); }
  };
  const del = async (uid) => {
    if (!window.confirm("Delete user?")) return;
    await api.delete(`/admin/users/${uid}`); toast.success("Deleted"); load();
  };

  if (user?.role !== "admin") return <div>Not authorised.</div>;

  return (
    <div data-testid="admin-page" className="min-h-screen bg-[#0A0A0B] text-white">
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#E2FF3D]" /><h1 className="font-semibold">Admin · CineReel AI</h1></div>
        <Link to="/dashboard" className="text-sm text-zinc-400 hover:text-white">← Back to studio</Link>
      </header>
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat title="Users" value={stats.users} testid="admin-stat-users"/>
            <Stat title="Projects" value={stats.projects} testid="admin-stat-projects" />
            <Stat title="Transactions" value={stats.transactions} testid="admin-stat-txn" />
            <Stat title="Revenue (demo)" value={`$${stats.revenue_usd}`} testid="admin-stat-rev" />
          </div>
        )}

        <div>
          <div className="label-mono text-zinc-500 mb-3">/ USERS</div>
          <div className="surface rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="label-mono text-zinc-500 bg-[#1C1C1F]">
                <tr><th className="text-left p-3">EMAIL</th><th className="text-left p-3">NAME</th><th className="text-left p-3">ROLE</th><th className="text-left p-3">PLAN</th><th className="text-right p-3">CREDITS</th><th className="text-right p-3">ACTIONS</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.user_id} data-testid={`admin-user-${u.user_id}`} className="border-t border-white/5">
                    <td className="p-3">{u.email}</td>
                    <td className="p-3">{u.name}</td>
                    <td className="p-3">
                      <select defaultValue={u.role} onChange={(e)=>update(u.user_id, { role: e.target.value })}
                        className="bg-[#0A0A0B] border border-white/10 rounded-md px-2 py-1 text-xs">
                        <option value="user">user</option><option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <select defaultValue={u.plan} onChange={(e)=>update(u.user_id, { plan: e.target.value })}
                        className="bg-[#0A0A0B] border border-white/10 rounded-md px-2 py-1 text-xs">
                        {["free","creator","studio","enterprise"].map(p => <option key={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="p-3 text-right">
                      <input type="number" defaultValue={u.credits}
                        onBlur={(e)=>update(u.user_id, { credits: Number(e.target.value) })}
                        className="bg-[#0A0A0B] border border-white/10 rounded-md px-2 py-1 text-xs w-24 text-right" />
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => del(u.user_id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
function Stat({ title, value, testid }) {
  return (
    <div data-testid={testid} className="surface rounded-xl p-5">
      <div className="label-mono text-zinc-500 mb-2">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
