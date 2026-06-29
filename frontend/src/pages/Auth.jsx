import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Film, Mail, Lock, User as UserIcon, ArrowRight, KeyRound } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

export default function Login({ mode = "login" }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [tab, setTab] = useState(mode === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [loading, setLoading] = useState(false);

  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const googleLogin = () => {
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const onLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data.token, data.user);
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  const onSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/signup", { email, password, name });
      login(data.token, data.user);
      toast.success("Account created — welcome to CineReel!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sign-up failed");
    } finally { setLoading(false); }
  };

  const onOtpRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/request", { email });
      setOtpRequested(true);
      if (data.dev_code) toast.message(`Dev code: ${data.dev_code}`);
      else toast.success("Check your inbox for the code.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not send code");
    } finally { setLoading(false); }
  };

  const onOtpVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/verify", { email, code });
      login(data.token, data.user);
      toast.success("Signed in!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid code");
    } finally { setLoading(false); }
  };

  return (
    <div data-testid="auth-page" className="min-h-screen bg-[#0A0A0B] grain relative grid lg:grid-cols-2">
      {/* left visual */}
      <div className="hidden lg:block relative overflow-hidden">
        <img className="absolute inset-0 w-full h-full object-cover opacity-50"
             src="https://images.pexels.com/photos/13812458/pexels-photo-13812458.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1200"
             alt="cinema" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0B] via-[#0A0A0B]/60 to-transparent" />
        <div className="relative z-10 p-12 h-full flex flex-col justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#E2FF3D] grid place-items-center">
              <Film className="w-4 h-4 text-black" />
            </div>
            <span className="font-semibold text-lg tracking-tight">CineReel<span className="text-[#E2FF3D]">.</span>AI</span>
          </Link>
          <div>
            <div className="label-mono text-zinc-500 mb-3">/ THE CONTROL ROOM</div>
            <h2 className="text-4xl font-semibold tracking-tight max-w-md">
              Sign in to direct your next viral reel.
            </h2>
            <p className="mt-4 text-zinc-400 max-w-md">
              Hindi · Hinglish · English voiceovers. Cinematic stills. Avatar hosts. All from a single canvas.
            </p>
          </div>
          <div className="label-mono text-zinc-600">© 2026 · BUILT FOR CREATORS</div>
        </div>
      </div>

      {/* right form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md surface rounded-2xl p-8">
          <div className="lg:hidden mb-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-[#E2FF3D] grid place-items-center">
                <Film className="w-4 h-4 text-black" />
              </div>
              <span className="font-semibold tracking-tight">CineReel.AI</span>
            </Link>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="auth-heading">
            {tab === "signup" ? "Create your account" : tab === "otp" ? "Sign in with code" : "Welcome back"}
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            {tab === "signup" ? "100 free credits to start." : tab === "otp" ? "We'll email you a 6-digit code." : "Continue with email or Google."}
          </p>

          <div className="mt-6 grid grid-cols-3 gap-1 surface !p-1 rounded-full !border-0 bg-[#1C1C1F]">
            {["login", "signup", "otp"].map((t) => (
              <button key={t} data-testid={`tab-${t}`} onClick={() => setTab(t)}
                className={`text-xs label-mono py-2 rounded-full transition ${tab === t ? "bg-[#E2FF3D] text-black" : "text-zinc-400 hover:text-white"}`}>
                {t === "login" ? "LOGIN" : t === "signup" ? "SIGNUP" : "EMAIL OTP"}
              </button>
            ))}
          </div>

          {tab === "login" && (
            <form onSubmit={onLogin} className="mt-6 space-y-4">
              <Field icon={Mail} type="email" label="Email" value={email} onChange={setEmail} testid="email-input" />
              <Field icon={Lock} type="password" label="Password" value={password} onChange={setPassword} testid="password-input" />
              <button data-testid="login-submit" disabled={loading} className="btn-volt w-full rounded-full py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                Log in <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {tab === "signup" && (
            <form onSubmit={onSignup} className="mt-6 space-y-4">
              <Field icon={UserIcon} type="text" label="Full name" value={name} onChange={setName} testid="name-input" />
              <Field icon={Mail} type="email" label="Email" value={email} onChange={setEmail} testid="email-input" />
              <Field icon={Lock} type="password" label="Password" value={password} onChange={setPassword} testid="password-input" />
              <button data-testid="signup-submit" disabled={loading} className="btn-volt w-full rounded-full py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                Create account <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {tab === "otp" && (
            <form onSubmit={otpRequested ? onOtpVerify : onOtpRequest} className="mt-6 space-y-4">
              <Field icon={Mail} type="email" label="Email" value={email} onChange={setEmail} testid="email-input" />
              {otpRequested && (
                <Field icon={KeyRound} type="text" label="6-digit code" value={code} onChange={setCode} testid="otp-input" />
              )}
              <button data-testid="otp-submit" disabled={loading} className="btn-volt w-full rounded-full py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                {otpRequested ? "Verify & sign in" : "Send me a code"} <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          <div className="my-6 flex items-center gap-3 text-zinc-600 text-xs label-mono">
            <div className="h-px flex-1 bg-white/10" /> OR <div className="h-px flex-1 bg-white/10" />
          </div>

          <button data-testid="google-login" onClick={googleLogin}
            className="w-full rounded-full py-3 border border-white/15 hover:border-white/40 flex items-center justify-center gap-3 transition">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.8 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 5.1 29.3 3 24 3 16.1 3 9.3 7.6 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.2 0 9.8-2 13.3-5.2l-6.1-5C29.2 36.3 26.7 37 24 37c-5.3 0-9.7-3-11.3-7l-6.6 5.1C9.3 41.4 16.1 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.3 4.4-4.2 5.8l6.1 5C40.4 36 45 30.5 45 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>

          <p className="mt-6 text-center text-xs text-zinc-500">
            By continuing you agree to CineReel's Terms & Privacy.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, type, label, value, onChange, testid }) {
  return (
    <label className="block">
      <div className="label-mono text-zinc-500 mb-1.5">{label}</div>
      <div className="flex items-center gap-2 surface rounded-lg px-3 py-2.5">
        <Icon className="w-4 h-4 text-zinc-500" />
        <input data-testid={testid} type={type} value={value}
               onChange={(e) => onChange(e.target.value)}
               className="bg-transparent outline-none w-full text-sm placeholder:text-zinc-600" required />
      </div>
    </label>
  );
}
