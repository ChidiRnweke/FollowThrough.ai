CREATE TYPE "public"."memory_entry_type" AS ENUM('fact', 'decision', 'constraint', 'preference');--> statement-breakpoint
CREATE TYPE "public"."todo_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "type" "memory_entry_type";--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "priority" "todo_priority";