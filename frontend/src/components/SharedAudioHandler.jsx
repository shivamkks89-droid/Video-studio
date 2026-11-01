import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { isNativeApp } from "../lib/native";

// Android "Share → CineReel": opens Voice Studio with the shared audio file ready to upload.
export const SharedAudioHandler = () => {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let handle = null;
    let cancelled = false;
    const open = async (info) => {
      if (!info?.path) return;
      try {
        const { Capacitor } = await import("@capacitor/core");
        const blob = await (await fetch(Capacitor.convertFileSrc(info.path))).blob();
        const file = new File([blob], info.name || "shared-audio.mp3", { type: info.mime || blob.type || "audio/mpeg" });
        navigate("/dashboard/voice", { state: { sharedAudio: file } });
      } catch {
        toast.error("Shared audio open nahi ho paya");
      }
    };
    (async () => {
      const { registerPlugin } = await import("@capacitor/core");
      const ShareTarget = registerPlugin("ShareTarget");
      const h = await ShareTarget.addListener("audioShared", (info) => { ShareTarget.getPending(); open(info); });
      if (cancelled) { h.remove(); return; }
      handle = h;
      open(await ShareTarget.getPending());
    })();
    return () => { cancelled = true; handle?.remove(); };
  }, [navigate]);
  return null;
};
