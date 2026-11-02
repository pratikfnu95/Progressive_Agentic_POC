-- Apply once to add dashboard severity and creator metadata.
-- Existing POC tickets receive stable, varied illustrative values where those
-- fields are blank. The hash keeps the sample assignment consistent on reload.
ALTER TABLE workspace.default.incident_tickets
ADD COLUMNS (
  severity STRING COMMENT 'Incident severity: Low, Medium, High, or Urgent',
  created_by_name STRING COMMENT 'Display name of the person who created the ticket'
);

UPDATE workspace.default.incident_tickets
SET
  severity = COALESCE(
    severity,
    CASE pmod(abs(hash(ticket_id)), 4)
      WHEN 0 THEN 'Low'
      WHEN 1 THEN 'Medium'
      WHEN 2 THEN 'High'
      ELSE 'Urgent'
    END
  ),
  created_by_name = COALESCE(
    created_by_name,
    CASE pmod(abs(hash(ticket_id)), 4)
      WHEN 0 THEN 'Holly'
      WHEN 1 THEN 'Dan'
      WHEN 2 THEN 'Jordan'
      ELSE 'Casey'
    END
  );
