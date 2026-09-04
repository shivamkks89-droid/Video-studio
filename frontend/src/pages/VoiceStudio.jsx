import { useEffect, useRef, useState } from "react";
import { Mic, Loader2, Upload, Music, X, UserPlus } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { assetUrl } from "../lib/assetUrl";

const MODE_AI = "ai";
const MODE_UPLOAD = "upload";

export default function VoiceStudio() {
  const [mode, setMode] = useState(MODE_AI);
  const [voices, setVoices] = useState([]);
  const [lang, setLang] = useState("english");
  const [voiceId, setVoiceId] = useState("");
  const [text, setText] = useState("");
  const [stability, setStability] = useState(0.55);
  const [similarity, setSimilarity] = useState(0.75);
  const [style, setStyle] = useState(0.3);
  const [audio, setAudio] = useState(null);
  const [busy, setBusy] = useState(false);

  // Upload state
  const [uploadedAudio, setUploadedAudio] = useState(null);
  const [uploadedMeta, setUploadedMeta] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [transcript, setTranscript] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const [cloneName, setCloneName] = useState("My voice");
  const [cloning, setCloning] = useState(false);
  const [clonedVoice, setClonedVoice] = useState(null);
  const fileRef = useRef(null);

  // Music
  const [music, setMusic] = useState({ music: [], sfx: [] });
  const [mVol, setMVol] = useState(0.2);

  useEffect(() => {
    api.get("/catalog/voices").then(({ data }) => {
      setVoices(data); setVoiceId(data[0]?.id);
    });
    api.get("/catalog/music").then(({ data }) => setMusic(data));
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

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) return toast.error("Max 30 MB");
    setUploading(true);
    setTranscript(null);
    setClonedVoice(null);
    setUploadedFile(file);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/media/upload-voice", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadedAudio(data.audio_url);
      setUploadedMeta({ duration: data.duration, size: file.size, name: file.name });
      toast.success(`Uploaded · ${Math.round(data.duration || 0)}s`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const cloneForAds = async () => {
    if (!uploadedFile) return toast.error("Upload an audio sample first");
    if (!cloneName.trim()) return toast.error("Name the cloned voice");
    setCloning(true);
    const t = toast.loading("Cloning voice via ElevenLabs Voice Lab…");
    try {
      const fd = new FormData();
      fd.append("name", cloneName.trim());
      fd.append("description", "Uploaded by user for ad voiceovers");
      fd.append("audio", uploadedFile);
      const { data } = await api.post("/voices/clone", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setClonedVoice(data.voice);
      // Refresh voice list so the new clone appears in AI Voice tab
      const v = await api.get("/catalog/voices");
      setVoices(v.data);
      toast.success(`"${data.voice.name}" cloned! Ab kisi bhi project ki Voice dropdown me milega.`, { id: t });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Clone failed. Check ElevenLabs key.", { id: t });
    } finally { setCloning(false); }
  };

  const transcribe = async () => {
    if (!uploadedAudio) return;
    setTranscribing(true);
    try {
      const { data } = await api.post("/ai/stt", { audio_url: uploadedAudio, language: "auto" });
      if (data.error) { toast.error(data.error); return; }
      setTranscript(data);
      toast.success(`Transcribed · ${data.auto_scenes?.length || 0} scenes suggested`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Transcription failed");
    } finally { setTranscribing(false); }
  };

  return (
    <div data-testid="voice-studio" className="space-y-6">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ VOICE STUDIO</div>
        <h1 className="text-3xl font-semibold tracking-tight">AI voices, uploads & music.</h1>
        <div className="mt-4 inline-flex bg-[#141416] rounded-full p-1 border border-white/10">
          <button data-testid="vs-mode-ai" onClick={()=>setMode(MODE_AI)}
            className={`px-4 py-1.5 text-xs rounded-full transition ${mode===MODE_AI ? "bg-[#E2FF3D] text-black font-semibold" : "text-zinc-400"}`}>
            AI Voice
          </button>
          <button data-testid="vs-mode-upload" onClick={()=>setMode(MODE_UPLOAD)}
            className={`px-4 py-1.5 text-xs rounded-full transition ${mode===MODE_UPLOAD ? "bg-[#E2FF3D] text-black font-semibold" : "text-zinc-400"}`}>
            Upload My Voice
          </button>
        </div>
      </div>

      {mode === MODE_AI ? (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 surface rounded-xl p-5 space-y-4">
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

          <div className="lg:col-span-7 surface rounded-xl p-5 space-y-4">
            <div>
              <div className="label-mono text-zinc-500 mb-2">Script</div>
              <textarea data-testid="vs-text" value={text} onChange={(e)=>setText(e.target.value)} rows={10}
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-3 text-sm outline-none focus:border-white/30 resize-none"
                placeholder="Type or paste the voiceover text. Hinglish works great." />
            </div>
            <button data-testid="vs-generate" onClick={gen} disabled={busy} className="btn-volt rounded-full px-5 py-3 text-sm flex items-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              {busy ? "Synthesising…" : "Generate voiceover"}
            </button>
            {audio && (
              <div className="pt-2">
                <div className="label-mono text-zinc-500 mb-2">RESULT</div>
                <audio data-testid="vs-audio" controls src={assetUrl(audio)} className="w-full" />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 surface rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[280px]">
            <Upload className="w-8 h-8 text-[#E2FF3D] mb-4"/>
            <div className="text-lg font-semibold mb-1">Upload your own voice</div>
            <div className="text-sm text-zinc-400 mb-6 max-w-md">
              MP3 / WAV / M4A / AAC / OGG · up to 30 MB. Works perfectly with ElevenLabs downloads —
              no ElevenLabs API needed to use uploaded audio.
            </div>
            <input ref={fileRef} type="file" accept="audio/*" data-testid="vs-file"
              onChange={(e)=>upload(e.target.files?.[0])} className="hidden"/>
            <button data-testid="vs-upload-btn" onClick={()=>fileRef.current?.click()} disabled={uploading}
              className="btn-volt rounded-full px-5 py-2.5 text-sm disabled:opacity-60">
              {uploading ? "Uploading…" : "Choose audio file"}
            </button>
          </div>

          <div className="lg:col-span-7 surface rounded-xl p-5">
            {!uploadedAudio ? (
              <div className="h-full grid place-items-center text-center text-zinc-500 py-16">
                Uploaded audio will preview here.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="label-mono text-zinc-500">/ PREVIEW</div>
                    <button data-testid="vs-clear" onClick={()=>{setUploadedAudio(null);setUploadedMeta(null);setTranscript(null);}}
                      className="text-zinc-500 hover:text-red-400"><X className="w-4 h-4"/></button>
                  </div>
                  <audio data-testid="vs-uploaded-audio" controls src={assetUrl(uploadedAudio)} className="w-full"/>
                  {uploadedMeta && (
                    <div className="label-mono text-zinc-500 text-[10px] mt-2">
                      {uploadedMeta.name} · {Math.round(uploadedMeta.size/1024)} KB · {Math.round(uploadedMeta.duration || 0)}s
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button data-testid="vs-transcribe" onClick={transcribe} disabled={transcribing}
                    className="btn-volt rounded-full px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-60">
                    {transcribing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : "Transcribe & auto-split scenes"}
                  </button>
                </div>

                {/* Clone this voice for ads */}
                <div className="pt-3 border-t border-white/5" data-testid="vs-clone-panel">
                  <div className="flex items-center gap-2 mb-2">
                    <UserPlus className="w-4 h-4 text-[#E2FF3D]"/>
                    <div className="label-mono text-[#E2FF3D] text-xs">CLONE THIS VOICE FOR ADS · 100 CR</div>
                  </div>
                  <div className="text-xs text-zinc-400 mb-3">
                    Is voice ko ElevenLabs Voice Lab pe clone karo. Uske baad kisi bhi project ki Voice dropdown me select karke ad script bolwaao — aapki hi awaaz me!
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input data-testid="vs-clone-name" value={cloneName}
                      onChange={(e)=>setCloneName(e.target.value)} placeholder="Voice name (e.g. Shivam voice)"
                      className="flex-1 min-w-[180px] bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-xs outline-none"/>
                    <button data-testid="vs-clone-btn" onClick={cloneForAds} disabled={cloning || !uploadedFile}
                      className="btn-volt rounded-full px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-60">
                      {cloning ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <UserPlus className="w-3.5 h-3.5"/>}
                      {cloning ? "Cloning…" : "Clone voice"}
                    </button>
                  </div>
                  {clonedVoice && (
                    <div data-testid="vs-cloned-voice" className="mt-3 bg-[#0A0A0B] border border-[#E2FF3D]/30 rounded p-3">
                      <div className="text-xs text-[#E2FF3D] mb-1">✓ CLONED: {clonedVoice.name}</div>
                      <div className="label-mono text-zinc-500 text-[10px] break-all">voice_id: {clonedVoice.id}</div>
                      <div className="text-xs text-zinc-400 mt-2">
                        Ab kisi bhi project ke Voice section me jao, dropdown me <b>{clonedVoice.name}</b> aa jayega — usko select karke "Generate voiceover" dabao. Ad script aapki hi awaaz me bolega.
                      </div>
                    </div>
                  )}
                </div>
                {transcript && (
                  <div className="pt-3 border-t border-white/5" data-testid="vs-transcript">
                    <div className="label-mono text-[#E2FF3D] mb-2">TRANSCRIPT</div>
                    <div className="text-sm text-zinc-200 mb-3 max-h-48 overflow-y-auto scroll-thin">{transcript.transcript}</div>
                    <div className="label-mono text-zinc-500 mb-2">AUTO SCENES ({transcript.auto_scenes?.length})</div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto scroll-thin pr-1">
                      {(transcript.auto_scenes || []).map((s, i) => (
                        <div key={i} className="bg-[#0A0A0B] rounded p-2 text-xs">
                          <div className="label-mono text-[#E2FF3D] text-[10px] mb-1">SCN {s.index} · {s.duration}s</div>
                          <div>{s.voiceover}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MUSIC & SFX LIBRARY */}
      <div className="surface rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Music className="w-4 h-4 text-[#E2FF3D]"/>
          <div className="label-mono text-zinc-500">/ MUSIC & SFX LIBRARY</div>
        </div>
        <div className="mb-4">
          <div className="label-mono text-zinc-500 mb-2 text-[10px]">BACKGROUND MUSIC · {music.music.length} tracks</div>
          <div className="grid md:grid-cols-2 gap-2">
            {music.music.map((t) => (
              <div key={t.id} data-testid={`music-${t.id}`} className="bg-[#0A0A0B] rounded p-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{t.name}</div>
                  <div className="label-mono text-zinc-500 text-[10px]">{t.mood} · {t.duration}s · {t.bpm} BPM</div>
                </div>
                <audio controls src={t.url} className="w-40 h-8" preload="none"/>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="label-mono text-zinc-500 mb-2 text-[10px]">SFX · {music.sfx.length} sounds</div>
          <div className="grid md:grid-cols-3 gap-2">
            {music.sfx.map((s) => (
              <div key={s.id} data-testid={`sfx-${s.id}`} className="bg-[#0A0A0B] rounded p-2 flex items-center gap-2">
                <div className="text-xs font-medium flex-1 truncate">{s.name}</div>
                <audio controls src={s.url} className="w-28 h-7" preload="none"/>
              </div>
            ))}
          </div>
        </div>
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
