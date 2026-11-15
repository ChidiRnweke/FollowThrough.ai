CREATE TABLE "client_error_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"suppressed" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_error_reports" ADD CONSTRAINT "client_error_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_error_reports_user_time_idx" ON "client_error_reports" USING btree ("user_id","reported_at");