import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ClipboardList,
  DollarSign,
  Timer,
  History,
  Menu,
  Search,
  Sparkles,
  SquarePen,
  X,
} from 'lucide-react';
import { DashboardPage, UserAccountMenu } from './Dashboards.jsx';

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
    'Thinking through your question',
    'Finding the right information',
    'Preparing your query',
  ],
  running: [
    'Running your query',
    'Gathering your results',
    'Organizing your results',
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
      <span className="activity-indicator" aria-hidden="true"><i /><i /><i /></span>
      <span key={messageIndex} className="activity-label">{messages[messageIndex]}</span>
      <span className="activity-ellipsis" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
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

function QueryResultView({ question, result }) {
  const summary = getPolicySummary(question, result);
  return summary ? <PolicySummaryCard summary={summary} /> : <QueryResultsTable result={result} />;
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
  const demoUserStorageKey = 'progressive-demo-user-v1';
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = window.localStorage.getItem(demoUserStorageKey);
      return ['Pratik', 'Sarvesh'].includes(stored) ? stored : null;
    } catch {
      return null;
    }
  });
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
    try {
      if (currentUser) window.localStorage.setItem(demoUserStorageKey, currentUser);
      else window.localStorage.removeItem(demoUserStorageKey);
    } catch {
      // Demo sign-in remains usable for the current page if browser storage is unavailable.
    }
  }, [currentUser]);

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
    } catch (error) {
      setAccessError(error.message || 'Could not connect to the application server.');
    }
  }

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content) return;
    const id = activeChatId ?? crypto.randomUUID();
    const userMessage = { id: crypto.randomUUID(), role: 'user', content };
    const assistantId = crypto.randomUUID();
    const assistantMessage = { id: assistantId, role: 'assistant', question: content, content: '', status: 'generating' };

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
      });
    }
  }

  async function executeQuery(chatId, message) {
    updateMessage(chatId, message.id, { status: 'running', content: '' });
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', sql: message.sql }),
      });
      const payload = await readApiResponse(response);
      if (!response.ok) throw new Error(payload.error || 'Databricks query failed.');
      updateMessage(chatId, message.id, { status: 'completed', result: payload });
    } catch (error) {
      updateMessage(chatId, message.id, { status: 'error', content: error.message || 'Databricks could not complete the query.' });
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
          <DashboardPage page={currentPage} currentUser={currentUser} onLogin={setCurrentUser} onLogout={() => setCurrentUser(null)} />
        ) : !activeChat ? (
          <>
          <div className="chat-account-menu"><UserAccountMenu currentUser={currentUser} onLogin={setCurrentUser} onLogout={() => setCurrentUser(null)} /></div>
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
          <div className="chat-account-menu"><UserAccountMenu currentUser={currentUser} onLogin={setCurrentUser} onLogout={() => setCurrentUser(null)} /></div>
          <section className="conversation-view">
            <div className="conversation-scroll">
              <div className="message-list">
                {activeChat.messages.map((message) => (
                  <article className={`message-row message-${message.role}`} key={message.id}>
                    {message.role === 'assistant' && <span className="assistant-avatar"><Sparkles size={14} /></span>}
                    <div className="message-content">
                      <div>{message.content}</div>
                      {message.status === 'generating' && <ActivityStatus status="generating" />}
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
                          {message.status === 'running' && <div className="query-running"><ActivityStatus status="running" /></div>}
                        </section>
                      )}
                      {message.result && (
                        <QueryResultView question={message.question} result={message.result} />
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
