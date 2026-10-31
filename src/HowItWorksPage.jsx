import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpenText,
  Braces,
  Check,
  CircleHelp,
  ClipboardList,
  Cloud,
  Copy,
  Database,
  FileSearch,
  LockKeyhole,
  MessageSquareText,
  Network,
  ShieldCheck,
  Sparkles,
  Table2,
  WandSparkles,
} from 'lucide-react';

const policyFlow = [
  { id: 'question', label: 'Your question', detail: 'Ask in everyday language, such as “Compare written premium by state.”', Icon: MessageSquareText, tag: 'YOU' },
  { id: 'api', label: 'Assistant service', detail: 'The FastAPI backend discovers the available Gold schema and sends the relevant context for SQL generation.', Icon: Network, tag: 'FASTAPI' },
  { id: 'llm', label: 'SQL generation', detail: 'Vanna’s SQL workflow uses DeepSeek to draft a query grounded in the discovered schema and business guidance.', Icon: WandSparkles, tag: 'VANNA + DEEPSEEK' },
  { id: 'safety', label: 'Review & safeguards', detail: 'The backend parses the SQL, rejects unsafe or non-read-only statements, and asks you to approve the query before it runs.', Icon: ShieldCheck, tag: 'READ ONLY' },
  { id: 'warehouse', label: 'Databricks', detail: 'The approved query runs against the configured Databricks SQL Warehouse and approved tables.', Icon: Database, tag: 'SQL WAREHOUSE' },
  { id: 'result', label: 'Grounded result', detail: 'The app displays the rows Databricks returned, with the generated SQL, row count, and query time.', Icon: Table2, tag: 'ACTUAL ROWS' },
];

const incidentFlow = [
  { id: 'incident-request', label: 'Ticket request', detail: 'Ask for tickets in plain language, or use the Incident Management dashboard.', Icon: MessageSquareText, tag: 'CHAT OR DASHBOARD' },
  { id: 'incident-service', label: 'Incident service', detail: 'The backend interprets the request, checks the selected POC user and permissions, then performs the supported ticket action.', Icon: Braces, tag: 'FASTAPI' },
  { id: 'incident-data', label: 'Ticket records', detail: 'Ticket, team, policy-link, and activity records are read from or updated in the configured Databricks incident tables.', Icon: ClipboardList, tag: 'DATABRICKS TABLES' },
  { id: 'incident-guidance', label: 'Helpful reference', detail: 'After assignment, the app can retrieve a similar illustrative case from a local JSON reference library and show suggested checks.', Icon: FileSearch, tag: 'LOCAL JSON' },
  { id: 'incident-view', label: 'Synced view', detail: 'The chat and dashboard reflect ticket changes and recent activity from the shared incident data source.', Icon: BadgeCheck, tag: 'CHAT + DASHBOARD' },
];

const samplePrompts = [
  { label: 'Policy data', text: 'Compare written premium by state', Icon: Table2 },
  { label: 'Policy data', text: 'Show coverage codes and written premium by policy', Icon: Database },
  { label: 'Incident tickets', text: 'List all unassigned incident tickets', Icon: ClipboardList },
  { label: 'Incident tickets', text: 'Show incident tickets assigned to me', Icon: CircleHelp },
];

const futureOptions = [
  { name: 'More model providers', detail: 'A provider adapter could support other approved LLMs, such as OpenAI or Claude, without changing the user workflow.', Icon: Sparkles },
  { name: 'More data platforms', detail: 'Connector modules could extend data access to SQL Server, Azure SQL, or Snowflake after each source is configured and approved.', Icon: Database },
  { name: 'Richer knowledge retrieval', detail: 'A vector database could replace or augment the current local JSON lookup as verified, approved reference material grows.', Icon: FileSearch },
];

function FlowLane({ title, caption, items, activeId, onSelect, variant }) {
  return <section className={`guide-flow-lane guide-flow-${variant}`} aria-label={title}>
    <div className="guide-lane-heading"><span>{title}</span><small>{caption}</small></div>
    <div className="guide-flow-track">
      {items.map(({ id, label, detail, Icon, tag }, index) => <div className="guide-flow-item-wrap" key={id}>
        <button type="button" className={`guide-flow-node${activeId === id ? ' is-active' : ''}`} onClick={() => onSelect(id)} aria-pressed={activeId === id}>
          <span className="guide-flow-icon"><Icon size={18} strokeWidth={1.8} /></span>
          <span className="guide-flow-copy"><small>{tag}</small><strong>{label}</strong></span>
        </button>
        {index < items.length - 1 && <span className="guide-flow-connector" aria-hidden="true"><ArrowRight size={16} /></span>}
      </div>)}
    </div>
  </section>;
}

export function HowItWorksPage({ onUsePrompt }) {
  const [activeFlowId, setActiveFlowId] = useState('safety');
  const [copiedPrompt, setCopiedPrompt] = useState('');
  const activeFlow = [...policyFlow, ...incidentFlow].find(({ id }) => id === activeFlowId) || policyFlow[3];

  async function copyPrompt(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(text);
      window.setTimeout(() => setCopiedPrompt(''), 1600);
    } catch {
      onUsePrompt(text);
    }
  }

  return <section className="guide-page" id="top">
    <div className="guide-page-inner">
      <header className="guide-hero">
        <div className="guide-eyebrow"><BookOpenText size={15} /> Progressive AI · POC guide</div>
        <h1>Policy insight and incident work, made easier.</h1>
        <p>Ask a question in plain language. Explore policy data, work with incident tickets, and see how the assistant gets from your request to a useful result.</p>
        <div className="guide-hero-meta"><span><i /> Current POC capabilities</span><span>Built for human review</span></div>
      </header>

      <section className="guide-section guide-architecture" aria-labelledby="guide-architecture-title">
        <div className="guide-section-heading">
          <div><span className="guide-kicker">THE SYSTEM, AT A GLANCE</span><h2 id="guide-architecture-title">A clear path from request to result</h2></div>
          <p>Choose a step to see what happens there.</p>
        </div>
        <div className="guide-architecture-canvas">
          <FlowLane title="Policy questions" caption="Text to SQL · human-approved execution" items={policyFlow} activeId={activeFlowId} onSelect={setActiveFlowId} variant="policy" />
          <div className="guide-flow-divider"><span>Shared Progressive AI experience</span></div>
          <FlowLane title="Incident tickets" caption="Ticket search · controlled updates · reference guidance" items={incidentFlow} activeId={activeFlowId} onSelect={setActiveFlowId} variant="incident" />
          <div className="guide-flow-detail" aria-live="polite"><span className="guide-flow-detail-icon"><activeFlow.Icon size={17} /></span><div><small>WHAT HAPPENS HERE</small><strong>{activeFlow.label}</strong><p>{activeFlow.detail}</p></div><span className="guide-flow-step">{activeFlow.tag}</span></div>
        </div>
        <div className="guide-architecture-note"><LockKeyhole size={15} /><span>Credentials stay on the server. Policy SQL is validated as read-only and must be approved before execution.</span></div>
      </section>

      <section className="guide-section" aria-labelledby="guide-capabilities-title">
        <div className="guide-section-heading"><div><span className="guide-kicker">WHAT YOU CAN DO</span><h2 id="guide-capabilities-title">Two ways to get work moving</h2></div><p>Start with a question or open a dashboard.</p></div>
        <div className="guide-capability-grid">
          <article className="guide-capability-card policy-capability">
            <span className="guide-capability-icon"><Table2 size={20} /></span><span className="guide-card-label">POLICY DATA</span><h3>Explore policy records</h3>
            <p>Ask for premiums, coverage, transactions, or comparisons in everyday language. Review the SQL before approving a read-only query.</p>
            <ul><li>See actual rows returned from Databricks</li><li>Inspect the SQL, result count, and query time</li><li>Continue exploring with relevant follow-up questions</li></ul>
          </article>
          <article className="guide-capability-card incident-capability">
            <span className="guide-capability-icon"><ClipboardList size={20} /></span><span className="guide-card-label">INCIDENT TICKETS</span><h3>Find and manage incidents</h3>
            <p>Search tickets in chat or Incident Management, open ticket details, and use the available ticket actions.</p>
            <ul><li>Assign, reassign, or update ticket status</li><li>See activity and ticket counts reflected in the dashboard</li><li>Get suggested investigation checks after assignment</li></ul>
          </article>
        </div>
      </section>

      <section className="guide-section guide-examples" aria-labelledby="guide-examples-title">
        <div className="guide-section-heading"><div><span className="guide-kicker">TRY A STARTER QUESTION</span><h2 id="guide-examples-title">A few useful ways to begin</h2></div><p>Use a prompt in chat or copy it for later.</p></div>
        <div className="guide-prompt-grid">{samplePrompts.map(({ label, text, Icon }) => <article className="guide-prompt-card" key={text}>
          <span className="guide-prompt-icon"><Icon size={17} /></span><div><small>{label}</small><strong>{text}</strong></div>
          <button type="button" onClick={() => onUsePrompt(text)} aria-label={`Use prompt: ${text}`} title="Open this prompt in chat"><ArrowUpRight size={17} /></button>
          <button type="button" className="guide-prompt-copy" onClick={() => copyPrompt(text)} aria-label={copiedPrompt === text ? 'Prompt copied' : `Copy prompt: ${text}`} title={copiedPrompt === text ? 'Copied' : 'Copy prompt'}>{copiedPrompt === text ? <Check size={15} /> : <Copy size={15} />}</button>
        </article>)}</div>
      </section>

      <section className="guide-section guide-boundaries" aria-labelledby="guide-boundaries-title">
        <div className="guide-section-heading"><div><span className="guide-kicker">CLEAR EXPECTATIONS</span><h2 id="guide-boundaries-title">What this POC can—and cannot—do</h2></div><p>Designed to help people investigate, not make decisions for them.</p></div>
        <div className="guide-boundary-grid">
          <article className="guide-boundary-card"><span className="guide-boundary-mark good"><Check size={15} /></span><div><h3>It can</h3><p>Query the configured policy data, show returned results, and manage supported incident ticket fields through the app.</p><p>Use a similar illustrative incident to suggest a few starting checks when a ticket is assigned.</p></div></article>
          <article className="guide-boundary-card"><span className="guide-boundary-mark note"><CircleHelp size={15} /></span><div><h3>It does not yet</h3><p>Connect to every enterprise data source, search a production vector database, or automatically diagnose and repair a data issue.</p><p>Suggested investigation steps are pointers to verify—not confirmed root causes or guaranteed fixes.</p></div></article>
        </div>
        <div className="guide-sample-data-note"><Sparkles size={15} /><span>The incident resolution library currently contains <strong>illustrative synthetic examples</strong>, not verified historical Progressive resolutions. Validate suggested checks against current evidence and approved runbooks.</span></div>
      </section>

      <section className="guide-section guide-current-stack" aria-labelledby="guide-stack-title">
        <div className="guide-section-heading"><div><span className="guide-kicker">CURRENT CONFIGURATION</span><h2 id="guide-stack-title">What powers this version</h2></div><p>The architecture is modular; the connections below describe this POC today.</p></div>
        <div className="guide-stack-list">
          <div><span className="guide-stack-icon"><MessageSquareText size={17} /></span><span><strong>Web app</strong><small>React interface for chat, results, and dashboards</small></span><em>IN USE</em></div>
          <div><span className="guide-stack-icon"><Braces size={17} /></span><span><strong>Application backend</strong><small>FastAPI service for SQL workflow and incident requests</small></span><em>IN USE</em></div>
          <div><span className="guide-stack-icon"><WandSparkles size={17} /></span><span><strong>SQL assistant</strong><small>Vanna workflow configured with DeepSeek for SQL generation</small></span><em>IN USE</em></div>
          <div><span className="guide-stack-icon"><Database size={17} /></span><span><strong>Data platform</strong><small>Databricks SQL Warehouse and configured policy and incident tables</small></span><em>IN USE</em></div>
          <div><span className="guide-stack-icon"><FileSearch size={17} /></span><span><strong>Incident references</strong><small>Local JSON library of illustrative investigation patterns</small></span><em>POC DATA</em></div>
        </div>
        <div className="guide-poc-caveat"><ShieldCheck size={17} /><p>Account switching and role rules are POC controls; they are not a substitute for enterprise SSO or a production authorization review. Generated SQL and investigation guidance should be reviewed by a person.</p></div>
      </section>

      <section className="guide-section guide-next" aria-labelledby="guide-next-title">
        <div className="guide-section-heading"><div><span className="guide-kicker">A PLATFORM THAT CAN GROW</span><h2 id="guide-next-title">Designed for future connections</h2></div><p>These are extension paths, not integrations that are live today.</p></div>
        <div className="guide-future-grid">{futureOptions.map(({ name, detail, Icon }) => <article key={name}><span><Icon size={18} /></span><div><h3>{name}</h3><p>{detail}</p></div><Cloud size={16} className="guide-future-mark" /></article>)}</div>
        <div className="guide-future-bar"><span>One experience</span><ArrowRight size={16} /><span>Replaceable AI and data adapters</span><ArrowRight size={16} /><span>Broader, approved sources</span></div>
      </section>

      <footer className="guide-footer"><span className="guide-footer-mark"><BookOpenText size={17} /></span><p><strong>Progressive AI · POC field guide</strong><span>Capabilities and connections can change as the proof of concept evolves. This guide describes the current implementation.</span></p><a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Back to top <ArrowUpRight size={14} /></a></footer>
    </div>
  </section>;
}
