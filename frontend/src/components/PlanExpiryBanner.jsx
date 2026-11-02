import { useState } from "react";
import { AlarmClock, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { startRazorpay } from "../lib/razorpay";

const DAY = 86400000;

export const PlanExpiryBanner = () => {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem("expiry-banner-hidden") === "1");
  if (!user?.plan_expires_at || user.plan === "free" || user.unlimited_credits || hidden) return null;
  const left = (new Date(user.plan_expires_at).getTime() - Date.now()) / DAY;
  if (left > 3) return null;
  const expired = left <= 0;
  const days = Math.max(1, Math.ceil(left));
  const renew = () => {
    setBusy(true);
    startRazorpay(user.plan, {
      onSuccess: async (data) => { await refresh(); toast.success(`Plan renewed · +${data.credits_added || 0} credits`); },
      onDone: () => setBusy(false),
    });
  };
  return (
    <div data-testid="plan-expiry-banner"
      className={`relative mb-4 rounded-xl pl-4 pr-11 py-3 flex flex-wrap items-center gap-3 border ${expired ? "border-red-400/40 bg-red-500/10" : "border-amber-400/40 bg-amber-400/10"}`}>
      <AlarmClock className={`w-4 h-4 shrink-0 ${expired ? "text-red-400" : "text-amber-400"}`} />
      <div className="flex-1 min-w-[180px] text-sm">
        <b className="capitalize">{user.plan}</b> plan {expired ? "expire ho gaya hai" : `${days} din me expire hoga`}
        <span className="text-zinc-400"> · {new Date(user.plan_expires_at).toLocaleDateString("en-IN")}</span>
      </div>
      <button data-testid="plan-renew-btn" onClick={renew} disabled={busy}
        className="btn-volt rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60 active:scale-95 transition-transform">
        {busy && <Loader2 className="w-3 h-3 animate-spin" />} Renew now
      </button>
      <button data-testid="plan-expiry-dismiss" aria-label="Dismiss" onClick={() => { sessionStorage.setItem("expiry-banner-hidden", "1"); setHidden(true); }}
        className="absolute top-1 right-1 w-9 h-9 grid place-items-center rounded-full text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
    </div>
  );
};
