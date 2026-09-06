import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { WorkspaceSyncInventory } from '$lib/server/repositories/workspace/sync-inventory';
import { workspaceResourceKey, workspaceResourceTypeSchema } from '$lib/models/workspace-sync';
import { actor, context, seedNote } from '../database-harness';

describe('complete authorized synchronization inventory', () => {
	it('includes an owned note without fetching its document payload', async () => {
		const { note, owner } = await seedNote('8601');
		const inventory = await new WorkspaceSyncInventory(context.db).list(owner);
		expect(
			inventory.find(
				(entry) => entry.key === workspaceResourceKey({ type: 'notes', id: [note.id] })
			)
		).toEqual({
			key: workspaceResourceKey({ type: 'notes', id: [note.id] }),
			etag: expect.stringMatching(/^sync-v1-/)
		});
	});

	it('does not include another account’s notes', async () => {
		const { note } = await seedNote('8602');
		const inventory = await new WorkspaceSyncInventory(context.db).list(actor('8603'));
		expect(
			inventory.some(
				(entry) => entry.key === workspaceResourceKey({ type: 'notes', id: [note.id] })
			)
		).toBe(false);
	});

	it('retains archived project content for local trash and visibility projections', async () => {
		const { note, project, owner } = await seedNote('8604');
		await context.client`update projects set archived_at = now() where id = ${project.id}`;
		const inventory = await new WorkspaceSyncInventory(context.db).list(owner);
		expect(
			inventory.some(
				(entry) => entry.key === workspaceResourceKey({ type: 'notes', id: [note.id] })
			)
		).toBe(true);
	});

	it('fails loudly when a stored record has no synchronization version', async () => {
		const { note, owner } = await seedNote('8605');
		await context.client`delete from workspace_sync_versions where resource_type = 'notes'
			and resource_id = jsonb_build_array(${note.id}::text)`;
		await expect(new WorkspaceSyncInventory(context.db).list(owner)).rejects.toThrow(ZodError);
	});

	it('registers database change tracking for every synchronized resource type', async () => {
		const rows = await context.client<{ table_name: string }[]>`
			select distinct event_object_table as table_name from information_schema.triggers
			where trigger_name = 'workspace_sync_version'`;
		expect(rows.map((row) => row.table_name).sort()).toEqual(
			[...workspaceResourceTypeSchema.options].sort()
		);
	});
});
