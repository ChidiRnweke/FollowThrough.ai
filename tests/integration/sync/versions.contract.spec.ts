import { describe, expect, it } from 'vitest';
import { workspaceResourceTypeSchema } from '$lib/models/workspace-sync';
import { context, seedNote } from '../database-harness';

const version = async (type: string, id: string): Promise<string | null> => {
	const rows = await context.client<{ version: string }[]>`
		select version::text from workspace_sync_versions
		where resource_type = ${type} and resource_id = jsonb_build_array(${id}::text)`;
	return rows[0]?.version ?? null;
};

describe('database-maintained synchronization versions', () => {
	it('registers change tracking for every synchronized resource type', async () => {
		const rows = await context.client<{ table_name: string }[]>`
			select distinct event_object_table as table_name from information_schema.triggers
			where trigger_name = 'workspace_sync_version'`;
		expect(rows.map((row) => row.table_name).sort()).toEqual(
			[...workspaceResourceTypeSchema.options].sort()
		);
	});
	it('assigns a version when a domain repository creates a record', async () => {
		const { note } = await seedNote('8501');
		expect(await version('notes', note.id)).toMatch(/^[1-9][0-9]*$/);
	});

	it('changes a note tag for metadata writes without requiring a document revision', async () => {
		const { note } = await seedNote('8502');
		const before = await version('notes', note.id);
		await context.client`update notes set section_numbering = true where id = ${note.id}`;
		expect(await version('notes', note.id)).not.toBe(before);
	});

	it('does not change a tag for a database update that changes no stored value', async () => {
		const { note } = await seedNote('8503');
		const before = await version('notes', note.id);
		await context.client`update notes set title = title where id = ${note.id}`;
		expect(await version('notes', note.id)).toBe(before);
	});

	it('does not change child document tags when archiving their project', async () => {
		const { note, project } = await seedNote('8504');
		const before = await version('notes', note.id);
		await context.client`update projects set archived_at = now() where id = ${project.id}`;
		expect(await version('notes', note.id)).toBe(before);
	});

	it('removes child inventory identities when a parent deletion cascades', async () => {
		const { note, project } = await seedNote('8505');
		await context.client`delete from projects where id = ${project.id}`;
		expect(await version('notes', note.id)).toBeNull();
	});

	it('rolls back the synchronization version with the rejected domain transaction', async () => {
		const { note } = await seedNote('8506');
		const before = await version('notes', note.id);
		await context.client
			.begin(async (transaction) => {
				await transaction`update notes set title = 'Rolled back' where id = ${note.id}`;
				throw new Error('Reject this transaction');
			})
			.catch(() => {
				return { kind: 'failure' };
			});
		expect(await version('notes', note.id)).toBe(before);
	});

	it('uses a new version when an identity is deleted and recreated', async () => {
		const { note } = await seedNote('8507');
		const before = await version('notes', note.id);
		await context.client`delete from notes where id = ${note.id}`;
		await context.client`insert into notes (id, user_id, project_id, title)
			values (${note.id}, ${note.userId}, ${note.projectId}, 'Recreated')`;
		expect(await version('notes', note.id)).not.toBe(before);
	});
});
