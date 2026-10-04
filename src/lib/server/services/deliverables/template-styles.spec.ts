import { describe, expect, it } from 'vitest';
import { extractTemplateStyles } from './template-styles';

describe('template styles', () => {
	it('rejects a truncated ZIP package', async () => {
		await expect(extractTemplateStyles(Buffer.from('PK'))).rejects.toThrow();
	});
});
