'use client';

import { useState } from 'react';
import { DEMO_HINT } from '@/lib/client/constants';

export function ReportLoader({
  onLoad,
  loading,
  error,
  onDemo,
}: {
  onLoad: (input: string) => void;
  loading: boolean;
  error: { message: string; detail: string | null } | null;
  onDemo: () => void;
}) {
  const [value, setValue] = useState('');

  return (
    <div className="panel">
      <div className="panel-body">
        <h1 className="page-title">Load a Warcraft Logs report</h1>
        <p className="page-sub">
          Paste a report URL or a report code. NOX reads public reports through the Warcraft Logs API.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim() && !loading) onLoad(value.trim());
          }}
          className="row"
          style={{ gap: 10, alignItems: 'stretch', flexWrap: 'nowrap' }}
        >
          <input
            className={`input${error ? ' invalid' : ''}`}
            placeholder="https://www.warcraftlogs.com/reports/aBcD1234efGH5678"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading}
            aria-label="Warcraft Logs report URL or code"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !value.trim()}>
            {loading ? (
              <>
                <span className="spinner" /> Loading
              </>
            ) : (
              'Load Report'
            )}
          </button>
        </form>

        {error && (
          <div className="callout danger" style={{ marginTop: 12 }}>
            <strong style={{ display: 'block', marginBottom: 3, color: 'var(--high)' }}>{error.message}</strong>
            {error.detail && <span>{error.detail}</span>}
          </div>
        )}

        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <span className="dim" style={{ fontSize: 12 }}>No credentials configured yet?</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onDemo} disabled={loading}>
            Explore with demo data
          </button>
          <span className="dim" style={{ fontSize: 11.5 }}>{DEMO_HINT}</span>
        </div>
      </div>
    </div>
  );
}
