import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fbAuth, trackEvent } from "../lib/firebase";

const inp = "w-full surface rounded-lg px-3 py-2.5 bg-transparent text-sm outline-none";
const ERR = { "auth/invalid-credential": "Email ya password galat hai", "auth/email-already-in-use": "Ye email pehle se Firebase me hai — Login karo", "auth/weak-password": "Password kam se kam 6 characters ka ho", "auth/too-many-requests": "Bahut zyada try — thodi der baad karo" };

export const FirebaseEmailAuth = () => {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const run = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const f = await fbAuth();
      if (mode === "reset") { await f.sendPasswordResetEmail(f.auth, email); toast.success("Password reset link email pe bheja"); return; }
      const cred = mode === "signup" ? await f.createUserWithEmailAndPassword(f.auth, email, password) : await f.signInWithEmailAndPassword(f.auth, email, password);
      if (!cred.user.emailVerified) {
        await f.sendEmailVerification(cred.user);
        toast.info("Verification link email pe bheja — verify karke Login dabao"); setMode("login"); return;
      }
      const { data } = await api.post("/auth/firebase", { id_token: await cred.user.getIdToken(true) });
      login(data.token, data.user); trackEvent("login", { method: "firebase_email" });
      toast.success("Welcome!"); navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || ERR[err.code] || err.message);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={run} data-testid="firebase-auth-form" className="mt-6 space-y-3">
      <div className="flex gap-3 text-xs label-mono">
        {["login", "signup", "reset"].map((m) => (
          <button type="button" key={m} data-testid={`firebase-mode-${m}`} onClick={() => setMode(m)} className={mode === m ? "text-[#E2FF3D]" : "text-zinc-500"}>
            {m === "login" ? "LOGIN" : m === "signup" ? "NEW ACCOUNT" : "FORGOT PASSWORD"}
          </button>
        ))}
      </div>
      <input data-testid="firebase-email-input" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} />
      {mode !== "reset" && <input data-testid="firebase-password-input" type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inp} />}
      <button data-testid="firebase-auth-submit" disabled={busy} className="btn-volt w-full rounded-full py-3 disabled:opacity-60">
        {busy ? "Please wait…" : mode === "reset" ? "Send reset link" : mode === "signup" ? "Create & verify email" : "Log in with Firebase"}
      </button>
      <p className="text-[11px] text-zinc-500">Purane account ka same email use karoge to wahi account, projects aur credits khulenge.</p>
    </form>
  );
};
