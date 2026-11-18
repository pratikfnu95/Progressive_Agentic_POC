import { useState } from 'react';
import { AlertCircle, Check, CircleDashed, Mail, Send, Shuffle, Sparkles } from 'lucide-react';

const agencyNames = ['Horizon Insurance Group', 'Pinecrest Mutual', 'Summit Risk Advisors', 'Liberty Commercial Brokers', 'Evergreen Coverage Partners'];
const contactNames = ['Jordan Ellis', 'Taylor Morgan', 'Riley Bennett', 'Casey Parker', 'Avery Brooks', 'Morgan Reed'];
const cities = [
  ['Newark', 'NJ', '07102'], ['Columbus', 'OH', '43215'], ['Madison', 'WI', '53703'],
  ['Richmond', 'VA', '23219'], ['Hartford', 'CT', '06103'],
];

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(items) { return items[randomInt(0, items.length - 1)]; }
function runId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  return `${Date.now().toString(36)}${randomInt(10000, 99999)}`.toUpperCase().slice(-12);
}
function money(value) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value); }
function dateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}
function agencyCode() { return `AGY-${randomInt(10000, 99999)}`; }

const samples = [
  {
    id: 'agency-setup',
    name: 'New agency account setup',
    make(id) {
      const agency = `${pick(agencyNames)} ${pick(['LLC', 'Inc.', 'Group'])}`;
      const code = agencyCode();
      const contact = pick(contactNames);
      const [city, state, zip] = pick(cities);
      const emailName = contact.toLowerCase().replaceAll(' ', '.');
      const subject = `Request to Set Up New Agency Account – ${agency} [POC-REPORT:${id}]`;
      const body = `Hi Team,\n\nWe have received a request to onboard a new insurance agency into our system. Please create the agency account and configure the necessary access so they can begin submitting Workers' Compensation policies.\n\nAgency details:\nAgency Name: ${agency}\nAgency Code: ${code}\nAgency Type: ${pick(['Independent Agency', 'Regional Brokerage', 'Commercial Agency'])}\nPrimary Contact: ${contact}\nContact Email: ${emailName}@example.com\nContact Number: (555) ${randomInt(200, 999)}-${randomInt(1000, 9999)}\nAgency Address: ${randomInt(100, 999)} Market Street, ${city}, ${state} ${zip}\nEffective Date: ${dateAfter(randomInt(3, 30))}\n\nPlease ensure the agency is properly configured in the agency management system and that the agency information is synchronized with the downstream EDW and reporting systems.\n\nKindly prioritize this request and confirm once setup is completed.\n\nThanks,\nProduction Support Team\n\nPOC run reference: ${id}`;
      return { id, subject, body };
    },
  },
  {
    id: 'commission-failure',
    name: 'Agency commission distribution failure',
    make(id) {
      const now = new Date();
      const cycle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(now);
      const agencies = [...agencyNames].sort(() => Math.random() - 0.5).slice(0, 3);
      const records = agencies.map((name) => ({ code: agencyCode(), name, amount: randomInt(75, 330) * 100 }));
      const total = records.reduce((sum, row) => sum + row.amount, 0);
      const subject = `URGENT: Agency Commission Distribution Failure – ${cycle} [POC-REPORT:${id}]`;
      const details = records.map((row) => `• ${row.code} – ${row.name} – ${money(row.amount)}`).join('\n');
      const body = `Hi Team,\n\nWe have identified an issue with the agency commission distribution process for the ${cycle} processing cycle.\n\nThe commission distribution job completed successfully in Databricks; however, the calculated commission amounts have not been reflected in the downstream EDW tables.\n\nThe following agencies are impacted:\n${details}\n\nThe total impacted commission amount is ${money(total)}.\n\nPlease investigate the data synchronization issue and ensure the commission records are correctly updated in EDW before the next scheduled distribution cycle. This is impacting agency payment reporting and requires immediate attention.\n\nThanks,\nProduction Support Team\n\nPOC run reference: ${id}`;
      return { id, subject, body };
    },
  },
  {
    id: 'missing-edw-agency',
    name: 'Agency information missing in EDW',
    make(id) {
      const selected = [...agencyNames].sort(() => Math.random() - 0.5).slice(0, 3);
      const codes = selected.map(() => agencyCode());
      const subject = `Agency Information Missing in EDW – Policy Processing Issue [POC-REPORT:${id}]`;
      const body = `Hi Team,\n\nDuring today's data validation, we identified that several newly onboarded agencies are not appearing in the EDW Producer Dimension table.\n\nThe affected agency codes are ${codes.join(', ')}.\n\nThe agency records are available in the source system, but they are missing from the downstream EDW tables. As a result, the corresponding policies are not being mapped to the correct producers in reporting.\n\nPlease investigate the agency data load and verify whether any records were excluded during the latest ETL execution.\n\nKindly resolve this issue before the next scheduled production load.\n\nSample agency names: ${selected.join('; ')}\nPOC batch reference: BATCH-${id}\n\nThanks,\nProduction Support Team\n\nPOC run reference: ${id}`;
      return { id, subject, body };
    },
  },
];

function createDraft(excludeId = '') {
  const options = samples.filter((sample) => sample.id !== excludeId);
  const sample = pick(options.length ? options : samples);
  const id = runId();
  return { ...sample.make(id), sampleName: sample.name };
}

export function ReportIssueForm({ onClose }) {
  const [draft, setDraft] = useState(() => createDraft());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);

  function update(event) {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
    setError('');
  }

  function shuffleSample() {
    setDraft((current) => createDraft(current.sampleName ? samples.find((sample) => sample.name === current.sampleName)?.id : ''));
    setError('');
    setSent(null);
  }

  async function submit(event) {
    event.preventDefault();
    if (sending || sent) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/agent-workspace/report-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: draft.subject, body: draft.body, report_id: draft.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not send the report email.');
      setSent(payload);
    } catch (sendError) {
      setError(sendError.message || 'Could not send the report email.');
    } finally {
      setSending(false);
    }
  }

  if (sent) return <div className="report-issue-success" role="status" aria-live="polite">
    <span className="report-issue-success-icon"><Check size={23} /></span>
    <span className="report-issue-kicker">OUTLOOK ACCEPTED</span>
    <h3>Outlook accepted the report email</h3>
    <p><strong>{sent.subject}</strong></p>
    <div className="report-issue-delivery"><Mail size={15} /><span>Send request accepted for</span><small>{sent.recipient}</small></div>
    <p className="report-issue-footnote">Outlook accepted the message for sending. Inbox delivery is not confirmed until it appears in the recipient mailbox.</p>
    <p className="report-issue-next-step">Open <strong>Agent Workspace</strong> and click <strong>Check inbox now</strong> to continue the email-to-Jira test.</p>
    <button className="dashboard-modal-done" type="button" onClick={onClose}>Done</button>
  </div>;

  return <form className="report-issue-form" onSubmit={submit}>
    <div className="report-issue-intro"><span className="report-issue-intro-icon"><Sparkles size={16} /></span><div><strong>{draft.sampleName}</strong><small>Editable sample · a unique reference is added for each report</small></div><button type="button" className="report-issue-shuffle" onClick={shuffleSample} disabled={sending}><Shuffle size={14} />New sample</button></div>
    <label className="report-issue-field" htmlFor="report-issue-subject">Email subject
      <input id="report-issue-subject" name="subject" value={draft.subject} onChange={update} maxLength={240} required />
    </label>
    <label className="report-issue-field" htmlFor="report-issue-body">Email description
      <textarea id="report-issue-body" name="body" value={draft.body} onChange={update} rows={13} maxLength={12_000} required />
    </label>
    {error && <div className="report-issue-error" role="alert"><AlertCircle size={15} />{error}</div>}
    <div className="report-issue-footer"><span><Mail size={14} />Sends to your connected Outlook inbox</span><button className="dashboard-modal-done report-issue-submit" type="submit" disabled={sending || !draft.subject.trim() || !draft.body.trim()}>{sending ? <><CircleDashed size={15} className="report-issue-spinner" />Sending…</> : <><Send size={15} />Report</>}</button></div>
    <p className="report-issue-footnote">This sends a real test email. Jira creation happens only when you run the manual inbox check.</p>
  </form>;
}
