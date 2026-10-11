import { describe, expect, it } from 'vitest';
import { DocxTemplateStyleReader } from './template-styles';
import { createHash } from 'node:crypto';

describe('template styles', () => {
	it('rejects a truncated ZIP package', async () => {
		const bytes = Buffer.from('PK');
		await expect(
			new DocxTemplateStyleReader().read(
				{
					byteSize: bytes.length,
					checksumSha256: createHash('sha256').update(bytes).digest('hex')
				},
				bytes
			)
		).rejects.toThrow();
	});
});
