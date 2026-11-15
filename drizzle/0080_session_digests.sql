ALTER TABLE "sessions" ADD COLUMN "last_renewed_at" timestamp with time zone;--> statement-breakpoint
-- Sessions are now keyed by the hex SHA-256 digest of the cookie token. Rewriting each stored
-- token as its digest keeps every browser signed in: its cookie still opens the same row.
UPDATE "sessions" SET "id" = encode(sha256(convert_to("id", 'UTF8')), 'hex');
