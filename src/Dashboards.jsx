import { useEffect, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowLeft, ArrowUpRight, BadgeCheck, CalendarDays,
  Check, ChevronDown, ChevronRight, CircleDashed, Clock3, FileWarning, Filter,
  Hand, LogIn, LogOut, MessageSquareText, Plus, Search, ShieldAlert, Sparkles,
  Ticket, UserRound, X,
} from 'lucide-react';
import { IncidentResolutionGuide } from './IncidentResolutionGuide.jsx';

const accountNames = ['Pratik', 'Sarvesh', 'Madhu', 'Saurabh', 'Admin'];
const assignablePeople = ['Pratik', 'Sarvesh', 'Madhu', 'Saurabh'];
const accountAvatarClass = (name) => `account-avatar-${String(name || 'guest').toLowerCase()}`;
const ownerTicketStatuses = [
  { value: 'In Progress', label: 'In Progress', description: 'Work is underway on this incident.' },
  { value: 'Blocked', label: 'Blocked', description: 'Work cannot continue because of a blocker.' },
  { value: 'Waiting for Info', label: 'Request more access', description: 'Waiting for additional information or access.' },
  { value: 'Completed', label: 'Completed', description: 'The incident has been resolved.' },
];

async function readIncidentResponse(response) {
  try { return await response.json(); }
  catch { return { error: 'The incident service returned an unreadable response.' }; }
}

function formatIncidentDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatIncidentTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatActivityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function IncidentLoading() {
  const stages = ['Connecting to incident data', 'Retrieving ticket details', 'Preparing your dashboard'];
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setStage((current) => (current + 1) % stages.length), 1700);
    return () => window.clearInterval(timer);
  }, []);

  return <section className="incident-loading-card" role="status" aria-live="polite">
    <span className="incident-loading-mark" aria-hidden="true"><span /></span>
    <div className="incident-loading-copy">
      <strong>{stages[stage]}<span className="incident-loading-ellipsis" aria-hidden="true">…</span></strong>
      <span>Securely loading the latest ticket and activity information.</span>
    </div>
    <span className="incident-loading-progress" aria-hidden="true"><i style={{ '--loading-stage': stage }} /></span>
  </section>;
}

const shortcuts = [
  [Search, 'Find similar past incidents', 'Search historical issues and resolutions'],
  [Ticket, 'Create a new ticket', 'Raise a Remedy ticket for this issue'],
  [FileWarning, 'Find unassigned tickets', 'Show open tickets you can take'],
  [Hand, 'Analyze policy data', 'Check data and identify discrepancies'],
];

function DashboardHeader({ title, subtitle, onCreate }) {
  return (
    <header className="dashboard-header">
      <div><div className="dashboard-title-line"><h1>{title}</h1></div><p>{subtitle}</p></div>
      {onCreate && <button className="dashboard-primary-button" onClick={onCreate}><Plus size={17} />Create New Ticket</button>}
    </header>
  );
}

function incidentStats(tickets) {
  const count = (status) => tickets.filter((ticket) => ticket.ticket_status === status).length;
  return [
    [Ticket, 'Total Tickets', tickets.length, null, null, 'blue'],
    [Clock3, 'Unassigned', count('Unassigned'), null, null, 'orange'],
    [UserRound, 'Assigned', count('Assigned'), null, null, 'teal'],
    [CircleDashed, 'In Progress', count('In Progress'), null, null, 'green'],
    [MessageSquareText, 'Waiting for Info', count('Waiting for Info'), null, null, 'purple'],
    [BadgeCheck, 'Completed', count('Completed'), null, null, 'green'],
    [AlertCircle, 'Blocked', count('Blocked'), null, null, 'red'],
  ];
}

const policyStats = [
  [ShieldAlert, 'Total Policies', '1,284', '4.8%', 'vs last 30 days', 'blue'],
  [FileWarning, 'Policies with Data Issues', '37', '6', 'vs last 30 days', 'orange'],
  [AlertCircle, 'Premium Mismatches', '14', '3', 'vs last 30 days', 'red'],
  [CalendarDays, 'Missing Coverage Records', '12', '2', 'vs last 30 days', 'blue'],
  [Activity, 'Policy Status Issues', '11', '1', 'vs last 30 days', 'green'],
];

function StatCards({ stats, label = 'Summary metrics' }) {
  return <section className={`dashboard-stats dashboard-stats-${stats.length}`} aria-label={label}>
    {stats.map(([Icon, label, value, delta, compare, tone]) => (
      <article className="dashboard-stat-card" key={label}>
        <span className={`dashboard-stat-icon tone-${tone}`}><Icon size={20} /></span>
        <div className="dashboard-stat-copy"><span>{label}</span><strong>{value}</strong>{delta !== null && delta !== undefined && <small className={`stat-change ${tone === 'red' || tone === 'orange' ? 'change-alert' : ''}`}>
          <ArrowUpRight size={13} />{delta}<em>{compare}</em>
        </small>}</div>
      </article>
    ))}
  </section>;
}

function StatusPill({ status }) {
  const slug = status.toLowerCase().replaceAll(' ', '-');
  return <span className={`ticket-status status-${slug}`}>{status}</span>;
}

function TicketLink({ ticket, onOpen }) {
  return <button className="ticket-detail-link" aria-label={`View details for ${ticket.ticket_id}`} onClick={() => onOpen(ticket)}>{ticket.ticket_id}</button>;
}

function TicketsTable({ policy = false, tickets = [], onOpenDetails }) {
  const headers = policy
    ? ['Policy #', 'Issue Summary', 'Category', 'Severity', 'Detected On', 'Last Update']
    : ['Ticket #', 'Issue Summary', 'Ticket Status', 'Assigned To', 'Created On', 'Last Update'];
  const rows = policy
    ? [
      ['WC-1001', 'Premium differs from source by $1,000', 'Premium mismatch', 'High', 'Oct 29, 2026', 'Oct 29, 2026'],
      ['WC-2045', 'Coverage record not present in Gold', 'Missing coverage', 'Medium', 'Oct 28, 2026', 'Oct 29, 2026'],
      ['WC-3321', 'Policy status does not match latest transaction', 'Status issue', 'High', 'Oct 28, 2026', 'Oct 29, 2026'],
      ['WC-1187', 'Duplicate policy transaction detected', 'Duplicate', 'Medium', 'Oct 27, 2026', 'Oct 29, 2026'],
      ['WC-4470', 'Policy term dates require review', 'Data quality', 'Low', 'Oct 26, 2026', 'Oct 28, 2026'],
    ]
    : tickets;
  const [notice, setNotice] = useState('');
  return <section className="dashboard-panel dashboard-table-panel">
    <div className="dashboard-panel-heading"><h2>{policy ? 'Recent Policy Issues' : 'Recent Tickets'}</h2><button className="dashboard-text-button" onClick={() => setNotice(policy ? 'The full policy issue list is a demo view for this phase.' : 'The full ticket list is a demo view for this phase.')}>View All<ChevronRight size={15} /></button></div>
    <div className="dashboard-table-scroll"><table className="dashboard-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>{policy ? rows.map((row) => <tr key={row[0]}>{row.map((cell, cellIndex) => <td key={cellIndex} data-label={headers[cellIndex]}>{cellIndex === 3 ? <StatusPill status={cell} /> : cell}</td>)}</tr>) : rows.map((ticket) => <tr key={ticket.ticket_id}>
        <td data-label="Ticket #" className="ticket-id-cell"><TicketLink ticket={ticket} onOpen={onOpenDetails} /></td>
        <td data-label="Issue Summary" className="ticket-summary-cell" title={ticket.issue_summary}><button className="ticket-detail-link ticket-summary-link" onClick={() => onOpenDetails(ticket)}>{ticket.issue_summary}</button></td>
        <td data-label="Ticket Status"><StatusPill status={ticket.ticket_status} /></td>
        <td data-label="Assigned To">{ticket.assigned_to || '—'}</td>
        <td data-label="Created On">{formatIncidentDate(ticket.created_at)}</td>
        <td data-label="Last Update">{formatIncidentDate(ticket.last_updated)}</td>
      </tr>)}{!policy && rows.length === 0 && <tr><td className="ticket-empty-cell" colSpan={6}>No active tickets. All sample requests have been declined.</td></tr>}</tbody>
    </table></div>
    {notice && <div className="dashboard-inline-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button></div>}
  </section>;
}

const ticketStatusVisuals = [
  ['Unassigned', 'orange'],
  ['Assigned', 'teal'],
  ['In Progress', 'green'],
  ['Waiting for Info', 'purple'],
  ['Completed', 'green'],
  ['Blocked', 'red'],
];

function TicketBreakdown({ tickets }) {
  const total = tickets.length;
  const counts = ticketStatusVisuals.map(([status, tone]) => ({
    status,
    tone,
    count: tickets.filter((ticket) => ticket.ticket_status === status).length,
  }));
  let accumulated = 0;
  const colors = { orange: '#f69a32', teal: '#51b5c5', blue: '#2687d9', purple: '#9270c7', green: '#4fc58e', red: '#ef646a' };
  const gradient = total
    ? `conic-gradient(${counts.map(({ tone, count }) => {
      const start = accumulated;
      accumulated += (count / total) * 100;
      return `${colors[tone]} ${start}% ${accumulated}%`;
    }).join(', ')})`
    : 'conic-gradient(#e6edf2 0% 100%)';
  return <section className="dashboard-panel dashboard-breakdown">
    <h2>Tickets by Status</h2>
    <div className="donut-row"><div className="donut-chart" style={{ background: gradient }}><div><strong>{total}</strong><span>Total</span></div></div>
      <ul className="donut-legend">{counts.map(({ status, tone, count }) => <li key={status}><i className={`legend-${tone}`} />{status} <b>{count}</b><small>{total ? `${Math.round((count / total) * 100)}%` : '0%'}</small></li>)}</ul>
    </div>
  </section>;
}

function ActivityPanel({ policy = false, events = [] }) {
  const activityLimit = 6;
  const items = policy ? [
    ['Premium mismatch flagged for WC-1001', '2 hours ago', 'mint'],
    ['Coverage issue identified for WC-2045', '4 hours ago', 'blue'],
    ['Policy status check completed', 'Yesterday', 'blue'],
    ['New data quality review opened', 'Yesterday', 'red'],
  ] : events.slice(0, activityLimit);
  return <section className="dashboard-panel dashboard-activity"><div className="dashboard-panel-heading"><h2>Recent Activity</h2></div>
    {items.length ? <ol>{items.map((event) => {
      const label = Array.isArray(event) ? event[0] : event.message;
      const time = Array.isArray(event) ? event[1] : formatActivityTime(event.timestamp);
      const tone = Array.isArray(event) ? event[2] : event.tone;
      return <li key={Array.isArray(event) ? label : event.id}><i className={`activity-dot dot-${tone}`} /><span>{label}</span><time>{time}</time></li>;
    })}</ol> : <div className="dashboard-empty-activity">Acknowledgements, assignments, and declined requests will appear here.</div>}
  </section>;
}

function TrendPanel() {
  return <section className="dashboard-panel trend-panel"><div className="dashboard-panel-heading"><div><h2>Policy data quality trend</h2><p>Illustrative issue counts over the last 6 months</p></div><button className="period-filter">Last 6 months<ChevronDown size={14} /></button></div>
    <div className="trend-chart"><div className="trend-y-labels"><span>40</span><span>30</span><span>20</span><span>10</span><span>0</span></div><svg viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="Illustrative trend line showing policy data issues"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1482c1" stopOpacity=".18" /><stop offset="1" stopColor="#1482c1" stopOpacity="0" /></linearGradient></defs><path className="trend-area" d="M0 143 C45 131 55 120 100 127 S160 110 200 112 S250 92 300 105 S365 83 400 87 S470 65 500 75 S555 45 600 51 L600 180 L0 180 Z" /><path className="trend-line" d="M0 143 C45 131 55 120 100 127 S160 110 200 112 S250 92 300 105 S365 83 400 87 S470 65 500 75 S555 45 600 51" /></svg><div className="trend-x-labels"><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span></div></div>
  </section>;
}

function IssueCategories() {
  return <section className="dashboard-panel category-panel"><h2>Issue categories</h2><ul><li><span><i className="category-dot legend-blue" />Premium mismatch</span><b>14</b></li><li><span><i className="category-dot legend-orange" />Missing coverage</span><b>12</b></li><li><span><i className="category-dot legend-red" />Status issues</span><b>11</b></li><li><span><i className="category-dot legend-green" />Other data quality</span><b>10</b></li></ul></section>;
}

function AssistantPanel({ onAction }) {
  const [question, setQuestion] = useState('');
  return <aside className="dashboard-assistant">
    <div className="assistant-panel-heading"><Sparkles size={18} /><h2>AI Assistant</h2><ChevronDown size={16} /></div>
    <p>Ask questions, investigate issues, or create and manage Remedy tickets.</p>
    <div className="assistant-shortcuts">{shortcuts.map(([Icon, title, description]) => <button key={title} onClick={() => onAction(title)}><span><Icon size={17} /></span><span><b>{title}</b><small>{description}</small></span></button>)}</div>
    <form className="assistant-ask" onSubmit={(event) => { event.preventDefault(); if (question.trim()) { onAction(`“${question.trim()}” — assistant actions are demo-only for now.`); setQuestion(''); } }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question or describe an issue..." aria-label="Ask the demo assistant" /><button disabled={!question.trim()} aria-label="Submit question"><ArrowUpRight size={17} /></button></form>
  </aside>;
}

function DashboardModal({ modal, onClose, onModal, onAssign, onUnassign, onDecline, onUpdateStatus, onLogin, currentUser }) {
  const [assignee, setAssignee] = useState('');
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  useEffect(() => {
    setAssignee(modal?.ticket?.assigned_to || '');
    setAssigneeMenuOpen(false);
    setSelectedStatus(modal?.ticket?.ticket_status || '');
  }, [modal?.type, modal?.ticket?.ticket_id]);
  if (!modal) return null;

  const ticket = modal.ticket;
  const message = typeof modal === 'string' ? modal : modal.message;
  const relatedPolicies = ticket?.related_policies || (ticket?.policy_number ? [{ policy_number: ticket.policy_number, policy_status: ticket.policy_status }] : []);
  const title = modal.type === 'details' ? ticket.ticket_id
    : modal.type === 'actions' ? 'Ticket actions'
      : modal.type === 'assign' ? (modal.acknowledge ? 'Acknowledge ticket' : 'Assign ticket')
        : modal.type === 'status' ? 'Update ticket status'
        : modal.type === 'resolution_guide' ? 'Suggested investigation'
        : modal.type === 'decline' ? 'Decline this request?'
          : modal.type === 'login' ? 'Sign in to manage this ticket'
          : 'Demo preview';

  function confirmAssignment(event) {
    event.preventDefault();
    if (!assignee || !ticket) return;
    onAssign(ticket, assignee, modal.acknowledge);
    onClose();
  }

  function confirmStatus(event) {
    event.preventDefault();
    if (!selectedStatus || !ticket) return;
    onUpdateStatus(ticket, selectedStatus);
    onClose();
  }

  const isTicketOwner = Boolean(currentUser && ticket?.assigned_to === currentUser);
  const isAdmin = currentUser === 'Admin';
  const canManageTicket = Boolean(isTicketOwner || isAdmin);
  const canTakeTicketAction = Boolean(currentUser && ticket && (!ticket.assigned_to || canManageTicket));
  const hasPreviousModal = ['actions', 'assign', 'status', 'decline', 'login'].includes(modal.type);

  function goBack() {
    if (modal.type === 'actions' || modal.type === 'login') {
      onModal({ type: 'details', ticket });
      return;
    }
    onModal({ type: 'actions', ticket });
  }

  return <div className="dashboard-modal-backdrop" role="presentation" onClick={onClose}><section className={`dashboard-modal${modal.type === 'details' ? ' dashboard-ticket-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dashboard-modal-title" onClick={(event) => event.stopPropagation()}>
    {hasPreviousModal && <button className="dashboard-modal-back" type="button" onClick={goBack} aria-label={modal.type === 'actions' || modal.type === 'login' ? 'Back to ticket details' : 'Back to ticket actions'}><ArrowLeft size={18} /><span>Back</span></button>}
    <button className="dashboard-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
    <span className="dashboard-modal-icon"><Sparkles size={20} /></span>
    <h2 id="dashboard-modal-title">{title}</h2>
    {modal.type === 'details' && <>
      <div className="ticket-detail-heading"><StatusPill status={ticket.ticket_status} /><span>{ticket.issue_category}</span></div>
      <div className="ticket-detail-description"><span>Issue summary</span><p>{ticket.issue_summary}</p><span>Details</span><p>{ticket.issue_description || ticket.issue_summary}</p></div>
      <div className="ticket-detail-section"><h3>Related policies <span>{relatedPolicies.length}</span></h3>{relatedPolicies.length ? <div className="ticket-policy-list">{relatedPolicies.map((policy) => <div className="ticket-policy-item" key={policy.policy_number}><strong>{policy.policy_number}</strong><StatusPill status={policy.policy_status || 'Unknown'} /></div>)}</div> : <p className="ticket-detail-muted">No policy is linked to this incident.</p>}</div>
      <div className="ticket-detail-grid"><div><span>Assigned to</span><strong>{ticket.assigned_to || 'Unassigned'}</strong></div><div><span>Created on</span><strong>{formatIncidentTimestamp(ticket.created_at)}</strong></div><div><span>Last updated</span><strong>{formatIncidentTimestamp(ticket.last_updated)}</strong></div>{ticket.acknowledged_at && <div><span>Acknowledged on</span><strong>{formatIncidentTimestamp(ticket.acknowledged_at)}</strong></div>}</div>
      <div className="ticket-detail-footer"><button className="dashboard-modal-secondary" onClick={onClose}>Close</button>{!currentUser ? <button className="dashboard-modal-done" onClick={() => onModal({ type: 'login', ticket })}><LogIn size={15} />Log in to take action</button> : canTakeTicketAction ? <button className="dashboard-modal-done" onClick={() => onModal({ type: 'actions', ticket })}><Activity size={15} />Take action</button> : null}</div>
    </>}
    {modal.type === 'actions' && <>
      <p className="dashboard-modal-intro">Choose what to do with <strong>{ticket.ticket_id}</strong>.</p>
      <div className="ticket-action-choices">
        {!ticket.assigned_to && <button className="ticket-action-choice-primary" onClick={() => onModal({ type: 'assign', ticket, acknowledge: true })}><Check size={17} /><span><strong>Acknowledge</strong><small>Accept this ticket and assign an owner.</small></span><ChevronRight size={16} /></button>}
        {canManageTicket && <button className="ticket-action-choice-primary" onClick={() => onModal({ type: 'status', ticket })}><Activity size={17} /><span><strong>Update status</strong><small>Set progress, request info, mark blocked, or complete it.</small></span><ChevronRight size={16} /></button>}
        {canManageTicket && <button onClick={() => onModal({ type: 'assign', ticket, acknowledge: false })}><UserRound size={17} /><span><strong>Reassign</strong><small>Choose a new owner for this ticket.</small></span><ChevronRight size={16} /></button>}
        {canManageTicket && <button onClick={() => { onUnassign(ticket); onClose(); }}><X size={16} /><span><strong>Unassign</strong><small>Return this ticket to the unassigned queue.</small></span><ChevronRight size={16} /></button>}
        {canTakeTicketAction && <button className="ticket-action-choice-decline" onClick={() => onModal({ type: 'decline', ticket })}><X size={16} /><span><strong>Decline request</strong><small>Remove it from the active queue and record the decision.</small></span><ChevronRight size={16} /></button>}
      </div>
    </>}
    {modal.type === 'assign' && <form className="ticket-assign-form" onSubmit={confirmAssignment}>
      <p>{modal.acknowledge ? 'Acknowledge this incident and assign an owner.' : `Select a new owner for ${ticket.ticket_id}.`}</p>
      <label htmlFor="ticket-assignee">Assign to</label>
      <div className="dashboard-assignee-picker">
        <button id="ticket-assignee" type="button" className={`dashboard-assignee-trigger${assigneeMenuOpen ? ' is-open' : ''}`} aria-haspopup="listbox" aria-expanded={assigneeMenuOpen} onClick={() => setAssigneeMenuOpen((open) => !open)}>
          <span className={assignee ? '' : 'assignee-placeholder'}>{assignee || 'Select a teammate'}</span><ChevronDown size={16} />
        </button>
        {assigneeMenuOpen && <div className="dashboard-assignee-menu" role="listbox" aria-label="Select a teammate">{assignablePeople.map((person) => <button type="button" role="option" aria-selected={assignee === person} className={assignee === person ? 'selected' : ''} key={person} onClick={() => { setAssignee(person); setAssigneeMenuOpen(false); }}><span className="assignee-avatar">{person.slice(0, 1)}</span><span>{person}{person === ticket.assigned_to ? <small>Current owner</small> : null}</span>{assignee === person && <Check size={15} />}</button>)}</div>}
      </div>
      <div className="dashboard-modal-actions"><button type="button" className="dashboard-modal-secondary" onClick={onClose}>Cancel</button><button type="submit" className="dashboard-modal-done" disabled={!assignee}><Check size={15} />{modal.acknowledge ? 'Acknowledge & assign' : 'Save assignment'}</button></div>
    </form>}
    {modal.type === 'status' && <form className="ticket-status-form" onSubmit={confirmStatus}><p>Choose the current status for <strong>{ticket.ticket_id}</strong>.</p><div className="ticket-status-choices" role="radiogroup" aria-label="Ticket status">{ownerTicketStatuses.map((status) => <button type="button" role="radio" aria-checked={selectedStatus === status.value} className={selectedStatus === status.value ? 'selected' : ''} key={status.value} onClick={() => setSelectedStatus(status.value)}><span className={`status-choice-dot status-${status.value.toLowerCase().replaceAll(' ', '-')}`} /><span><strong>{status.label}</strong><small>{status.description}</small></span>{selectedStatus === status.value && <Check size={15} />}</button>)}</div><div className="dashboard-modal-actions"><button type="button" className="dashboard-modal-secondary" onClick={onClose}>Cancel</button><button type="submit" className="dashboard-modal-done" disabled={!selectedStatus}><Check size={15} />Save status</button></div></form>}
    {modal.type === 'login' && <><p>Sign in with your individual account from the profile menu in the upper-right corner to manage this ticket.</p><button className="dashboard-modal-secondary" onClick={onClose}>Close</button></>}
    {modal.type === 'decline' && <><p>Decline request <strong>{ticket.ticket_id}</strong>? It will leave the active queue and the decision will be recorded in Recent Activity.</p><div className="dashboard-modal-actions"><button className="dashboard-modal-secondary" onClick={onClose}>Cancel</button><button className="dashboard-modal-decline" onClick={() => { onDecline(ticket); onClose(); }}>Decline request</button></div></>}
    {modal.type === 'resolution_guide' && <><IncidentResolutionGuide guide={modal.guide} error={modal.guideError} /><div className="dashboard-modal-actions"><button className="dashboard-modal-secondary" onClick={onClose}>Close</button></div></>}
    {(!modal.type || modal.type === 'notice') && <><p>{message}</p><button className="dashboard-modal-done" onClick={onClose}><Check size={15} /> Got it</button></>}
  </section></div>;
}

function IncidentDashboard({ tickets, activity, onModal, onOpenDetails }) {
  return <><DashboardHeader title="Incident Management" subtitle="Track, investigate and resolve data and policy issues." onCreate={() => onModal('Ticket creation is coming soon. This preview does not create or save tickets.')} />
    <StatCards stats={incidentStats(tickets)} label="Ticket metrics from test data" /><div className="dashboard-primary-grid incident-primary-grid"><TicketsTable tickets={tickets} onOpenDetails={onOpenDetails} /></div><div className="dashboard-lower-grid"><TicketBreakdown tickets={tickets} /><ActivityPanel events={activity} /></div></>;
}

function PolicyDashboard({ onModal }) {
  return <><DashboardHeader title="Policy Dashboard" subtitle="Monitor policy data quality and review illustrative issue trends." />
    <StatCards stats={policyStats} /><div className="dashboard-primary-grid policy-primary-grid"><div className="dashboard-main-column"><TrendPanel /><TicketsTable policy /></div><AssistantPanel onAction={onModal} /></div><div className="dashboard-lower-grid"><IssueCategories /><ActivityPanel policy /></div></>;
}

export function DashboardPage({ page, currentUser, onLogin, onLogout }) {
  const [modal, setModal] = useState('');
  const [incidentState, setIncidentState] = useState({ tickets: [], activity: [] });
  const [incidentError, setIncidentError] = useState('');
  const [incidentLoading, setIncidentLoading] = useState(false);
  const isIncident = page === 'incidents';

  async function refreshIncidentState() {
    setIncidentLoading(true);
    setIncidentError('');
    try {
      const response = await fetch(`/api/incidents?current_user=${encodeURIComponent(currentUser || '')}`);
      const payload = await readIncidentResponse(response);
      if (!response.ok) throw new Error(payload.error || 'Could not load incident tickets.');
      setIncidentState({ tickets: payload.tickets || [], activity: payload.activity || [] });
    } catch (error) {
      setIncidentError(error.message || 'Could not load incident tickets from Databricks.');
    } finally {
      setIncidentLoading(false);
    }
  }

  useEffect(() => {
    if (isIncident) refreshIncidentState();
  }, [isIncident, currentUser]);

  async function mutateTicket(ticket, operation, extra = {}) {
    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mutate', current_user: currentUser, ticket_id: ticket.ticket_id, operation, ...extra }),
      });
      const payload = await readIncidentResponse(response);
      if (!response.ok) throw new Error(payload.error || 'The ticket could not be updated.');
      await refreshIncidentState();
      if (payload.resolution_guidance || payload.resolution_guidance_error) {
        setModal({ type: 'resolution_guide', guide: payload.resolution_guidance, guideError: payload.resolution_guidance_error });
      }
    } catch (error) {
      setModal({ type: 'notice', message: error.message || 'The ticket could not be updated.' });
    }
  }

  function assignTicket(ticket, person, acknowledged = false) {
    return mutateTicket(ticket, acknowledged ? 'acknowledge_assign' : 'assign_to_user', { assignee: person });
  }
  function unassignTicket(ticket) { return mutateTicket(ticket, 'unassign'); }
  function declineTicket(ticket) { return mutateTicket(ticket, 'decline'); }
  function updateTicketStatus(ticket, status) { return mutateTicket(ticket, 'set_status', { status }); }

  return <section className="dashboard-page">
    <div className="dashboard-topbar"><UserAccountMenu currentUser={currentUser} onLogin={onLogin} onLogout={onLogout} /></div>
    <div className="dashboard-content">{isIncident ? incidentError ? <section className="incident-load-error" role="alert"><h2>Incident tickets are unavailable</h2><p>{incidentError}</p><button className="dashboard-modal-done" onClick={refreshIncidentState}>Try again</button></section> : incidentLoading && incidentState.tickets.length === 0 ? <IncidentLoading /> : <IncidentDashboard tickets={incidentState.tickets} activity={incidentState.activity} onModal={(message) => setModal({ type: 'notice', message })} onOpenDetails={(ticket) => setModal({ type: 'details', ticket })} /> : <PolicyDashboard onModal={(message) => setModal({ type: 'notice', message })} />}
      <p className="dashboard-footnote"><Filter size={13} />Incident ticket data is served from Databricks</p>
    </div><DashboardModal modal={modal} onClose={() => setModal(null)} onModal={setModal} onAssign={assignTicket} onUnassign={unassignTicket} onDecline={declineTicket} onUpdateStatus={updateTicketStatus} onLogin={onLogin} currentUser={currentUser} />
  </section>;
}

export function UserAccountMenu({ currentUser, onLogin, onLogout }) {
  const [open, setOpen] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [busyUser, setBusyUser] = useState('');
  const menuRef = useRef(null);
  useEffect(() => {
    function dismiss(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, []);

  async function chooseAccount(person) {
    setBusyUser(person);
    setLoginError('');
    try {
      await onLogin(person);
      setOpen(false);
    } catch (error) {
      setLoginError(error.message || 'Could not switch accounts.');
    } finally {
      setBusyUser('');
    }
  }

  return <div className="user-account-menu" ref={menuRef}>
    <button className={`user-account-trigger${currentUser ? ' is-signed-in' : ''}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
      <span className={`user-account-avatar ${accountAvatarClass(currentUser)}`}>{currentUser ? currentUser[0] : <UserRound size={16} />}</span>
      {currentUser && <span className="user-account-name">{currentUser}</span>}
      {!currentUser && <span className="user-account-name">Log in</span>}
      <ChevronDown size={14} />
    </button>
    {open && <div className="user-account-popover" role="menu">
      <div className="user-account-popover-heading"><span>{currentUser ? 'Switch account' : 'Choose an account'}</span>{currentUser && <strong>Signed in as {currentUser}</strong>}</div>
      {accountNames.map((person) => <button type="button" key={person} role="menuitem" className={currentUser === person ? 'is-current' : ''} disabled={Boolean(busyUser)} onClick={() => chooseAccount(person)}><span className={`user-account-avatar ${accountAvatarClass(person)}`}>{person[0]}</span><span>{person}</span>{busyUser === person ? <span className="account-switch-spinner" aria-label="Switching account" /> : currentUser === person ? <Check size={15} /> : null}</button>)}
      {loginError && <small className="user-account-error" role="alert">{loginError}</small>}
      {currentUser && <button className="user-account-logout" role="menuitem" onClick={() => { onLogout(); setOpen(false); }}><LogOut size={15} />Log out</button>}
      {!currentUser && <small><LogIn size={12} /> Select your account to continue</small>}
    </div>}
  </div>;
}
