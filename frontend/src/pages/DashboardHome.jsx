import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ArrowRight, Film, Layers, Sparkles, Mic, Image as ImageIcon, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { assetUrl } from "../lib/assetUrl";

export default function DashboardHome() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [ideaQuery, setIdeaQuery] = useState("");
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [scrapedSrc, setScrapedSrc] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, t] = await Promise.all([api.get("/projects"), api.get("/catalog/templates")]);
        setProjects(p.data);
        setTemplates(t.data.slice(0, 6));
      } catch (e) { /* ignore */ }
    })();
  }, []);

  const onSuggest = async (e) => {
    e.preventDefault();
    if (!ideaQuery.trim()) return;
    setLoadingIdeas(true);
    try {
      const { data } = await api.post("/ai/ad-ideas", { query: ideaQuery });
      setIdeas(data.ideas || []);
      setScrapedSrc(data.scraped || null);
      if (data.scraped?.title) toast.success(`${(data.ideas || []).length} ideas — using ${data.scraped.title}`);
      else toast.success(`${(data.ideas || []).length} ideas generated`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not generate ideas");
    } finally { setLoadingIdeas(false); }
  };

  const QUICKS = [
    { to: "/dashboard/new", icon: Plus, t: "New Project", d: "Pick a format and start" },
    { to: "/dashboard/script", icon: Sparkles, t: "AI Script", d: "Hindi · Hinglish · English" },
    { to: "/dashboard/voice", icon: Mic, t: "Voiceover", d: "Indian voices · ElevenLabs" },
    { to: "/dashboard/scene", icon: ImageIcon, t: "Scenes", d: "Cinematic stills" },
  ];

  return (
    <div data-testid="dashboard-home" className="space-y-10">
      {/* GREETING */}
      <div className="grid md:grid-cols-12 gap-4">
        <div className="md:col-span-8 surface rounded-2xl p-8 relative overflow-hidden grain">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-[#E2FF3D]/10 blur-3xl" />
          <div className="relative">
            <div className="label-mono text-zinc-500 mb-2">/ WELCOME BACK</div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Hi {user?.name?.split(" ")[0]} 👋 Ready to direct?
            </h1>
            <p className="mt-3 text-zinc-400 max-w-xl">
              Paste a website, Play Store app ID or product idea below and we'll suggest 6 cinematic
              ad concepts you can render in one click.
            </p>
            <form onSubmit={onSuggest} className="mt-6 flex gap-2 max-w-2xl">
              <input
                data-testid="idea-input"
                value={ideaQuery}
                onChange={(e) => setIdeaQuery(e.target.value)}
                placeholder="Paste Play Store ID, website URL, or product idea (we'll pull real brand assets)"
                className="flex-1 surface rounded-full px-5 py-3 bg-[#141416] outline-none text-sm focus:border-white/30"
              />
              <button data-testid="idea-submit" disabled={loadingIdeas} className="btn-volt rounded-full px-5 py-3 flex items-center gap-2 disabled:opacity-60">
                <Wand2 className="w-4 h-4" /> {loadingIdeas ? "Thinking…" : "Suggest"}
              </button>
            </form>
          </div>
        </div>
        <div className="md:col-span-4 surface rounded-2xl p-6">
          <div className="label-mono text-zinc-500 mb-3">/ YOUR PLAN</div>
          <div className="text-2xl font-semibold capitalize">{user?.plan}</div>
          <div className="mt-2 label-mono text-[#E2FF3D]">{user?.credits} CREDITS</div>
          <div className="mt-6 h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#E2FF3D]" style={{ width: Math.min(100, (user?.credits / 25000) * 100) + "%" }} />
          </div>
          <Link to="/pricing" className="mt-6 inline-flex items-center gap-2 text-sm hover:text-[#E2FF3D]">
            Upgrade plan <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div>
        <div className="label-mono text-zinc-500 mb-3">/ QUICK ACTIONS</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICKS.map((q) => (
            <Link key={q.to} to={q.to} data-testid={`quick-${q.t.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className="surface rounded-xl p-5 transition group">
              <q.icon className="w-5 h-5 text-[#E2FF3D] mb-4" />
              <div className="font-medium mb-1 group-hover:text-[#E2FF3D] transition">{q.t}</div>
              <div className="text-xs text-zinc-500">{q.d}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* IDEAS */}
      {ideas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="label-mono text-zinc-500">/ AI AD IDEAS</div>
            {scrapedSrc?.title && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                {scrapedSrc.icon && <img src={scrapedSrc.icon} alt="" className="w-5 h-5 rounded" />}
                <span className="label-mono text-[#E2FF3D]">REAL ·</span> {scrapedSrc.title}
              </div>
            )}
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ideas.map((idea, i) => (
              <div key={i} data-testid={`idea-card-${i}`} className="surface rounded-xl p-5">
                <div className="label-mono text-[#E2FF3D] text-[10px] mb-2">{idea.video_type?.replace("_", " ").toUpperCase()} · {idea.duration_sec}s</div>
                <div className="font-semibold mb-2">{idea.title}</div>
                <div className="text-sm text-zinc-400 mb-3">{idea.angle}</div>
                <div className="text-xs text-zinc-500 italic">"{idea.hook}"</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RECENT PROJECTS */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="label-mono text-zinc-500">/ RECENT PROJECTS</div>
          <Link to="/dashboard/projects" className="text-xs text-zinc-400 hover:text-white">View all →</Link>
        </div>
        {projects.length === 0 ? (
          <div className="surface rounded-xl p-10 text-center">
            <Film className="w-8 h-8 text-zinc-600 mx-auto mb-4" />
            <div className="text-zinc-400">No projects yet — kick off your first reel.</div>
            <Link to="/dashboard/new" className="mt-4 inline-flex items-center gap-2 btn-volt rounded-full px-4 py-2 text-sm">
              New Project <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {projects.slice(0, 8).map((p) => (
              <Link key={p.project_id} to={`/dashboard/projects/${p.project_id}`}
                    data-testid={`project-${p.project_id}`}
                    className="surface rounded-xl overflow-hidden group transition">
                <div className="relative ar-916 bg-[#1C1C1F]">
                  {p.thumbnail ? <img src={assetUrl(p.thumbnail)} alt="" className="absolute inset-0 w-full h-full object-cover" /> :
                    <div className="absolute inset-0 grid place-items-center"><Film className="w-8 h-8 text-zinc-700" /></div>}
                  <div className="absolute top-2 right-2 glass label-mono text-[10px] px-2 py-1 rounded">{p.aspect_ratio}</div>
                </div>
                <div className="p-3">
                  <div className="text-sm font-medium truncate">{p.title}</div>
                  <div className="label-mono text-zinc-500 mt-1">{p.video_type?.replace("_", " ")} · {p.status}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* TEMPLATES */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="label-mono text-zinc-500">/ TEMPLATES</div>
          <Link to="/dashboard/templates" className="text-xs text-zinc-400 hover:text-white">Browse all →</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <Link key={t.template_id} to={`/dashboard/new?template=${t.template_id}`}
                  data-testid={`template-${t.template_id}`} className="surface rounded-xl overflow-hidden transition">
              <div className="relative ar-169 bg-[#1C1C1F]">
                <img src={t.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
                {t.is_premium && (
                  <div className="absolute top-2 left-2 glass label-mono text-[10px] px-2 py-1 rounded text-[#E2FF3D]">PRO</div>
                )}
              </div>
              <div className="p-4">
                <div className="text-sm font-medium">{t.title}</div>
                <div className="text-xs text-zinc-500 mt-1">{t.category} · {t.duration_sec}s</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
