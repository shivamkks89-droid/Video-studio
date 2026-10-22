import { useEffect, useRef } from "react";

// Stack of "close me first" callbacks (drawers, sheets, custom modals) for Android back.
export const backClosers = [];
// Active workflows (e.g. a video render) that make exiting the app risky.
export const exitGuards = new Set();

export function setExitGuard(key, on) {
  if (on) exitGuards.add(key);
  else exitGuards.delete(key);
}

/** While `open`, Android back + Escape call `close` instead of navigating. */
export function useBackClose(open, close) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return undefined;
    const fn = () => ref.current();
    backClosers.push(fn);
    const onKey = (e) => { if (e.key === "Escape" && backClosers[backClosers.length - 1] === fn) fn(); };
    document.addEventListener("keydown", onKey);
    return () => {
      const i = backClosers.lastIndexOf(fn);
      if (i >= 0) backClosers.splice(i, 1);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
}
