import { describe, expect, it } from 'vitest';
import { attachmentActionsFixture } from '$lib/testing/attachments/fixtures/browser-actions';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
const file = new File(['hello'], 'draft.png', { type: 'image/png' });
describe('Inline note media upload', () => {
	it('uploads the checksummed bytes and returns the completed content URL', async () => {
		const { controller, remote, browser } = attachmentActionsFixture();
		const result = await controller.uploadInline(testNoteId(), file);
		expect({
			initiated: remote.initiated,
			writes: browser.writes,
			completed: remote.completed,
			result
		}).toEqual({
			initiated: [
				{
					noteId: testNoteId(),
					path: 'inline/00000000-0000-4000-8000-000000000001/draft.png',
					mediaType: 'image/png',
					byteSize: 5,
					checksumSha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
				}
			],
			writes: [{ url: 'https://storage.test/put', bytes: [104, 101, 108, 108, 111] }],
			completed: [{ uploadId: remote.uploadId }],
			result: `/api/attachments/${remote.result.attachment.id}/content`
		});
	});
	it('keeps repeated clipboard filenames as independent attachments', async () => {
		const { controller, remote } = attachmentActionsFixture();
		await controller.uploadInline(testNoteId(), file);
		await controller.uploadInline(testNoteId(), file);
		expect(remote.initiated.map((input) => input.path)).toEqual([
			'inline/00000000-0000-4000-8000-000000000001/draft.png',
			'inline/00000000-0000-4000-8000-000000000002/draft.png'
		]);
	});
	it('keeps an original filename in its inline path', async () => {
		const { controller, remote } = attachmentActionsFixture();
		await controller.uploadInline(testNoteId(), file);
		expect(remote.initiated[0].path).toBe('inline/00000000-0000-4000-8000-000000000001/draft.png');
	});
	it('names an unnamed clipboard image from its media type', async () => {
		const { controller, remote } = attachmentActionsFixture();
		await controller.uploadInline(testNoteId(), new File(['hello'], '', { type: 'image/jpeg' }));
		expect(remote.initiated[0].path).toBe(
			'inline/00000000-0000-4000-8000-000000000001/pasted-image.jpg'
		);
	});
	it.each([
		{ detail: 'Bucket full', message: 'Object storage rejected the upload: Bucket full' },
		{ detail: undefined, message: 'Object storage rejected the upload (403)' }
	])('refuses completion after $message', async ({ detail, message }) => {
		const { controller, remote, browser } = attachmentActionsFixture();
		browser.writeResult = { kind: 'failure', status: 403, ...(detail ? { detail } : {}) };
		const outcome = await controller.uploadInline(testNoteId(), file).then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		expect({ outcome, completed: remote.completed }).toEqual({ outcome: message, completed: [] });
	});
});
