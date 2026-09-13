ALTER TABLE workspace_sync_receipts ADD COLUMN disposition text NOT NULL DEFAULT 'applied';
--> statement-breakpoint
ALTER TABLE workspace_sync_receipts ADD CONSTRAINT workspace_sync_receipt_disposition
  CHECK (disposition IN ('applied', 'cancelled', 'compacted'));
--> statement-breakpoint
ALTER TABLE workspace_sync_receipts ALTER COLUMN result DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE workspace_sync_receipts ADD CONSTRAINT workspace_sync_receipt_payload
  CHECK ((disposition = 'cancelled' AND result IS NULL) OR
         (disposition IN ('applied', 'compacted') AND result IS NOT NULL));
