CREATE TABLE workspace_sync_receipts (
  account_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  request_hash text NOT NULL,
  disposition text NOT NULL DEFAULT 'applied',
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, operation_id),
  CONSTRAINT workspace_sync_receipt_disposition CHECK (disposition IN ('applied', 'cancelled')),
  CONSTRAINT workspace_sync_receipt_payload CHECK (
    (disposition = 'cancelled' AND result IS NULL) OR
    (disposition = 'applied' AND result IS NOT NULL))
);
