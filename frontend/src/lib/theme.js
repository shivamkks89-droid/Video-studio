import { Capacitor, registerPlugin } from "@capacitor/core";

const KEY = "cinereel_theme";
const mq = window.matchMedia("(prefers-color-scheme: light)");

export const getThemePref = () => localStorage.getItem(KEY) || "auto";

const apply = () => {
  const p = getThemePref();
  const light = p === "light" || (p === "auto" && mq.matches);
  document.documentElement.classList.toggle("light", light);
  document.documentElement.classList.toggle("dark", !light);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#F6F6F3" : "#0A0A0B");
  if (Capacitor.isNativePlatform()) registerPlugin("ShareTarget").setSystemBars({ light }).catch(() => {});
};

export const setThemePref = (p) => { localStorage.setItem(KEY, p); apply(); };

export const initTheme = () => { apply(); mq.addEventListener?.("change", apply); };
