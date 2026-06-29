import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { ArrowRight, Film } from "lucide-react";

const RATIOS = [
  { v: "9:16", label: "Vertical", w: "9", h: "16" },
  { v: "16:9", label: "Horizontal", w: "16", h: "9" },
  { v: "1:1",  label: "Square", w: "1", h: "1" },
];
const LANGS = [
  { v: "english", label: "English" },
  { v: "hindi", label: "Hindi" },
  { v: "hinglish", label: "Hinglish" },
];
const RES = ["720p", "1080p", "4K"];
const FPS = [24, 30, 60];

export default function NewProject() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [types, setTypes] = useState([]);
  const [type, setType] = useState("cinematic_ad");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("english");
  const [aspect, setAspect] = useState("9:16");
  const [resolution, setResolution] = useState("1080p");
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/catalog/video-types").then(({ data }) => {
      setTypes(data);
      const tParam = params.get("type");
      if (tParam) setType(tParam);
    });
  }, [params]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return toast.error("Add a title to begin");
    setLoading(true);
    try {
      const { data } = await api.post("/projects", {
        title, video_type: type, language, aspect_ratio: aspect,
        resolution, fps, duration_sec: duration,
      });
      toast.success("Project created");
      navigate(`/dashboard/projects/${data.project_id}`);
    } catch (err) {
      toast.error("Could not create project");
    } finally { setLoading(false); }
  };

  return (
    <div data-testid="new-project-page" className="max-w-5xl mx-auto">
      <div className="label-mono text-zinc-500 mb-2">/ NEW PROJECT</div>
      <h1 className="text-4xl font-semibold tracking-tight mb-8">Set the stage.</h1>

      <form onSubmit={submit} className="grid md:grid-cols-12 gap-6">
        <div className="md:col-span-7 space-y-6">
          <div>
            <div className="label-mono text-zinc-500 mb-2">Title</div>
            <input data-testid="project-title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Diwali launch — Hinglish 30s reel"
              className="w-full surface rounded-lg px-4 py-3 bg-[#141416] outline-none focus:border-white/30" />
          </div>

          <div>
            <div className="label-mono text-zinc-500 mb-2">Video Type</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {types.map((t) => (
                <button
                  key={t.id} type="button"
                  data-testid={`type-${t.id}`}
                  onClick={() => { setType(t.id); setAspect(t.default_ratio); }}
                  className={`surface rounded-lg p-3 text-left transition ${type === t.id ? "border-[#E2FF3D] bg-[#1C1C1F]" : ""}`}>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-xs text-zinc-500 mt-1">{t.default_ratio}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-5 space-y-6">
          <SelectGroup label="Language" value={language} setValue={setLanguage} options={LANGS} testidPrefix="lang" />
          <div>
            <div className="label-mono text-zinc-500 mb-2">Aspect Ratio</div>
            <div className="grid grid-cols-3 gap-2">
              {RATIOS.map((r) => (
                <button type="button" key={r.v} data-testid={`ratio-${r.v}`}
                  onClick={() => setAspect(r.v)}
                  className={`surface rounded-lg p-3 transition ${aspect === r.v ? "border-[#E2FF3D]" : ""}`}>
                  <div className="text-sm font-medium">{r.v}</div>
                  <div className="text-xs text-zinc-500">{r.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectGroup label="Resolution" value={resolution} setValue={setResolution} options={RES.map(v=>({v, label:v}))} testidPrefix="res" />
            <SelectGroup label="FPS" value={fps} setValue={(v)=>setFps(Number(v))} options={FPS.map(v=>({v, label: v+" fps"}))} testidPrefix="fps" />
          </div>
          <div>
            <div className="label-mono text-zinc-500 mb-2">Duration · {duration}s</div>
            <input data-testid="duration-slider" type="range" min="10" max="120" step="5" value={duration}
              onChange={(e)=>setDuration(Number(e.target.value))}
              className="w-full accent-[#E2FF3D]" />
          </div>
          <button data-testid="create-project-submit" disabled={loading}
            className="btn-volt w-full rounded-full py-3 flex items-center justify-center gap-2 disabled:opacity-60">
            <Film className="w-4 h-4" /> Create Project <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function SelectGroup({ label, value, setValue, options, testidPrefix }) {
  return (
    <div>
      <div className="label-mono text-zinc-500 mb-2">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button key={o.v} type="button" data-testid={`${testidPrefix}-${o.v}`}
            onClick={() => setValue(o.v)}
            className={`surface rounded-lg py-2 text-sm transition ${String(value) === String(o.v) ? "border-[#E2FF3D] text-[#E2FF3D]" : ""}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
