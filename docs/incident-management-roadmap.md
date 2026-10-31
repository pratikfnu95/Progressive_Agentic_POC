# Incident Management and Policy Dashboard Roadmap

## Current UI phase

Incident Management and Policy Dashboard are illustrative, front-end-only views. The Incident Management seed tickets are stored in `src/data/incident-tickets.json`; its summary counts and status chart are computed from that file. The initial recent-activity feed is empty. Ticket IDs and summaries open a detail dialog with the issue description and any related policy numbers and statuses. Demo sign-in supports Pratik and Sarvesh. The detail dialog's Take action flow allows acknowledgement/assignment for unassigned tickets; the assigned user can update status, reassign, unassign, or decline. Other signed-in users can view an assigned ticket but cannot change it. Status choices include In Progress, Blocked, Waiting for Info (the Request more access action), and Completed. These actions update browser-local demo state and add activity entries; the state is stored in this browser's local storage. Ticket creation remains a placeholder. The login and assignment checks are client-side demo behavior, not production authorization. These pages do not call the LLM, query Databricks, search external systems, or write to a shared ticket store.

To reset the local Incident Management demo to the JSON seed, clear the browser local-storage key `progressive-poc-incident-management-v5` for the app's site and reload the page. To sign out or switch users, use the profile control in the page header.

## Future incident lifecycle

The planned incident lifecycle is:

1. Unassigned
2. Assigned
3. In Progress
4. Blocked
5. Completed

When a trusted incident store is selected, users should be able to view tickets, assign unassigned tickets to themselves or teammates, update status, track ownership and timestamps, and inspect ticket history. Ticket creation and updates should require explicit user action and be auditable.

## Future AI-assisted investigation

After authorization and data access are designed, the assistant may:

1. Interpret the reported issue.
2. Query relevant policy data in Databricks using the existing read-only SQL workflow.
3. Search a curated Markdown knowledge base of historical incidents.
4. Find similar incidents and explain the evidence behind each match.
5. Present verified diagnostic steps, root causes, resolutions, and references.
6. Recommend next checks while clearly labeling unverified hypotheses.
7. Let the user create a ticket after reviewing the findings.

The assistant must not present a hypothesis as a confirmed cause, fabricate data or history, or perform operational changes without approval.

## Future knowledge base

Begin with version-controlled Markdown files using consistent fields such as:

- Incident ID and title
- Affected data layer, pipeline, or policy area
- Symptoms and impact
- Verified root cause and supporting evidence
- Diagnostic steps
- Resolution and follow-up actions
- Related tables, jobs, code paths, and references
- Verification status and owner

Only reviewed incidents should be used as verified historical evidence. Search or retrieval infrastructure can be selected later based on the size and access requirements of the knowledge base.

## Data and access guardrails

- Keep Incident Management (ticket lifecycle) distinct from Policy Dashboard (policy data-quality overview).
- Replace illustrative UI data only when an approved, documented data source is available.
- Keep credentials server-side and use least-privilege Databricks access.
- Preserve the existing SQL review, read-only validation, and explicit execution approval flow.
- Require human approval for ticket creation, assignment, or other actions with operational impact.
