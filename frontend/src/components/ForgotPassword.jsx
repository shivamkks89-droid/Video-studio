import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { PasswordInput } from "./PasswordInput";

const BOX = "surface rounded-lg px-3 py-2.5 w-full bg-transparent outline-none text-sm placeholder:text-zinc-600";

export const ForgotPassword = ({ email, setEmail, onDone, onBack }) => {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!sent) {
        await api.post("/auth/password/forgot", { email });
        setSent(true);
        toast.success("Agar ye email registered hai to 6-digit code bhej diya gaya hai (10 min valid).");
      } else {
        const { data } = await api.post("/auth/password/reset", { email, code, new_password: pw });
        toast.success("Password badal gaya!");
        onDone(data);
      }
    } catch (err) { toast.error(err.response?.data?.detail || "Kuch galat ho gaya, dobara try karo"); }
    finally { setLoading(false); }
  };
  return (
    <form data-testid="forgot-form" onSubmit={submit} className="mt-6 space-y-4">
      <input data-testid="forgot-email-input" type="email" required placeholder="Email" value={email} disabled={sent}
        onChange={(e) => setEmail(e.target.value)} className={BOX} />
      {sent && <>
        <input data-testid="forgot-code-input" inputMode="numeric" maxLength={6} required placeholder="6-digit code"
          value={code} onChange={(e) => setCode(e.target.value)} className={BOX} />
        <PasswordInput testid="forgot-new-password" required minLength={8} placeholder="Naya password (8+)"
          value={pw} onChange={(e) => setPw(e.target.value)} className={BOX} />
      </>}
      <button data-testid="forgot-submit" disabled={loading} className="btn-volt w-full rounded-full py-3 flex items-center justify-center gap-2 disabled:opacity-60">
        {sent ? "Password reset karo" : "Code bhejo"} <ArrowRight className="w-4 h-4" />
      </button>
      <div className="flex justify-between text-xs text-zinc-400">
        <button type="button" data-testid="forgot-back" onClick={onBack} className="hover:text-white">← Login par wapas</button>
        {sent && <button type="button" data-testid="forgot-resend" onClick={() => { setSent(false); setCode(""); }} className="hover:text-white">Naya code mangao</button>}
      </div>
    </form>
  );
};
