ALTER TABLE "notes" ADD COLUMN "built_in_key" text;--> statement-breakpoint
WITH "built_in_candidates" AS (
	SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at", "id") AS "candidate_rank"
	FROM "notes"
	WHERE "kind" = 'skill' AND lower("title") = 'followthrough'
)
UPDATE "notes"
SET "built_in_key" = 'followthrough'
FROM "built_in_candidates"
WHERE "notes"."id" = "built_in_candidates"."id" AND "built_in_candidates"."candidate_rank" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_user_built_in_key_unique" ON "notes" USING btree ("user_id","built_in_key") WHERE "notes"."built_in_key" is not null;
