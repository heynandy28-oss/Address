import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  HealthResponse,
  ParsedAddress,
  ParsedComponents,
  SystemInfoResponse,
} from '../shared/types.js';
import { BulkPanel } from './BulkPanel.js';
import { VerifyPanel } from './VerifyPanel.js';

const COMPONENT_ROWS: { key: keyof ParsedComponents; label: string }[] = [
  { key: 'addressLine1', label: 'Address line 1' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'Region' },
  { key: 'regionCode', label: 'Region code' },
  { key: 'country', label: 'Country' },
  { key: 'countryCode', label: 'Country code' },
];

type LoadState = 'loading' | 'ready' | 'error';

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [system, setSystem] = useState<SystemInfoResponse | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [healthResponse, systemResponse] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/system'),
      ]);

      if (!healthResponse.ok || !systemResponse.ok) {
        throw new Error(
          `API responded ${healthResponse.status} / ${systemResponse.status}`,
        );
      }

      setHealth((await healthResponse.json()) as HealthResponse);
      setSystem((await systemResponse.json()) as SystemInfoResponse);
      setState('ready');
      setError(null);
    } catch (cause) {
      setState('error');
      setError(cause instanceof Error ? cause.message : 'Unable to reach the API');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const online = state === 'ready' && health?.status === 'ok';

  const [line, setLine] = useState('1600 Amphitheatre Parkway, Mountain View, CA 94043, USA');
  const [hint, setHint] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedAddress | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const submitParse = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setParsing(true);
      setParseError(null);

      try {
        const response = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ line, countryHint: hint.trim() || undefined }),
        });
        const payload = (await response.json()) as { ok?: boolean; result?: ParsedAddress; error?: string };

        if (!response.ok || !payload.ok || !payload.result) {
          throw new Error(payload.error ?? `API responded ${response.status}`);
        }

        setParsed(payload.result);
      } catch (cause) {
        setParsed(null);
        setParseError(cause instanceof Error ? cause.message : 'The address could not be parsed');
      } finally {
        setParsing(false);
      }
    },
    [line, hint],
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            AI
          </span>
          <div>
            <p className="brand-name">Address Intelligence</p>
            <p className="brand-sub">Worldwide address parsing, diagnostics and evidence</p>
          </div>
        </div>
        <div className="topbar-right">
          <span className={`status-pill ${online ? 'is-online' : state === 'loading' ? 'is-pending' : 'is-offline'}`}>
            <span className="dot" aria-hidden="true" />
            {state === 'loading' ? 'Connecting' : online ? 'System online' : 'API unreachable'}
          </span>
          <span className="phase-pill">Phase {health?.phase ?? 0} · Verification</span>
          <button className="ghost-button" type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      <main className="content">
        <section className="hero">
          <h1>One address line. Complete intelligence.</h1>
          <p>
            This system treats every postal address as a single free-form line, then derives postcode,
            city, region, country and country code with traceable confidence and evidence. Missing
            information is reported, never invented.
          </p>
        </section>

        <section className="panel" aria-labelledby="parse-heading">
          <div className="panel-head">
            <h2 id="parse-heading">Parse a single address line</h2>
            <span className="tag">Deterministic · no model call</span>
          </div>
          <form className="parse-form" onSubmit={(event) => void submitParse(event)}>
            <label className="field-label" htmlFor="parse-line">
              Address line
            </label>
            <textarea
              id="parse-line"
              className="parse-input"
              rows={2}
              value={line}
              onChange={(event) => setLine(event.target.value)}
              placeholder="1600 Amphitheatre Parkway, Mountain View, CA 94043, USA"
            />
            <div className="parse-controls">
              <div className="parse-hint-wrap">
                <label className="field-label" htmlFor="parse-hint">
                  Country hint (optional)
                </label>
                <input
                  id="parse-hint"
                  className="parse-hint"
                  value={hint}
                  onChange={(event) => setHint(event.target.value)}
                  placeholder="GB or United Kingdom"
                />
              </div>
              <button className="primary-button" type="submit" disabled={parsing}>
                {parsing ? 'Parsing…' : 'Parse address'}
              </button>
            </div>
          </form>

          {parseError && (
            <div className="alert" role="alert">
              {parseError}
            </div>
          )}

          {parsed && (
            <div className="parse-result">
              <p className="parse-standardized">
                <span className="card-label">Standardized</span>
                <span>{parsed.standardizedText || 'No standard form could be built.'}</span>
              </p>

              <div className="assess-row">
                <div className="confidence-block">
                  <span className="card-label">Confidence</span>
                  <div
                    className="meter"
                    role="img"
                    aria-label={`Confidence ${parsed.confidence} of 100`}
                  >
                    <span className="meter-fill" style={{ width: `${parsed.confidence}%` }} />
                  </div>
                  <span className="confidence-value">{parsed.confidence} / 100</span>
                </div>
                <div className="assess-meta">
                  <span className={`chip is-${statusTone(parsed.verificationStatus)}`}>
                    {statusLabel(parsed.verificationStatus)}
                  </span>
                  <span className="card-label">Completeness {parsed.completeness}%</span>
                </div>
              </div>
              <p className="status-reason">{parsed.statusReason}</p>

              <dl className="parse-grid">
                {COMPONENT_ROWS.map(({ key, label }) => (
                  <div className="component" key={key}>
                    <dt>{label}</dt>
                    <dd>
                      {parsed.components[key] ?? <span className="empty-value">not present</span>}
                    </dd>
                    <p className="component-basis">
                      {parsed.bases[key] ? `basis: ${parsed.bases[key]}` : 'basis: not detected'}
                      {parsed.componentConfidence[key] !== null
                        ? ` · confidence ${parsed.componentConfidence[key]}%`
                        : ''}
                    </p>
                  </div>
                ))}
              </dl>

              <div className="chip-row">
                <span className="card-label">Missing</span>
                {parsed.missingComponents.length === 0 ? (
                  <span className="chip is-ok">none</span>
                ) : (
                  parsed.missingComponents.map((item) => (
                    <span className="chip is-warn" key={item}>
                      {item}
                    </span>
                  ))
                )}
              </div>

              {parsed.notes.length > 0 && (
                <ul className="note-list">
                  {parsed.notes.map((note, index) => (
                    <li className={`note is-${note.severity}`} key={`${note.code}-${index}`}>
                      {note.message}
                    </li>
                  ))}
                </ul>
              )}

              {parsed.diagnostics.length > 0 && (
                <ul className="diagnostic-list" aria-label="Address diagnostics">
                  {parsed.diagnostics.map((diagnostic, index) => (
                    <li
                      className={`diagnostic is-${diagnostic.severity}`}
                      key={`${diagnostic.code}-${index}`}
                    >
                      <span className="diagnostic-kind">{diagnostic.kind}</span>
                      <span>{diagnostic.message}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="panel-note">
                Every value above is read from the text you supplied. A component that could not be
                justified stays empty and appears under “Missing” — nothing is guessed or invented.
              </p>
            </div>
          )}
        </section>

        {state === 'error' && (
          <div className="alert" role="alert">
            <strong>Could not read system status.</strong> {error}
          </div>
        )}

        <VerifyPanel />

        <BulkPanel />

        <section className="grid" aria-label="System status">
          <article className="card">
            <p className="card-label">API</p>
            <p className="card-value">{state === 'loading' ? '—' : online ? 'Healthy' : 'Degraded'}</p>
            <p className="card-meta">
              {health ? `v${health.version} · engine ${health.engineVersion}` : 'Awaiting response'}
            </p>
          </article>

          <article className="card">
            <p className="card-label">Storage</p>
            <p className="card-value">{health ? health.storage.backend.toUpperCase() : '—'}</p>
            <p className="card-meta">
              {health
                ? `${health.storage.tables.length} tables · schema v${health.storage.schemaVersion} · ${
                    health.storage.durable ? 'durable history' : 'history resets on redeploy'
                  }`
                : 'Awaiting response'}
            </p>
          </article>

          <article className="card">
            <p className="card-label">Address model</p>
            <p className="card-value">{health ? health.addressModel.addressLineFields.join(', ') : '—'}</p>
            <p className="card-meta">Single address line · guarded by an automated test</p>
          </article>

          <article className="card">
            <p className="card-label">Uptime</p>
            <p className="card-value">{health ? formatUptime(health.uptimeSeconds) : '—'}</p>
            <p className="card-meta">{health ? `Checked ${new Date(health.time).toLocaleTimeString()}` : 'Awaiting response'}</p>
          </article>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Address model</h2>
            <span className="tag tag-solid">Enforced</span>
          </div>
          <ul className="checklist">
            {system?.addressModel.enforcement.map((item) => (
              <li key={item}>
                <span className="check" aria-hidden="true">✓</span>
                {item}
              </li>
            )) ?? <li>Loading enforcement details…</li>}
          </ul>
          <div className="field-preview">
            <span className="field-name">addressLine1</span>
            <span className="field-sample">1600 Amphitheatre Parkway, Mountain View, CA 94043, USA</span>
          </div>
          <p className="panel-note">
            A second address-line field does not exist in the database, the API, the interface or the
            exports. The guard test fails the build if one is ever introduced.
          </p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Engine</h2>
            <span className="tag">{system?.engine.llmRequired ? 'LLM required' : 'No paid model required'}</span>
          </div>
          <p className="panel-note">{system?.engine.strategy ?? 'Loading engine description…'}</p>
          <dl className="kv">
            <div>
              <dt>Engine</dt>
              <dd>{system?.engine.name ?? '—'}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{system?.engine.version ?? '—'}</dd>
            </div>
            <div>
              <dt>Supabase history</dt>
              <dd>{health?.integrations.supabase.configured ? 'Connected' : 'Not connected — local storage'}</dd>
            </div>
            <div>
              <dt>LLM assist</dt>
              <dd>{health?.integrations.llm.configured ? 'Configured' : 'Optional, not configured'}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Evidence sources</h2>
            <span className="tag">Free, no subscription</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Role</th>
                  <th scope="col">Access</th>
                </tr>
              </thead>
              <tbody>
                {system?.dataSources.map((source) => (
                  <tr key={source.name}>
                    <td>
                      <strong>{source.name}</strong>
                      <span className="cell-sub">{source.attribution}</span>
                    </td>
                    <td>{source.role}</td>
                    <td>{source.access}</td>
                  </tr>
                )) ?? (
                  <tr>
                    <td colSpan={3}>Loading sources…</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Roadmap</h2>
            <span className="tag">Phased delivery</span>
          </div>
          <ol className="roadmap">
            {system?.roadmap.map((phase) => (
              <li key={phase.phase} className={`roadmap-item is-${phase.status}`}>
                <span className="roadmap-index">{String(phase.phase).padStart(2, '0')}</span>
                <div>
                  <p className="roadmap-title">
                    {phase.title}
                    <span className="roadmap-status">{phase.status.replace('_', ' ')}</span>
                  </p>
                  <p className="roadmap-summary">{phase.summary}</p>
                </div>
              </li>
            )) ?? <li>Loading roadmap…</li>}
          </ol>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Guarantees</h2>
          </div>
          <ul className="checklist">
            {system?.guarantees.map((item) => (
              <li key={item}>
                <span className="check" aria-hidden="true">✓</span>
                {item}
              </li>
            )) ?? <li>Loading guarantees…</li>}
          </ul>
        </section>
      </main>

      <footer className="footer">
        <p>
          Address Intelligence · Phase {health?.phase ?? 0} foundation build. Bulk upload, verification and
          history arrive in later phases.
        </p>
        <p className="footer-credit">
          Postal reference data: GeoNames (CC BY 4.0) · Verification evidence: © OpenStreetMap
          contributors (ODbL)
        </p>
      </footer>
    </div>
  );
}

function statusLabel(status: ParsedAddress['verificationStatus']): string {
  switch (status) {
    case 'verified':
      return 'Verified';
    case 'partially_verified':
      return 'Partially verified';
    case 'conflicting':
      return 'Conflicting';
    case 'not_checkable':
      return 'Not checkable';
    default:
      return 'Unverified';
  }
}

function statusTone(status: ParsedAddress['verificationStatus']): string {
  switch (status) {
    case 'verified':
      return 'ok';
    case 'conflicting':
      return 'danger';
    case 'not_checkable':
      return 'muted';
    default:
      return 'warn';
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
