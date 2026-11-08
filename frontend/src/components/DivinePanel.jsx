import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Flame, UserRound } from "lucide-react";
import { api } from "../lib/api";
import { assetUrl } from "../lib/assetUrl";

const DEITIES = [
  ["Lakshmi", "Goddess Lakshmi with four arms, radiant warm golden skin, red-and-gold silk saree, ornate gold crown, heavy temple jewellery, seated on a pink lotus, gold coins flowing, serene smile"],
  ["Shiva", "Lord Shiva with ash-blue skin, matted hair with crescent moon and Ganga, third eye, rudraksha beads, tiger-skin garment, serpent around neck, trident, calm meditative face"],
  ["Krishna", "Lord Krishna with deep blue skin, yellow silk dhoti, peacock feather in golden crown, flute, pearl and gold jewellery, playful gentle smile"],
  ["Ganesha", "Lord Ganesha with elephant head, single tusk, red-orange silk dhoti, golden crown and jewellery, four arms holding modak, axe, lotus and noose, joyful face"],
  ["Hanuman", "Lord Hanuman with strong muscular body, orange-red skin tone, golden mace (gada), golden crown, red dhoti, devoted fearless expression"],
  ["Durga", "Goddess Durga with ten arms holding divine weapons, red silk saree, golden crown, fierce yet compassionate eyes, riding a majestic lion"],
  ["Ram", "Lord Rama with blue-green skin, golden crown, saffron silk garments, bow and arrows, calm noble face, pearl jewellery"],
  ["Saraswati", "Goddess Saraswati in pure white silk saree, playing veena, golden crown, pearl jewellery, seated on white lotus beside a swan, peaceful face"],
];
const MODES = ["Divine Avatar", "Mythological Stories", "Devotional Reels", "Festival Specials"];
const STYLES = ["Realistic 3D CGI", "Mythological fantasy", "Cinematic devotional", "Ultra-realistic animation"];
const LANGS = [["hindi", "Hindi"], ["english", "English"], ["hinglish", "Hinglish"]];
const DURS = [15, 30, 45, 60];
const TEMPLATES = [
  ["ganesh", "Ganesh Chaturthi Katha", "Ganesha", "Mythological Stories", "Bal Ganesh aur Mata Parvati ki katha — kaise Ganesh ji pratham pujya bane", 45],
  ["krishna", "Janmashtami Leela", "Krishna", "Mythological Stories", "Bal Krishna ki makhan chori leela aur Yashoda maiya ka pyaar", 45],
  ["durga", "Navratri Mahishasur Vadh", "Durga", "Festival Specials", "Maa Durga ka shakti roop aur Mahishasur par vijay — Navratri ki shubhkamnayein", 45],
  ["diwali", "Diwali Lakshmi Pujan", "Lakshmi", "Festival Specials", "Diwali ki raat Maa Lakshmi ka aagman, diye aur samriddhi ka ashirwad", 45],
  ["shivratri", "Mahashivratri", "Shiva", "Festival Specials", "Mahashivratri par Shiv-Parvati vivah aur Bholenath ka dhyan", 45],
  ["ramnavami", "Ram Navami", "Ram", "Festival Specials", "Prabhu Shri Ram ka janm aur Ayodhya ka utsav", 45],
  ["dussehra", "Dussehra Vijay", "Ram", "Mythological Stories", "Shri Ram ki Ravan par vijay — buraai par achhai ki jeet", 45],
  ["hanuman", "Hanuman Jayanti", "Hanuman", "Festival Specials", "Hanuman ji ki bhakti, shakti aur Sanjeevani parvat ki katha", 45],
  ["holi", "Holi Radha-Krishna", "Krishna", "Festival Specials", "Vrindavan me Radha-Krishna ki rangon bhari Holi", 30],
  ["basant", "Basant Panchami", "Saraswati", "Festival Specials", "Basant Panchami par Maa Saraswati se vidya aur buddhi ka vardaan", 30],
  ["dhanteras", "Dhanteras", "Lakshmi", "Festival Specials", "Dhanteras par Maa Lakshmi aur sone-chandi ki shubh kharidari", 30],
  ["ganesh-daily", "Daily Ganesh Vandana", "Ganesha", "Devotional Reels", "Subah ki shuruaat Ganpati Bappa ke ashirwad ke saath", 15],
];
const RES_CR = { "480p": 15, "720p": 30, "1080p": 60 };
const RES_OPTS = [["480p", "480p · Sasta (15 CR)"], ["720p", "720p · Standard (30 CR)"], ["1080p", "1080p · Premium (60 CR)"]];

const Chips = ({ items, value, onChange, testid }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map(([v, l]) => (
      <button key={v} type="button" data-testid={`${testid}-${String(v).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} onClick={() => onChange(v)}
        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${value === v ? "bg-[#E2FF3D] text-black border-[#E2FF3D]" : "border-white/15 text-zinc-300 hover:border-white/40"}`}>{l}</button>
    ))}
  </div>
);
const pairs = (a) => a.map((x) => [x, x]);

const DivineAnimate = ({ project, character, onDone }) => {
  const [st, setSt] = useState({});
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState("720p");
  const per = RES_CR[res];
  const scenes = project.scenes || [];
  const pending = scenes.map((s, i) => i).filter((i) => scenes[i].image_url && !scenes[i].video_clip_url);
  if (!scenes.length) return null;
  const one = async (i) => {
    const s = scenes[i];
    setSt((x) => ({ ...x, [i]: "running" }));
    try {
      await api.post("/ai/video-clip/generate", {
        project_id: project.project_id, scene_index: i, engine: "seedance", mode: "i2v", resolution: res,
        duration_seconds: Math.max(5, Math.min(10, Math.round(s.duration || 5))),
        prompt: `${character?.name || ""} ${s.description || s.visual || ""}. Natural graceful body and hand movement, expressive gentle facial animation, `
          + `flowing silk clothes and swaying jewellery, drifting golden particles and moving light, ${s.camera || "slow push-in"} cinematic camera movement, divine volumetric light. Keep the same character identity.`,
      });
      setSt((x) => ({ ...x, [i]: "done" }));
      return true;
    } catch (e) {
      setSt((x) => ({ ...x, [i]: e.response?.data?.detail || "failed" }));
      return false;
    }
  };
  const runAll = async () => {
    if (!window.confirm(`${pending.length} scenes ko AI video banana hai. Kharcha ~${pending.length * per} CR (${res}, har scene ${per} CR, fail hone par wapas). Approve?`)) return;
    setRunning(true);
    for (const i of pending) { // sequential; no auto-retry
      const ok = await one(i);
      if (!ok && !window.confirm("Ye scene nahi bana (credits wapas). Baaki scenes try karein?")) break;
    }
    setRunning(false);
    onDone?.();
  };
  return (
    <div data-testid="divine-animate" className="surface rounded-lg p-3">
      <div className="text-sm font-medium">Step 3 · Scenes ko asli moving video banao (optional, paid)</div>
      <div className="text-xs text-zinc-400 mt-0.5">AI image-to-video, har scene 5-10s · Creator/Studio/Enterprise plan. Kuch bhi bina aapke approve kiye nahi banega.</div>
      <div data-testid="divine-quality" className="mt-2"><Chips items={RES_OPTS} value={res} onChange={setRes} testid="divine-quality" /></div>
      <div className="mt-2 space-y-1">
        {scenes.map((s, i) => (
          <div key={i} data-testid={`divine-scene-status-${i}`} className="flex items-center justify-between text-xs">
            <span className="truncate">Scene {i + 1}</span>
            <span className="flex items-center gap-2">
              <span className={s.video_clip_url || st[i] === "done" ? "text-emerald-400" : st[i] && st[i] !== "running" ? "text-red-400" : "text-zinc-400"}>
                {s.video_clip_url || st[i] === "done" ? "Video ready" : st[i] === "running" ? "Ban raha hai…" : st[i] ? "Fail (credits wapas)" : "Sirf tasveer"}
              </span>
              {s.image_url && !running && (st[i] && st[i] !== "running" && st[i] !== "done" || s.video_clip_url) && (
                <button data-testid={`divine-scene-redo-${i}`} onClick={async () => {
                  if (window.confirm(`Scene ${i + 1} dobara banana hai (${res})? ~${per} CR`)) { setRunning(true); await one(i); setRunning(false); onDone?.(); }
                }} className="underline text-zinc-300">Dobara</button>
              )}
            </span>
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <button data-testid="divine-animate-all" disabled={running} onClick={runAll}
          className="mt-3 rounded-full px-4 py-1.5 text-xs border border-[#E2FF3D]/50 text-[#E2FF3D] hover:bg-[#E2FF3D]/10 disabled:opacity-50 flex items-center gap-1.5">
          {running && <Loader2 className="w-3 h-3 animate-spin" />} {pending.length} scenes animate karo (~{pending.length * per} CR)
        </button>
      )}
    </div>
  );
};

export const DivinePanel = ({ project, onDone }) => {
  const [deity, setDeity] = useState(project.character?.name || "Lakshmi");
  const [customDesc, setCustomDesc] = useState("");
  const [mode, setMode] = useState("Divine Avatar");
  const [topic, setTopic] = useState("");
  const [lang, setLang] = useState(project.language || "hindi");
  const [dur, setDur] = useState(45);
  const [style, setStyle] = useState("Realistic 3D CGI");
  const [narration, setNarration] = useState(true);
  const [busy, setBusy] = useState("");
  const [character, setCharacter] = useState(project.character || null);
  const scenes = Math.max(4, Math.min(8, Math.round(dur / 7)));
  const desc = customDesc.trim() || (DEITIES.find((d) => d[0] === deity) || [, deity])[1];

  const makeCharacter = async () => {
    setBusy("char");
    try {
      const { data } = await api.post("/divine/character", { project_id: project.project_id, name: deity, description: desc, style, aspect_ratio: project.aspect_ratio || "9:16" });
      setCharacter(data.character);
      toast.success("Master character ready — har scene me yahi roop rahega");
    } catch (e) { toast.error(e.response?.data?.detail || "Character nahi bana"); }
    finally { setBusy(""); }
  };

  const makeStory = async () => {
    setBusy("story");
    try {
      await api.put(`/projects/${project.project_id}`, { duration_sec: dur, language: lang, creation_mode: narration ? "story_voice" : "music_only", divine_mode: mode, festival_theme: mode === "Festival Specials" ? "Festival" : "Devotional" });
      await api.post("/projects/music", { project_id: project.project_id, music_id: mode === "Mythological Stories" ? "mx-cinematic-01" : "mx-emotional-01", music_volume: narration ? 0.18 : 0.85 });
      const notes = `DIVINE AVATAR STUDIO — ${mode}. MAIN CHARACTER (identical in every scene): ${deity}: ${desc}. `
        + `VISUAL STYLE: ${style}, divine golden aura, volumetric god-rays, floating light particles, temple atmosphere, slow-motion feel. `
        + `Give every scene a distinct cinematic camera movement (slow push-in, low-angle hero shot, orbit, crane up, close-up on face, aerial temple wide). `
        + `Respectful, devotional, culturally accurate depiction. `
        + (narration ? `Narration in ${lang}, devotional storytelling tone, lines sized to each scene.` : "MUSIC ONLY — keep every voiceover field EMPTY; tell the story with visuals and short on-screen text.");
      const { data } = await api.post("/ai/script", {
        project_id: project.project_id, topic: `${deity}: ${topic || "divine appearance"}`, video_type: project.video_type,
        language: lang, duration_sec: dur, scene_count: scenes, tone: "storytelling", extra_notes: notes,
      });
      toast.success("Divine story ready — ab 'Generate storyboard' dabao");
      onDone?.(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Story nahi bani, dobara try karo"); }
    finally { setBusy(""); }
  };

  return (
    <div data-testid="divine-panel" className="surface rounded-xl p-4 sm:p-5">
      <div className="label-mono text-zinc-500 flex items-center gap-2"><Flame className="w-4 h-4 text-[#E2FF3D]" /> / DIVINE AVATAR STUDIO</div>
      <div data-testid="divine-templates" className="mt-3">
        <div className="text-xs text-zinc-400 mb-1.5">Ready templates — ek tap me shuru karo</div>
        <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
          {TEMPLATES.map(([k, label, d, m, t, du]) => (
            <button key={k} type="button" data-testid={`divine-template-${k}`}
              onClick={() => { setDeity(d); setMode(m); setTopic(t); setDur(du); setCustomDesc(""); toast.success(`${label} template lag gaya`); }}
              className="rounded-lg px-2 py-2.5 text-xs text-left border border-white/10 hover:border-[#E2FF3D]/60 transition-colors">
              <div className="font-medium">{label}</div><div className="text-zinc-500 mt-0.5">{d} · {du}s</div>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {DEITIES.map(([n]) => (
          <button key={n} type="button" data-testid={`divine-deity-${n.toLowerCase()}`} onClick={() => setDeity(n)}
            className={`rounded-lg py-3 text-xs font-medium border transition-colors ${deity === n ? "border-[#E2FF3D] bg-[#E2FF3D]/10 text-[#E2FF3D]" : "border-white/10 hover:border-white/30"}`}>{n}</button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        <input data-testid="divine-custom-desc" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} maxLength={500}
          placeholder="(Optional) Apna character description — roop, kapde, gehne"
          className="w-full bg-transparent border border-white/15 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600" />
        <div><div className="text-xs text-zinc-400 mb-1.5">Mode</div><Chips items={pairs(MODES)} value={mode} onChange={setMode} testid="divine-mode" /></div>
        <input data-testid="divine-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200}
          placeholder="Story topic — e.g. Lakshmi ji ka divya prakatya"
          className="w-full bg-transparent border border-white/15 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600" />
        <div><div className="text-xs text-zinc-400 mb-1.5">Visual style</div><Chips items={pairs(STYLES)} value={style} onChange={setStyle} testid="divine-style" /></div>
        <div className="flex flex-wrap gap-4">
          <div><div className="text-xs text-zinc-400 mb-1.5">Bhasha</div><Chips items={LANGS} value={lang} onChange={setLang} testid="divine-lang" /></div>
          <div><div className="text-xs text-zinc-400 mb-1.5">Duration (sec)</div><Chips items={DURS.map((d) => [d, d])} value={dur} onChange={setDur} testid="divine-dur" /></div>
          <div><div className="text-xs text-zinc-400 mb-1.5">Narration</div><Chips items={[[true, "Voiceover"], [false, "Music only"]]} value={narration} onChange={setNarration} testid="divine-narration" /></div>
        </div>

        <div className="flex items-center gap-3 surface rounded-lg p-3">
          <div className="w-16 h-24 rounded-md overflow-hidden bg-black/40 grid place-items-center shrink-0" data-testid="divine-character-preview">
            {character?.image_url ? <img src={assetUrl(character.image_url)} alt={character.name} className="w-full h-full object-cover" /> : <UserRound className="w-6 h-6 text-zinc-600" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Step 1 · Master character</div>
            <div className="text-xs text-zinc-400">{character ? `${character.name} ready — saare scenes isi roop me` : "Ek reference tasveer, jisse har scene me same chehra, kapde aur gehne rahein (3 CR)"}</div>
            <button data-testid="divine-make-character" disabled={!!busy} onClick={makeCharacter}
              className="mt-2 rounded-full px-3 py-1 text-xs border border-white/20 hover:border-white/40 disabled:opacity-50 flex items-center gap-1.5">
              {busy === "char" && <Loader2 className="w-3 h-3 animate-spin" />}{character ? "Dobara banao" : "Character banao"}
            </button>
          </div>
        </div>

        <DivineAnimate project={project} character={character} onDone={onDone} />
        <div data-testid="divine-estimate" className="text-xs text-zinc-400">
          Andaazan kharcha: <span className="text-[#E2FF3D] font-semibold">~{(character ? 0 : 3) + 5 + scenes * 3 + 10} CR</span>
          {" "}({character ? "" : "character 3 + "}script 5 + {scenes} scenes × 3 + render 10){narration ? " + voiceover" : ""}. AI video clips har scene par alag se, sirf aap chunein to.
        </div>
        <button data-testid="divine-make-story" disabled={!!busy} onClick={makeStory}
          className="btn-volt rounded-full px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
          {busy === "story" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />} Step 2 · Divine story banao
        </button>
      </div>
    </div>
  );
};
