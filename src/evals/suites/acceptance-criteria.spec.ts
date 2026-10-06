import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../cases/types';
import { acceptanceCriteriaFor } from './acceptance-criteria';
import { ALL_EVAL_CASES } from './case-catalog';

describe('filtered eval acceptance criteria', () => {
	it('gates only primary archetypes produced by selected cases', () => {
		const criteria = acceptanceCriteriaFor([
			{ splits: [ARCHETYPES.memoryAdherence, ARCHETYPES.multiStep, 'regression'] },
			{ splits: [ARCHETYPES.memoryCapture] }
		]);
		expect(criteria.map((criterion) => criterion.annotationName)).toEqual([
			ARCHETYPES.memoryAdherence,
			ARCHETYPES.memoryCapture
		]);
	});

	it('keeps the lower canary threshold for a selected canary archetype', () => {
		const [criterion] = acceptanceCriteriaFor([{ splits: [ARCHETYPES.memoryTaskRead] }]);
		expect(criterion && 'minPassRate' in criterion ? criterion.minPassRate : undefined).toBe(0.8);
	});

	it('returns no gates when selected cases have no scored archetype', () => {
		expect(acceptanceCriteriaFor([{ splits: ['regression'] }])).toEqual([]);
	});

	// ADR 0043 leaves create-and-embed open, so embedding is reported beside the build gate.
	it('gates widget builds but not widget embedding', () => {
		expect(
			acceptanceCriteriaFor(ALL_EVAL_CASES)
				.map((criterion) => criterion.annotationName)
				.filter((name) => name.startsWith('widget_'))
		).toEqual([ARCHETYPES.widgetBuild, ARCHETYPES.widgetEdit]);
	});
});
