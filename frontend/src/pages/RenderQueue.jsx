import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle, Clock, ListOrdered } from "lucide-react";
import { api } from "../lib/api";

export const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

export const queueText = (job) => {
  if (!job?.position) return null;
  return job.position === 1 ? "Aapki video abhi ban rahi hai" : `Aapki video line me ${ordinal(job.position)} number par hai`;
};

const fmtEta = (s) => (s == null ? "" : s >= 60 ? ` · ~${Math.ceil(s / 60)} min baaki` : ` · ~${s} sec baaki`);

const JobRow = ({ j }) => {
  const active = j.status === "pending" || j.status === "rendering";
  const pct = j.status === "complete" ? 100 : j.progress || 0;
  const Icon = j.status === "complete" ? CheckCircle2 : j.status === "failed" ? XCircle : j.status === "rendering" ? Loader2 : Clock;
  const color = j.status === "complete" ? "text-emerald-400" : j.status === "failed" ? "text-red-400" : "text-[#E2FF3D]";
  return (
    <Link to={`/dashboard/projects/${j.project_id}${j.status === "complete" ? "?play=1" : ""}`} data-testid={`queue-job-${j.job_id}`}
      className="surface rounded-xl p-4 block hover:border-white/30 transition-colors">
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 shrink-0 ${color} ${j.status === "rendering" ? "animate-spin" : ""}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{j.title}</div>
          <div data-testid={`queue-status-${j.job_id}`} className="text-xs text-zinc-400 truncate">
            {active ? `${queueText(j)}${j.status === "rendering" ? fmtEta(j.eta_s) : ""}`
              : j.status === "complete" ? "Ready — tap karke dekho" : j.error || "Render failed"}
          </div>
        </div>
        <div className="label-mono text-xs text-zinc-400">{pct}%</div>
      </div>
      {active && (
        <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div data-testid={`queue-bar-${j.job_id}`} className="h-full bg-[#E2FF3D] transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
      )}
    </Link>
  );
};

export default function RenderQueue() {
  const [jobs, setJobs] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.get("/render/queue").then(({ data }) => alive && setJobs(data.jobs)).catch(() => {});
    load();
    const t = setInterval(() => !document.hidden && load(), 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return (
    <div data-testid="render-queue-page" className="max-w-3xl">
      <div className="label-mono text-zinc-500 flex items-center gap-2"><ListOrdered className="w-4 h-4" /> / RENDER QUEUE</div>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2">Aapki videos</h1>
      <p className="text-sm text-zinc-400 mt-1">Line me lagi aur ban rahi videos, aur pichhle 24 ghante ki ready videos.</p>
      <div className="mt-6 space-y-3">
        {jobs === null && <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
        {jobs?.length === 0 && <div data-testid="queue-empty" className="surface rounded-xl p-6 text-sm text-zinc-400">Abhi koi video line me nahi hai.</div>}
        {jobs?.map((j) => <JobRow key={j.job_id} j={j} />)}
      </div>
    </div>
  );
}
