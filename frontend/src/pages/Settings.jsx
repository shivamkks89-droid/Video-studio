import { useAuth } from "../lib/auth";

export default function Settings() {
  const { user } = useAuth();
  return (
    <div data-testid="settings-page" className="max-w-2xl space-y-6">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ SETTINGS</div>
        <h1 className="text-4xl font-semibold tracking-tight">Account</h1>
      </div>
      <div className="surface rounded-xl p-6 space-y-4">
        <Row label="Name" value={user?.name} />
        <Row label="Email" value={user?.email} />
        <Row label="Plan" value={user?.plan} />
        <Row label="Role" value={user?.role} />
        <Row label="Credits" value={user?.credits} />
      </div>
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-3">
      <div className="label-mono text-zinc-500">{label}</div>
      <div className="text-sm capitalize">{value}</div>
    </div>
  );
}
