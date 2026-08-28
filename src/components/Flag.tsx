/**
 * Inline SVG flags. Emoji flags are not an option: Windows ships no glyphs for
 * regional-indicator pairs (they fall back to the letters "ES", "FR"…) nor for
 * subdivision flags like England. These render identically everywhere.
 */
import type { ReactNode } from 'react';

const W = 24;
const H = 16;

/** Horizontal bands, top to bottom, with equal-height default. */
const bands = (colors: string[]) =>
  colors.map((c, i) => (
    <rect key={i} x={0} y={(H / colors.length) * i} width={W} height={H / colors.length} fill={c} />
  ));

/** Vertical bands, left to right. */
const stripes = (colors: string[]) =>
  colors.map((c, i) => (
    <rect key={i} x={(W / colors.length) * i} y={0} width={W / colors.length} height={H} fill={c} />
  ));

const ART: Record<string, ReactNode> = {
  // St George's cross — the bar is one fifth of the flag height.
  eng: (
    <>
      <rect width={W} height={H} fill="#ffffff" />
      <rect x={10.4} y={0} width={3.2} height={H} fill="#ce1124" />
      <rect x={0} y={6.4} width={W} height={3.2} fill="#ce1124" />
    </>
  ),
  // Bandes 1:2:1, sans les armoiries : invisibles à cette taille.
  es: (
    <>
      <rect width={W} height={H} fill="#f1bf00" />
      <rect x={0} y={0} width={W} height={4} fill="#aa151b" />
      <rect x={0} y={12} width={W} height={4} fill="#aa151b" />
    </>
  ),
  it: <>{stripes(['#009246', '#f1f2f1', '#ce2b37'])}</>,
  de: <>{bands(['#000000', '#dd0000', '#ffce00'])}</>,
  fr: <>{stripes(['#002395', '#ffffff', '#ed2939'])}</>,
  pt: (
    <>
      <rect width={W} height={H} fill="#da291c" />
      <rect x={0} y={0} width={9.6} height={H} fill="#006600" />
      <circle cx={9.6} cy={8} r={3.3} fill="#ffe900" stroke="#c8102e" strokeWidth={0.7} />
    </>
  ),
  nl: <>{bands(['#ae1c28', '#ffffff', '#21468b'])}</>,
  ru: <>{bands(['#ffffff', '#0039a6', '#d52b1e'])}</>,
  // Le champ vert et le sabre. La shahada qui le surmonte est illisible à
  // 24×16 : la rendre en traits produirait une tache grise, pas une écriture.
  // Même parti pris que pour les armoiries espagnoles et portugaises.
  sa: (
    <>
      <rect width={W} height={H} fill="#165d31" />
      <rect x={4} y={9.6} width={15} height={1.1} rx={0.55} fill="#ffffff" />
      <path d="M19 10.15 L16.6 8.5 L16.6 11.8 Z" fill="#ffffff" />
      <rect x={3.4} y={8.8} width={1.1} height={2.7} rx={0.5} fill="#ffffff" />
    </>
  ),
};

/** Window markers, drawn rather than typed so they match the flags' weight. */
const MARKERS: Record<string, ReactNode> = {
  summer: (
    <g stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" fill="none">
      <circle cx={12} cy={8} r={3} fill="currentColor" stroke="none" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={12 + Math.cos(a) * 5} y1={8 + Math.sin(a) * 5}
            x2={12 + Math.cos(a) * 6.8} y2={8 + Math.sin(a) * 6.8}
          />
        );
      })}
    </g>
  ),
  winter: (
    <g stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" fill="none">
      {[0, 60, 120].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const dx = Math.cos(a) * 6.6;
        const dy = Math.sin(a) * 6.6;
        return (
          <g key={deg}>
            <line x1={12 - dx} y1={8 - dy} x2={12 + dx} y2={8 + dy} />
            <line x1={12 + dx} y1={8 + dy} x2={12 + dx * 0.55 + dy * 0.3} y2={8 + dy * 0.55 - dx * 0.3} />
            <line x1={12 - dx} y1={8 - dy} x2={12 - dx * 0.55 + dy * 0.3} y2={8 - dy * 0.55 - dx * 0.3} />
          </g>
        );
      })}
    </g>
  ),
};

/** Default accessible names, so callers rarely need to pass one. */
const NAMES: Record<string, string> = {
  eng: 'Angleterre', es: 'Espagne', it: 'Italie', de: 'Allemagne',
  fr: 'France', pt: 'Portugal', nl: 'Pays-Bas', ru: 'Russie', sa: 'Arabie saoudite',
  summer: 'Mercato d’été', winter: 'Mercato d’hiver',
};

export function Flag({ code, label }: { code: string; label?: string }) {
  const name = label ?? NAMES[code] ?? code;
  const art = ART[code];
  if (art) {
    return (
      <svg className="flag" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={name}>
        {art}
      </svg>
    );
  }
  const marker = MARKERS[code];
  if (marker) {
    return (
      <svg className="flag marker" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={name}>
        {marker}
      </svg>
    );
  }
  return null;
}
