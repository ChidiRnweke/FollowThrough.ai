CREATE TABLE "todo_batch_receipts" (
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"request" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todo_batch_receipts_user_id_request_id_pk" PRIMARY KEY("user_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "todo_batch_receipts" ADD CONSTRAINT "todo_batch_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;