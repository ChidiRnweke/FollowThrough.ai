import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '$lib/errors';
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

/** The bytes `hello`: their SHA-256 in hex and base64, and their MD5 entity tag. */
const HELLO = {
	sha256Hex: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
	sha256Base64: 'LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=',
	etag: '"5d41402abc4b2a76b9719d911017c592"'
};

interface EndpointObject {
	readonly size: number;
	readonly etag: string;
	readonly sha256Base64?: string;
}

/**
 * An S3 endpoint over HTTP for one bucket, answering the requests object storage sends as
 * S3 does: a checksum only when one is asked for, and a copy refused with 412 when its
 * source no longer has the expected entity tag.
 */
const storageEndpoint = () => {
	const objects = new Map<string, EndpointObject>();
	const respond = (request: IncomingMessage, response: ServerResponse) => {
		const path = decodeURIComponent(new URL(request.url ?? '/', 'http://storage').pathname);
		const key = path.replace(/^\/attachments\/?/, '');
		if (request.method === 'HEAD' && !key) return response.writeHead(200).end();
		if (request.method === 'HEAD') {
			const object = objects.get(key);
			if (!object) return response.writeHead(404).end();
			return response
				.writeHead(200, {
					'content-length': object.size,
					'content-type': 'text/plain',
					etag: object.etag,
					...(object.sha256Base64 && request.headers['x-amz-checksum-mode'] === 'ENABLED'
						? { 'x-amz-checksum-sha256': object.sha256Base64 }
						: {})
				})
				.end();
		}
		if (request.method === 'PUT' && request.headers['x-amz-copy-source']) {
			const sourceKey = decodeURIComponent(String(request.headers['x-amz-copy-source'])).replace(
				/^\/?attachments\//,
				''
			);
			const source = objects.get(sourceKey);
			const expected = request.headers['x-amz-copy-source-if-match'];
			if (!source || (expected !== undefined && expected !== source.etag))
				return response
					.writeHead(412, { 'content-type': 'application/xml' })
					.end(
						'<Error><Code>PreconditionFailed</Code><Message>At least one of the pre-conditions you specified did not hold</Message></Error>'
					);
			objects.set(key, source);
			return response
				.writeHead(200, { 'content-type': 'application/xml' })
				.end(
					`<CopyObjectResult><ETag>${source.etag}</ETag><LastModified>2026-11-15T00:00:00.000Z</LastModified></CopyObjectResult>`
				);
		}
		if (request.method === 'DELETE') {
			objects.delete(key);
			return response.writeHead(204).end();
		}
		return response.writeHead(501).end();
	};
	const server = createServer((request, response) => {
		request.resume();
		request.on('end', () => respond(request, response));
	});
	return {
		objects,
		start: () =>
			new Promise<AttachmentStorage>((resolve) =>
				server.listen(0, '127.0.0.1', () =>
					resolve(
						new AttachmentStorage({
							endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
							region: 'us-east-1',
							accessKeyId: 'test',
							secretAccessKey: 'test-secret',
							bucket: 'attachments',
							forcePathStyle: true
						})
					)
				)
			),
		stop: () => new Promise<void>((resolve) => server.close(() => resolve()))
	};
};

describe('verified uploads', () => {
	const endpoint = storageEndpoint();
	let provider: AttachmentStorage;
	beforeAll(async () => {
		provider = await endpoint.start();
	});
	afterAll(() => endpoint.stop());

	it('signs the upload for exactly the reserved length and SHA-256 digest', async () => {
		const signed = await provider.createUploadUrl({
			objectKey: 'staging/upload-1',
			mediaType: 'text/plain',
			byteSize: 5,
			checksumSha256: HELLO.sha256Hex,
			expiresInSeconds: 600
		});
		const query = new URL(signed.url).searchParams;
		expect({
			signedHeaders: query.get('X-Amz-SignedHeaders'),
			checksumInQuery: query.has('x-amz-checksum-sha256'),
			requiredHeaders: signed.requiredHeaders
		}).toEqual({
			signedHeaders: 'content-length;content-type;host;x-amz-checksum-sha256',
			checksumInQuery: false,
			requiredHeaders: {
				'content-type': 'text/plain',
				'x-amz-checksum-sha256': HELLO.sha256Base64
			}
		});
	});

	it('reports the checksum storage computed, in hex, with the entity tag', async () => {
		endpoint.objects.set('staging/upload-2', {
			size: 5,
			etag: HELLO.etag,
			sha256Base64: HELLO.sha256Base64
		});
		expect(await provider.stat('staging/upload-2')).toEqual({
			byteSize: 5,
			mediaType: 'text/plain',
			etag: HELLO.etag,
			checksumSha256: HELLO.sha256Hex
		});
	});

	it('refuses to promote a staged object that changed after it was verified', async () => {
		endpoint.objects.set('staging/upload-3', { size: 5, etag: HELLO.etag });
		const verified = await provider.stat('staging/upload-3');
		endpoint.objects.set('staging/upload-3', {
			size: 5,
			etag: '"c983190483df167d2a3841463c2a9341"'
		});
		const outcome = await provider
			.promote({
				sourceKey: 'staging/upload-3',
				sourceEtag: verified.etag,
				destinationKey: 'objects/version-3'
			})
			.then(
				() => 'promoted',
				(error: Error) => error
			);
		expect({
			refused: outcome instanceof ConflictError,
			staged: endpoint.objects.has('staging/upload-3'),
			promoted: endpoint.objects.has('objects/version-3')
		}).toEqual({ refused: true, staged: true, promoted: false });
	});

	it('promotes the staged object while it is still the verified version', async () => {
		endpoint.objects.set('staging/upload-4', { size: 5, etag: HELLO.etag });
		await provider.promote({
			sourceKey: 'staging/upload-4',
			sourceEtag: HELLO.etag,
			destinationKey: 'objects/version-4'
		});
		expect({
			staged: endpoint.objects.has('staging/upload-4'),
			promoted: endpoint.objects.get('objects/version-4')?.etag
		}).toEqual({ staged: false, promoted: HELLO.etag });
	});
});
