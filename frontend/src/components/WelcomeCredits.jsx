import { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

const STEPS = ["Topic likho ya script paste karo", "AI se scenes aur voiceover banao", "Render karo aur WhatsApp pe share karo"];

export const WelcomeCredits = () => {
  const [credits, setCredits] = useState(() => localStorage.getItem("cinereel_welcome"));
  const close = () => { localStorage.removeItem("cinereel_welcome"); setCredits(null); };
  return (
    <Dialog open={!!credits} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid="welcome-credits-dialog" className="max-w-sm bg-[#0A0A0B] border-white/10 text-white">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#E2FF3D]" /> CineReel me swagat hai!</DialogTitle></DialogHeader>
        <p data-testid="welcome-credits-amount" className="text-sm text-zinc-300">Aapko <b className="text-[#E2FF3D]">{credits} free credits</b> mile hain.</p>
        <ol className="space-y-2 text-sm text-zinc-400 list-decimal pl-5">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        <Link to="/dashboard/new" onClick={close} data-testid="welcome-start-btn" className="btn-volt rounded-full py-2.5 text-center text-sm font-semibold">Pehla video banao</Link>
      </DialogContent>
    </Dialog>
  );
};
