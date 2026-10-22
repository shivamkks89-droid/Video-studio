import { useEffect, useState } from "react";
import { Film, ImagePlus, LayoutGrid } from "lucide-react";
import { api } from "../../lib/api";

export const ShotSourcePicker = ({ source, setSource, projectId, setProjectId, files, setFiles }) => {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    api.get("/projects").then(({ data }) => {
      const done = (data || []).filter((p) => p.video_url);
      setProjects(done);
      if (done[0] && !projectId) setProjectId(done[0].project_id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tab = (id, Icon, label) => (
    <button data-testid={`shots-source-${id}`} onClick={() => setSource(id)}
      className={`flex-1 rounded-lg px-3 py-2 text-xs flex items-center justify-center gap-2 transition-colors ${
        source === id ? "bg-[#E2FF3D] text-black font-semibold" : "surface hover:border-white/30"}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {tab("video", Film, "Project video frames")}
        {tab("app", LayoutGrid, "App screens")}
      </div>
      {source === "video" ? (
        projects.length ? (
          <select data-testid="shots-project-select" value={projectId || ""}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
            {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.title || p.project_id}</option>)}
          </select>
        ) : (
          <div data-testid="shots-no-projects" className="text-xs text-zinc-500">
            Koi completed render nahi mila — pehle ek project render karo.
          </div>
        )
      ) : (
        <label data-testid="shots-upload-label"
          className="flex items-center gap-3 border border-dashed border-white/15 rounded-lg px-3 py-3 text-xs text-zinc-400 cursor-pointer hover:border-white/30">
          <ImagePlus className="w-4 h-4 text-[#E2FF3D]" />
          {files.length ? `${files.length} screen(s) selected` : "Upload up to 6 app screenshots (phone se liye hue)"}
          <input data-testid="shots-upload-input" type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 6))} />
        </label>
      )}
    </div>
  );
};
