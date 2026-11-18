import { useEffect, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Bot, Check, CircleDot, Clock3, Inbox,
  KeyRound, Mail, Radio, RefreshCw, Send, Server, ShieldCheck, Sparkles, TicketCheck,
  TriangleAlert,
} from 'lucide-react';
import { UserAccountMenu } from './Dashboards.jsx';

const workflow = [
  { key: 'email', label: 'Email received', caption: 'Outlook inbox', icon: Mail },
  { key: 'intent', label: 'Intent & context', caption: 'AI extraction', icon: Sparkles },
  { key: 'duplicate', label: 'Duplicate check', caption: 'Jira validation', icon: ShieldCheck },
  { key: 'jira', label: 'Jira ticket', caption: 'Create issue', icon: TicketCheck },
  { key: 'notify', label: 'Requester update', caption: 'Acknowledgement', icon: Send },
];

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function statusText(status) {
  if (status === 'checking') return 'Inbox check in progress';
  if (status === 'error') return 'Needs attention';
  if (status === 'manual') return 'Ready for manual check';
  return 'Agent unavailable';
}

function StepMark({ status }) {
  if (status === 'complete' || status === 'duplicate') return <span className={`agent-step-mark is-${status}`}><Check size={14} strokeWidth={3} /></span>;
  if (status === 'active') return <span className="agent-step-mark is-active"><CircleDot size={16} /></span>;
  if (status === 'failed') return <span className="agent-step-mark is-failed"><TriangleAlert size={14} /></span>;
  if (status === 'skipped') return <span className="agent-step-mark is-skipped">–</span>;
  return <span className="agent-step-mark is-waiting"><span /></span>;
}

export function AgentCatalog({ currentUser, onLogin, onLogout, onOpenIncident, onOpenHowItWorks }) {
  return (
    <section className="dashboard-page agent-workspace-page agent-catalog-page">
      <div className="dashboard-topbar">
        <UserAccountMenu currentUser={currentUser} onLogin={onLogin} onLogout={onLogout} onOpenHowItWorks={onOpenHowItWorks} />
      </div>
      <div className="dashboard-content agent-workspace-content">
        <header className="dashboard-header agent-workspace-header">
          <div>
            <div className="agent-workspace-eyebrow"><Bot size={15} /> Agent Workspace</div>
            <h1>Choose an agent</h1>
            <p>Explore the agents available in your Progressive workspace.</p>
          </div>
        </header>
        <div className="agent-catalog-grid">
          <button className="agent-catalog-card is-available" type="button" onClick={onOpenIncident}>
            <span className="agent-catalog-icon"><Bot size={23} /></span>
            <span className="agent-catalog-card-content">
              <span className="agent-catalog-card-title">Incident Management Agent <span className="agent-catalog-status">Available</span></span>
              <span className="agent-catalog-description">Reviews new Outlook email, extracts incident context, checks for duplicates, and creates Jira tickets.</span>
              <span className="agent-catalog-flow">Outlook <ArrowRight size={14} /> AI analysis <ArrowRight size={14} /> Jira</span>
            </span>
            <ArrowRight className="agent-catalog-open" size={19} />
          </button>
          <article className="agent-catalog-card is-coming-soon" aria-disabled="true">
            <span className="agent-catalog-icon"><Server size={23} /></span>
            <span className="agent-catalog-card-content">
              <span className="agent-catalog-card-title">Pipeline Monitoring Agent <span className="agent-catalog-status">Coming soon</span></span>
              <span className="agent-catalog-description">Future monitoring for ADF, Informatica, AODS, and other data pipelines.</span>
              <span className="agent-catalog-flow">Pipeline health <span className="agent-catalog-dot">·</span> Failures <span className="agent-catalog-dot">·</span> Alerts</span>
            </span>
            <span className="agent-catalog-lock" aria-hidden="true">Coming soon</span>
          </article>
        </div>
      </div>
    </section>
  );
}

export function AgentWorkspace({ currentUser, onLogin, onLogout, onBack, onOpenHowItWorks }) {
  const [configuration, setConfiguration] = useState(null);
  const [connectionResults, setConnectionResults] = useState({});
  const [testingProvider, setTestingProvider] = useState('');
  const [configurationError, setConfigurationError] = useState('');
  const [outlookAuth, setOutlookAuth] = useState(null);
  const [startingOutlookAuth, setStartingOutlookAuth] = useState(false);
  const [outlookAuthError, setOutlookAuthError] = useState('');
  const [agent, setAgent] = useState(null);
  const [checkMessage, setCheckMessage] = useState('');
  const [checkError, setCheckError] = useState('');

  async function refreshAgentStatus() {
    try {
      const response = await fetch('/api/agent-workspace/status', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to view agent activity.' : 'Agent status is unavailable.');
      setAgent(await response.json());
    } catch (error) {
      setAgent((current) => current || { monitor_status: 'offline', error: error.message });
    }
  }

  async function checkInboxNow() {
    setCheckError('');
    setCheckMessage('Checking the inbox window…');
    try {
      const response = await fetch('/api/agent-workspace/check-inbox', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The inbox check could not complete.');
      const windowText = result.window_start && result.window_end ? ` Window ${formatDateTime(result.window_start)}–${formatDateTime(result.window_end)}.` : '';
      setCheckMessage(`${result.message || 'Inbox check complete.'}${windowText}`);
      await refreshAgentStatus();
    } catch (error) {
      setCheckError(error.message || 'The inbox check could not complete.');
      setCheckMessage('');
      await refreshAgentStatus();
    }
  }

  async function testConnection(provider) {
    setTestingProvider(provider);
    try {
      const response = await fetch('/api/agent-workspace/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const result = await response.json();
      setConnectionResults((current) => ({
        ...current,
        [provider]: { ...result, connected: response.ok && Boolean(result.connected) },
      }));
    } catch (error) {
      setConnectionResults((current) => ({
        ...current,
        [provider]: { connected: false, message: error.message || 'Could not reach the application server.' },
      }));
    } finally {
      setTestingProvider('');
    }
  }

  async function connectOutlook() {
    setStartingOutlookAuth(true);
    setOutlookAuthError('');
    setOutlookAuth(null);
    try {
      const response = await fetch('/api/agent-workspace/outlook/auth/start', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not start Microsoft sign-in.');
      setOutlookAuth(result);
      if (result.status === 'connected') await testConnection('outlook');
    } catch (error) {
      setOutlookAuthError(error.message || 'Could not start Microsoft sign-in.');
    } finally {
      setStartingOutlookAuth(false);
    }
  }

  useEffect(() => {
    refreshAgentStatus();
    const timer = window.setInterval(refreshAgentStatus, 2000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/agent-workspace/integrations', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load integration settings.');
        if (active) setConfiguration(payload);
      })
      .catch((error) => { if (active) setConfigurationError(error.message || 'Could not load integration settings.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!configuration) return;
    if (configuration.outlook?.configured) testConnection('outlook');
    if (configuration.jira?.configured) testConnection('jira');
    // Verify both configured integrations when the workspace opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuration]);

  useEffect(() => {
    if (!outlookAuth?.flow_id || outlookAuth.status !== 'pending') return undefined;
    let active = true;
    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/agent-workspace/outlook/auth/status?flow_id=${encodeURIComponent(outlookAuth.flow_id)}`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not check Microsoft sign-in status.');
        if (!active) return;
        setOutlookAuth(result);
        if (result.status === 'connected') {
          await testConnection('outlook');
          await refreshAgentStatus();
        }
      } catch (error) {
        if (active) setOutlookAuthError(error.message || 'Could not check Microsoft sign-in status.');
      }
    };
    const timer = window.setInterval(pollStatus, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [outlookAuth?.flow_id, outlookAuth?.status]);

  const events = agent?.events || [];
  const latest = events[0];
  const stepsByKey = new Map((latest?.steps || []).map((step) => [step.key, step]));
  const checkRunning = agent?.monitor_status === 'checking';
  const manualMode = agent?.monitor_status === 'manual';
  const metrics = [
    { label: 'Emails processed', value: agent?.counts?.emails ?? 0, note: 'New messages in checked windows', icon: Mail },
    { label: 'Jira tickets', value: agent?.counts?.tickets ?? 0, note: 'Created in the connected project', icon: TicketCheck },
    { label: 'Duplicates grouped', value: agent?.counts?.duplicates ?? 0, note: 'Same incident, one Jira ticket', icon: ShieldCheck },
  ];

  return (
    <section className="dashboard-page agent-workspace-page">
      <div className="dashboard-topbar">
        <UserAccountMenu currentUser={currentUser} onLogin={onLogin} onLogout={onLogout} onOpenHowItWorks={onOpenHowItWorks} />
      </div>

      <div className="dashboard-content agent-workspace-content">
        <header className="dashboard-header agent-workspace-header">
          <div>
            <div className="agent-workspace-eyebrow"><button className="agent-catalog-back" type="button" onClick={onBack}><ArrowLeft size={14} /> All agents</button><span className="agent-workspace-eyebrow-divider">/</span><Bot size={15} /> Agent Workspace</div>
            <h1>Incident Management Agent</h1>
            <p>Autonomous email triage, context extraction and Jira ticket creation</p>
          </div>
          <span className={`agent-live-badge${manualMode ? ' is-live' : agent?.monitor_status === 'error' ? ' has-error' : ''}`}>
            <i />{statusText(agent?.monitor_status)}
          </span>
        </header>

        <section className="agent-overview-card" aria-label="Agent monitoring status">
          <span className="agent-overview-icon"><Bot size={23} /></span>
          <div className="agent-overview-copy">
            <div className="agent-overview-title"><h2>Incident Management Agent</h2><span className="agent-monitoring-tag"><Radio size={12} /> {checkRunning ? 'CHECKING' : 'ON DEMAND'}</span></div>
            <p><span>Outlook</span><ArrowRight size={14} /><span>AI analysis</span><ArrowRight size={14} /><span>Jira</span></p>
          </div>
          <div className="agent-manual-check">
            <button className="agent-check-inbox-button" type="button" onClick={checkInboxNow} disabled={checkRunning}>
              <RefreshCw size={15} className={checkRunning ? 'is-spinning' : ''} />
              {checkRunning ? 'Checking inbox…' : 'Check inbox now'}
            </button>
            <small>{checkRunning && agent?.current_run ? `Window ${formatDateTime(agent.current_run.window_start)}–${formatDateTime(agent.current_run.window_end)}` : `Next check starts after ${formatDateTime(agent?.last_run_at || agent?.started_at)}`}</small>
          </div>
        </section>
        {(checkMessage || checkError || agent?.error || agent?.last_run_result?.message) && <div className={`agent-run-feedback${checkError || agent?.error || agent?.last_run_result?.status === 'failed' ? ' is-error' : ''}`} role="status">{checkError || agent?.error || checkMessage || agent?.last_run_result?.message}</div>}

        <section className="agent-activity-metrics" aria-label="Agent activity metrics">
          {metrics.map(({ label, value, note, icon: Icon }, index) => (
            <article className="agent-metric-card" key={label} style={{ '--metric-delay': `${index * 90}ms` }}>
              <span className="agent-metric-icon"><Icon size={18} /></span>
              <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
              <span className="agent-metric-glow" />
            </article>
          ))}
        </section>

        <section className="agent-workspace-panel agent-flow-panel" aria-labelledby="agent-flow-title">
          <div className="agent-panel-heading">
            <div>
              <h2 id="agent-flow-title"><Sparkles size={17} /> Live workflow</h2>
              <p>{latest ? `Latest email · ${latest.subject}` : 'A real-time view of each agent action'}</p>
            </div>
            <span className={`agent-flow-pill${latest?.status === 'created' ? ' is-complete' : ''}`}><i />{checkRunning ? 'Processing current check' : latest ? (latest.status === 'created' ? 'Latest ticket created' : latest.status === 'duplicate' ? 'Duplicate grouped' : latest.status === 'failed' ? 'Run needs attention' : 'Processing') : 'Waiting for inbox check'}</span>
          </div>

          <div className="agent-flow-track" aria-label="Email processing workflow">
            {workflow.map(({ key, label, caption, icon: Icon }, index) => {
              const step = stepsByKey.get(key);
              const stepStatus = step?.status || 'waiting';
              return (
                <div className={`agent-flow-node is-${stepStatus}`} key={key} style={{ '--node-index': index }}>
                  <div className="agent-flow-node-top">
                    <span className="agent-flow-icon"><Icon size={19} /></span>
                    <StepMark status={stepStatus} />
                  </div>
                  <strong>{label}</strong>
                  <small>{step?.detail || caption}</small>
                  {index < workflow.length - 1 && <span className="agent-flow-connector"><span><ArrowRight size={15} /></span></span>}
                </div>
              );
            })}
          </div>

          {latest && <div className="agent-current-context">
            <div className="agent-context-heading"><span className="agent-context-spark"><Sparkles size={15} /></span><div><strong>Extracted incident context</strong><small>Generated from the latest email · {latest.intent || 'Analyzing intent'}</small></div></div>
            <div className="agent-context-body">
              <div className="agent-context-email"><span className="agent-context-label">SOURCE EMAIL</span><strong>{latest.subject}</strong><small>{latest.sender} <span>·</span> {formatTime(latest.received_at)}</small></div>
              <div className="agent-context-arrow"><ArrowRight size={17} /></div>
              <div className="agent-context-ticket"><span className="agent-context-label">TICKET SUMMARY</span><strong>{latest.summary || 'Extracting email details…'}</strong><small>{latest.description || (latest.jira_key ? 'Open the Jira issue to review its full description.' : 'The agent is preparing a grounded incident description.')}</small></div>
            </div>
            {latest.jira_key && <a className="agent-ticket-link" href={latest.jira_url} target="_blank" rel="noreferrer"><TicketCheck size={15} /> Open {latest.jira_key}<ArrowRight size={14} /></a>}
            {latest.error && <p className="agent-event-error"><TriangleAlert size={14} />{latest.error}</p>}
          </div>}
        </section>

        <div className="agent-workspace-grid">
          <section className="agent-workspace-panel agent-live-activity" aria-labelledby="agent-live-title">
            <div className="agent-panel-heading">
              <div><h2 id="agent-live-title"><Activity size={17} /> Live activity</h2><p>Agent actions, email context and Jira results</p></div>
              <span className="agent-activity-count"><span />{events.length} {events.length === 1 ? 'email' : 'emails'}</span>
            </div>
            {events.length ? <div className="agent-activity-list">
              {events.map((event) => (
                <article className={`agent-activity-item is-${event.status}`} key={event.id}>
                  <span className="agent-activity-dot"><Mail size={15} /></span>
                  <div className="agent-activity-main">
                    <div className="agent-activity-topline"><strong>{event.subject}</strong><time>{formatTime(event.received_at)}</time></div>
                    <p>{event.sender} <span>·</span> {event.intent || 'Intent analysis in progress'}</p>
                    <div className="agent-activity-result">{event.jira_key ? <a href={event.jira_url} target="_blank" rel="noreferrer"><TicketCheck size={13} /> {event.jira_key}</a> : <span><Clock3 size={13} /> {event.status === 'failed' ? 'Needs review' : 'In progress'}</span>}<span className="agent-priority-pill">Medium</span><span className="agent-unassigned-pill">Unassigned</span></div>
                  </div>
                </article>
              ))}
            </div> : <div className="agent-empty-state">
              <span className="agent-empty-orbit"><Inbox size={22} /></span>
              <h3>{checkRunning ? 'Checking the selected time window' : 'Ready when you are'}</h3>
              <p>Click Check inbox now to process email received since the last successful check. Older inbox mail is left untouched.</p>
            </div>}
          </section>

          <aside className="agent-workspace-panel agent-connections-panel" aria-labelledby="agent-connections-title">
            <div className="agent-panel-heading">
              <div><h2 id="agent-connections-title"><Server size={16} /> Connections</h2><p>Live service health</p></div>
              <button className="agent-refresh-button" type="button" onClick={() => { testConnection('outlook'); testConnection('jira'); }} aria-label="Refresh integration checks" disabled={Boolean(testingProvider)}><RefreshCw size={14} className={testingProvider ? 'is-spinning' : ''} /></button>
            </div>
            <ConnectionRow icon={<Mail size={17} />} name="Outlook" detail={agent?.inbox || 'Configured inbox'} connected={connectionResults.outlook?.connected} configured={configuration?.outlook?.configured} testing={testingProvider === 'outlook' || startingOutlookAuth || outlookAuth?.status === 'pending'} actionLabel={connectionResults.outlook?.connected ? 'Check' : outlookAuth?.status === 'pending' ? 'Waiting' : 'Connect'} onAction={connectionResults.outlook?.connected ? () => testConnection('outlook') : connectOutlook} />
            {connectionResults.outlook?.message && <p className={`agent-connection-feedback${connectionResults.outlook.connected ? ' is-success' : ' is-error'}`} role="status">{connectionResults.outlook.message}</p>}
            {outlookAuth?.status === 'pending' && <div className="agent-outlook-auth-card" role="status">
              <span className="agent-outlook-auth-icon"><KeyRound size={14} /></span>
              <div><strong>Finish one-time Microsoft sign-in</strong><p>Open <a href={outlookAuth.verification_uri} target="_blank" rel="noreferrer">Microsoft sign-in</a> and enter this code:</p><code>{outlookAuth.user_code}</code><small>Keep this page open. After approval, this device saves the encrypted sign-in for future runs.</small></div>
            </div>}
            {(outlookAuthError || outlookAuth?.status === 'error' || outlookAuth?.status === 'expired') && <p className="agent-connection-feedback is-error" role="alert">{outlookAuthError || outlookAuth?.message || 'Microsoft sign-in did not complete.'}</p>}
            {outlookAuth?.status === 'connected' && <p className="agent-connection-feedback is-success" role="status">{outlookAuth.message}</p>}
            <ConnectionRow icon={<TicketCheck size={17} />} name="Jira" detail={agent?.jira_project_key ? `Project ${agent.jira_project_key}` : 'Configured project'} connected={connectionResults.jira?.connected} configured={configuration?.jira?.configured} testing={testingProvider === 'jira'} onTest={() => testConnection('jira')} />
            {connectionResults.jira?.message && <p className={`agent-connection-feedback${connectionResults.jira.connected ? ' is-success' : ' is-error'}`} role="status">{connectionResults.jira.message}</p>}
            {configurationError && <p className="agent-connection-feedback is-error" role="alert">{configurationError}</p>}
            <div className="agent-runtime-card"><span className="agent-runtime-pulse"><Radio size={14} /></span><div><strong>{checkRunning ? 'Inbox check running' : 'Manual checks enabled'}</strong><small>Last successful check: {formatTime(agent?.last_run_at)}</small></div></div>
          </aside>
        </div>

        <footer className="agent-workspace-footer"><span><span className={`agent-footer-dot${manualMode ? ' is-live' : ''}`} /> Manual mode</span><span>Last run <strong>{formatTime(agent?.last_run_at)}</strong></span><span>Priority <strong>Medium</strong></span><span>Assignment <strong>Unassigned</strong></span></footer>
      </div>
    </section>
  );
}

function ConnectionRow({ icon, name, detail, connected, configured, testing, actionLabel, onAction }) {
  return <div className="agent-connection-row">
    <span className={`agent-connection-icon${name === 'Jira' ? ' agent-jira-icon' : ' agent-mail-icon'}`}>{icon}</span>
    <span className="agent-connection-copy"><strong>{name}</strong><small>{detail}</small></span>
    <span className={`agent-connection-state${connected ? ' is-connected' : ''}`}><i />{testing ? 'Checking' : connected ? 'Connected' : configured ? 'Ready' : 'Missing'}</span>
    <button className="agent-test-connection-button" type="button" onClick={onAction} disabled={!configured || testing}>{testing ? '…' : actionLabel || 'Check'}</button>
  </div>;
}
