import { useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

export default function Settings() {
  const { user } = useAuth();
  return (
    <div data-testid="settings-page" className="max-w-2xl space-y-6">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ SETTINGS</div>
        <h1 className="text-4xl font-semibold tracking-tight">Account</h1>
      </div>
      <div className="surface rounded-xl p-6 space-y-4">
        <Row label="Name" value={user?.name} />
        <Row label="Email" value={user?.email} />
        <Row label="Plan" value={user?.plan} />
        <Row label="Role" value={user?.role} />
        <Row label="Credits" value={user?.credits} />
      </div>
      <PushTest />
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-3">
      <div className="label-mono text-zinc-500">{label}</div>
      <div className="text-sm capitalize">{value}</div>
    </div>
  );
}

function PushTest() {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { const { data } = await api.post("/push/test"); toast.success(`Test alert ${data.sent} phone pe bheja`); }
    catch (e) { toast.error(e.response?.data?.detail || "Alert nahi gaya"); }
    setBusy(false);
  };
  return (
    <button data-testid="push-test-btn" onClick={send} disabled={busy}
      className="surface rounded-xl px-5 py-3 text-sm flex items-center gap-2 disabled:opacity-60">
      <BellRing className="w-4 h-4 text-[#E2FF3D]" /> {busy ? "Bhej rahe hain…" : "Test phone alert bhejo"}
    </button>
  );
}
