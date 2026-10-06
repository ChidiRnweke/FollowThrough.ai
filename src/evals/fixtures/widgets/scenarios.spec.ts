import { describe, expect, it } from 'vitest';
import { widgetDraftSchema } from '$lib/models/widgets';
import type { LocalDate } from '$lib/models/workspace';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import { testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import { runWidgetProbe } from '../../assertions/widget/probe';
import { WIDGET_SCENARIOS } from './index';
import { scenarioRecords, type WidgetScenario } from './scenario';

const recordsOf = (scenario: WidgetScenario) =>
	scenarioRecords(scenario, testProjectId(), new Date().toISOString().slice(0, 10) as LocalDate);

describe('widget scenarios', () => {
	it('have unique ids', () => {
		const ids = WIDGET_SCENARIOS.map((scenario) => scenario.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	describe.each(WIDGET_SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
		'%s',
		(_id, scenario) => {
			it('has a reference the catalog accepts', () => {
				expect(widgetDraftSchema.safeParse(scenario.reference).error?.issues ?? []).toEqual([]);
			});

			// A probe no correct widget can pass would grade every live run as a failure.
			it('is passed by its reference widget', () => {
				const widget = widgetBuilder({ ...scenario.reference });
				expect(runWidgetProbe(widget, recordsOf(scenario), scenario.probe).findings).toEqual([]);
			});
		}
	);
});
