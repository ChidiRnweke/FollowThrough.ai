import { describe, expect, it } from 'vitest';
import { ConflictError } from '$lib/errors';
import { widgetCatalog, widgetTemplates, type Widget, type WidgetId } from '$lib/models/widgets';
import { WidgetRecords } from '$lib/server/repositories/widgets/postgres/widgets';
import { actor, context, now, seedNote } from '../database-harness';

const checklist = (
	owner: { userId: Widget['userId'] },
	projectId: Widget['projectId']
): Widget => ({
	id: crypto.randomUUID() as WidgetId,
	userId: owner.userId,
	projectId,
	title: 'Launch checklist',
	catalogVersion: widgetCatalog.version,
	layout: widgetTemplates.checklist.layout,
	layoutRevision: 1,
	data: widgetTemplates.checklist.data,
	dataRevision: 1,
	createdAt: now,
	updatedAt: now
});

describe('widget records', () => {
	it('read back layout and data exactly as written', async () => {
		const { owner, project } = await seedNote('7701');
		const records = new WidgetRecords(context.db);
		const widget = checklist(owner, project.id);
		await records.insert(owner, widget);
		expect(await records.findById(owner, widget.id)).toEqual(widget);
	});
	it('are invisible to another account', async () => {
		const { owner, project } = await seedNote('7702');
		const records = new WidgetRecords(context.db);
		const widget = checklist(owner, project.id);
		await records.insert(owner, widget);
		expect(await records.findById(actor('7799'), widget.id)).toBeUndefined();
	});
	it('refuse a write computed from an older revision', async () => {
		const { owner, project } = await seedNote('7703');
		const records = new WidgetRecords(context.db);
		const widget = checklist(owner, project.id);
		await records.insert(owner, widget);
		await records.update(
			owner,
			{ ...widget, dataRevision: 2 },
			{ layoutRevision: 1, dataRevision: 1 }
		);
		await expect(
			records.update(owner, { ...widget, dataRevision: 2 }, { layoutRevision: 1, dataRevision: 1 })
		).rejects.toBeInstanceOf(ConflictError);
	});
});
