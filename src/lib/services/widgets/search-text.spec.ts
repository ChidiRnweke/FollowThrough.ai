import { describe, expect, it } from 'vitest';
import { widgetTemplates } from '$lib/models/widgets';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import { widgetSearchText } from './search-text';

describe('widget search text', () => {
	it('holds the title and the words the checklist shows', () => {
		expect(widgetSearchText(widgetBuilder())).toBe(
			['Checklist', 'First step', 'Second step', 'Third step'].join('\n')
		);
	});
	it('does not change when an item is ticked', () => {
		const ticked = widgetBuilder({
			data: {
				...widgetTemplates.checklist.data,
				items: widgetTemplates.checklist.data.items.map((item) => ({ ...item, done: true }))
			}
		});
		expect(widgetSearchText(ticked)).toBe(widgetSearchText(widgetBuilder()));
	});
	it('includes table column labels and select option labels', () => {
		const status = widgetSearchText(
			widgetBuilder({ layout: widgetTemplates.status.layout, data: widgetTemplates.status.data })
		);
		expect(status.includes('Needs attention') && status.includes('At risk')).toBe(true);
	});
});
