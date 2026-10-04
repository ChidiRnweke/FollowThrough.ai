import { describe, expect, it } from 'vitest';
import { widgetTemplates } from '$lib/models/widgets';
import { widgetBuilder, testWidgetId } from '$lib/testing/widgets/fixtures/widgets';
import { approvalPreview } from './tool-approval-preview';

const tick = JSON.stringify([{ op: 'replace', path: '/items/0/done', value: true }]);

describe('widget approval preview', () => {
	it('shows a data edit as the widget before and after', () => {
		const preview = approvalPreview(
			'edit_widget_data',
			{ widgetId: testWidgetId(), expectedDataRevision: 1, patch: tick },
			{ kind: 'widget', widget: widgetBuilder() }
		);
		expect(
			preview.kind === 'widget' &&
				preview.change.kind === 'edited' && [
					preview.change.before.dataRevision,
					preview.change.after.dataRevision
				]
		).toEqual([1, 2]);
	});
	it('warns that an edit made against an older revision would be refused', () => {
		const preview = approvalPreview(
			'edit_widget_data',
			{ widgetId: testWidgetId(), expectedDataRevision: 1, patch: tick },
			{ kind: 'widget', widget: widgetBuilder({ dataRevision: 4 }) }
		);
		expect(preview.kind === 'widget' && preview.change.kind).toBe('refused');
	});
	it('shows a created widget as it would be saved', () => {
		const preview = approvalPreview(
			'create_widget',
			{
				title: 'Status',
				layout: JSON.stringify(widgetTemplates.status.layout),
				data: JSON.stringify(widgetTemplates.status.data)
			},
			{ kind: 'none' }
		);
		expect(preview.kind === 'widget' && preview.change.kind).toBe('created');
	});
	it('says the widget is not here yet when the device has no copy', () => {
		const preview = approvalPreview(
			'edit_widget_layout',
			{ widgetId: testWidgetId(), expectedLayoutRevision: 1, patch: tick },
			{ kind: 'none' }
		);
		expect(preview.kind === 'widget' && preview.change.kind).toBe('unavailable');
	});
});
