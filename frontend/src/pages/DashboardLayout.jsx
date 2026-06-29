import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FolderKanban, LayoutTemplate, Palette, Library, CreditCard,
  Settings, ShieldCheck, LogOut, Plus, Film, Sparkles, Mic, Image as ImageIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";

const SIDE_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/projects", label: "Projects", icon: FolderKanban },
  { to: "/dashboard/script", label: "Script Studio", icon: Sparkles },
  { to: "/dashboard/voice", label: "Voice Studio", icon: Mic },
  { to: "/dashboard/scene", label: "Scene Generator", icon: ImageIcon },
  { to: "/dashboard/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/dashboard/brand-kit", label: "Brand Kit", icon: Palette },
  { to: "/dashboard/assets", label: "AI Assets", icon: Library },
  { to: "/dashboard/credits", label: "Credits & Usage", icon: CreditCard },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const initial = (user.name || user.email || "U").charAt(0).toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex">
      {/* SIDEBAR */}
      <aside data-testid="sidebar" className="hidden lg:flex w-60 shrink-0 flex-col border-r border-white/5 bg-[#0A0A0B]">
        <Link to="/" className="flex items-center gap-2 px-5 h-16 border-b border-white/5">
          <div className="w-7 h-7 rounded-md bg-[#E2FF3D] grid place-items-center">
            <Film className="w-3.5 h-3.5 text-black" />
          </div>
          <span className="font-semibold tracking-tight">CineReel<span className="text-[#E2FF3D]">.</span>AI</span>
        </Link>
        <div className="p-3">
          <Link data-testid="new-project-cta" to="/dashboard/new" className="btn-volt rounded-lg w-full py-2.5 px-3 flex items-center justify-center gap-2 text-sm font-medium">
            <Plus className="w-4 h-4" /> New Project
          </Link>
        </div>
        <nav className="px-2 py-2 space-y-0.5 flex-1 overflow-y-auto scroll-thin">
          {SIDE_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.exact}
              data-testid={`sidebar-${l.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition ${
                  isActive ? "bg-[#141416] text-white border border-white/10" : "text-zinc-400 hover:text-white hover:bg-[#141416]"
                }`
              }
            >
              <l.icon className="w-4 h-4" /> {l.label}
            </NavLink>
          ))}
          {user.role === "admin" && (
            <NavLink to="/admin" data-testid="nav-admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition mt-4 border-t border-white/5 pt-4 ${
                  isActive ? "text-[#E2FF3D]" : "text-zinc-400 hover:text-white"
                }`
              }>
              <ShieldCheck className="w-4 h-4" /> Admin Panel
            </NavLink>
          )}
        </nav>
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[#E2FF3D] text-black grid place-items-center text-sm font-semibold">
              {user.picture ? <img src={user.picture} className="w-8 h-8 rounded-full" alt="" /> : initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{user.name}</div>
              <div className="label-mono text-zinc-500 truncate">{user.plan?.toUpperCase()} · {user.credits} CR</div>
            </div>
            <button data-testid="logout-btn" onClick={handleLogout} title="Log out" className="text-zinc-500 hover:text-white">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 glass h-14 px-4 lg:px-8 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="lg:hidden flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[#E2FF3D] grid place-items-center">
                <Film className="w-3.5 h-3.5 text-black" />
              </div>
              <span className="font-semibold">CineReel</span>
            </Link>
            <div className="label-mono text-zinc-500 hidden sm:block">/ STUDIO</div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/dashboard/credits" data-testid="header-credits"
                  className="px-3 py-1.5 rounded-full surface text-xs label-mono">
              <span className="text-[#E2FF3D]">{user.credits}</span> CREDITS
            </Link>
            <Link to="/pricing" data-testid="header-upgrade" className="text-xs label-mono hover:text-[#E2FF3D]">UPGRADE</Link>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
