import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hideNativeSplash, installNotificationTapListener } from "../lib/native";
import BrandMark from "./BrandMark";

/**
 * Web-level splash gate that mirrors the native Android splash.
 * Shows the branded lime logo on a dark background so the app never flashes
 * white during React hydration inside Android WebView.
 * Fades out after `minMs` and after the app tree has mounted.
 */
export default function SplashGate({ minMs = 900, children }) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Notification taps → deep-link into the target project.
    installNotificationTapListener((url) => {
      try {
        if (url?.startsWith("http")) window.location.href = url;
        else if (url) navigate(url);
      } catch { /* ignore */ }
    });
  }, [navigate]);

  useEffect(() => {
    let mounted = true;
    const t1 = setTimeout(() => {
      if (!mounted) return;
      setFading(true);
      // Hide the native Capacitor splash at the same instant so both fade together.
      hideNativeSplash();
      const t2 = setTimeout(() => mounted && setVisible(false), 320);
      return () => clearTimeout(t2);
    }, minMs);
    return () => { mounted = false; clearTimeout(t1); };
  }, [minMs]);

  return (
    <>
      {children}
      {visible && (
        <div
          data-testid="splash-gate"
          aria-hidden="true"
          className={`fixed inset-0 z-[9999] grid place-items-center bg-[#0A0A0B]
                      transition-opacity duration-300 ease-out
                      ${fading ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
          {/* Radial lime glow */}
          <div className="pointer-events-none absolute inset-0"
               style={{
                 background:
                   "radial-gradient(circle at 50% 50%, rgba(226,255,61,0.16) 0%, rgba(226,255,61,0.04) 42%, transparent 70%)",
               }}
          />
          <div className="relative flex flex-col items-center">
            {/* Volt-Play brand mark — bold chevron stack with signature lime dot */}
            <div className="animate-splash-pop drop-shadow-[0_20px_60px_rgba(226,255,61,0.55)]">
              <BrandMark size={104} />
            </div>

            <div className="mt-6 text-white text-xl font-semibold tracking-tight">
              CineReel<span className="text-[#E2FF3D]">.</span>AI
            </div>
            <div className="mt-1 label-mono text-zinc-500 text-[10px]">AI VIDEO STUDIO</div>

            {/* Loading track */}
            <div className="mt-6 w-32 h-0.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-[#E2FF3D] rounded-full animate-splash-track" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
