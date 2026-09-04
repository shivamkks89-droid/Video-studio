import { useEffect, useMemo, useState } from "react";
import { Sparkles, Layers, Loader2, Copy, Wand2, Shield, Gauge } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

const PLATFORMS = [
  { id: "meta", label: "Meta (FB / IG feed)" },
  { id: "google", label: "Google Ads" },
  { id: "youtube", label: "YouTube Ads" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "snapchat", label: "Snapchat" },
  { id: "x", label: "X (Twitter)" },
  { id: "pinterest", label: "Pinterest" },
];

const CAMPAIGN_PRESETS = [
  "instagram_reel", "facebook_ad", "youtube_short", "youtube_ad",
  "tiktok", "linkedin_ad", "snapchat", "x",
];

const LANGS = ["english", "hindi", "hinglish"];
const TONES = ["professional", "friendly", "emotional", "motivational", "luxury", "ugc"];

export default function AdStudio() {
  const [topic, setTopic] = useState("");
  const [brand, setBrand] = useState("");
  const [hook, setHook] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("");
  const [language, setLanguage] = useState("hinglish");
  const [tone, setTone] = useState("professional");
  const [platforms, setPlatforms] = useState(["meta", "google", "youtube", "tiktok", "linkedin"]);
  const [length, setLength] = useState("medium");

  const [copyOut, setCopyOut] = useState(null);
  const [campaign, setCampaign] = useState([]);
  const [score, setScore] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [busy, setBusy] = useState({ copy: false, camp: false, score: false, comp: false });

  const togglePlat = (id) =>
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const genCopy = async () => {
    if (!topic.trim()) return toast.error("Add a topic first");
    setBusy((b) => ({ ...b, copy: true }));
    try {
      const { data } = await api.post("/ai/ad-copy", {
        topic, brand_name: brand || undefined, hook: hook || undefined,
        body: body || undefined, cta: cta || undefined,
        platforms, language, tone, length,
      });
      setCopyOut(data.platforms || {});
      toast.success("Ad copy generated");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Copy generation failed");
    } finally {
      setBusy((b) => ({ ...b, copy: false }));
    }
  };

  const genCampaign = async () => {
    if (!topic.trim()) return toast.error("Add a topic first");
    setBusy((b) => ({ ...b, camp: true }));
    try {
      const { data } = await api.post("/ai/campaign", {
        topic, hook: hook || undefined, body: body || undefined,
        cta: cta || undefined, language, platforms: CAMPAIGN_PRESETS,
      });
      setCampaign(data.campaign || []);
      toast.success(`${(data.campaign || []).length} platform variations`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Campaign failed");
    } finally {
      setBusy((b) => ({ ...b, camp: false }));
    }
  };

  const runScore = async () => {
    if (!hook.trim()) return toast.error("Enter a hook to score");
    setBusy((b) => ({ ...b, score: true }));
    try {
      const { data } = await api.post("/ai/creative-score", {
        hook, body: body || undefined, cta: cta || undefined,
        platform: platforms[0] || "meta", language,
      });
      setScore(data);
    } catch (e) {
      toast.error("Score failed");
    } finally {
      setBusy((b) => ({ ...b, score: false }));
    }
  };

  const runCompliance = async () => {
    const text = [hook, body, cta].filter(Boolean).join(" ");
    if (!text.trim()) return toast.error("Enter hook / body / CTA");
    setBusy((b) => ({ ...b, comp: true }));
    try {
      const { data } = await api.post("/ai/compliance", {
        text, platform: platforms[0] || "meta", language,
      });
      setCompliance(data);
    } catch (e) {
      toast.error("Compliance failed");
    } finally {
      setBusy((b) => ({ ...b, comp: false }));
    }
  };

  const cp = (t) => { navigator.clipboard.writeText(t); toast.success("Copied"); };

  return (
    <div data-testid="ad-studio" className="grid lg:grid-cols-12 gap-6">
      {/* INPUT */}
      <div className="lg:col-span-5 space-y-4">
        <div>
          <div className="label-mono text-zinc-500 mb-2">/ AD STUDIO</div>
          <h1 className="text-3xl font-semibold tracking-tight">Multi-platform ads, one workflow.</h1>
          <p className="text-zinc-400 text-sm mt-2">Generate copy, campaigns, scores & compliance for Meta / Google / YouTube / TikTok / LinkedIn / X / Snapchat / Pinterest.</p>
        </div>

        <div className="surface rounded-xl p-5 space-y-3">
          <Field label="Topic / Product">
            <input data-testid="ads-topic" value={topic} onChange={(e)=>setTopic(e.target.value)}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
              placeholder="A Hinglish fitness app for busy moms"/>
          </Field>
          <Field label="Brand name (optional)">
            <input data-testid="ads-brand" value={brand} onChange={(e)=>setBrand(e.target.value)}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
              placeholder="FitDidi"/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Language" value={language} setValue={setLanguage} options={LANGS} testid="ads-lang"/>
            <Select label="Tone" value={tone} setValue={setTone} options={TONES} testid="ads-tone"/>
          </div>
          <Field label="Existing hook / opener (optional)">
            <textarea data-testid="ads-hook" value={hook} onChange={(e)=>setHook(e.target.value)} rows={2}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none"
              placeholder="15 minutes. Fir bhi excuse?" />
          </Field>
          <Field label="Body / benefit (optional)">
            <textarea data-testid="ads-body" value={body} onChange={(e)=>setBody(e.target.value)} rows={2}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none"
              placeholder="Home workouts designed for Indian moms — no gym, no equipment." />
          </Field>
          <Field label="CTA (optional)">
            <input data-testid="ads-cta" value={cta} onChange={(e)=>setCta(e.target.value)}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
              placeholder="Try free for 7 days"/>
          </Field>
          <div>
            <div className="label-mono text-zinc-500 mb-2">Platforms</div>
            <div className="flex flex-wrap gap-2" data-testid="ads-platforms">
              {PLATFORMS.map((p) => (
                <button key={p.id} type="button" data-testid={`ads-plat-${p.id}`}
                  onClick={() => togglePlat(p.id)}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${
                    platforms.includes(p.id) ? "bg-[#E2FF3D] text-black font-semibold" : "surface"
                  }`}>{p.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="label-mono text-zinc-500 mb-2">Copy length</div>
            <div className="flex gap-2" data-testid="ads-length">
              {["short", "medium", "long"].map((l) => (
                <button key={l} data-testid={`ads-len-${l}`} onClick={()=>setLength(l)}
                  className={`rounded-full px-3 py-1 text-xs capitalize ${length===l ? "bg-[#E2FF3D] text-black" : "surface"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button data-testid="ads-gen-copy" onClick={genCopy} disabled={busy.copy}
              className="btn-volt rounded-full px-4 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {busy.copy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
              {busy.copy ? "Generating…" : "Generate Ad Copy (all selected platforms)"}
            </button>
            <button data-testid="ads-gen-campaign" onClick={genCampaign} disabled={busy.camp}
              className="rounded-full surface px-4 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {busy.camp ? <Loader2 className="w-4 h-4 animate-spin"/> : <Layers className="w-4 h-4"/>}
              {busy.camp ? "Building…" : "Build Full Multi-Platform Campaign"}
            </button>
            <div className="flex gap-2">
              <button data-testid="ads-score" onClick={runScore} disabled={busy.score}
                className="flex-1 rounded-full surface px-3 py-2 text-xs flex items-center justify-center gap-2 disabled:opacity-60">
                <Gauge className="w-3.5 h-3.5"/> {busy.score ? "…" : "Score creative"}
              </button>
              <button data-testid="ads-compliance" onClick={runCompliance} disabled={busy.comp}
                className="flex-1 rounded-full surface px-3 py-2 text-xs flex items-center justify-center gap-2 disabled:opacity-60">
                <Shield className="w-3.5 h-3.5"/> {busy.comp ? "…" : "Compliance check"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RESULTS */}
      <div className="lg:col-span-7 space-y-4">
        {copyOut && (
          <div className="surface rounded-xl p-5" data-testid="ads-copy-out">
            <div className="label-mono text-[#E2FF3D] mb-3">/ AD COPY</div>
            <div className="space-y-4">
              {Object.entries(copyOut).map(([plat, fields]) => (
                <div key={plat} className="rounded-lg border border-white/10 p-3 bg-[#0A0A0B]">
                  <div className="label-mono text-zinc-400 uppercase mb-2">{plat}</div>
                  <div className="space-y-2">
                    {Object.entries(fields || {}).map(([k, v]) => (
                      <div key={k} className="text-sm flex items-start gap-2">
                        <span className="label-mono text-zinc-500 min-w-[110px]">{k}</span>
                        <span className="flex-1 text-zinc-100">{v}</span>
                        <button onClick={()=>cp(String(v))} className="text-zinc-500 hover:text-white"><Copy className="w-3.5 h-3.5"/></button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {campaign.length > 0 && (
          <div className="surface rounded-xl p-5" data-testid="ads-campaign-out">
            <div className="label-mono text-[#E2FF3D] mb-3">/ MULTI-PLATFORM CAMPAIGN</div>
            <div className="grid md:grid-cols-2 gap-3">
              {campaign.map((c, i) => (
                <div key={i} className="rounded-lg border border-white/10 p-3 bg-[#0A0A0B]">
                  <div className="flex items-center justify-between mb-1">
                    <div className="label-mono text-[#E2FF3D] text-[10px]">{c.platform}</div>
                    <div className="label-mono text-zinc-500 text-[10px]">{c.aspect_ratio} · {c.duration_sec}s</div>
                  </div>
                  <div className="text-sm font-semibold mb-1">{c.hook}</div>
                  <div className="text-xs text-zinc-400 mb-2">{c.script}</div>
                  <div className="text-xs text-[#E2FF3D]">{c.cta}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {score && score.scores && (
          <div className="surface rounded-xl p-5" data-testid="ads-score-out">
            <div className="flex items-center justify-between mb-3">
              <div className="label-mono text-[#E2FF3D]">/ CREATIVE SCORE</div>
              <div className="text-2xl font-semibold">{score.overall || 0}<span className="text-sm text-zinc-500">/100</span></div>
            </div>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {Object.entries(score.scores).map(([k, v]) => (
                <div key={k} className="bg-[#0A0A0B] rounded p-2 border border-white/5">
                  <div className="label-mono text-zinc-500 text-[10px] uppercase">{k}</div>
                  <div className="text-xl font-semibold">{v.value}</div>
                  <div className="text-[10px] text-zinc-500 mt-1 line-clamp-2">{v.note}</div>
                </div>
              ))}
            </div>
            {score.suggestions?.length > 0 && (
              <div>
                <div className="label-mono text-zinc-400 mb-2">SUGGESTIONS</div>
                <div className="space-y-1.5">
                  {score.suggestions.map((s, i) => (
                    <div key={i} className="text-xs bg-[#141416] rounded p-2 flex items-start gap-2">
                      <span className="label-mono text-[#E2FF3D] text-[10px]">{s.axis}</span>
                      <span className="flex-1">{s.fix}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {compliance && (
          <div className="surface rounded-xl p-5" data-testid="ads-compliance-out">
            <div className="flex items-center gap-3 mb-3">
              <div className="label-mono text-[#E2FF3D]">/ COMPLIANCE</div>
              <div className={`text-xs px-2 py-1 rounded-full uppercase ${
                compliance.risk_level === "high" ? "bg-red-500/20 text-red-400" :
                compliance.risk_level === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                "bg-green-500/20 text-green-400"
              }`}>{compliance.risk_level} risk</div>
            </div>
            <div className="text-sm text-zinc-300 mb-3">{compliance.summary}</div>
            <div className="space-y-2">
              {(compliance.flags || []).map((f, i) => (
                <div key={i} className="bg-[#0A0A0B] border border-white/10 rounded p-3 text-xs">
                  <div className="text-red-400 mb-1">⚠ {f.snippet}</div>
                  <div className="text-zinc-500 mb-1">Reason: {f.reason}</div>
                  <div className="text-[#E2FF3D]">Safer: {f.safer}</div>
                </div>
              ))}
              {compliance.flags?.length === 0 && (
                <div className="text-xs text-zinc-500">No policy flags — looks safe to submit.</div>
              )}
            </div>
          </div>
        )}

        {!copyOut && !campaign.length && !score && !compliance && (
          <div className="surface rounded-xl p-10 text-center">
            <Wand2 className="w-8 h-8 text-zinc-700 mx-auto mb-3"/>
            <div className="text-zinc-400">Your ad copy & campaign variations will appear here.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="label-mono text-zinc-500 mb-2">{label}</div>
      {children}
    </div>
  );
}

function Select({ label, value, setValue, options, testid }) {
  return (
    <Field label={label}>
      <select data-testid={testid} value={value} onChange={(e)=>setValue(e.target.value)}
        className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none capitalize">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}
