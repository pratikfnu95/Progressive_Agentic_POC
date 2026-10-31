import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  BadgeCheck,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  DollarSign,
  Timer,
  History,
  Menu,
  PartyPopper,
  Search,
  Sparkles,
  SquarePen,
  X,
} from 'lucide-react';
import { DashboardPage, UserAccountMenu } from './Dashboards.jsx';
import { IncidentResolutionGuide } from './IncidentResolutionGuide.jsx';

const logoPath = import.meta.env.VITE_PROGRESSIVE_LOGO_PATH || '/assets/progressive-fleet-logo.png';
const sidebarArtworkPath = import.meta.env.VITE_SIDEBAR_ARTWORK_PATH || '/assets/sidebar-illustration.png';
async function readApiResponse(response) {
  try {
    return await response.json();
  } catch {
    return { error: 'The assistant server returned an unreadable response. Check that the backend is running.' };
  }
}

const welcomePrompts = [
  { heading: 'What’s on your mind?', placeholder: 'Message...' },
  { heading: 'Ready when you are.', placeholder: 'Ask anything...' },
  { heading: 'How can I help today?', placeholder: 'Type a message...' },
  { heading: 'Let’s figure it out.', placeholder: 'Start a conversation...' },
  { heading: 'Good to see you. What are we working on?', placeholder: 'Tell me what you have in mind...' },
  { heading: 'How’s your day going?', placeholder: 'What would you like to talk about?' },
];

const activityCopy = {
  generating: [
    'Understanding your request',
    'Checking the available data context',
    'Preparing SQL for your review',
  ],
  running: [
    'Executing the approved query',
    'Retrieving matching records',
    'Preparing your results',
  ],
};

function ActivityStatus({ status }) {
  const messages = activityCopy[status] || activityCopy.generating;
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % messages.length);
    }, 1800);
    return () => window.clearInterval(interval);
  }, [messages.length]);

  return (
    <div className={`activity-status activity-${status}`} role="status" aria-live="polite">
      <span key={messageIndex} className="activity-label">{messages[messageIndex]}</span>
      <span className="activity-ellipsis" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}

function ElapsedTimer({ startedAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, []);
  return <span className="query-elapsed" aria-label={`Elapsed ${formatDuration(now - startedAt)}`}><Timer size={13} strokeWidth={1.8} />{formatDuration(now - startedAt)}</span>;
}

function ResponseTime({ durationMs }) {
  if (durationMs === null || durationMs === undefined) return null;
  return <span className="response-time"><Timer size={13} strokeWidth={1.8} />{formatDuration(durationMs)}</span>;
}

function formatDuration(durationMs) {
  const milliseconds = Math.max(0, Number(durationMs) || 0);
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} sec`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1000);
  return `${minutes} min ${seconds} sec`;
}

function normalizeColumnName(column) {
  return String(column).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumnIndex(columns, names) {
  const candidates = new Set(names.map(normalizeColumnName));
  return columns.findIndex((column) => candidates.has(normalizeColumnName(column)));
}

function nonEmptyValues(rows, columnIndex) {
  if (columnIndex < 0) return [];
  return [...new Set(rows
    .map((row) => row?.[columnIndex])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map((value) => String(value)))];
}

function formatPolicyDate(value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  const raw = String(value);
  const datePart = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = datePart
    ? new Date(Date.UTC(Number(datePart[1]), Number(datePart[2]) - 1, Number(datePart[3])))
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatPolicyMoney(value, currency) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  const currencyCode = String(currency || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(currencyCode)) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount);
    } catch {
      // Show the returned amount and currency code if the code is not supported by Intl.
    }
  }
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}

function sumNumericColumn(rows, columnIndex) {
  if (columnIndex < 0) return null;
  const values = rows
    .map((row) => row?.[columnIndex])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map((value) => Number(String(value).replace(/,/g, '')))
    .filter(Number.isFinite);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function getPolicySummary(question, result) {
  if (!question || !result?.columns?.length || !result?.rows?.length) return null;
  const asksForSummary = /\b(summary|summarize|summarise|overview|snapshot|at a glance)\b/i.test(question);
  if (!asksForSummary || !/\bpolicy\b/i.test(question)) return null;

  const columns = result.columns;
  const rows = result.rows;
  const indexes = {
    policyNumber: findColumnIndex(columns, ['policy_number']),
    revision: findColumnIndex(columns, ['policy_revision_number']),
    effective: findColumnIndex(columns, ['effective_date']),
    expiration: findColumnIndex(columns, ['expiration_date', 'expiry_date']),
    policyStatus: findColumnIndex(columns, ['policy_status']),
    transactionType: findColumnIndex(columns, ['transaction_type']),
    transactionDate: findColumnIndex(columns, ['transaction_date']),
    transactionStatus: findColumnIndex(columns, ['transaction_status']),
    transactionId: findColumnIndex(columns, ['source_transaction_id', 'transaction_id']),
    currency: findColumnIndex(columns, ['currency']),
    writtenPremium: findColumnIndex(columns, ['written_premium_total', 'written_premium']),
    chargesTotal: findColumnIndex(columns, ['charges_total']),
    insuredName: findColumnIndex(columns, ['insured_name', 'business_name']),
  };
  const policyNumbers = nonEmptyValues(rows, indexes.policyNumber);
  if (policyNumbers.length !== 1) return null;

  const periods = [...new Map(rows.map((row) => {
    const effective = indexes.effective >= 0 ? row?.[indexes.effective] : null;
    const expiration = indexes.expiration >= 0 ? row?.[indexes.expiration] : null;
    return [`${effective ?? ''}|${expiration ?? ''}`, { effective, expiration }];
  }).filter(([key]) => key !== '|')).values()];
  const transactionEvents = rows.map((row, index) => ({
    date: indexes.transactionDate >= 0 ? row?.[indexes.transactionDate] : null,
    type: indexes.transactionType >= 0 ? row?.[indexes.transactionType] : null,
    status: indexes.transactionStatus >= 0 ? row?.[indexes.transactionStatus] : null,
    policyStatus: indexes.policyStatus >= 0 ? row?.[indexes.policyStatus] : null,
    revision: indexes.revision >= 0 ? row?.[indexes.revision] : null,
    transactionId: indexes.transactionId >= 0 ? row?.[indexes.transactionId] : null,
    writtenPremium: indexes.writtenPremium >= 0 ? row?.[indexes.writtenPremium] : null,
    chargesTotal: indexes.chargesTotal >= 0 ? row?.[indexes.chargesTotal] : null,
    currency: indexes.currency >= 0 ? row?.[indexes.currency] : null,
    effective: indexes.effective >= 0 ? row?.[indexes.effective] : null,
    expiration: indexes.expiration >= 0 ? row?.[indexes.expiration] : null,
    originalIndex: index,
  })).filter((event) => event.date || event.type || event.status);
  const seenEvents = new Set();
  const uniqueEvents = transactionEvents.filter((event) => {
    const key = [event.date, event.type, event.status, event.policyStatus, event.transactionId, event.revision].join('|');
    if (seenEvents.has(key)) return false;
    seenEvents.add(key);
    return true;
  }).sort((left, right) => String(left.date || '').localeCompare(String(right.date || ''))
    || Number(left.revision || 0) - Number(right.revision || 0)
    || left.originalIndex - right.originalIndex);

  const latestEvent = uniqueEvents.at(-1);
  const latestPolicyStatus = latestEvent?.policyStatus
    ?? [...rows].reverse().map((row) => indexes.policyStatus >= 0 ? row?.[indexes.policyStatus] : null)
      .find((value) => value !== null && value !== undefined && String(value).trim() !== '');
  let statusLabel = 'Not provided';
  if (latestPolicyStatus !== null && latestPolicyStatus !== undefined && String(latestPolicyStatus).trim()) {
    const status = String(latestPolicyStatus).trim();
    if (/cancel/i.test(status)) statusLabel = 'Cancelled';
    else if (/expire|lapse/i.test(status)) statusLabel = 'Expired';
    else if (/active|in[ -]?force|bound|issued/i.test(status)) statusLabel = 'Active';
    else statusLabel = status;
  } else if (/cancel/i.test(String(latestEvent?.type || ''))) {
    statusLabel = 'Cancelled';
  }

  const currencyValues = nonEmptyValues(rows, indexes.currency);
  const singleCurrency = currencyValues.length === 1 ? currencyValues[0] : null;
  const writtenPremiumTotal = sumNumericColumn(rows, indexes.writtenPremium);
  const chargesTotal = sumNumericColumn(rows, indexes.chargesTotal);
  const currencyMismatch = currencyValues.length > 1;
  const aggregateLabel = result.truncated ? 'Partial total; additional transactions were omitted' : `Aggregated across ${rows.length} transaction${rows.length === 1 ? '' : 's'}`;
  const formatAggregate = (total) => currencyMismatch
    ? 'Multiple currencies'
    : total === null
      ? 'Not available in this result'
      : formatPolicyMoney(total, singleCurrency);
  const insuredNames = nonEmptyValues(rows, indexes.insuredName);

  return {
    policyNumber: policyNumbers[0],
    insuredName: insuredNames.length === 1 ? insuredNames[0] : null,
    statusLabel,
    statusTone: /cancel|expire|lapse/i.test(statusLabel) ? 'cancelled' : /active|in[ -]?force|bound|issued/i.test(statusLabel) ? 'active' : 'neutral',
    periods,
    writtenPremium: formatAggregate(writtenPremiumTotal),
    writtenPremiumNote: writtenPremiumTotal === null ? 'Not available in this result' : aggregateLabel,
    charges: formatAggregate(chargesTotal),
    chargesNote: chargesTotal === null ? 'Not available in this result' : aggregateLabel,
    events: uniqueEvents,
  };
}

function PolicySummaryCard({ summary }) {
  const singlePeriod = summary.periods.length === 1 ? summary.periods[0] : null;

  return (
    <section className="policy-summary-card" aria-label={`Policy summary for ${summary.policyNumber}`}>
      <header className="policy-summary-hero">
        <div>
          <span className="policy-summary-kicker">Policy summary</span>
          <h3>{summary.policyNumber}</h3>
          {summary.insuredName && <p>{summary.insuredName}</p>}
        </div>
        <span className={`policy-status-badge status-${summary.statusTone}`}>{summary.statusLabel}</span>
      </header>

      <div className="policy-summary-grid">
        <article className="policy-metric-tile policy-period-tile">
          <div className="policy-metric-label"><CalendarDays size={15} /> Coverage period</div>
          {singlePeriod ? (
            <>
              <div className="policy-date-range">
                <span>{formatPolicyDate(singlePeriod.effective)}</span>
                <span className="policy-date-arrow" aria-hidden="true">→</span>
                <span>{formatPolicyDate(singlePeriod.expiration)}</span>
              </div>
              <div className="policy-calendar-track" aria-hidden="true"><i /><i /></div>
            </>
          ) : summary.periods.length > 1 ? (
            <><strong>{summary.periods.length} policy terms</strong><small>Dates are shown by transaction below.</small></>
          ) : (
            <><strong>Not provided</strong><small>Coverage dates weren’t included in this result.</small></>
          )}
        </article>

        <article className="policy-metric-tile">
          <div className="policy-metric-label"><DollarSign size={15} /> Total written premium</div>
          <strong>{summary.writtenPremium}</strong>
          <small>{summary.writtenPremiumNote}</small>
        </article>

        <article className="policy-metric-tile">
          <div className="policy-metric-label"><DollarSign size={15} /> Fees &amp; surcharges</div>
          <strong>{summary.charges}</strong>
          <small>{summary.chargesNote}</small>
        </article>
      </div>

      <section className="policy-transaction-timeline" aria-label="Policy transaction history">
        <div className="policy-timeline-heading">
          <h4>Transactions</h4>
          <span>{summary.events.length} {summary.events.length === 1 ? 'record' : 'records'}</span>
        </div>
        {summary.events.length ? (
          <ol>
            {summary.events.map((event, index) => (
              <li key={`${event.transactionId || 'event'}-${event.date || index}-${index}`}>
                <span className="policy-timeline-marker" aria-hidden="true" />
                <div className="policy-event-content">
                  <div className="policy-event-topline">
                    <strong>{event.type || 'Policy transaction'}</strong>
                    {event.date && <time>{formatPolicyDate(event.date)}</time>}
                  </div>
                  {(event.status || (event.revision !== null && event.revision !== undefined)) && (
                    <small>{[event.status, event.revision !== null && event.revision !== undefined ? `Revision ${event.revision}` : null].filter(Boolean).join(' · ')}</small>
                  )}
                  {(event.effective || event.expiration) && (
                    <small>Term: {formatPolicyDate(event.effective)} <span aria-hidden="true">→</span> {formatPolicyDate(event.expiration)}</small>
                  )}
                  {event.writtenPremium !== null && event.writtenPremium !== undefined && (
                    <small>Written premium: {formatPolicyMoney(event.writtenPremium, event.currency)}</small>
                  )}
                  {event.chargesTotal !== null && event.chargesTotal !== undefined && (
                    <small>Fees &amp; surcharges: {formatPolicyMoney(event.chargesTotal, event.currency)}</small>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p>Transaction details weren’t included in this result.</p>
        )}
      </section>
    </section>
  );
}

function QueryResultsTable({ result }) {
  return (
    <section className="query-results" aria-label="Query results">
      <div className="results-heading">
        <div className="results-summary">
          <strong>Results</strong>
          <span>{result.row_count} {result.row_count === 1 ? 'row' : 'rows'}</span>
        </div>
        <span className="results-duration"><Timer size={13} strokeWidth={1.8} />{formatDuration(result.duration_ms)}</span>
      </div>
      <div className="results-table-wrap">
        <table>
          <thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{row.map((value, columnIndex) => <td key={columnIndex}>{value == null ? '—' : String(value)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.truncated && <div className="results-truncated">Showing the first 200 rows.</div>}
    </section>
  );
}

function QueryResultView({ question, result, responseDurationMs }) {
  const summary = getPolicySummary(question, result);
  const timedResult = { ...result, duration_ms: responseDurationMs ?? result.duration_ms };
  return summary ? <><ResponseTime durationMs={responseDurationMs ?? result.duration_ms} /><PolicySummaryCard summary={summary} /></> : <QueryResultsTable result={timedResult} />;
}

const incidentChatStatuses = ['In Progress', 'Blocked', 'Waiting for Info', 'Completed'];
const incidentChatAssignees = ['Pratik', 'Sarvesh', 'Madhu', 'Saurabh'];

function ProgressiveSelect({ label, value, options, placeholder, onChange }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  useEffect(() => {
    function dismiss(event) {
      if (!pickerRef.current?.contains(event.target) || event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, []);

  return <label className="incident-chat-picker-label"><span>{label}</span><div className="incident-chat-picker" ref={pickerRef}>
    <button type="button" className={`incident-chat-picker-trigger${open ? ' is-open' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className={value ? '' : 'is-placeholder'}>{value || placeholder}</span><ChevronDown size={15} />
    </button>
    {open && <div className="incident-chat-picker-menu" role="listbox" aria-label={label}>{options.map((option) => <button type="button" role="option" aria-selected={value === option} className={value === option ? 'is-selected' : ''} key={option} onClick={() => { onChange(option); setOpen(false); }}><span>{option === 'Waiting for Info' ? 'Request more access' : option}</span>{value === option && <Check size={15} />}</button>)}</div>}
  </div></label>;
}

function IncidentActionFeedback({ feedback }) {
  if (!feedback) return null;
  const Icon = feedback.icon === 'blocked' ? CircleAlert
    : feedback.icon === 'completed' ? BadgeCheck
      : feedback.icon === 'error' ? CircleAlert
        : PartyPopper;
  return <div className={`incident-action-feedback tone-${feedback.tone || 'blue'}`} role={feedback.tone === 'red' ? 'alert' : 'status'}>
    <span className="incident-action-feedback-icon"><Icon size={17} strokeWidth={2} /></span>
    <span><strong>{feedback.title}</strong>{feedback.detail && <small>{feedback.detail}</small>}</span>
  </div>;
}

function IncidentUpdatingStatus({ startedAt }) {
  return <div className="incident-update-status" role="status" aria-live="polite"><span aria-hidden="true"><i /><i /><i /></span>Saving the ticket update and syncing activity…<ElapsedTimer startedAt={startedAt} /></div>;
}

function IncidentConversationResult({ result, currentUser, onAction }) {
  const [editors, setEditors] = useState({});
  const [fieldSelections, setFieldSelections] = useState({});
  if (!result) return null;
  if (result.kind === 'clarification') return <p className="incident-chat-note">{result.message}</p>;
  if (result.kind === 'action_complete') return <><IncidentActionFeedback feedback={{ tone: 'green', icon: 'completed', title: result.message || 'Ticket updated successfully.', detail: result.ticket && `${result.ticket.ticket_id} · ${result.ticket.ticket_status} · ${result.ticket.assigned_to || 'Unassigned'}` }} /><IncidentResolutionGuide guide={result.resolution_guidance} error={result.resolution_guidance_error} /></>;

  function ticketCard(ticket) {
    const canManage = currentUser === 'Admin' || ticket.assigned_to === currentUser;
    const canDecline = currentUser && (!ticket.assigned_to || canManage);
    const editor = editors[ticket.ticket_id];
    const setEditor = (value) => setEditors((current) => ({ ...current, [ticket.ticket_id]: value }));
    return <article className="incident-chat-ticket" key={ticket.ticket_id}>
      <header><strong>{ticket.ticket_id}</strong><span className={`ticket-status status-${String(ticket.ticket_status).toLowerCase().replaceAll(' ', '-')}`}>{ticket.ticket_status}</span></header>
      <h4>{ticket.issue_summary}</h4>
      <p>{ticket.issue_category} · Assigned to {ticket.assigned_to || 'no one'}</p>
      {ticket.related_policies?.length > 0 && <small className="incident-chat-policies">Policies: {ticket.related_policies.map((policy) => `${policy.policy_number} (${policy.policy_status || 'Unknown'})`).join(', ')}</small>}
      {(currentUser && (!ticket.assigned_to || canManage)) && <div className="incident-chat-ticket-actions">
        {!ticket.assigned_to && <button type="button" onClick={() => onAction(ticket, 'assign_to_me')}>Assign to me</button>}
        {canManage && <button type="button" onClick={() => setEditor(editor === 'status' ? '' : 'status')}>Update status</button>}
        {canManage && <button type="button" onClick={() => setEditor(editor === 'assignee' ? '' : 'assignee')}>Reassign</button>}
        {canManage && <button type="button" onClick={() => onAction(ticket, 'unassign')}>Unassign</button>}
        {canDecline && <button type="button" className="incident-chat-decline" onClick={() => onAction(ticket, 'decline')}>Decline</button>}
      </div>}
      {editor === 'status' && <div className="incident-chat-inline-editor"><ProgressiveSelect label="Status" value={fieldSelections[`status-${ticket.ticket_id}`] || 'In Progress'} options={incidentChatStatuses} onChange={(value) => setFieldSelections((current) => ({ ...current, [`status-${ticket.ticket_id}`]: value }))} /><button type="button" onClick={() => { onAction(ticket, 'set_status', { status: fieldSelections[`status-${ticket.ticket_id}`] || 'In Progress' }); setEditor(''); }}>Save status</button></div>}
      {editor === 'assignee' && <div className="incident-chat-inline-editor"><ProgressiveSelect label="Assign to" value={fieldSelections[`assignee-${ticket.ticket_id}`] ?? ticket.assigned_to ?? ''} placeholder="Select teammate" options={incidentChatAssignees} onChange={(value) => setFieldSelections((current) => ({ ...current, [`assignee-${ticket.ticket_id}`]: value }))} /><button type="button" onClick={() => { const value = fieldSelections[`assignee-${ticket.ticket_id}`] ?? ticket.assigned_to; if (value) onAction(ticket, 'assign_to_user', { assignee: value }); setEditor(''); }}>Save assignment</button></div>}
    </article>;
  }

  if (result.kind === 'status_selection') {
    const ticket = result.ticket;
    return <section className="incident-chat-result"><p className="incident-chat-note">{result.summary}</p><div className="incident-chat-ticket-list">{ticketCardWithoutActions(ticket)}</div><div className="incident-chat-choice-list">{result.statuses.map((status) => <button type="button" key={status} className={editors.selectedStatus === status ? 'selected' : ''} onClick={() => setEditors((current) => ({ ...current, selectedStatus: status }))}><i />{status === 'Waiting for Info' ? 'Request more access' : status}</button>)}</div><button className="incident-chat-primary" type="button" disabled={!editors.selectedStatus} onClick={() => onAction(ticket, 'set_status', { status: editors.selectedStatus })}>Save status</button></section>;
  }

  if (result.kind === 'assignee_selection') {
    const ticket = result.ticket;
    return <section className="incident-chat-result"><p className="incident-chat-note">{result.summary}</p><div className="incident-chat-ticket-list">{ticketCardWithoutActions(ticket)}</div><ProgressiveSelect label="Assign to" value={editors.assignee || ''} placeholder="Select a teammate" options={result.assignees} onChange={(assignee) => setEditors((current) => ({ ...current, assignee }))} /><button className="incident-chat-primary" type="button" disabled={!editors.assignee} onClick={() => onAction(ticket, ticket.assigned_to ? 'assign_to_user' : 'acknowledge_assign', { assignee: editors.assignee })}>Save assignment</button></section>;
  }

  function ticketCardWithoutActions(ticket) {
    return <article className="incident-chat-ticket" key={ticket.ticket_id}><header><strong>{ticket.ticket_id}</strong><span className={`ticket-status status-${String(ticket.ticket_status).toLowerCase().replaceAll(' ', '-')}`}>{ticket.ticket_status}</span></header><h4>{ticket.issue_summary}</h4><p>{ticket.issue_category} · Assigned to {ticket.assigned_to || 'no one'}</p></article>;
  }

  if (result.kind === 'ticket_list') return <section className="incident-chat-result"><p className="incident-chat-note">{result.summary}{result.tickets?.length ? ` ${result.tickets.length} ticket${result.tickets.length === 1 ? '' : 's'} found.` : ''}</p>{result.tickets?.length ? <div className="incident-chat-ticket-list">{result.tickets.map(ticketCard)}</div> : <div className="incident-chat-empty">No matching incident tickets were found.</div>}</section>;
  return null;
}

function chooseWelcomePrompt(previousHeading) {
  const options = welcomePrompts.filter(({ heading }) => heading !== previousHeading);
  return options[Math.floor(Math.random() * options.length)];
}

function BrandLockup() {
  const [logoUnavailable, setLogoUnavailable] = useState(false);

  return (
    <div className="brand-lockup">
      {!logoUnavailable ? (
        <img
          className="progressive-logo"
          src={logoPath}
          alt="Progressive Fleet"
          onError={() => setLogoUnavailable(true)}
        />
      ) : (
        <span className="brand-fallback">Progressive Fleet</span>
      )}
    </div>
  );
}

function SidebarArtwork() {
  const [available, setAvailable] = useState(true);

  return (
    <div className="sidebar-footer">
      {available && (
        <img
          className="sidebar-footer-image"
          src={sidebarArtworkPath}
          alt="Progressive insurance illustration"
          onError={() => setAvailable(false)}
        />
      )}
    </div>
  );
}

function Sidebar({ chats, activeChatId, setActiveChatId, onNewChat, mobileOpen, currentPage, setCurrentPage }) {
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const visibleChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchText.toLowerCase()),
  );

  return (
    <aside id="app-sidebar" className={`sidebar${mobileOpen ? ' is-mobile-open' : ''}`}>
      <div className="sidebar-topline">
        <BrandLockup />
      </div>

      <nav className="sidebar-actions" aria-label="Main navigation">
        <button className="side-action side-action-primary" onClick={onNewChat}>
          <SquarePen size={23} strokeWidth={2} />
          <span>New chat</span>
        </button>
        {searching ? (
          <div className="side-search">
            <Search size={18} />
            <input
              ref={searchRef}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearching(false);
                  setSearchText('');
                }
              }}
            />
            <button className="tiny-icon" onClick={() => { setSearching(false); setSearchText(''); }} aria-label="Close search"><X size={15} /></button>
          </div>
        ) : (
          <button className="side-action" onClick={() => setSearching(true)}>
            <Search size={18} strokeWidth={1.8} />
            <span>Search chats</span>
          </button>
        )}
        <button className={`side-action${currentPage === 'incidents' ? ' side-action-selected' : ''}`} onClick={() => setCurrentPage('incidents')}>
          <ClipboardList size={18} strokeWidth={1.8} />
          <span>Incident Management</span>
        </button>
        <button className={`side-action${currentPage === 'policies' ? ' side-action-selected' : ''}`} onClick={() => setCurrentPage('policies')}>
          <ChartNoAxesColumnIncreasing size={18} strokeWidth={1.8} />
          <span>Policy Dashboard</span>
        </button>
      </nav>

      <div className="chat-history">
        <div className="history-label"><History size={14} /> Recent conversations</div>
        {visibleChats.length > 0 ? (
          <div className="chat-list">
            {visibleChats.map((chat) => (
              <button
                className={`chat-history-item${activeChatId === chat.id ? ' selected' : ''}`}
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                title={chat.title}
              >
                <span>{chat.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-history">{searchText ? 'No conversations found' : 'Your conversations will appear here'}</div>
        )}
      </div>
      <SidebarArtwork />
    </aside>
  );
}

function Composer({ value, setValue, onSend, placeholder, compact = false }) {
  const textareaRef = useRef(null);
  const canSend = value.trim().length > 0;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const height = Math.max(34, Math.min(textarea.scrollHeight, 180));
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? 'auto' : 'hidden';
  }, [value]);

  function submit(event) {
    event.preventDefault();
    if (canSend) onSend();
  }

  return (
    <form className={`composer${compact ? ' composer-compact' : ''}`} onSubmit={submit}>
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        placeholder={placeholder}
        aria-label="Message"
      />
      <button type="submit" className={`send-button${canSend ? ' send-active' : ''}`} aria-label="Send question" disabled={!canSend}>
        <ArrowUp size={19} strokeWidth={2.4} />
      </button>
    </form>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [draft, setDraft] = useState('');
  const [welcomePrompt, setWelcomePrompt] = useState(() => chooseWelcomePrompt());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('chat');
  const [accessGate, setAccessGate] = useState(null);
  const [accessCode, setAccessCode] = useState('');
  const [accessError, setAccessError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  const messagesEndRef = useRef(null);
  const activeChat = chats.find((chat) => chat.id === activeChatId);

  useEffect(() => {
    let active = true;
    fetch('/api/chat')
      .then(async (response) => {
        const payload = await readApiResponse(response);
        if (!active) return;
        if (response.status === 401 || response.status === 503) {
          setAccessGate(payload.error || 'Enter the application access code to continue.');
        } else if (response.ok) {
          setAccessGate(payload.authenticated ? null : 'Enter the application access code to continue.');
        }
      })
      .catch(() => {})
      .finally(() => active && setCheckingSession(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    fetch('/api/incidents?action=session')
      .then(async (response) => {
        const payload = await readApiResponse(response);
        if (response.ok) setCurrentUser(payload.current_user || null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        startNewChat();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  function startNewChat() {
    setCurrentPage('chat');
    setActiveChatId(null);
    setDraft('');
    setMobileSidebarOpen(false);
    setWelcomePrompt((current) => chooseWelcomePrompt(current.heading));
  }

  function selectChat(chatId) {
    setCurrentPage('chat');
    setActiveChatId(chatId);
    setMobileSidebarOpen(false);
  }

  function updateMessage(chatId, messageId, changes) {
    setChats((current) => current.map((chat) => chat.id === chatId
      ? { ...chat, messages: chat.messages.map((message) => message.id === messageId ? { ...message, ...changes } : message) }
      : chat));
  }

  async function submitAccessCode(event) {
    event.preventDefault();
    setAccessError('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', password: accessCode }),
      });
      const payload = await readApiResponse(response);
      if (!response.ok) throw new Error(payload.error || 'Could not verify the access code.');
      setAccessCode('');
      setAccessGate(null);
      const identityResponse = await fetch('/api/incidents?action=session');
      const identity = await readApiResponse(identityResponse);
      if (identityResponse.ok) setCurrentUser(identity.current_user || null);
    } catch (error) {
      setAccessError(error.message || 'Could not connect to the application server.');
    }
  }

  async function loginIncidentAccount(user) {
    const response = await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', user }),
    });
    const payload = await readApiResponse(response);
    if (!response.ok) throw new Error(payload.error || 'Could not sign in to this account.');
    setCurrentUser(payload.current_user);
    return payload;
  }

  async function logoutIncidentAccount() {
    try {
      await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } finally {
      setCurrentUser(null);
    }
  }

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content) return;
    const id = activeChatId ?? crypto.randomUUID();
    const userMessage = { id: crypto.randomUUID(), role: 'user', content };
    const assistantId = crypto.randomUUID();
    const assistantMessage = { id: assistantId, role: 'assistant', question: content, content: '', status: 'generating', startedAt: Date.now() };

    setChats((current) => {
      const existing = current.find((chat) => chat.id === id);
      if (existing) {
        return current.map((chat) => chat.id === id
          ? { ...chat, messages: [...chat.messages, userMessage, assistantMessage] }
          : chat);
      }
      return [{ id, title: content.length > 38 ? `${content.slice(0, 38).trimEnd()}…` : content, messages: [userMessage, assistantMessage] }, ...current];
    });
    setActiveChatId(id);
    setDraft('');
    try {
      const intentResponse = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', current_user: currentUser, message: content }),
      });
      const incidentPayload = await readApiResponse(intentResponse);
      if (!intentResponse.ok && incidentPayload.kind !== 'not_incident') {
        if (incidentPayload.access_required) setAccessGate(incidentPayload.error || 'Enter the application access code to continue.');
        throw new Error(incidentPayload.error || 'The incident assistant could not process that request.');
      }
      if (incidentPayload.kind !== 'not_incident') {
        updateMessage(id, assistantId, {
          content: incidentPayload.message || incidentPayload.summary || '',
          status: 'completed',
          responseDurationMs: Date.now() - assistantMessage.startedAt,
          incidentResult: incidentPayload,
        });
        return;
      }
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', question: content }),
      });
      const payload = await readApiResponse(response);
      if (!response.ok) {
        if (response.status === 401 || response.status === 503) setAccessGate(payload.error);
        throw new Error(payload.error || 'SQL generation failed.');
      }
      updateMessage(id, assistantId, {
        content: 'Your query is ready. Review it below and approve it to see the results.',
        status: 'validated',
        sql: payload.sql,
        tables: payload.tables,
        requestId: payload.request_id,
      });
    } catch (error) {
      updateMessage(id, assistantId, {
        content: error.message || 'Could not reach the assistant service. Start the backend and try again.',
        status: 'error',
        responseDurationMs: Date.now() - assistantMessage.startedAt,
      });
    }
  }

  async function mutateIncidentFromChat(chatId, message, ticket, operation, extra = {}) {
    const startedAt = Date.now();
    const actionId = crypto.randomUUID();
    const ticketId = ticket.ticket_id;
    const requestedStatus = extra.status === 'Waiting for Info' ? 'Request more access' : extra.status;
    const assignee = extra.assignee || (operation === 'assign_to_me' ? currentUser : '');
    const actionText = operation === 'set_status' ? `Update ${ticketId} status to ${requestedStatus}`
      : operation === 'assign_to_me' || operation === 'acknowledge_assign' ? `Assign ${ticketId} to ${assignee || 'the selected teammate'}`
        : operation === 'assign_to_user' ? `Reassign ${ticketId} to ${assignee || 'the selected teammate'}`
          : operation === 'unassign' ? `Unassign ${ticketId}`
            : operation === 'decline' ? `Decline ${ticketId}`
              : `Update ${ticketId}`;
    const progressText = operation === 'set_status'
      ? `Updating ${ticketId} to ${requestedStatus}.`
      : operation === 'decline' ? `Declining ${ticketId}.` : `Updating assignment for ${ticketId}.`;
    const actionUserMessage = { id: crypto.randomUUID(), role: 'user', content: actionText };
    const actionAssistantMessage = { id: actionId, role: 'assistant', content: progressText, status: 'incident_updating', startedAt };
    setChats((current) => current.map((chat) => chat.id === chatId
      ? { ...chat, messages: [...chat.messages, actionUserMessage, actionAssistantMessage] }
      : chat));
    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mutate', current_user: currentUser, ticket_id: ticket.ticket_id, operation, ...extra }),
      });
      const payload = await readApiResponse(response);
      if (!response.ok) throw new Error(payload.error || 'The ticket could not be updated.');
      const status = payload.ticket?.ticket_status || (operation === 'decline' ? 'Declined' : 'Updated');
      const tone = status === 'Blocked' || status === 'Declined' ? 'red' : status === 'Completed' ? 'green' : status === 'Waiting for Info' ? 'purple' : 'blue';
      const icon = status === 'Blocked' || status === 'Declined' ? 'blocked' : status === 'Completed' ? 'completed' : 'party';
      const outcome = operation === 'set_status' ? `${ticketId} updated successfully — ${status === 'Waiting for Info' ? 'Request more access' : status}.`
        : operation === 'decline' ? `${ticketId} was declined.`
          : operation === 'unassign' ? `${ticketId} is now unassigned.`
            : `${ticketId} assigned successfully${payload.ticket?.assigned_to ? ` to ${payload.ticket.assigned_to}` : ''}.`;
      const detail = payload.ticket
        ? `${payload.ticket.ticket_id} · ${payload.ticket.ticket_status} · ${payload.ticket.assigned_to || 'Unassigned'}`
        : operation === 'decline' ? 'Removed from the active ticket queue.' : '';
      setChats((current) => current.map((chat) => chat.id !== chatId ? chat : {
        ...chat,
        messages: chat.messages.map((item) => {
          if (item.id === actionId) return { ...item, content: '', status: 'completed', responseDurationMs: Date.now() - startedAt, incidentFeedback: { tone, icon, title: outcome, detail, resolutionGuide: payload.resolution_guidance, resolutionGuideError: payload.resolution_guidance_error } };
          if (item.id !== message.id) return item;
          const prior = item.incidentResult || {};
          const oldTickets = prior.tickets || (prior.ticket ? [prior.ticket] : []);
          const tickets = payload.ticket
            ? oldTickets.some((row) => row.ticket_id === ticketId)
              ? oldTickets.map((row) => row.ticket_id === ticketId ? payload.ticket : row)
              : [...oldTickets, payload.ticket]
            : oldTickets.filter((row) => row.ticket_id !== ticketId);
          const nextResult = prior.kind === 'ticket_list'
            ? { ...prior, tickets, activity: payload.activity || prior.activity }
            : { kind: 'ticket_list', summary: 'Current ticket details:', tickets: payload.ticket ? [payload.ticket] : [], activity: payload.activity || prior.activity };
          return { ...item, incidentResult: nextResult };
        }),
      }));
    } catch (error) {
      updateMessage(chatId, actionId, { content: '', status: 'error', responseDurationMs: Date.now() - startedAt, incidentFeedback: { tone: 'red', icon: 'error', title: error.message || 'The ticket could not be updated.', detail: `No change was confirmed for ${ticketId}.` } });
    }
  }

  async function executeQuery(chatId, message) {
    const startedAt = Date.now();
    updateMessage(chatId, message.id, { status: 'running', content: '', queryStartedAt: startedAt });
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', sql: message.sql }),
      });
      const payload = await readApiResponse(response);
      if (!response.ok) throw new Error(payload.error || 'Databricks query failed.');
      updateMessage(chatId, message.id, { status: 'completed', result: payload, responseDurationMs: Date.now() - startedAt });
    } catch (error) {
      updateMessage(chatId, message.id, { status: 'error', content: error.message || 'Databricks could not complete the query.', responseDurationMs: Date.now() - startedAt });
    }
  }

  if (accessGate) {
    return (
      <main className="access-screen">
        <div className="access-card">
          <BrandLockup />
          <h1>Progressive AI</h1>
          <p>{accessGate}</p>
          <form onSubmit={submitAccessCode}>
            <input
              type="password"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder="Application access code"
              aria-label="Application access code"
              autoComplete="current-password"
              autoFocus
            />
            <button type="submit" disabled={!accessCode}>Continue</button>
          </form>
          {accessError && <div className="access-error" role="alert">{accessError}</div>}
          {checkingSession && <span className="access-hint">Checking secure session…</span>}
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      {mobileSidebarOpen && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="Close navigation menu"
        />
      )}
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        setActiveChatId={selectChat}
        onNewChat={startNewChat}
        mobileOpen={mobileSidebarOpen}
        currentPage={currentPage}
        setCurrentPage={(page) => { setCurrentPage(page); setMobileSidebarOpen(false); }}
      />

      <main className="main-panel">
        <button
          className="mobile-sidebar-toggle"
          type="button"
          onClick={() => setMobileSidebarOpen((open) => !open)}
          aria-label={mobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileSidebarOpen}
          aria-controls="app-sidebar"
        >
          <Menu size={21} strokeWidth={1.8} />
        </button>
        {currentPage !== 'chat' ? (
          <DashboardPage page={currentPage} currentUser={currentUser} onLogin={loginIncidentAccount} onLogout={logoutIncidentAccount} />
        ) : !activeChat ? (
          <>
          <div className="chat-account-menu"><UserAccountMenu currentUser={currentUser} onLogin={loginIncidentAccount} onLogout={logoutIncidentAccount} /></div>
          <section className="welcome-view">
            <div className="welcome-content">
              <h2 key={welcomePrompt.heading}>{welcomePrompt.heading}</h2>
              <div className="welcome-composer-wrap">
                <Composer
                  value={draft}
                  setValue={setDraft}
                  onSend={() => sendMessage()}
                  placeholder={welcomePrompt.placeholder}
                />
              </div>
            </div>
          </section>
          </>
        ) : (
          <>
          <div className="chat-account-menu"><UserAccountMenu currentUser={currentUser} onLogin={loginIncidentAccount} onLogout={logoutIncidentAccount} /></div>
          <section className="conversation-view">
            <div className="conversation-scroll">
              <div className="message-list">
                {activeChat.messages.map((message) => (
                  <article className={`message-row message-${message.role}`} key={message.id}>
                    {message.role === 'assistant' && <span className="assistant-avatar"><Sparkles size={14} /></span>}
                    <div className="message-content">
                      <div>{message.content}</div>
                      {message.status === 'generating' && <div className="activity-progress-row"><ActivityStatus status="generating" /><ElapsedTimer startedAt={message.startedAt || Date.now()} /></div>}
                      {message.status === 'incident_updating' && <IncidentUpdatingStatus startedAt={message.startedAt || Date.now()} />}
                      {message.incidentResult && <ResponseTime durationMs={message.responseDurationMs} />}
                      {message.incidentFeedback && <><ResponseTime durationMs={message.responseDurationMs} /><IncidentActionFeedback feedback={message.incidentFeedback} /><IncidentResolutionGuide guide={message.incidentFeedback.resolutionGuide} error={message.incidentFeedback.resolutionGuideError} /></>}
                      {message.incidentResult && <IncidentConversationResult result={message.incidentResult} currentUser={currentUser} onAction={(ticket, operation, extra) => mutateIncidentFromChat(activeChat.id, message, ticket, operation, extra)} />}
                      {message.incidentBusyTicket && <ActivityStatus status="running" />}
                      {message.sql && (
                        <section className="sql-review" aria-label="Generated SQL review">
                          <div className="sql-review-heading">
                            <span>{message.status === 'completed' ? 'Results ready' : message.status === 'running' ? 'Working on your results' : 'Review your query'}</span>
                            <span className="sql-row-cap">Up to 200 rows</span>
                          </div>
                          <pre><code>{message.sql}</code></pre>
                          {message.tables?.length > 0 && (
                            <div className="sql-table-scope">Tables: {message.tables.map((table) => table.split('.').at(-1)).join(', ')}</div>
                          )}
                          {message.status === 'validated' && (
                            <button className="run-query-button" onClick={() => executeQuery(activeChat.id, message)}>
                              Approve &amp; run query
                            </button>
                          )}
                          {message.status === 'running' && <div className="query-running"><ActivityStatus status="running" /><ElapsedTimer startedAt={message.queryStartedAt || Date.now()} /></div>}
                        </section>
                      )}
                      {message.result && (
                        <QueryResultView question={message.question} result={message.result} responseDurationMs={message.responseDurationMs} />
                      )}
                    </div>
                  </article>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
            <div className="conversation-composer-area">
              <Composer value={draft} setValue={setDraft} onSend={() => sendMessage()} placeholder="Message..." compact />
            </div>
          </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
