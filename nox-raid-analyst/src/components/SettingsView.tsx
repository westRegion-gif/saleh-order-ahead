'use client';

import { useEffect, useState } from 'react';
import { loadStatus, type StatusResponse } from '@/lib/client/api';
import { EmptyState, Panel, Section, Skeleton } from './primitives';

export function SettingsView() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    loadStatus(controller.signal)
      .then(setStatus)
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">
        Integration status. NOX never displays secret values — only whether a credential is present.
      </p>

      <Section title="INTEGRATIONS">
        {loading ? (
          <div className="grid grid-2">
            <Panel><Skeleton height={60} /></Panel>
            <Panel><Skeleton height={60} /></Panel>
          </div>
        ) : !status ? (
          <Panel>
            <EmptyState mark="⚙" title="Status unavailable" text="Could not reach the NOX status endpoint." />
          </Panel>
        ) : (
          <div className="grid grid-2">
            <Integration
              name="Warcraft Logs"
              connected={status.warcraftLogs.connected}
              variables={status.warcraftLogs.variables}
              help="Create an API v2 client at warcraftlogs.com/api/clients/ and put the id and secret in your environment."
              link="https://www.warcraftlogs.com/api/clients/"
              required
            />
            <Integration
              name="OpenAI"
              connected={status.openai.connected}
              variables={status.openai.variables}
              help={`Optional. Enables the AI Coach. Model: ${status.openai.model}. Every other feature works without it.`}
              link="https://platform.openai.com/api-keys"
            />
          </div>
        )}
      </Section>

      <Section title="CONFIGURATION">
        <Panel>
          <p style={{ fontSize: 12.5, marginTop: 0 }}>
            Configure these as environment variables on the server. In development, copy
            {' '}<code className="mono">.env.example</code> to <code className="mono">.env.local</code>.
            Never commit a real <code className="mono">.env</code> file, and never paste secrets into
            the browser.
          </p>
          <pre
            className="mono"
            style={{
              background: 'var(--void-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: 13, fontSize: 11.5,
              overflowX: 'auto', margin: 0, color: 'var(--text-dim)',
            }}
          >{`WARCRAFTLOGS_CLIENT_ID=your_client_id
WARCRAFTLOGS_CLIENT_SECRET=your_client_secret
OPENAI_API_KEY=sk-...              # optional
OPENAI_MODEL=gpt-4o-mini           # optional
NOX_DEV_MODE=false                 # set true for the diagnostics panel`}</pre>
        </Panel>
      </Section>

      {status?.devMode && (
        <Section title="DEVELOPER DIAGNOSTICS" note="Secrets are redacted before capture">
          <div className="grid grid-3" style={{ marginBottom: 14 }}>
            <Panel title="Cache">
              <p style={{ fontSize: 12.5, margin: 0 }}>
                {status.cache ? `${status.cache.entries} entries · ${status.cache.inflight} in flight` : '—'}
              </p>
            </Panel>
            <Panel title="Warcraft Logs points">
              <p style={{ fontSize: 12.5, margin: 0 }}>
                {status.rateLimit?.pointsSpentThisHour !== undefined && status.rateLimit?.pointsSpentThisHour !== null
                  ? `${status.rateLimit.pointsSpentThisHour} / ${status.rateLimit.limitPerHour ?? '?'} this hour`
                  : 'Not sampled yet'}
              </p>
            </Panel>
          </div>
          <Panel title="Recent requests">
            {status.diagnostics.length === 0 ? (
              <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>No requests recorded yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="nox">
                  <thead>
                    <tr>
                      <th>TIME</th>
                      <th>KIND</th>
                      <th>STATUS</th>
                      <th>CACHE</th>
                      <th className="num">MS</th>
                      <th>MESSAGE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.diagnostics.map((entry, i) => (
                      <tr key={`${entry.ts}-${i}`}>
                        <td className="mono">{new Date(entry.ts).toLocaleTimeString()}</td>
                        <td>{entry.kind}</td>
                        <td style={{ color: entry.ok ? 'var(--good)' : 'var(--high)' }}>
                          {entry.ok ? 'OK' : 'FAIL'}
                        </td>
                        <td className="dim">{entry.cache ?? '—'}</td>
                        <td className="num dim">{entry.durationMs ?? '—'}</td>
                        <td style={{ whiteSpace: 'normal' }}>{entry.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </Section>
      )}
    </div>
  );
}

function Integration({
  name,
  connected,
  variables,
  help,
  link,
  required,
}: {
  name: string;
  connected: boolean;
  variables: string[];
  help: string;
  link: string;
  required?: boolean;
}) {
  return (
    <Panel
      title={name}
      actions={
        <span className={`chip ${connected ? 'kill' : 'wipe'}`}>
          {connected ? 'CONNECTED' : 'NOT CONNECTED'}
        </span>
      }
    >
      <p style={{ fontSize: 12.5, marginTop: 0 }}>{help}</p>
      <div className="row" style={{ gap: 6 }}>
        {variables.map((v) => (
          <code key={v} className="chip mono">{v}</code>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
          {connected ? 'Manage credentials ↗' : 'Get credentials ↗'}
        </a>
        {required && !connected && (
          <span className="dim" style={{ fontSize: 11.5, marginLeft: 10 }}>Required for live data</span>
        )}
      </div>
    </Panel>
  );
}
