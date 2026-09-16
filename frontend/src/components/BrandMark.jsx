// Reusable Volt-Play brand mark for the header + splash + auth pages.
// Renders a small rounded tile with the layered lime chevrons + accent dot.
export default function BrandMark({ size = 32, showDot = true, className = "" }) {
  const s = size;
  const stroke = Math.max(3, s * 0.06);
  const px = (n) => (n * s) / 100;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={s}
      height={s}
      viewBox="0 0 100 100"
      role="img"
      aria-label="CineReel"
      className={className}
    >
      <defs>
        <linearGradient id={`bm-v-${s}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#F0FF66" />
          <stop offset="55%"  stopColor="#E2FF3D" />
          <stop offset="100%" stopColor="#BFDD22" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="22" fill="#0A0A0B" />
      {/* Back chevron */}
      <path
        d="M 22 30 L 39 30 L 55 55 L 39 80 L 22 80 L 38 55 Z"
        fill="#BFDD22"
        opacity="0.55"
      />
      {/* Front chevron */}
      <path
        d="M 34 22 L 51 22 L 68 52 L 51 82 L 34 82 L 51 52 Z"
        fill={`url(#bm-v-${s})`}
      />
      {showDot && (
        <>
          <circle cx="78" cy="80" r="4.2" fill="#E2FF3D" opacity="0.18" />
          <circle cx="78" cy="80" r="2.6" fill="#E2FF3D" />
        </>
      )}
    </svg>
  );
}
