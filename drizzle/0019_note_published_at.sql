ALTER TABLE "notes" ADD COLUMN "published_at" timestamp with time zone;
UPDATE "notes" SET "published_at" = "updated_at" WHERE "published_at" IS NULL;