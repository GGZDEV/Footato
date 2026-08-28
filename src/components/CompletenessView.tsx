import type { Group } from '../lib/aggregate';
import { count } from '../lib/format';
import type { FreshnessData, FreshnessSignal, LatestData, LatestTransfer, League, Meta } from '../lib/types';
import { Flag } from './Flag';

interface Props {
  groups: Group[];
  freshness: FreshnessData | null;
  latest: LatestData | null;
  sourceDate: string;
  meta: Meta;
  leagues: League[];
  refreshing: boolean;
  onRefresh: () => void;
}

const shortDate = (iso: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
  .format(new Date(`${iso}T12:00:00Z`));

/** Whole days between an ISO day and today, floored. */
const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000);

const rate = (known: number, unknown: number) => known + unknown ? known / (known + unknown) : 1;

function LatestRow({ transfer }: { transfer: LatestTransfer }) {
  return (
    <article className={`latest-row${transfer.included ? '' : ' latest-row--missing'}`}>
      <span className="latest-date">{shortDate(transfer.date)}</span>
      <span className="latest-player">
        <b>{transfer.player}</b>
        <small>{transfer.from} <i aria-hidden="true">→</i> {transfer.to}</small>
      </span>
      <span className="latest-fee">{transfer.fee}</span>
      <span
        className="latest-state"
        title={transfer.included
          ? 'Présent dans les données publiées'
          : 'Publié par la source mais pas encore collecté'}
      >
        {transfer.included ? '✓' : '·'}
      </span>
    </article>
  );
}

const ORIGIN_LABEL: Record<string, string> = {
  legacy: 'Historique importé',
  recent: 'Import maintenu',
  collected: 'Collecte Footato',
};

export function CompletenessView({ groups, freshness, latest, sourceDate, meta, leagues, refreshing, onRefresh }: Props) {
  const known = groups.reduce((sum, group) => sum + group.knownFees, 0);
  const unknown = groups.reduce((sum, group) => sum + group.unknownFees, 0);
  const overall = rate(known, unknown);
  const ordered = [...groups].sort((a, b) => b.coverage - a.coverage || b.knownFees - a.knownFees);
  const signals = freshness?.signals.slice(0, 12) ?? [];
  // Leagues whose composition no independent fixture list confirms. Naming them
  // is the point: the rest of the dataset earns its confidence from a
  // cross-check these two cannot have.
  const leagueName = (id: string) => leagues.find((league) => league.id === id)?.name ?? id;
  const unverifiedMemberships = [...new Set(
    (meta.quality.collected?.compositions ?? [])
      .filter((composition) => !composition.membershipControl)
      .map((composition) => composition.leagueId),
  )].sort().map(leagueName);
  const missingTransfers = latest?.transfers.filter((transfer) => !transfer.included) ?? [];
  const includedTransfers = latest?.transfers.filter((transfer) => transfer.included) ?? [];

  return (
    <section className="content-section">
      <div className="section-title">
        <div>
          <span className="eyebrow-label">Qualité des données</span>
          <h2>Complétude</h2>
          <p>Les indicateurs techniques sont rangés ici, hors de l’exploration quotidienne.</p>
        </div>
      </div>

      <div className="quality-overview">
        <article className="panel quality-hero">
          <span className="quality-ring" style={{ '--score': `${overall * 360}deg` } as React.CSSProperties}>
            <b>{Math.round(overall * 100)}%</b>
          </span>
          <div>
            <span className="eyebrow-label">Indemnités renseignées</span>
            <h3>{count(known)} montants publics</h3>
            <p>{count(unknown)} indemnités sont explicitement non divulguées. Les transferts libres et mouvements sans indemnité ne pénalisent pas ce taux.</p>
          </div>
        </article>

        <article className="panel source-card">
          <span className="source-icon" aria-hidden="true">€</span>
          <div>
            <b>Montants de transferts</b>
            <span>
              {meta.currentSeason
                ? `Saison ${meta.currentSeason.year}/${(meta.currentSeason.year + 1) % 100} relevée le ${sourceDate}`
                : `Source mise à jour le ${sourceDate}`}
            </span>
          </div>
          <i className="status-dot" aria-label="Source disponible" />
        </article>

        <article className="panel source-card">
          <span className="source-icon" aria-hidden="true">↻</span>
          <div>
            <b>Contrôle des effectifs</b>
            <span>{freshness?.meta.status === 'ready' ? `${freshness.meta.teamCount} équipes contrôlées` : 'Premier relevé en attente'}</span>
          </div>
          {/* Relit les fichiers de contrôle publiés. Le site est statique : rien
              ici ne peut lancer une collecte, qui est un script Node lisant
              Transfermarkt côté serveur. Le libellé dit donc ce que le bouton
              fait vraiment. */}
          <button
            className="btn"
            onClick={onRefresh}
            disabled={refreshing}
            title="Relit les relevés publiés (effectifs et derniers transferts) sans recharger la page. Ne déclenche pas de collecte."
          >
            {refreshing ? 'Relecture…' : 'Relire'}
          </button>
        </article>
      </div>

      {(meta.origins?.length ?? 0) > 0 && (
        <div className="panel coverage-panel">
          <div className="panel-title-row">
            <div>
              <h3>Provenance</h3>
              <p>
                Chaque saison est fournie par une seule origine. Une saison terminée ne bouge plus :
                l’âge de son instantané est sans conséquence. Un mercato en cours, si.
              </p>
            </div>
            <span>{meta.origins!.length} origines</span>
          </div>
          <div className="coverage-list">
            {meta.origins!.map((origin) => (
              <div className="coverage-row" key={origin.id}>
                <span className="coverage-league">
                  <b>{ORIGIN_LABEL[origin.id] ?? origin.id}</b>
                  <small>{origin.dataset}</small>
                </span>
                <strong className="num">{origin.updatedAt ?? '—'}</strong>
                <small>
                  {count(origin.movementCount)} mouvements
                  {origin.seasons?.length ? ` · saisons ${origin.seasons.join(', ')}` : ''}
                  {origin.firstParty ? ' · lecture directe, sans intermédiaire' : ''}
                </small>
              </div>
            ))}
          </div>
          {unverifiedMemberships.length > 0 && (
            <p className="coverage-note">
              Composition non recoupée pour {unverifiedMemberships.join(', ')} : aucune source de
              calendrier indépendante ne publie ces championnats, leur effectif repose donc sur
              Transfermarkt seul.
            </p>
          )}
        </div>
      )}

      <div className="panel coverage-panel">
        <div className="panel-title-row">
          <div><h3>Par championnat</h3><p>Part des indemnités publiques parmi les montants trouvés ou non divulgués.</p></div>
          <span>{ordered.length} championnats</span>
        </div>
        <div className="coverage-list">
          {ordered.map((group) => (
            <div className="coverage-row" key={group.key}>
              <span className="coverage-league"><Flag code={group.flag} /><b>{group.label}</b><small>{group.sublabel}</small></span>
              <span className="coverage-track" aria-hidden="true"><i style={{ width: `${group.coverage * 100}%` }} /></span>
              <strong className="num">{Math.round(group.coverage * 100)}%</strong>
              <small>{count(group.knownFees)} trouvées · {count(group.unknownFees)} non divulguées</small>
            </div>
          ))}
        </div>
      </div>

      {latest && latest.transfers.length > 0 && (
        <div className="panel latest-panel">
          <div className="panel-title-row">
            <div>
              <h3>Derniers transferts</h3>
              <p>
                Les mouvements les plus récents publiés par la source, et pour chacun si les
                données de Footato le contiennent. La correspondance se fait sur l’identifiant
                de transfert, pas sur le nom : la réponse est exacte.
              </p>
            </div>
            <span>
              {latest.meta.includedCount}/{latest.meta.transferCount} pris en compte
            </span>
          </div>

          <div className="latest-lag">
            <div>
              <span className="eyebrow-label">Dernier publié par la source</span>
              <strong>{latest.meta.newestSeen ? shortDate(latest.meta.newestSeen) : '—'}</strong>
            </div>
            <div>
              <span className="eyebrow-label">Dernier présent dans les données</span>
              <strong>{latest.meta.newestIncluded ? shortDate(latest.meta.newestIncluded) : 'aucun'}</strong>
            </div>
            <div>
              <span className="eyebrow-label">Retard</span>
              {/* The gap between the two dates is the lag, stated in days rather
                  than left for the reader to subtract. */}
              <strong>
                {latest.meta.newestSeen && latest.meta.newestIncluded
                  ? (() => {
                    const lag = daysSince(latest.meta.newestIncluded) - daysSince(latest.meta.newestSeen);
                    return lag <= 0 ? 'à jour' : `${lag} jour${lag > 1 ? 's' : ''}`;
                  })()
                  : '—'}
              </strong>
            </div>
          </div>

          {/* Les manquants sont listés intégralement et séparément. Rangés avec
              les autres, ils seraient les premiers à tomber hors du plafond
              d'affichage — or ce sont exactement ceux qu'il faut voir. */}
          {missingTransfers.length > 0 && (
            <>
              <div className="latest-subhead">
                <b>Pas encore pris en compte</b>
                <span>{missingTransfers.length}</span>
              </div>
              <div className="latest-list">
                {missingTransfers.map((transfer) => (
                  <LatestRow key={`${transfer.leagueId}-${transfer.transferId}`} transfer={transfer} />
                ))}
              </div>
            </>
          )}

          <div className="latest-subhead">
            <b>Derniers mouvements enregistrés</b>
            <span>{includedTransfers.length} relevés</span>
          </div>
          <div className="latest-list">
            {includedTransfers.slice(0, 24).map((transfer) => (
              <LatestRow key={`${transfer.leagueId}-${transfer.transferId}`} transfer={transfer} />
            ))}
          </div>

          <p className="coverage-note">
            Relevé le {shortDate(latest.meta.checkedAt.slice(0, 10))} sur {latest.meta.leagueCount} championnats,
            les {Math.round(latest.meta.transferCount / Math.max(latest.meta.leagueCount, 1))} derniers de chacun.
            Un mouvement absent signifie que la collecte a tourné avant sa publication — il n’entre
            dans aucun montant tant qu’il n’a pas été collecté, et n’est jamais estimé.
          </p>
        </div>
      )}

      {signals.length > 0 && (
        <details className="panel signals-disclosure">
          <summary>
            <span><b>Changements d’effectif détectés</b><small>Signaux à confirmer, exclus des statistiques financières</small></span>
            <strong>{freshness?.meta.signalCount ?? signals.length}</strong>
          </summary>
          <div className="signal-grid">
            {signals.map((signal: FreshnessSignal) => (
              <article className={`signal-card signal-${signal.kind}`} key={`${signal.kind}-${signal.playerId}-${signal.fromTeam?.id ?? 0}-${signal.toTeam?.id ?? 0}`}>
                <strong>{signal.playerName}</strong>
                <span>{signal.fromTeam?.name ?? 'Nouveau dans le périmètre'} <b aria-hidden="true">→</b> {signal.toTeam?.name ?? 'Sorti du périmètre'}</span>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
