export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`brand-mark ${className}`.trim()}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Logo Footato"
    >
      <defs>
        <linearGradient id="footato-gradient" x1="6" y1="4" x2="43" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#50E3B3" />
          <stop offset="1" stopColor="#168BFF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#footato-gradient)" />
      <path
        d="M13 33.5V28m7.3 5.5V23.7m7.4 9.8V19.8m7.3 13.7V14.2"
        fill="none"
        stroke="#071714"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path
        d="M11.8 15.8c3.2-3.4 7.5-5.3 12.2-5.3 3.8 0 7.4 1.3 10.2 3.6"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity=".92"
      />
      <circle cx="35" cy="14.2" r="3.4" fill="white" />
    </svg>
  );
}
