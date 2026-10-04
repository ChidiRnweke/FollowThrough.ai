import { describe, expect, it } from 'vitest';
import { widgetCatalog } from '$lib/models/widgets';
import { widgetCatalogPrompt } from './catalog-prompt';

describe('widget catalog prompt', () => {
	it('documents every component in the catalog', () => {
		const prompt = widgetCatalogPrompt(widgetCatalog);
		expect(
			Object.keys(widgetCatalog.components).filter((name) => !prompt.includes(`### ${name}`))
		).toEqual([]);
	});
	it('names the catalog version it describes', () => {
		expect(widgetCatalogPrompt(widgetCatalog)).toContain(`version ${widgetCatalog.version}`);
	});
});
