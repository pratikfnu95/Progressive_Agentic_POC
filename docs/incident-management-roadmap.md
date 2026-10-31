# Incident Management and Policy Dashboard Roadmap

## Current Databricks-backed POC workflow

Incident Management reads current tickets, related policies, team members, and activity from `workspace.default.incident_tickets`, `workspace.default.incident_ticket_policies`, `workspace.default.incident_team_members`, and `workspace.default.incident_ticket_activity`. The JSON file under `src/data` is no longer the dashboard's data source. Dashboard actions and chat actions use the same backend service and update Databricks; the dashboard refreshes from those tables. Recent activity starts empty and is appended as actions occur. Ticket creation remains a placeholder.

Chat asks DeepSeek to classify ticket requests into a constrained JSON intent. The server then reads actual rows or applies a supported action; it does not ask the model to invent ticket details or SQL for incident actions. Supported actions include assignment, status updates, unassignment, and decline. Status is restricted to In Progress, Blocked, Waiting for Info, or Completed. Normal users can update their own assigned tickets; Admin can update any ticket. Assigning to oneself is allowed for unassigned tickets. Every write is validated again by the backend.

The account menu lets a user select a roster identity without an individual account password. The backend stores the selected identity in a signed, HTTP-only session cookie and resolves role/active status from the team roster. This is a demonstration identity switch, not verified user authentication: anyone who can reach the account menu can select any account, so per-user ownership controls are not a security boundary. The existing app-wide access code remains a separate gate.

### Assignment-time investigation guide

After a ticket is assigned through the chat or dashboard, the server attaches a concise investigation guide to the assignment response. It ranks one reference from `knowledge_base/illustrative_resolved_incident_cases.json` using issue category and symptom terms, then displays that reference's stored resolution summary and up to three short checks. A matching `watch_for` is shown as a caution, not as a confirmed diagnosis. The guide is shown to the user completing the assignment; if Admin assigns the ticket to another person, there is no push-notification system to deliver it to that person's session.

The operational ticket snapshot in `knowledge_base/incident_reference_cases.json` is generated from `workspace.default.incident_tickets` and related policy rows by running `.venv/bin/python -m backend.sync_incident_knowledge`. It remains live ticket context only and is not used as proof of a historical resolution. The separate `knowledge_base/illustrative_resolved_incident_cases.json` currently contains 22 synthetic examples with representative resolution workflows. They are explicitly labeled illustrative and are not actual Progressive incidents or verified historical fixes. Replace them with reviewed cases before presenting them as real history. Table names in the examples are drawn from the documented Workers' Compensation knowledge base; EDW names are not invented.

The Vercel incident function explicitly includes the reference JSON and supporting knowledge-base files it reads at runtime. Refresh the operational ticket snapshot only when live ticket context changes; redeploy after changing the curated reference library.

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

Only reviewed incidents with documented evidence and outcomes should be presented as verified historical resolutions. The current synthetic case library supports a POC retrieval and concise triage flow only. Replace sample cases with reviewed incidents before making historical claims. Search or retrieval infrastructure can be selected later based on the size and access requirements of the knowledge base.

## Data and access guardrails

- Keep Incident Management (ticket lifecycle) distinct from Policy Dashboard (policy data-quality overview).
- Use the approved Databricks incident tables as the source of truth for incident data.
- Keep credentials server-side and use least-privilege Databricks access.
- Enforce identity and ownership checks on the backend; do not trust an identity supplied by the browser.
- Preserve the existing SQL review, read-only validation, and explicit execution approval flow.
- Require human approval for ticket creation, assignment, or other actions with operational impact.
