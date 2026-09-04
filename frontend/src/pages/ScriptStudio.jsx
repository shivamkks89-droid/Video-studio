import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2, Copy, Film, Edit3, Wand2, Scissors, Type, Languages, Layers } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";

const LANGS = ["english", "hindi", "hinglish"];
const TONES = ["professional", "motivational", "friendly", "emotional", "storytelling", "luxury", "ugc"];
const REFINE_ACTIONS = [
  { id: "improve", label: "Improve", icon: Wand2 },
  { id: "shorten", label: "Shorten", icon: Scissors },
  { id: "expand", label: "Expand", icon: Layers },
  { id: "change_tone", label: "Change tone", icon: Type },
  { id: "translate", label: "Translate", icon: Languages },
  { id: "split_scenes", label: "Split scenes", icon: Edit3 },
];

export default function ScriptStudio() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("english");
  const [tone, setTone] = useState("professional");
  const [duration, setDuration] = useState(30);
  const [videoType, setVideoType] = useState("cinematic_ad");
  const [cta, setCta] = useState("");
  const [targetGender, setTargetGender] = useState("all");
  const [targetAge, setTargetAge] = useState("");
  const [script, setScript] = useState(null);
  const [hooks, setHooks] = useState([]);
  const [ctas, setCtas] = useState([]);
  const [busy, setBusy] = useState(false);
  const [busyH, setBusyH] = useState(false);
  const [busyC, setBusyC] = useState(false);
  const [busyProj, setBusyProj] = useState(false);

  // Manual editor state
  const [manualText, setManualText] = useState("");
  const [refining, setRefining] = useState(null); // action id when in-flight
  const [refineMeta, setRefineMeta] = useState({ tone: "friendly", target_language: "hinglish" });
  const wordCount = manualText.trim() ? manualText.trim().split(/\s+/).length : 0;
  const charCount = manualText.length;
  const estDurationSec = Math.max(1, Math.round(wordCount / 2.5));
  const sceneCount = Math.max(1, Math.round(estDurationSec / 5));

  const runRefine = async (action) => {
    if (!manualText.trim()) return toast.error("Paste or type a script first");
    setRefining(action);
    try {
      const { data } = await api.post("/ai/script/refine", {
        script_text: manualText, action, language,
        tone: refineMeta.tone,
        target_duration_sec: action === "shorten" ? Math.max(15, duration - 10) : action === "expand" ? duration + 20 : undefined,
        target_language: action === "translate" ? refineMeta.target_language : undefined,
      });
      setManualText(data.text);
      toast.success(`Script ${action.replace("_", " ")}ed`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Refine failed");
    } finally { setRefining(null); }
  };

  const createFromManual = async () => {
    if (!manualText.trim()) return toast.error("Empty script");
    setBusyProj(true);
    try {
      const words = manualText.trim().split(/\s+/);
      const title = words.slice(0, 8).join(" ") || "Manual script";
      const scriptObj = {
        hook: words.slice(0, 12).join(" "),
        body: manualText,
        cta: cta || "",
        voiceover_script: manualText,
        scenes: [], captions: [], music_mood: "cinematic",
      };
      const aspect = ["yt_short","ig_reel","tiktok","app_promo","talking_avatar"].includes(videoType) ? "9:16"
        : videoType === "product_ad" ? "1:1" : "16:9";
      const { data } = await api.post("/projects/from-script", {
        title, video_type: videoType, language, aspect_ratio: aspect,
        duration_sec: Math.max(15, estDurationSec), script: scriptObj,
      });
      toast.success("Project created from manual script");
      navigate(`/dashboard/projects/${data.project_id}`);
    } catch (e) { toast.error("Failed to create project"); }
    finally { setBusyProj(false); }
  };

  const createVideoProject = async () => {
    if (!script) return;
    setBusyProj(true);
    try {
      const title = topic.slice(0, 60) || "Untitled reel";
      const aspect = ["yt_short","ig_reel","tiktok","app_promo","talking_avatar"].includes(videoType) ? "9:16"
        : videoType === "product_ad" ? "1:1" : "16:9";
      const { data } = await api.post("/projects/from-script", {
        title, video_type: videoType, language, aspect_ratio: aspect, duration_sec: duration, script,
      });
      toast.success("Video project created — let's generate scenes & voice");
      navigate(`/dashboard/projects/${data.project_id}`);
    } catch (e) {
      toast.error("Could not create project");
    } finally { setBusyProj(false); }
  };

  const run = async () => {
    if (!topic.trim()) return toast.error("Add a topic");
    setBusy(true);
    try {
      const { data } = await api.post("/ai/script", {
        topic, language, tone, duration_sec: duration, video_type: videoType, cta,
        target_gender: targetGender === "all" ? undefined : targetGender,
        target_age: targetAge || undefined,
      });
      setScript(data.script);
      toast.success("Script ready");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const runHooks = async () => {
    if (!topic.trim()) return toast.error("Add a topic");
    setBusyH(true);
    try {
      const { data } = await api.post("/ai/hooks", { topic, language });
      setHooks(data.hooks || []);
    } catch (e) { toast.error("Failed"); }
    finally { setBusyH(false); }
  };
  const runCtas = async () => {
    if (!topic.trim()) return toast.error("Add a topic");
    setBusyC(true);
    try {
      const { data } = await api.post("/ai/ctas", { topic, language });
      setCtas(data.ctas || []);
    } catch (e) { toast.error("Failed"); }
    finally { setBusyC(false); }
  };

  const copy = (t) => { navigator.clipboard.writeText(t); toast.success("Copied"); };

  return (
    <div data-testid="script-studio" className="space-y-6">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ SCRIPT STUDIO</div>
        <h1 className="text-3xl font-semibold tracking-tight">Write the spine of your reel.</h1>
        <p className="text-zinc-400 text-sm mt-2">Generate scripts with AI, or paste your own & refine.</p>
      </div>

      {/* MANUAL EDITOR */}
      <div className="surface rounded-xl p-5" data-testid="ss-manual-editor">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="label-mono text-[#E2FF3D]">/ MANUAL SCRIPT EDITOR</div>
          <div className="flex items-center gap-4 label-mono text-zinc-500 text-[10px]">
            <span data-testid="ss-word-count">{wordCount} WORDS</span>
            <span data-testid="ss-char-count">{charCount} CHARS</span>
            <span data-testid="ss-est-duration">~{estDurationSec}s VOICE</span>
            <span data-testid="ss-scene-count">{sceneCount} SCENES</span>
          </div>
        </div>
        <textarea data-testid="ss-manual-text" value={manualText} onChange={(e)=>setManualText(e.target.value)} rows={6}
          className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-3 text-sm outline-none focus:border-white/30 resize-y"
          placeholder="Paste your own script here — Hindi, Hinglish or English. Or start typing…" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {REFINE_ACTIONS.map((a) => (
            <button key={a.id} data-testid={`ss-refine-${a.id}`} onClick={()=>runRefine(a.id)} disabled={refining===a.id}
              className="rounded-full surface px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-60 hover:border-[#E2FF3D]">
              {refining===a.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <a.icon className="w-3 h-3"/>}
              {a.label}
            </button>
          ))}
          <select data-testid="ss-refine-tone" value={refineMeta.tone}
            onChange={(e)=>setRefineMeta((p)=>({...p, tone: e.target.value}))}
            className="bg-[#0A0A0B] border border-white/10 rounded-lg px-2 py-1 text-xs">
            {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select data-testid="ss-refine-lang" value={refineMeta.target_language}
            onChange={(e)=>setRefineMeta((p)=>({...p, target_language: e.target.value}))}
            className="bg-[#0A0A0B] border border-white/10 rounded-lg px-2 py-1 text-xs">
            {LANGS.map((l) => <option key={l} value={l}>Translate → {l}</option>)}
          </select>
          <button data-testid="ss-manual-create" onClick={createFromManual} disabled={busyProj}
            className="ml-auto btn-volt rounded-full px-4 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-60">
            {busyProj ? <Loader2 className="w-3 h-3 animate-spin"/> : <Film className="w-3 h-3"/>}
            Turn into video project
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-4">
        <div className="surface rounded-xl p-5 space-y-4">
          <div className="label-mono text-[#E2FF3D]">/ AI SCRIPT GENERATOR</div>
          <Field label="Topic / Product / URL">
            <textarea data-testid="ss-topic" value={topic} onChange={(e)=>setTopic(e.target.value)} rows={3}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 resize-none"
              placeholder="A new Hinglish fitness app for Indian women — quick 15-min workouts" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Language" value={language} setValue={setLanguage} options={LANGS} testid="ss-lang" />
            <Select label="Tone" value={tone} setValue={setTone} options={TONES} testid="ss-tone" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Duration · ${duration}s`}>
              <input data-testid="ss-duration" type="range" min="10" max="120" step="5" value={duration}
                onChange={(e)=>setDuration(Number(e.target.value))} className="w-full accent-[#E2FF3D]" />
            </Field>
            <Select label="Type" value={videoType} setValue={setVideoType} testid="ss-type"
              options={["cinematic_ad","product_ad","ig_reel","yt_short","tiktok","talking_avatar","ai_news","real_estate","app_promo"]} />
          </div>
          <Field label="CTA (optional)">
            <input data-testid="ss-cta" value={cta} onChange={(e)=>setCta(e.target.value)}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30"
              placeholder="Download now · Visit website" />
          </Field>
          <div>
            <div className="label-mono text-zinc-500 mb-2">TARGET GENDER</div>
            <div className="flex gap-2 flex-wrap" data-testid="ss-gender">
              {[
                { id: "women", label: "Women / Girls" },
                { id: "men", label: "Men / Boys" },
                { id: "teens", label: "Gen-Z / Teens" },
                { id: "kids", label: "Kids" },
                { id: "all", label: "All" },
              ].map((g) => (
                <button key={g.id} type="button" data-testid={`ss-gender-${g.id}`}
                  onClick={()=>setTargetGender(g.id)}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${
                    targetGender === g.id ? "bg-[#E2FF3D] text-black font-semibold" : "surface"
                  }`}>{g.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="label-mono text-zinc-500 mb-2">TARGET AGE (optional)</div>
            <div className="flex gap-2 flex-wrap" data-testid="ss-age">
              {["", "13-17", "18-24", "25-34", "35-45", "45+"].map((a) => (
                <button key={a || "any"} type="button" data-testid={`ss-age-${a || "any"}`}
                  onClick={()=>setTargetAge(a)}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${
                    targetAge === a ? "bg-[#E2FF3D] text-black font-semibold" : "surface"
                  }`}>{a || "Any"}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button data-testid="ss-generate" onClick={run} disabled={busy} className="btn-volt rounded-full px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60 flex-1 justify-center">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy ? "Writing…" : "Generate full script"}
            </button>
          </div>
          <div className="flex gap-2">
            <button data-testid="ss-hooks" onClick={runHooks} disabled={busyH} className="flex-1 rounded-full surface px-3 py-2 text-xs disabled:opacity-60">{busyH?"…":"5 hooks"}</button>
            <button data-testid="ss-ctas" onClick={runCtas} disabled={busyC} className="flex-1 rounded-full surface px-3 py-2 text-xs disabled:opacity-60">{busyC?"…":"5 CTAs"}</button>
          </div>
          {(hooks.length > 0 || ctas.length > 0) && (
            <div className="grid grid-cols-1 gap-3 pt-2">
              {hooks.length > 0 && (
                <div>
                  <div className="label-mono text-zinc-500 mb-2">HOOKS</div>
                  <ul className="space-y-1.5">
                    {hooks.map((h, i) => (
                      <li key={i} className="text-sm flex justify-between gap-2"><span>{h}</span>
                        <button onClick={()=>copy(h)} className="text-zinc-500 hover:text-white"><Copy className="w-3.5 h-3.5"/></button></li>
                    ))}
                  </ul>
                </div>
              )}
              {ctas.length > 0 && (
                <div>
                  <div className="label-mono text-zinc-500 mb-2">CTAS</div>
                  <ul className="space-y-1.5">
                    {ctas.map((c, i) => (
                      <li key={i} className="text-sm flex justify-between gap-2"><span>{c}</span>
                        <button onClick={()=>copy(c)} className="text-zinc-500 hover:text-white"><Copy className="w-3.5 h-3.5"/></button></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-7 surface rounded-xl p-5 min-h-[60vh]">
        {!script ? (
          <div className="h-full grid place-items-center text-center">
            <div>
              <Sparkles className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <div className="text-zinc-500">Your script will appear here.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-white/5">
              <div className="label-mono text-[#E2FF3D]">SCRIPT READY</div>
              <button data-testid="ss-create-video"
                onClick={createVideoProject} disabled={busyProj}
                className="btn-volt rounded-full px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
                {busyProj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                {busyProj ? "Creating…" : "Make Video from this Script →"}
              </button>
            </div>
            <Row label="HOOK" copyable={script.hook}>{script.hook}</Row>
            <Row label="BODY" copyable={script.body}>{script.body}</Row>
            <Row label="CTA" copyable={script.cta}>{script.cta}</Row>
            <Row label="VOICEOVER" copyable={script.voiceover_script}>{script.voiceover_script}</Row>
            {script.captions && <Row label="CAPTIONS" copyable={script.captions.join(" · ")}>{script.captions.join(" · ")}</Row>}
            {script.music_mood && <Row label="MUSIC">{script.music_mood}</Row>}
            {script.scenes?.length > 0 && (
              <div>
                <div className="label-mono text-zinc-500 mb-2">SCENES</div>
                <div className="space-y-2">
                  {script.scenes.map((s, i) => (
                    <div key={i} className="surface rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="label-mono text-[#E2FF3D]">SCN {String(s.index || i+1).padStart(2,"0")} · {s.duration}s</div>
                        <div className="label-mono text-zinc-500">{s.camera}</div>
                      </div>
                      <div className="text-zinc-200">{s.voiceover}</div>
                      <div className="text-xs text-zinc-500 mt-1">{s.visual_prompt}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="label-mono text-zinc-500 mb-2">{label}</div>
      {children}
    </div>
  );
}
function Select({ label, value, setValue, options, testid }) {
  return (
    <Field label={label}>
      <select data-testid={testid} value={value} onChange={(e)=>setValue(e.target.value)}
        className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none capitalize">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}
function Row({ label, children, copyable }) {
  const doCopy = () => {
    if (!copyable) return;
    navigator.clipboard.writeText(String(copyable));
    if (typeof window !== "undefined") {
      // Prevent hard dep — use toast if imported by parent
      try { require("sonner").toast.success("Copied"); } catch (_) {}
    }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="label-mono text-zinc-500">{label}</div>
        {copyable && (
          <button data-testid={`ss-copy-${label.toLowerCase()}`} onClick={doCopy}
            className="text-zinc-500 hover:text-white transition"><Copy className="w-3.5 h-3.5"/></button>
        )}
      </div>
      <div className="text-zinc-200 leading-relaxed">{children}</div>
    </div>
  );
}
