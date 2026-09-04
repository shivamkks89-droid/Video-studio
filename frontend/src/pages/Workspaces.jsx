import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderPlus, FolderOpen, Trash2, Edit3, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

const COLORS = ["#E2FF3D", "#7CFC00", "#00CED1", "#FF6B9D", "#FF9F1C", "#A78BFA"];

export default function Workspaces() {
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", client_name: "", color: COLORS[0] });

  const load = async () => {
    try {
      const [w, p] = await Promise.all([api.get("/workspaces"), api.get("/projects")]);
      setItems(w.data || []);
      setProjects(p.data || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    setCreating(true);
    try {
      const { data } = await api.post("/workspaces", form);
      setItems((prev) => [data, ...prev]);
      setForm({ name: "", client_name: "", color: COLORS[0] });
      toast.success("Workspace created");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create");
    } finally { setCreating(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this workspace? Projects inside will be un-assigned but not deleted.")) return;
    try {
      await api.delete(`/workspaces/${id}`);
      setItems((prev) => prev.filter((w) => w.workspace_id !== id));
      toast.success("Deleted");
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const assign = async (projectId, wsId) => {
    try {
      await api.put(`/projects/${projectId}/workspace`, { workspace_id: wsId || null });
      toast.success("Project moved");
      load();
    } catch (e) { toast.error("Failed"); }
  };

  if (loading) return (
    <div className="grid place-items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-zinc-500"/></div>
  );

  return (
    <div data-testid="workspaces" className="space-y-8">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ CLIENT WORKSPACES</div>
        <h1 className="text-3xl font-semibold tracking-tight">Organize projects by client or brand.</h1>
        <p className="text-zinc-400 text-sm mt-2">Each workspace can carry its own colour & brand kit. Perfect for agencies.</p>
      </div>

      {/* Create */}
      <div className="surface rounded-xl p-5">
        <div className="label-mono text-zinc-500 mb-3">/ NEW WORKSPACE</div>
        <div className="grid md:grid-cols-4 gap-3">
          <input data-testid="ws-name" value={form.name}
            onChange={(e)=>setForm({...form, name: e.target.value})}
            placeholder="Workspace name"
            className="md:col-span-2 bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
          <input data-testid="ws-client" value={form.client_name}
            onChange={(e)=>setForm({...form, client_name: e.target.value})}
            placeholder="Client name (optional)"
            className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
          <button data-testid="ws-create" onClick={create} disabled={creating}
            className="btn-volt rounded-lg px-4 py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {creating ? <Loader2 className="w-4 h-4 animate-spin"/> : <FolderPlus className="w-4 h-4"/>}
            Create
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="label-mono text-zinc-500 text-[10px]">COLOR</span>
          {COLORS.map((c) => (
            <button key={c} data-testid={`ws-color-${c}`} onClick={()=>setForm({...form, color: c})}
              className={`w-6 h-6 rounded-full ${form.color===c ? "ring-2 ring-white" : ""}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>

      {/* List */}
      <div>
        <div className="label-mono text-zinc-500 mb-3">/ ALL WORKSPACES ({items.length})</div>
        {items.length === 0 ? (
          <div className="surface rounded-xl p-10 text-center">
            <Users className="w-8 h-8 text-zinc-700 mx-auto mb-3"/>
            <div className="text-zinc-400">No workspaces yet.</div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((w) => {
              const wsProjects = projects.filter((p) => p.workspace_id === w.workspace_id);
              return (
                <div key={w.workspace_id} data-testid={`ws-${w.workspace_id}`} className="surface rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: w.color }}/>
                      <div className="font-semibold">{w.name}</div>
                    </div>
                    <button data-testid={`ws-del-${w.workspace_id}`} onClick={()=>del(w.workspace_id)}
                      className="text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4"/></button>
                  </div>
                  {w.client_name && (
                    <div className="text-xs text-zinc-400 mb-3">Client · {w.client_name}</div>
                  )}
                  <div className="text-xs text-zinc-500 mb-2">{wsProjects.length} projects</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto scroll-thin pr-1">
                    {wsProjects.map((p) => (
                      <Link key={p.project_id} to={`/dashboard/projects/${p.project_id}`}
                        className="flex items-center gap-2 text-xs bg-[#141416] rounded px-2 py-1.5 hover:bg-[#1C1C1F]">
                        <FolderOpen className="w-3 h-3 text-zinc-500"/>
                        <span className="truncate">{p.title}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unassigned projects picker */}
      {projects.some((p) => !p.workspace_id) && items.length > 0 && (
        <div className="surface rounded-xl p-5">
          <div className="label-mono text-zinc-500 mb-3">/ UNASSIGNED PROJECTS</div>
          <div className="space-y-2 max-h-64 overflow-y-auto scroll-thin pr-2">
            {projects.filter((p) => !p.workspace_id).map((p) => (
              <div key={p.project_id} className="flex items-center gap-2 bg-[#0A0A0B] rounded p-2 text-sm">
                <div className="flex-1 truncate">{p.title}</div>
                <select data-testid={`ws-assign-${p.project_id}`} value=""
                  onChange={(e)=>assign(p.project_id, e.target.value)}
                  className="bg-[#141416] text-xs rounded px-2 py-1 border border-white/10">
                  <option value="">Move to…</option>
                  {items.map((w) => <option key={w.workspace_id} value={w.workspace_id}>{w.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
