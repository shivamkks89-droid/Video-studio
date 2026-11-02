import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import BrandMark from "../components/BrandMark";
import { Check, ArrowRight, Film } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export default function Pricing() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(null);
  useEffect(() => { api.get("/catalog/plans").then(({data}) => setPlans(data)); }, []);

  const loadCheckout = () => new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = resolve; s.onerror = () => reject(new Error("Razorpay load failed"));
    document.body.appendChild(s);
  });

  const buy = async (id) => {
    if (!user) return navigate("/login");
    if (id === "free") return toast.message("You are already on free.");
    if (busy) return;
    setBusy(id);
    try {
      await loadCheckout();
      const { data: o } = await api.post("/billing/razorpay/order", { plan: id });
      const rzp = new window.Razorpay({
        key: o.key_id, order_id: o.order_id, amount: o.amount, currency: o.currency,
        name: "CineReel AI", description: `${o.plan_name} plan · 30 days`,
        prefill: { name: o.name, email: o.email }, theme: { color: "#E2FF3D" },
        handler: async (res) => {
          try {
            const { data } = await api.post("/billing/razorpay/verify", res);
            await refresh();
            toast.success(data.already ? "Payment already applied" : `${o.plan_name} active · +${data.credits_added} credits`);
          } catch (e) { toast.error(e.response?.data?.detail || "Verification failed — contact support"); }
          finally { setBusy(null); }
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rzp.on("payment.failed", (r) => { toast.error(r.error?.description || "Payment failed"); setBusy(null); });
      rzp.open();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Could not start payment");
      setBusy(null);
    }
  };

  return (
    <div data-testid="pricing-page" className="min-h-screen bg-[#0A0A0B] text-white">
      <header className="sticky top-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 grid place-items-center"><BrandMark size={32} /></div>
            <span className="font-semibold tracking-tight">CineReel<span className="text-[#E2FF3D]">.</span>AI</span>
          </Link>
          {user ? <Link to="/dashboard" className="text-sm">Dashboard →</Link> : <Link to="/login" className="text-sm">Log in</Link>}
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="label-mono text-zinc-500 mb-3">/ PRICING</div>
        <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight max-w-3xl">Pay for renders, not for the editor.</h1>
        <p className="mt-4 text-zinc-400 max-w-2xl">Every plan unlocks the same canvas. Credits scale as your output does.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-12">
          {plans.map((p) => (
            <div key={p.id} className={`surface rounded-2xl p-6 flex flex-col ${p.id === "creator" ? "border-[#E2FF3D]" : ""}`}>
              {p.id === "creator" && <div className="label-mono text-[#E2FF3D] mb-2">MOST POPULAR</div>}
              <div className="text-xl font-semibold">{p.name}</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold">₹{(p.price_inr ?? 0).toLocaleString("en-IN")}</span>
                <span className="text-sm text-zinc-500">/30 days</span>
              </div>
              <div className="label-mono text-zinc-500 mt-1">{p.credits.toLocaleString()} CREDITS</div>
              <ul className="mt-6 space-y-2 text-sm flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2"><Check className="w-4 h-4 text-[#E2FF3D] mt-0.5" /><span>{f}</span></li>
                ))}
              </ul>
              <button data-testid={`buy-${p.id}`} disabled={busy === p.id} onClick={() => buy(p.id)}
                className={`mt-6 rounded-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60 ${p.id === "creator" ? "btn-volt" : "border border-white/15 hover:border-white/40"}`}>
                {busy === p.id ? "Processing…" : (p.price_inr === 0 ? "Get started" : "Pay with Razorpay")} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-10 text-xs text-zinc-500">Demo billing — Stripe live checkout enabled on production. No card is charged in this preview.</div>
      </section>
    </div>
  );
}
