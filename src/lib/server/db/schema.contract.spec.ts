import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PostgresTestContext } from './testcontainer';
import { startPostgresTestcontainer } from './testcontainer';

let context: PostgresTestContext;

beforeAll(async () => {
	context = await startPostgresTestcontainer();
}, 120_000);
afterAll(async () => {
	await context?.stop();
});

describe('Postgres schema contracts', () => {
	it('installs the vector extension', async () => {
		const rows = await context.client<
			{ extname: string }[]
		>`select extname from pg_extension where extname = 'vector'`;
		expect(rows[0]?.extname).toBe('vector');
	});
	it('scopes notes to projects', async () => {
		const rows = await context.client<
			{ column_name: string }[]
		>`select column_name from information_schema.columns where table_name = 'notes' order by column_name`;
		expect(rows.map((row) => row.column_name)).toContain('project_id');
	});
	it('enforces case-insensitive project uniqueness per user', async () => {
		const rows = await context.client<
			{ indexdef: string }[]
		>`select indexdef from pg_indexes where indexname = 'projects_user_name_unique'`;
		expect(rows[0]?.indexdef).toContain('lower(name)');
	});
	it('limits project name uniqueness to active projects', async () => {
		const rows = await context.client<
			{ indexdef: string }[]
		>`select indexdef from pg_indexes where indexname = 'projects_user_name_unique'`;
		expect(rows[0]?.indexdef.toLowerCase()).toContain('where (archived_at is null)');
	});
	it('installs an HNSW index for semantic retrieval', async () => {
		const rows = await context.client<
			{ indexdef: string }[]
		>`select indexdef from pg_indexes where indexname = 'search_chunks_embedding_hnsw_idx'`;
		expect(rows[0]?.indexdef.toLowerCase()).toContain('using hnsw');
	});
	it('rejects self-referential note relationships', async () => {
		const rows = await context.client<
			{ constraint_name: string }[]
		>`select constraint_name from information_schema.table_constraints where table_name = 'note_relationships' and constraint_name = 'note_relationships_not_self'`;
		expect(rows[0]?.constraint_name).toBe('note_relationships_not_self');
	});
	it('constrains suggestion confidence to percentages', async () => {
		const rows = await context.client<
			{ constraint_name: string }[]
		>`select constraint_name from information_schema.table_constraints where table_name = 'suggestions' and constraint_name = 'suggestions_confidence_range'`;
		expect(rows[0]?.constraint_name).toBe('suggestions_confidence_range');
	});
	it('does not retain the removed entity table', async () => {
		const rows = await context.client<
			{ table_name: string }[]
		>`select table_name from information_schema.tables where table_schema = 'public' and table_name = 'entities'`;
		expect(rows).toEqual([]);
	});
	it('allows only note-to-note relationship kinds', async () => {
		const rows = await context.client<
			{ enumlabel: string }[]
		>`select enumlabel from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid where pg_type.typname = 'relationship_kind' order by enumsortorder`;
		expect(rows.map((row) => row.enumlabel)).toEqual([
			'prior_decision',
			'contradicts',
			'elaborates',
			'mentions'
		]);
	});
});
