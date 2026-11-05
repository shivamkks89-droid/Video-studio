import { useState } from "react";
import { toast } from "sonner";
import { History, Check } from "lucide-react";
import { api } from "../lib/api";

export const ScriptHistory = ({ project, onRestored }) => {
  const [open, setOpen] = useState(false);
  const hist = project.script_history || [];
  if (hist.length < 2) return null;
  const current = project.script?.hook;
  const restore = async (idx) => {
    try {
      const { data } = await api.post(`/projects/${project.project_id}/script/restore/${idx}`);
      onRestored(data.script);
      toast.success("Purana script wapas aa gaya (voice dobara banani hogi)");
    } catch (e) { toast.error(e.response?.data?.detail || "Restore nahi hua"); }
  };
  return (
    <div className="mt-3" data-testid="script-history">
      <button data-testid="script-history-toggle" onClick={() => setOpen(!open)}
        className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" /> Script history ({hist.length}/10) {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
          {hist.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => {
            const active = h.script?.hook === current;
            return (
              <button key={i} data-testid={`script-history-item-${i}`} onClick={() => !active && restore(i)}
                className={`w-full text-left surface rounded-lg p-2.5 ${active ? "border-[#E2FF3D]/40" : "hover:border-white/30"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="label-mono text-[10px] text-zinc-500">#{i + 1} · {h.angle || "script"}</span>
                  {active && <span className="text-[10px] text-[#E2FF3D] flex items-center gap-1"><Check className="w-3 h-3" /> In use</span>}
                </div>
                <div className="text-xs mt-1 line-clamp-2">{h.script?.hook || h.script?.title}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
