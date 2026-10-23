import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { api } from "../lib/api";

export const VoiceQuotaMeter = () => {
  const [q, setQ] = useState(null);
  useEffect(() => { api.get("/voice/quota").then(({ data }) => setQ(data)).catch(() => {}); }, []);
  if (!q) return null;
  if (!q.available) return (
    <div data-testid="voice-quota" className="text-[11px] text-zinc-500 flex items-center gap-1.5">
      <Gauge className="w-3.5 h-3.5" /> ElevenLabs quota: {q.reason}
    </div>
  );
  const pct = q.limit ? Math.min(100, (q.used / q.limit) * 100) : 0;
  const low = pct > 85;
  return (
    <div data-testid="voice-quota" className="surface rounded-xl px-4 py-3 max-w-md">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="flex items-center gap-1.5 text-zinc-400"><Gauge className="w-3.5 h-3.5" /> ElevenLabs characters</span>
        <span data-testid="voice-quota-remaining" className={low ? "text-red-400 font-semibold" : "text-white"}>
          {q.remaining.toLocaleString()} left
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${low ? "bg-red-400" : "bg-[#E2FF3D]"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-zinc-500 mt-1">
        {q.used.toLocaleString()} / {q.limit.toLocaleString()} used · {q.tier}
        {q.resets_at ? ` · resets ${new Date(q.resets_at * 1000).toLocaleDateString()}` : ""}
      </div>
    </div>
  );
};
