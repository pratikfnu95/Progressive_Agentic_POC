import { AlertTriangle, BookOpenCheck, ChevronDown, ClipboardCheck } from 'lucide-react';

export function IncidentResolutionGuide({ guide, error }) {
  if (!guide && !error) return null;
  if (error) return <div className="incident-guide-unavailable" role="status"><AlertTriangle size={15} />{error}</div>;

  const reference = guide.similar_case;
  return <section className="incident-resolution-guide" aria-label={`Suggested investigation for ${guide.ticket_id}`}>
    <header className="incident-guide-heading">
      <span><BookOpenCheck size={17} /></span>
      <div><strong>A starting point for {guide.ticket_id}</strong><small>Investigation guide · assigned to {guide.assignee}</small></div>
    </header>
    <p className="incident-guide-opening">{guide.opening}</p>

    {reference ? <div className="incident-guide-reference">
      <div className="incident-guide-reference-label"><span>Similar issue</span><span>{reference.reference_id} · {reference.issue_category}</span></div>
      <strong>{reference.issue_summary}</strong>
      <p>{reference.resolution_summary}</p>
      <small>This is an illustrative reference, not a confirmed historical Progressive incident.</small>
    </div> : <div className="incident-guide-no-match">No close sample reference was found. Start with the ticket details and the approved data runbook.</div>}

    {guide.watch_for && <aside className="incident-guide-watch" role="note">
      <AlertTriangle size={16} /><div><strong>Watch for</strong><span>{guide.watch_for}</span></div>
    </aside>}

    {guide.steps?.length > 0 && <div className="incident-guide-checks">
      <h4><ClipboardCheck size={15} /> Suggested checks</h4>
      <ol className="incident-guide-steps">{guide.steps.map((step) => <li key={`${step.number}-${step.title}`}>
        <span className="incident-guide-step-number">{step.number}</span>
        <div><strong>{step.title}</strong><p>{step.instruction}</p>{step.verify && <small>Confirm: {step.verify}</small>}</div>
      </li>)}</ol>
    </div>}

    <details className="incident-guide-details">
      <summary>About this reference <ChevronDown size={14} /></summary>
      <p>{guide.provenance}</p>
      {guide.source_tables?.length > 0 && <small>Documented tables: {guide.source_tables.join(', ')}</small>}
    </details>
  </section>;
}
