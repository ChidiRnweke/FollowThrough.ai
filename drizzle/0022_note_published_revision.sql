ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "published_revision" integer DEFAULT 0 NOT NULL;
