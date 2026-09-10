'use client';

import { useState, type ReactNode } from 'react';
import type { DataSource, Evidence, Finding, Role, Severity } from '@/lib/types';
import { ROLE_LABEL, classColor } from '@/lib/analysis/roles';

// ------------------------------------------------------------------ panel

export function Panel({
  title,
  actions,
  children,
  note,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  note?: string;
}) {
  return (
    <div className="panel">
      {title && (
        <div className="panel-head">
          <h3 className="panel-title">{title}</h3>
          {note && <span className="section-note">{note}</span>}
          {actions && (
            <>
              <span className="spacer" />
              {actions}
            </>
          )}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </div>
  );
}

export function Section({
  title,
  note,
  actions,
  children,
}: {
  title: string;
  note?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {note && <span className="section-note">{note}</span>}
        {actions && (
          <>
            <span className="spacer" />
            {actions}
          </>
        )}
      </div>
      {children}
    </section>
  );
}

// -------------------------------------------------------------------- kpi

export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | null;
  tone?: 'kill' | 'wipe';
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${tone ? ` is-${tone}` : ''}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ chips

export function RoleChip({ role }: { role: Role }) {
  return <span className={`chip ${role}`}>{ROLE_LABEL[role]}</span>;
}

export function ClassName({ name, className }: { name: string; className: string | null }) {
  const color = classColor(className);
  return <span style={color ? { color } : undefined}>{name}</span>;
}

/**
 * DEMO DATA badge. Rendered wherever a payload carries source: 'demo', so mock
 * data can never be mistaken for a real Warcraft Logs report.
 */
export function DemoBadge({ source }: { source: DataSource }) {
  if (source !== 'demo') return null;
  return <span className="badge-demo">DEMO DATA</span>;
}

export function SourceBadge() {
  return <span className="badge-source">SOURCE: WARCRAFT LOGS</span>;
}

// --------------------------------------------------------------- evidence

/**
 * The evidence panel. Every claim in NOX is inspectable here: who, what
 * metric, what value, at what timestamp, and a link back to the original
 * Warcraft Logs fight.
 */
export function EvidenceList({ evidence, link }: { evidence: Evidence[]; link?: string }) {
  if (evidence.length === 0) return null;
  return (
    <div className="evidence-panel">
      <div className="evidence-head">
        <span>SOURCE: WARCRAFT LOGS</span>
        <span className="spacer" />
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer">
            Open report ↗
          </a>
        )}
      </div>
      {evidence.map((item) => (
        <div className="evidence-row" key={item.id}>
          <span className="evidence-ts">{item.timestampLabel ?? '—'}</span>
          <span className="evidence-metric">
            {item.metric}
            {item.ability ? ` · ${item.ability}` : ''}
          </span>
          <span className="evidence-value">{item.value}</span>
          <span className="evidence-player">{item.player ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

export function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const link = finding.evidence[0]?.reportLink;

  return (
    <div className={`finding ${finding.severity}`}>
      <div className="finding-head">
        <span className={`sev ${finding.severity}`}>{finding.severity.toUpperCase()}</span>
        <h4 className="finding-title">{finding.title}</h4>
        <span className="spacer" />
        <button
          type="button"
          className="evidence-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? 'HIDE EVIDENCE' : `EVIDENCE (${finding.evidence.length})`}
        </button>
      </div>
      <p className="finding-body">{finding.finding}</p>
      {finding.recommendation && (
        <p className="finding-rec">
          <strong>RECOMMENDATION</strong>
          {finding.recommendation}
        </p>
      )}
      {open && <EvidenceList evidence={finding.evidence} link={link} />}
    </div>
  );
}

export function FindingList({ findings, empty }: { findings: Finding[]; empty?: string }) {
  if (findings.length === 0) {
    return <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>{empty ?? 'Insufficient evidence.'}</p>;
  }
  return (
    <div>
      {findings.map((f, i) => (
        <FindingCard key={`${f.title}-${i}`} finding={f} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- bars

export function BarRow({
  label,
  value,
  percent,
  tone,
  meta,
}: {
  label: ReactNode;
  value: string;
  percent: number;
  tone?: 'danger' | 'heal';
  meta?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="bar-row">
        <div className="bar-label">
          <span className="bar-name">{label}</span>
          {meta && <span className="dim" style={{ fontSize: 11 }}>{meta}</span>}
        </div>
        <span className="bar-value">{value}</span>
      </div>
      <div className="bar-track">
        <div
          className={`bar-fill${tone ? ` ${tone}` : ''}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- states

export function EmptyState({ mark, title, text }: { mark: string; title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-mark">{mark}</div>
      <div className="empty-title">{title}</div>
      <p className="empty-text">{text}</p>
    </div>
  );
}

export function ErrorState({ message, detail, onRetry }: { message: string; detail?: string | null; onRetry?: () => void }) {
  return (
    <div className="callout danger">
      <strong style={{ display: 'block', marginBottom: 4, color: 'var(--high)' }}>{message}</strong>
      {detail && <span>{detail}</span>}
      {onRetry && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} />;
}

export function SkeletonKpis({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-kpi">
      {Array.from({ length: count }).map((_, i) => (
        <div className="kpi" key={i}>
          <Skeleton height={9} width="55%" />
          <div style={{ height: 10 }} />
          <Skeleton height={22} width="72%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="stack">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={26} />
      ))}
    </div>
  );
}

export function Coverage({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="callout" style={{ marginTop: 12 }}>
      <strong style={{ display: 'block', marginBottom: 4 }}>Data coverage</strong>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {notes.map((note) => (
          <li key={note} style={{ marginBottom: 2 }}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

export const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low', 'info'];
