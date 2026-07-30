import { describe, expect, it } from 'vitest';
import { DrawioReview } from './review';

describe('DrawioReview', () => {
	it('is available as a domain service', () => {
		expect(DrawioReview).toBeTypeOf('function');
	});
});
