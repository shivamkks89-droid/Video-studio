export const ShotHeadlineEditor = ({ items, setItems, showPoints }) => {
  const setItem = (i, k, v) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const cls = "bg-[#0A0A0B] border border-white/10 rounded-md px-2 py-1.5 text-xs outline-none focus:border-white/30";
  return (
    <div className="space-y-2" data-testid="shots-headlines">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="label-mono text-zinc-600 text-[10px] pt-2.5 w-5">{String(i + 1).padStart(2, "0")}</span>
          <div className="flex-1 grid sm:grid-cols-2 gap-1.5">
            <input data-testid={`shots-headline-${i}`} value={it.headline} maxLength={60} placeholder="Headline"
              onChange={(e) => setItem(i, "headline", e.target.value)} className={cls} />
            <input data-testid={`shots-sub-${i}`} value={it.sub} maxLength={80} placeholder="Sub-line (optional)"
              onChange={(e) => setItem(i, "sub", e.target.value)} className={cls} />
            {showPoints && (
              <input data-testid={`shots-points-${i}`} value={it.points || ""} maxLength={90}
                placeholder="3 callouts, comma se alag" onChange={(e) => setItem(i, "points", e.target.value)}
                className={`${cls} sm:col-span-2`} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
