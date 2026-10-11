import { CatalogWidgetCandidateReader } from '$lib/infrastructure/widgets/candidate-reader';
import { WidgetCatalogService } from '$lib/services/widgets/catalog-prompt';
import { describe, expect, it } from 'vitest';
import { widgetCatalog } from '$lib/models/widgets';

describe('widget catalog prompt', () => {
	it('names the catalog version it describes', () => {
		expect(
			new WidgetCatalogService().describe(
				new CatalogWidgetCandidateReader().readCatalog(widgetCatalog)
			)
		).toContain(`version ${widgetCatalog.version}`);
	});
});
