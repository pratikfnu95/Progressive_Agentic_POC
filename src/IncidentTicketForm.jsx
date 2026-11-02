import { useState } from 'react';
import { AlertCircle, CircleDashed, ClipboardList, UserRound } from 'lucide-react';
import { ProgressiveSelect } from './ProgressiveSelect.jsx';

const categories = [
  'Premium mismatch', 'Missing coverage data', 'Incorrect policy status', 'Duplicate transaction',
  'Missing source data', 'ADF pipeline failure', 'Informatica mapping issue', 'Missing downstream data',
];
const priorities = ['Low', 'Medium', 'High', 'Urgent'];

export function IncidentTicketForm({ onSubmit, currentUser, submitLabel = 'Create ticket' }) {
  const [values, setValues] = useState({
    issue_summary: '', issue_description: '', requester_full_name: '', issue_category: '', priority: '', assigned_to: 'Leave unassigned',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function validateField(name, value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (name === 'issue_summary') {
      if (!text) return 'Add an issue summary.';
      if (text.length < 8) return 'Use at least 8 characters.';
    }
    if (name === 'issue_category' && !text) return 'Choose an incident type.';
    if (name === 'priority' && !text) return 'Choose a priority.';
    if (name === 'requester_full_name') {
      if (!text) return 'Add the requester’s full name.';
      if (text.length < 2) return 'Enter at least 2 characters.';
    }
    if (name === 'issue_description' && text && text.length < 10) {
      return 'Add at least 10 characters, or leave the description blank.';
    }
    return '';
  }

  function update(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: validateField(name, value) }));
    setError('');
  }

  function updateSelection(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: validateField(name, value) }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const nextErrors = Object.fromEntries(
      ['issue_summary', 'issue_category', 'priority', 'requester_full_name', 'issue_description']
        .map((name) => [name, validateField(name, values[name])])
        .filter(([, message]) => message)
    );
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Please review the highlighted fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await onSubmit(values);
      if (created === false) {
        setError('The ticket could not be created. Please try again.');
        setSaving(false);
      }
    } catch (submitError) {
      setError(submitError.message || 'The ticket could not be created. Please try again.');
      setSaving(false);
    }
  }

  return <form className="incident-create-form" onSubmit={submit} noValidate>
    <p className="incident-create-intro">Capture the issue and requester. Assign an owner now, or leave the ticket unassigned to assign later.</p>
    <div className="incident-create-grid">
      <label className={`incident-create-field incident-create-span${fieldErrors.issue_summary ? ' has-error' : ''}`} htmlFor="incident-create-summary">Issue summary <span>Required</span>
        <div className={`incident-create-control${fieldErrors.issue_summary ? ' is-invalid' : ''}`}>
          <input id="incident-create-summary" name="issue_summary" value={values.issue_summary} onChange={update} minLength={8} maxLength={160} required placeholder="Briefly describe the issue" aria-invalid={Boolean(fieldErrors.issue_summary)} aria-describedby={fieldErrors.issue_summary ? 'incident-create-summary-error' : undefined} />
          {fieldErrors.issue_summary && <AlertCircle className="incident-create-invalid-icon" size={17} aria-hidden="true" />}
        </div>
        {fieldErrors.issue_summary && <small className="incident-create-field-error" id="incident-create-summary-error">{fieldErrors.issue_summary}</small>}
      </label>
      <ProgressiveSelect label="Incident type" required value={values.issue_category} placeholder="Select a category" options={categories} error={fieldErrors.issue_category} onChange={(value) => updateSelection('issue_category', value)} />
      <ProgressiveSelect label="Priority" required value={values.priority} placeholder="Select priority" options={priorities} error={fieldErrors.priority} onChange={(value) => updateSelection('priority', value)} />
      <label className={`incident-create-field incident-create-span${fieldErrors.issue_description ? ' has-error' : ''}`} htmlFor="incident-create-description">Description <span>Optional</span>
        <div className={`incident-create-control incident-create-textarea-control${fieldErrors.issue_description ? ' is-invalid' : ''}`}>
          <textarea id="incident-create-description" name="issue_description" value={values.issue_description} onChange={update} minLength={10} maxLength={3000} rows={4} placeholder="Include what happened, where it appeared, and any useful context." aria-invalid={Boolean(fieldErrors.issue_description)} aria-describedby={fieldErrors.issue_description ? 'incident-create-description-error' : undefined} />
          {fieldErrors.issue_description && <AlertCircle className="incident-create-invalid-icon" size={17} aria-hidden="true" />}
        </div>
        {fieldErrors.issue_description && <small className="incident-create-field-error" id="incident-create-description-error">{fieldErrors.issue_description}</small>}
      </label>
      <label className={`incident-create-field incident-create-span${fieldErrors.requester_full_name ? ' has-error' : ''}`} htmlFor="incident-create-requester">Customer or requester full name <span>Required</span>
        <div className={`incident-create-control${fieldErrors.requester_full_name ? ' is-invalid' : ''}`}>
          <input id="incident-create-requester" name="requester_full_name" value={values.requester_full_name} onChange={update} minLength={2} maxLength={120} required placeholder="Full name of the person who reported the issue" aria-invalid={Boolean(fieldErrors.requester_full_name)} aria-describedby={fieldErrors.requester_full_name ? 'incident-create-requester-error' : undefined} />
          {fieldErrors.requester_full_name && <AlertCircle className="incident-create-invalid-icon" size={17} aria-hidden="true" />}
        </div>
        {fieldErrors.requester_full_name && <small className="incident-create-field-error" id="incident-create-requester-error">{fieldErrors.requester_full_name}</small>}
      </label>
    </div>
    <ProgressiveSelect label="Assign ticket to" optional value={values.assigned_to} placeholder="Leave unassigned" options={['Leave unassigned', 'Pratik', 'Sarvesh', 'Madhu', 'Saurabh']} onChange={(value) => updateSelection('assigned_to', value)} className="incident-create-assignee-select" />
    <div className="incident-create-assignment"><span><UserRound size={15} />Created by</span><strong>{currentUser || 'Signed-in user'}</strong><small>{values.assigned_to === 'Leave unassigned' ? 'This ticket will stay unassigned until someone takes ownership.' : `This ticket will be assigned to ${values.assigned_to}.`}</small></div>
    {error && <div className="incident-create-error" role="alert">{error}</div>}
    <div className="incident-create-footer">
      <span><ClipboardList size={14} />Saved to the incident workspace</span>
      <button className="incident-chat-primary" type="submit" disabled={saving}>{saving ? <><CircleDashed size={15} className="incident-create-spinner" />Creating…</> : submitLabel}</button>
    </div>
  </form>;
}
