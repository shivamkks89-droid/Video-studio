import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2, Copy, Film } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";

const LANGS = ["english", "hindi", "hinglish"];
const TONES = ["professional", "motivational", "friendly", "emotional", "storytelling"];

export default function ScriptStudio() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("english");
  const [tone, setTone] = useState("professional");
  const [duration, setDuration] = useState(30);
  const [videoType, setVideoType] = useState("cinematic_ad");
  const [cta, setCta] = useState("");
  const [script, setScript] = useState(null);
  const [hooks, setHooks] = useState([]);
  const [ctas, setCtas] = useState([]);
  const [busy, setBusy] = useState(false);
  const [busyH, setBusyH] = useState(false);
  const [busyC, setBusyC] = useState(false);
  const [busyProj, setBusyProj] = useState(false);

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
    <div data-testid="script-studio" className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-4">
        <div>
          <div className="label-mono text-zinc-500 mb-2">/ SCRIPT STUDIO</div>
          <h1 className="text-3xl font-semibold tracking-tight">Write the spine of your reel.</h1>
        </div>
        <div className="surface rounded-xl p-5 space-y-4">
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
            <Row label="HOOK">{script.hook}</Row>
            <Row label="BODY">{script.body}</Row>
            <Row label="CTA">{script.cta}</Row>
            <Row label="VOICEOVER">{script.voiceover_script}</Row>
            {script.captions && <Row label="CAPTIONS">{script.captions.join(" · ")}</Row>}
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
function Row({ label, children }) {
  return (
    <div>
      <div className="label-mono text-zinc-500 mb-1">{label}</div>
      <div className="text-zinc-200 leading-relaxed">{children}</div>
    </div>
  );
}
