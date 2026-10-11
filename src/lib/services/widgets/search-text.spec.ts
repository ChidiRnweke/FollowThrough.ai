import { WidgetSearchService } from '$lib/services/widgets/search-text';
const widgetSearch = new WidgetSearchService();
import { describe, expect, it } from 'vitest';
import { widgetTemplates } from '$lib/models/widgets';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';

describe('widget search text', () => {
	it('holds the title and the words the checklist shows', () => {
		expect(widgetSearch.text(widgetBuilder())).toBe(
			['Checklist', 'New item', 'Add a step', 'First step', 'Second step', 'Third step'].join('\n')
		);
	});
	it('does not change when an item is ticked', () => {
		const ticked = widgetBuilder({
			data: {
				...widgetTemplates.checklist.data,
				items: widgetTemplates.checklist.data.items.map((item) => ({ ...item, done: true }))
			}
		});
		expect(widgetSearch.text(ticked)).toBe(widgetSearch.text(widgetBuilder()));
	});
	it('includes table column labels and select option labels', () => {
		const status = widgetSearch.text(
			widgetBuilder({ layout: widgetTemplates.status.layout, data: widgetTemplates.status.data })
		);
		expect(status.includes('Needs attention') && status.includes('At risk')).toBe(true);
	});
});
