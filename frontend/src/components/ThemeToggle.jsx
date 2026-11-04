import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { getThemePref, setThemePref } from "../lib/theme";

const OPTS = [["auto", Monitor, "Auto"], ["light", Sun, "Light"], ["dark", Moon, "Dark"]];

export const ThemeToggle = () => {
  const [p, setP] = useState(getThemePref());
  return (
    <div data-testid="theme-toggle" className="inline-flex surface rounded-full p-1 gap-1">
      {OPTS.map(([v, Icon, label]) => (
        <button key={v} type="button" data-testid={`theme-${v}`} onClick={() => { setThemePref(v); setP(v); }}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${p === v ? "bg-[#E2FF3D] text-black" : "text-zinc-400"}`}>
          <Icon className="w-3.5 h-3.5" /> {label}
        </button>
      ))}
    </div>
  );
};
