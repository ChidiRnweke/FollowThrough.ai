import { describe, expect, it } from 'vitest';
import { Document, Packer, Paragraph } from 'docx';
import { DocxTemplateStyleReader } from './template-styles';
import { createHash } from 'node:crypto';
import { templateLimitsFixture } from '$lib/testing/deliverables/fixtures/template-limits';
import { declaringSize } from '$lib/testing/zip/fixtures/declared-size';

const proof = (bytes: Uint8Array) => ({
	byteSize: bytes.length,
	checksumSha256: createHash('sha256').update(bytes).digest('hex')
});

const template = async (): Promise<Uint8Array> =>
	new Uint8Array(
		await Packer.toBuffer(
			new Document({ sections: [{ children: [new Paragraph('Board template')] }] })
		)
	);

const readStyles = (bytes: Uint8Array, limits = templateLimitsFixture()) =>
	new DocxTemplateStyleReader(limits).read(proof(bytes), bytes);

describe('template styles', () => {
	it('rejects a truncated ZIP package', async () => {
		await expect(readStyles(Buffer.from('PK'))).rejects.toThrow();
	});

	it('reads the styles of a template within the admission limits', async () => {
		const styles = await readStyles(await template());
		expect(styles.fonts.body.name).toBe('Calibri');
	});

	it('refuses a template whose parts expand past the expanded-bytes limit', async () => {
		await expect(
			readStyles(await template(), templateLimitsFixture({ maxExpandedBytes: 100 }))
		).rejects.toMatchObject({
			code: 'VALIDATION',
			message: expect.stringContaining('TEMPLATE_MAX_EXPANDED_BYTES')
		});
	});

	it('refuses a template with more parts than the entry limit', async () => {
		await expect(
			readStyles(await template(), templateLimitsFixture({ maxEntries: 2 }))
		).rejects.toMatchObject({
			code: 'VALIDATION',
			message: expect.stringContaining('TEMPLATE_MAX_ENTRIES')
		});
	});

	it('refuses a template whose document part declares no size', async () => {
		const bytes = declaringSize(await template(), 'word/document.xml', 0);
		await expect(readStyles(bytes)).rejects.toMatchObject({
			code: 'VALIDATION',
			message: expect.stringContaining('word/document.xml')
		});
	});
});
