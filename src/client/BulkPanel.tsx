/**
 * Bulk upload panel.
 *
 * Shows the parsed results next to the untouched original row so the user can
 * always see what came in and what the engine derived from it. Row order is
 * the file order, and exports keep the original columns first.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  BulkRowRecord,
  BulkRunDetail,
  BulkRunListResponse,
  BulkRunSummary,
  BulkUploadResponse,
} from '../shared/types.js';

interface ApiFailure {
  ok: false;
  error: string;
}

function statusClass(status: string | null): string {
  switch (status) {
    case 'verified':
      return 'chip is-ok';
    case 'partially_verified':
      return 'chip is-warn';
    case 'conflicting':
      return 'chip is-danger';
    case 'not_checkable':
      return 'chip is-muted';
    default:
      return 'chip';
  }
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'verified':
      return 'Verified';
    case 'partially_verified':
      return 'Partially verified';
    case 'conflicting':
      return 'Conflicting';
    case 'not_checkable':
      return 'Not checkable';
    case 'unverified':
      return 'Unverified';
    default:
      return 'Not processed';
  }
}

export function BulkPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [column, setColumn] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkUploadResponse | null>(null);
  const [detail, setDetail] = useState<BulkRunDetail | null>(null);
  const [runs, setRuns] = useState<BulkRunSummary[]>([]);

  const loadRuns = useCallback(async () => {
    try {
      const response = await fetch('/api/bulk/runs');
      if (!response.ok) return;
      const payload = (await response.json()) as BulkRunListResponse;
      setRuns(payload.runs ?? []);
    } catch {
      // History is a convenience; a failed refresh must not break the panel.
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError('Choose a CSV or Excel file first.');
      return;
    }

    setBusy(true);
    setError(null);
    setDetail(null);

    try {
      const headers: Record<string, string> = {
        'content-type': 'application/octet-stream',
        'x-filename': encodeURIComponent(file.name),
      };
      if (column.trim()) headers['x-column'] = encodeURIComponent(column.trim());
      if (hint.trim()) headers['x-country-hint'] = encodeURIComponent(hint.trim());

      const response = await fetch('/api/bulk', { method: 'POST', headers, body: file });
      const payload = (await response.json()) as BulkUploadResponse | ApiFailure;

      if (!response.ok || !('run' in payload)) {
        setError(('error' in payload && payload.error) || 'The file could not be processed.');
        return;
      }

      setResult(payload);
      await loadRuns();
    } catch {
      setError('The upload failed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function openRun(runId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/bulk/${runId}`);
      if (!response.ok) {
        setError('That processing run could not be loaded.');
        return;
      }
      setDetail((await response.json()) as BulkRunDetail);
      setResult(null);
    } catch {
      setError('That processing run could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  const activeRun = detail?.run ?? result?.run ?? null;
  const activeRows: BulkRowRecord[] = detail?.rows ?? result?.rows ?? [];
  const exports = activeRun
    ? {
        csv: `/api/bulk/${activeRun.runId}/export.csv`,
        xlsx: `/api/bulk/${activeRun.runId}/export.xlsx`,
      }
    : null;

  return (
    <section className="panel" aria-labelledby="bulk-heading">
      <div className="panel-head">
        <div>
          <h2 id="bulk-heading">Bulk processing</h2>
          <p className="panel-sub">CSV or Excel in, every original row and its order preserved.</p>
        </div>
        {activeRun && (
          <span className="chip is-muted">
            {activeRun.rowCount} rows · avg {activeRun.averageConfidence}%
          </span>
        )}
      </div>

      <form className="bulk-form" onSubmit={(event) => void upload(event)}>
        <label className="field">
          <span className="field-label">File (.csv, .tsv or .xlsx)</span>
          <input
            type="file"
            accept=".csv,.tsv,.txt,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <label className="field">
          <span className="field-label">Address column (optional)</span>
          <input
            type="text"
            value={column}
            placeholder="Auto-detect"
            onChange={(event) => setColumn(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Country hint (optional)</span>
          <input
            type="text"
            value={hint}
            placeholder="DE or Germany"
            onChange={(event) => setHint(event.target.value)}
          />
        </label>

        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Processing…' : 'Process file'}
        </button>
      </form>

      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      {activeRun && (
        <>
          <div className="bulk-stats">
            <div>
              <span className="card-label">Rows</span>
              <strong>{activeRun.rowCount}</strong>
            </div>
            <div>
              <span className="card-label">Processed</span>
              <strong>{activeRun.processedCount}</strong>
            </div>
            <div>
              <span className="card-label">Needs attention</span>
              <strong>{activeRun.needsAttention}</strong>
            </div>
            <div>
              <span className="card-label">Average confidence</span>
              <strong>{activeRun.averageConfidence}%</strong>
            </div>
            <div>
              <span className="card-label">Address column</span>
              <strong>{activeRun.addressColumn || `column ${activeRun.addressColumnIndex + 1}`}</strong>
            </div>
          </div>

          {exports && (
            <div className="bulk-actions">
              <a className="ghost-button" href={exports.csv} download>
                Export CSV
              </a>
              <a className="ghost-button" href={exports.xlsx} download>
                Export Excel
              </a>
              <span className="panel-note">
                Original columns come first, in the original order, followed by the derived values.
              </span>
            </div>
          )}

          <div className="table-scroll">
            <table className="bulk-table">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Original row (as supplied)</th>
                  <th scope="col">Address Line 1</th>
                  <th scope="col">Postcode</th>
                  <th scope="col">City</th>
                  <th scope="col">Region</th>
                  <th scope="col">Country</th>
                  <th scope="col">Code</th>
                  <th scope="col">Confidence</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((row) => (
                  <tr key={row.rowIndex}>
                    <td className="numeric">{row.sourceRowNumber}</td>
                    <td className="original-cell" title={JSON.stringify(row.originalRow)}>
                      {row.originalRow.join(' · ') || '—'}
                    </td>
                    <td>{row.addressLine1 ?? '—'}</td>
                    <td>{row.postcode ?? '—'}</td>
                    <td>{row.city ?? '—'}</td>
                    <td>{row.region ?? '—'}</td>
                    <td>{row.country ?? '—'}</td>
                    <td>{row.countryCode ?? '—'}</td>
                    <td className="numeric">{row.confidence === null ? '—' : `${row.confidence}%`}</td>
                    <td>
                      <span className={statusClass(row.verificationStatus)}>
                        {statusLabel(row.verificationStatus)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeRun.rowCount > activeRows.length && (
            <p className="panel-note">
              Showing the first {activeRows.length} of {activeRun.rowCount} rows. The export contains
              every row.
            </p>
          )}
        </>
      )}

      <div className="bulk-history">
        <h3>Recent runs</h3>
        {runs.length === 0 ? (
          <p className="panel-note">No files processed yet.</p>
        ) : (
          <ul>
            {runs.map((run) => (
              <li key={run.runId}>
                <button className="link-button" type="button" onClick={() => void openRun(run.runId)}>
                  {run.sourceFilename ?? run.runId}
                </button>
                <span className="panel-note">
                  {run.rowCount} rows · {run.sourceFormat.toUpperCase()} ·{' '}
                  {new Date(run.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
