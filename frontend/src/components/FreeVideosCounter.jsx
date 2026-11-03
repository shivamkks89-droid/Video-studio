import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Film } from "lucide-react";
import { api } from "../lib/api";

export const FreeVideosCounter = () => {
  const [q, setQ] = useState(null);
  useEffect(() => { api.get("/me/free-videos").then(({ data }) => setQ(data)).catch(() => {}); }, []);
  if (!q?.limited) return null;
  const out = q.left === 0;
  return (
    <div data-testid="free-videos-counter"
      className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 border ${out ? "border-red-400/40 bg-red-500/10" : "border-white/10 surface"}`}>
      <Film className={`w-4 h-4 ${out ? "text-red-400" : "text-[#E2FF3D]"}`} />
      <div className="flex-1 min-w-[160px] text-sm">
        <b data-testid="free-videos-left">{q.left} of {q.limit}</b> free videos left
        <div className="h-1.5 mt-1.5 rounded-full bg-white/10 overflow-hidden max-w-[220px]">
          <div className={`h-full ${out ? "bg-red-400" : "bg-[#E2FF3D]"}`} style={{ width: `${(q.used / q.limit) * 100}%` }} />
        </div>
      </div>
      <Link to="/pricing" data-testid="free-videos-upgrade" className="btn-volt rounded-full px-4 py-2 text-xs font-semibold">
        {out ? "Upgrade to make more" : "Upgrade"}
      </Link>
    </div>
  );
};
