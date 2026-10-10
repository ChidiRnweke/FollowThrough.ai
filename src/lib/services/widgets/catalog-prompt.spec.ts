import { CatalogWidgetCandidateReader } from '$lib/remote/widgets/candidate-reader';
import { WidgetCatalogService } from '$lib/services/widgets/catalog-prompt';
const widgetCatalogRule = new WidgetCatalogService();
import { describe, expect, it } from 'vitest';
import { formulaFunctions } from '$lib/models/widget-formulas';
import { widgetCatalog, widgetSourceKinds } from '$lib/models/widgets';

describe('widget catalog prompt', () => {
	it('documents every component in the catalog', () => {
		const prompt = widgetCatalogRule.describe(
			new CatalogWidgetCandidateReader().readCatalog(widgetCatalog)
		);
		expect(
			Object.keys(widgetCatalog.components).filter((name) => !prompt.includes(`### ${name}`))
		).toEqual([]);
	});
	it('names the catalog version it describes', () => {
		expect(
			widgetCatalogRule.describe(new CatalogWidgetCandidateReader().readCatalog(widgetCatalog))
		).toContain(`version ${widgetCatalog.version}`);
	});
	it('documents every formula function', () => {
		const prompt = widgetCatalogRule.describe(
			new CatalogWidgetCandidateReader().readCatalog(widgetCatalog)
		);
		expect(Object.keys(formulaFunctions).filter((name) => !prompt.includes(`\`${name}(`))).toEqual(
			[]
		);
	});
	it('documents every workspace source kind', () => {
		const prompt = widgetCatalogRule.describe(
			new CatalogWidgetCandidateReader().readCatalog(widgetCatalog)
		);
		expect(
			Object.keys(widgetSourceKinds).filter((kind) => !prompt.includes(`- \`${kind}\``))
		).toEqual([]);
	});
});
