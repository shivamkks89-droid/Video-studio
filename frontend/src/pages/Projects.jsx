import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Film, Copy, Trash2, Plus } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function Projects() {
  const [items, setItems] = useState([]);

  const load = async () => {
    const { data } = await api.get("/projects");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const duplicate = async (id) => {
    try { await api.post(`/projects/${id}/duplicate`); toast.success("Duplicated"); load(); }
    catch { toast.error("Failed to duplicate"); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete project?")) return;
    try { await api.delete(`/projects/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Failed"); }
  };

  return (
    <div data-testid="projects-page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="label-mono text-zinc-500 mb-2">/ PROJECTS</div>
          <h1 className="text-4xl font-semibold tracking-tight">Your library</h1>
        </div>
        <Link data-testid="new-project-btn" to="/dashboard/new" className="btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> New
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="surface rounded-xl p-12 text-center">
          <Film className="w-8 h-8 text-zinc-600 mx-auto mb-4" />
          <div className="text-zinc-400">No projects yet.</div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((p) => (
            <div key={p.project_id} data-testid={`project-card-${p.project_id}`} className="surface rounded-xl overflow-hidden">
              <Link to={`/dashboard/projects/${p.project_id}`}>
                <div className="relative ar-169 bg-[#1C1C1F]">
                  {p.thumbnail ? <img src={p.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /> :
                    <div className="absolute inset-0 grid place-items-center"><Film className="w-8 h-8 text-zinc-700" /></div>}
                  <div className="absolute top-2 right-2 glass label-mono text-[10px] px-2 py-1 rounded">{p.aspect_ratio}</div>
                </div>
              </Link>
              <div className="p-3">
                <Link to={`/dashboard/projects/${p.project_id}`} className="block">
                  <div className="text-sm font-medium truncate hover:text-[#E2FF3D]">{p.title}</div>
                  <div className="label-mono text-zinc-500 mt-1">{p.video_type?.replace("_", " ")} · {p.status}</div>
                </Link>
                <div className="flex items-center justify-end gap-1 mt-3">
                  <button data-testid={`dup-${p.project_id}`} onClick={() => duplicate(p.project_id)} className="text-zinc-500 hover:text-white p-1.5"><Copy className="w-4 h-4" /></button>
                  <button data-testid={`del-${p.project_id}`} onClick={() => remove(p.project_id)} className="text-zinc-500 hover:text-red-400 p-1.5"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
