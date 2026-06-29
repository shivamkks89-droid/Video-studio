import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Sparkles, Mic, Image as ImageIcon, Download, Share2, Loader2, Film } from "lucide-react";

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [voices, setVoices] = useState([]);
  const [topic, setTopic] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [busyScript, setBusyScript] = useState(false);
  const [busyVoice, setBusyVoice] = useState(false);
  const [busyScenes, setBusyScenes] = useState(false);

  const load = async () => {
    const { data } = await api.get(`/projects/${id}`);
    setProject(data);
  };
  useEffect(() => {
    load();
    api.get("/catalog/voices").then(({ data }) => { setVoices(data); setVoiceId(data[0]?.id || ""); });
  }, [id]);

  if (!project) return <div className="label-mono text-zinc-500">Loading…</div>;

  const filteredVoices = voices.filter(v => v.language === project.language || project.language === "english");

  const genScript = async () => {
    if (!topic.trim()) return toast.error("Add a topic first");
    setBusyScript(true);
    try {
      const { data } = await api.post("/ai/script", {
        project_id: id, topic, video_type: project.video_type,
        language: project.language, duration_sec: project.duration_sec,
      });
      toast.success("Script generated");
      setProject({ ...project, script: data.script });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Script gen failed");
    } finally { setBusyScript(false); }
  };

  const genVoice = async () => {
    const text = project.script?.voiceover_script || project.script?.body || "";
    if (!text) return toast.error("Generate a script first");
    setBusyVoice(true);
    try {
      const { data } = await api.post("/ai/tts", { text, voice_id: voiceId });
      await api.put(`/projects/${id}`, { audio_url: data.audio_url, voice_id: voiceId, status: "voicing" });
      setProject({ ...project, audio_url: data.audio_url, voice_id: voiceId });
      toast.success("Voiceover ready");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Voice gen failed");
    } finally { setBusyVoice(false); }
  };

  const genScenes = async () => {
    const scenes = project.script?.scenes || [];
    if (!scenes.length) return toast.error("Generate a script first");
    setBusyScenes(true);
    try {
      const { data } = await api.post("/ai/storyboard", {
        project_id: id, scenes, aspect_ratio: project.aspect_ratio,
      });
      setProject({ ...project, scenes: data.scenes, thumbnail: data.scenes[0]?.image_url });
      toast.success("Storyboard ready");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Scene gen failed");
    } finally { setBusyScenes(false); }
  };

  return (
    <div data-testid="project-detail" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="label-mono text-zinc-500 mb-1">/ {project.video_type?.replace("_", " ").toUpperCase()}</div>
          <h1 className="text-3xl font-semibold tracking-tight">{project.title}</h1>
          <div className="label-mono text-zinc-500 mt-2">{project.aspect_ratio} · {project.resolution} · {project.fps}fps · {project.duration_sec}s · {project.language}</div>
        </div>
        <div className="flex gap-2">
          <button data-testid="share-btn" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }} className="rounded-full surface px-4 py-2 text-sm flex items-center gap-2"><Share2 className="w-4 h-4" /> Share</button>
          <button data-testid="export-btn" disabled={!project.audio_url} onClick={() => toast.message("Export ready — MP4/MOV/GIF generated server-side in Phase 2.")} className="btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"><Download className="w-4 h-4" /> Export</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* PREVIEW */}
        <div className="lg:col-span-5">
          <div className={`surface rounded-2xl overflow-hidden relative ${project.aspect_ratio === "16:9" ? "ar-169" : project.aspect_ratio === "1:1" ? "ar-11" : "ar-916"}`}>
            {project.thumbnail ? (
              <img src={project.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-zinc-700"><Film className="w-12 h-12" /></div>
            )}
            <div className="absolute top-3 right-3 glass rounded-full px-3 py-1 label-mono text-[10px]">{project.aspect_ratio}</div>
          </div>
          {project.audio_url && (
            <div className="mt-3">
              <div className="label-mono text-zinc-500 mb-2">VOICEOVER</div>
              <audio data-testid="voice-player" controls src={project.audio_url} className="w-full" />
            </div>
          )}
        </div>

        {/* STEPS */}
        <div className="lg:col-span-7 space-y-4">
          {/* SCRIPT */}
          <div className="surface rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#E2FF3D]" /><div className="font-medium">Script</div></div>
              <span className="label-mono text-zinc-500">5 CR</span>
            </div>
            <textarea data-testid="topic-input" value={topic} onChange={(e)=>setTopic(e.target.value)} rows={2}
              placeholder="What is the ad about? e.g. festive sale on premium kurtas, free shipping in India"
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 resize-none" />
            <button data-testid="gen-script" onClick={genScript} disabled={busyScript} className="mt-3 btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
              {busyScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busyScript ? "Writing…" : "Generate script"}
            </button>
            {project.script?.hook && (
              <div className="mt-4 space-y-2 text-sm">
                <Row label="HOOK">{project.script.hook}</Row>
                <Row label="BODY">{project.script.body}</Row>
                <Row label="CTA">{project.script.cta}</Row>
                {project.script.captions && (
                  <Row label="CAPTIONS">{project.script.captions.join(" · ")}</Row>
                )}
              </div>
            )}
          </div>

          {/* VOICE */}
          <div className="surface rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Mic className="w-4 h-4 text-[#E2FF3D]" /><div className="font-medium">Voiceover (ElevenLabs)</div></div>
              <span className="label-mono text-zinc-500">~1-3 CR</span>
            </div>
            <select data-testid="voice-select" value={voiceId} onChange={(e)=>setVoiceId(e.target.value)}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
              {filteredVoices.map((v, i) => {
                const label = `${v.name} — ${v.language} · ${v.style}`;
                return <option key={`${v.id}-${i}`} value={v.id}>{label}</option>;
              })}
            </select>
            <button data-testid="gen-voice" onClick={genVoice} disabled={busyVoice || !project.script}
              className="mt-3 btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
              {busyVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              {busyVoice ? "Synthesising…" : "Generate voiceover"}
            </button>
          </div>

          {/* SCENES */}
          <div className="surface rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><ImageIcon className="w-4 h-4 text-[#E2FF3D]" /><div className="font-medium">Cinematic Storyboard</div></div>
              <span className="label-mono text-zinc-500">3 CR / scene</span>
            </div>
            <button data-testid="gen-scenes" onClick={genScenes} disabled={busyScenes || !project.script}
              className="btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
              {busyScenes ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              {busyScenes ? "Painting…" : "Generate storyboard"}
            </button>
            {project.scenes?.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {project.scenes.map((s, i) => (
                  <div key={i} className="surface rounded-lg overflow-hidden">
                    <div className="ar-916 relative bg-[#0A0A0B]">
                      {s.image_url ? <img src={s.image_url} className="absolute inset-0 w-full h-full object-cover" alt="" /> :
                        <div className="absolute inset-0 grid place-items-center text-zinc-700"><ImageIcon className="w-6 h-6" /></div>}
                      <div className="absolute top-1.5 left-1.5 glass label-mono text-[9px] px-1.5 py-0.5 rounded">SCN {String(i+1).padStart(2,"0")}</div>
                    </div>
                    <div className="p-2 text-[11px] text-zinc-400 leading-snug line-clamp-3">{s.voiceover || s.visual_prompt}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Link to="/dashboard/projects" className="inline-block text-sm text-zinc-500 hover:text-white">← Back to projects</Link>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex gap-3">
      <div className="label-mono text-zinc-500 w-20 shrink-0 pt-1">{label}</div>
      <div className="text-zinc-200 flex-1">{children}</div>
    </div>
  );
}
