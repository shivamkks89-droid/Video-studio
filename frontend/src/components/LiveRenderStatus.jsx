import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../lib/api";
import { firebaseApp } from "../lib/firebase";

let signing = null;
const ensureSignedIn = async () => {
  const a = await import("firebase/auth");
  const auth = a.getAuth(firebaseApp);
  if (!signing) signing = api.get("/firebase/token").then(({ data }) => a.signInWithCustomToken(auth, data.token)).catch((e) => { signing = null; throw e; });
  return signing;
};

export const useLiveRenders = (userId) => {
  const [jobs, setJobs] = useState({});
  useEffect(() => {
    if (!firebaseApp || !userId) return;
    let off = () => {};
    (async () => {
      const cred = await ensureSignedIn();
      if (cred.user.uid !== userId) return;
      const d = await import("firebase/database");
      off = d.onValue(d.ref(d.getDatabase(firebaseApp), `render_status/${userId}`), (s) => setJobs(s.val() || {}));
    })().catch(() => {});
    return () => off();
  }, [userId]);
  return jobs;
};

const LABEL = { queued: "Queue me hai", rendering: "Render ho raha hai…", complete: "Video ready", failed: "Render fail" };

export const LiveRenderStatus = ({ userId, projectId }) => {
  const jobs = useLiveRenders(userId);
  const latest = Object.entries(jobs).filter(([, j]) => j.project_id === projectId).sort((a, b) => (a[1].updated_at < b[1].updated_at ? 1 : -1))[0];
  if (!latest) return null;
  const { status } = latest[1];
  const Icon = status === "complete" ? CheckCircle2 : status === "failed" ? XCircle : Loader2;
  return (
    <div data-testid="live-render-status" className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-300">
      <Icon className={`w-3.5 h-3.5 ${status === "rendering" || status === "queued" ? "animate-spin" : ""}`} /> Live: {LABEL[status] || status}
    </div>
  );
};
