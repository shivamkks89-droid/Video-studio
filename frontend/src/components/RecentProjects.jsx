import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Film } from "lucide-react";
import { api } from "../lib/api";
import { assetUrl } from "../lib/assetUrl";

const ago = (iso) => {
  if (!iso) return "";
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

export const RecentProjects = () => {
  const [items, setItems] = useState(null);
  useEffect(() => {
    api.get("/projects", { params: { sort: "recent" } }).then(({ data }) => setItems(data.slice(0, 10))).catch(() => setItems([]));
  }, []);
  if (!items?.length) return null;
  return (
    <section data-testid="recent-projects">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-[#E2FF3D]" />
        <h2 className="text-base md:text-lg font-semibold">Recent</h2>
        <span className="label-mono text-zinc-500 text-[10px]">/ LAST OPENED</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x no-scrollbar">
        {items.map((p) => (
          <Link key={p.project_id} to={`/dashboard/projects/${p.project_id}`} data-testid={`recent-${p.project_id}`}
            className="snap-start shrink-0 self-start w-32 sm:w-36 rounded-xl surface overflow-hidden active:scale-[0.97] transition-transform">
            <div className="h-40 sm:h-44 bg-[#141416] grid place-items-center">
              {p.thumbnail ? <img src={assetUrl(p.thumbnail)} alt="" className="w-full h-full object-cover" /> : <Film className="w-5 h-5 text-zinc-600" />}
            </div>
            <div className="p-2">
              <div className="text-xs font-medium truncate">{p.title || "Untitled"}</div>
              <div className="text-[10px] text-zinc-500">{ago(p.last_opened_at || p.updated_at)}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};
