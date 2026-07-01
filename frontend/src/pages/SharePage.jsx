import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Video, Loader2, Share2 } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Public share page — logs a `view` on mount, shows the rendered video (if any)
// and a Watch-CTA button that logs a `click`. Uses raw axios (no auth) since
// the /api/track endpoint is public.
export default function SharePage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Public read of the project's shareable fields (uses same auth-less track endpoint
        // to fetch minimal display data).
        const { data } = await axios.get(`${BACKEND}/api/projects/public/${id}`);
        if (!cancelled) setProject(data);
      } catch {
        if (!cancelled) setProject(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
      // Fire the view beacon
      axios.post(`${BACKEND}/api/track/${id}`, { event: "view" }).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [id]);

  const logClick = () => {
    axios.post(`${BACKEND}/api/track/${id}`, { event: "click" }).catch(() => {});
  };
  const logShare = async () => {
    await navigator.clipboard.writeText(window.location.href);
    axios.post(`${BACKEND}/api/track/${id}`, { event: "share" }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#0A0A0B] text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#0A0A0B] text-zinc-400">
        <div className="text-center">
          <Video className="w-10 h-10 mx-auto mb-2" />
          <div className="label-mono">This link is invalid or expired.</div>
        </div>
      </div>
    );
  }

  const videoSrc = project.video_url ? `${BACKEND}${project.video_url}` : null;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex flex-col">
      <header className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-[#E2FF3D]" />
          <span className="label-mono text-zinc-500">CINEREEL AI</span>
        </div>
        <button onClick={logShare} data-testid="share-copy" className="rounded-full surface px-3 py-1.5 text-xs flex items-center gap-1 border border-white/10">
          <Share2 className="w-3 h-3" /> Share
        </button>
      </header>

      <main className="flex-1 grid place-items-center p-6">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold mb-1">{project.title}</h1>
          {project.target_audience && (
            <div className="mb-4 label-mono text-[#E2FF3D] text-[11px]">FOR · {project.target_audience}</div>
          )}
          <div className={`surface rounded-2xl overflow-hidden ${project.aspect_ratio === "16:9" ? "ar-169" : project.aspect_ratio === "1:1" ? "ar-11" : "ar-916"}`}>
            {videoSrc ? (
              <video data-testid="share-video" controls playsInline autoPlay muted src={videoSrc} className="w-full h-full object-cover" onPlay={logClick} />
            ) : project.thumbnail ? (
              <img src={project.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-zinc-700">
                <Video className="w-10 h-10" />
              </div>
            )}
          </div>
          {project.script?.cta && (
            <a data-testid="share-cta" href="#" onClick={logClick}
              className="mt-5 btn-volt w-full block text-center rounded-full px-4 py-3 text-sm font-semibold">
              {project.script.cta}
            </a>
          )}
        </div>
      </main>

      <footer className="p-4 text-center label-mono text-[10px] text-zinc-600">
        Made with CineReel AI
      </footer>
    </div>
  );
}
