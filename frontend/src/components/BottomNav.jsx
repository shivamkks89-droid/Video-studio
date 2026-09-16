import { useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  Home, FolderKanban, Plus, LayoutGrid, User as UserIcon,
  Sparkles, Mic, Image as ImageIcon, Megaphone, Rocket, User, X,
} from "lucide-react";
import { hapticTap, hapticSelection } from "../lib/native";

/**
 * Native-style Android bottom tab bar.
 * - Fixed at bottom, respects safe-area-inset-bottom for gesture-nav.
 * - Hidden on lg+ (desktop keeps the sidebar).
 * - Centre "Create" is a raised FAB-style tab.
 * - "Studios" opens a bottom sheet with all creative studios.
 */
export default function BottomNav() {
  const [studiosOpen, setStudiosOpen] = useState(false);
  const { pathname } = useLocation();

  const isActive = (to, exact = false) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const studios = [
    { to: "/dashboard/script",    label: "Script",     icon: Sparkles },
    { to: "/dashboard/voice",     label: "Voice",      icon: Mic },
    { to: "/dashboard/scene",     label: "Scene",      icon: ImageIcon },
    { to: "/dashboard/avatars",   label: "Avatar",     icon: User },
    { to: "/dashboard/ad-studio", label: "Ad Studio",  icon: Megaphone },
    { to: "/dashboard/playstore", label: "Play Store", icon: Rocket },
  ];

  return (
    <>
      {/* Studios bottom sheet */}
      {studiosOpen && (
        <>
          <div
            data-testid="studios-sheet-backdrop"
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setStudiosOpen(false)}
          />
          <div
            data-testid="studios-sheet"
            className="fixed left-0 right-0 bottom-0 z-50 lg:hidden
                       bg-[#0F0F11] border-t border-white/10 rounded-t-3xl
                       animate-in slide-in-from-bottom-4 duration-200
                       safe-bottom"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div>
                <div className="label-mono text-zinc-500 text-[10px] mb-1">/ STUDIOS</div>
                <div className="text-lg font-semibold">Pick a creative studio</div>
              </div>
              <button
                onClick={() => setStudiosOpen(false)}
                aria-label="Close studios"
                className="p-2 -m-2 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Drag handle */}
            <div className="mx-auto w-10 h-1 rounded-full bg-white/15 mb-4 -mt-1" />
            <div className="grid grid-cols-3 gap-3 px-5 pb-6">
              {studios.map((s) => (
                <Link
                  key={s.to}
                  to={s.to}
                  data-testid={`studios-sheet-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => setStudiosOpen(false)}
                  className={`surface rounded-2xl px-3 py-4 flex flex-col items-center gap-2 transition
                              ${isActive(s.to) ? "border-[#E2FF3D]/60 bg-[#E2FF3D]/5" : "hover:border-white/25"}`}
                >
                  <s.icon className={`w-5 h-5 ${isActive(s.to) ? "text-[#E2FF3D]" : "text-zinc-300"}`} />
                  <span className="text-xs font-medium">{s.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Bottom tab bar */}
      <nav
        data-testid="bottom-tab-bar"
        className="fixed bottom-0 left-0 right-0 z-30 lg:hidden
                   bg-[#0A0A0B]/90 backdrop-blur-xl
                   border-t border-white/10 safe-bottom"
        role="navigation"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5 h-14 px-1">
          <Tab
            testid="tab-home"
            to="/dashboard"
            label="Home"
            icon={Home}
            active={isActive("/dashboard", true)}
          />
          <Tab
            testid="tab-projects"
            to="/dashboard/projects"
            label="Projects"
            icon={FolderKanban}
            active={isActive("/dashboard/projects")}
          />

          {/* Raised centre "Create" FAB */}
          <div className="relative flex items-start justify-center">
            <Link
              to="/dashboard/new"
              data-testid="tab-create"
              aria-label="New project"
              onClick={() => hapticTap("Medium")}
              className="absolute -top-5 w-14 h-14 rounded-full bg-[#E2FF3D] text-black
                         grid place-items-center shadow-[0_10px_28px_rgba(226,255,61,0.45)]
                         ring-4 ring-[#0A0A0B] active:scale-95 transition-transform"
            >
              <Plus className="w-6 h-6" strokeWidth={2.8} />
            </Link>
            <span className="mt-9 text-[10px] font-medium text-zinc-400">Create</span>
          </div>

          <button
            type="button"
            data-testid="tab-studios"
            onClick={() => { hapticSelection(); setStudiosOpen(true); }}
            className={`flex flex-col items-center justify-center gap-0.5 transition
                        ${studiosOpen ? "text-[#E2FF3D]" : "text-zinc-400 hover:text-white"}`}
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="text-[10px] font-medium">Studios</span>
          </button>

          <Tab
            testid="tab-account"
            to="/dashboard/credits"
            label="Account"
            icon={UserIcon}
            active={isActive("/dashboard/credits") || isActive("/dashboard/settings")}
          />
        </div>
      </nav>
    </>
  );
}

function Tab({ to, label, icon: Icon, active, testid }) {
  return (
    <NavLink
      to={to}
      data-testid={testid}
      onClick={() => hapticSelection()}
      className={`flex flex-col items-center justify-center gap-0.5 transition
                  ${active ? "text-[#E2FF3D]" : "text-zinc-400 hover:text-white"}`}
    >
      <div className="relative">
        <Icon className="w-5 h-5" />
        {active && (
          <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#E2FF3D]" />
        )}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  );
}
