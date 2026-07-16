import { describe, expect, it } from 'vitest';
import { AttachmentParserRegistry, TextAttachmentParser } from './attachment-storage';

describe('Attachment parser strategies', () => {
	it('reads scripts as text resources', async () => {
		const text = await new TextAttachmentParser().parse(new TextEncoder().encode('echo safe'));
		expect(text).toBe('echo safe');
	});

	it('does not claim unsupported binary resources', () => {
		const parser = new AttachmentParserRegistry().select('application/octet-stream', 'image.bin');
		expect(parser).toBeUndefined();
	});
});
