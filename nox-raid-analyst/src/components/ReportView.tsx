'use client';

import type { NoxReport } from '@/lib/types';
import { formatDuration } from '@/lib/format';
import { DemoBadge, Kpi, Panel, Section } from './primitives';
import { FightSelector } from './FightSelector';

export function ReportView({
  report,
  selectedFightId,
  onSelectFight,
}: {
  report: NoxReport;
  selectedFightId: number | null;
  onSelectFight: (fightId: number) => void;
}) {
  const encounters = report.fights.filter((f) => f.isEncounter);
  const kills = encounters.filter((f) => f.kill === true).length;
  const wipes = encounters.filter((f) => f.kill === false).length;
  const bosses = new Set(encounters.map((f) => f.encounterId)).size;
  const date = new Date(report.startTime);
  const totalMs = Math.max(0, report.endTime - report.startTime);

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{report.title}</h1>
        <DemoBadge source={report.source} />
      </div>
      <p className="page-sub">
        {[
          report.guild ? `${report.guild.name}${report.guild.server ? ` · ${report.guild.server}` : ''}` : null,
          report.zone?.name,
          Number.isFinite(date.getTime()) ? date.toLocaleDateString() : null,
          report.owner ? `logged by ${report.owner}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <Section title="REPORT SUMMARY">
        <div className="grid grid-kpi">
          <Kpi label="FIGHTS" value={String(report.fights.length)} sub={`${encounters.length} encounters`} />
          <Kpi label="BOSSES" value={String(bosses)} />
          <Kpi label="KILLS" value={String(kills)} tone={kills > 0 ? 'kill' : undefined} />
          <Kpi label="WIPES" value={String(wipes)} tone={wipes > 0 ? 'wipe' : undefined} />
          <Kpi label="RAIDERS" value={String(report.actors.length)} />
          <Kpi label="SESSION" value={formatDuration(totalMs)} />
        </div>
      </Section>

      <Section title="SELECT A PULL" note="Loading a pull fetches its combat data">
        <FightSelector report={report} selectedId={selectedFightId} onSelect={onSelectFight} />
      </Section>

      {report.actors.length > 0 && (
        <Section title="ROSTER" note={`${report.actors.length} players in this report`}>
          <Panel>
            <div className="row" style={{ gap: 6 }}>
              {report.actors.map((actor) => (
                <span key={actor.id} className="chip">
                  {actor.name}
                  {actor.className ? ` · ${actor.className}` : ''}
                </span>
              ))}
            </div>
          </Panel>
        </Section>
      )}
    </div>
  );
}
