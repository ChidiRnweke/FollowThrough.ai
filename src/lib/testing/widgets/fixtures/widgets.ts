import { widgetCatalog, widgetTemplates, type Widget, type WidgetId } from '$lib/models/widgets';
import type { UserId } from '$lib/models/identity';
import {
	testActor,
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

export const testWidgetId = (value = 1): WidgetId =>
	`00000000-0000-4000-8099-${String(value).padStart(12, '0')}` as WidgetId;

/** A saved checklist widget, as `createWidget` produces it from the template. */
export const widgetBuilder = (overrides: Partial<Widget> = {}): Widget => ({
	id: testWidgetId(),
	userId: testActor().userId as UserId,
	projectId: testProjectId(),
	sourceNoteId: testNoteId(),
	title: widgetTemplates.checklist.title,
	catalogVersion: widgetCatalog.version,
	layout: widgetTemplates.checklist.layout,
	layoutRevision: 1,
	data: widgetTemplates.checklist.data,
	dataRevision: 1,
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});
