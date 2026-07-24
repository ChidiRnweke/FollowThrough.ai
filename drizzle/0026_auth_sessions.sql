CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN', 'WAITING');--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'WAITING' NOT NULL;--> statement-breakpoint
UPDATE "users" SET "role" = 'ADMIN';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_provider_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_provider_id_unique" ON "users" USING btree ("auth_provider_id");