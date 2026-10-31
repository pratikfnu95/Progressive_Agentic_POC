# Incident Reference Cases and Investigation Guide

> Snapshot of incident facts read from the Databricks incident tables. This is a proof-of-concept reference set, not a verified resolution archive.

- Snapshot time (UTC): `2026-10-31T15:31:29+00:00`
- Ticket source: `workspace.default.incident_tickets`
- Related policy source: `workspace.default.incident_ticket_policies`
- Records in this snapshot: **8**
- The snapshot includes active and inactive ticket rows.
- Category frequency is a count of records in this snapshot; it is not a recurrence rate or proof of a common root cause.
- The incident tables do not contain verified resolution/root-cause fields. Current status, assignment, and dates are not evidence that a fix was successful.

## Recorded issue frequency

| Issue category | Tickets | Share of this snapshot |
|---|---:|---:|
| ADF pipeline failure | 1 | 12% |
| Duplicate transaction | 1 | 12% |
| Incorrect policy status | 1 | 12% |
| Informatica mapping issue | 1 | 12% |
| Missing coverage data | 1 | 12% |
| Missing downstream data | 1 | 12% |
| Missing source data | 1 | 12% |
| Premium mismatch | 1 | 12% |

## Recorded status counts

| Current ticket status | Tickets |
|---|---:|
| Blocked | 1 |
| Declined | 1 |
| In Progress | 3 |
| Unassigned | 3 |

## Databricks ticket examples

Each entry below is a source record. Policy numbers and policy statuses are read from the related-policy table.

### INC0001256 — Premium mismatch

- **Summary:** Premium total does not match the source record
- **Details:** The written premium total in the downstream policy reporting data does not reconcile to the source transaction total. Review the linked policies and compare transaction-level premium values across processing layers.
- **Current status:** Unassigned
- **Active:** Yes
- **Assigned to:** Unassigned
- **Created:** 2026-10-29T18:20:00
- **Last updated:** 2026-10-31T15:15:33.618056
- **Related policies:** WC-1001 (Active), WC-1002 (Active)

### INC0001255 — Missing coverage data

- **Summary:** Coverage data is missing from the Gold policy record
- **Details:** Coverage information expected for this policy was not found in the reporting record. Confirm whether the coverage exists upstream and identify where it stopped appearing.
- **Current status:** In Progress
- **Active:** Yes
- **Assigned to:** Sarvesh
- **Created:** 2026-10-28T15:10:00
- **Last updated:** 2026-10-29T13:45:00
- **Related policies:** WC-2045 (Active)

### INC0001254 — Incorrect policy status

- **Summary:** Policy status does not match its latest transaction
- **Details:** The current policy status appears inconsistent with its latest recorded transaction. Verify transaction ordering, effective dates, and the status derivation rule.
- **Current status:** Declined
- **Active:** No
- **Assigned to:** Pratik
- **Created:** 2026-10-28T13:35:00
- **Last updated:** 2026-10-31T15:06:53.414072
- **Related policies:** WC-3321 (Cancelled)

### INC0001253 — Duplicate transaction

- **Summary:** Duplicate policy transaction found in the reporting layer
- **Details:** More than one reporting row appears to represent the same policy transaction. Compare source transaction identifiers and revision numbers to investigate.
- **Current status:** Blocked
- **Active:** Yes
- **Assigned to:** Saurabh
- **Created:** 2026-10-27T20:05:00
- **Last updated:** 2026-10-29T14:30:00
- **Related policies:** WC-1187 (Active), WC-1190 (Active)

### INC0001252 — Missing source data

- **Summary:** Source policy data did not arrive in the expected batch
- **Details:** The expected source records were not present in the batch under review. Check batch arrival and ingestion status, then confirm the affected policies with the source owner.
- **Current status:** Unassigned
- **Active:** Yes
- **Assigned to:** Unassigned
- **Created:** 2026-10-26T17:40:00
- **Last updated:** 2026-10-26T17:40:00
- **Related policies:** None recorded

### INC0001251 — ADF pipeline failure

- **Summary:** ADF pipeline failed before the policy batch completed
- **Details:** The data pipeline reported a failure before the policy batch completed. Review the failed activity, available run details, and batch checkpoint.
- **Current status:** In Progress
- **Active:** Yes
- **Assigned to:** Madhu
- **Created:** 2026-10-25T14:05:00
- **Last updated:** 2026-10-29T16:10:00
- **Related policies:** WC-9012 (Active)

### INC0001250 — Informatica mapping issue

- **Summary:** Informatica mapping omitted a required policy field
- **Details:** A required policy field is absent after the Informatica mapping step. Compare the source field, mapping expression, and target column.
- **Current status:** Unassigned
- **Active:** Yes
- **Assigned to:** Unassigned
- **Created:** 2026-10-24T19:25:00
- **Last updated:** 2026-10-28T20:50:00
- **Related policies:** WC-4470 (Active)

### INC0001249 — Missing downstream data

- **Summary:** Policy record is missing after the downstream load
- **Details:** The policy is present before the downstream load but is not visible in the reporting output. Compare business keys and check load filters and join conditions.
- **Current status:** In Progress
- **Active:** Yes
- **Assigned to:** Pratik
- **Created:** 2026-10-23T12:55:00
- **Last updated:** 2026-10-31T15:23:04.715343
- **Related policies:** WC-5602 (Active)

## Investigation guidance boundaries

Use these records to find related symptoms and provide traceable examples. Do not say a case was resolved, identify a confirmed cause, or treat its current status as a successful fix unless a reviewed resolution record is added.

For the synthetic Workers' Compensation data pipeline, use the separate Workers' Compensation knowledge base to select verified POC tables and checks. Follow source-to-Bronze-to-Silver-to-Gold lineage; compare business keys, source transaction IDs, row counts, and amounts at matching grains; check for duplicate keys and join multiplication; and keep coverage, charge, and transaction aggregates at their documented grains. The available knowledge base does not document EDW table schemas, so do not invent EDW table names or SQL.

Run `.venv/bin/python -m backend.sync_incident_knowledge` to refresh this snapshot from Databricks.
