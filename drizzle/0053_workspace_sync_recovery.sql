ALTER TABLE workspace_sync_receipts ADD COLUMN disposition text NOT NULL DEFAULT 'applied';
--> statement-breakpoint
ALTER TABLE workspace_sync_receipts ADD CONSTRAINT workspace_sync_receipt_disposition
  CHECK (disposition IN ('applied', 'cancelled'));
--> statement-breakpoint
ALTER TABLE workspace_sync_receipts ALTER COLUMN result DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE workspace_sync_receipts ADD CONSTRAINT workspace_sync_receipt_payload
  CHECK ((disposition = 'cancelled' AND result IS NULL) OR
         (disposition = 'applied' AND result IS NOT NULL));
