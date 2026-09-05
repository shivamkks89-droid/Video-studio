import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Sparkles, Mic, Image as ImageIcon, Download, Share2, Loader2, Film, Video, Upload, Play, Copy } from "lucide-react";
import { assetUrl } from "../lib/assetUrl";

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [voices, setVoices] = useState([]);
  const [topic, setTopic] = useState("");
  // Voice selection uses a composite key `${id}::${name}` because several
  // catalog entries intentionally share the same ElevenLabs voice_id under
  // different display names (e.g. Rohan / Liam both use TX3LPax...). A plain
  // id-based `.find` would always return the FIRST matching entry, causing
  // language-mismatch warnings and gender/style badges to be wrong.
  const [voiceKey, setVoiceKeyRaw] = useState("");
  const voiceIdOf = (k) => (k || "").split("::")[0];
  const voiceId = voiceIdOf(voiceKey);
  const setVoiceId = (raw) => {
    // Accept plain id (legacy) — resolve to first matching card.
    if (raw && raw.includes("::")) return setVoiceKeyRaw(raw);
    const v = voices.find(x => x.id === raw);
    setVoiceKeyRaw(v ? `${v.id}::${v.name}` : raw);
  };
  const [busyScript, setBusyScript] = useState(false);
  const [busyVariants, setBusyVariants] = useState(false);
  const [busySeedanceIdx, setBusySeedanceIdx] = useState(null);
  const [engines, setEngines] = useState(null);
  const [busyPreview, setBusyPreview] = useState(false);
  const [previewCache, setPreviewCache] = useState({});
  const [hoverPreview, setHoverPreview] = useState(true); // opt-in hover previews
  const [busyClone, setBusyClone] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneFile, setCloneFile] = useState(null);
  const [showClone, setShowClone] = useState(false);
  const [cloneTrimReady, setCloneTrimReady] = useState(null); // {duration, trim(s,e)}
  const [cloneTrimStart, setCloneTrimStart] = useState(0);
  const [cloneTrimEnd, setCloneTrimEnd] = useState(0);
  const hoverTimer = useRef(null);
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
  const [targetGender, setTargetGender] = useState("all"); // women, men, teens, kids, all
  const [targetAge, setTargetAge] = useState(""); // "", "13-17", "18-24", ...
  const autoRegenTriedRef = useRef(false);

  // ---- Universal Voice Quality System ----
  const [pronCheck, setPronCheck] = useState(null); // {issues, summary}
  const [busyPron, setBusyPron] = useState(false);
  const [newPronWord, setNewPronWord] = useState("");
  const [newPronSaid, setNewPronSaid] = useState("");
  const [fbOpen, setFbOpen] = useState(false);
  const [fbTags, setFbTags] = useState([]);
  const [fbText, setFbText] = useState("");
  const [fbContext, setFbContext] = useState("voice");
  const [fbBusy, setFbBusy] = useState(false);
  const [fbResult, setFbResult] = useState(null);
  const [qa, setQa] = useState(null); // {checks, overall, blockers}
  const [busyQa, setBusyQa] = useState(false);

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
    api.get("/catalog/voices").then(({ data }) => setVoices(data));
    api.get("/ai/video-clip/engines").then(({ data }) => setEngines(data)).catch(() => {});
  }, [id]);

  // Auto-regenerate voiceover if the voice was changed externally (e.g. from
  // Voice Studio → Attach) and the project already had a rendered voiceover.
  useEffect(() => {
    if (!project || autoRegenTriedRef.current) return;
    if (!project.voice_stale) return;
    if (!project.audio_url || !project.script?.body) return;
    autoRegenTriedRef.current = true;
    toast.info("Voice changed — regenerating voiceover with the new voice…");
    setTimeout(() => { genVoice().catch(() => {}); }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.project_id, project?.voice_stale]);

  // Auto-pick a language-matched voice once BOTH voices and project are loaded.
  // Order matters: check `hinglish` BEFORE `hindi` because "hinglish".includes("hindi")
  // is true, which would incorrectly steer Hinglish projects to a Hindi-only voice.
  useEffect(() => {
    if (!voices.length || !project || voiceKey) return;
    const lang = (project.language || "").toLowerCase();
    let preferOrder;
    if (lang.includes("hinglish")) {
      // Hinglish voices are trained on roman-script Hindi — better match than pure Hindi.
      preferOrder = ["hinglish", "hindi", "indian_english", "english"];
    } else if (lang.includes("hindi")) {
      preferOrder = ["hindi", "hinglish", "indian_english", "english"];
    } else if (lang.includes("indian")) {
      preferOrder = ["indian_english", "english", "hindi"];
    } else {
      preferOrder = ["english", "indian_english"];
    }
    let picked = null;
    for (const p of preferOrder) {
      picked = voices.find(v => (v.language || "").toLowerCase() === p);
      if (picked) break;
    }
    setVoiceKeyRaw(project.voice_id
      ? `${project.voice_id}::${(voices.find(v => v.id === project.voice_id) || {}).name || ""}`
      : (picked ? `${picked.id}::${picked.name}` : (voices[0] ? `${voices[0].id}::${voices[0].name}` : "")));
  }, [voices, project, voiceKey]);

  if (!project) return <div className="label-mono text-zinc-500">Loading…</div>;

  // Show voices in a helpful order for the selected project language.
  // Hinglish/Hindi share a family — show family members first, then rest.
  const filteredVoices = (() => {
    const lang = (project.language || "").toLowerCase();
    let family;
    if (lang.includes("hinglish")) family = ["hinglish", "hindi", "indian_english"];
    else if (lang.includes("hindi")) family = ["hindi", "hinglish", "indian_english"];
    else if (lang.includes("indian")) family = ["indian_english", "english", "hindi"];
    else family = ["english", "indian_english"];
    const inFamily = voices.filter(v => family.includes((v.language || "").toLowerCase()));
    const others = voices.filter(v => !family.includes((v.language || "").toLowerCase()));
    // Sort inFamily by family order so the most-matched language appears first.
    inFamily.sort((a, b) => family.indexOf(a.language) - family.indexOf(b.language));
    return [...inFamily, ...others];
  })();

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
        target_gender: targetGender === "all" ? undefined : targetGender,
        target_age: targetAge || undefined,
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

  const previewVoice = async (voiceIdArg) => {
    const vid = voiceIdArg || voiceId;
    if (!vid) return;
    const lang = (project.language || "english").toLowerCase();
    const key = `${vid}::${lang}`;
    if (previewCache[key]) {
      const audio = new Audio(assetUrl(previewCache[key]));
      audio.play().catch(() => {});
      return;
    }
    setBusyPreview(true);
    try {
      const { data } = await api.post("/ai/tts/preview", { voice_id: vid, language: lang });
      if (data.audio_url) {
        setPreviewCache(prev => ({ ...prev, [key]: data.audio_url }));
        const audio = new Audio(assetUrl(data.audio_url));
        audio.play().catch(() => {});
      } else {
        toast.error(data.error || "Preview unavailable");
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Preview failed");
    } finally { setBusyPreview(false); }
  };

  // Hover-triggered preview with 400ms delay so casual scrubbing doesn't fire
  const onVoiceHover = (vid) => {
    if (!hoverPreview) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => previewVoice(vid), 400);
  };
  const onVoiceHoverEnd = () => clearTimeout(hoverTimer.current);

  const cloneVoiceUpload = async (e) => {
    e.preventDefault();
    if (!cloneName.trim() || !cloneFile) return toast.error("Name and audio file required");
    setBusyClone(true);
    const t = toast.loading("Cloning voice · 30-60s…");
    try {
      // Trim silence client-side before upload → cleaner clone
      let audioBlob = cloneFile;
      if (cloneTrimReady && (cloneTrimStart > 0 || cloneTrimEnd < cloneTrimReady.duration)) {
        audioBlob = await cloneTrimReady.trim(cloneTrimStart, cloneTrimEnd);
        audioBlob = new File([audioBlob], "trimmed.wav", { type: "audio/wav" });
      }
      const fd = new FormData();
      fd.append("name", cloneName);
      fd.append("audio", audioBlob);
      const { data } = await api.post("/voices/clone", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Voice "${data.voice.name}" cloned + selected!`, { id: t });
      // Refresh voice catalog
      const { data: vs } = await api.get("/catalog/voices?refresh=true");
      setVoices(vs);
      setVoiceId(data.voice.id);
      // PERSIST on the project so refresh keeps the selection
      const hadAudio = !!project?.audio_url;
      try {
        await api.put(`/projects/${id}`, { voice_id: data.voice.id });
        setProject((p) => (p ? { ...p, voice_id: data.voice.id, voice_stale: hadAudio ? true : p.voice_stale } : p));
      } catch (persistErr) {
        // Non-fatal: user can hit Generate voiceover which will pick voiceId state
      }
      setShowClone(false); setCloneName(""); setCloneFile(null);
      setCloneTrimReady(null); setCloneTrimStart(0); setCloneTrimEnd(0);
      // Auto-regenerate voiceover with the new cloned voice if project already had one
      if (hadAudio && project?.script) {
        toast.info("Re-recording voiceover in your cloned voice…");
        setTimeout(() => { genVoice().catch(() => {}); }, 600);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Clone failed", { id: t });
    } finally { setBusyClone(false); }
  };

  const onCloneFilePicked = async (file) => {
    setCloneFile(file);
    setCloneTrimReady(null);
    if (!file) return;
    try {
      const { prepareAudioForTrim } = await import("../lib/audioTrim");
      const ready = await prepareAudioForTrim(file);
      setCloneTrimReady(ready);
      setCloneTrimStart(0);
      setCloneTrimEnd(ready.duration);
    } catch (e) {
      // Trim optional — if decode fails, we still let user upload raw
    }
  };

  const genVoice = async () => {
    // Build the narration text: prefer concatenated per-scene voiceovers so the
    // audio matches what's actually being shown on screen. Fall back to the
    // top-level voiceover_script / body only when scene-level narration missing.
    const sceneNarration = (project.script?.scenes || [])
      .map(s => s?.voiceover || "")
      .filter(Boolean)
      .join(" ")
      .trim();
    const text = sceneNarration
      || project.script?.voiceover_script
      || project.script?.body
      || "";
    if (!text) return toast.error("Generate a script first");
    setBusyVoice(true);
    try {
      const { data } = await api.post("/ai/tts", { text, voice_id: voiceId, project_id: id });
      if (data.error) {
        toast.error(data.error);
        return;
      }
      await api.put(`/projects/${id}`, { audio_url: data.audio_url, voice_id: voiceId, status: "voicing" });
      // Reload full project so voice_stale flag reflects the fresh state.
      const { data: p } = await api.get(`/projects/${id}`);
      // Persist the last-provider so we can show a permanent info banner.
      setProject({ ...p, last_voice_provider: data.provider, last_voice_note: data.note || "" });
      if (data.note) toast.message(data.note, { duration: 8000 });
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

  // ---- Universal Voice Quality Handlers ----
  const scriptText = () => {
    const s = project?.script || {};
    return [s.hook, s.body, s.cta, s.voiceover_script].filter(Boolean).join(" ").trim();
  };

  const runPronCheck = async () => {
    if (!scriptText()) return toast.error("Generate or paste a script first");
    setBusyPron(true);
    try {
      const brand = project?.brand_name ? [project.brand_name] : [];
      const { data } = await api.post("/ai/pronunciation-check", {
        text: scriptText(), language: project.language, known_names: brand,
      });
      setPronCheck(data);
      toast.success(`${data.issues?.length || 0} pronunciation issues found`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Check failed");
    } finally { setBusyPron(false); }
  };

  const acceptPron = async (issue) => {
    const next = { ...(project.pronunciation || {}), [issue.word]: issue.suggested };
    try {
      await api.put(`/projects/${id}`, { pronunciation: next });
      setProject((p) => ({ ...p, pronunciation: next }));
      toast.success(`"${issue.word}" pronunciation saved`);
    } catch (e) { toast.error("Save failed"); }
  };

  const addPronCustom = async () => {
    if (!newPronWord.trim() || !newPronSaid.trim()) return;
    const next = { ...(project.pronunciation || {}), [newPronWord.trim()]: newPronSaid.trim() };
    try {
      await api.put(`/projects/${id}`, { pronunciation: next });
      setProject((p) => ({ ...p, pronunciation: next }));
      setNewPronWord(""); setNewPronSaid("");
      toast.success("Custom pronunciation added");
    } catch (e) { toast.error("Save failed"); }
  };

  const removePron = async (word) => {
    const next = { ...(project.pronunciation || {}) };
    delete next[word];
    try {
      await api.put(`/projects/${id}`, { pronunciation: next });
      setProject((p) => ({ ...p, pronunciation: next }));
    } catch (e) { toast.error("Save failed"); }
  };

  const setAccentLock = async (locked, accent) => {
    const patch = { accent_locked: locked };
    if (accent) patch.accent = accent;
    try {
      await api.put(`/projects/${id}`, patch);
      setProject((p) => ({ ...p, ...patch }));
      toast.success(locked ? "Accent locked" : "Accent unlocked");
    } catch (e) { toast.error("Save failed"); }
  };

  const submitFeedback = async () => {
    if (!fbTags.length && !fbText.trim()) return toast.error("Pick a tag or describe the issue");
    setFbBusy(true);
    try {
      const { data } = await api.post("/ai/feedback", {
        project_id: id, tags: fbTags, free_text: fbText, context: fbContext,
      });
      setFbResult(data);
      toast.success(`Understood — ${data.affected_layers?.length || 0} layer(s) will change`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Feedback failed");
    } finally { setFbBusy(false); }
  };

  const applyFeedbackFix = async () => {
    if (!fbResult?.apply_patch) return;
    try {
      const { data: updated } = await api.put(`/projects/${id}`, fbResult.apply_patch);
      setProject(updated);
      toast.success("Applied! Only affected layers will regenerate.");
      // If voice tuning changed, auto-regen voice
      if (fbResult.regenerate_only?.includes("voice") && project.audio_url) {
        setTimeout(() => { genVoice().catch(() => {}); }, 600);
      }
      setFbOpen(false); setFbTags([]); setFbText(""); setFbResult(null);
    } catch (e) { toast.error("Apply failed"); }
  };

  const runQa = async () => {
    setBusyQa(true);
    try {
      const { data } = await api.post("/ai/commercial-check", { project_id: id });
      setQa(data);
    } catch (e) { toast.error("QA failed"); }
    finally { setBusyQa(false); }
  };

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
            <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="pd-audience">
              <div className="w-full mb-1 flex flex-wrap items-center gap-2">
                <span className="label-mono text-zinc-500 text-[10px]">GENDER</span>
                {[
                  { id: "women", label: "Women / Girls" },
                  { id: "men", label: "Men / Boys" },
                  { id: "teens", label: "Gen-Z" },
                  { id: "kids", label: "Kids" },
                  { id: "all", label: "All" },
                ].map((g) => (
                  <button key={g.id} type="button" data-testid={`pd-gender-${g.id}`}
                    onClick={()=>setTargetGender(g.id)}
                    className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                      targetGender === g.id ? "bg-[#E2FF3D] text-black font-semibold" : "surface"
                    }`}>{g.label}</button>
                ))}
              </div>
              <div className="w-full mb-1 flex flex-wrap items-center gap-2">
                <span className="label-mono text-zinc-500 text-[10px]">AGE</span>
                {["", "13-17", "18-24", "25-34", "35-45", "45+"].map((a) => (
                  <button key={a || "any"} type="button" data-testid={`pd-age-${a || "any"}`}
                    onClick={()=>setTargetAge(a)}
                    className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                      targetAge === a ? "bg-[#E2FF3D] text-black font-semibold" : "surface"
                    }`}>{a || "Any"}</button>
                ))}
              </div>
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
            {variants?.winners?.reasoning && (
              <div data-testid="variants-winners" className="mt-4 surface rounded-lg p-3 border border-[#E2FF3D]/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="label-mono text-[#E2FF3D] text-[11px]">AI PERFORMANCE PREDICTOR</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="label-mono text-zinc-500 text-[10px] mb-0.5">🌱 ORGANIC WINNER</div>
                    <div className="text-emerald-300 font-semibold">{variants.winners.organic || "—"}</div>
                  </div>
                  <div>
                    <div className="label-mono text-zinc-500 text-[10px] mb-0.5">💰 GOOGLE ADS WINNER</div>
                    <div className="text-sky-300 font-semibold">{variants.winners.google_ads || "—"}</div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-zinc-400 italic">{variants.winners.reasoning}</div>
              </div>
            )}
            {variants?.variants && (
              <div data-testid="variants-panel" className="mt-4 grid gap-3 md:grid-cols-3">
                {variants.variants.map((v) => {
                  const isOrgWin = variants.winners?.organic === v.label;
                  const isAdsWin = variants.winners?.google_ads === v.label;
                  const s = v.scores;
                  return (
                    <div key={v.audience} data-testid={`variant-${v.audience}`}
                      className={`surface rounded-lg p-3 flex flex-col gap-2 border transition-colors ${
                        isOrgWin || isAdsWin
                          ? "border-[#E2FF3D] shadow-[0_0_0_1px_rgba(226,255,61,0.15)]"
                          : "border-white/10 hover:border-[#E2FF3D]/40"
                      }`}>
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="label-mono text-[#E2FF3D] text-[11px]">{v.label}</div>
                        <div className="flex gap-1">
                          {isOrgWin && <span className="label-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">🌱 ORG</span>}
                          {isAdsWin && <span className="label-mono text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">💰 ADS</span>}
                        </div>
                      </div>
                      {v.error ? (
                        <div className="text-xs text-red-400">Failed: {v.error}</div>
                      ) : (
                        <>
                          <div className="text-sm font-medium line-clamp-3">{v.script?.hook}</div>
                          <div className="text-xs text-zinc-400 line-clamp-3">{v.script?.body}</div>
                          <div className="text-[11px] text-zinc-500 italic line-clamp-2">CTA: {v.script?.cta}</div>
                          {s && (
                            <div className="mt-1 space-y-1" data-testid={`scores-${v.audience}`}>
                              <ScoreBar label="Organic" value={s.organic_composite} color="emerald" testId={`score-org-${v.audience}`} />
                              <ScoreBar label="Google Ads" value={s.google_ads_composite} color="sky" testId={`score-ads-${v.audience}`} />
                              <div className="grid grid-cols-3 gap-1 pt-1">
                                <MiniStat label="Hook" value={s.hook_strength} />
                                <MiniStat label="Retention" value={s.retention} />
                                <MiniStat label="CTA" value={s.cta_strength} />
                              </div>
                              {s.ads_policy_risk >= 40 && (
                                <div className="text-[10px] text-amber-400 mt-1">⚠ Ads policy risk {s.ads_policy_risk}/100</div>
                              )}
                              {s.top_improvement && (
                                <div className="text-[10px] text-zinc-500 pt-1 border-t border-white/5 mt-1">
                                  <span className="text-zinc-400">Tip:</span> {s.top_improvement}
                                </div>
                              )}
                            </div>
                          )}
                          <button data-testid={`apply-${v.audience}`} onClick={() => applyVariant(v)}
                            className="mt-auto btn-volt rounded-full px-3 py-1.5 text-xs flex items-center justify-center gap-1">
                            Use this script
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
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
              <div className="mt-4 space-y-2 text-sm" data-testid="pd-script-out">
                <Row label="HOOK" copyable={project.script.hook}>{project.script.hook}</Row>
                <Row label="BODY" copyable={project.script.body}>{project.script.body}</Row>
                <Row label="CTA" copyable={project.script.cta}>{project.script.cta}</Row>
                {project.script.captions && (
                  <Row label="CAPTIONS" copyable={project.script.captions.join(" · ")}>{project.script.captions.join(" · ")}</Row>
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

            {/* Stale voice banner — script changed after last recording */}
            {project.voice_stale && project.audio_url && (
              <div data-testid="voice-stale-banner" className="mb-3 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs p-2.5">
                <span className="mt-0.5">⚠</span>
                <div className="flex-1">
                  <div className="font-medium">Script updated — voiceover is out of sync</div>
                  <div className="opacity-80">Re-generate to record the latest lines.</div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-2">
              <div className="label-mono text-zinc-500 text-[10px] flex-1">SELECT VOICE (hover to preview)</div>
              <label className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer" data-testid="hover-toggle">
                <input type="checkbox" checked={hoverPreview} onChange={(e) => setHoverPreview(e.target.checked)}
                  className="accent-[#E2FF3D] w-3 h-3" />
                Hover preview
              </label>
              <button type="button" onClick={() => setShowClone(!showClone)}
                data-testid="show-clone" className="text-[10px] label-mono text-[#E2FF3D] hover:underline">
                {showClone ? "× Cancel" : "+ Clone your voice"}
              </button>
            </div>

            {/* Voice cards horizontal scroll */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" data-testid="voice-cards">
              {filteredVoices.map((v) => {
                const cardKey = `${v.id}::${v.name}`;
                const active = cardKey === voiceKey;
                return (
                  <button key={cardKey} type="button"
                    data-testid={`voice-card-${v.name}`}
                    onClick={() => setVoiceKeyRaw(cardKey)}
                    onMouseEnter={() => onVoiceHover(v.id)}
                    onMouseLeave={onVoiceHoverEnd}
                    className={`shrink-0 rounded-lg p-2.5 border transition-all min-w-[120px] text-left ${
                      active
                        ? "border-[#E2FF3D] bg-[#E2FF3D]/10"
                        : "border-white/10 hover:border-[#E2FF3D]/40 surface"
                    }`}>
                    <div className={`text-sm font-medium ${active ? "text-[#E2FF3D]" : ""}`}>{v.name}</div>
                    <div className="label-mono text-[9px] text-zinc-500 mt-0.5 uppercase">{v.language} · {v.gender}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{v.style}</div>
                    {active && (
                      <div className="mt-1.5 flex items-center gap-1 text-[9px] text-[#E2FF3D]">
                        <Play className="w-2.5 h-2.5" /> SELECTED
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {showClone && (
              <form onSubmit={cloneVoiceUpload} data-testid="clone-form" className="mt-2 mb-2 surface rounded-lg p-3 border border-[#E2FF3D]/20">
                <div className="label-mono text-[10px] text-[#E2FF3D] mb-2">CLONE YOUR VOICE · 100 CR</div>
                <input required data-testid="clone-name" value={cloneName} onChange={(e)=>setCloneName(e.target.value)}
                  placeholder="Voice name (e.g. My Voice)"
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded px-2 py-1.5 text-sm mb-2 outline-none" />
                <input required data-testid="clone-file" type="file" accept="audio/*"
                  onChange={(e) => onCloneFilePicked(e.target.files?.[0] || null)}
                  className="w-full text-xs mb-2" />
                {cloneTrimReady && (
                  <div className="mb-2 bg-[#0A0A0B] rounded p-2 border border-white/5" data-testid="clone-trim">
                    <div className="flex items-center justify-between mb-1">
                      <div className="label-mono text-[10px] text-[#E2FF3D]">TRIM SILENCE</div>
                      <div className="label-mono text-[10px] text-zinc-400">
                        {cloneTrimStart.toFixed(1)}s → {cloneTrimEnd.toFixed(1)}s
                        <span className="text-zinc-600"> · {(cloneTrimEnd - cloneTrimStart).toFixed(1)}s used</span>
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-[10px] text-zinc-500">Start</span>
                      <input type="range" min="0" step="0.1" max={cloneTrimReady.duration}
                        value={cloneTrimStart} data-testid="clone-trim-start"
                        onChange={(e)=>setCloneTrimStart(Math.min(parseFloat(e.target.value), cloneTrimEnd - 0.5))}
                        className="w-full accent-[#E2FF3D]" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-zinc-500">End</span>
                      <input type="range" min="0" step="0.1" max={cloneTrimReady.duration}
                        value={cloneTrimEnd} data-testid="clone-trim-end"
                        onChange={(e)=>setCloneTrimEnd(Math.max(parseFloat(e.target.value), cloneTrimStart + 0.5))}
                        className="w-full accent-[#E2FF3D]" />
                    </label>
                    <div className="text-[10px] text-zinc-500 mt-1">
                      Tip: keep 10-30 sec of clean speech. Cut off breaths, "umm"s, and background silence.
                    </div>
                  </div>
                )}
                <div className="text-[10px] text-zinc-500 mb-2">Upload 30-60s clean audio sample (MP3/WAV, up to 15 MB). Say a few sentences naturally.</div>
                <button type="submit" disabled={busyClone}
                  data-testid="clone-submit"
                  className="btn-volt rounded-full px-3 py-1.5 text-xs flex items-center gap-1 disabled:opacity-60">
                  {busyClone ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  {busyClone ? "Cloning…" : "Clone voice"}
                </button>
              </form>
            )}

            <div className="flex items-center gap-2">
              <button data-testid="voice-preview" onClick={() => previewVoice()} disabled={busyPreview || !voiceId}
                className="rounded-full surface px-3 py-1.5 text-xs border border-white/10 hover:border-[#E2FF3D]/40 disabled:opacity-50 flex items-center gap-1">
                {busyPreview ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Preview selected
              </button>
            </div>

            {/* Language mismatch warning */}
            {(() => {
              // Match by composite key so duplicate-id catalog entries don't
              // confuse the language lookup.
              const [, selName] = (voiceKey || "").split("::");
              const selVoice = voices.find(v => v.id === voiceId && v.name === selName);
              const pl = (project.language || "").toLowerCase();
              const vl = (selVoice?.language || "").toLowerCase();
              if (!selVoice || !pl || !vl) return null;
              const isIndian = (l) => ["hindi", "hinglish", "indian_english"].includes(l);
              const mismatch = pl !== vl && !(isIndian(pl) && isIndian(vl));
              if (!mismatch) return null;
              return (
                <div data-testid="lang-mismatch-warning" className="mt-2 text-[11px] text-amber-300/90 flex items-start gap-1.5">
                  <span>ℹ</span>
                  <span>Script is <b>{pl}</b> but selected voice is <b>{vl}</b>. Consider a matching voice for natural delivery.</span>
                </div>
              );
            })()}

            <button data-testid="gen-voice" onClick={genVoice} disabled={busyVoice || !project.script}
              className="mt-3 btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
              {busyVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              {busyVoice ? "Synthesising…" : (project.voice_stale && project.audio_url ? "Regenerate voiceover" : "Generate voiceover")}
            </button>

            {project.last_voice_provider === "openai" && (
              <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs" data-testid="tts-fallback-banner">
                <div className="font-semibold text-amber-300 mb-1">ℹ️ Using OpenAI voice (US-English) — API key SAHI hai</div>
                <div className="text-amber-100/80 leading-relaxed">
                  {project.last_voice_note || "ElevenLabs Free plan blocks premade voices via API — OpenAI HD fallback active."}
                </div>
                <a href="https://elevenlabs.io/subscription" target="_blank" rel="noreferrer"
                  className="mt-2 inline-block text-[#E2FF3D] underline text-[11px]">
                  Upgrade to $5 Starter plan → unlock all Indian voices
                </a>
              </div>
            )}
          </div>

          {/* UNIVERSAL VOICE QUALITY */}
          <div className="surface rounded-xl p-5" data-testid="voice-quality">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#E2FF3D]" />
                <div className="font-medium">Voice Quality System</div>
              </div>
              <span className="label-mono text-zinc-500">ACCENT · PRONUNCIATION · FEEDBACK</span>
            </div>

            {/* Accent Lock */}
            <div className="flex items-center justify-between bg-[#0A0A0B] rounded-lg p-3 mb-3" data-testid="accent-lock">
              <div>
                <div className="text-sm font-medium">🔒 Accent Lock</div>
                <div className="label-mono text-zinc-500 text-[10px]">
                  {project.accent_locked ? `LOCKED · ${project.accent || project.language}` : "Free — every scene may drift"}
                </div>
              </div>
              <div className="flex gap-2">
                <select data-testid="accent-select" value={project.accent || ""}
                  onChange={(e) => setAccentLock(project.accent_locked, e.target.value)}
                  className="bg-[#141416] text-xs rounded px-2 py-1 border border-white/10">
                  <option value="">Accent…</option>
                  <optgroup label="🇮🇳 Indian">
                    <option value="hindi">Hindi</option>
                    <option value="hinglish">Hinglish</option>
                    <option value="indian_english">Indian English</option>
                    <option value="bengali">Bengali</option>
                    <option value="marathi">Marathi</option>
                    <option value="gujarati">Gujarati</option>
                    <option value="punjabi">Punjabi</option>
                    <option value="tamil">Tamil</option>
                    <option value="telugu">Telugu</option>
                    <option value="kannada">Kannada</option>
                    <option value="malayalam">Malayalam</option>
                  </optgroup>
                  <optgroup label="🌍 English variants">
                    <option value="american_english">American English</option>
                    <option value="british_english">British English</option>
                    <option value="australian_english">Australian English</option>
                    <option value="neutral_english">Neutral English</option>
                  </optgroup>
                </select>
                <button data-testid="accent-lock-btn" onClick={() => setAccentLock(!project.accent_locked)}
                  className={`rounded-full px-3 py-1 text-xs ${project.accent_locked ? "bg-[#E2FF3D] text-black font-semibold" : "surface"}`}>
                  {project.accent_locked ? "Locked" : "Lock"}
                </button>
              </div>
            </div>

            {/* Pronunciation Editor */}
            <div className="mb-3" data-testid="pron-editor">
              <div className="flex items-center justify-between mb-2">
                <div className="label-mono text-zinc-500 text-[11px]">PRONUNCIATION</div>
                <button data-testid="pron-check-btn" onClick={runPronCheck} disabled={busyPron || !project.script}
                  className="rounded-full surface px-3 py-1 text-[11px] disabled:opacity-60">
                  {busyPron ? "Scanning…" : "🔍 AI-scan script"}
                </button>
              </div>

              {pronCheck?.issues?.length > 0 && (
                <div className="space-y-1.5 mb-2 max-h-48 overflow-y-auto scroll-thin pr-1">
                  {pronCheck.issues.map((issue, i) => {
                    const already = (project.pronunciation || {})[issue.word];
                    return (
                      <div key={i} className="bg-[#0A0A0B] rounded p-2 text-xs flex items-center gap-2 border border-white/5">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate"><span className="text-[#E2FF3D]">{issue.word}</span> → <span>{issue.suggested}</span></div>
                          <div className="text-[10px] text-zinc-500">{issue.reason} · {issue.example}</div>
                        </div>
                        <button data-testid={`pron-accept-${i}`} onClick={() => acceptPron(issue)}
                          className={`rounded-full px-2 py-1 text-[10px] ${already ? "bg-white/5 text-zinc-500" : "btn-volt"}`}>
                          {already ? "Saved" : "Accept"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Manual add */}
              <div className="flex gap-2 mb-2" data-testid="pron-add">
                <input value={newPronWord} onChange={(e) => setNewPronWord(e.target.value)} placeholder="Word (HeartLink)"
                  className="flex-1 bg-[#0A0A0B] border border-white/10 rounded px-2 py-1 text-xs outline-none"/>
                <input value={newPronSaid} onChange={(e) => setNewPronSaid(e.target.value)} placeholder="Said as (Heart Link)"
                  className="flex-1 bg-[#0A0A0B] border border-white/10 rounded px-2 py-1 text-xs outline-none"/>
                <button data-testid="pron-add-btn" onClick={addPronCustom} className="rounded surface px-3 py-1 text-xs">Add</button>
              </div>

              {/* Saved dictionary */}
              {Object.keys(project.pronunciation || {}).length > 0 && (
                <div className="flex flex-wrap gap-1.5" data-testid="pron-dict">
                  {Object.entries(project.pronunciation).map(([w, s]) => (
                    <span key={w} className="bg-[#141416] rounded-full px-2 py-1 text-[10px] flex items-center gap-1.5 border border-white/5">
                      {w} → {s}
                      <button onClick={() => removePron(w)} className="text-zinc-500 hover:text-red-400">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Feedback + QA */}
            <div className="flex gap-2 flex-wrap">
              <button data-testid="feedback-btn" onClick={() => setFbOpen(true)}
                className="rounded-full surface px-3 py-1.5 text-xs">💬 Give Feedback</button>
              <button data-testid="commercial-btn" onClick={runQa} disabled={busyQa}
                className="rounded-full surface px-3 py-1.5 text-xs">
                {busyQa ? "Checking…" : "✓ Commercial Quality Check"}
              </button>
            </div>

            {qa && (
              <div className="mt-3 bg-[#0A0A0B] rounded p-3" data-testid="qa-result">
                <div className={`text-xs font-semibold mb-2 uppercase ${
                  qa.overall === "ready_for_export" ? "text-green-400" :
                  qa.overall === "blocked" ? "text-red-400" : "text-yellow-400"
                }`}>{qa.overall === "ready_for_export" ? "✓ Ready for export" : qa.overall.replace("_", " ")}</div>
                <div className="space-y-1 max-h-56 overflow-y-auto scroll-thin pr-1">
                  {qa.checks.map((c, i) => (
                    <div key={i} className="text-[11px] flex items-start gap-2">
                      <span className={c.status === "pass" ? "text-green-400" : c.status === "warn" ? "text-yellow-400" : "text-red-400"}>
                        {c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : "✗"}
                      </span>
                      <span className="text-zinc-300"><b>{c.label}</b> {c.note && <span className="text-zinc-500">— {c.note}</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* FEEDBACK MODAL */}
          {fbOpen && (
            <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4" data-testid="feedback-modal">
              <div className="w-full max-w-md bg-[#0F0F11] border border-white/10 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">Give Feedback</div>
                  <button onClick={() => { setFbOpen(false); setFbResult(null); }} className="text-zinc-500 hover:text-white">×</button>
                </div>
                <div className="flex gap-2 mb-3">
                  {["voice","video","ad"].map((c) => (
                    <button key={c} onClick={() => setFbContext(c)}
                      className={`rounded-full px-3 py-1 text-xs capitalize ${fbContext===c ? "bg-[#E2FF3D] text-black" : "surface"}`}>{c}</button>
                  ))}
                </div>
                <div className="label-mono text-zinc-500 text-[10px] mb-1">TAGS</div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(fbContext === "voice" ? ["accent_wrong","too_american","too_british","too_robotic","pronunciation_wrong","too_fast","too_slow","voice_not_natural","emotion_wrong"] :
                    fbContext === "video" ? ["scene_mismatch","product_hidden","avatar_unnatural","b_roll_irrelevant","camera_wrong","lighting_wrong","text_too_large","captions_wrong","cta_weak"] :
                    ["hook_weak","cta_weak","message_unclear","too_slow","not_engaging","platform_mismatch"]).map((t) => (
                    <button key={t} data-testid={`fb-tag-${t}`}
                      onClick={() => setFbTags((p) => p.includes(t) ? p.filter((x) => x!==t) : [...p, t])}
                      className={`rounded-full px-2 py-1 text-[10px] transition ${fbTags.includes(t) ? "bg-[#E2FF3D] text-black" : "surface"}`}>
                      {t.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
                <textarea data-testid="fb-text" value={fbText} onChange={(e) => setFbText(e.target.value)} rows={3}
                  placeholder="Describe the problem in your own words…"
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none mb-3"/>
                {!fbResult ? (
                  <button data-testid="fb-submit" onClick={submitFeedback} disabled={fbBusy}
                    className="btn-volt rounded-full px-4 py-2 text-sm w-full disabled:opacity-60">
                    {fbBusy ? "Analysing…" : "Analyse feedback"}
                  </button>
                ) : (
                  <div>
                    <div className="text-xs text-zinc-400 mb-2">{fbResult.understood}</div>
                    <div className="bg-[#141416] rounded p-2 mb-3 max-h-40 overflow-y-auto text-[11px] space-y-1">
                      {(fbResult.actions || []).map((a, i) => (
                        <div key={i}>· <b className="text-[#E2FF3D]">{a.layer}</b>.{a.field} = <span className="text-zinc-300">{JSON.stringify(a.value)}</span></div>
                      ))}
                    </div>
                    <button data-testid="fb-apply" onClick={applyFeedbackFix}
                      className="btn-volt rounded-full px-4 py-2 text-sm w-full">Apply fix + regenerate affected layers</button>
                  </div>
                )}
              </div>
            </div>
          )}

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

function Row({ label, children, copyable }) {
  const doCopy = () => {
    if (!copyable) return;
    navigator.clipboard.writeText(String(copyable));
    toast.success("Copied");
  };
  return (
    <div className="flex gap-3 group">
      <div className="label-mono text-zinc-500 w-20 shrink-0 pt-1">{label}</div>
      <div className="text-zinc-200 flex-1">{children}</div>
      {copyable && (
        <button data-testid={`pd-copy-${label.toLowerCase()}`} onClick={doCopy}
          className="text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100 md:opacity-60 transition self-start pt-1">
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function ScoreBar({ label, value, color = "emerald", testId }) {
  const v = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const barColor = color === "sky" ? "bg-sky-400" : color === "emerald" ? "bg-emerald-400" : "bg-[#E2FF3D]";
  const textColor = color === "sky" ? "text-sky-300" : color === "emerald" ? "text-emerald-300" : "text-[#E2FF3D]";
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <div className="label-mono text-[10px] text-zinc-500 w-16 shrink-0">{label}</div>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${v}%` }} />
      </div>
      <div className={`label-mono text-[10px] w-7 text-right ${textColor}`}>{v}</div>
    </div>
  );
}

function MiniStat({ label, value }) {
  const v = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const color = v >= 75 ? "text-emerald-300" : v >= 55 ? "text-[#E2FF3D]" : v >= 35 ? "text-amber-300" : "text-red-300";
  return (
    <div className="surface rounded px-1.5 py-1 text-center">
      <div className={`text-xs font-semibold ${color}`}>{v}</div>
      <div className="label-mono text-[9px] text-zinc-500 uppercase">{label}</div>
    </div>
  );
}
