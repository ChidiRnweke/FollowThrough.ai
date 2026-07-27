import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalServiceError } from '$lib/models';
import { OpenRouterOcrClient } from './openrouter-ocr-capabilities';

const annotation = (hash: string, content: readonly Record<string, unknown>[]) => ({
	type: 'file',
	file: { filename: 'doc.pdf', hash, content }
});

const textPart = (text: string) => ({ type: 'text', text });
const imagePart = (url: string) => ({ type: 'image_url', image_url: { url } });

const stubFetch = (payload: unknown, status = 200) => {
	const fetchMock = vi.fn(
		async (_url: string, _init?: RequestInit) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { 'content-type': 'application/json' }
			})
	);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
};

const client = new OpenRouterOcrClient('test-key', { baseURL: 'https://openrouter.test/api/v1' });

const input = { pdfBase64: 'QUJD', fileName: 'doc.pdf', model: 'ocr-model' };

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('OpenRouterOcrClient annotation parsing', () => {
	it('maps message annotations to ordered markdown and image parts', async () => {
		stubFetch({
			choices: [
				{
					message: {
						annotations: [
							annotation('hash-1', [textPart('# Title'), imagePart('data:image/png;base64,AAA')])
						]
					}
				}
			]
		});

		const content = await client.ocr(input);

		expect(content.parts).toEqual([
			{ kind: 'markdown', text: '# Title' },
			{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' }
		]);
	});

	it('sends the PDF as a base64 file part with the mistral-ocr plugin', async () => {
		const fetchMock = stubFetch({ choices: [{ message: { annotations: [] } }] });

		await expect(client.ocr(input)).rejects.toThrow('PDF OCR returned no content');

		const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
		expect(body.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }]);
		expect(body.model).toBe('ocr-model');
		expect(body.messages[0].content[1]).toEqual({
			type: 'file',
			file: { filename: 'doc.pdf', file_data: 'data:application/pdf;base64,QUJD' }
		});
	});

	it('reads annotations from error.metadata.file_annotations on failure responses', async () => {
		stubFetch(
			{
				error: {
					message: 'Inference failed',
					metadata: { file_annotations: [annotation('hash-1', [textPart('partial text')])] }
				}
			},
			500
		);

		const content = await client.ocr(input);

		expect(content.parts).toEqual([{ kind: 'markdown', text: 'partial text' }]);
	});

	it('dedupes annotations that appear under both locations by file hash', async () => {
		const shared = annotation('hash-1', [textPart('only once')]);
		stubFetch(
			{
				choices: [{ message: { annotations: [shared] } }],
				error: { metadata: { file_annotations: [shared] } }
			},
			500
		);

		const content = await client.ocr(input);

		expect(content.parts).toEqual([{ kind: 'markdown', text: 'only once' }]);
	});

	it('fails when an error response carries no annotations', async () => {
		stubFetch({ error: { message: 'Upstream exploded' } }, 502);

		await expect(client.ocr(input)).rejects.toBeInstanceOf(ExternalServiceError);
		await expect(client.ocr(input)).rejects.toThrow('PDF OCR failed');
	});

	it('drops empty text parts and tolerates missing image urls', async () => {
		stubFetch({
			choices: [
				{
					message: {
						annotations: [
							annotation('hash-1', [
								textPart('   '),
								{ type: 'image_url', image_url: {} },
								textPart('kept')
							])
						]
					}
				}
			]
		});

		const content = await client.ocr(input);

		expect(content.parts).toEqual([{ kind: 'markdown', text: 'kept' }]);
	});
});
