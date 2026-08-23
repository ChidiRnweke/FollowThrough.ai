UPDATE "project_templates"
SET "extracted_styles" = NULL
WHERE "extracted_styles" = '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "project_templates" ALTER COLUMN "extracted_styles" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "project_templates" ALTER COLUMN "extracted_styles" DROP NOT NULL;
