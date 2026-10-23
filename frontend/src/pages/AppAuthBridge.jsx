import { useEffect, useState } from "react";

// Opened in the phone's browser after Google sign-in; hands the session back to the Android app.
export default function AppAuthBridge() {
  const [deepLink, setDeepLink] = useState("");
  useEffect(() => {
    const m = window.location.hash.match(/session_id=([^&]+)/);
    if (!m) return;
    const link = `cinereel://auth#session_id=${m[1]}`;
    setDeepLink(link);
    window.history.replaceState(null, "", "/app-auth");
    window.location.href = link;
  }, []);

  return (
    <div data-testid="app-auth-bridge" className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#0A0A0B] text-white px-6 text-center">
      <div className="label-mono text-[#E2FF3D]">{deepLink ? "Opening CineReel app…" : "Sign-in link expired"}</div>
      {deepLink ? (
        <a data-testid="app-auth-open" href={deepLink} className="btn-volt rounded-full px-6 py-3 text-sm font-semibold">
          Open CineReel app
        </a>
      ) : (
        <a href="/login" className="text-sm text-zinc-400 underline">Back to login</a>
      )}
    </div>
  );
}
