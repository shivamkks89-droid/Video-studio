import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, Pause, Music, Wand2, Type } from "lucide-react";
import { api } from "../lib/api";

const MOOD_WORDS = [
  ["emotional", /maa|mata|lakshmi|shiv|krishna|ram|ganesh|durga|bhakti|ashirwad|pooja|puja|divine|bhagwan|devotional|aarti|pyaar|love|yaad|emotional|parivar|family/i],
  ["suspense", /mystery|darr|horror|thriller|suspense|raaz|secret/i],
  ["energetic", /sale|offer|discount|fast|instant|jaldi|party|dance|sports|gym|fitness/i],
  ["motivational", /success|safalta|motivat|sapna|dream|mehnat|jeet|win|career/i],
  ["luxury", /luxury|premium|gold|jewel|fashion|perfume|watch|car/i],
  ["corporate", /business|app|bank|payment|finance|startup|company|service|recharge|bill/i],
  ["lofi", /chill|study|relax|coffee|calm/i],
  ["storytelling", /kahani|story|katha|ek baar|once/i],
];

export const autoMood = (text) => {
  let best = ["cinematic", 0];
  for (const [mood, re] of MOOD_WORDS) {
    const n = (text.match(new RegExp(re.source, "gi")) || []).length * (mood === "emotional" ? 2 : 1);
    if (n > best[1]) best = [mood, n];
  }
  return best[0];
};

const MusicPicker = ({ project, setProject }) => {
  const [tracks, setTracks] = useState([]);
  const [playing, setPlaying] = useState(null);
  const audio = useRef(null);
  useEffect(() => { api.get("/catalog/music").then(({ data }) => setTracks(data.music || [])).catch(() => {}); return () => audio.current?.pause(); }, []);
  const vol = project.music_volume ?? 0.2;
  const save = async (music_id, music_volume = vol) => {
    try {
      const { data } = await api.post("/projects/music", { project_id: project.project_id, music_id, music_url: null, music_volume });
      setProject((p) => ({ ...p, music_id: data.music_id, music_url: data.music_url, music_volume: data.music_volume }));
    } catch { toast.error("Music save nahi hua"); }
  };
  const preview = (t) => {
    audio.current?.pause();
    if (playing === t.id) return setPlaying(null);
    audio.current = new Audio(t.url); audio.current.volume = 0.6; audio.current.play().catch(() => toast.error("Preview nahi chala"));
    audio.current.onended = () => setPlaying(null); setPlaying(t.id);
  };
  const auto = () => {
    const text = [project.script, project.topic, project.title, ...(project.scenes || []).map((s) => `${s.voiceover || ""} ${s.description || ""}`)].join(" ");
    const t = tracks.find((x) => x.mood === autoMood(text)) || tracks[0];
    if (t) { save(t.id); toast.success(`Scene ke hisaab se: ${t.name}`); }
  };
  return (
    <div data-testid="music-picker">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-medium flex items-center gap-1.5"><Music className="w-4 h-4" /> Background Music</div>
        <div className="flex gap-1.5">
          <button data-testid="music-auto" onClick={auto} className="rounded-full px-3 py-1 text-xs border border-[#E2FF3D]/50 text-[#E2FF3D] flex items-center gap-1"><Wand2 className="w-3 h-3" /> Auto (scene ke hisaab se)</button>
          <button data-testid="music-none" onClick={() => save(null, 0)} className={`rounded-full px-3 py-1 text-xs border ${!project.music_url ? "bg-white/10 border-white/30" : "border-white/15"}`}>No music</button>
        </div>
      </div>
      <div className="mt-2 grid sm:grid-cols-2 gap-1.5">
        {tracks.map((t) => (
          <div key={t.id} data-testid={`music-track-${t.id}`} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${project.music_id === t.id ? "border-[#E2FF3D] bg-[#E2FF3D]/10" : "border-white/10"}`}>
            <button data-testid={`music-preview-${t.id}`} onClick={() => preview(t)} className="p-1 rounded-full bg-white/10">{playing === t.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}</button>
            <span className="flex-1 truncate">{t.name} <span className="text-zinc-500">· {t.mood}</span></span>
            <button data-testid={`music-select-${t.id}`} onClick={() => save(t.id)} className="underline">{project.music_id === t.id ? "Selected" : "Chuno"}</button>
          </div>
        ))}
      </div>
      {project.music_url && (
        <label className="mt-2 flex items-center gap-2 text-xs">Volume
          <input data-testid="music-volume" type="range" min="0" max="1" step="0.05" defaultValue={vol} onMouseUp={(e) => save(project.music_id, +e.target.value)} onTouchEnd={(e) => save(project.music_id, +e.target.value)} className="flex-1 accent-[#E2FF3D]" />
        </label>
      )}
    </div>
  );
};

const COLORS = ["#E2FF3D", "#FFFFFF", "#FFD700", "#FF3B3B", "#00C2FF", "#FF7A00"];
const SIZES = [["s", "Chhota"], ["m", "Medium"], ["l", "Bada"]];
const POSITIONS = [["top", "Upar"], ["middle", "Beech"], ["bottom", "Neeche"]];

const Opt = ({ items, value, onChange, testid }) => (
  <div className="flex gap-1">
    {items.map(([v, l]) => (
      <button key={v} type="button" data-testid={`${testid}-${v}`} onClick={() => onChange(v)}
        className={`px-2.5 py-1 rounded-full text-xs border ${value === v ? "bg-[#E2FF3D] text-black border-[#E2FF3D]" : "border-white/15"}`}>{l}</button>
    ))}
  </div>
);

const CaptionStyle = ({ cs, setCs }) => (
  <div data-testid="caption-style" className="mt-2 flex flex-wrap items-center gap-3 text-xs">
    <div className="flex items-center gap-1">
      {COLORS.map((c) => (
        <button key={c} type="button" data-testid={`caption-color-${c.slice(1).toLowerCase()}`} onClick={() => setCs({ ...cs, color: c })}
          style={{ background: c }} className={`w-6 h-6 rounded-full border-2 ${(cs.color || "#E2FF3D") === c ? "border-zinc-400 scale-110" : "border-transparent"}`} />
      ))}
    </div>
    <Opt items={SIZES} value={cs.size || "m"} onChange={(v) => setCs({ ...cs, size: v })} testid="caption-size" />
    <Opt items={POSITIONS} value={cs.position || ""} onChange={(v) => setCs({ ...cs, position: v })} testid="caption-position" />
  </div>
);

const CaptionEditor = ({ project, setProject }) => {
  const [texts, setTexts] = useState((project.scenes || []).map((s) => s.on_screen_text || ""));
  const [cs, setCs] = useState(project.caption_style || {});
  const save = async () => {
    const scenes = (project.scenes || []).map((s, i) => ({ ...s, on_screen_text: texts[i].trim() }));
    try {
      await api.put(`/projects/${project.project_id}`, { scenes, caption_style: cs });
      setProject((p) => ({ ...p, scenes, caption_style: cs })); toast.success("Captions save ho gaye");
    } catch { toast.error("Save nahi hua"); }
  };
  if (!texts.length) return null;
  return (
    <div data-testid="caption-editor" className="mt-4">
      <div className="text-sm font-medium flex items-center gap-1.5"><Type className="w-4 h-4" /> Scene Captions (video ke upar text)</div>
      <div className="text-xs text-zinc-500">Text badlo, ya khali chhodo to us scene me caption nahi aayega. Rang, size aur jagah subtitles par bhi lagegi.</div>
      <CaptionStyle cs={cs} setCs={setCs} />
      <div className="mt-2 space-y-1.5">
        {texts.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 w-14 shrink-0">Scene {i + 1}</span>
            <input data-testid={`caption-input-${i}`} value={t} maxLength={60} onChange={(e) => setTexts((x) => x.map((v, j) => (j === i ? e.target.value : v)))}
              className="flex-1 bg-transparent border border-white/10 rounded px-2 py-1 text-xs" placeholder="(koi caption nahi)" />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button data-testid="caption-save" onClick={save} className="rounded-full px-4 py-1.5 text-xs bg-[#E2FF3D] text-black">Save captions</button>
        <button data-testid="caption-clear-all" onClick={() => setTexts((x) => x.map(() => ""))} className="rounded-full px-4 py-1.5 text-xs border border-white/15">Sab hatao</button>
      </div>
    </div>
  );
};

export const MusicCaptionPanel = ({ project, setProject }) => (
  <div data-testid="music-caption-panel" className="mt-3 bg-[#0A0A0B] border border-white/5 rounded-lg p-3">
    <MusicPicker project={project} setProject={setProject} />
    <CaptionEditor project={project} setProject={setProject} />
  </div>
);
