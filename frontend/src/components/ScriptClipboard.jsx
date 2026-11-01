import { useState } from "react";
import { Check, ClipboardPaste, Copy } from "lucide-react";
import { toast } from "sonner";

export const scriptToText = (s = {}) => {
  const scenes = (s.scenes || []).map((sc, i) => sc.voiceover && `Scene ${i + 1}: ${sc.voiceover}`).filter(Boolean);
  return [s.title && `${s.title}\n`, s.hook && `HOOK: ${s.hook}`, s.body && `BODY: ${s.body}`, s.cta && `CTA: ${s.cta}`,
    scenes.length && `\n${scenes.join("\n")}`, s.hashtags?.length && `\n${s.hashtags.join(" ")}`].filter(Boolean).join("\n");
};

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
}

/** Plain text → {hook, body, cta}: strips HOOK/BODY/CTA labels, else first sentence = hook, last = CTA. */
export const textToScript = (text) => {
  const t = text.trim();
  const grab = (k) => (t.match(new RegExp(`${k}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(HOOK|BODY|CTA|Scene \\d+)\\s*:|$)`, "i")) || [])[1]?.trim();
  if (grab("HOOK") || grab("BODY")) return { hook: grab("HOOK") || "", body: grab("BODY") || "", cta: grab("CTA") || "" };
  const parts = t.split(/(?<=[.!?।])\s+/).filter(Boolean);
  if (parts.length < 3) return { hook: parts[0] || t, body: parts.slice(1).join(" "), cta: "" };
  return { hook: parts[0], body: parts.slice(1, -1).join(" "), cta: parts[parts.length - 1] };
};

export const CopyScriptButton = ({ script, testId = "copy-script", label = "Copy script" }) => {
  const [done, setDone] = useState(false);
  const go = async (e) => {
    e?.stopPropagation();
    await copyText(scriptToText(script));
    setDone(true); toast.success("Script copied");
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button type="button" data-testid={testId} onClick={go}
      className="surface rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 hover:border-white/30 active:scale-95 transition-transform">
      {done ? <Check className="w-3 h-3 text-[#E2FF3D]" /> : <Copy className="w-3 h-3" />} {label}
    </button>
  );
};

export const PasteScriptBox = ({ onUse, testId = "paste-script" }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const start = async () => {
    setOpen(true);
    try { const t = await navigator.clipboard.readText(); if (t) setText(t); } catch { /* user can long-press paste */ }
  };
  if (!open) return (
    <button type="button" data-testid={`${testId}-open`} onClick={start}
      className="surface rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 hover:border-white/30">
      <ClipboardPaste className="w-3 h-3" /> Paste my script
    </button>
  );
  return (
    <div className="w-full space-y-2" data-testid={testId}>
      <textarea data-testid={`${testId}-input`} value={text} onChange={(e) => setText(e.target.value)} rows={5}
        placeholder="Yahan apna script paste karo (long-press → Paste)"
        className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg p-3 text-sm outline-none focus:border-white/30" />
      <div className="flex gap-2">
        <button type="button" data-testid={`${testId}-use`} disabled={!text.trim()}
          onClick={() => { onUse(text.trim()); setOpen(false); setText(""); }}
          className="btn-volt rounded-full px-4 py-2 text-xs disabled:opacity-50">Use this script</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500 px-2">Cancel</button>
      </div>
    </div>
  );
};
