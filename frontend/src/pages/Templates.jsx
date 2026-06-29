import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function Templates() {
  const [items, setItems] = useState([]);
  const [cat, setCat] = useState("All");
  const navigate = useNavigate();
  useEffect(() => { api.get("/catalog/templates").then(({ data }) => setItems(data)); }, []);
  const cats = ["All", ...Array.from(new Set(items.map(i => i.category)))];
  const list = cat === "All" ? items : items.filter(i => i.category === cat);

  return (
    <div data-testid="templates-page" className="space-y-6">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ TEMPLATES</div>
        <h1 className="text-4xl font-semibold tracking-tight">Pick a starting point.</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {cats.map(c => (
          <button key={c} data-testid={`tpl-cat-${c}`} onClick={()=>setCat(c)}
            className={`rounded-full px-3 py-1.5 text-xs transition ${cat===c?"bg-[#E2FF3D] text-black":"surface"}`}>{c}</button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {list.map(t => (
          <button key={t.template_id} data-testid={`tpl-${t.template_id}`} onClick={()=>navigate(`/dashboard/new?type=${t.video_type}`)}
            className="surface rounded-xl overflow-hidden text-left">
            <div className="relative ar-169 bg-[#1C1C1F]">
              <img src={t.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
              {t.is_premium && <div className="absolute top-2 left-2 glass label-mono text-[10px] px-2 py-1 rounded text-[#E2FF3D]">PRO</div>}
              <div className="absolute top-2 right-2 glass label-mono text-[10px] px-2 py-1 rounded">{t.aspect_ratio}</div>
            </div>
            <div className="p-4">
              <div className="font-medium">{t.title}</div>
              <div className="label-mono text-zinc-500 mt-1">{t.category} · {t.duration_sec}s</div>
              <div className="text-xs text-zinc-400 mt-2 line-clamp-2">{t.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
