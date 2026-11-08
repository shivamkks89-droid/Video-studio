import { useState } from "react";
import { toast } from "sonner";
import { Zap, Lock } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export const TrendingToggle = ({ project }) => {
  const { user } = useAuth();
  const paid = user && ((user.plan && user.plan !== "free") || user.role === "admin" || user.unlimited_credits);
  const [on, setOn] = useState(!!project.trending_effects);
  const toggle = async () => {
    if (!paid) return toast.message("Trending Effects sirf paid plans me hain — Upgrade karo");
    const next = !on;
    setOn(next);
    try { await api.put(`/projects/${project.project_id}`, { trending_effects: next }); }
    catch { setOn(!next); toast.error("Save nahi hua"); }
  };
  return (
    <button type="button" data-testid="trending-effects-toggle" onClick={toggle}
      className={`mb-3 w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${on && paid ? "border-[#E2FF3D] bg-[#E2FF3D]/10" : "border-white/10 hover:border-white/30"}`}>
      <span className="flex items-center gap-2 text-sm">
        <Zap className="w-4 h-4 text-[#E2FF3D]" /> Trending Effects
        <span className="text-[11px] text-zinc-400">shake · flash · punchy colours</span>
      </span>
      {paid ? <span data-testid="trending-effects-state" className="label-mono text-[10px]">{on ? "ON" : "OFF"}</span>
        : <span className="flex items-center gap-1 text-[10px] text-zinc-400"><Lock className="w-3 h-3" /> PAID</span>}
    </button>
  );
};
