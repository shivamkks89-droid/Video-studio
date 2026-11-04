import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { isNativeApp } from "../lib/native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

export const AppUpdatePrompt = () => {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!isNativeApp()) return;
    (async () => {
      const { App } = await import("@capacitor/app");
      const [{ build }, { data }] = await Promise.all([App.getInfo(), api.get("/app/version")]);
      const latest = Number(data.latest_version_code || 0);
      if (latest > Number(build) && localStorage.getItem("cinereel_skip_version") !== String(latest)) setInfo({ ...data, latest });
    })().catch(() => {});
  }, []);
  const later = () => { localStorage.setItem("cinereel_skip_version", String(info.latest)); setInfo(null); };
  const update = () => { window.open(info.store_url || "https://play.google.com/store/apps/details?id=ai.cinereel.app", "_system"); setInfo(null); };
  return (
    <Dialog open={!!info} onOpenChange={(o) => !o && later()}>
      <DialogContent data-testid="app-update-dialog" className="max-w-sm bg-[#0A0A0B] border-white/10 text-white">
        <DialogHeader><DialogTitle>Naya version aaya hai{info?.latest_version_name ? ` (${info.latest_version_name})` : ""}</DialogTitle></DialogHeader>
        <p className="text-sm text-zinc-400">{info?.update_message || "Behtar features aur fixes ke liye app update karein."}</p>
        <div className="flex gap-2">
          <button data-testid="app-update-later" onClick={later} className="flex-1 surface rounded-full py-2.5 text-sm">Baad me</button>
          <button data-testid="app-update-now" onClick={update} className="flex-1 btn-volt rounded-full py-2.5 text-sm font-semibold">Update karo</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
