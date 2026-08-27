import type { Group } from '../lib/aggregate';
import { count } from '../lib/format';
import type { FreshnessData, FreshnessSignal } from '../lib/types';
import { Flag } from './Flag';

interface Props {
  groups: Group[];
  freshness: FreshnessData | null;
  sourceDate: string;
  refreshing: boolean;
  onRefresh: () => void;
}

const rate = (known: number, unknown: number) => known + unknown ? known / (known + unknown) : 1;

export function CompletenessView({ groups, freshness, sourceDate, refreshing, onRefresh }: Props) {
  const known = groups.reduce((sum, group) => sum + group.knownFees, 0);
  const unknown = groups.reduce((sum, group) => sum + group.unknownFees, 0);
  const overall = rate(known, unknown);
  const ordered = [...groups].sort((a, b) => b.coverage - a.coverage || b.knownFees - a.knownFees);
  const signals = freshness?.signals.slice(0, 12) ?? [];

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
          <div><b>Montants de transferts</b><span>Source mise à jour le {sourceDate}</span></div>
          <i className="status-dot" aria-label="Source disponible" />
        </article>

        <article className="panel source-card">
          <span className="source-icon" aria-hidden="true">↻</span>
          <div>
            <b>Contrôle des effectifs</b>
            <span>{freshness?.meta.status === 'ready' ? `${freshness.meta.teamCount} équipes contrôlées` : 'Premier relevé en attente'}</span>
          </div>
          <button className="btn" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Vérification…' : 'Actualiser'}</button>
        </article>
      </div>

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
