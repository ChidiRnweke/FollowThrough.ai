import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../cases/types';
import { acceptanceCriteriaFor } from './acceptance-criteria';

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
});
