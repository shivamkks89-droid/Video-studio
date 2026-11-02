import { toast } from "sonner";
import { api } from "./api";

const loadCheckout = () => new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = resolve; s.onerror = () => reject(new Error("Razorpay load failed"));
  document.body.appendChild(s);
});

/** Order → Razorpay Checkout → server signature verify. Shared by Pricing and the renew banner. */
export async function startRazorpay(planId, { onSuccess, onDone }) {
  try {
    await loadCheckout();
    const { data: o } = await api.post("/billing/razorpay/order", { plan: planId });
    const rzp = new window.Razorpay({
      key: o.key_id, order_id: o.order_id, amount: o.amount, currency: o.currency,
      name: "CineReel AI", description: `${o.plan_name} plan · 30 days`,
      prefill: { name: o.name, email: o.email }, theme: { color: "#E2FF3D" },
      handler: async (res) => {
        try {
          const { data } = await api.post("/billing/razorpay/verify", res);
          await onSuccess?.(data, o);
        } catch (e) { toast.error(e.response?.data?.detail || "Verification failed — contact support"); }
        finally { onDone?.(); }
      },
      modal: { ondismiss: () => onDone?.() },
    });
    rzp.on("payment.failed", (r) => { toast.error(r.error?.description || "Payment failed"); onDone?.(); });
    rzp.open();
  } catch (e) {
    toast.error(e.response?.data?.detail || e.message || "Could not start payment");
    onDone?.();
  }
}
