import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const KEY = "cinereel_cookie_consent";
const PUBLIC = (p) => p === "/" || p.startsWith("/guides") || p === "/privacy" || p === "/terms";

export const CookieConsent = () => {
  const { pathname } = useLocation();
  const [choice, setChoice] = useState(() => localStorage.getItem(KEY));
  if (choice || !PUBLIC(pathname)) return null;
  const decide = (v) => {
    localStorage.setItem(KEY, v);
    if (v === "rejected") (window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 1;
    setChoice(v);
  };
  return (
    <div data-testid="cookie-banner" className="fixed inset-x-3 bottom-3 sm:left-auto sm:right-4 sm:max-w-sm z-50 surface rounded-xl p-4 shadow-2xl safe-bottom">
      <p className="text-sm">
        Hum cookies ka use site behtar banane, analytics aur ads ke liye karte hain.{" "}
        <Link to="/privacy" data-testid="cookie-privacy-link" className="underline">Privacy Policy</Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button data-testid="cookie-accept" onClick={() => decide("accepted")} className="btn-volt rounded-full px-4 py-1.5 text-xs">Accept</button>
        <button data-testid="cookie-reject" onClick={() => decide("rejected")} className="rounded-full px-4 py-1.5 text-xs border border-white/20 hover:border-white/40">Reject</button>
      </div>
    </div>
  );
};
