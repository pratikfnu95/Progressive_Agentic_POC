import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  BadgeCheck,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  Activity,
  ClipboardList,
  ClipboardPlus,
  Copy,
  ChevronRight,
  DollarSign,
  FileCode2,
  Asterisk,
  Database,
  Orbit,
  Server,
  Snowflake,
  Sparkles,
  Waves,
  Timer,
  History,
  BookOpenText,
  Menu,
  PartyPopper,
  Paperclip,
  Plus,
  SquarePen,
  Square,
  X,
} from 'lucide-react';
import { DashboardPage, UserAccountMenu, invalidateIncidentSnapshotCache } from './Dashboards.jsx';
import { IncidentResolutionGuide } from './IncidentResolutionGuide.jsx';
import { HowItWorksPage } from './HowItWorksPage.jsx';
import { IncidentTicketForm } from './IncidentTicketForm.jsx';
import { ProgressiveSelect } from './ProgressiveSelect.jsx';

const logoPath = import.meta.env.VITE_PROGRESSIVE_LOGO_PATH || '/assets/progressive-fleet-logo.png';
const sidebarArtworkPath = import.meta.env.VITE_SIDEBAR_ARTWORK_PATH || '/assets/sidebar-illustration.png';

function ConnectorLogo({ name }) {
  if (name === 'Databricks') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 8 3.5-8 3.5-8-3.5L12 3Z" /><path d="m4 10 8 3.5 8-3.5M4 13.5 12 17l8-3.5M4 17l8 3.5 8-3.5" /></svg>;
  if (name === 'Snowflake') return <Snowflake size={16} strokeWidth={2.2} aria-hidden="true" />;
  if (name === 'SQL Server') return <Database size={16} strokeWidth={2.1} aria-hidden="true" />;
  if (name === 'Oracle') return <span className="connector-oracle-wordmark" aria-hidden="true">ORACLE</span>;
  if (name === 'Cosmos DB') return <Orbit size={16} strokeWidth={2.1} aria-hidden="true" />;
  return <Server size={16} strokeWidth={2.1} aria-hidden="true" />;
}

async function readApiResponse(response) {
  try {
    return await response.json();
  } catch {
    return { error: 'The assistant server returned an unreadable response. Check that the backend is running.' };
  }
}

const welcomePrompts = [
  { heading: 'What’s on your mind?', personalizedHeading: 'Hi {name}, what’s on your mind?', placeholder: 'Message...' },
  { heading: 'Ready when you are.', personalizedHeading: 'Ready when you are, {name}. What shall we work on?', placeholder: 'Ask anything...' },
  { heading: 'How can I help today?', personalizedHeading: 'Hi {name}, how can I help today?', placeholder: 'Type a message...' },
  { heading: 'Let’s figure it out.', personalizedHeading: 'Welcome, {name}. What would you like to figure out?', placeholder: 'Start a conversation...' },
  { heading: 'Good to see you. What are we working on?', personalizedHeading: 'Hi {name}, good to see you. What are we working on?', placeholder: 'Tell me what you have in mind...' },
  { heading: 'How’s your day going?', personalizedHeading: 'Good to see you, {name}. What would you like to talk about?', placeholder: 'What would you like to talk about?' },
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

const welcomeStarters = [
  { category: 'Policy data', prompt: 'Compare written premium by state', Icon: DollarSign },
  { category: 'Policy data', prompt: 'Show coverage codes and written premium by policy', Icon: ChartNoAxesColumnIncreasing },
  { category: 'Incident tickets', prompt: 'List all unassigned incident tickets', Icon: ClipboardList },
  { category: 'Incident tickets', prompt: 'Show incident tickets assigned to me', Icon: CircleAlert },
  { category: 'Azure', prompt: 'Explore incoming XML files in Azure Data Lake', Icon: FileCode2, comingSoon: true },
  { category: 'Azure', prompt: 'Review Azure Data Factory Run', Icon: Activity, comingSoon: true },
  { category: 'Jira board', prompt: 'Create a Jira ticket', Icon: ClipboardPlus, comingSoon: true },
  { category: 'Jira board', prompt: 'Explore and track the Jira board', Icon: ChartNoAxesColumnIncreasing, comingSoon: true },
  { category: 'GitHub', prompt: 'Review open pull requests and summarize requested changes', Icon: BookOpenText, comingSoon: true },
  { category: 'GitHub', prompt: 'Check recent deployments and failed workflow runs', Icon: Activity, comingSoon: true },
  { category: 'Confluence', prompt: 'Find knowledge base pages related to an incident', Icon: BookOpenText, comingSoon: true },
  { category: 'Confluence', prompt: 'Review documentation for the latest resolution steps', Icon: FileCode2, comingSoon: true },
  { category: 'Snowflake', prompt: 'Explore available databases, schemas, and tables', Icon: Database, comingSoon: true },
  { category: 'Snowflake', prompt: 'Summarize data trends and flag unusual values', Icon: ChartNoAxesColumnIncreasing, comingSoon: true },
  { category: 'SQL Server', prompt: 'Compare row counts across related tables', Icon: ChartNoAxesColumnIncreasing, comingSoon: true },
  { category: 'SQL Server', prompt: 'Find missing or inconsistent records', Icon: CircleAlert, comingSoon: true },
  { category: 'Oracle', prompt: 'Summarize transaction activity by period', Icon: ChartNoAxesColumnIncreasing, comingSoon: true },
  { category: 'Oracle', prompt: 'Check tables for duplicate or incomplete records', Icon: CircleAlert, comingSoon: true },
  { category: 'Cosmos DB', prompt: 'Explore containers and summarize document fields', Icon: Orbit, comingSoon: true },
  { category: 'Cosmos DB', prompt: 'Find documents with missing fields or unusual values', Icon: CircleAlert, comingSoon: true },
];

const welcomeCategories = [
  { name: 'Policy data', logo: 'majesco' },
  { name: 'Incident tickets', logo: 'servicenow' },
  { name: 'Azure', logo: 'azure' },
  { name: 'Jira board', logo: 'jira' },
  { name: 'GitHub', logo: 'github' },
  { name: 'Confluence', logo: 'confluence' },
  { name: 'Snowflake', logo: 'snowflake' },
  { name: 'SQL Server', logo: 'sql-server' },
  { name: 'Oracle', logo: 'oracle' },
  { name: 'Cosmos DB', logo: 'cosmos-db' },
];

const welcomePlaceholders = [
  'Ask about a workers’ compensation policy…',
  'Which states have the highest written premium?',
  'What coverage codes apply to a policy?',
  'Which incident tickets are assigned to you?',
  'Show unassigned incidents that need an owner.',
  'Summarize a policy’s term and written premium.',
  'Compare written premium across transactions.',
  'Which tickets are waiting for more information?',
  'Show the latest transaction for a policy.',
  'Why might coverage be missing from a policy record?',
];

function WelcomePromptChips({ onSelect }) {
  const [expandedIntegration, setExpandedIntegration] = useState(null);
  const roadmapRef = useRef(null);
  const primaryCategories = welcomeCategories.filter(({ name }) => name === 'Policy data' || name === 'Incident tickets');
  const upcomingCategories = welcomeCategories.filter(({ name }) => !primaryCategories.some((primary) => primary.name === name));
  const integrationGroups = [
    { title: 'Data platforms', names: ['Azure', 'Snowflake', 'SQL Server', 'Oracle', 'Cosmos DB'] },
    { title: 'Team tools', names: ['Jira board', 'GitHub', 'Confluence'] },
  ];

  useEffect(() => {
    if (!expandedIntegration) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!roadmapRef.current?.contains(event.target)) {
        setExpandedIntegration(null);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setExpandedIntegration(null);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [expandedIntegration]);

  return <section className="welcome-starters" aria-label="Suggested questions">
    <div className="welcome-starter-grid">
      {primaryCategories.map(({ name, logo }) => <div className={`welcome-starter-group group-${logo}`} key={name}>
        <div className="welcome-starter-heading">
          <WelcomeCategoryLogo type={logo} />
          <h4>{name}</h4>
        </div>
        {welcomeStarters.filter((starter) => starter.category === name).map(({ prompt, Icon }) => <button type="button" className="welcome-starter" key={prompt} onClick={() => onSelect(prompt)} aria-label={prompt}>
          <Icon size={16} aria-hidden="true" />
          <span><strong>{prompt}</strong></span>
          <ChevronRight size={18} strokeWidth={2.5} aria-hidden="true" />
        </button>)}
      </div>)}
    </div>
    <div className="welcome-roadmap" ref={roadmapRef}>
      <div className="welcome-roadmap-heading">
        <span><span className="welcome-roadmap-title">More integrations</span><span className="welcome-roadmap-description">More data and workflow connections are on the way.</span></span>
      </div>
      <div className="welcome-roadmap-content" id="welcome-roadmap-content">
        {integrationGroups.map(({ title, names }) => <div className="welcome-integration-group" key={title}>
          <h5 className="welcome-integration-group-heading">{title}</h5>
          <div className="welcome-integration-grid">
            {title === 'Data platforms' && <div className="welcome-integration-toggle welcome-integration-connected" aria-label="Databricks connected">
              <span className="connector-logo connector-databricks"><ConnectorLogo name="Databricks" /></span>
              <span><strong>Databricks</strong><small className="welcome-integration-connected-status">Connected</small></span>
            </div>}
            {upcomingCategories.filter(({ name }) => names.includes(name)).map(({ name, logo }) => {
              const isExpanded = expandedIntegration === name;
              return <button
                type="button"
                className={`welcome-integration-toggle${isExpanded ? ' is-expanded' : ''}`}
                key={name}
                onClick={() => setExpandedIntegration(isExpanded ? null : name)}
                aria-expanded={isExpanded}
                aria-controls={`upcoming-${logo}`}
              >
                <WelcomeCategoryLogo type={logo} />
                <span><strong>{name}</strong><small>Coming soon</small></span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>;
            })}
          </div>
        </div>)}
        {expandedIntegration && <div className="welcome-integration-details" id={`upcoming-${welcomeCategories.find(({ name }) => name === expandedIntegration)?.logo}`}>
          <div className="welcome-integration-details-heading">
            <strong>{expandedIntegration}</strong><span>Planned capabilities</span>
          </div>
          <div className="welcome-integration-prompts">
            {welcomeStarters.filter(({ category }) => category === expandedIntegration).map(({ prompt, Icon }) => <div className="welcome-integration-prompt" key={prompt}>
              <Icon size={15} aria-hidden="true" /><span>{prompt}</span><small>Coming soon</small>
            </div>)}
          </div>
        </div>}
      </div>
    </div>
  </section>;
}

function WelcomeCategoryLogo({ type }) {
  if (type === 'majesco') return <span className="welcome-brand-mark majesco-mark" role="img" aria-label="Majesco"><svg viewBox="0 0 96 24" aria-hidden="true"><g fill="none" strokeLinecap="round" strokeWidth="7"><path d="M4 18 16 6" stroke="#83c341"/><path d="m15 18 12-12" stroke="#43bfca"/><path d="m26 18 12-12" stroke="#356eaa"/></g><text x="43" y="17" fill="#30343a" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="500" letterSpacing=".15">majesco</text></svg></span>;
  if (type === 'servicenow') return <span className="welcome-brand-mark servicenow-mark" role="img" aria-label="ServiceNow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.1 18.1A10.1 10.1 0 1 1 19.9 18" fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round"/><path d="M4.1 17.9 6.4 20M19.9 17.9 17.6 20" fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round"/></svg></span>;
  if (type === 'azure') return <span className="welcome-brand-mark azure-mark" aria-label="Microsoft Azure logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.3 2.8 5.1 18.4h5.2l2.5-4.7 4.8 7.5h3.1L13.3 2.8Z" fill="currentColor"/><path d="M10.4 18.4h8.4l-2.1-3.2h-4.6l-1.7 3.2Z" fill="#50a8e8"/></svg></span>;
  if (type === 'github') return <span className="welcome-brand-mark github-mark" role="img" aria-label="GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.08c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.64-1.24-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.61 1.22 3.24.93.1-.73.39-1.22.71-1.5-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.16-3-.12-.29-.5-1.43.11-2.97 0 0 .95-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.1-1.45 3.04-1.15 3.04-1.15.61 1.54.23 2.68.12 2.97.72.78 1.15 1.78 1.15 3.01 0 4.29-2.61 5.23-5.1 5.5.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z"/></svg></span>;
  if (type === 'confluence') return <span className="welcome-brand-mark confluence-mark" role="img" aria-label="Confluence"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5.5" fill="currentColor"/><path fill="#fff" d="M5.5 9.2c1.3-2 2.8-2.5 5.1-1.4l3.1 1.5c1.5.7 2.5.7 3.4-.6l1.5 1.8c-1.4 2-3.1 2.3-5.5 1.2l-3.2-1.5c-1.3-.6-2.2-.6-3 .5L5.5 9.2Z"/><path fill="#fff" d="M18.5 14.8c-1.3 2-2.8 2.5-5.1 1.4l-3.1-1.5c-1.5-.7-2.5-.7-3.4.6l-1.5-1.8c1.4-2 3.1-2.3 5.5-1.2l3.2 1.5c1.3.6 2.2.6 3-.5l1.4 1.5Z"/></svg></span>;
  if (type === 'snowflake') return <span className="welcome-brand-mark snowflake-mark" role="img" aria-label="Snowflake"><Snowflake size={20} strokeWidth={2.2} aria-hidden="true" /></span>;
  if (type === 'sql-server') return <span className="welcome-brand-mark sql-server-mark" role="img" aria-label="SQL Server"><Database size={20} strokeWidth={2.1} aria-hidden="true" /></span>;
  if (type === 'oracle') return <span className="welcome-brand-mark oracle-mark" role="img" aria-label="Oracle"><span>ORACLE</span></span>;
  if (type === 'cosmos-db') return <span className="welcome-brand-mark cosmos-mark" role="img" aria-label="Cosmos DB"><Orbit size={20} strokeWidth={2.1} aria-hidden="true" /></span>;
  return <span className="welcome-brand-mark jira-mark" aria-label="Jira logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 21.2 12 12 21.2 2.8 12 12 2.8Z" fill="currentColor"/><path d="m12 7.2 4.8 4.8-4.8 4.8L7.2 12 12 7.2Z" fill="#fff"/><path d="m12 9.8 2.2 2.2-2.2 2.2L9.8 12 12 9.8Z" fill="currentColor"/></svg></span>;
}

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
  const [copyState, setCopyState] = useState('idle');
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const policyNumberIndex = findColumnIndex(result.columns, ['policy_number']);
  const currencyColumnIndex = findColumnIndex(result.columns, ['currency', 'currency_code']);
  const premiumIndex = findColumnIndex(result.columns, ['written_premium', 'written_premium_total', 'total_written_premium']);
  const distinctPolicies = policyNumberIndex >= 0
    ? new Set(result.rows.map((row) => row[policyNumberIndex]).filter((value) => value != null && String(value).trim()).map(String)).size
    : 0;
  let resultNarrative = '';
  if (policyNumberIndex >= 0 && distinctPolicies > 0) {
    resultNarrative = `I found ${distinctPolicies} distinct ${distinctPolicies === 1 ? 'policy' : 'policies'} in ${result.row_count} returned ${result.row_count === 1 ? 'row' : 'rows'}.`;
  } else {
    resultNarrative = `The query returned ${result.row_count} ${result.row_count === 1 ? 'row' : 'rows'} across ${result.columns.length} ${result.columns.length === 1 ? 'column' : 'columns'}.`;
  }
  if (premiumIndex >= 0 && !result.truncated && result.rows.length) {
    const premiumValues = result.rows.map((row) => row[premiumIndex]);
    const numericPremiums = premiumValues.map((value) => value == null || value === '' ? null : Number(value));
    if (numericPremiums.some((value) => value !== null) && numericPremiums.every((value) => value === null || Number.isFinite(value))) {
      const total = numericPremiums.reduce((sum, value) => sum + (value ?? 0), 0);
      resultNarrative += ` Written premium across these rows totals ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(total)}.`;
    }
  }
  if (result.truncated && premiumIndex >= 0) resultNarrative += ' Results are capped, so a full premium total is not shown.';

  useEffect(() => {
    if (!selectedPolicy) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelectedPolicy(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedPolicy]);

  async function copyResults() {
    const asCell = (value) => value == null ? '' : String(value).replace(/[\t\r\n]+/g, ' ');
    const text = [result.columns, ...result.rows].map((row) => row.map(asCell).join('\t')).join('\n');
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(text);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Clipboard copy failed');
      }
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2200);
    }
  }

  return (
    <>
      <p className="result-narrative">{resultNarrative}</p>
      <section className="query-results" aria-label="Query results">
      <div className="results-heading">
        <div className="results-summary">
          <strong>Results</strong>
          <span>{result.row_count} {result.row_count === 1 ? 'row' : 'rows'}</span>
        </div>
        <div className="results-heading-actions">
          <button
            type="button"
            className={`copy-results-button${copyState === 'copied' ? ' is-copied' : ''}`}
            onClick={copyResults}
            aria-label={copyState === 'copied' ? 'Results copied' : copyState === 'error' ? 'Could not copy results' : 'Copy results'}
            title={copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy results'}
          >
            {copyState === 'copied' ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <span className="results-duration"><Timer size={13} strokeWidth={1.8} />{formatDuration(result.duration_ms)}</span>
        </div>
      </div>
      <div className="results-table-wrap">
        <table>
          <thead><tr>{result.columns.map((column, columnIndex) => {
            const { isDate } = resultColumnKind(column);
            const numeric = isNumericResultColumn(column, result.rows, columnIndex);
            return <th className={numeric ? 'is-numeric' : isDate ? 'is-date' : ''} scope="col" key={column}>{column}</th>;
          })}</tr></thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{row.map((value, columnIndex) => {
                const column = result.columns[columnIndex];
                const { isDate } = resultColumnKind(column);
                const numeric = isNumericResultColumn(column, result.rows, columnIndex);
                const className = numeric ? 'is-numeric' : isDate ? 'is-date' : '';
                return <td className={className} key={columnIndex} title={value == null ? undefined : String(value)}>{columnIndex === policyNumberIndex && value != null && String(value).trim()
                ? <button type="button" className="result-policy-link" onClick={() => setSelectedPolicy({ columns: result.columns, row })}>{String(value)}</button>
                : formatResultCell(value, column, row, currencyColumnIndex)}</td>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.truncated && <div className="results-truncated">Showing the first 200 rows.</div>}
      {selectedPolicy && <div className="policy-result-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPolicy(null); }}>
        <section className="policy-result-modal" role="dialog" aria-modal="true" aria-labelledby="policy-result-title">
          <header><div><small>Policy details from this result</small><h3 id="policy-result-title">{String(selectedPolicy.row[policyNumberIndex])}</h3></div><button type="button" aria-label="Close policy details" onClick={() => setSelectedPolicy(null)}><X size={19} /></button></header>
          <dl>{selectedPolicy.columns.map((column, index) => <div key={`${column}-${index}`}><dt>{column.replaceAll('_', ' ')}</dt><dd>{selectedPolicy.row[index] == null || selectedPolicy.row[index] === '' ? '—' : String(selectedPolicy.row[index])}</dd></div>)}</dl>
          <footer>Details are limited to the columns returned by this query.</footer>
        </section>
      </div>}
      </section>
    </>
  );
}

function QueryResultView({ question, result, responseDurationMs }) {
  const summary = getPolicySummary(question, result);
  const timedResult = { ...result, duration_ms: responseDurationMs ?? result.duration_ms };
  return summary ? <><ResponseTime durationMs={responseDurationMs ?? result.duration_ms} /><PolicySummaryCard summary={summary} /></> : <QueryResultsTable result={timedResult} />;
}

function FollowupSuggestions({ questions, loading, onSelect }) {
  if (loading) return <div className="followup-loading" role="status" aria-live="polite"><CircleDashed size={14} /><span>Finding useful follow-up questions</span><span className="followup-dots" aria-hidden="true">...</span></div>;
  if (!questions?.length) return null;
  return <section className="followup-suggestions" aria-label="Suggested follow-up questions">
    <h3>Explore this result</h3>
    <div>{questions.map((question) => <button type="button" key={question} onClick={() => onSelect(question)}>{question}<ArrowUp size={14} aria-hidden="true" /></button>)}</div>
  </section>;
}

function resultColumnKind(columnName) {
  const column = normalizeColumnName(columnName);
  const isDate = /(date|timestamp|datetime|createdat|updatedat|lastupdated|effective|expiration)/.test(column);
  const isIdentifier = /(policy|ticket|incident|transaction|coverage)?(id|number|code)$/.test(column);
  const isCurrency = !isIdentifier && /(premium|charge|fee|surcharge|payroll|balance|amount|cost|deductible|limit)/.test(column);
  return { isDate, isCurrency, isIdentifier };
}

function isNumericResultColumn(columnName, rows, columnIndex) {
  const { isDate, isCurrency, isIdentifier } = resultColumnKind(columnName);
  if (isDate || isIdentifier) return false;
  if (isCurrency) return true;
  return rows.some((row) => {
    const value = row?.[columnIndex];
    return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value.replace(/,/g, ''))));
  });
}

function formatResultCell(value, columnName, row, currencyColumnIndex) {
  if (value === null || value === undefined || value === '') return '—';
  const { isDate, isCurrency, isIdentifier } = resultColumnKind(columnName);
  if (isDate && typeof value === 'string') {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(dateOnly ? `${value}T12:00:00` : value);
    if (!Number.isNaN(date.getTime())) {
      const options = { month: 'short', day: 'numeric', year: 'numeric' };
      if (!dateOnly && /(?:T|\s)\d{2}:\d{2}/i.test(value)) {
        options.hour = 'numeric';
        options.minute = '2-digit';
      }
      return new Intl.DateTimeFormat('en-US', options).format(date);
    }
  }

  const numericValue = !isIdentifier && (typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value.replace(/,/g, '')) : NaN));
  if (Number.isFinite(numericValue)) {
    if (isCurrency) {
      const currency = currencyColumnIndex >= 0 && /^[A-Z]{3}$/.test(String(row[currencyColumnIndex] || '').toUpperCase())
        ? String(row[currencyColumnIndex]).toUpperCase()
        : 'USD';
      try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(numericValue);
      } catch {
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(numericValue);
      }
    }
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(numericValue);
  }
  return String(value);
}

const incidentChatStatuses = ['In Progress', 'Blocked', 'Waiting for Info', 'Completed'];
const incidentChatAssignees = ['Pratik', 'Sarvesh', 'Madhu', 'Saurabh'];

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

function formatTicketDetailDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date);
}

function ChatTicketDetailsModal({ ticket, onClose }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const statusClass = String(ticket.ticket_status || 'Unknown').toLowerCase().replaceAll(' ', '-');
  const policies = ticket.related_policies || [];
  return <div className="dashboard-modal-backdrop chat-ticket-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="dashboard-modal dashboard-ticket-modal" role="dialog" aria-modal="true" aria-labelledby="chat-ticket-modal-title" onClick={(event) => event.stopPropagation()}>
      <button className="dashboard-modal-close" type="button" onClick={onClose} aria-label="Close ticket details"><X size={18} /></button>
      <span className="dashboard-modal-icon"><ClipboardList size={20} /></span>
      <h2 id="chat-ticket-modal-title">{ticket.ticket_id}</h2>
      <div className="ticket-detail-heading"><span className={`ticket-status status-${statusClass}`}>{ticket.ticket_status || 'Unknown'}</span><span>{ticket.issue_category || 'Incident'}</span></div>
      <div className="ticket-detail-description"><span>Issue summary</span><p>{ticket.issue_summary || 'No summary provided.'}</p><span>Details</span><p>{ticket.issue_description || ticket.issue_summary || 'No additional details provided.'}</p></div>
      <div className="ticket-detail-section"><h3>Related policies <span>{policies.length}</span></h3>
        {policies.length ? <div className="ticket-policy-list">{policies.map((policy) => <div className="ticket-policy-item" key={`${ticket.ticket_id}-${policy.policy_number}`}><strong>{policy.policy_number}</strong><span className={`ticket-status status-${String(policy.policy_status || 'Unknown').toLowerCase().replaceAll(' ', '-')}`}>{policy.policy_status || 'Unknown'}</span></div>)}</div> : <p className="ticket-detail-muted">No policy is linked to this incident.</p>}
      </div>
      <div className="ticket-detail-grid">{ticket.requester_full_name && <div><span>Reported by</span><strong>{ticket.requester_full_name}</strong></div>}{ticket.priority && <div><span>Priority</span><strong>{ticket.priority}</strong></div>}<div><span>Assigned to</span><strong>{ticket.assigned_to || 'Unassigned'}</strong></div><div><span>Created on</span><strong>{formatTicketDetailDate(ticket.created_at)}</strong></div><div><span>Last updated</span><strong>{formatTicketDetailDate(ticket.last_updated)}</strong></div>{ticket.acknowledged_at && <div><span>Acknowledged on</span><strong>{formatTicketDetailDate(ticket.acknowledged_at)}</strong></div>}</div>
      <div className="ticket-detail-footer"><button className="dashboard-modal-secondary" type="button" onClick={onClose}>Close</button></div>
    </section>
  </div>;
}

function IncidentConversationResult({ result, currentUser, onAction, onCreate }) {
  const [editors, setEditors] = useState({});
  const [fieldSelections, setFieldSelections] = useState({});
  const [selectedTicket, setSelectedTicket] = useState(null);
  if (!result) return null;
  if (result.kind === 'clarification') return null;
  if (result.kind === 'action_complete') return <><IncidentActionFeedback feedback={{ tone: 'green', icon: 'completed', title: result.message || 'Ticket updated successfully.', detail: result.ticket && `${result.ticket.ticket_id} · ${result.ticket.ticket_status} · ${result.ticket.assigned_to || 'Unassigned'}` }} />{result.resolution_guidance_pending && <div className="incident-chat-guide-loading"><CircleDashed size={14} /> Preparing an investigation reference…</div>}<IncidentResolutionGuide guide={result.resolution_guidance} error={result.resolution_guidance_error} /></>;
  if (result.kind === 'ticket_creation_form') return <section className="incident-chat-result incident-chat-create-result"><IncidentTicketForm currentUser={currentUser} submitLabel="Create ticket" onSubmit={onCreate} /></section>;

  function ticketCard(ticket) {
    const canManage = currentUser === 'Admin' || ticket.assigned_to === currentUser;
    const canDecline = currentUser && (!ticket.assigned_to || canManage);
    const editor = editors[ticket.ticket_id];
    const statusSlug = String(ticket.ticket_status || 'unknown').toLowerCase().replaceAll(' ', '-');
    const setEditor = (value) => setEditors((current) => ({ ...current, [ticket.ticket_id]: value }));
    return <article className={`incident-chat-ticket incident-ticket-${statusSlug}`} key={ticket.ticket_id}>
      <header><button className="ticket-detail-link" type="button" onClick={() => setSelectedTicket(ticket)}>{ticket.ticket_id}</button><span className={`ticket-status status-${String(ticket.ticket_status).toLowerCase().replaceAll(' ', '-')}`}>{ticket.ticket_status}</span></header>
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
    return <section className="incident-chat-result"><div className="incident-chat-ticket-list">{ticketCardWithoutActions(ticket)}</div><div className="incident-chat-choice-list">{result.statuses.map((status) => <button type="button" key={status} className={editors.selectedStatus === status ? 'selected' : ''} onClick={() => setEditors((current) => ({ ...current, selectedStatus: status }))}><i />{status === 'Waiting for Info' ? 'Request more access' : status}</button>)}</div><button className="incident-chat-primary" type="button" disabled={!editors.selectedStatus} onClick={() => onAction(ticket, 'set_status', { status: editors.selectedStatus })}>Save status</button></section>;
  }

  if (result.kind === 'assignee_selection') {
    const ticket = result.ticket;
    return <section className="incident-chat-result"><div className="incident-chat-ticket-list">{ticketCardWithoutActions(ticket)}</div><ProgressiveSelect label="Assign to" value={editors.assignee || ''} placeholder="Select a teammate" options={result.assignees} onChange={(assignee) => setEditors((current) => ({ ...current, assignee }))} /><button className="incident-chat-primary" type="button" disabled={!editors.assignee} onClick={() => onAction(ticket, ticket.assigned_to ? 'assign_to_user' : 'acknowledge_assign', { assignee: editors.assignee })}>Save assignment</button></section>;
  }

  function ticketCardWithoutActions(ticket) {
    const statusSlug = String(ticket.ticket_status || 'unknown').toLowerCase().replaceAll(' ', '-');
    return <article className={`incident-chat-ticket incident-ticket-${statusSlug}`} key={ticket.ticket_id}><header><button className="ticket-detail-link" type="button" onClick={() => setSelectedTicket(ticket)}>{ticket.ticket_id}</button><span className={`ticket-status status-${statusSlug}`}>{ticket.ticket_status}</span></header><h4>{ticket.issue_summary}</h4><p>{ticket.issue_category} · Assigned to {ticket.assigned_to || 'no one'}</p></article>;
  }

  if (result.kind === 'ticket_list') return <><section className="incident-chat-result">{result.tickets?.length ? <div className="incident-chat-ticket-list">{result.tickets.map(ticketCard)}</div> : <div className="incident-chat-empty">No matching incident tickets were found.</div>}</section>{selectedTicket && <ChatTicketDetailsModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}</>;
  return null;
}

function chooseWelcomePrompt(previousHeading, previousPlaceholder) {
  const options = welcomePrompts.filter(({ heading }) => heading !== previousHeading);
  const placeholders = welcomePlaceholders.filter((placeholder) => placeholder !== previousPlaceholder);
  return {
    ...options[Math.floor(Math.random() * options.length)],
    placeholder: placeholders[Math.floor(Math.random() * placeholders.length)],
  };
}

function BrandLockup({ onClick }) {
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  const brand = !logoUnavailable
    ? <img className="progressive-logo" src={logoPath} alt={onClick ? '' : 'Progressive Fleet'} onError={() => setLogoUnavailable(true)} />
    : <span className="brand-fallback">Progressive Fleet</span>;

  return (
    <div className="brand-lockup">
      {onClick ? <button className="brand-home-button" type="button" onClick={onClick} aria-label="Progressive Fleet — start a new chat" title="New chat">{brand}</button> : brand}
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
  return (
    <aside id="app-sidebar" className={`sidebar${mobileOpen ? ' is-mobile-open' : ''}`}>
      <div className="sidebar-topline">
        <BrandLockup onClick={onNewChat} />
      </div>

      <nav className="sidebar-actions" aria-label="Main navigation">
        <button className={`side-action side-action-primary${currentPage === 'chat' && !activeChatId ? ' side-action-selected' : ''}`} onClick={onNewChat} aria-current={currentPage === 'chat' && !activeChatId ? 'page' : undefined} title="Start a new conversation">
          <SquarePen size={23} strokeWidth={2} />
          <span>New chat</span>
        </button>
        <button className={`side-action${currentPage === 'incidents' ? ' side-action-selected' : ''}`} onClick={() => setCurrentPage('incidents')} aria-current={currentPage === 'incidents' ? 'page' : undefined} title="View incident tickets and activity">
          <ClipboardList size={18} strokeWidth={1.8} />
          <span>Incident Management</span>
        </button>
        <button className={`side-action${currentPage === 'policies' ? ' side-action-selected' : ''}`} onClick={() => setCurrentPage('policies')} aria-current={currentPage === 'policies' ? 'page' : undefined} title="View policy insights">
          <ChartNoAxesColumnIncreasing size={18} strokeWidth={1.8} />
          <span>Policy Dashboard</span>
        </button>
        <button className={`side-action${currentPage === 'guide' ? ' side-action-selected' : ''}`} onClick={() => setCurrentPage('guide')} title="POC walkthrough, current capabilities, and architecture" aria-current={currentPage === 'guide' ? 'page' : undefined}>
          <BookOpenText size={18} strokeWidth={1.8} />
          <span>How this works</span>
        </button>
      </nav>

      <div className="chat-history">
        <div className="history-label"><History size={14} /> Recent conversations</div>
        {chats.length > 0 ? (
          <div className="chat-list">
            {chats.map((chat) => (
              <button
                className={`chat-history-item${activeChatId === chat.id ? ' selected' : ''}`}
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                title={chat.title}
                aria-current={activeChatId === chat.id ? 'page' : undefined}
              >
                <span>{chat.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-history">Your conversations will appear here</div>
        )}
      </div>
      <SidebarArtwork />
    </aside>
  );
}

function Composer({ value, setValue, onSend, onStop, isProcessing = false, placeholder, compact = false }) {
  const textareaRef = useRef(null);
  const modelPickerRef = useRef(null);
  const attachmentPickerRef = useRef(null);
  const attachmentTriggerRef = useRef(null);
  const attachmentMenuRef = useRef(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentMenuPosition, setAttachmentMenuPosition] = useState(null);
  const canSend = value.trim().length > 0;

  useEffect(() => {
    if (!modelMenuOpen && !attachmentMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (modelPickerRef.current?.contains(event.target)) {
        setAttachmentMenuOpen(false);
        return;
      }
      if (attachmentPickerRef.current?.contains(event.target)) {
        setModelMenuOpen(false);
        return;
      }
      if (attachmentMenuRef.current?.contains(event.target)) {
        setModelMenuOpen(false);
        return;
      }
      setModelMenuOpen(false);
      setAttachmentMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setModelMenuOpen(false);
        setAttachmentMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [modelMenuOpen, attachmentMenuOpen]);

  useLayoutEffect(() => {
    if (!attachmentMenuOpen) {
      setAttachmentMenuPosition(null);
      return undefined;
    }
    const placeAttachmentMenu = () => {
      const trigger = attachmentTriggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const menuHeight = attachmentMenuRef.current?.getBoundingClientRect().height || 72;
      const sideGap = 12;
      const width = Math.min(340, window.innerWidth - sideGap * 2);
      const left = Math.min(Math.max(sideGap, bounds.left), window.innerWidth - width - sideGap);
      const below = bounds.bottom + 8;
      const top = below + menuHeight <= window.innerHeight - sideGap
        ? below
        : Math.max(sideGap, bounds.top - menuHeight - 8);
      setAttachmentMenuPosition({ position: 'fixed', top, left, width });
    };
    placeAttachmentMenu();
    window.addEventListener('resize', placeAttachmentMenu);
    window.addEventListener('scroll', placeAttachmentMenu, true);
    return () => {
      window.removeEventListener('resize', placeAttachmentMenu);
      window.removeEventListener('scroll', placeAttachmentMenu, true);
    };
  }, [attachmentMenuOpen]);

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
    if (canSend && !isProcessing) onSend();
  }

  return (
    <form className={`composer${compact ? ' composer-compact' : ''}`} onSubmit={submit}>
      <div className="composer-attachment-picker" ref={attachmentPickerRef}>
        <button
          className="composer-attachment-trigger"
          ref={attachmentTriggerRef}
          type="button"
          onClick={() => setAttachmentMenuOpen((open) => !open)}
          aria-expanded={attachmentMenuOpen}
          aria-haspopup="dialog"
          aria-label="Attachments. Photo and file uploads coming soon."
          title="Attachments coming soon"
        >
          <Plus size={19} strokeWidth={2} aria-hidden="true" />
        </button>
        {attachmentMenuOpen && createPortal(<div className="composer-attachment-menu" ref={attachmentMenuRef} style={attachmentMenuPosition || undefined} role="dialog" aria-label="Attachments">
          <button className="composer-attachment-option" type="button" disabled aria-disabled="true">
            <Paperclip size={17} aria-hidden="true" />
            <span><strong>Add photos &amp; files</strong><small>Upload from computer</small></span>
            <em>Coming soon</em>
          </button>
        </div>, document.body)}
      </div>
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (canSend && !isProcessing) onSend();
          }
        }}
        placeholder={placeholder}
        aria-label="Message"
      />
      <div className="composer-model-picker" ref={modelPickerRef}>
        <button
          className="composer-model-trigger"
          type="button"
          onClick={() => {
            setModelMenuOpen((open) => !open);
          }}
          aria-expanded={modelMenuOpen}
          aria-haspopup="listbox"
          aria-label="Model selection. DeepSeek is active."
        >
          <span>DeepSeek</span>
          <ChevronDown className={modelMenuOpen ? 'is-open' : ''} size={15} aria-hidden="true" />
        </button>
        {modelMenuOpen && <div className="composer-model-menu" role="listbox" aria-label="Available AI models">
          <div className="composer-model-option is-current" role="option" aria-selected="true">
            <span className="composer-model-option-main"><span><strong>DeepSeek</strong><small>Connected</small></span></span>
            <span className="composer-model-status"><Check size={13} /> Active</span>
          </div>
          <div className="composer-model-option is-unavailable" aria-disabled="true">
            <span className="composer-model-option-main"><span><strong>OpenAI GPT-6.1 Sol</strong><small>OpenAI</small></span></span>
            <span className="composer-model-status">Coming soon</span>
          </div>
          <div className="composer-model-option is-unavailable" aria-disabled="true">
            <span className="composer-model-option-main"><span><strong>Claude Sonnet 5</strong><small>Anthropic</small></span></span>
            <span className="composer-model-status">Coming soon</span>
          </div>
          <div className="composer-model-option is-unavailable" aria-disabled="true">
            <span className="composer-model-option-main"><span><strong>Gemini 4 Argon</strong><small>Google</small></span></span>
            <span className="composer-model-status">Coming soon</span>
          </div>
        </div>}
      </div>
      {isProcessing ? (
        <button type="button" className="send-button send-stop" onClick={onStop} aria-label="Stop response" title="Stop response">
          <Square size={13} fill="currentColor" strokeWidth={1.8} />
        </button>
      ) : (
        <button type="submit" className={`send-button${canSend ? ' send-active' : ''}`} aria-label="Send question" disabled={!canSend}>
          <ArrowUp size={19} strokeWidth={2.4} />
        </button>
      )}
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
  const activeRequestsRef = useRef(new Map());
  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const chatIsProcessing = Boolean(activeChat?.messages.some((message) => message.role === 'assistant' && ['generating', 'running'].includes(message.status)));

  function stopActiveRequest() {
    if (!activeChat) return;
    const pending = activeChat.messages.filter((message) => message.role === 'assistant' && ['generating', 'running'].includes(message.status));
    pending.forEach((message) => {
      activeRequestsRef.current.get(message.id)?.abort();
      activeRequestsRef.current.delete(message.id);
      updateMessage(activeChat.id, message.id, {
        status: 'cancelled',
        content: 'Request stopped.',
        followupsLoading: false,
        responseDurationMs: Date.now() - (message.startedAt || message.queryStartedAt || Date.now()),
      });
    });
  }

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
    setWelcomePrompt((current) => chooseWelcomePrompt(current.heading, current.placeholder));
  }

  function openPromptInChat(prompt) {
    setCurrentPage('chat');
    setActiveChatId(null);
    setDraft(prompt);
    setMobileSidebarOpen(false);
    setWelcomePrompt((current) => chooseWelcomePrompt(current.heading, current.placeholder));
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

  async function loadChatIncidentGuidance(chatId, messageId, ticketId) {
    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'investigation_guidance', ticket_id: ticketId }),
      });
      const payload = await readApiResponse(response);
      if (!response.ok) throw new Error(payload.error || 'Suggested investigation steps could not be loaded.');
      setChats((current) => current.map((chat) => chat.id !== chatId ? chat : {
        ...chat,
        messages: chat.messages.map((message) => {
          if (message.id !== messageId) return message;
          if (message.incidentFeedback) return { ...message, incidentFeedback: { ...message.incidentFeedback, resolutionGuideLoading: false, resolutionGuide: payload.resolution_guidance } };
          if (message.incidentResult) return { ...message, incidentResult: { ...message.incidentResult, resolution_guidance_pending: false, resolution_guidance: payload.resolution_guidance } };
          return message;
        }),
      }));
    } catch {
      setChats((current) => current.map((chat) => chat.id !== chatId ? chat : {
        ...chat,
        messages: chat.messages.map((message) => {
          if (message.id !== messageId) return message;
          const error = 'The ticket was updated, but investigation guidance is unavailable right now.';
          if (message.incidentFeedback) return { ...message, incidentFeedback: { ...message.incidentFeedback, resolutionGuideLoading: false, resolutionGuideError: error } };
          if (message.incidentResult) return { ...message, incidentResult: { ...message.incidentResult, resolution_guidance_pending: false, resolution_guidance_error: error } };
          return message;
        }),
      }));
    }
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
    setWelcomePrompt((current) => chooseWelcomePrompt(current.heading));
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
    if (!content || chatIsProcessing) return;
    const id = activeChatId ?? crypto.randomUUID();
    const userMessage = { id: crypto.randomUUID(), role: 'user', content };
    const assistantId = crypto.randomUUID();
    const requestController = new AbortController();
    activeRequestsRef.current.set(assistantId, requestController);
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
        signal: requestController.signal,
      });
      const incidentPayload = await readApiResponse(intentResponse);
      if (!intentResponse.ok && incidentPayload.kind !== 'not_incident') {
        if (incidentPayload.access_required) setAccessGate(incidentPayload.error || 'Enter the application access code to continue.');
        throw new Error(incidentPayload.error || 'The incident assistant could not process that request.');
      }
      if (incidentPayload.kind !== 'not_incident') {
        const ticketCount = incidentPayload.tickets?.length || 0;
        const assistantText = incidentPayload.kind === 'action_complete'
          ? ''
          : incidentPayload.kind === 'ticket_list'
            ? `${incidentPayload.summary || 'Here are the matching tickets.'}${ticketCount ? ` ${ticketCount} ticket${ticketCount === 1 ? '' : 's'} found.` : ''}`
            : incidentPayload.message || incidentPayload.summary || '';
        updateMessage(id, assistantId, {
          content: assistantText,
          status: 'completed',
          responseDurationMs: Date.now() - assistantMessage.startedAt,
          incidentResult: incidentPayload,
        });
        if (incidentPayload.resolution_guidance_pending && incidentPayload.ticket?.ticket_id) {
          void loadChatIncidentGuidance(id, assistantId, incidentPayload.ticket.ticket_id);
        }
        return;
      }
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', question: content }),
        signal: requestController.signal,
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
        schemaContext: payload.schema_context,
        requestId: payload.request_id,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        updateMessage(id, assistantId, { content: 'Request stopped.', status: 'cancelled', responseDurationMs: Date.now() - assistantMessage.startedAt });
        return;
      }
      updateMessage(id, assistantId, {
        content: error.message || 'Could not reach the assistant service. Start the backend and try again.',
        status: 'error',
        responseDurationMs: Date.now() - assistantMessage.startedAt,
      });
    } finally {
      activeRequestsRef.current.delete(assistantId);
    }
  }

  async function createIncidentFromChat(chatId, formMessage, values) {
    const startedAt = Date.now();
    const actionId = crypto.randomUUID();
    const issueTitle = values.issue_summary;
    setChats((current) => current.map((chat) => chat.id !== chatId ? chat : {
      ...chat,
      messages: [...chat.messages,
        { id: crypto.randomUUID(), role: 'user', content: `Create incident ticket: ${issueTitle}` },
        { id: actionId, role: 'assistant', content: `Creating the ticket and assigning it to ${values.assigned_to}…`, status: 'incident_updating', startedAt },
      ],
    }));
    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_ticket', current_user: currentUser, ...values }),
      });
      const payload = await readApiResponse(response);
      if (!response.ok) throw new Error(payload.error || 'The incident ticket could not be created.');
      invalidateIncidentSnapshotCache();
      updateMessage(chatId, formMessage.id, { content: 'Ticket details submitted.', incidentResult: null });
      updateMessage(chatId, actionId, {
        content: '', status: 'completed', responseDurationMs: Date.now() - startedAt,
        incidentResult: {
          kind: 'action_complete', message: payload.message, ticket: payload.ticket,
          resolution_guidance_pending: payload.resolution_guidance_pending,
        },
      });
      if (payload.resolution_guidance_pending && payload.ticket?.ticket_id) {
        void loadChatIncidentGuidance(chatId, actionId, payload.ticket.ticket_id);
      }
      return true;
    } catch (error) {
      updateMessage(chatId, actionId, {
        content: 'Ticket creation could not be completed. See the form for details.',
        status: 'error', responseDurationMs: Date.now() - startedAt,
      });
      throw error;
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
      if (payload.kind === 'action_complete') invalidateIncidentSnapshotCache();
      const status = payload.ticket?.ticket_status || (operation === 'decline' ? 'Declined' : 'Updated');
      const tone = status === 'Blocked' || status === 'Declined' ? 'red' : status === 'Completed' ? 'completed' : status === 'Waiting for Info' ? 'purple' : 'blue';
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
          if (item.id === actionId) return { ...item, content: '', status: 'completed', responseDurationMs: Date.now() - startedAt, incidentFeedback: { tone, icon, title: outcome, detail, resolutionGuide: payload.resolution_guidance, resolutionGuideLoading: Boolean(payload.resolution_guidance_pending), resolutionGuideError: payload.resolution_guidance_error } };
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
      if (payload.resolution_guidance_pending) void loadChatIncidentGuidance(chatId, actionId, ticketId);
    } catch (error) {
      updateMessage(chatId, actionId, { content: '', status: 'error', responseDurationMs: Date.now() - startedAt, incidentFeedback: { tone: 'red', icon: 'error', title: error.message || 'The ticket could not be updated.', detail: `No change was confirmed for ${ticketId}.` } });
    }
  }

  async function executeQuery(chatId, message) {
    const startedAt = Date.now();
    const requestController = new AbortController();
    activeRequestsRef.current.set(message.id, requestController);
    updateMessage(chatId, message.id, { status: 'running', content: '', queryStartedAt: startedAt });
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', sql: message.sql }),
        signal: requestController.signal,
      });
      const payload = await readApiResponse(response);
      if (!response.ok) throw new Error(payload.error || 'Databricks query failed.');
      updateMessage(chatId, message.id, { status: 'completed', result: payload, responseDurationMs: Date.now() - startedAt, followupsLoading: true });
      try {
        const followupResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'suggest_followups',
            question: message.question,
            columns: payload.columns,
            rows: payload.rows,
            row_count: payload.row_count,
            schema_context: message.schemaContext,
          }),
        });
        const followupPayload = await readApiResponse(followupResponse);
        if (!followupResponse.ok) throw new Error(followupPayload.error || 'Could not prepare follow-up questions.');
        updateMessage(chatId, message.id, { followups: followupPayload.questions || [], followupsLoading: false });
      } catch {
        updateMessage(chatId, message.id, { followupsLoading: false });
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        updateMessage(chatId, message.id, { status: 'cancelled', content: 'Query request stopped.', responseDurationMs: Date.now() - startedAt });
        return;
      }
      updateMessage(chatId, message.id, { status: 'error', content: error.message || 'Databricks could not complete the query.', responseDurationMs: Date.now() - startedAt });
    } finally {
      activeRequestsRef.current.delete(message.id);
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
        {currentPage === 'guide' ? (
          <>
            <div className="chat-account-menu"><UserAccountMenu currentUser={currentUser} onLogin={loginIncidentAccount} onLogout={logoutIncidentAccount} /></div>
            <HowItWorksPage onUsePrompt={openPromptInChat} onNavigate={(page) => { setCurrentPage(page); setMobileSidebarOpen(false); }} />
          </>
        ) : currentPage !== 'chat' ? (
          <DashboardPage page={currentPage} currentUser={currentUser} onLogin={loginIncidentAccount} onLogout={logoutIncidentAccount} />
        ) : !activeChat ? (
          <>
          <div className="chat-account-menu"><UserAccountMenu currentUser={currentUser} onLogin={loginIncidentAccount} onLogout={logoutIncidentAccount} /></div>
          <section className="welcome-view">
            <div className="welcome-content">
              <h2 key={`${currentUser || 'guest'}-${welcomePrompt.heading}`}>
                {currentUser && welcomePrompt.personalizedHeading
                  ? welcomePrompt.personalizedHeading.replace('{name}', currentUser)
                  : welcomePrompt.heading}
              </h2>
              <div className="welcome-composer-wrap">
                <Composer
                  value={draft}
                  setValue={setDraft}
                  onSend={() => sendMessage()}
                  placeholder={welcomePrompt.placeholder}
                />
              </div>
              <WelcomePromptChips onSelect={(prompt) => sendMessage(prompt)} />
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
                    {message.role === 'assistant' && (['generating', 'running', 'incident_updating'].includes(message.status) || message.incidentBusyTicket) && <span className="assistant-thinking-mark" aria-hidden="true"><i /><i /><i /></span>}
                    <div className="message-content">
                      <div>{message.content}</div>
                      {message.status === 'generating' && <div className="activity-progress-row"><ActivityStatus status="generating" /><ElapsedTimer startedAt={message.startedAt || Date.now()} /></div>}
                      {message.status === 'incident_updating' && <IncidentUpdatingStatus startedAt={message.startedAt || Date.now()} />}
                      {message.incidentResult && <ResponseTime durationMs={message.responseDurationMs} />}
                      {message.incidentFeedback && <><ResponseTime durationMs={message.responseDurationMs} /><IncidentActionFeedback feedback={message.incidentFeedback} />{message.incidentFeedback.resolutionGuideLoading && <div className="incident-chat-guide-loading"><CircleDashed size={14} /> Preparing an investigation reference…</div>}<IncidentResolutionGuide guide={message.incidentFeedback.resolutionGuide} error={message.incidentFeedback.resolutionGuideError} /></>}
                      {message.incidentResult && <IncidentConversationResult result={message.incidentResult} currentUser={currentUser} onCreate={(values) => createIncidentFromChat(activeChat.id, message, values)} onAction={(ticket, operation, extra) => mutateIncidentFromChat(activeChat.id, message, ticket, operation, extra)} />}
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
                        <>
                          <QueryResultView question={message.question} result={message.result} responseDurationMs={message.responseDurationMs} />
                          <FollowupSuggestions questions={message.followups} loading={message.followupsLoading} onSelect={(question) => sendMessage(question)} />
                        </>
                      )}
                    </div>
                  </article>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
            <div className="conversation-composer-area">
              <Composer value={draft} setValue={setDraft} onSend={() => sendMessage()} onStop={stopActiveRequest} isProcessing={chatIsProcessing} placeholder="Message..." compact />
            </div>
          </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
