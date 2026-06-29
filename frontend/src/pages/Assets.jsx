import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Assets() {
  const [data, setData] = useState({ images: [], music: [], icons: [], stickers: [] });
  const [avatars, setAvatars] = useState([]);
  useEffect(() => {
    api.get("/catalog/assets").then(({ data }) => setData(data));
    api.get("/catalog/avatars").then(({ data }) => setAvatars(data));
  }, []);
  return (
    <div data-testid="assets-page" className="space-y-8">
      <div>
        <div className="label-mono text-zinc-500 mb-2">/ AI ASSETS LIBRARY</div>
        <h1 className="text-4xl font-semibold tracking-tight">Stock-grade, AI-curated.</h1>
      </div>

      <Section title="AI Avatars">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {avatars.map(a => (
            <div key={a.id} data-testid={`avatar-${a.id}`} className="surface rounded-xl overflow-hidden">
              <div className="ar-11 relative bg-[#1C1C1F]">
                <img src={a.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
              </div>
              <div className="p-2.5">
                <div className="text-sm font-medium">{a.name}</div>
                <div className="label-mono text-zinc-500 mt-0.5">{a.style}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="AI Images">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.images.map((src, i) => (
            <div key={i} className="surface rounded-xl overflow-hidden">
              <div className="ar-169 relative"><img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" /></div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Background Music">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {data.music.map(m => (
            <div key={m.id} className="surface rounded-xl p-4">
              <div className="font-medium">{m.title}</div>
              <div className="label-mono text-zinc-500 mt-1">{m.mood} · {m.duration}s</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Stickers">
        <div className="flex flex-wrap gap-2">
          {data.stickers.map(s => (
            <span key={s} className="surface rounded-full px-3 py-1.5 text-xs label-mono text-[#E2FF3D]">{s}</span>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="label-mono text-zinc-500 mb-3">/ {title.toUpperCase()}</div>
      {children}
    </div>
  );
}
