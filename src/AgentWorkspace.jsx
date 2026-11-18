import { useEffect, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Bot, Check, ChevronRight,
  KeyRound, Mail, PlayCircle, Radio, RefreshCw, Server, ShieldCheck, Sparkles, TicketCheck,
  TriangleAlert,
} from 'lucide-react';
import { UserAccountMenu } from './Dashboards.jsx';

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
  const [triggering, setTriggering] = useState(false);
  const [pendingExecution, setPendingExecution] = useState(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');

  async function refreshAgentStatus() {
    try {
      const response = await fetch('/api/agent-workspace/status', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to view agent activity.' : 'Agent status is unavailable.');
      const payload = await response.json();
      setAgent(payload);
      return payload;
    } catch (error) {
      setAgent((current) => current || { monitor_status: 'offline', error: error.message });
      return null;
    }
  }

  async function checkInboxNow() {
    const startedAt = new Date().toISOString();
    const provisionalId = `starting-${Date.now()}`;
    setTriggering(true);
    setCheckError('');
    setCheckMessage('Agent run started. Checking the inbox window…');
    setPendingExecution({ id: provisionalId, status: 'running', started_at: startedAt, current_step: 'Connecting to Outlook and Jira', emails_found: 0, tickets_created: 0, event_ids: [], provisional: true });
    try {
      const response = await fetch('/api/agent-workspace/check-inbox', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The inbox check could not complete.');
      const windowText = result.window_start && result.window_end ? ` Window ${formatDateTime(result.window_start)}–${formatDateTime(result.window_end)}.` : '';
      setCheckMessage(`${result.message || 'Inbox check complete.'}${windowText}`);
      setPendingExecution((current) => current ? { ...current, id: result.id || current.id, provisional: false, status: result.status === 'partial' ? 'partially_completed' : result.status === 'failed' ? 'failed' : 'completed', window_start: result.window_start, window_end: result.window_end, completed_at: result.window_end || new Date().toISOString(), emails_found: result.emails_found || 0, emails_processed: result.emails_processed || 0, emails_skipped: result.emails_skipped || 0, tickets_created: result.tickets_created || 0, duplicates_grouped: result.duplicates_grouped || 0, failures: result.failures || 0, message: result.message || '' } : current);
      await refreshAgentStatus();
    } catch (error) {
      setCheckError(error.message || 'The inbox check could not complete.');
      setCheckMessage('');
      setPendingExecution((current) => current ? { ...current, provisional: false, status: 'failed', completed_at: new Date().toISOString(), current_step: 'Run failed', message: error.message || 'The inbox check could not complete.', failures: 1 } : current);
      const latestStatus = await refreshAgentStatus();
      const failedRunId = latestStatus?.last_run_result?.id;
      if (failedRunId) setPendingExecution((current) => current ? { ...current, id: failedRunId } : current);
    }
    setTriggering(false);
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

  useEffect(() => {
    if (pendingExecution?.provisional && agent?.current_run?.id) {
      setPendingExecution((current) => current ? { ...current, id: agent.current_run.id, provisional: false, current_step: agent.current_run.current_step || current.current_step } : current);
    }
  }, [agent, pendingExecution]);

  useEffect(() => {
    if (!pendingExecution?.id || pendingExecution.provisional || !(agent?.executions || []).some((run) => run.id === pendingExecution.id)) return;
    setPendingExecution(null);
  }, [agent, pendingExecution]);

  useEffect(() => {
    if (!checkMessage && !checkError) return undefined;
    const timer = window.setTimeout(() => { setCheckMessage(''); setCheckError(''); }, 6500);
    return () => window.clearTimeout(timer);
  }, [checkMessage, checkError]);

  const events = agent?.events || [];
  const checkRunning = triggering || agent?.monitor_status === 'checking';
  const executions = (agent?.executions || []).map((run) => ({
    ...run,
    messages: events.filter((event) => eventBelongsToRun(event, run)),
  }));
  // Older backend processes retained the last run summary and email events but
  // did not persist execution records or event run_ids. Reconstruct that one
  // run from its saved time window so the actual message details remain visible.
  const lastRun = agent?.last_run_result;
  if (lastRun?.id && !executions.some((run) => run.id === lastRun.id)) {
    const recoveredRun = {
      ...lastRun,
      status: lastRun.status === 'failed' ? 'failed' : lastRun.status === 'partial' ? 'partially_completed' : 'completed',
      window_start: lastRun.window_start,
      window_end: lastRun.window_end,
      completed_at: lastRun.window_end || agent?.last_run_at,
      emails_found: lastRun.emails_found || 0,
      emails_processed: lastRun.emails_processed || 0,
      emails_skipped: lastRun.emails_skipped || 0,
      tickets_created: lastRun.tickets_created || 0,
      duplicates_grouped: lastRun.duplicates_grouped || 0,
      failures: lastRun.failures || 0,
      messages: events.filter((event) => eventBelongsToRun(event, lastRun)),
      recovered: true,
    };
    executions.unshift(recoveredRun);
  }
  if (pendingExecution && !executions.some((run) => run.id === pendingExecution.id)) executions.unshift({ ...pendingExecution, messages: [] });
  const selectedExecution = executions.find((run) => run.id === selectedExecutionId);
  const selectedEvent = selectedExecution?.messages?.find((event) => event.id === selectedEventId);
  const actualExecutions = executions;
  const completedRuns = actualExecutions.filter((run) => ['completed', 'complete'].includes(run.status)).length;
  const failedRuns = actualExecutions.filter((run) => run.status === 'failed').length;
  const historicalEmails = agent?.counts?.emails ?? events.length;
  const historicalTickets = agent?.counts?.tickets ?? events.filter((event) => event.status === 'created').length;
  const healthy = Boolean(connectionResults.outlook?.connected && connectionResults.jira?.connected);

  return (
    <section className="dashboard-page agent-workspace-page agent-operations-page">
      <div className="dashboard-topbar">
        <UserAccountMenu currentUser={currentUser} onLogin={onLogin} onLogout={onLogout} onOpenHowItWorks={onOpenHowItWorks} />
      </div>
      <div className="dashboard-content agent-workspace-content">
        <header className="dashboard-header agent-workspace-header">
          <div>
            <div className="agent-workspace-eyebrow"><button className="agent-catalog-back" type="button" onClick={onBack}><ArrowLeft size={14} /> All agents</button><span className="agent-workspace-eyebrow-divider">/</span><Bot size={15} /> Agent Workspace</div>
            <h1>Incident Management Agent</h1>
            <p>Automated email triage and incident orchestration</p>
          </div>
          <span className={`agent-live-badge${healthy ? ' is-live' : agent?.monitor_status === 'error' ? ' has-error' : ''}`}><i />{healthy ? 'Healthy' : checkRunning ? 'Running' : 'Needs connection'}</span>
        </header>

        <section className="agent-overview-card agent-operations-control" aria-label="Agent controls and integration health">
          <div className="agent-operations-identity">
            <span className="agent-overview-icon"><Activity size={22} /></span>
            <div className="agent-overview-copy">
              <div className="agent-overview-title"><h2>Email-to-Jira Automation</h2><span className="agent-monitoring-tag"><Radio size={12} /> ON DEMAND</span></div>
              <p><span>Outlook</span><ArrowRight size={14} /><span>AI Intelligence</span><ArrowRight size={14} /><span>Jira</span><ArrowRight size={14} /><span>Notification</span></p>
            </div>
          </div>
          <div className="agent-operations-controls">
            <div className="agent-health-strip">
              <span className={`agent-health-item${connectionResults.outlook?.connected ? ' is-healthy' : ''}`}><Mail size={14} /> Outlook <i>{connectionResults.outlook?.connected ? 'Connected' : configuration?.outlook?.configured ? 'Checking' : 'Not configured'}</i>
                <button type="button" onClick={connectionResults.outlook?.connected ? () => testConnection('outlook') : connectOutlook} disabled={startingOutlookAuth || outlookAuth?.status === 'pending' || testingProvider === 'outlook'}>{connectionResults.outlook?.connected ? 'Check' : 'Connect'}</button>
              </span>
              <span className={`agent-health-item${connectionResults.jira?.connected ? ' is-healthy' : ''}`}><TicketCheck size={14} /> Jira <i>{connectionResults.jira?.connected ? `Connected · ${agent?.jira_project_key || 'Project'}` : configuration?.jira?.configured ? 'Checking' : 'Not configured'}</i>
                <button type="button" onClick={() => testConnection('jira')} disabled={!configuration?.jira?.configured || testingProvider === 'jira'}>{testingProvider === 'jira' ? '…' : 'Check'}</button>
              </span>
              <button className="agent-health-refresh" type="button" onClick={() => { testConnection('outlook'); testConnection('jira'); }} aria-label="Refresh integration health" disabled={Boolean(testingProvider)}><RefreshCw size={14} className={testingProvider ? 'is-spinning' : ''} /></button>
            </div>
            {outlookAuth?.status === 'pending' && <div className="agent-outlook-auth-card" role="status"><span className="agent-outlook-auth-icon"><KeyRound size={14} /></span><div><strong>Finish one-time Microsoft sign-in</strong><p>Open <a href={outlookAuth.verification_uri} target="_blank" rel="noreferrer">Microsoft sign-in</a> and enter this code:</p><code>{outlookAuth.user_code}</code><small>Keep this page open. After approval, this device saves the encrypted sign-in for future runs.</small></div></div>}
            {(outlookAuthError || outlookAuth?.status === 'error' || outlookAuth?.status === 'expired' || connectionResults.outlook?.message || connectionResults.jira?.message || configurationError) && <div className="agent-connection-notices" role="status">{outlookAuthError || outlookAuth?.message || connectionResults.outlook?.message || connectionResults.jira?.message || configurationError}</div>}
            <button className="agent-trigger-button" type="button" onClick={checkInboxNow} disabled={checkRunning}>
              {checkRunning ? <span className="agent-spinner" /> : <PlayCircle size={18} />}{checkRunning ? 'Running…' : 'Trigger Agent'}
            </button>
          </div>
        </section>

        <section className="agent-run-metrics" aria-label="Execution metrics">
          <Metric label="Total runs" value={actualExecutions.length} />
          <Metric label="Completed" value={completedRuns} />
          <Metric label="Failed" value={failedRuns} failed />
        </section>
        <section className="agent-history-metrics" aria-label="Historical processing totals">
          <span><Mail size={14} /> Historical emails <strong>{historicalEmails}</strong></span>
          <span><TicketCheck size={14} /> Jira tickets created <strong>{historicalTickets}</strong></span>
          <span><ShieldCheck size={14} /> Duplicates grouped <strong>{agent?.counts?.duplicates ?? 0}</strong></span>
          <span className="agent-last-run">Last run {formatTime(agent?.last_run_at)}</span>
        </section>

        <section className="agent-execution-history" aria-labelledby="execution-history-title">
          <div className="agent-history-heading"><div><h2 id="execution-history-title">Execution history</h2><p>Recent agent runs · select a run to inspect its messages and workflow</p></div><span>{actualExecutions.length} {actualExecutions.length === 1 ? 'run' : 'runs'}</span></div>
          {executions.length ? <div className="agent-run-list">
            {executions.map((run) => <button type="button" className={`agent-run-row is-${run.status}`} key={run.id} onClick={() => { setSelectedExecutionId(run.id); setSelectedEventId(''); }}>
              <span className={`agent-run-indicator${run.status === 'running' ? ' is-running' : ''}`} />
              <span className="agent-run-main">
                <span className="agent-run-title"><strong>{run.id}</strong><StatusBadge status={run.status} /></span>
                <span className="agent-run-summary">{run.current_step || run.message || `${run.emails_found || 0} email(s) detected`}</span>
                <span className="agent-run-meta">{run.recovered ? `Recovered run · checked ${formatDateTime(run.window_start)}–${formatDateTime(run.window_end)}` : `Started ${formatDateTime(run.started_at)}`} <span>·</span> {run.emails_found || 0} emails <span>·</span> {run.tickets_created || 0} tickets</span>
              </span>
              <ChevronRight size={19} />
            </button>)}
          </div> : <div className="agent-history-empty"><span><Activity size={20} /></span><strong>No executions yet</strong><p>Trigger the agent to check new email received since the last completed inbox check.</p></div>}
        </section>
        {checkMessage && !checkRunning && <div className="agent-toast" role="status"><Check size={15} />{checkMessage}</div>}
        {checkError && !checkRunning && <div className="agent-toast is-error" role="alert"><TriangleAlert size={15} />{checkError}</div>}
      </div>

      {selectedEvent ? <MessageExecutionDetail event={selectedEvent} run={selectedExecution} onBack={() => setSelectedEventId('')} />
        : selectedExecution ? <RunExecutionDetail run={selectedExecution} onBack={() => setSelectedExecutionId('')} onSelectEvent={setSelectedEventId} /> : null}
    </section>
  );
}

function Metric({ label, value, failed = false }) {
  return <article className={`agent-run-metric${failed ? ' is-failed' : ''}`}><span>{label}</span><strong>{value}</strong></article>;
}

function eventBelongsToRun(event, run) {
  if (event.run_id) return event.run_id === run.id;
  if ((run.event_ids || []).includes(event.id)) return true;
  const receivedAt = Date.parse(event.received_at || '');
  const startAt = Date.parse(run.window_start || '');
  const endAt = Date.parse(run.window_end || '');
  return Number.isFinite(receivedAt) && Number.isFinite(startAt) && Number.isFinite(endAt) && receivedAt >= startAt && receivedAt <= endAt;
}

function financialImpact(event) {
  const source = `${event.body_preview || ''}\n${event.description || ''}`;
  const match = source.match(/(?:financial impact|total.{0,35}(?:impact|amount)|premium difference|commission amount)[^$\n]{0,45}(\$\s?[\d,]+(?:\.\d{1,2})?)/i);
  return match?.[1]?.replace(/\s+/g, '') || 'Not provided in the email';
}

function affectedEntities(event) {
  const ids = [...new Set(`${event.body_preview || ''}\n${event.description || ''}`.match(/\bAGY-\d+\b/gi) || [])];
  return ids.length ? `${ids.join(', ')} (${ids.length})` : 'Not specified';
}

function StatusBadge({ status }) {
  const labels = { running: 'Running', completed: 'Completed', complete: 'Completed', partially_completed: 'Partially completed', partial: 'Partially completed', failed: 'Failed', skipped: 'Not enabled', waiting: 'Pending' };
  return <span className={`agent-status-badge is-${status || 'running'}`}>{labels[status] || status || 'Running'}</span>;
}

function RunExecutionDetail({ run, onBack, onSelectEvent }) {
  const messages = run.messages || [];
  const runActive = run.status === 'running';
  const complete = ['completed', 'complete'].includes(run.status);
  const [expanded, setExpanded] = useState(() => new Set(['email', 'intent', 'duplicate', 'jira', 'notify', 'complete']));
  const allExpanded = expanded.size === 6;
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(['email', 'intent', 'duplicate', 'jira', 'notify', 'complete']));
  const stageState = (key) => {
    const statuses = messages.map((event) => event.steps?.find((step) => step.key === key)?.status).filter(Boolean);
    if (key === 'email') return messages.length || complete ? 'complete' : runActive ? 'active' : 'waiting';
    if (key === 'intent') return statuses.includes('failed') ? 'failed' : statuses.length && statuses.every((status) => status === 'complete') ? 'complete' : runActive ? 'active' : 'waiting';
    if (key === 'duplicate') return statuses.includes('failed') ? 'failed' : statuses.some((status) => ['complete', 'duplicate', 'skipped'].includes(status)) ? 'complete' : runActive ? 'active' : 'waiting';
    if (key === 'jira') return messages.some((event) => event.jira_key) ? 'complete' : statuses.includes('failed') ? 'failed' : runActive && /jira|ticket/i.test(run.current_step || '') ? 'active' : 'waiting';
    if (key === 'notify') return statuses.length && statuses.every((status) => status === 'skipped') ? 'skipped' : statuses.includes('complete') ? 'complete' : runActive ? 'active' : 'skipped';
    return run.status === 'failed' ? 'failed' : run.status === 'partially_completed' ? 'partial' : runActive ? 'active' : complete ? 'complete' : 'waiting';
  };
  const stages = [
    { key: 'email', title: 'Email received', caption: 'Outlook messages retrieved', timeKey: 'email' },
    { key: 'intent', title: 'Intent & context extraction', caption: 'AI analyzed each message and prepared incident context', timeKey: 'intent' },
    { key: 'duplicate', title: 'Duplicate validation', caption: 'Checked for matching incidents before creating Jira issues', timeKey: 'duplicate' },
    { key: 'jira', title: 'Jira ticket creation', caption: 'Created tickets and linked results to their source emails', timeKey: 'jira' },
    { key: 'notify', title: 'Requester notification', caption: 'Notification status for this run', timeKey: 'notify' },
    { key: 'complete', title: 'Run completed', caption: run.message || (run.completed_at ? `Finished at ${formatDateTime(run.completed_at)}` : run.current_step || 'Waiting for agent progress') },
  ];
  const stageTime = (stage) => {
    if (stage.key === 'complete') return run.completed_at ? formatTime(run.completed_at) : '';
    const times = messages.flatMap((event) => (event.steps || []).filter((step) => step.key === stage.timeKey && step.at).map((step) => step.at));
    return times.length ? formatTime(times.at(-1)) : stage.key === 'email' ? formatTime(run.started_at) : '';
  };
  const toggleStage = (key) => setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const renderStageContent = (key) => {
    if (key === 'complete') return <div className="agent-run-completion-details"><p>{run.message || (complete ? 'The run finished.' : run.current_step || 'The run is still in progress.')}</p><div className="agent-run-completion-counts"><span>{run.emails_found || 0} emails detected</span><span>{run.tickets_created || 0} tickets created</span><span>{run.duplicates_grouped || 0} duplicates grouped</span><span>{run.failures || 0} failures</span></div></div>;
    if (!messages.length) return <p className="agent-stage-empty">{runActive ? 'Waiting for email activity…' : 'No message details were retained for this run.'}</p>;
    return <div className="agent-stage-message-list">{messages.map((event) => <article className="agent-stage-message" key={`${key}-${event.id}`}>
      <div className="agent-stage-message-heading"><strong>{event.subject}</strong><button type="button" onClick={() => onSelectEvent(event.id)}>Open message timeline <ArrowRight size={12} /></button></div>
      {key === 'email' && <dl className="agent-detail-fields"><dt>Received</dt><dd>{formatDateTime(event.received_at)}</dd><dt>From</dt><dd>{event.sender || 'Unknown sender'}</dd><dt>Message</dt><dd>{event.body_preview || 'Email retrieved; message preview is unavailable.'}</dd></dl>}
      {key === 'intent' && <dl className="agent-detail-fields"><dt>Intent</dt><dd>{event.intent || 'Not classified'}</dd><dt>Category</dt><dd>{event.category || event.intent || 'Not classified'}</dd><dt>Priority</dt><dd>{event.priority || 'Medium'}</dd><dt>Financial impact</dt><dd>{event.financial_impact || financialImpact(event)}</dd><dt>Affected agencies</dt><dd>{event.affected_entities || affectedEntities(event)}</dd><dt>Ticket summary</dt><dd>{event.summary || 'Not available'}</dd><dt>Context</dt><dd>{event.description || 'No extracted description available.'}</dd></dl>}
      {key === 'duplicate' && <dl className="agent-detail-fields"><dt>Result</dt><dd>{event.status === 'duplicate' ? 'Matching incident found or grouped with another email in this run.' : event.steps?.find((step) => step.key === 'duplicate')?.status === 'skipped' ? 'Duplicate check bypassed for this POC report.' : event.steps?.find((step) => step.key === 'duplicate')?.detail || 'No matching incident found.'}</dd><dt>Decision</dt><dd>{event.status === 'duplicate' ? `Use existing Jira issue${event.jira_key ? ` ${event.jira_key}` : ''}.` : event.status === 'created' ? 'Create one new Jira issue.' : 'Pending validation.'}</dd></dl>}
      {key === 'jira' && <dl className="agent-detail-fields"><dt>Ticket</dt><dd>{event.jira_key || (event.status === 'failed' ? 'Creation failed' : 'No ticket created')}</dd><dt>Summary</dt><dd>{event.summary || 'Not available'}</dd><dt>Priority</dt><dd>{event.priority || 'Medium'}</dd><dt>Assignee</dt><dd>{event.assignee || 'Unassigned'}</dd><dt>Description</dt><dd>{event.description || 'Not available'}</dd>{event.jira_project_key && <><dt>Project</dt><dd>{event.jira_project_key}</dd></>}{event.jira_url && <><dt>Jira link</dt><dd><a className="agent-inline-jira-link" href={event.jira_url} target="_blank" rel="noreferrer">Open {event.jira_key} <ArrowRight size={12} /></a></dd></>}</dl>}
      {key === 'notify' && <div className="agent-notification-state"><StatusBadge status={event.steps?.find((step) => step.key === 'notify')?.status || 'skipped'} /><span>{event.steps?.find((step) => step.key === 'notify')?.detail || 'Requester acknowledgement is not enabled; no email was sent.'}</span></div>}
    </article>)}</div>;
  };
  return <div className="agent-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="agent-run-detail-title">
    <div className="agent-detail-shell">
      <header className="agent-detail-topbar"><button type="button" onClick={onBack}><ArrowLeft size={15} /> Execution history</button><span>Execution details</span></header>
      <div className="agent-detail-content">
        <div className="agent-detail-heading"><div><div className="agent-detail-kicker">{run.legacy ? 'Earlier activity' : run.recovered ? `${run.id} · restored from saved run summary` : run.id}</div><h2 id="agent-run-detail-title">{messages[0]?.subject || (run.legacy ? 'Existing processed email activity' : 'Agent execution')}</h2><p>{run.recovered ? `Checked window ${formatDateTime(run.window_start)}–${formatDateTime(run.window_end)}` : `Started ${formatDateTime(run.started_at)}${run.completed_at ? ` · Finished ${formatDateTime(run.completed_at)}` : ' · In progress'}`}</p></div><StatusBadge status={run.status} /></div>
        <div className="agent-detail-progress"><span style={{ width: `${runActive ? 56 : run.status === 'failed' ? 100 : 100}%` }} /></div>
        <div className="agent-detail-stats"><Metric label="Emails detected" value={run.emails_found || 0} /><Metric label="Processed" value={run.emails_processed || 0} /><Metric label="Skipped" value={run.emails_skipped || 0} /><Metric label="Tickets created" value={run.tickets_created || 0} /><Metric label="Duplicates grouped" value={run.duplicates_grouped || 0} /><Metric label="Failed" value={run.failures || 0} failed={Boolean(run.failures)} /></div>
        <section className="agent-detail-section"><div className="agent-detail-section-heading"><div><h3>Execution timeline</h3><p>Expand a stage to inspect email, analysis, duplicate, Jira, and notification details.</p></div><div className="agent-timeline-heading-actions">{runActive && <span className="agent-running-label"><i /> Live</span>}<button className="agent-collapse-all" type="button" onClick={toggleAll}>{allExpanded ? 'Collapse all' : 'Expand all'}</button></div></div>
          <ol className="agent-vertical-timeline agent-run-timeline">{stages.map((stage) => {
            const status = stageState(stage.key);
            const isExpanded = expanded.has(stage.key);
            return <li className={`agent-timeline-step is-${status}${isExpanded ? ' is-expanded' : ''}`} key={stage.key}><span className="agent-timeline-marker">{status === 'complete' ? <Check size={14} /> : status === 'failed' ? <TriangleAlert size={14} /> : status === 'active' ? <span className="agent-spinner" /> : status === 'partial' ? '!' : <span />}</span><div className="agent-timeline-copy"><button className="agent-timeline-toggle" type="button" aria-expanded={isExpanded} onClick={() => toggleStage(stage.key)}><span><strong>{stage.title}</strong><small>{stage.caption}</small></span><span className="agent-timeline-toggle-end"><time>{stageTime(stage)}</time>{status === 'skipped' && <StatusBadge status="skipped" />}<ChevronRight size={15} /></span></button>{isExpanded && <div className="agent-timeline-expanded">{renderStageContent(stage.key)}</div>}</div></li>;
          })}</ol>
        </section>
        <section className="agent-detail-section agent-run-messages"><div className="agent-detail-section-heading"><div><h3>Messages in this run</h3><p>Select a message to inspect its email-to-Jira workflow.</p></div><span>{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span></div>
          {messages.length ? <div className="agent-message-list">{messages.map((event, index) => <button className="agent-message-row" type="button" key={event.id} onClick={() => onSelectEvent(event.id)}><span className="agent-message-index">{String(index + 1).padStart(2, '0')}</span><span className="agent-message-copy"><strong>{event.subject}</strong><small>{event.jira_key ? `${event.jira_key} · ` : ''}{event.intent || 'Analysis in progress'} · {formatTime(event.received_at)}</small></span><StatusBadge status={event.status === 'created' || event.status === 'duplicate' ? 'completed' : event.status === 'processing' ? 'running' : event.status} /><ChevronRight size={17} /></button>)}</div> : <div className="agent-detail-empty">{runActive ? 'Waiting for messages to be detected and processed…' : 'No message details were retained for this run.'}</div>}
        </section>
      </div>
    </div>
  </div>;
}

function MessageExecutionDetail({ event, run, onBack }) {
  const steps = event.steps || [];
  const [expanded, setExpanded] = useState(() => new Set(steps.map((step) => step.key)));
  const allExpanded = expanded.size === steps.length;
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(steps.map((step) => step.key)));
  const toggleStep = (key) => setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const supplemental = (step) => {
    if (step.key === 'email') return <dl className="agent-detail-fields"><dt>Subject</dt><dd>{event.subject}</dd><dt>From</dt><dd>{event.sender}</dd><dt>Received</dt><dd>{formatDateTime(event.received_at)}</dd>{event.body_preview && <><dt>Message</dt><dd>{event.body_preview}</dd></>}</dl>;
    if (step.key === 'intent') return <dl className="agent-detail-fields"><dt>Intent</dt><dd>{event.intent || 'Not classified'}</dd><dt>Category</dt><dd>{event.category || event.intent || 'Not classified'}</dd><dt>Priority</dt><dd>{event.priority || 'Medium'}</dd><dt>Financial impact</dt><dd>{event.financial_impact || financialImpact(event)}</dd><dt>Affected agencies</dt><dd>{event.affected_entities || affectedEntities(event)}</dd><dt>Ticket summary</dt><dd>{event.summary || 'Not available'}</dd><dt>Context</dt><dd>{event.description || 'No extracted description available.'}</dd></dl>;
    if (step.key === 'duplicate') return <dl className="agent-detail-fields"><dt>Result</dt><dd>{event.status === 'duplicate' ? 'Matched or grouped with an existing incident.' : step.status === 'skipped' ? 'Duplicate checks were bypassed for this POC report.' : step.detail || 'No matching incident found.'}</dd><dt>Decision</dt><dd>{event.status === 'duplicate' ? 'Reuse the existing Jira issue.' : event.status === 'created' ? 'Create a new Jira issue.' : 'Pending'}</dd></dl>;
    if (step.key === 'jira') return <div className="agent-detail-jira">{event.jira_key ? <><div><strong>{event.jira_key}</strong><small>{event.summary} · {event.priority || 'Medium'} · {event.assignee || 'Unassigned'}</small></div><a href={event.jira_url} target="_blank" rel="noreferrer">Open Jira issue <ArrowRight size={13} /></a></> : <span>{step.detail || 'Ticket has not been created.'}</span>}</div>;
    if (step.key === 'notify') return <div className="agent-notification-state"><StatusBadge status={step.status || 'skipped'} /><span>{step.detail || 'Requester acknowledgement is not enabled; no email was sent.'}</span></div>;
    return null;
  };
  return <div className="agent-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="agent-message-detail-title">
    <div className="agent-detail-shell">
      <header className="agent-detail-topbar"><button type="button" onClick={onBack}><ArrowLeft size={15} /> Run {run?.id || ''}</button><span>Message details</span></header>
      <div className="agent-detail-content agent-message-detail-content">
        <div className="agent-detail-heading"><div><div className="agent-detail-kicker">{run?.id || 'Execution'} / {event.id}</div><h2 id="agent-message-detail-title">{event.summary || event.subject}</h2><p>{event.sender} · Received {formatDateTime(event.received_at)}</p></div><StatusBadge status={event.status === 'created' || event.status === 'duplicate' ? 'completed' : event.status} /></div>
        <div className="agent-detail-progress"><span style={{ width: `${steps.length ? (steps.filter((step) => ['complete', 'duplicate', 'skipped'].includes(step.status)).length / steps.length) * 100 : 0}%` }} /></div>
        <section className="agent-detail-section"><div className="agent-detail-section-heading"><div><h3>Message execution timeline</h3><p>Workflow actions recorded for this email.</p></div><div className="agent-timeline-heading-actions"><span>{steps.filter((step) => ['complete', 'duplicate', 'skipped'].includes(step.status)).length}/{steps.length} steps</span><button className="agent-collapse-all" type="button" onClick={toggleAll}>{allExpanded ? 'Collapse all' : 'Expand all'}</button></div></div>
          <ol className="agent-vertical-timeline">{steps.map((step) => {
            const isExpanded = expanded.has(step.key);
            const status = step.status === 'duplicate' ? 'completed' : step.status;
            return <li className={`agent-timeline-step is-${step.status}${isExpanded ? ' is-expanded' : ''}`} key={step.key}><span className="agent-timeline-marker">{step.status === 'complete' || step.status === 'duplicate' ? <Check size={14} /> : step.status === 'failed' ? <TriangleAlert size={14} /> : step.status === 'active' ? <span className="agent-spinner" /> : <span />}</span><div className="agent-timeline-copy"><button className="agent-timeline-toggle" type="button" aria-expanded={isExpanded} onClick={() => toggleStep(step.key)}><span><strong>{step.label}</strong><small>{step.detail || (step.status === 'waiting' ? 'Waiting for previous step' : step.status === 'skipped' ? 'Not enabled' : '')}</small></span><span className="agent-timeline-toggle-end"><time>{formatTime(step.at)}</time><StatusBadge status={status || 'waiting'} /><ChevronRight size={15} /></span></button>{isExpanded && <div className="agent-timeline-expanded">{supplemental(step)}{step.key === 'notify' && <small className="agent-notification-timing">Notification stage recorded at {formatTime(step.at)}; no acknowledgement email was sent because this integration is not enabled.</small>}</div>}</div></li>;
          })}</ol>
          {event.error && <div className="agent-detail-error"><TriangleAlert size={15} />{event.error}</div>}
        </section>
      </div>
    </div>
  </div>;
}

function ConnectionRow({ icon, name, detail, connected, configured, testing, actionLabel, onAction }) {
  return <div className="agent-connection-row">
    <span className={`agent-connection-icon${name === 'Jira' ? ' agent-jira-icon' : ' agent-mail-icon'}`}>{icon}</span>
    <span className="agent-connection-copy"><strong>{name}</strong><small>{detail}</small></span>
    <span className={`agent-connection-state${connected ? ' is-connected' : ''}`}><i />{testing ? 'Checking' : connected ? 'Connected' : configured ? 'Ready' : 'Missing'}</span>
    <button className="agent-test-connection-button" type="button" onClick={onAction} disabled={!configured || testing}>{testing ? '…' : actionLabel || 'Check'}</button>
  </div>;
}
