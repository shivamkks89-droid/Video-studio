const DELIVERY = [
  ["natural", "Natural Conversation"], ["cinematic", "Cinematic Story"], ["emotional", "Emotional"],
  ["energetic_ad", "Energetic Ad"], ["commercial", "Professional Commercial"], ["devotional", "Devotional"], ["reel", "Social Reel"],
];

export const DeliveryPicker = ({ delivery, setDelivery, speed, setSpeed }) => (
  <div data-testid="delivery-picker" className="mb-3">
    <div className="label-mono text-zinc-500 mb-1.5">Delivery style</div>
    <div className="flex flex-wrap gap-1.5">
      {DELIVERY.map(([v, l]) => (
        <button key={v} type="button" data-testid={`delivery-${v}`} onClick={() => setDelivery(delivery === v ? "" : v)}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${delivery === v ? "bg-[#E2FF3D] text-black border-[#E2FF3D]" : "border-white/15 hover:border-white/40"}`}>{l}</button>
      ))}
    </div>
    <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">Speed {speed.toFixed(2)}x
      <input data-testid="voice-speed" type="range" min="0.7" max="1.2" step="0.05" value={speed}
        onChange={(e) => setSpeed(+e.target.value)} className="flex-1 accent-[#E2FF3D]" />
    </label>
  </div>
);
