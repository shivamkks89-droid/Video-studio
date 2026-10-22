import { useEffect, useState } from "react";
import { Briefcase } from "lucide-react";
import { api } from "../../lib/api";

export const KitSelect = ({ value, onChange, testId = "kit-select" }) => {
  const [list, setList] = useState([]);
  useEffect(() => { api.get("/workspaces").then(({ data }) => setList(data || [])).catch(() => {}); }, []);
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-400">
      <Briefcase className="w-3.5 h-3.5 text-[#E2FF3D] shrink-0" />
      <select data-testid={testId} value={value || ""} onChange={(e) => onChange(e.target.value || null)}
        className="flex-1 bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-xs outline-none">
        <option value="">CineReel default brand kit</option>
        {list.map((w) => (
          <option key={w.workspace_id} value={w.workspace_id}>
            {w.name}{w.brand_kit ? " · brand kit" : ""}
          </option>
        ))}
      </select>
    </label>
  );
};
