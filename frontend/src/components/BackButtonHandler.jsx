import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { isNativeApp } from "../lib/native";
import { backClosers, exitGuards } from "../lib/backStack";

const ROOTS = ["/", "/dashboard", "/login", "/signup"];
const OPEN_LAYER = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]';

// Single native back-button listener (Android only; web browser back is untouched).
export const BackButtonHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locRef = useRef(location);
  locRef.current = location;

  useEffect(() => {
    const native = isNativeApp();
    const debug = !native && localStorage.getItem("debugNativeBack") === "1";
    if (!native && !debug) return undefined;
    let handle = null;
    let cancelled = false;
    let lastPress = 0;
    const onBack = (exitApp) => {
        if (backClosers.length) { backClosers[backClosers.length - 1](); return; }
        if (document.querySelector(OPEN_LAYER)) {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          return;
        }
        const path = locRef.current.pathname.replace(/\/+$/, "") || "/";
        if (ROOTS.includes(path)) {
          const now = Date.now();
          if (now - lastPress < 2000) { lastPress = 0; exitApp(); return; }
          lastPress = now;
          toast(exitGuards.size ? "Video render chal raha hai — phir bhi exit ke liye dobara Back dabao"
            : "Press back again to exit", { duration: 2000, id: "exit-hint" });
          return;
        }
        if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
        else navigate(path.startsWith("/dashboard") ? "/dashboard" : "/", { replace: true });
    };
    if (debug) {
      window.__simulateBack = () => onBack(() => { window.__exited = true; });
      return () => { delete window.__simulateBack; };
    }
    (async () => {
      const { App } = await import("@capacitor/app");
      const h = await App.addListener("backButton", () => onBack(() => App.exitApp()));
      if (cancelled) h.remove();
      else handle = h;
    })();
    return () => { cancelled = true; handle?.remove(); };
  }, [navigate]);

  return null;
};
