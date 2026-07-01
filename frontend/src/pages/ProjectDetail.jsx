import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Sparkles, Mic, Image as ImageIcon, Download, Share2, Loader2, Film, Video } from "lucide-react";
import { assetUrl } from "../lib/assetUrl";

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [voices, setVoices] = useState([]);
  const [topic, setTopic] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [busyScript, setBusyScript] = useState(false);
  const [busyVariants, setBusyVariants] = useState(false);
  const [variants, setVariants] = useState(null); // { variants: [{audience, label, script}], source_assets }
  const [busyVoice, setBusyVoice] = useState(false);
  const [busyScenes, setBusyScenes] = useState(false);
  const [busyRender, setBusyRender] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandUrl, setBrandUrl] = useState("");
  const [brandLogo, setBrandLogo] = useState("");

  const BACKEND = process.env.REACT_APP_BACKEND_URL;
  const videoSrc = project?.video_url ? `${BACKEND}${project.video_url}` : null;
  const audioSrc = project?.audio_url ? assetUrl(project.audio_url) : null;
  const thumbSrc = project?.thumbnail ? assetUrl(project.thumbnail) : null;

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
        brand_name: brandName || undefined,
        brand_url: brandUrl || undefined,
        brand_logo: brandLogo || undefined,
      });
      if (data.warning) toast.message(data.warning);
      else if (data.source_assets?.title) toast.success(`Script ready — using ${data.source_assets.title}`);
      else toast.success("Script generated");
      const { data: p } = await api.get(`/projects/${id}`);
      setProject(p);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Script gen failed");
    } finally { setBusyScript(false); }
  };

  const genVariants = async () => {
    if (!topic.trim()) return toast.error("Add a topic first");
    setBusyVariants(true);
    setVariants(null);
    try {
      const { data } = await api.post("/ai/script/variants", {
        project_id: id, topic, video_type: project.video_type,
        language: project.language, duration_sec: project.duration_sec,
        brand_name: brandName || undefined,
        brand_url: brandUrl || undefined,
        brand_logo: brandLogo || undefined,
      });
      setVariants(data);
      if (data.warning) toast.message(data.warning);
      else toast.success("3 audience variants ready — pick one below");
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || "Variants failed");
    } finally { setBusyVariants(false); }
  };

  const applyVariant = async (v) => {
    try {
      await api.post("/ai/script/apply", {
        project_id: id,
        script: v.script,
        audience_label: v.label,
        source_assets: variants?.source_assets || null,
      });
      const { data: p } = await api.get(`/projects/${id}`);
      setProject(p);
      setVariants(null);
      toast.success(`Applied — ${v.label} script`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not apply variant");
    }
  };

  const genVoice = async () => {
    const text = project.script?.voiceover_script || project.script?.body || "";
    if (!text) return toast.error("Generate a script first");
    setBusyVoice(true);
    try {
      const { data } = await api.post("/ai/tts", { text, voice_id: voiceId });
      if (data.error) {
        toast.error(data.error);
        return;
      }
      await api.put(`/projects/${id}`, { audio_url: data.audio_url, voice_id: voiceId, status: "voicing" });
      setProject({ ...project, audio_url: data.audio_url, voice_id: voiceId });
      if (data.note) toast.message(data.note);
      else toast.success(`Voiceover ready (${data.provider || "elevenlabs"})`);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || "Voice gen failed");
    } finally { setBusyVoice(false); }
  };

  const genScenes = async (only_missing = false) => {
    const allScenes = project.script?.scenes || [];
    if (!allScenes.length) return toast.error("Generate a script first");
    let scenesToRender = allScenes;
    if (only_missing && project.scenes?.length === allScenes.length) {
      // Build a list that only refreshes scenes without an image_url
      scenesToRender = project.scenes.map((s, i) => s.image_url ? s : allScenes[i]);
    }
    setBusyScenes(true);
    try {
      const { data } = await api.post("/ai/storyboard", {
        project_id: id, scenes: scenesToRender, aspect_ratio: project.aspect_ratio,
      });
      setProject({ ...project, scenes: data.scenes, thumbnail: data.scenes[0]?.image_url });
      const missing = data.scenes.filter(s => !s.image_url).length;
      if (missing > 0) toast.message(`Storyboard ready — ${missing} scene(s) still missing. Try Regenerate.`);
      else toast.success("Storyboard ready");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Scene gen failed");
    } finally { setBusyScenes(false); }
  };

  const missingCount = (project?.scenes || []).filter(s => !s?.image_url).length;

  const renderVideo = async () => {
    if (!project.scenes?.length) return toast.error("Generate the storyboard first");
    if (!project.audio_url) {
      const proceed = window.confirm(
        "Voiceover not generated yet — the video will be SILENT. Click Cancel to first press 'Generate voiceover', or OK to render a silent slideshow."
      );
      if (!proceed) return;
    }
    setBusyRender(true);
    try {
      const { data } = await api.post(`/projects/${id}/render`);
      if (data.error) { toast.error(data.error); setBusyRender(false); return; }
      const jobId = data.job_id;
      if (!jobId) {
        // Fallback: legacy synchronous response
        if (data.video_url) {
          setProject({ ...project, video_url: data.video_url, status: "complete" });
          toast.success("Video rendered");
        }
        setBusyRender(false);
        return;
      }
      toast.message("Rendering started — this takes 30-90 seconds…");
      // Poll job status — tolerate transient network failures (Cloudflare 524s during
      // ffmpeg CPU bursts are common). Fall back to reading the project directly
      // when the job endpoint stalls.
      const start = Date.now();
      let consecutiveErrors = 0;
      let pollInterval = 4000;
      const poll = async () => {
        try {
          const { data: job } = await api.get(`/render/jobs/${jobId}`);
          consecutiveErrors = 0;
          pollInterval = 4000;
          if (job.status === "complete" && job.video_url) {
            setProject({ ...project, video_url: job.video_url, status: "complete" });
            toast.success("Video rendered — play or download below");
            setBusyRender(false);
            return;
          }
          if (job.status === "failed") {
            toast.error(job.error || "Render failed");
            setBusyRender(false);
            return;
          }
        } catch (_e) {
          consecutiveErrors += 1;
          // Fallback: read the project directly (much lighter query) — the background
          // job writes video_url onto the project on success.
          try {
            const { data: proj } = await api.get(`/projects/${id}`);
            if (proj?.video_url && proj?.status === "complete") {
              setProject(proj);
              toast.success("Video rendered — play or download below");
              setBusyRender(false);
              return;
            }
          } catch (_e2) { /* keep retrying */ }
          // Back-off polling to reduce load on origin during CPU spikes.
          pollInterval = Math.min(15000, pollInterval + 2000);
          if (consecutiveErrors >= 25) {
            toast.message("Render is still working in the background — refresh in a minute to see it.");
            setBusyRender(false);
            return;
          }
        }
        if (Date.now() - start > 8 * 60 * 1000) {
          toast.message("Render is still working — refresh this page shortly.");
          setBusyRender(false);
          return;
        }
        setTimeout(poll, pollInterval);
      };
      poll();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || "Render failed");
      setBusyRender(false);
    }
  };

  return (
    <div data-testid="project-detail" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="label-mono text-zinc-500 mb-1">/ {project.video_type?.replace("_", " ").toUpperCase()}</div>
          <h1 className="text-3xl font-semibold tracking-tight">{project.title}</h1>
          <div className="label-mono text-zinc-500 mt-2">{project.aspect_ratio} · {project.resolution} · {project.fps}fps · {project.duration_sec}s · {project.language}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button data-testid="share-btn" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }} className="rounded-full surface px-4 py-2 text-sm flex items-center gap-2"><Share2 className="w-4 h-4" /> Share</button>
          {videoSrc ? (
            <a data-testid="download-btn" href={videoSrc} download={`${project.title || "cinereel"}.mp4`} className="btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2"><Download className="w-4 h-4" /> Download MP4</a>
          ) : (
            <button data-testid="export-btn" disabled className="rounded-full surface px-4 py-2 text-sm flex items-center gap-2 opacity-50"><Download className="w-4 h-4" /> Export</button>
          )}
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
              placeholder="Paste a Play Store package id (com.app.id), a website URL, or describe the ad."
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 resize-none" />
            <p className="text-[11px] text-zinc-500 mt-1.5">
              Tip: enter <span className="text-[#E2FF3D] mono">com.application.zomato</span> or <span className="text-[#E2FF3D] mono">https://yourbrand.com</span> — we'll pull the REAL brand name, description and screenshots and feed them into the script.
            </p>
            <button type="button" onClick={() => setBrandOpen(o => !o)}
              data-testid="brand-toggle"
              className="mt-2 text-xs text-[#E2FF3D] hover:underline">
              {brandOpen ? "− Hide brand details" : "+ Add brand name / logo manually"}
            </button>
            {brandOpen && (
              <div className="mt-2 space-y-2 surface rounded-lg p-3">
                <div>
                  <div className="label-mono text-zinc-500 mb-1">Brand name</div>
                  <input data-testid="brand-name" value={brandName} onChange={(e)=>setBrandName(e.target.value)}
                    placeholder="e.g. Acme Coffee"
                    className="w-full bg-[#0A0A0B] border border-white/10 rounded-md px-2 py-1.5 text-sm outline-none" />
                </div>
                <div>
                  <div className="label-mono text-zinc-500 mb-1">Brand URL or Play Store ID (optional)</div>
                  <input data-testid="brand-url" value={brandUrl} onChange={(e)=>setBrandUrl(e.target.value)}
                    placeholder="https://acme.com or com.acme.coffee"
                    className="w-full bg-[#0A0A0B] border border-white/10 rounded-md px-2 py-1.5 text-sm outline-none" />
                </div>
                <div>
                  <div className="label-mono text-zinc-500 mb-1">Logo image URL (optional)</div>
                  <input data-testid="brand-logo" value={brandLogo} onChange={(e)=>setBrandLogo(e.target.value)}
                    placeholder="https://acme.com/logo.png"
                    className="w-full bg-[#0A0A0B] border border-white/10 rounded-md px-2 py-1.5 text-sm outline-none" />
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button data-testid="gen-script" onClick={genScript} disabled={busyScript || busyVariants} className="btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
                {busyScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {busyScript ? "Writing…" : "Generate script"}
              </button>
              <button data-testid="gen-variants" onClick={genVariants} disabled={busyVariants || busyScript}
                className="rounded-full surface px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60 border border-[#E2FF3D]/30 hover:border-[#E2FF3D]">
                {busyVariants ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {busyVariants ? "Crafting 3 variants…" : "3 audience variants (15 CR)"}
              </button>
            </div>
            {variants?.variants && (
              <div data-testid="variants-panel" className="mt-4 grid gap-3 md:grid-cols-3">
                {variants.variants.map((v) => (
                  <div key={v.audience} data-testid={`variant-${v.audience}`}
                    className="surface rounded-lg p-3 flex flex-col gap-2 border border-white/10 hover:border-[#E2FF3D]/40 transition-colors">
                    <div className="label-mono text-[#E2FF3D] text-[11px]">{v.label}</div>
                    {v.error ? (
                      <div className="text-xs text-red-400">Failed: {v.error}</div>
                    ) : (
                      <>
                        <div className="text-sm font-medium line-clamp-3">{v.script?.hook}</div>
                        <div className="text-xs text-zinc-400 line-clamp-4">{v.script?.body}</div>
                        <div className="text-[11px] text-zinc-500 italic line-clamp-2">CTA: {v.script?.cta}</div>
                        <button data-testid={`apply-${v.audience}`} onClick={() => applyVariant(v)}
                          className="mt-auto btn-volt rounded-full px-3 py-1.5 text-xs flex items-center justify-center gap-1">
                          Use this script
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {project.source_assets?.title && (
              <div className="mt-3 surface rounded-lg p-3 flex items-center gap-3">
                {project.source_assets.icon && (
                  <img src={project.source_assets.icon} alt="" className="w-10 h-10 rounded-md object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="label-mono text-[#E2FF3D]">REAL ASSETS LOADED</div>
                  <div className="text-sm truncate">{project.source_assets.title}</div>
                  <div className="text-xs text-zinc-500">{project.source_assets.screenshots?.length || 0} real screenshots will be mixed into the storyboard</div>
                </div>
              </div>
            )}
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
            <button data-testid="gen-scenes" onClick={() => genScenes(false)} disabled={busyScenes || !project.script}
              className="btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
              {busyScenes ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              {busyScenes ? "Painting…" : (project.scenes?.length ? "Regenerate storyboard" : "Generate storyboard")}
            </button>
            {missingCount > 0 && (
              <button data-testid="gen-missing-scenes" onClick={() => genScenes(true)} disabled={busyScenes}
                className="ml-2 rounded-full surface px-4 py-2 text-sm">
                Retry {missingCount} missing
              </button>
            )}
            {project.scenes?.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {project.scenes.map((s, i) => (
                  <div key={i} className="surface rounded-lg overflow-hidden">
                    <div className="ar-916 relative bg-[#0A0A0B]">
                      {s.image_url ? <img src={assetUrl(s.image_url)} className="absolute inset-0 w-full h-full object-cover" alt="" /> :
                        <div className="absolute inset-0 grid place-items-center text-zinc-700"><ImageIcon className="w-6 h-6" /></div>}
                      <div className="absolute top-1.5 left-1.5 glass label-mono text-[9px] px-1.5 py-0.5 rounded">SCN {String(i+1).padStart(2,"0")}</div>
                      {(s.source === "real" || s.source === "real_icon") && (
                        <div className="absolute top-1.5 right-1.5 bg-[#E2FF3D] text-black label-mono text-[9px] px-1.5 py-0.5 rounded font-bold">
                          {s.source === "real_icon" ? "LOGO" : "REAL"}
                        </div>
                      )}
                      {s.source === "ai" && (
                        <div className="absolute top-1.5 right-1.5 glass label-mono text-[9px] px-1.5 py-0.5 rounded">AI</div>
                      )}
                    </div>
                    <div className="p-2 text-[11px] text-zinc-400 leading-snug line-clamp-3">{s.voiceover || s.visual_prompt}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RENDER VIDEO */}
          <div className="surface rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Video className="w-4 h-4 text-[#E2FF3D]" /><div className="font-medium">Render Final Video</div></div>
              <span className="label-mono text-zinc-500">10 CR</span>
            </div>
            <p className="text-xs text-zinc-500 mb-3">Combine storyboard + voiceover into an MP4 with Ken-Burns motion.
              {!project.audio_url && " (Add voiceover for sound, or render a silent slideshow.)"}
            </p>
            <button data-testid="render-video" onClick={renderVideo} disabled={busyRender || !project.scenes?.length}
              className="btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
              {busyRender ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
              {busyRender ? "Rendering…" : videoSrc ? "Re-render video" : "Render video"}
            </button>
            {videoSrc && (
              <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
                <span className="label-mono text-[#E2FF3D]">✓ READY</span>
                <a href={videoSrc} download={`${project.title || "cinereel"}.mp4`} className="underline hover:text-white">Download MP4</a>
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
