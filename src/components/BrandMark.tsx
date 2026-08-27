export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`brand-mark ${className}`.trim()}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Logo Footato"
    >
      <rect x="2" y="2" width="44" height="44" rx="13" fill="#c8ff62" />
      <path
        d="M12 16h23m0 0-5-5m5 5-5 5M36 32H13m0 0 5 5m-5-5 5-5"
        fill="none"
        stroke="#101512"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="2.4" fill="#101512" />
    </svg>
  );
}
