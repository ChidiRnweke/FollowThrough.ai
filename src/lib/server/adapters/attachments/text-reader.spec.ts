import { describe, expect, it } from 'vitest';
import { TextAttachmentReader } from './text-reader';
import { AttachmentFormatService } from '$lib/server/services/attachments/formats';

describe('Attachment parser strategies', () => {
	it('reads scripts as text resources', async () => {
		const text = await new TextAttachmentReader().parse(new TextEncoder().encode('echo safe'));
		expect(text).toBe('echo safe');
	});

	it('does not claim unsupported binary resources', () => {
		const parser = new AttachmentFormatService().text('application/octet-stream', 'image.bin');
		expect(parser).toBe(false);
	});
});
