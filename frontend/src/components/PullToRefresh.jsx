import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { hapticTap } from "../lib/native";

/**
 * Native-feeling pull-to-refresh wrapper (mobile / touch only).
 * Wraps its children; when the user pulls down from the top of the
 * scroll container, an indicator appears and `onRefresh()` fires on release.
 *
 * Desktop / non-touch devices see no indicator and behaviour is a plain <div>.
 */
export default function PullToRefresh({ onRefresh, children, threshold = 72, testid = "ptr" }) {
  const ref = useRef(null);
  const start = useRef(0);
  const pulling = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const isAtTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 2;

    const onStart = (e) => {
      if (!isAtTop()) return;
      start.current = e.touches[0].clientY;
      pulling.current = true;
    };
    const onMove = (e) => {
      if (!pulling.current || refreshing) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0) { setPull(0); return; }
      // Rubber-band easing so it feels physical
      const eased = Math.min(threshold * 1.6, dy * 0.55);
      setPull(eased);
      if (dy > 8) e.preventDefault?.();
    };
    const onEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (pull >= threshold && !refreshing) {
        setRefreshing(true);
        setPull(threshold);
        hapticTap("Medium");
        try { await onRefresh?.(); } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [onRefresh, pull, threshold, refreshing]);

  const ready = pull >= threshold;

  return (
    <div ref={ref} data-testid={testid} className="relative">
      {/* Indicator */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-center
                   z-10 transition-opacity"
        style={{
          opacity: pull > 4 ? Math.min(1, pull / threshold) : 0,
          transform: `translateY(${pull - 44}px)`,
        }}
      >
        <div className="rounded-full bg-[#141416] border border-white/10 w-10 h-10 grid place-items-center shadow-lg">
          <RefreshCw
            className={`w-4 h-4 ${refreshing ? "animate-ptr-spin text-[#E2FF3D]" : ready ? "text-[#E2FF3D]" : "text-zinc-400"}`}
            style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}
          />
        </div>
      </div>
      <div style={{ transform: `translateY(${pull}px)`, transition: pulling.current ? "none" : "transform 220ms ease" }}>
        {children}
      </div>
    </div>
  );
}
