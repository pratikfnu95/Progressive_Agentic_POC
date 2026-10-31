# Incident Management and Policy Dashboard Roadmap

## Current Databricks-backed POC workflow

Incident Management reads current tickets, related policies, team members, and activity from `workspace.default.incident_tickets`, `workspace.default.incident_ticket_policies`, `workspace.default.incident_team_members`, and `workspace.default.incident_ticket_activity`. The JSON file under `src/data` is no longer the dashboard's data source. Dashboard actions and chat actions use the same backend service and update Databricks; the dashboard refreshes from those tables. Recent activity starts empty and is appended as actions occur. Ticket creation remains a placeholder.

Chat asks DeepSeek to classify ticket requests into a constrained JSON intent. The server then reads actual rows or applies a supported action; it does not ask the model to invent ticket details or SQL for incident actions. Supported actions include assignment, status updates, unassignment, and decline. Status is restricted to In Progress, Blocked, Waiting for Info, or Completed. Normal users can update their own assigned tickets; Admin can update any ticket. Assigning to oneself is allowed for unassigned tickets. Every write is validated again by the backend.

The account menu lets a user select a roster identity without an individual account password. The backend stores the selected identity in a signed, HTTP-only session cookie and resolves role/active status from the team roster. This is a demonstration identity switch, not verified user authentication: anyone who can reach the account menu can select any account, so per-user ownership controls are not a security boundary. The existing app-wide access code remains a separate gate.

### Assignment-time investigation guide

After a ticket is assigned through the chat or dashboard, the server can attach a DeepSeek-generated investigation guide to the assignment response. It retrieves matching incident examples from `knowledge_base/incident_reference_cases.json`, uses the Workers' Compensation POC knowledge base for approved table/lineage checks, and returns source-backed case references, category counts, and ordered investigation steps. The guide is shown to the user completing the assignment; if Admin assigns the ticket to another person, there is no push-notification system to deliver it to that person's session.

The case snapshot is generated from all rows in `workspace.default.incident_tickets` and related policy rows, including inactive tickets, by running `.venv/bin/python -m backend.sync_incident_knowledge`. The current snapshot contains eight records and is not a verified resolution archive: the incident tables contain no confirmed root-cause or successful-resolution fields. The UI and prompt must label these as related issue records and investigation suggestions, never as proven fixes. Category counts are counts within the current snapshot, not an enterprise recurrence rate. EDW schemas are not documented in the available knowledge base, so guides must not invent EDW table names.

The Vercel incident function explicitly includes the prompt and knowledge-base files it reads at runtime. Refresh the snapshot and redeploy after adding reviewed incident examples.

The app service principal needs `USE CATALOG` on `workspace`, `USE SCHEMA` on `workspace.default`, `SELECT` on all four incident tables, and `MODIFY` on the tickets and activity tables. Access to the new tables must be confirmed before the workflow can be considered live. Browser-local JSON state is not used for ticket updates.

## Future incident lifecycle

The planned incident lifecycle is:

1. Unassigned
2. Assigned
3. In Progress
4. Waiting for Info
5. Blocked
6. Completed

Future work includes ticket creation, richer audit history views, and stronger identity integration. Ticket actions should remain explicit and auditable.

## Future AI-assisted investigation

Future investigation capabilities may:

1. Interpret the reported issue.
2. Query relevant policy data in Databricks using the existing read-only SQL workflow.
3. Search a curated Markdown knowledge base of historical incidents.
4. Find similar incidents and explain the evidence behind each match.
5. Present verified diagnostic steps, root causes, resolutions, and references.
6. Recommend next checks while clearly labeling unverified hypotheses.
7. Let the user create a ticket after reviewing the findings.

The assistant must not present a hypothesis as a confirmed cause, fabricate data or history, or perform operational changes without approval.

## Knowledge base requirements for verified fixes

Begin with version-controlled Markdown files using consistent fields such as:

- Incident ID and title
- Affected data layer, pipeline, or policy area
- Symptoms and impact
- Verified root cause and supporting evidence
- Diagnostic steps
- Resolution and follow-up actions
- Related tables, jobs, code paths, and references
- Verification status and owner

Only reviewed incidents with documented evidence and outcomes should be used as verified historical resolutions. The present seeded ticket rows can support symptom similarity and triage suggestions, but not claims of proven fixes. Search or retrieval infrastructure can be selected later based on the size and access requirements of the knowledge base.

## Data and access guardrails

- Keep Incident Management (ticket lifecycle) distinct from Policy Dashboard (policy data-quality overview).
- Use the approved Databricks incident tables as the source of truth for incident data.
- Keep credentials server-side and use least-privilege Databricks access.
- Enforce identity and ownership checks on the backend; do not trust an identity supplied by the browser.
- Preserve the existing SQL review, read-only validation, and explicit execution approval flow.
- Require human approval for ticket creation, assignment, or other actions with operational impact.
