/**
 * First-party Transfermarkt collector: HTTP client and parser.
 *
 * Footato used to depend entirely on third-party rebuilds of Transfermarkt
 * (ewenme, dcaribou). Both are snapshots someone else refreshes, and when
 * dcaribou's scraper was blocked in July 2026 the site silently kept serving a
 * mercato that was 90% missing. This module removes that single point of
 * failure for the season currently in progress.
 *
 * Design constraints, in priority order:
 *
 * 1. Never publish a partial window. A blocked or truncated page raises; it is
 *    never written out as "the league had few transfers".
 * 2. Stay small. One request returns an entire league-season-window, so a full
 *    refresh of ten leagues costs ~20 requests, not the hundreds of thousands a
 *    world crawl needs. Volume is what trips bot detection, so the cheapest
 *    defence is not needing the volume.
 * 3. Emit the vocabulary the existing pipeline already parses. The fee labels
 *    Transfermarkt renders ('free transfer', 'loan transfer', 'End of loan...',
 *    'Loan fee:...', '25.00m', '?', '-') are exactly the ones classify() in
 *    build-dataset.mjs understands, so collected rows and imported rows are
 *    classified by one single code path.
 */

const BLOCK_MARKERS = [
  'processbrowsercheck',
  'human verification',
  'captcha-delivery',
  'datadome',
  'enable javascript and then reload',
];
const BLOCKED_STATUS = new Set([202, 403, 405, 429]);

export const BASE = 'https://www.transfermarkt.com';

/** Matches the block signatures measured on Transfermarkt's DataDome edge. */
export function looksBlocked(status, body) {
  if (BLOCKED_STATUS.has(status)) return true;
  const head = body.slice(0, 20_000).toLowerCase();
  return BLOCK_MARKERS.some((marker) => head.includes(marker));
}

export class BlockedError extends Error {
  constructor(url, status) {
    super(`acces refuse par Transfermarkt (HTTP ${status}) : ${url}`);
    this.name = 'BlockedError';
    this.url = url;
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polite sequential fetcher.
 *
 * `delayMs` is applied *between* requests rather than as a token bucket: at this
 * volume a fixed spacing is both simpler and gentler than bursting.
 *
 * When BRIGHTDATA_API_KEY is present a blocked response is retried once through
 * the Web Unlocker, mirroring what transfermarkt-scraper does. It is optional on
 * purpose: from a residential address the direct request succeeds, and a paid
 * proxy should never be a requirement for the pipeline to run.
 */
export class TransfermarktClient {
  constructor({ delayMs = 3_000, retries = 3, timeoutMs = 60_000, userAgent, log = () => {} } = {}) {
    this.delayMs = delayMs;
    this.retries = retries;
    this.timeoutMs = timeoutMs;
    this.userAgent = userAgent
      ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    this.log = log;
    this.lastRequestAt = 0;
    this.requestCount = 0;
    this.unlockerCount = 0;
    this.brightDataKey = process.env.BRIGHTDATA_API_KEY || '';
    this.brightDataZone = process.env.BRIGHTDATA_ZONE || 'web_unlocker1';
  }

  async space() {
    const waitFor = this.delayMs - (Date.now() - this.lastRequestAt);
    if (waitFor > 0) await sleep(waitFor);
    this.lastRequestAt = Date.now();
  }

  async direct(url) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });
    return { status: response.status, body: await response.text() };
  }

  async viaUnlocker(url) {
    const response = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.brightDataKey}`,
      },
      body: JSON.stringify({ zone: this.brightDataZone, url, format: 'raw' }),
    });
    if (!response.ok) throw new Error(`Web Unlocker HTTP ${response.status}`);
    this.unlockerCount++;
    return { status: 200, body: await response.text() };
  }

  async get(url) {
    let lastError;
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      await this.space();
      try {
        this.requestCount++;
        let { status, body } = await this.direct(url);

        if (looksBlocked(status, body)) {
          if (!this.brightDataKey) throw new BlockedError(url, status);
          this.log(`    blocage detecte (HTTP ${status}) - bascule Web Unlocker`);
          ({ status, body } = await this.viaUnlocker(url));
          if (looksBlocked(status, body)) throw new BlockedError(url, status);
        }

        if (status !== 200) throw new Error(`HTTP ${status}`);
        // A truncated response parses into zero clubs and would look like an
        // empty mercato, so length is checked before the parser ever sees it.
        if (body.length < 20_000) throw new Error(`reponse tronquee (${body.length} octets)`);
        return body;
      } catch (error) {
        lastError = error;
        // A block does not get better by retrying the same way; surface it now
        // so the operator sees the real cause instead of three timeouts.
        if (error instanceof BlockedError) throw error;
        if (attempt < this.retries) {
          this.log(`    tentative ${attempt}/${this.retries} echouee (${error.message}), nouvel essai`);
          await sleep(attempt * 2_000);
        }
      }
    }
    throw new Error(`${url} : ${lastError?.message ?? 'echec inconnu'}`);
  }
}

/* --------------------------------- parsing -------------------------------- */

const stripTags = (html) => String(html ?? '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

/** Splits a <tbody> into its top-level <tr> blocks. */
function tableRows(tableHtml) {
  const body = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!body) return [];
  return [...body[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
}

/** Splits a <tr> into its <td> blocks, keeping inner markup. */
function rowCells(rowHtml) {
  return [...rowHtml.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
    .map((m) => ({ attrs: m[1], html: m[2] }));
}

/**
 * Splits markup into its OUTERMOST blocks of one tag, tracking nesting depth.
 *
 * The latest-transfers listing nests a whole <table> — rows and cells included —
 * inside several of its cells. A non-greedy regex ends the first block at the
 * first inner closing tag, which shifts every column by one. That is the worst
 * kind of failure here: the row still parses, it just reports the wrong club.
 */
function splitTopLevel(html, tagName) {
  const blocks = [];
  const tag = new RegExp(`<(/?)${tagName}(\\s[^>]*)?>`, 'gi');
  let depth = 0;
  let start = 0;
  let attrs = '';
  let match;
  while ((match = tag.exec(html))) {
    if (match[1] === '/') {
      depth--;
      if (depth === 0) blocks.push({ attrs, html: html.slice(start, match.index) });
    } else {
      if (depth === 0) { start = match.index + match[0].length; attrs = match[2] ?? ''; }
      depth++;
    }
  }
  return blocks;
}

const topLevelCells = (rowHtml) => splitTopLevel(rowHtml, 'td');

const cellByClass = (cells, name) => cells.find((c) => new RegExp(`class="[^"]*\\b${name}\\b`).test(c.attrs));

/**
 * Normalises a rendered fee cell into the label vocabulary build-dataset.mjs
 * classifies, plus the numeric amount in millions of euros.
 *
 * Transfermarkt writes loan fees across two lines ('Loan fee:' then the amount)
 * and abbreviates thousands as 'k'; the historical CSV baseline writes
 * 'Loan fee:275Th.'. Emitting the baseline spelling keeps one classifier for
 * both origins instead of teaching it a second dialect.
 */
export function normaliseFee(rawHtml) {
  const text = stripTags(rawHtml);
  if (!text) return { fee: '?', cleaned: 'NA', euros: null };

  const money = text.match(/€\s*([\d.,]+)\s*(bn|m|k)?/i);
  const toEuros = () => {
    if (!money) return null;
    const value = Number.parseFloat(money[1].replace(/,/g, ''));
    if (!Number.isFinite(value)) return null;
    const unit = (money[2] || '').toLowerCase();
    if (unit === 'bn') return value * 1_000_000_000;
    if (unit === 'm') return value * 1_000_000;
    if (unit === 'k') return value * 1_000;
    return value;
  };
  const spell = (euros) => (euros >= 1_000_000
    ? `€${(euros / 1_000_000).toFixed(2)}m`
    : `€${Math.round(euros / 1_000)}Th.`);
  const millions = (euros) => String(Number((euros / 1_000_000).toFixed(3)));

  if (/^loan fee/i.test(text)) {
    const euros = toEuros();
    if (euros == null || euros <= 0) return { fee: 'loan transfer', cleaned: '0', euros: 0 };
    return { fee: `Loan fee:${spell(euros)}`, cleaned: millions(euros), euros };
  }
  if (/^end of loan/i.test(text)) return { fee: text, cleaned: '0', euros: 0 };
  if (/^free transfer$/i.test(text)) return { fee: 'free transfer', cleaned: '0', euros: 0 };
  if (/^loan transfer$/i.test(text)) return { fee: 'loan transfer', cleaned: '0', euros: 0 };
  if (text === '?' || text === '-') return { fee: text, cleaned: 'NA', euros: null };

  const euros = toEuros();
  if (euros != null && euros > 0) return { fee: spell(euros), cleaned: millions(euros), euros };
  // Unknown wording is reported as unavailable rather than guessed at zero: it
  // then counts in the completeness denominator instead of deflating a total.
  return { fee: '?', cleaned: 'NA', euros: null };
}

/**
 * Parses one competition transfers page.
 *
 * The page is a sequence of club boxes; each box holds an 'In' table and an
 * 'Out' table whose first header cell literally reads In or Out. The club list
 * of the box headers is the competition's composition for that season, which is
 * why this single request also yields league membership.
 */
export function parseCompetitionTransfers(html) {
  const clubs = [];
  const movements = [];

  const boxes = [...html.matchAll(
    /<h2 class="content-box-headline[^"]*"\s+id="to-(\d+)">([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2 class="content-box-headline[^"]*"\s+id="to-\d+">|$)/g,
  )];

  for (const [, clubId, headline, body] of boxes) {
    const anchors = [...headline.matchAll(/<a[^>]*href="[^"]*\/verein\/\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
    const clubName = stripTags(anchors.at(-1)?.[1] ?? '');
    if (!clubName) continue;
    clubs.push({ id: clubId, name: clubName });

    for (const table of body.matchAll(/<div class="responsive-table">([\s\S]*?)<\/table>/g)) {
      const tableHtml = table[1];
      const firstHeader = tableHtml.match(/<th[^>]*>\s*([^<]*?)\s*<\/th>/i);
      const label = (firstHeader?.[1] ?? '').trim().toLowerCase();
      const movement = label === 'in' ? 'in' : label === 'out' ? 'out' : null;
      if (!movement) continue;

      for (const rowHtml of tableRows(tableHtml)) {
        const cells = rowCells(rowHtml);
        if (cells.length < 4) continue;

        const playerCell = cells[0];
        const playerId = playerCell.html.match(/\/profil\/spieler\/(\d+)/)?.[1] ?? '';
        const playerName = stripTags(playerCell.html.match(/<a[^>]*title="([^"]*)"/)?.[1] ?? '')
          || stripTags(playerCell.html);
        if (!playerName) continue;

        const feeCell = cells.at(-1);
        const transferId = feeCell.html.match(/\/transfer_id\/(\d+)/)?.[1] ?? '';
        const { fee, cleaned } = normaliseFee(feeCell.html);

        const counterpartCell = cellByClass(cells, 'verein-flagge-transfer-cell') ?? cells.at(-2);
        const counterpartId = counterpartCell?.html.match(/\/verein\/(\d+)/)?.[1] ?? '';
        // The abbreviated anchor text ('Newcastle') is the display name; the
        // title attribute carries the full one the rest of the pipeline joins on.
        const counterpartName = stripTags(counterpartCell?.html.match(/<a[^>]*title="([^"]*)"/)?.[1] ?? '')
          || stripTags(counterpartCell?.html ?? '');
        const counterpartCountry = stripTags(
          counterpartCell?.html.match(/<img[^>]*class="flaggenrahmen"[^>]*title="([^"]*)"/)?.[1]
          ?? counterpartCell?.html.match(/<img[^>]*title="([^"]*)"[^>]*class="flaggenrahmen"/)?.[1]
          ?? '',
        );

        movements.push({
          clubId,
          clubName,
          movement,
          playerId,
          playerName,
          age: stripTags(cellByClass(cells, 'alter-transfer-cell')?.html ?? ''),
          position: stripTags(cellByClass(cells, 'pos-transfer-cell')?.html ?? ''),
          marketValue: stripTags(cellByClass(cells, 'mw-transfer-cell')?.html ?? ''),
          counterpartId,
          counterpartName,
          counterpartCountry,
          fee,
          feeCleaned: cleaned,
          transferId,
        });
      }
    }
  }

  return { clubs, movements };
}

/**
 * Parses the "Latest transfers" listing, which the competition pages do not
 * provide: it is the only view carrying a transfer DATE.
 *
 * Footato uses it to answer one question — which recent moves are actually in
 * the published data. Dates make "the collection is up to date" checkable
 * instead of merely asserted, and the transfer id lets each row be matched
 * exactly against what was collected, with no name guessing.
 *
 * Row layout: player, age, nationality, club left, club joined, transfer date,
 * market value, fee. Several of those cells nest a table, hence topLevelCells.
 */
export function parseLatestTransfers(html) {
  const transfers = [];

  for (const row of splitTopLevel(html, 'tr')) {
    const rowHtml = row.html;
    // Only result rows carry the fee jumplist; everything else on the page is
    // the filter form, which would otherwise parse into empty transfers.
    if (!rowHtml.includes('/jumplist/transfers/')) continue;

    const cells = topLevelCells(rowHtml);
    if (cells.length < 8) continue;

    const [playerCell, ageCell, , leftCell, joinedCell, dateCell, valueCell, feeCell] = cells;

    const playerId = playerCell.html.match(/\/profil\/spieler\/(\d+)/)?.[1] ?? '';
    const playerName = stripTags(playerCell.html.match(/<a[^>]*title="([^"]*)"/)?.[1] ?? '');
    if (!playerName) continue;

    /**
     * A club cell holds two links to the same club — the crest, then the name —
     * and then its competition. The crest link is skipped in favour of the one
     * carrying visible text: Transfermarkt doubles the title attribute on some
     * crest anchors (`title="Without ClubWithout Club"`), and the text link is
     * the one meant to be read.
     */
    const club = (cellHtml) => {
      const anchors = [...cellHtml.matchAll(/<a([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
        href: m[1].match(/href="([^"]*)"/)?.[1] ?? '',
        // The crest anchor's title is unreliable, so it is only read off the
        // anchor that also carries text.
        title: stripTags(m[1].match(/title="([^"]*)"/)?.[1] ?? ''),
        text: stripTags(m[2]),
      }));
      const clubAnchors = anchors.filter((a) => a.href.includes('/verein/'));
      const clubAnchor = clubAnchors.find((a) => a.text) ?? clubAnchors[0];
      const leagueAnchor = anchors.find((a) => a.href.includes('/wettbewerb/'));
      return {
        id: clubAnchor?.href.match(/\/verein\/(\d+)/)?.[1] ?? '',
        // Full name where the listing gives one, abbreviation otherwise.
        name: clubAnchor?.title || clubAnchor?.text || '',
        leagueId: leagueAnchor?.href.match(/\/wettbewerb\/([A-Z0-9]+)/)?.[1] ?? '',
        leagueName: leagueAnchor?.title || leagueAnchor?.text || '',
      };
    };

    const rawDate = stripTags(dateCell.html);
    const parts = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const { fee, cleaned } = normaliseFee(feeCell.html);

    transfers.push({
      transferId: feeCell.html.match(/\/transfer_id\/(\d+)/)?.[1] ?? '',
      playerId,
      playerName,
      age: stripTags(ageCell.html),
      from: club(leftCell.html),
      to: club(joinedCell.html),
      // ISO so the published file sorts and compares without reparsing.
      date: parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : null,
      rawDate,
      marketValue: stripTags(valueCell.html),
      fee,
      feeCleaned: cleaned,
    });
  }

  return transfers;
}
