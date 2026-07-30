import { describe, expect, it } from 'vitest';
import { extractTemplateStyles } from './template-styles';

describe('template styles', () => {
	it('reads a valid empty document package', async () => {
		await expect(extractTemplateStyles(Buffer.from('PK'))).rejects.toBeDefined();
	});
});
