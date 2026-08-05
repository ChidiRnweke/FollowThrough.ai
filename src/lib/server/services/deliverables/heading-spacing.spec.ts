import { describe, expect, it } from 'vitest';
import { headingSpacingPt } from './heading-spacing';

describe('headingSpacingPt', () => {
	// Regression: the editor double-spaces a title from the body below it, and
	// the exported document must carry the same rhythm in its heading spacing.
	it('gives an h1 a full blank line on either side', () => {
		expect(headingSpacingPt(1)).toEqual({ before: 18, after: 18 });
	});

	it('gives an h2 a slightly smaller margin-y', () => {
		expect(headingSpacingPt(2)).toEqual({ before: 15, after: 15 });
	});

	it('leaves deeper headings on their own spacing', () => {
		expect(headingSpacingPt(3)).toBeUndefined();
	});
});
