import { useEffect, useState } from "react";
import { Mic, Loader2, Play } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function VoiceStudio() {
  const [voices, setVoices] = useState([]);
  const [lang, setLang] = useState("english");
  const [voiceId, setVoiceId] = useState("");
  const [text, setText] = useState("");
  const [stability, setStability] = useState(0.55);
  const [similarity, setSimilarity] = useState(0.75);
  const [style, setStyle] = useState(0.3);
  const [audio, setAudio] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/catalog/voices").then(({ data }) => {
      setVoices(data); setVoiceId(data[0]?.id);
    });
  }, []);

  const filtered = voices.filter(v => lang === "all" || v.language === lang);

  const gen = async () => {
    if (!text.trim()) return toast.error("Enter some text");
    if (!voiceId) return toast.error("Pick a voice");
    setBusy(true);
    try {
      const { data } = await api.post("/ai/tts", {
        text, voice_id: voiceId, stability, similarity_boost: similarity, style,
      });
      if (data.error) { toast.error(data.error); return; }
      setAudio(data.audio_url);
      toast.success("Voiceover ready");
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.error || "Voice gen failed");
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="voice-studio" className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-4">
        <div>
          <div className="label-mono text-zinc-500 mb-2">/ VOICE STUDIO</div>
          <h1 className="text-3xl font-semibold tracking-tight">Indian voices · Multilingual.</h1>
          <p className="text-zinc-400 mt-2 text-sm">Powered by ElevenLabs multilingual v2.</p>
        </div>

        <div className="surface rounded-xl p-5 space-y-4">
          <div>
            <div className="label-mono text-zinc-500 mb-2">Language</div>
            <div className="flex gap-2 flex-wrap">
              {["english", "hindi", "hinglish", "all"].map(l => (
                <button key={l} data-testid={`vs-lang-${l}`} onClick={()=>setLang(l)}
                  className={`rounded-full px-3 py-1.5 text-xs capitalize transition ${lang===l ? "bg-[#E2FF3D] text-black" : "surface"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label-mono text-zinc-500 mb-2">Voice</div>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto scroll-thin pr-1">
              {filtered.map((v, i) => (
                <button key={`${v.id}-${i}`} data-testid={`vs-voice-${i}`} onClick={()=>setVoiceId(v.id)}
                  className={`surface rounded-lg p-3 text-left transition ${voiceId === v.id ? "border-[#E2FF3D]" : ""}`}>
                  <div className="text-sm font-medium">{v.name}</div>
                  <div className="label-mono text-zinc-500">{v.gender} · {v.style}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Slider label={`Stability ${stability.toFixed(2)}`} value={stability} setValue={setStability} testid="vs-stab"/>
            <Slider label={`Similarity ${similarity.toFixed(2)}`} value={similarity} setValue={setSimilarity} testid="vs-sim"/>
            <Slider label={`Style ${style.toFixed(2)}`} value={style} setValue={setStyle} testid="vs-style"/>
          </div>
        </div>
      </div>

      <div className="lg:col-span-7 surface rounded-xl p-5 space-y-4">
        <div>
          <div className="label-mono text-zinc-500 mb-2">Script</div>
          <textarea data-testid="vs-text" value={text} onChange={(e)=>setText(e.target.value)} rows={10}
            className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-3 text-sm outline-none focus:border-white/30 resize-none"
            placeholder="Type or paste the voiceover text. Hinglish works great: Namaste! Aaj hum baat karenge healthy living ke baare mein…" />
        </div>
        <button data-testid="vs-generate" onClick={gen} disabled={busy} className="btn-volt rounded-full px-5 py-3 text-sm flex items-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          {busy ? "Synthesising…" : "Generate voiceover"}
        </button>
        {audio && (
          <div className="pt-2">
            <div className="label-mono text-zinc-500 mb-2">RESULT</div>
            <audio data-testid="vs-audio" controls src={audio} className="w-full" />
          </div>
        )}
      </div>
    </div>
  );
}

function Slider({ label, value, setValue, testid }) {
  return (
    <div>
      <div className="label-mono text-zinc-500 mb-1">{label}</div>
      <input data-testid={testid} type="range" min="0" max="1" step="0.05" value={value}
             onChange={(e)=>setValue(parseFloat(e.target.value))} className="w-full accent-[#E2FF3D]" />
    </div>
  );
}
