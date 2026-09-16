import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PreparedExport } from '$lib/models/deliverables';
import { InMemoryAttachments } from '$lib/testing/attachments/fakes/in-memory-attachments';
import { exportControllerFixture } from '$lib/testing/deliverables/fixtures/export-controller';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const id = '00000000-0000-4000-8000-000000000001';
const source = `/api/attachments/${id}/content`;
const input = { projectId: testProjectId(), noteIds: [testNoteId()], title: 'Image export' };
describe('export image authorization', () => {
	it('fetches an actor-authorized attachment before rendering', async () => {
		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const server = createServer((_req, response) => {
			response.writeHead(200, { 'content-type': 'image/png' });
			response.end(bytes);
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		try {
			const attachments = new InMemoryAttachments();
			attachments.downloadUrls.set(
				`${testActor().userId}/${id}`,
				`http://127.0.0.1:${(server.address() as AddressInfo).port}/image`
			);
			const rendered: PreparedExport[] = [];
			const pdfGenerator = async (value: PreparedExport) => {
				rendered.push(value);
				return Buffer.from('pdf');
			};
			const { service, notes } = exportControllerFixture({
				attachmentDownloader: attachments,
				pdfGenerator
			});
			notes.notes = [
				noteBuilder({
					document: { type: 'doc', content: [{ type: 'image', attrs: { src: source } }] }
				})
			];
			await service.previewDocument(testActor(), input);
			expect(rendered[0]?.images.get(source)).toBe(
				`data:image/png;base64,${bytes.toString('base64')}`
			);
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});
	it('rejects an attachment the actor cannot download', async () => {
		const { service, notes } = exportControllerFixture({
			attachmentDownloader: new InMemoryAttachments()
		});
		notes.notes = [
			noteBuilder({
				document: { type: 'doc', content: [{ type: 'image', attrs: { src: source } }] }
			})
		];
		await expect(service.previewDocument(testActor(), input)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
	it('never fetches document-authored external URLs', async () => {
		const fetched: string[] = [];
		const fetchImage = async (url: string) => {
			fetched.push(url);
			return 'data:image/png;base64,AAA';
		};
		const { service, notes } = exportControllerFixture({ fetchImage });
		notes.notes = [
			noteBuilder({
				document: {
					type: 'doc',
					content: [{ type: 'image', attrs: { src: 'https://example.com/private' } }]
				}
			})
		];
		await service.previewDocument(testActor(), input);
		expect(fetched).toEqual([]);
	});
});
