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
  const [busySeedanceIdx, setBusySeedanceIdx] = useState(null);
  const [engines, setEngines] = useState(null); // { engines: [{id,label,unlocked,cost,modes}], current_plan }
  const [variants, setVariants] = useState(null); // { variants: [{audience, label, script}], source_assets, axis }
  const [axis, setAxis] = useState("gender"); // gender | age | region
  const [metrics, setMetrics] = useState(null);
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
  const loadMetrics = async () => {
    try {
      const { data } = await api.get(`/projects/${id}/metrics`);
      setMetrics(data);
    } catch { /* silent */ }
  };
  useEffect(() => {
    load();
    loadMetrics();
    api.get("/catalog/voices").then(({ data }) => { setVoices(data); setVoiceId(data[0]?.id || ""); });
    api.get("/ai/video-clip/engines").then(({ data }) => setEngines(data)).catch(() => {});
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
        axis,
        brand_name: brandName || undefined,
        brand_url: brandUrl || undefined,
        brand_logo: brandLogo || undefined,
      });
      setVariants(data);
      if (data.warning) toast.message(data.warning);
      else toast.success(`3 ${axis} variants ready — pick one below`);
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
        audience_key: v.audience,
        axis: variants?.axis || axis,
        source_assets: variants?.source_assets || null,
      });
      const { data: p } = await api.get(`/projects/${id}`);
      setProject(p);
      setVariants(null);
      loadMetrics();
      toast.success(`Applied — ${v.label}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not apply variant");
    }
  };

  const copyShareLink = () => {
    // Public share link — every view fires a tracking beacon
    const link = `${window.location.origin}/share/${id}`;
    navigator.clipboard.writeText(link);
    toast.success("Share link copied — each open counts as a view");
  };

  const runSeedance = async (idx, engine, mode) => {
    setBusySeedanceIdx(idx);
    const engineLabel = engine === "sora" ? "Sora 2" : "Seedance";
    const t = toast.loading(`${engineLabel} · ${mode === "i2v" ? "animating scene" : "generating clip"} · this takes 30-120s…`);
    try {
      await api.post("/ai/video-clip/generate", {
        project_id: id,
        scene_index: idx,
        engine,
        mode,
      });
      const { data: p } = await api.get(`/projects/${id}`);
      setProject(p);
      toast.success(`${engineLabel} clip ready — plays on hover`, { id: t });
    } catch (err) {
      const msg = err.response?.data?.detail || `${engineLabel} failed`;
      const lower = String(msg).toLowerCase();
      if (lower.includes("balance")) {
        toast.error("fal.ai balance exhausted — top up at fal.ai/dashboard/billing, or use Sora 2 instead", { id: t, duration: 6000 });
      } else if (lower.includes("upgrade") || lower.includes("creator plan")) {
        toast.error("Seedance is a Premium engine — upgrade your plan, or use the free Sora 2 instead", { id: t, duration: 6000 });
      } else {
        toast.error(msg, { id: t });
      }
    } finally { setBusySeedanceIdx(null); }
  };

  const clearSeedance = async (idx) => {
    setBusySeedanceIdx(idx);
    try {
      await api.post("/ai/seedance/clear", { project_id: id, scene_index: idx });
      const { data: p } = await api.get(`/projects/${id}`);
      setProject(p);
      toast.success("Motion removed — falls back to still image");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not clear");
    } finally { setBusySeedanceIdx(null); }
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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button data-testid="gen-script" onClick={genScript} disabled={busyScript || busyVariants} className="btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
                {busyScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {busyScript ? "Writing…" : "Generate script"}
              </button>
              <div className="flex items-center gap-1 surface rounded-full p-0.5" role="tablist" data-testid="axis-tabs">
                {[
                  { key: "gender", label: "Gender" },
                  { key: "age", label: "Age" },
                  { key: "region", label: "Region" },
                ].map(t => (
                  <button key={t.key} onClick={() => setAxis(t.key)}
                    data-testid={`axis-${t.key}`}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${axis === t.key ? "bg-[#E2FF3D] text-black" : "text-zinc-400 hover:text-white"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <button data-testid="gen-variants" onClick={genVariants} disabled={busyVariants || busyScript}
                className="rounded-full surface px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60 border border-[#E2FF3D]/30 hover:border-[#E2FF3D]">
                {busyVariants ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {busyVariants ? `Crafting 3 ${axis} variants…` : `3 ${axis} variants (15 CR)`}
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
                  <div key={i} className="surface rounded-lg overflow-hidden" data-testid={`scene-card-${i}`}>
                    <div className="ar-916 relative bg-[#0A0A0B]">
                      {s.video_clip_url ? (
                        <video src={assetUrl(s.video_clip_url)} muted loop playsInline
                          className="absolute inset-0 w-full h-full object-cover"
                          onMouseEnter={e => e.currentTarget.play()} onMouseLeave={e => e.currentTarget.pause()} />
                      ) : s.image_url ? (
                        <img src={assetUrl(s.image_url)} className="absolute inset-0 w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-zinc-700"><ImageIcon className="w-6 h-6" /></div>
                      )}
                      <div className="absolute top-1.5 left-1.5 glass label-mono text-[9px] px-1.5 py-0.5 rounded">SCN {String(i+1).padStart(2,"0")}</div>
                      {s.video_clip_url && (
                        <div className="absolute top-1.5 right-1.5 bg-fuchsia-500 text-white label-mono text-[9px] px-1.5 py-0.5 rounded font-bold">
                          MOTION
                        </div>
                      )}
                      {!s.video_clip_url && (s.source === "real" || s.source === "real_icon") && (
                        <div className="absolute top-1.5 right-1.5 bg-[#E2FF3D] text-black label-mono text-[9px] px-1.5 py-0.5 rounded font-bold">
                          {s.source === "real_icon" ? "LOGO" : "REAL"}
                        </div>
                      )}
                      {!s.video_clip_url && s.source === "ai" && (
                        <div className="absolute top-1.5 right-1.5 glass label-mono text-[9px] px-1.5 py-0.5 rounded">AI</div>
                      )}
                    </div>
                    <div className="p-2 text-[11px] text-zinc-400 leading-snug line-clamp-2">{s.voiceover || s.visual_prompt}</div>
                    <div className="px-2 pb-2 flex items-center gap-1 flex-wrap">
                      {s.video_clip_url ? (
                        <>
                          <span className="label-mono text-[9px] text-fuchsia-300">
                            {s.video_clip_engine === "sora" ? "SORA 2" : "SEEDANCE"} · {s.video_clip_source?.toUpperCase()}
                          </span>
                          <button data-testid={`clear-clip-${i}`} onClick={() => clearSeedance(i)}
                            disabled={busySeedanceIdx === i}
                            className="ml-auto rounded-full surface px-2 py-1 text-[10px] border border-white/10 hover:border-white/30 disabled:opacity-50">
                            Remove motion
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Free tier — Sora 2 T2V */}
                          <button data-testid={`animate-sora-${i}`} onClick={() => runSeedance(i, "sora", "t2v")}
                            disabled={busySeedanceIdx !== null}
                            title="Sora 2 · Free on every plan · 20 CR"
                            className="rounded-full px-2 py-1 text-[10px] flex items-center gap-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 disabled:opacity-50">
                            {busySeedanceIdx === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            Sora 2 · 20 CR
                          </button>

                          {/* Premium tier — Seedance I2V */}
                          <button data-testid={`animate-seedance-${i}`} onClick={() => runSeedance(i, "seedance", "i2v")}
                            disabled={busySeedanceIdx !== null || !s.image_url}
                            title={engines?.engines?.find(e => e.id === "seedance")?.unlocked
                              ? "Seedance Animate · 30 CR"
                              : "Seedance is a Creator+ plan feature"}
                            className={`rounded-full px-2 py-1 text-[10px] flex items-center gap-1 border disabled:opacity-50 ${
                              engines?.engines?.find(e => e.id === "seedance")?.unlocked
                                ? "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30 hover:border-fuchsia-400"
                                : "bg-white/5 text-zinc-500 border-white/10"
                            }`}>
                            <Sparkles className="w-3 h-3" />
                            Seedance
                            {!engines?.engines?.find(e => e.id === "seedance")?.unlocked && (
                              <span className="ml-0.5 text-[8px] opacity-70">🔒</span>
                            )}
                          </button>
                        </>
                      )}
                    </div>
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

          {/* A/B ANALYTICS */}
          <div className="surface rounded-xl p-5" data-testid="ab-panel">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Share2 className="w-4 h-4 text-[#E2FF3D]" /><div className="font-medium">A/B Variant Tracker</div></div>
              <button onClick={loadMetrics} className="label-mono text-zinc-500 hover:text-white text-[11px]">↻ Refresh</button>
            </div>
            {metrics?.active_variant?.label ? (
              <div className="mb-3 flex items-center gap-2 text-xs">
                <span className="label-mono text-zinc-500">ACTIVE VARIANT</span>
                <span className="px-2 py-0.5 rounded-full bg-[#E2FF3D]/15 text-[#E2FF3D] label-mono text-[10px]">
                  {metrics.active_variant.axis?.toUpperCase() || "—"} · {metrics.active_variant.label}
                </span>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 mb-3">Pick a variant from the Script section to start tracking.</p>
            )}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {["view", "click", "share", "conversion"].map(ev => (
                <div key={ev} className="surface rounded-lg p-2 text-center" data-testid={`metric-total-${ev}`}>
                  <div className="text-lg font-semibold">{metrics?.metrics?.totals?.[ev] ?? 0}</div>
                  <div className="label-mono text-zinc-500 text-[10px] uppercase">{ev}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={copyShareLink} data-testid="copy-share" className="rounded-full surface px-3 py-1.5 text-xs flex items-center gap-1 border border-white/10 hover:border-[#E2FF3D]/40">
                <Share2 className="w-3 h-3" /> Copy share link
              </button>
              <button onClick={async () => { await api.post(`/track/${id}`, { event: "click" }); loadMetrics(); toast.success("Click logged"); }}
                data-testid="log-click"
                className="rounded-full surface px-3 py-1.5 text-xs border border-white/10 hover:border-white/30">
                + Log click
              </button>
              <button onClick={async () => { await api.post(`/track/${id}`, { event: "conversion" }); loadMetrics(); toast.success("Conversion logged"); }}
                data-testid="log-conversion"
                className="rounded-full surface px-3 py-1.5 text-xs border border-white/10 hover:border-white/30">
                + Log conversion
              </button>
            </div>
            {metrics?.metrics && Object.keys(metrics.metrics).filter(k => k !== "totals").length > 0 && (
              <div className="mt-4">
                <div className="label-mono text-zinc-500 mb-2 text-[10px]">BREAKDOWN BY VARIANT</div>
                <div className="space-y-2">
                  {Object.entries(metrics.metrics).filter(([k]) => k !== "totals").map(([axisName, byKey]) => (
                    <div key={axisName} className="surface rounded-lg p-2">
                      <div className="label-mono text-zinc-500 text-[10px] mb-1">{axisName.toUpperCase()}</div>
                      {Object.entries(byKey || {}).map(([key, evs]) => (
                        <div key={key} className="flex items-center justify-between text-xs py-0.5">
                          <span className="text-zinc-300">{key}</span>
                          <span className="text-zinc-500">
                            {["view", "click", "share", "conversion"].map(e => `${e[0].toUpperCase()}:${evs?.[e] ?? 0}`).join(" · ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
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
