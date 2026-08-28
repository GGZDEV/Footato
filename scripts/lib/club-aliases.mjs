/**
 * One club, one identity — across every origin.
 *
 * Footato reads clubs from three places that spell them differently: the
 * historical CSV baseline, the maintained import (which increasingly uses legal
 * entity names), and Transfermarkt's own pages (which use display names). Left
 * alone, "1. FC Köln" and "1.FC Köln" become two clubs, and a club's history
 * splits in half the season a new origin takes over.
 *
 * Club ids are part of shareable URLs and are never recycled, so the target of
 * an alias is always the name that already carries the history — even when the
 * newer spelling is the better one. Losing a link is worse than an imperfect
 * label.
 *
 * This list is deliberately explicit rather than fuzzy. Normalising names
 * aggressively enough to merge "FC Rostov" with "FK Rostov" would also merge
 * clubs that are genuinely distinct, and a wrongly merged club is invisible in
 * the output: it just looks like a club that bought more than it did.
 */

/** Legal or alternative names emitted by dcaribou/transfermarkt-datasets. */
const IMPORT_ALIASES = {
  '1.FC Köln': '1. FC Köln',
  'AO FK Zenit Sankt-Peterburg': 'Zenit St. Petersburg',
  'Associazione Sportiva Roma': 'AS Roma',
  'Bologna Football Club 1909': 'Bologna FC 1909',
  'Como 1907': 'Como Calcio',
  'Bolton Wanderers FC': 'Bolton Wanderers',
  'Bristol City FC': 'Bristol City',
  'Derby County FC': 'Derby County',
  'FC Khimki (-2025)': 'FK Khimki',
  'FC Orenburg': 'FK Orenburg',
  'FC Rubin Kazan': 'Rubin Kazan',
  'FC Twente Enschede': 'Twente Enschede FC',
  'FK Baltika': 'Baltika Kaliningrad',
  'FK Dinamo Moskva': 'Dinamo Moscow',
  'FK Nizhny Novgorod': 'FC Pari Nizhniy Novgorod',
  'FK Sochi': 'FC Sochi',
  'FK Spartak Moskva': 'Spartak Moscow',
  'Fortuna Sittardia Combinatie': 'Fortuna Sittard',
  'Le Havre AC': 'AC Le Havre',
  'PFK CSKA Moskva': 'CSKA Moscow',
  'Preston North End FC': 'Preston North End',
  'PFK Krylya Sovetov Samara': 'Krylya Sovetov Samara',
  'RFK Akhmat Grozny': 'Akhmat Grozny',
  'Società Sportiva Lazio S.p.A.': 'SS Lazio',
  'Футбольный клуб "Локомотив" Москва': 'Lokomotiv Moscow',

  // Saudi Arabia, where the import spells out full legal names and Transfermarkt
  // uses the everyday ones. The direction is reversed here compared with the
  // European clubs above: those keep their historical spelling because published
  // URLs already point at it, whereas the Saudi league entered Footato with the
  // collector, so nothing depends on the legal names and the readable ones win.
  'Al-Ahli Saudi Football Club': 'Al-Ahli SFC',
  'Al-Ettifaq Football Club': 'Al-Ettifaq FC',
  'Al-Fateh Club': 'Al-Fateh SC',
  'Al-Hazem Sport Club': 'Al-Hazem SC',
  'Al-Hilal Saudi Football Club': 'Al-Hilal SFC',
  'Al-Ittihad Football Club': 'Al-Ittihad Club',
  'Al-Khaleej Club (Saihat)': 'Al-Khaleej FC',
  'Al-Nassr Football Club': 'Al-Nassr FC',
  'Al-Qadsiah Saudi Football Club': 'Al-Qadsiah FC',
  'Al-Riyadh Saudi Club': 'Al-Riyadh SC',
  'Al-Shabab Club': 'Al-Shabab FC',
  'Al-Taawoun Football Club': 'Al-Taawoun FC',
  'Neom Sports Club': 'NEOM SC',
};

/**
 * Display names read straight off Transfermarkt by the first-party collector.
 *
 * Every entry here was found by comparing the collected season against the
 * registry, not guessed: each one is a club whose history would otherwise
 * restart at the season the collector took over. The Russian clubs alternate
 * between the FK and FC transliterations.
 *
 * The Saudi clubs are handled the other way round, in IMPORT_ALIASES above.
 */
const COLLECTOR_ALIASES = {
  '1.FC Köln': '1. FC Köln',
  'Como 1907': 'Como Calcio',
  'Deportivo A Coruña': 'Deportivo de La Coruña',
  'FC Krasnodar': 'FK Krasnodar',
  'FC Orenburg': 'FK Orenburg',
  'FC Rostov': 'FK Rostov',
  'FC Twente Enschede': 'Twente Enschede FC',
  'Le Havre AC': 'AC Le Havre',
};

/**
 * Both sets share a target vocabulary and their keys do not conflict, so one
 * map serves both origins. Applying the whole map everywhere is harmless: a key
 * an origin never emits simply never matches.
 */
export const CLUB_ALIASES = new Map(Object.entries({ ...IMPORT_ALIASES, ...COLLECTOR_ALIASES }));

/** Resolves a raw club name to the identity that owns its history. */
export const canonicalClubName = (name) => {
  const trimmed = String(name ?? '').trim();
  return CLUB_ALIASES.get(trimmed) ?? trimmed;
};
