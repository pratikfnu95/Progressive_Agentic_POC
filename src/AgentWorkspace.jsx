import { useEffect, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Bot, Check, ChevronRight, MessageSquareText, ShieldCheck, UserRound,
  KeyRound, Mail, PlayCircle, RefreshCw, Server, Sparkles, TicketCheck,
  Square, TriangleAlert,
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

function formatRunDuration(run) {
  const startedAt = Date.parse(run.started_at || '');
  if (Number.isNaN(startedAt)) return '—';
  const finishedAt = Date.parse(run.completed_at || '');
  const elapsedSeconds = Math.max(0, Math.floor(((Number.isNaN(finishedAt) ? Date.now() : finishedAt) - startedAt) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function WorkflowIcon({ type }) {
  if (type === 'outlook') return <svg viewBox="0 0 32 32" role="img" aria-label="Microsoft Outlook"><path d="M12 6h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H12z" fill="#1687d9"/><path d="M12 9h15v14H12z" fill="#35a7e8"/><path d="m12 10 7.5 6L27 10" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round"/><rect x="2" y="8" width="14" height="17" rx="3" fill="#07549b"/><path d="M5.2 16.5c0-3.2 1.7-5.2 4.4-5.2s4.4 2 4.4 5.2-1.7 5.2-4.4 5.2-4.4-2-4.4-5.2Zm2.4 0c0 1.9.7 3 2 3s2-1.1 2-3-.7-3-2-3-2 1.1-2 3Z" fill="#fff"/></svg>;
  if (type === 'jira') return <svg viewBox="0 0 32 32" role="img" aria-label="Jira"><path d="M16 2.5 29.5 16 16 29.5 2.5 16 16 2.5Z" fill="#2684ff"/><path d="m16 9 7 7-7 7-7-7 7-7Z" fill="#fff"/><path d="m16 12 4 4-4 4-4-4 4-4Z" fill="#2684ff"/></svg>;
  if (type === 'reporter') return <UserRound size={22} strokeWidth={1.9} />;
  if (type === 'ai') return <Sparkles size={22} strokeWidth={1.9} />;
  if (type === 'validation') return <ShieldCheck size={22} strokeWidth={1.9} />;
  if (type === 'notification') return <MessageSquareText size={22} strokeWidth={1.9} />;
  return <TicketCheck size={22} strokeWidth={1.9} />;
}

function AgentWorkflow() {
  const stages = [
    { key: 'reporter', title: 'Reporter', caption: 'Reports an issue', icon: 'reporter' },
    { key: 'outlook', title: 'Outlook', caption: 'Receives the email', icon: 'outlook' },
    { key: 'ai', title: 'AI agent', caption: 'Extracts intent & context', icon: 'ai' },
    { key: 'validation', title: 'Validation', caption: 'Checks for duplicates', icon: 'validation' },
    { key: 'jira', title: 'Jira', caption: 'Creates the ticket', icon: 'jira' },
    { key: 'notification', title: 'Notification', caption: 'Notifies the team', icon: 'notification' },
  ];
  return <section className="agent-workflow-panel" aria-labelledby="agent-workflow-title">
    <div className="agent-workflow-heading"><div><h2 id="agent-workflow-title">Agent workflow</h2><p>From an incoming incident report to a Jira ticket and team notification</p></div></div>
    <div className="agent-workflow-scroll">
      <ol className="agent-workflow-dag" aria-label="Incident report workflow">
        {stages.map((stage, index) => <li className={`agent-workflow-stage is-${stage.key}`} key={stage.key}>
          <div className="agent-workflow-node">
            <span className={`agent-workflow-icon is-${stage.key}`}><WorkflowIcon type={stage.icon} /></span>
            <strong>{stage.title}</strong><small>{stage.caption}</small>
          </div>
          {index < stages.length - 1 && <span className="agent-workflow-link" aria-hidden="true" />}
        </li>)}
      </ol>
    </div>
  </section>;
}

export function AgentCatalog({ currentUser, onLogin, onLogout, onOpenIncident, onOpenHowItWorks, onOpenPolicyDashboard }) {
  return (
    <section className="dashboard-page agent-workspace-page agent-catalog-page">
      <div className="dashboard-topbar">
        <UserAccountMenu currentUser={currentUser} onLogin={onLogin} onLogout={onLogout} onOpenHowItWorks={onOpenHowItWorks} onOpenPolicyDashboard={onOpenPolicyDashboard} />
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
              <span className="agent-catalog-card-title">Incident Management Agent</span>
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

export function AgentWorkspace({ currentUser, onLogin, onLogout, onBack, onOpenHowItWorks, onOpenPolicyDashboard }) {
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
  const [stoppingRunId, setStoppingRunId] = useState('');
  const [pendingExecution, setPendingExecution] = useState(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState('');

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
    setPendingExecution({ id: provisionalId, status: 'running', started_at: startedAt, active_stage: 'email', current_step: 'Checking Outlook inbox', emails_found: 0, tickets_created: 0, event_ids: [], provisional: true });
    try {
      const response = await fetch('/api/agent-workspace/check-inbox', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The inbox check could not complete.');
      const windowText = result.window_start && result.window_end ? ` Window ${formatDateTime(result.window_start)}–${formatDateTime(result.window_end)}.` : '';
      setCheckMessage(`${result.message || 'Inbox check complete.'}${windowText}`);
      setPendingExecution((current) => current ? { ...current, id: result.id || current.id, provisional: false, status: result.status === 'partial' ? 'partially_completed' : result.status === 'failed' ? 'failed' : result.status === 'cancelled' ? 'cancelled' : result.status === 'running' ? 'running' : 'completed', window_start: result.window_start, window_end: result.window_end, completed_at: result.status === 'running' ? null : result.window_end || new Date().toISOString(), emails_found: result.emails_found || 0, emails_processed: result.emails_processed || 0, emails_skipped: result.emails_skipped || 0, tickets_created: result.tickets_created || 0, duplicates_grouped: result.duplicates_grouped || 0, failures: result.failures || 0, message: result.message || '' } : current);
      await refreshAgentStatus();
    } catch (error) {
      setCheckError(error.message || 'The inbox check could not complete.');
      setCheckMessage('');
      setPendingExecution((current) => current ? { ...current, provisional: false, status: 'failed', completed_at: new Date().toISOString(), current_step: 'Run failed', message: error.message || 'The inbox check could not complete.', failures: 1 } : current);
      const latestStatus = await refreshAgentStatus();
      const failedRunId = latestStatus?.last_run_result?.id;
      if (failedRunId) {
        setPendingExecution((current) => current ? { ...current, id: failedRunId } : current);
      }
    }
    setTriggering(false);
  }

  async function stopAgentRun(run) {
    setStoppingRunId(run.id);
    setCheckError('');
    try {
      const response = await fetch('/api/agent-workspace/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: run.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not stop this agent run.');
      if (!result.stopped) throw new Error(result.message || 'This agent run is no longer active.');
      setCheckMessage(result.message || 'Stop requested.');
      await refreshAgentStatus();
    } catch (error) {
      setCheckError(error.message || 'Could not stop this agent run.');
    } finally {
      setStoppingRunId('');
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
    let active = true;
    let timer;
    const pollStatus = async () => {
      await refreshAgentStatus();
      if (active) timer = window.setTimeout(pollStatus, 700);
    };
    pollStatus();
    return () => { active = false; window.clearTimeout(timer); };
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
      const runId = agent.current_run.id;
      setPendingExecution((current) => current ? { ...current, id: runId, provisional: false, active_stage: agent.current_run.active_stage || current.active_stage, current_step: agent.current_run.current_step || current.current_step } : current);
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
  const checkRunning = triggering
    || agent?.monitor_status === 'checking'
    || Boolean(agent?.current_run?.id)
    || (agent?.executions || []).some((run) => run.status === 'running');
  const executions = (agent?.executions || []).map((run) => {
    const messages = events.filter((event) => eventBelongsToRun(event, run));
    const notificationPending = messages.some((event) => ['active', 'waiting'].includes(event.steps?.find((step) => step.key === 'notify')?.status));
    return {
      ...run,
      messages,
      notification_pending: notificationPending,
      active_stage: notificationPending ? 'notify' : run.active_stage,
      current_step: notificationPending ? 'Waiting for notification delivery confirmation' : run.current_step,
      status: notificationPending && ['completed', 'complete'].includes(run.status) ? 'running' : run.status,
    };
  });
  // Older backend processes retained the last run summary and email events but
  // did not persist execution records or event run_ids. Reconstruct that one
  // run from its saved time window so the actual message details remain visible.
  const lastRun = agent?.last_run_result;
  if (lastRun?.id && !executions.some((run) => run.id === lastRun.id)) {
    const recoveredMessages = events.filter((event) => eventBelongsToRun(event, lastRun));
    const recoveredNotificationPending = recoveredMessages.some((event) => ['active', 'waiting'].includes(event.steps?.find((step) => step.key === 'notify')?.status));
    const recoveredRun = {
      ...lastRun,
      status: lastRun.status === 'cancelled' ? 'cancelled' : lastRun.status === 'failed' ? 'failed' : lastRun.status === 'partial' ? 'partially_completed' : recoveredNotificationPending ? 'running' : 'completed',
      active_stage: recoveredNotificationPending ? 'notify' : 'complete',
      window_start: lastRun.window_start,
      window_end: lastRun.window_end,
      completed_at: lastRun.completed_at || lastRun.window_end || agent?.last_run_at,
      emails_found: lastRun.emails_found || 0,
      emails_processed: lastRun.emails_processed || 0,
      emails_skipped: lastRun.emails_skipped || 0,
      tickets_created: lastRun.tickets_created || 0,
      duplicates_grouped: lastRun.duplicates_grouped || 0,
      failures: lastRun.failures || 0,
      messages: recoveredMessages,
      recovered: true,
    };
    executions.unshift(recoveredRun);
  }
  if (pendingExecution && !executions.some((run) => run.id === pendingExecution.id)) executions.unshift({ ...pendingExecution, messages: [] });
  const selectedExecution = executions.find((run) => run.id === selectedExecutionId);
  const visibleExecutions = executions.slice(0, 10);
  const connectionNotice = outlookAuthError
    || (['error', 'expired'].includes(outlookAuth?.status) ? outlookAuth?.message : '')
    || (!connectionResults.outlook?.connected ? connectionResults.outlook?.message : '')
    || (!connectionResults.jira?.connected ? connectionResults.jira?.message : '')
    || configurationError;

  return (
    <section className="dashboard-page agent-workspace-page agent-operations-page">
      <div className="dashboard-topbar">
        <UserAccountMenu currentUser={currentUser} onLogin={onLogin} onLogout={onLogout} onOpenHowItWorks={onOpenHowItWorks} onOpenPolicyDashboard={onOpenPolicyDashboard} />
      </div>
      <div className="dashboard-content agent-workspace-content">
        <header className="dashboard-header agent-workspace-header">
          <div>
            <div className="agent-workspace-eyebrow"><button className="agent-catalog-back" type="button" onClick={onBack}><ArrowLeft size={14} /> All agents</button><span className="agent-workspace-eyebrow-divider">/</span><Bot size={15} /> Agent Workspace</div>
            <h1>Incident Management Agent</h1>
            <p>Automated email triage and incident orchestration</p>
          </div>
          <button className="agent-trigger-button agent-header-trigger-button" type="button" onClick={checkInboxNow} disabled={checkRunning}>
            <PlayCircle size={15} />Trigger Agent
          </button>
        </header>

        <AgentWorkflow />

        <section className="agent-execution-history" aria-labelledby="execution-history-title">
          <div className="agent-history-heading"><div><h2 id="execution-history-title">Recent Runs</h2><p>Latest agent executions · select a run ID to inspect its workflow</p></div><span>{visibleExecutions.length} {visibleExecutions.length === 1 ? 'run' : 'runs'}</span></div>
          {visibleExecutions.length ? <div className="agent-run-table-scroll"><table className="agent-run-table" aria-label="Recent agent runs">
            <thead><tr><th scope="col">Run ID</th><th scope="col">Status</th><th scope="col">Start time</th><th scope="col">End time</th><th scope="col">Duration</th><th scope="col">Emails received</th><th scope="col">Jira tickets</th></tr></thead>
            <tbody>{visibleExecutions.map((run) => <tr className={`is-${run.status}`} key={run.id}>
              <td><button className="agent-run-id-link" type="button" onClick={() => setSelectedExecutionId(run.id)}>{run.id}<ChevronRight size={14} /></button></td>
              <td><span className="agent-run-status-cell"><StatusBadge status={run.status} /><StopRunControl run={run} onStop={stopAgentRun} stopping={stoppingRunId === run.id} /></span></td>
              <td>{formatDateTime(run.started_at)}</td>
              <td>{run.completed_at ? formatDateTime(run.completed_at) : <span className="agent-run-in-progress">In progress</span>}</td>
              <td>{formatRunDuration(run)}</td>
              <td>{run.emails_found || 0}</td>
              <td>{run.tickets_created || 0}</td>
            </tr>)}</tbody>
          </table></div> : <div className="agent-history-empty"><span><Activity size={20} /></span><strong>No executions yet</strong><p>Trigger the agent to check new email received since the last completed inbox check.</p></div>}
        </section>
        {checkMessage && !checkRunning && <div className="agent-toast" role="status"><Check size={15} />{checkMessage}</div>}
        {checkError && !checkRunning && <div className="agent-toast is-error" role="alert"><TriangleAlert size={15} />{checkError}</div>}
        <footer className="agent-integration-footer" aria-label="Integration status and checks">
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
          {connectionNotice && <div className="agent-connection-notices" role="status">{connectionNotice}</div>}
        </footer>
      </div>

      {selectedExecution ? <RunExecutionDetail run={selectedExecution} onBack={() => setSelectedExecutionId('')} onStop={stopAgentRun} stopping={stoppingRunId === selectedExecution.id} /> : null}
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
  const labels = { running: 'Running', active: 'Processing…', completed: 'Success', complete: 'Success', partially_completed: 'Partially completed', partial: 'Partially completed', failed: 'Failure', cancelled: 'Stopped', unconfirmed: 'Unconfirmed', skipped: 'Not sent', waiting: 'Pending' };
  return <span className={`agent-status-badge is-${status || 'running'}`}>{labels[status] || status || 'Running'}</span>;
}

function StopRunControl({ run, onStop, stopping = false }) {
  if (run.status !== 'running') return null;
  return <button className="agent-stop-run-button" type="button" onClick={() => onStop(run)} disabled={stopping || run.cancellation_requested} aria-label={`Stop agent run ${run.id}`} title={run.cancellation_requested ? 'Stopping agent run' : 'Stop this agent run'}><Square size={11} fill="currentColor" />{run.cancellation_requested ? <span>Stopping…</span> : null}</button>;
}

function RunExecutionDetail({ run, onBack, onStop, stopping }) {
  const messages = run.messages || [];
  const runActive = run.status === 'running';
  const complete = ['completed', 'complete'].includes(run.status);
  const noNewEmails = !messages.length && Number(run.emails_found || 0) === 0;
  const noMessageSuccess = complete && !messages.length && Number(run.failures || 0) === 0;
  const [expanded, setExpanded] = useState(() => new Set());
  const allExpanded = expanded.size === 6;
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(['email', 'intent', 'duplicate', 'jira', 'notify', 'complete']));
  const stageOrder = ['email', 'intent', 'duplicate', 'jira', 'notify', 'complete'];
  const currentStep = String(run.current_step || '').toLowerCase();
  const activeStage = stageOrder.includes(run.active_stage) ? run.active_stage
    : /notification|delivery confirmation/.test(currentStep) ? 'notify'
      : /creating jira|jira ticket/.test(currentStep) ? 'jira'
        : /duplicate|matching incident/.test(currentStep) ? 'duplicate'
          : /analyz|intent|context/.test(currentStep) ? 'intent' : 'email';
  const stageState = (key) => {
    const statuses = messages.map((event) => event.steps?.find((step) => step.key === key)?.status).filter(Boolean);
    if (noMessageSuccess && key !== 'complete') return 'complete';
    if (run.status === 'cancelled') {
      if (key === 'complete' || statuses.includes('cancelled')) return 'cancelled';
      if (statuses.includes('failed')) return 'failed';
      if (statuses.some((status) => ['complete', 'duplicate', 'skipped'].includes(status))) return 'complete';
      return 'waiting';
    }
    if (runActive) {
      const stageIndex = stageOrder.indexOf(key);
      const activeIndex = stageOrder.indexOf(activeStage);
      if (stageIndex < activeIndex) return statuses.includes('failed') ? 'failed' : 'complete';
      if (stageIndex > activeIndex) return 'waiting';
      if (statuses.includes('active')) return 'active';
      if (statuses.includes('failed')) return 'failed';
      return 'active';
    }
    if (statuses.includes('unconfirmed')) return 'partial';
    if (key === 'complete') {
      const notificationStatuses = messages.map((event) => event.steps?.find((step) => step.key === 'notify')?.status).filter(Boolean);
      if (run.status === 'failed') return 'failed';
      if (run.status === 'partially_completed') return 'partial';
      if (notificationStatuses.some((status) => ['active', 'waiting'].includes(status))) return 'waiting';
      return complete ? 'complete' : 'waiting';
    }
    if (statuses.includes('failed') || run.status === 'failed') return 'failed';
    if (key === 'email') return complete || statuses.includes('complete') ? 'complete' : 'waiting';
    if (key === 'intent') return statuses.includes('complete') ? 'complete' : complete ? 'complete' : 'waiting';
    if (key === 'duplicate') return statuses.some((status) => ['complete', 'duplicate', 'skipped'].includes(status)) || complete ? 'complete' : 'waiting';
    if (key === 'jira') return messages.some((event) => event.jira_key) || statuses.some((status) => ['complete', 'duplicate', 'skipped'].includes(status)) || complete ? 'complete' : 'waiting';
    if (key === 'notify') return statuses.includes('complete') ? 'complete' : statuses.every((status) => status === 'skipped') && statuses.length ? 'skipped' : complete ? 'complete' : 'waiting';
    return complete ? 'complete' : 'waiting';
  };
  const stages = [
    { key: 'email', title: 'Email received', icon: 'outlook', caption: noMessageSuccess ? Number(run.emails_found || 0) === 0 ? 'Inbox checked · no new emails detected' : 'No new messages needed processing' : stageState('email') === 'active' ? 'Checking Outlook for new messages' : 'Outlook messages retrieved', timeKey: 'email' },
    { key: 'intent', title: 'Intent & context extraction', icon: 'ai', caption: noNewEmails ? 'No email to analyze' : noMessageSuccess ? 'No message required analysis' : stageState('intent') === 'active' ? 'Extracting intent and incident context' : 'AI analyzed each message and prepared incident context', timeKey: 'intent' },
    { key: 'duplicate', title: 'Duplicate validation', icon: 'validation', caption: noNewEmails ? 'No incident to compare' : noMessageSuccess ? 'No incident required comparison' : stageState('duplicate') === 'active' ? 'Checking for matching incidents' : 'Checked for matching incidents before creating Jira issues', timeKey: 'duplicate' },
    { key: 'jira', title: 'Jira ticket creation', icon: 'jira', caption: noNewEmails ? 'No Jira ticket required' : noMessageSuccess ? 'No ticket needed for this run' : stageState('jira') === 'active' ? 'Creating Jira tickets' : 'Created tickets and linked results to their source emails', timeKey: 'jira' },
    { key: 'notify', title: 'Requester notification', icon: 'notification', caption: noNewEmails ? 'No notification required' : noMessageSuccess ? 'No notification needed' : stageState('notify') === 'active' ? 'Waiting for delivery confirmation in Outlook' : messages.some((event) => event.steps?.find((step) => step.key === 'notify')?.status === 'unconfirmed') ? 'Delivery could not be confirmed within 3 minutes' : 'Notification delivery status', timeKey: 'notify' },
    { key: 'complete', title: run.status === 'cancelled' ? 'Run stopped' : 'Run completed', caption: run.status === 'cancelled' ? 'Stopped by user' : runActive ? /notification|delivery confirmation/i.test(run.current_step || '') ? 'Waiting for requester notification confirmation' : 'Waiting for earlier steps to finish' : run.status === 'failed' ? 'Run failed' : complete ? 'Completed successfully' : 'Run partially completed' },
  ];
  const realStageStates = stages.map((stage) => stageState(stage.key));
  const activeStageIndex = realStageStates.findIndex((status) => ['active', 'waiting'].includes(status));
  const completedStageCount = realStageStates.filter((status) => ['complete', 'duplicate', 'skipped'].includes(status)).length;
  const progressWidth = activeStageIndex >= 0 ? ((completedStageCount + 0.48) / stages.length) * 100 : complete ? 100 : 8;
  const stageTime = (stage) => {
    if (stage.key === 'complete') return run.completed_at ? formatTime(run.completed_at) : '';
    const times = messages.flatMap((event) => (event.steps || []).filter((step) => step.key === stage.timeKey && step.at).map((step) => step.at));
    return times.length ? formatTime(times.at(-1)) : run.stage_times?.[stage.key] ? formatTime(run.stage_times[stage.key]) : stage.key === 'email' ? formatTime(run.started_at) : '';
  };
  const toggleStage = (key) => setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const renderStageContent = (key) => {
    if (key === 'complete') {
      const emails = run.emails_found || 0;
      const tickets = run.tickets_created || 0;
      const duplicates = run.duplicates_grouped || 0;
      const failures = run.failures || 0;
      return <div className="agent-run-completion-details"><div className="agent-run-completion-counts"><span>{emails} {emails === 1 ? 'email' : 'emails'} detected</span><span>{tickets} {tickets === 1 ? 'ticket' : 'tickets'} created</span><span>{duplicates} {duplicates === 1 ? 'duplicate' : 'duplicates'} grouped</span><span>{failures} {failures === 1 ? 'failure' : 'failures'}</span></div></div>;
    }
    if (!messages.length) return <p className="agent-stage-empty">{noMessageSuccess ? ({ email: Number(run.emails_found || 0) === 0 ? 'The inbox check completed successfully and found no new email.' : 'No new email required processing.', intent: 'No email was detected, so intent and context extraction were not needed.', duplicate: 'No incident was detected, so duplicate validation was not needed.', jira: 'No email required a Jira ticket.', notify: 'No Jira ticket was created, so no requester notification was needed.' }[key] || 'The run completed successfully with no new email.') : runActive && noNewEmails && activeStage !== 'email' ? 'No new email was detected; this stage is completing as a successful no-op.' : runActive ? 'Waiting for email activity…' : 'No message details were retained for this run.'}</p>;
    return <div className="agent-stage-message-list">{messages.map((event) => <article className="agent-stage-message" key={`${key}-${event.id}`}>
      <div className="agent-stage-message-heading"><strong>{event.subject}</strong></div>
      {key === 'email' && <dl className="agent-detail-fields"><dt>Received</dt><dd>{formatDateTime(event.received_at)}</dd><dt>From</dt><dd>{event.sender || 'Unknown sender'}</dd><dt>Message</dt><dd>{event.body_preview || 'Email retrieved; message preview is unavailable.'}</dd></dl>}
      {key === 'intent' && <dl className="agent-detail-fields"><dt>Intent</dt><dd>{event.intent || 'Not classified'}</dd><dt>Category</dt><dd>{event.category || event.intent || 'Not classified'}</dd><dt>Priority</dt><dd>{event.priority || 'Medium'}</dd><dt>Financial impact</dt><dd>{event.financial_impact || financialImpact(event)}</dd><dt>Affected agencies</dt><dd>{event.affected_entities || affectedEntities(event)}</dd><dt>Ticket summary</dt><dd>{event.summary || 'Not available'}</dd><dt>Context</dt><dd>{event.description || 'No extracted description available.'}</dd></dl>}
      {key === 'duplicate' && <dl className="agent-detail-fields"><dt>Result</dt><dd>{event.status === 'duplicate' ? 'Matching incident found or grouped with another email in this run.' : event.steps?.find((step) => step.key === 'duplicate')?.status === 'skipped' ? 'Duplicate check bypassed for this POC report.' : event.steps?.find((step) => step.key === 'duplicate')?.detail || 'No matching incident found.'}</dd><dt>Decision</dt><dd>{event.status === 'duplicate' ? `Use existing Jira issue${event.jira_key ? ` ${event.jira_key}` : ''}.` : event.status === 'created' ? 'Create one new Jira issue.' : 'Pending validation.'}</dd></dl>}
      {key === 'jira' && <dl className="agent-detail-fields"><dt>Ticket</dt><dd>{event.jira_key || (event.status === 'failed' ? 'Creation failed' : 'No ticket created')}</dd><dt>Summary</dt><dd>{event.summary || 'Not available'}</dd><dt>Priority</dt><dd>{event.priority || 'Medium'}</dd><dt>Assignee</dt><dd>{event.assignee || 'Unassigned'}</dd><dt>Description</dt><dd>{event.description || 'Not available'}</dd>{event.jira_project_key && <><dt>Project</dt><dd>{event.jira_project_key}</dd></>}{event.jira_url && <><dt>Jira link</dt><dd><a className="agent-inline-jira-link" href={event.jira_url} target="_blank" rel="noreferrer">Open {event.jira_key} <ArrowRight size={12} /></a></dd></>}</dl>}
      {key === 'notify' && <div className="agent-notification-state"><StatusBadge status={event.steps?.find((step) => step.key === 'notify')?.status || 'skipped'} /><span>{(event.steps?.find((step) => step.key === 'notify')?.detail || 'Requester acknowledgement is not enabled; no email was sent.').replace(/ · Delivery confirmed in Outlook (?:Junk Email|Inbox)/, ' · Delivery confirmed')}</span></div>}
    </article>)}</div>;
  };
  return <div className="agent-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="agent-run-detail-title">
    <div className="agent-detail-shell">
      <header className="agent-detail-topbar"><button type="button" onClick={onBack}><ArrowLeft size={15} /> Execution history</button></header>
      <div className="agent-detail-content">
        <div className="agent-detail-heading"><div><h2 id="agent-run-detail-title">Execution Details</h2><p className="agent-detail-meta">{run.id} · Started {formatDateTime(run.started_at)}{run.completed_at ? ` · Finished ${formatDateTime(run.completed_at)}` : ' · In progress'}</p></div><span className="agent-run-status-cell"><StatusBadge status={run.status} /><StopRunControl run={run} onStop={onStop} stopping={stopping} /></span></div>
        <div className="agent-detail-progress"><span style={{ width: `${progressWidth}%` }} /></div>
        <div className="agent-detail-stats"><Metric label="Emails detected" value={run.emails_found || 0} /><Metric label="Processed" value={run.emails_processed || 0} /><Metric label="Skipped" value={run.emails_skipped || 0} /><Metric label="Tickets created" value={run.tickets_created || 0} /><Metric label="Duplicates grouped" value={run.duplicates_grouped || 0} /><Metric label="Failed" value={run.failures || 0} failed={Boolean(run.failures)} /></div>
        <section className="agent-detail-section"><div className="agent-detail-section-heading"><div><h3>Execution timeline</h3><p>Expand a stage to inspect email, analysis, duplicate, Jira, and notification details.</p></div><div className="agent-timeline-heading-actions"><button className="agent-collapse-all" type="button" onClick={toggleAll}>{allExpanded ? 'Collapse all' : 'Expand all'}</button></div></div>
          <ol className="agent-vertical-timeline agent-run-timeline">{stages.map((stage, index) => {
            const status = realStageStates[index];
            const isExpanded = expanded.has(stage.key);
            const connectorComplete = status === 'complete' || status === 'duplicate';
            const connectorFlowing = connectorComplete && realStageStates[index + 1] === 'active';
            return <li className={`agent-timeline-step is-${status}${isExpanded ? ' is-expanded' : ''}`} key={stage.key}>
              <span className="agent-timeline-marker">{status === 'complete' ? <Check size={14} /> : status === 'failed' ? <TriangleAlert size={14} /> : status === 'active' ? <span className="agent-spinner" /> : status === 'partial' ? '!' : status === 'cancelled' ? <Square size={12} /> : <span />}</span>
              {index < stages.length - 1 && <span className={`agent-timeline-connector${connectorComplete ? ' is-complete' : ''}${connectorFlowing ? ' is-flowing' : ''}`} aria-hidden="true"><i /></span>}
              <div className="agent-timeline-copy"><button className="agent-timeline-toggle" type="button" aria-expanded={isExpanded} onClick={() => toggleStage(stage.key)}><span><strong>{stage.icon && <span className={`agent-timeline-stage-icon is-${stage.key}`} aria-hidden="true"><WorkflowIcon type={stage.icon} /></span>}{stage.title}</strong><small>{stage.caption}</small></span><span className="agent-timeline-toggle-end">{status === 'active' && <span className="agent-processing-label">Processing…</span>}<time>{stageTime(stage)}</time>{status === 'skipped' && <StatusBadge status="skipped" />}<ChevronRight size={15} /></span></button>{isExpanded && <div className="agent-timeline-expanded">{renderStageContent(stage.key)}</div>}</div>
            </li>;
          })}</ol>
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
