import { describe, expect, it } from 'vitest';
import { widgetTemplates, type WidgetId } from '$lib/models/widgets';
import { Widgets, type WidgetsDependencies } from '$lib/server/controllers/widgets/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { createWidgetsCapability } from '$lib/server/factories/capabilities/widgets-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const sync = createSyncCapability({ db: database });
	const { library } = createWidgetsCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const controller = new Widgets(
		capabilityDependencies<WidgetsDependencies>({
			syncMutations: sync.mutations,
			syncRetry: sync.mutationRetry,
			widgetReader: library,
			widgetLister: library,
			widgetWriter: library,
			transactionRunner
		})
	);
	const create = async () => {
		const id = crypto.randomUUID() as WidgetId;
		await controller.synchronize(seeded.owner, {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command: {
				kind: 'createWidget',
				id,
				projectId: seeded.project.id,
				sourceNoteId: seeded.note.id,
				draft: widgetTemplates.checklist
			}
		});
		const base = await sync.objects.read(seeded.owner, { type: 'widgets', id: [id] }, null);
		if (base.kind !== 'found') throw new Error('The created widget must be readable through sync');
		return { id, etag: base.snapshot.etag };
	};
	return { ...seeded, controller, sync, create };
};

const tick = (index: number) => ({
	kind: 'data' as const,
	patch: [{ op: 'replace' as const, path: `/items/${index}/done`, value: true }]
});

describe('guarded widget mutations', () => {
	it('publish a created widget as a workspace record', async () => {
		const { owner, sync, create } = await setup('7711');
		const { id } = await create();
		const read = await sync.objects.read(owner, { type: 'widgets', id: [id] }, null);
		expect(read.kind === 'found' && read.snapshot.value.type).toBe('widgets');
	});
	it('apply a data edit and save it with the next data revision', async () => {
		const { owner, controller, create } = await setup('7712');
		const { id, etag } = await create();
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: etag,
			command: { kind: 'editWidget', widgetId: id, change: tick(0) }
		});
		expect({
			kind: result.kind,
			rows: await context.client`select data->'items'->0->'done' as done, data_revision from widgets where id = ${id}`
		}).toEqual({ kind: 'applied', rows: [{ done: true, data_revision: 2 }] });
	});
	it('report a conflict and keep the competing edit when the base is stale', async () => {
		const { owner, controller, create } = await setup('7713');
		const { id, etag } = await create();
		await context.client`update widgets set title = 'Other client' where id = ${id}`;
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: etag,
			command: { kind: 'editWidget', widgetId: id, change: tick(0) }
		});
		expect({
			kind: result.kind,
			rows: await context.client`select title, data_revision from widgets where id = ${id}`
		}).toEqual({ kind: 'conflict', rows: [{ title: 'Other client', data_revision: 1 }] });
	});
	it('apply a change replayed onto a remote edit of another item', async () => {
		const { owner, controller, sync, create } = await setup('7715');
		const { id, etag } = await create();
		await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: etag,
			command: { kind: 'editWidget', widgetId: id, change: tick(1) }
		});
		// The device's queue replays its edit onto the remote version and resends the same change
		// with the remote version as its base (ADR 0042).
		const remote = await sync.objects.read(owner, { type: 'widgets', id: [id] }, null);
		if (remote.kind !== 'found') throw new Error('The edited widget must be readable');
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: remote.snapshot.etag,
			command: { kind: 'editWidget', widgetId: id, change: tick(0) }
		});
		expect({
			kind: result.kind,
			rows: await context.client`select (select string_agg(i->>'done', ',') from jsonb_array_elements(data->'items') i) as done, data_revision from widgets where id = ${id}`
		}).toEqual({ kind: 'applied', rows: [{ done: 'true,true,false', data_revision: 3 }] });
	});
	it('reject a layout the catalog does not allow, leaving the widget unchanged', async () => {
		const { owner, controller, create } = await setup('7714');
		const { id, etag } = await create();
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: etag,
			command: {
				kind: 'editWidget',
				widgetId: id,
				change: {
					kind: 'layout',
					patch: [{ op: 'replace', path: '/elements/item/type', value: 'Iframe' }]
				}
			}
		});
		expect(result.kind).toBe('rejected');
	});
});
