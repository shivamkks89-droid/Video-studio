import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, GitCompare, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

const CASE = {
  exact: { label: "Exact match", cls: "text-[#E2FF3D]", Icon: CheckCircle2, tip: "Audio script se match karta hai — scenes iski timing pe sync honge." },
  partial: { label: "Partial match", cls: "text-amber-400", Icon: AlertTriangle, tip: "Kuch words alag hain. Audio waise hi rahega — script edit karo ya audio rakh ke sync karo." },
  different: { label: "Different script", cls: "text-red-400", Icon: AlertTriangle, tip: "Audio alag script bol raha hai — transcript se naya storyboard bana sakte ho." },
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export const AudioMatchPanel = ({ stt, audioUrl, projects }) => {
  const [pid, setPid] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(null);
  const payload = { transcript: stt.transcript, segments: stt.segments || [], words: stt.words || null, duration: stt.duration || 0, language: stt.language };

  const compare = async (id) => {
    setPid(id); setRes(null); setDone(null);
    if (!id) return;
    setBusy("match");
    try { const { data } = await api.post(`/projects/${id}/audio-match`, payload); setRes(data); }
    catch (e) { toast.error(e.response?.data?.detail || "Match failed"); } finally { setBusy(""); }
  };

  const sync = async (mode) => {
    setBusy(mode);
    try {
      const { data } = await api.post(`/projects/${pid}/audio-sync`, { ...payload, audio_url: audioUrl, mode });
      setDone(data);
      toast.success(`${data.scenes.length} scenes synced to your audio (${data.precision}-level timing)`);
    } catch (e) { toast.error(e.response?.data?.detail || "Sync failed"); } finally { setBusy(""); }
  };

  const c = res && CASE[res.case];
  return (
    <div className="pt-3 border-t border-white/5 space-y-3" data-testid="audio-match-panel">
      <div className="label-mono text-[#E2FF3D] flex items-center gap-2"><GitCompare className="w-3 h-3" /> SCRIPT ↔ AUDIO MATCH · FREE</div>
      <select data-testid="audio-match-project" value={pid} onChange={(e) => compare(e.target.value)}
        className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none">
        <option value="">Select project to compare & sync…</option>
        {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.title || p.project_id}</option>)}
      </select>
      {busy === "match" && <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Comparing…</div>}
      {res && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs" data-testid="audio-match-stats">
            <Stat k="Match" v={`${res.match_pct}%`} cls={c.cls} testid="audio-match-pct" />
            <Stat k="Duration" v={fmt(res.duration)} />
            <Stat k="Language" v={res.language || "—"} />
            <Stat k="Timing" v={`${res.precision}-level`} />
          </div>
          <div className={`flex items-start gap-2 text-xs ${c.cls}`} data-testid="audio-match-case"><c.Icon className="w-4 h-4 shrink-0" /><span><b>{c.label}.</b> <span className="text-zinc-400">{c.tip}</span></span></div>
          <div className="bg-[#0A0A0B] rounded-lg p-3 text-sm leading-relaxed max-h-48 overflow-y-auto" data-testid="audio-match-diff">
            {res.tokens.map((t, i) => (
              <span key={i} className={t.op === "del" ? "line-through text-red-400/80" : t.op === "ins" ? "text-[#E2FF3D] underline decoration-dotted" : "text-zinc-300"}>{t.t} </span>
            ))}
          </div>
          <div className="text-[10px] text-zinc-500"><span className="line-through text-red-400/80">red</span> = script me hai, audio me nahi ({res.missing.length}) · <span className="text-[#E2FF3D]">green</span> = audio me extra ({res.extra.length})</div>
          {res.silences.length > 0 && (
            <div className="text-[11px] text-zinc-400" data-testid="audio-match-silences">Silence: {res.silences.map((s) => `${fmt(s.start)}–${fmt(s.end)}`).join(", ")}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {res.case !== "different" && (
              <button data-testid="audio-sync-keep" onClick={() => sync("keep")} disabled={!!busy || !res.scene_count}
                className="btn-volt rounded-full px-4 py-2.5 text-xs flex items-center gap-2 disabled:opacity-50">
                {busy === "keep" ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Keep audio & sync {res.scene_count} scenes
              </button>
            )}
            {res.case !== "exact" && (
              <button data-testid="audio-sync-replace" onClick={() => sync("replace_script")} disabled={!!busy}
                className="surface rounded-full px-4 py-2.5 text-xs flex items-center gap-2 hover:border-white/30 disabled:opacity-50">
                {busy === "replace_script" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Use transcript as new script
              </button>
            )}
          </div>
          <p className="text-[10px] text-zinc-600">Aapka uploaded audio bilkul waisa hi use hoga — koi TTS ya clone nahi.</p>
        </>
      )}
      {done && (
        <div className="bg-[#0A0A0B] rounded-lg p-3 space-y-1.5" data-testid="audio-sync-result">
          {done.scenes.map((s, i) => (
            <div key={i} className="text-xs flex gap-2"><span className="label-mono text-[#E2FF3D] text-[10px] shrink-0 w-24">SCN {i + 1} · {s.start}–{s.end}s</span><span className="text-zinc-300">{s.voiceover}</span></div>
          ))}
          {done.missing_visuals > 0 && <div className="text-[11px] text-amber-400">{done.missing_visuals} scene(s) ke visuals abhi baaki hain — project me generate karo.</div>}
          <Link data-testid="audio-sync-open-project" to={`/dashboard/projects/${pid}`} className="inline-block text-xs text-[#E2FF3D] underline pt-1">Open project → preview & render</Link>
        </div>
      )}
    </div>
  );
};

const Stat = ({ k, v, cls = "text-white", testid }) => (
  <div className="bg-[#0A0A0B] rounded-lg px-3 py-2"><div className="text-[10px] text-zinc-500">{k}</div><div data-testid={testid} className={`text-sm font-semibold ${cls}`}>{v}</div></div>
);
