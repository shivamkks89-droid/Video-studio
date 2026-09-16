import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Film, Wand2, Mic, Bot, Languages, Layers, ShieldCheck, Zap, Menu, X } from "lucide-react";

const HERO_BG = "https://images.pexels.com/photos/13812458/pexels-photo-13812458.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const Badge = ({ children }) => (
  <span className="label-mono px-2.5 py-1 border border-white/10 rounded-full whitespace-nowrap text-[10px] sm:text-[11px]">
    {children}
  </span>
);

const FEATURES = [
  { icon: Wand2, t: "AI Script Generator", d: "Hindi, Hinglish, English. Hooks, CTAs, viral templates — written by Claude Sonnet." },
  { icon: Mic, t: "Indian Voices + Cloning", d: "ElevenLabs multilingual — Hindi male/female, Hinglish, and natural human voices." },
  { icon: Film, t: "Cinematic Scenes", d: "Auto-generated storyboards with camera, lighting, motion and B-roll directions." },
  { icon: Bot, t: "Talking Avatars", d: "Lip-synced AI hosts for ads, news, real estate and app promotions." },
  { icon: Languages, t: "Multi-language", d: "Write once, narrate in 3+ languages. Localize at the speed of thought." },
  { icon: Layers, t: "Brand Kit", d: "Logos, colours, fonts and watermarks — applied automatically across all renders." },
];

const VIDEO_TYPES = [
  "Cinematic Ads", "Product Ads", "Talking Avatars", "YouTube Shorts",
  "Instagram Reels", "TikTok Videos", "Educational", "Business Promo",
  "AI News", "Real Estate", "App Promotion", "E-commerce Ads",
];

const TRUSTED = ["aurora", "lumen", "northstar", "obsidian", "monolith", "kepler", "vertex", "halo", "atlas", "nyx"];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div data-testid="landing-page" className="min-h-screen bg-[#0A0A0B] text-white overflow-x-hidden">
      {/* NAV */}
      <header className="sticky top-0 z-50 glass safe-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <Link data-testid="brand-logo" to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-[#E2FF3D] grid place-items-center">
              <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
            </div>
            <span className="font-semibold text-base sm:text-lg tracking-tight">CineReel<span className="text-[#E2FF3D]">.</span>AI</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm text-zinc-400">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#types" className="hover:text-white">Video Types</a>
            <Link to="/pricing" className="hover:text-white">Pricing</Link>
            <a href="#how" className="hover:text-white">How it works</a>
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden sm:flex items-center gap-2 sm:gap-3">
            <Link data-testid="nav-login" to="/login" className="text-sm text-zinc-300 hover:text-white px-2">Log in</Link>
            <Link data-testid="nav-cta" to="/signup" className="btn-volt rounded-full px-3 sm:px-4 py-2 text-sm flex items-center gap-1.5 whitespace-nowrap">
              Start free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button data-testid="mobile-nav-toggle" onClick={() => setMenuOpen(v => !v)}
            aria-label="Toggle menu"
            className="sm:hidden text-zinc-300 hover:text-white p-2 -mr-1">
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu sheet */}
        {menuOpen && (
          <div data-testid="mobile-nav-sheet" className="sm:hidden border-t border-white/5 bg-[#0A0A0B]/95 backdrop-blur-xl px-4 py-4 space-y-3">
            <a href="#features" onClick={() => setMenuOpen(false)} className="block text-sm text-zinc-300 py-1.5">Features</a>
            <a href="#types" onClick={() => setMenuOpen(false)} className="block text-sm text-zinc-300 py-1.5">Video Types</a>
            <Link to="/pricing" onClick={() => setMenuOpen(false)} className="block text-sm text-zinc-300 py-1.5">Pricing</Link>
            <a href="#how" onClick={() => setMenuOpen(false)} className="block text-sm text-zinc-300 py-1.5">How it works</a>
            <div className="pt-2 border-t border-white/5 flex items-center gap-2">
              <Link to="/login" onClick={() => setMenuOpen(false)} className="flex-1 text-center text-sm py-2.5 rounded-full border border-white/15">Log in</Link>
              <Link to="/signup" onClick={() => setMenuOpen(false)} className="flex-1 text-center btn-volt rounded-full py-2.5 text-sm">Start free</Link>
            </div>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden grain">
        <div
          className="absolute inset-0 opacity-20 sm:opacity-30 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_BG})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0B]/60 via-[#0A0A0B]/80 to-[#0A0A0B]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-32 grid md:grid-cols-12 gap-8 md:gap-12 items-center">
          <div className="md:col-span-7 order-2 md:order-1">
            <div className="flex flex-wrap items-center gap-2 mb-4 sm:mb-6">
              <Badge><Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" /> v1 — Cinematic edition</Badge>
              <Badge>Hindi · Hinglish · English</Badge>
            </div>
            <h1 className="text-[34px] leading-[1.05] xs:text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight">
              Make cinema-grade <span className="text-[#E2FF3D]">ads & reels</span>{" "}
              in the time of a coffee break.
            </h1>
            <p className="mt-4 sm:mt-6 text-zinc-400 text-sm sm:text-base md:text-lg max-w-2xl leading-relaxed">
              CineReel turns one prompt — a product, a Play Store ID, a URL — into a viral-ready
              script, an Indian voiceover, a storyboard, and a finished social-ready video. Built for
              creators, marketers and agencies who refuse to look generic.
            </p>
            <div className="mt-6 sm:mt-10 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
              <Link data-testid="hero-cta-primary" to="/signup"
                className="btn-volt rounded-full px-5 sm:px-6 py-3 sm:py-3.5 flex items-center justify-center gap-2 text-sm sm:text-base">
                Create your first reel <ArrowRight className="w-4 h-4" />
              </Link>
              <Link data-testid="hero-cta-secondary" to="/login"
                className="px-5 sm:px-6 py-3 sm:py-3.5 rounded-full border border-white/15 hover:border-white/40 transition text-center text-sm sm:text-base">
                I already have an account
              </Link>
              <div className="flex items-center justify-center sm:justify-start gap-2 text-[11px] sm:text-xs text-zinc-500 pt-1">
                <ShieldCheck className="w-4 h-4" /> No credit card · 100 free credits
              </div>
            </div>
          </div>

          {/* Preview card — smaller on mobile, sits ABOVE headline for visual anchor */}
          <div className="md:col-span-5 relative order-1 md:order-2 mx-auto w-full max-w-[280px] sm:max-w-sm md:max-w-none">
            <div className="relative ar-916 surface rounded-2xl overflow-hidden">
              <img
                alt="preview"
                src="https://images.pexels.com/photos/2387873/pexels-photo-2387873.jpeg?auto=compress&cs=tinysrgb&w=800"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 bg-gradient-to-t from-black/90 to-transparent">
                <div className="label-mono text-[#E2FF3D] mb-1 text-[9px] sm:text-[11px]">SCENE 03 · DRONE PUSH-IN</div>
                <div className="text-xs sm:text-sm">"The future doesn't wait. Neither should you."</div>
              </div>
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 glass rounded-full px-2 sm:px-3 py-1 label-mono text-[9px] sm:text-[10px]">9:16 · 1080p</div>
            </div>
            <div className="absolute -bottom-4 -left-2 md:-bottom-6 md:-left-6 surface rounded-xl p-2.5 md:p-3 w-36 md:w-44 hidden sm:block">
              <div className="label-mono mb-1.5 md:mb-2 text-[10px]">VOICE</div>
              <div className="text-xs md:text-sm">Aanya · Hinglish</div>
              <div className="mt-1.5 md:mt-2 h-6 md:h-8 flex items-end gap-0.5">
                {[8,14,6,18,10,22,12,16,8,14,20,12,8,16,10,22,14,8,18,12].map((h,i)=>(
                  <div key={i} className="w-1 md:w-1.5 bg-[#E2FF3D]/80 rounded-sm" style={{ height: h+"px" }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* trusted ribbon */}
        <div className="relative border-y border-white/5 py-4 sm:py-6 overflow-hidden">
          <div className="flex gap-8 sm:gap-16 marquee-track whitespace-nowrap label-mono text-zinc-500 text-[10px] sm:text-[11px]">
            {[...TRUSTED, ...TRUSTED, ...TRUSTED].map((b, i) => (
              <span key={i}>★ {b.toUpperCase()}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
        <div className="grid md:grid-cols-12 gap-6 md:gap-8 mb-8 sm:mb-12">
          <div className="md:col-span-5">
            <div className="label-mono text-zinc-500 mb-2 sm:mb-3">/ 01 — FEATURES</div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-tight">
              An entire video studio,<br className="hidden sm:block"/> compressed into a sidebar.
            </h2>
          </div>
          <div className="md:col-span-6 md:col-start-7 text-sm sm:text-base text-zinc-400 leading-relaxed">
            Every block of the pipeline is rebuilt for the AI era — scripting, voicing, scene
            generation, captions and brand control. Move from idea to export without leaving the canvas.
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {FEATURES.map((f) => (
            <div key={f.t} className="surface rounded-xl p-5 sm:p-6 transition">
              <f.icon className="w-6 h-6 text-[#E2FF3D] mb-4 sm:mb-6" />
              <h3 className="text-lg sm:text-xl font-medium mb-2">{f.t}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* VIDEO TYPES */}
      <section id="types" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
        <div className="label-mono text-zinc-500 mb-2 sm:mb-3">/ 02 — WHAT YOU CAN MAKE</div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight mb-8 sm:mb-12 leading-tight">
          12 video formats. One canvas.
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {VIDEO_TYPES.map((v) => (
            <div key={v} className="surface rounded-lg p-4 sm:p-5 hover:bg-[#1C1C1F] transition cursor-default">
              <Zap className="w-4 h-4 text-[#E2FF3D] mb-2 sm:mb-3" />
              <div className="text-xs sm:text-sm font-medium">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
        <div className="label-mono text-zinc-500 mb-2 sm:mb-3">/ 03 — HOW IT WORKS</div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight mb-8 sm:mb-12 leading-tight">
          Four steps to a finished cut.
        </h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            ["Prompt", "Paste a URL, App ID or write a line."],
            ["Script", "Claude writes the hook, body, CTA & scenes."],
            ["Voice + Scenes", "ElevenLabs voiceover, Nano-Banana cinematic stills."],
            ["Export", "Download, share or push to socials."],
          ].map(([t, d], i) => (
            <div key={t} className="surface rounded-xl p-5 sm:p-6">
              <div className="label-mono text-[#E2FF3D] mb-3 sm:mb-4">STEP 0{i+1}</div>
              <h3 className="text-lg sm:text-xl font-medium mb-2">{t}</h3>
              <p className="text-sm text-zinc-400">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
        <div className="surface rounded-2xl sm:rounded-3xl p-8 sm:p-12 md:p-20 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 sm:w-96 sm:h-96 rounded-full bg-[#E2FF3D]/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight">
              Direct your first reel today.
            </h2>
            <p className="mt-4 sm:mt-6 text-zinc-400 text-sm sm:text-base md:text-lg">
              100 free credits. No card. Hindi, Hinglish, English from day one.
            </p>
            <Link data-testid="footer-cta" to="/signup"
              className="mt-6 sm:mt-10 inline-flex items-center gap-2 btn-volt rounded-full px-5 sm:px-6 py-3 sm:py-3.5 text-sm sm:text-base">
              Start free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 sm:py-10 safe-bottom">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs sm:text-sm text-zinc-500">
          <div>© 2026 CineReel AI. All rights reserved.</div>
          <div className="flex gap-4 sm:gap-6">
            <Link to="/pricing">Pricing</Link>
            <Link to="/login">Log in</Link>
            <Link to="/signup">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
