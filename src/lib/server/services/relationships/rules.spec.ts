import { expect, it } from 'vitest';
import { RelationshipRules } from './rules';

it('identifies opposing constraints without a model call', async () => {
	expect(
		(
			await new RelationshipRules().classify(
				'Do not use synchronous calls.',
				'The service uses synchronous HTTP.'
			)
		).kind
	).toBe('contradicts');
});
