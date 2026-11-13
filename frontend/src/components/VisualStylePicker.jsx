import { toast } from "sonner";
import { api } from "../lib/api";

const STYLES = [
  ["", "Auto"], ["photoreal", "Photorealistic Cinematic"], ["bollywood", "Bollywood"], ["luxury", "Luxury Commercial"],
  ["documentary", "Documentary"], ["minimal", "Minimal Professional"], ["animated", "Animated"], ["social", "Social Media Native"],
];

export const VisualStylePicker = ({ project, setProject }) => {
  const value = project.visual_style || "";
  const pick = async (v) => {
    try {
      await api.put(`/projects/${project.project_id}`, { visual_style: v || null });
      setProject((p) => ({ ...p, visual_style: v || null }));
      toast.success("Visual style save — agla storyboard isi look me banega");
    } catch { toast.error("Style save nahi hua"); }
  };
  return (
    <div data-testid="visual-style-picker" className="mb-3">
      <div className="label-mono text-zinc-500 mb-1.5">Visual style</div>
      <div className="flex flex-wrap gap-1.5">
        {STYLES.map(([v, l]) => (
          <button key={v || "auto"} type="button" data-testid={`visual-style-${v || "auto"}`} onClick={() => pick(v)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${value === v ? "bg-[#E2FF3D] text-black border-[#E2FF3D]" : "border-white/15 hover:border-white/40"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
};
