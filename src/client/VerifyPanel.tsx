import { useState } from 'react';
import type { FormEvent } from 'react';

import type { VerificationStatus, VerifyResponse } from '../shared/types.js';

const STATUS_LABEL: Record<VerificationStatus, string> = {
  verified: 'Verified',
  partially_verified: 'Partially verified',
  conflicting: 'Conflicting',
  unverified: 'Unverified',
  not_checkable: 'Not checkable',
};

const STATUS_HINT: Record<VerificationStatus, string> = {
  verified: 'A permitted free source confirms the postcode and place.',
  partially_verified: 'Some evidence was found, but not every component could be compared.',
  conflicting: 'The evidence contradicts a supplied component. Nothing was overwritten.',
  unverified: 'No permitted free source matched this address. Nothing was invented.',
  not_checkable: 'This address lacks the details a free source would need.',
};

export function VerifyPanel() {
  const [line, setLine] = useState('');
  const [countryHint, setCountryHint] = useState('');
  const [allowRemote, setAllowRemote] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VerifyResponse | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ line, countryHint: countryHint || null, allowRemote }),
      });
      const payload = (await response.json()) as VerifyResponse | { ok: false; error: string };

      if (!response.ok || payload.ok !== true) {
        setError('error' in payload ? payload.error : 'The address could not be verified.');
        return;
      }
      setData(payload);
    } catch {
      setError('The verification request failed. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  const verification = data?.verification ?? null;
  const status = verification?.verificationStatus ?? null;

  return (
    <section className="panel" aria-labelledby="verify-heading">
      <div className="panel-head">
        <div>
          <h2 id="verify-heading">Evidence verification</h2>
          <p className="panel-sub">
            Check one address against permitted free sources. Evidence links open the public record that
            produced the decision.
          </p>
        </div>
        <span className="chip">Free sources only</span>
      </div>

      <form className="bulk-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Address line</span>
          <input
            type="text"
            value={line}
            onChange={(event) => setLine(event.target.value)}
            placeholder="350 Fifth Avenue, New York, NY 10118, USA"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span className="field-label">Country hint (optional)</span>
          <input
            type="text"
            value={countryHint}
            onChange={(event) => setCountryHint(event.target.value)}
            placeholder="US or United States"
            autoComplete="off"
          />
        </label>
        <label className="field field-check">
          <input
            type="checkbox"
            checked={allowRemote}
            onChange={(event) => setAllowRemote(event.target.checked)}
          />
          <span>
            Allow a throttled OpenStreetMap lookup
            <small>One request per address, at least 1s apart, cached for 24 hours.</small>
          </span>
        </label>
        <div className="bulk-actions">
          <button className="primary-button" type="submit" disabled={pending || !line.trim()}>
            {pending ? 'Verifying…' : 'Verify with evidence'}
          </button>
        </div>
      </form>

      {error && <p className="error-note">{error}</p>}

      {verification && status && (
        <div className="verify-result">
          <div className="verify-summary">
            <span className={`status-badge is-${status}`}>{STATUS_LABEL[status]}</span>
            <p className="panel-note">{verification.statusReason}</p>
            <p className="verify-hint">{STATUS_HINT[status]}</p>
          </div>

          <dl className="verify-facts">
            <div>
              <dt>Address Line 1</dt>
              <dd>{data?.result.components.addressLine1 ?? '—'}</dd>
            </div>
            <div>
              <dt>Postcode</dt>
              <dd>{data?.result.components.postcode ?? '—'}</dd>
            </div>
            <div>
              <dt>City</dt>
              <dd>{data?.result.components.city ?? '—'}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{data?.result.components.region ?? '—'}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{data?.result.components.country ?? '—'}</dd>
            </div>
            <div>
              <dt>Agreement</dt>
              <dd>{verification.agreement.replace('_', ' ')}</dd>
            </div>
          </dl>

          <h3>Evidence</h3>
          {verification.evidence.length === 0 ? (
            <p className="panel-note">
              No source returned a matching record. No evidence was generated, because evidence must be
              observed.
            </p>
          ) : (
            <ul className="evidence-list">
              {verification.evidence.map((record) => (
                <li key={`${record.source}-${record.detail}`} className="evidence-item">
                  <div className="evidence-head">
                    <strong>{record.sourceLabel}</strong>
                    <span className="chip is-muted">matched on {record.matchedOn}</span>
                  </div>
                  <p className="evidence-detail">{record.detail}</p>
                  <p className="evidence-meta">
                    {record.license} · retrieved {new Date(record.retrievedAt).toLocaleString()}
                  </p>
                  <div className="evidence-links">
                    <a href={record.evidenceUrl} target="_blank" rel="noreferrer noopener">
                      Open evidence ↗
                    </a>
                    {record.queryUrl && (
                      <a href={record.queryUrl} target="_blank" rel="noreferrer noopener">
                        View request ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="verify-footnote">
            Sources checked: {verification.checkedSources.join(', ') || 'none'}
            {verification.remoteAttempted ? ' · public lookup attempted' : ' · local data only'}
            {verification.remoteError ? ` · public source error: ${verification.remoteError}` : ''}
          </p>
        </div>
      )}
    </section>
  );
}
