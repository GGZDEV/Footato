export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`brand-mark ${className}`.trim()}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Logo Footato"
    >
      <rect x="2" y="2" width="44" height="44" rx="4" fill="#d8ff63" />
      <path d="M8 8h32v32H8zM8 24h32M24 8v32" fill="none" stroke="#10232d" strokeWidth="1" opacity=".24" />
      <circle cx="24" cy="24" r="6.5" fill="none" stroke="#10232d" strokeWidth="1" opacity=".24" />
      <path
        d="M11 16h25m0 0-5-5m5 5-5 5M37 32H12m0 0 5 5m-5-5 5-5"
        fill="none"
        stroke="#10232d"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="2.3" fill="#10232d" />
    </svg>
  );
}
