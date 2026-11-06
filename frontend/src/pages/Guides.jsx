import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { GUIDES } from "../lib/guides";

const Shell = ({ children }) => (
  <div className="min-h-screen bg-[#0A0A0B] text-white">
    <header className="border-b border-white/10 safe-top">
      <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
        <Link to="/" data-testid="guides-home-link" className="font-semibold tracking-tight">CineReel<span className="text-[#E2FF3D]">.</span>AI</Link>
        <Link to="/signup" data-testid="guides-signup-link" className="btn-volt rounded-full px-4 py-1.5 text-xs">Free me try karo</Link>
      </div>
    </header>
    <main className="max-w-3xl mx-auto px-5 py-10 sm:py-14">{children}</main>
  </div>
);

export function GuidesList() {
  useEffect(() => { document.title = "Video Ad Guides — CineReel AI"; }, []);
  return (
    <Shell>
      <div className="label-mono text-zinc-500 flex items-center gap-2"><BookOpen className="w-4 h-4" /> / GUIDES</div>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">AI Video Ads Guides</h1>
      <p className="text-zinc-400 mt-3">Chhote business aur creators ke liye video ads banane ki aasaan Hinglish guides.</p>
      <div className="mt-8 space-y-4" data-testid="guides-list">
        {GUIDES.map((g) => (
          <Link key={g.slug} to={`/guides/${g.slug}`} data-testid={`guide-card-${g.slug}`}
            className="surface rounded-xl p-5 block hover:border-white/30 transition-colors">
            <div className="text-lg font-semibold">{g.title}</div>
            <p className="text-sm text-zinc-400 mt-1.5">{g.summary}</p>
            <div className="text-xs text-[#E2FF3D] mt-3 flex items-center gap-1">Padho <ArrowRight className="w-3 h-3" /></div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}

export function GuidePage() {
  const { slug } = useParams();
  const g = GUIDES.find((x) => x.slug === slug);
  useEffect(() => { document.title = g ? `${g.title} — CineReel AI` : "Guide not found — CineReel AI"; }, [g]);
  if (!g) return <Shell><p data-testid="guide-not-found">Guide nahi mili. <Link to="/guides" className="underline">Sab guides dekho</Link></p></Shell>;
  return (
    <Shell>
      <Link to="/guides" data-testid="guide-back-link" className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Sab guides</Link>
      <article data-testid="guide-article" className="mt-5">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">{g.title}</h1>
        <div className="text-xs text-zinc-500 mt-3">CineReel AI Team · {g.date}</div>
        <p className="text-zinc-300 mt-5 text-base">{g.summary}</p>
        {g.sections.map(([h, body]) => (
          <section key={h} className="mt-8">
            <h2 className="text-lg font-semibold">{h}</h2>
            <p className="text-zinc-300 mt-2 leading-relaxed">{body}</p>
          </section>
        ))}
      </article>
      <div className="surface rounded-xl p-5 mt-12">
        <div className="font-semibold">Apna video ad 5 minute me banao</div>
        <p className="text-sm text-zinc-400 mt-1">Script, awaaz, scenes aur captions — sab CineReel AI ke saath.</p>
        <Link to="/signup" data-testid="guide-cta" className="btn-volt inline-flex rounded-full px-5 py-2 text-sm mt-4">Free me shuru karo</Link>
      </div>
    </Shell>
  );
}
