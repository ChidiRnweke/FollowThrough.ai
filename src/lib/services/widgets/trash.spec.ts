import { WidgetLifecycleService } from '$lib/services/widgets/trash';
const widgetLifecycle = new WidgetLifecycleService();
import { describe, expect, it } from 'vitest';

import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';

const later = '2026-07-11T10:00:00.000Z' as typeof testNow;

describe('widget trash', () => {
	it('moves a widget to the trash with the time it was removed', () => {
		const change = widgetLifecycle.change('archive', widgetBuilder(), later);
		expect(change.kind === 'change' && change.widget.archivedAt).toBe(later);
	});
	it('restores a widget without its trash time', () => {
		const change = widgetLifecycle.change('restore', widgetBuilder({ archivedAt: testNow }), later);
		expect(change.kind === 'change' && 'archivedAt' in change.widget).toBe(false);
	});
	it('refuses to delete a widget that is not in the trash', () => {
		expect(widgetLifecycle.decide('delete', widgetBuilder())).toEqual({
			kind: 'invalid',
			message: 'The widget is not in the trash'
		});
	});
	it('refuses to move a widget to the trash twice', () => {
		expect(widgetLifecycle.decide('archive', widgetBuilder({ archivedAt: testNow })).kind).toBe(
			'invalid'
		);
	});
});
