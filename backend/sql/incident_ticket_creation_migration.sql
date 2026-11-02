-- Apply once to the existing incident ticket table before enabling ticket creation.
-- The service reads these columns dynamically and keeps existing ticket reads
-- working before the migration is applied.
ALTER TABLE workspace.default.incident_tickets
ADD COLUMNS (
  requester_full_name STRING COMMENT 'Customer or person who reported the incident',
  priority STRING COMMENT 'Incident priority: Low, Medium, High, or Urgent'
);
