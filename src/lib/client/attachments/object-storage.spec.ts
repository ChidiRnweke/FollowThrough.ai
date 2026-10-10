import { describe, expect, it } from 'vitest';
import { storeUploadBytes } from './object-storage';

const failureOf = async (send: () => Promise<Response>): Promise<string> => {
	try {
		await storeUploadBytes(send, 'upload');
		return 'stored';
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
};

describe('storing upload bytes', () => {
	it('names file storage when the request never reaches it', async () => {
		const message = await failureOf(() => Promise.reject(new TypeError('Failed to fetch')));
		expect(message).toBe(
			'Could not reach file storage, so the upload was not saved. Check your connection, or ask the operator to allow this site in the storage CORS settings.'
		);
	});

	it('quotes the message of a refusal and accepts a stored upload', async () => {
		const refused = await failureOf(
			async () => new Response('<Error><Message>Access Denied</Message></Error>', { status: 403 })
		);
		const stored = await failureOf(async () => new Response(null, { status: 200 }));
		expect({ refused, stored }).toEqual({
			refused: 'File storage rejected the upload: Access Denied',
			stored: 'stored'
		});
	});
});
