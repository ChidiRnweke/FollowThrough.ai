CREATE TABLE "tool_embeddings" (
	"name" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" halfvec(3072) NOT NULL,
	"embedding_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
