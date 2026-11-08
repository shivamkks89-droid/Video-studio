import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { api } from "../lib/api";

const THEMES = [
  ["Festival", "energetic"], ["Diwali", "emotional"], ["Holi", "energetic"], ["Eid", "emotional"],
  ["Christmas", "uplifting"], ["New Year", "motivational"], ["Wedding", "luxury"], ["Birthday", "energetic"],
  ["Anniversary", "emotional"], ["Navratri", "energetic"], ["Durga Puja", "cinematic"], ["Devotional", "emotional"],
  ["Brand Promotion", "corporate"], ["Product Advertisement", "ugc"], ["Travel", "cinematic"], ["Cinematic Story", "storytelling"],
];
const MOOD_TRACK = {
  cinematic: "mx-cinematic-01", corporate: "mx-uplifting-01", uplifting: "mx-uplifting-01", emotional: "mx-emotional-01",
  energetic: "mx-energetic-01", luxury: "mx-luxury-01", storytelling: "mx-storytelling-01", ugc: "mx-ugc-01",
  motivational: "mx-motivational-01",
};
// Prompt-based camera direction (works with the existing image provider; no extra API).
const CAMERAS = ["Wide", "Close-up", "Drone/Aerial", "Low Angle", "High Angle", "Tracking", "Orbit", "Slow Motion"];
const DURS = [15, 30, 45, 60];
const ASPECTS = ["9:16", "16:9", "1:1"];

const Chips = ({ items, value, onChange, testid }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((it) => (
      <button key={it} type="button" data-testid={`${testid}-${String(it).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
        onClick={() => onChange(it)}
        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${value === it ? "bg-[#E2FF3D] text-black border-[#E2FF3D]" : "border-white/15 text-zinc-300 hover:border-white/40"}`}>
        {it}
      </button>
    ))}
  </div>
);

export const FestivalPanel = ({ project, onDone }) => {
  const [theme, setTheme] = useState("Diwali");
  const [mode, setMode] = useState("Story + Voiceover");
  const [camera, setCamera] = useState("Wide");
  const [dur, setDur] = useState(project.duration_sec && DURS.includes(project.duration_sec) ? project.duration_sec : 30);
  const [aspect, setAspect] = useState(project.aspect_ratio || "9:16");
  const [busy, setBusy] = useState(false);
  const [greet, setGreet] = useState(project.greeting_text || "");
  const [gpos, setGpos] = useState(project.greeting_pos || "center");
  const saveGreeting = async (text, pos) => {
    try { await api.put(`/projects/${project.project_id}`, { greeting_text: text.trim(), greeting_pos: pos }); }
    catch { toast.error("Greeting save nahi hua"); }
  };
  const scenes = Math.max(3, Math.min(10, Math.round(dur / 6)));
  const musicOnly = mode === "Music Only";
  const est = 5 + scenes * 3 + 10;

  const go = async () => {
    setBusy(true);
    try {
      const mood = THEMES.find((t) => t[0] === theme)[1];
      await api.put(`/projects/${project.project_id}`, { greeting_text: greet.trim(), greeting_pos: gpos, aspect_ratio: aspect, duration_sec: dur, festival_theme: theme, creation_mode: musicOnly ? "music_only" : "story_voice" });
      await api.post("/projects/music", { project_id: project.project_id, music_id: MOOD_TRACK[mood], music_volume: musicOnly ? 0.85 : 0.18 });
      const notes = `THEME: ${theme} — use authentic ${theme} visual vibes (colours, decor, lighting, clothing, props) consistently in every scene. `
        + `CAMERA: every scene's camera direction must be "${camera}" style cinematic shot. `
        + (musicOnly
          ? "MODE: MUSIC ONLY — no narration. Keep each scene's voiceover field EMPTY; tell the story purely through visuals and short on-screen text."
          : "MODE: STORY + VOICEOVER — a short emotional story with a beginning, middle and end; narration lines must fit each scene's length.");
      const { data } = await api.post("/ai/script", {
        project_id: project.project_id, topic: `${theme}: ${project.topic || project.title}`, video_type: project.video_type,
        language: project.language, duration_sec: dur, scene_count: scenes, tone: musicOnly ? "emotional" : "storytelling", extra_notes: notes,
      });
      toast.success(musicOnly ? "Script ready — ab storyboard banao, phir render (voice ki zaroorat nahi)" : "Story ready — ab storyboard aur voiceover banao, phir render");
      onDone?.(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Festival setup nahi hua, dobara try karo"); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="festival-panel" className="surface rounded-xl p-4 sm:p-5">
      <div className="label-mono text-zinc-500 flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#E2FF3D]" /> / FESTIVAL & CINEMATIC</div>
      <div className="mt-3 space-y-3">
        <div><div className="text-xs text-zinc-400 mb-1.5">Theme</div><Chips items={THEMES.map((t) => t[0])} value={theme} onChange={setTheme} testid="fest-theme" /></div>
        <div><div className="text-xs text-zinc-400 mb-1.5">Mode</div><Chips items={["Music Only", "Story + Voiceover"]} value={mode} onChange={setMode} testid="fest-mode" /></div>
        <div><div className="text-xs text-zinc-400 mb-1.5">Camera angle</div><Chips items={CAMERAS} value={camera} onChange={setCamera} testid="fest-camera" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-xs text-zinc-400 mb-1.5">Duration (sec)</div><Chips items={DURS} value={dur} onChange={setDur} testid="fest-dur" /></div>
          <div><div className="text-xs text-zinc-400 mb-1.5">Aspect</div><Chips items={ASPECTS} value={aspect} onChange={setAspect} testid="fest-aspect" /></div>
        </div>
        <div>
          <div className="text-xs text-zinc-400 mb-1.5">Greeting (aakhri scene par) — khaali = default</div>
          <input data-testid="fest-greeting-input" value={greet} maxLength={60} placeholder="e.g. Shubh Deepavali"
            onChange={(e) => setGreet(e.target.value)} onBlur={() => saveGreeting(greet, gpos)}
            className="w-full bg-transparent border border-white/15 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600" />
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-zinc-400">Jagah:</span>
            {[["top", "Upar"], ["center", "Beech"], ["bottom", "Neeche"]].map(([v, l]) => (
              <button key={v} type="button" data-testid={`fest-greeting-pos-${v}`} onClick={() => { setGpos(v); saveGreeting(greet, v); }}
                className={`px-2.5 py-1 rounded-full text-xs border ${gpos === v ? "bg-[#E2FF3D] text-black border-[#E2FF3D]" : "border-white/15 text-zinc-300 hover:border-white/40"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div data-testid="fest-estimate" className="text-xs text-zinc-400">
          Andaazan kharcha: <span className="text-[#E2FF3D] font-semibold">~{est} CR</span> (script 5 + {scenes} scenes × 3 + render 10){musicOnly ? "" : " + voiceover"} · 1080p
        </div>
        <button data-testid="fest-generate" disabled={busy} onClick={go}
          className="btn-volt rounded-full px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {musicOnly ? "Music video script banao" : "Story script banao"}
        </button>
      </div>
    </div>
  );
};
