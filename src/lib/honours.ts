import type { HonourTitle } from './types';

export type TrophyFamily = 'league' | 'domestic' | 'continental';

export interface TitlePointBreakdown {
  league: number;
  domestic: number;
  continental: number;
}

const LEAGUE_WEIGHTS: Record<string, number> = {
  PL: 6,
  PD: 5.5,
  BL1: 5,
  SA: 5,
  FL1: 4,
  PPL: 3,
  DED: 3,
};

/**
 * A deliberately small, product-facing scale: it separates levels of sporting
 * difficulty without pretending to be an official UEFA coefficient.
 */
export function titleWeight(title: Pick<HonourTitle, 'competitionCode' | 'category'>): number {
  if (title.category === 'league') return LEAGUE_WEIGHTS[title.competitionCode] ?? 3;
  if (title.category === 'championsLeague') return 10;
  if (title.category === 'europaLeague') return 5;
  if (title.category === 'conferenceLeague') return 3;
  if (title.category === 'world') return 5;
  if (title.category === 'domesticCup') return 2;
  if (title.category === 'leagueCup') return 1.25;
  if (title.category === 'uefaSupercup') return 1.5;
  return 0.5;
}

export function trophyFamily(category: HonourTitle['category']): TrophyFamily {
  if (category === 'league') return 'league';
  if (category === 'domesticCup' || category === 'leagueCup' || category === 'domesticSupercup') return 'domestic';
  return 'continental';
}

export const WEIGHT_LEGEND = [
  { label: 'Ligue des champions', points: 10 },
  { label: 'Premier League', points: 6 },
  { label: 'LaLiga', points: 5.5 },
  { label: 'Serie A · Bundesliga', points: 5 },
  { label: 'Ligue 1', points: 4 },
  { label: 'Liga Portugal · Eredivisie', points: 3 },
  { label: 'Europa League · titre mondial', points: 5 },
  { label: 'Conference League', points: 3 },
  { label: 'Coupe nationale', points: 2 },
  { label: 'Coupe de la Ligue', points: 1.25 },
  { label: 'Supercoupe UEFA', points: 1.5 },
  { label: 'Supercoupe nationale', points: 0.5 },
] as const;
