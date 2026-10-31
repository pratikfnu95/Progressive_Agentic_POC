import { BookOpenCheck, CalendarDays, CheckCircle2, CircleAlert, FileText } from 'lucide-react';

function displayDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function IncidentResolutionGuide({ guide, error }) {
  if (!guide && !error) return null;
  if (error) return <div className="incident-guide-unavailable" role="status"><CircleAlert size={15} />{error}</div>;

  const frequency = guide.category_frequency;
  return <section className="incident-resolution-guide" aria-label={`Suggested investigation for ${guide.ticket_id}`}>
    <header className="incident-guide-heading"><span><BookOpenCheck size={17} /></span><div><strong>Suggested investigation</strong><small>For {guide.assignee} · {guide.ticket_id}</small></div></header>
    {guide.summary && <p className="incident-guide-summary">{guide.summary}</p>}
    <div className="incident-guide-frequency"><FileText size={14} /><span><strong>{frequency?.count ?? 0} of {frequency?.total_records ?? 0}</strong> recorded examples in this issue category in the current snapshot</span></div>
    <h4>Investigation steps</h4>
    <ol className="incident-guide-steps">{guide.steps.map((step) => <li key={`${step.number}-${step.title}`}><span className="incident-guide-step-number">{step.number}</span><div><strong>{step.title}</strong><p>{step.instruction}</p>{step.verify && <small>Check: {step.verify}</small>}</div></li>)}</ol>
    <div className="incident-guide-cases"><h4>Related incident records</h4>
      {guide.similar_cases?.length ? guide.similar_cases.map((item) => <article key={item.ticket_id}>
        <div className="incident-guide-case-top"><strong>{item.ticket_id}</strong><span>{item.issue_category}</span></div>
        <p>{item.issue_summary}</p>
        <small><CalendarDays size={12} />Created {displayDate(item.created_at)} · Current status: {item.ticket_status}</small>
        {item.related_policies?.length > 0 && <small>Policies: {item.related_policies.map((policy) => `${policy.policy_number} (${policy.policy_status || 'unknown'})`).join(', ')}</small>}
      </article>) : <p className="incident-guide-no-cases">No closely related record was identified in this reference snapshot.</p>}
    </div>
    {guide.knowledge_references?.length > 0 && <div className="incident-guide-sources"><h4>Knowledge base references</h4>{guide.knowledge_references.map((source) => <span key={`${source.document}-${source.section}`}>{source.document} · {source.section}</span>)}</div>}
    <p className="incident-guide-caveat"><CheckCircle2 size={13} />{guide.limitations}</p>
  </section>;
}
