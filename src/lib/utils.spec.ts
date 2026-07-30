import { describe, expect, it } from 'vitest';
import { safeReturnUrl } from './utils';

describe('Todo return navigation', () => {
	it('keeps a relative application URL', () => {
		expect(safeReturnUrl('/todos?view=list#current')).toBe('/todos?view=list#current');
	});

	it('rejects a protocol-relative URL', () => {
		expect(safeReturnUrl('//example.com/steal')).toBe('/todos');
	});

	it('rejects an absolute URL', () => {
		expect(safeReturnUrl('https://example.com/steal')).toBe('/todos');
	});
});
