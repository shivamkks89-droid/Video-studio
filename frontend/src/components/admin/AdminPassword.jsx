import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { api } from "../../lib/api";
import { PasswordInput } from "../PasswordInput";

const INPUT = "w-full bg-[#0A0A0B] border border-white/10 rounded-md px-3 py-2 text-sm text-white";

export const AdminPassword = () => {
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (f.next.length < 8) return toast.error("Naya password kam se kam 8 characters ka ho");
    if (f.next !== f.confirm) return toast.error("Dono naye password match nahi kar rahe");
    setBusy(true);
    try {
      const { data } = await api.post("/admin/change-password", { current_password: f.current, new_password: f.next });
      localStorage.setItem("cinereel_token", data.token);
      setF({ current: "", next: "", confirm: "" });
      toast.success("Password badal gaya. Baaki devices se logout ho gaya.");
    } catch (e) { toast.error(e.response?.data?.detail || "Password change failed"); }
    finally { setBusy(false); }
  };
  return (
    <div data-testid="admin-password">
      <div className="label-mono text-zinc-500 mb-3 flex items-center gap-2"><KeyRound className="w-4 h-4" /> / ADMIN PASSWORD</div>
      <div className="surface rounded-xl p-4 grid sm:grid-cols-3 gap-3 items-end">
        <PasswordInput testid="admin-pw-current" placeholder="Purana password" value={f.current} onChange={set("current")} className={INPUT} />
        <PasswordInput testid="admin-pw-new" placeholder="Naya password (8+)" value={f.next} onChange={set("next")} className={INPUT} />
        <PasswordInput testid="admin-pw-confirm" placeholder="Naya password dobara" value={f.confirm} onChange={set("confirm")} className={INPUT} />
        <button data-testid="admin-pw-save" disabled={busy || !f.current} onClick={save}
          className="btn-volt rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 sm:col-span-3 sm:justify-self-start">
          {busy ? "Saving…" : "Change password"}
        </button>
      </div>
    </div>
  );
};
