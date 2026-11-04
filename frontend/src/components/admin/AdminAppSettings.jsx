import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { api } from "../../lib/api";

const FIELDS = [
  ["latest_version_code", "Latest versionCode (number from build.gradle)", "number"],
  ["latest_version_name", "Latest versionName (e.g. 1.2)", "text"],
  ["store_url", "Play Store link", "url"],
  ["update_message", "Update message for users", "text"],
];

export const AdminAppSettings = () => {
  const [form, setForm] = useState({});
  useEffect(() => { api.get("/app/version").then(({ data }) => setForm(data)).catch(() => {}); }, []);
  const save = async () => {
    try { const { data } = await api.put("/admin/app-settings", form); setForm(data); toast.success("App settings saved"); }
    catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
  };
  return (
    <div data-testid="admin-app-settings">
      <div className="label-mono text-zinc-500 mb-3 flex items-center gap-2"><Smartphone className="w-4 h-4" /> / APP VERSION</div>
      <div className="surface rounded-xl p-4 grid sm:grid-cols-2 gap-3">
        {FIELDS.map(([k, label, type]) => (
          <label key={k} className="text-xs text-zinc-400 space-y-1">
            <span>{label}</span>
            <input data-testid={`app-setting-${k}`} type={type} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-md px-3 py-2 text-sm text-white" />
          </label>
        ))}
        <button data-testid="app-settings-save" onClick={save} className="btn-volt rounded-full py-2 text-sm sm:col-span-2">Save</button>
      </div>
    </div>
  );
};
