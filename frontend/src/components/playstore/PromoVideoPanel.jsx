import { useEffect, useRef, useState } from "react";
import { Clapperboard, Download, Loader2, Music } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { assetUrl } from "../../lib/assetUrl";

export const PromoVideoPanel = ({ shotId }) => {
  const [tracks, setTracks] = useState([]);
  const [musicId, setMusicId] = useState("");
  const [rec, setRec] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    api.get("/catalog/music").then(({ data }) => {
      setTracks(data.music || []);
      if (data.music?.[0]) setMusicId(data.music[0].id);
    }).catch(() => {});
    return () => clearInterval(timer.current);
  }, []);

  useEffect(() => { setRec(null); clearInterval(timer.current); }, [shotId]);

  const poll = () => {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const { data } = await api.get(`/studio/playstore-screenshots/${shotId}`);
      setRec(data);
      if (data.promo_status !== "rendering") {
        clearInterval(timer.current);
        data.promo_status === "complete" ? toast.success("Promo video ready") : toast.error("Promo render failed — credits refunded");
      }
    }, 3000);
  };

  const start = async () => {
    try {
      await api.post(`/studio/playstore-screenshots/${shotId}/promo`, { music_id: musicId || null });
      setRec({ promo_status: "rendering" });
      poll();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not start render");
    }
  };

  const rendering = rec?.promo_status === "rendering";
  return (
    <div className="rounded-xl border border-white/10 p-4 space-y-3" data-testid="promo-panel">
      <div className="label-mono text-[#E2FF3D] flex items-center gap-2"><Clapperboard className="w-3 h-3" /> / 30s PROMO VIDEO · 5 CR</div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-2 text-xs text-zinc-400 flex-1 min-w-[200px]">
          <Music className="w-3.5 h-3.5 shrink-0" />
          <select data-testid="promo-music-select" value={musicId} onChange={(e) => setMusicId(e.target.value)}
            className="flex-1 bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-xs outline-none">
            <option value="">No music</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.mood}</option>)}
          </select>
        </label>
        <button data-testid="promo-render" onClick={start} disabled={rendering}
          className="btn-volt rounded-full px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-60">
          {rendering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clapperboard className="w-3 h-3" />}
          {rendering ? "Rendering… (~30s)" : "Make promo video"}
        </button>
      </div>
      {rec?.promo_status === "complete" && rec.promo_url && (
        <div className="flex flex-col sm:flex-row gap-3 items-start" data-testid="promo-result">
          <video data-testid="promo-video" src={assetUrl(rec.promo_url)} controls playsInline
            className="w-40 aspect-[9/16] rounded-lg bg-black" />
          <a data-testid="promo-download" href={assetUrl(rec.promo_url)} download="playstore-promo.mp4"
            className="rounded-full surface px-3 py-1.5 text-xs flex items-center gap-1 hover:border-white/30">
            <Download className="w-3 h-3" /> Download MP4 (1080×1920)
          </a>
        </div>
      )}
    </div>
  );
};
