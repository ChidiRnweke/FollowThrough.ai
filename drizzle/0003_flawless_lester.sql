ALTER TABLE "search_chunks" ADD COLUMN "source_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD COLUMN "chunk_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "search_chunks" ALTER COLUMN "embedding" SET DATA TYPE halfvec(3072) USING "embedding"::halfvec;--> statement-breakpoint
CREATE INDEX "search_chunks_embedding_hnsw_idx"
ON "search_chunks" USING hnsw ("embedding" halfvec_cosine_ops)
WHERE "embedding" IS NOT NULL;
