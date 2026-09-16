import { useEffect, useState } from "react";
import { WifiOff, CloudUpload, Check } from "lucide-react";
import { syncPending } from "../lib/drafts";
import { toast } from "sonner";

/**
 * Passive online/offline indicator + auto-sync trigger.
 * Renders a small pill at the top-right whenever the user is offline
 * or when there are pending drafts being synced.
 */
export default function OfflineBadge() {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncCount, setLastSyncCount] = useState(0);

  useEffect(() => {
    const onOnline = async () => {
      const wasOffline = !online;
      setOnline(true);
      // Only try to sync when we have queued items
      const { get } = await import("idb-keyval");
      const q = (await get("cinereel.pending-sync")) || [];
      if (q.length === 0) return;
      setSyncing(true);
      try {
        const { synced, failed } = await syncPending();
        setLastSyncCount(synced);
        if (synced > 0 && wasOffline) {
          toast.success(`Synced ${synced} offline draft${synced > 1 ? "s" : ""}`);
        }
        // Silent about failures on cold-boot; PTR / next mount will retry.
      } finally {
        setSyncing(false);
        setTimeout(() => setLastSyncCount(0), 3200);
      }
    };
    const onOffline = () => {
      setOnline(false);
      toast("You're offline — drafts save locally", { icon: "📶" });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // Best-effort sync on first mount (silent).
    if (navigator.onLine) onOnline();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
     
  }, []);

  if (online && !syncing && !lastSyncCount) return null;

  const label = !online ? "Offline · saving locally"
    : syncing ? "Syncing drafts…"
    : lastSyncCount > 0 ? `Synced ${lastSyncCount}` : "";
  const Icon = !online ? WifiOff : syncing ? CloudUpload : Check;
  const tone = !online ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
    : syncing ? "text-[#E2FF3D] border-[#E2FF3D]/30 bg-[#E2FF3D]/10"
    : "text-emerald-400 border-emerald-400/30 bg-emerald-400/10";

  return (
    <div
      data-testid="offline-badge"
      className={`fixed z-40 top-16 lg:top-4 right-3 lg:right-6
                  rounded-full border px-3 py-1 text-[11px] font-medium
                  flex items-center gap-1.5 backdrop-blur-md ${tone}`}
    >
      <Icon className={`w-3.5 h-3.5 ${syncing ? "animate-pulse" : ""}`} />
      {label}
    </div>
  );
}
