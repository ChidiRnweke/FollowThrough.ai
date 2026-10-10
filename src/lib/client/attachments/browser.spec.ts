import { expect, it } from 'vitest';
import { BrowserAttachmentFiles } from './browser';
import { InMemoryAttachmentRemote } from '$lib/testing/attachments/fakes/browser-actions';
it.each([
	{ body: '<Error><Message>Bucket full</Message></Error>', detail: 'Bucket full' },
	{ body: 'Forbidden', detail: undefined }
])('reads an object-storage rejection from $body', async ({ body, detail }) => {
	const remote = new InMemoryAttachmentRemote();
	const intent = await remote.initiate({
		projectId: '00000000-0000-4000-8000-000000000001',
		path: 'brief.txt',
		mediaType: 'text/plain',
		byteSize: 5,
		checksumSha256: 'a'.repeat(64)
	});
	const browser = new BrowserAttachmentFiles(async () => new Response(body, { status: 403 }));
	expect(await browser.put(intent, new File(['hello'], 'brief.txt'))).toEqual({
		kind: 'failure',
		status: 403,
		...(detail ? { detail } : {})
	});
});
