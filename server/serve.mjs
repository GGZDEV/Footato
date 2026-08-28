/**
 * Self-hosted Footato: serves the built site and refreshes it from home.
 *
 * Why this exists
 * ---------------
 * Transfermarkt refuses datacenter addresses, which is why GitHub Actions
 * cannot collect and why the published site goes stale until someone runs the
 * pipeline by hand. A residential connection has no such problem — every
 * collection in this repository was made from one. Running the refresh where
 * the connection already works removes the constraint instead of working
 * around it.
 *
 * What it does
 * ------------
 * - serves dist/ as a plain static site (put a reverse proxy in front for TLS)
 * - re-collects on a timer, and on demand through an authenticated endpoint
 * - reports when it last ran, whether it worked, and what it printed
 *
 * What it deliberately does not do
 * --------------------------------
 * Serve a stale build as if it were fresh. A failed refresh leaves the previous
 * site in place — that is the right call, a half-collected mercato must never
 * be published — but the failure is recorded and visible in /api/status rather
 * than swallowed.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const STATE_DIR = join(ROOT, 'data', 'state');
const STATE_FILE = join(STATE_DIR, 'refresh.json');

const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
/** Hours between automatic refreshes. 0 disables the timer. */
const INTERVAL_HOURS = Number.parseFloat(process.env.REFRESH_INTERVAL_HOURS ?? '6');
/**
 * The light path skips re-downloading the 20 MB of upstream snapshots, which
 * only move when the third-party datasets are republished. One full pass a day
 * is enough to pick those up; the rest of the time the run is 30 requests.
 */
const FULL_EVERY = Number.parseInt(process.env.REFRESH_FULL_EVERY ?? '4', 10);
/** Without a token the trigger endpoint stays closed. Safe by default. */
const ADMIN_TOKEN = process.env.FOOTATO_ADMIN_TOKEN ?? '';
/** Refuse manual triggers closer together than this, whatever the caller does. */
const MIN_MANUAL_GAP_MS = Number.parseInt(process.env.REFRESH_MIN_GAP_SECONDS ?? '120', 10) * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

mkdirSync(STATE_DIR, { recursive: true });

let state = {
  lastStartedAt: null,
  lastFinishedAt: null,
  lastOutcome: null,
  lastMode: null,
  lastError: null,
  lastLog: [],
  runCount: 0,
  consecutiveFailures: 0,
};
if (existsSync(STATE_FILE)) {
  try { state = { ...state, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) }; } catch { /* état illisible : on repart neuf */ }
}
const persist = () => {
  try { writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`); } catch { /* non bloquant */ }
};

let running = null;
let timer = null;
let nextRunAt = null;

const log = (message) => console.log(`[footato] ${new Date().toISOString()} ${message}`);

/**
 * Runs one refresh. Resolves with the outcome rather than throwing: a failed
 * refresh is an expected state to report, not a reason to take the server down.
 */
/**
 * The light path rebuilds from whatever data/raw/ already holds. On a freshly
 * built container that directory has only the collection, so a light pass would
 * be refused by build-dataset — rightly, since it would drop every season but
 * the current one. Upgrade it to a full pass instead of failing on the obvious.
 */
const upstreamMissing = () => !existsSync(join(ROOT, 'data', 'raw', 'recent', 'manifest.json'));

function refresh(requested = 'light') {
  if (running) return running;

  const mode = requested === 'full' || upstreamMissing() ? 'full' : 'light';
  if (mode !== requested) log('sources tierces absentes — passe complète imposée');
  const script = mode === 'full' ? 'refresh:site:full' : 'refresh:site';
  state.lastStartedAt = new Date().toISOString();
  state.lastMode = mode;
  persist();
  log(`refresh ${mode} — npm run ${script}`);

  running = new Promise((resolve) => {
    const lines = [];
    const child = spawn('npm', ['run', script], {
      cwd: ROOT,
      env: process.env,
      shell: process.platform === 'win32',
    });

    const capture = (chunk) => {
      for (const line of String(chunk).split('\n')) {
        const text = line.trimEnd();
        if (!text) continue;
        lines.push(text);
        // Keep the tail only: enough to diagnose, small enough to hold and serve.
        if (lines.length > 200) lines.shift();
      }
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);

    child.on('close', (code) => {
      state.lastFinishedAt = new Date().toISOString();
      state.lastOutcome = code === 0 ? 'success' : 'failure';
      state.lastError = code === 0 ? null : (lines.filter((l) => /error|Error|échec|! /.test(l)).at(-1) ?? `code ${code}`);
      state.lastLog = lines.slice(-40);
      state.runCount += 1;
      state.consecutiveFailures = code === 0 ? 0 : state.consecutiveFailures + 1;
      persist();
      log(`refresh ${mode} → ${state.lastOutcome}${state.lastError ? ` (${state.lastError})` : ''}`);
      running = null;
      resolve(state.lastOutcome);
    });

    child.on('error', (error) => {
      state.lastFinishedAt = new Date().toISOString();
      state.lastOutcome = 'failure';
      state.lastError = error.message;
      state.consecutiveFailures += 1;
      persist();
      running = null;
      resolve('failure');
    });
  });

  return running;
}

function scheduleNext() {
  if (!(INTERVAL_HOURS > 0)) return;
  const delay = INTERVAL_HOURS * 3_600_000;
  nextRunAt = new Date(Date.now() + delay).toISOString();
  clearTimeout(timer);
  timer = setTimeout(async () => {
    // A full pass every FULL_EVERY runs picks up republished upstream snapshots.
    const mode = FULL_EVERY > 0 && state.runCount % FULL_EVERY === 0 ? 'full' : 'light';
    await refresh(mode);
    scheduleNext();
  }, delay);
  timer.unref?.();
}

const authorised = (request) => {
  if (!ADMIN_TOKEN) return false;
  const header = request.headers.authorization ?? '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
};

const json = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
};

async function serveStatic(request, response, pathname) {
  // Resolve inside dist/ only: a normalised path that escapes it is refused.
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = join(DIST, relative);
  if (!file.startsWith(DIST)) return json(response, 403, { error: 'chemin refusé' });

  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    file = join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  // Single-page app: unknown paths fall back to the entry document.
  if (!info) {
    file = join(DIST, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info) return json(response, 503, { error: 'site non construit — lancez npm run build' });

  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  // The data files change on every refresh; the hashed assets never do.
  const immutable = /\/assets\//.test(file.replace(/\\/g, '/'));
  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/status') {
    return json(response, 200, {
      running: Boolean(running),
      nextRunAt,
      intervalHours: INTERVAL_HOURS,
      // Tells the page whether to offer the button at all, without leaking the token.
      refreshEnabled: Boolean(ADMIN_TOKEN),
      ...state,
    });
  }

  if (url.pathname === '/api/refresh') {
    if (request.method !== 'POST') return json(response, 405, { error: 'méthode non autorisée' });
    if (!ADMIN_TOKEN) return json(response, 503, { error: 'FOOTATO_ADMIN_TOKEN non défini : déclenchement désactivé' });
    if (!authorised(request)) return json(response, 401, { error: 'jeton invalide' });
    if (running) return json(response, 409, { error: 'une collecte est déjà en cours', running: true });

    const since = state.lastStartedAt ? Date.now() - Date.parse(state.lastStartedAt) : Infinity;
    if (since < MIN_MANUAL_GAP_MS) {
      return json(response, 429, {
        error: `collecte trop récente, réessayez dans ${Math.ceil((MIN_MANUAL_GAP_MS - since) / 1000)} s`,
      });
    }

    const mode = url.searchParams.get('mode') === 'full' ? 'full' : 'light';
    refresh(mode).then(() => scheduleNext());
    return json(response, 202, { started: true, mode });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(response, 405, { error: 'méthode non autorisée' });
  }
  return serveStatic(request, response, url.pathname);
});

server.listen(PORT, HOST, () => {
  log(`site servi sur http://${HOST}:${PORT}`);
  log(ADMIN_TOKEN ? 'déclenchement manuel activé' : 'déclenchement manuel désactivé (FOOTATO_ADMIN_TOKEN absent)');
  if (INTERVAL_HOURS > 0) {
    log(`collecte automatique toutes les ${INTERVAL_HOURS} h, passe complète toutes les ${FULL_EVERY} exécutions`);
    scheduleNext();
  } else {
    log('collecte automatique désactivée (REFRESH_INTERVAL_HOURS=0)');
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`${signal} — arrêt`);
    clearTimeout(timer);
    server.close(() => process.exit(0));
  });
}
