import { describe, expect, it } from 'vitest';
import { AttachmentStorage } from './object-storage';

// Signing a download link is local: no request reaches the endpoint.
const storage = new AttachmentStorage({
	endpoint: 'http://127.0.0.1:9',
	region: 'us-east-1',
	accessKeyId: 'test',
	secretAccessKey: 'test-secret',
	bucket: 'attachments',
	forcePathStyle: true
});
const disposition = async (filename?: string) =>
	new URL(await storage.createDownloadUrl('objects/report', 300, filename)).searchParams.get(
		'response-content-disposition'
	);

describe('signed download links', () => {
	it('names the download without letting the filename break the header', async () => {
		expect(await disposition('Q3 "final"\r\nreport.pdf')).toBe(
			'attachment; filename="Q3 _final___report.pdf"'
		);
	});
	it('leaves the disposition to the stored object when no filename is given', async () => {
		expect(await disposition()).toBeNull();
	});
});
