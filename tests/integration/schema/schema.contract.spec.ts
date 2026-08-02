import { describe, expect, it } from 'vitest';
import { context } from '../database-harness';

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
	it('allows only implemented suggestion kinds', async () => {
		const rows = await context.client<
			{ enumlabel: string }[]
		>`select enumlabel from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid where pg_type.typname = 'suggestion_kind' order by enumsortorder`;
		expect(rows.map((row) => row.enumlabel)).toEqual([
			'todo',
			'backlink',
			'reference',
			'diagram',
			'memory'
		]);
	});
	it('allows exactly folder, note, and skill filesystem entries', async () => {
		const rows = await context.client<
			{ enumlabel: string }[]
		>`select enumlabel from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid where pg_type.typname = 'note_kind' order by enumsortorder`;
		expect(rows.map((row) => row.enumlabel)).toEqual(['folder', 'note', 'skill']);
	});
	it('keys a tool preference by user and tool', async () => {
		const rows = await context.client<
			{ column_name: string }[]
		>`select column_name from information_schema.key_column_usage where constraint_name = 'tool_preferences_user_id_tool_name_pk' order by ordinal_position`;
		expect(rows.map((row) => row.column_name)).toEqual(['user_id', 'tool_name']);
	});
	it('keys a project tool override by user, project, and tool', async () => {
		const rows = await context.client<
			{ column_name: string }[]
		>`select column_name from information_schema.key_column_usage where constraint_name = 'project_tool_overrides_user_id_project_id_tool_name_pk' order by ordinal_position`;
		expect(rows.map((row) => row.column_name)).toEqual(['user_id', 'project_id', 'tool_name']);
	});
	it('stores tool names as free text so a removed tool decays into an ignored row', async () => {
		const rows = await context.client<
			{ data_type: string }[]
		>`select data_type from information_schema.columns where table_name = 'tool_preferences' and column_name = 'tool_name'`;
		expect(rows[0]?.data_type).toBe('text');
	});
});
