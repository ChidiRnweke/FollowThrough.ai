import { describe, expect, it } from 'vitest';
import { TextRecognition } from './text-recognition';

const annotation = (hash: string, content: readonly Record<string, unknown>[]) => ({
	type: 'file',
	file: { filename: 'doc.pdf', hash, content }
});

const textPart = (text: string) => ({ type: 'text', text });
const imagePart = (url: string) => ({ type: 'image_url', image_url: { url } });

class FakeFetch {
	request?: { url: string; init?: RequestInit };

	constructor(
		private readonly payload: unknown,
		private readonly status = 200
	) {}

	readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		this.request = { url: String(input), init };
		return new Response(JSON.stringify(this.payload), {
			status: this.status,
			headers: { 'content-type': 'application/json' }
		});
	};
}

const clientUsing = (transport: FakeFetch) =>
	new TextRecognition('test-key', {
		baseURL: 'https://openrouter.test/api/v1',
		fetch: transport.fetch
	});

const input = { pdfBase64: 'QUJD', fileName: 'doc.pdf', model: 'ocr-model' };

describe('TextRecognition annotation parsing', () => {
	it('maps message annotations to ordered markdown and image parts', async () => {
		const transport = new FakeFetch({
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

		const content = await clientUsing(transport).ocr(input);

		expect(content.parts).toEqual([
			{ kind: 'markdown', text: '# Title' },
			{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' }
		]);
	});

	it('sends the PDF as a base64 file part with the mistral-ocr plugin', async () => {
		const transport = new FakeFetch({ choices: [{ message: { annotations: [] } }] });

		await clientUsing(transport)
			.ocr(input)
			.catch(() => undefined);

		const body = JSON.parse(String(transport.request?.init?.body));
		expect({
			plugins: body.plugins,
			model: body.model,
			file: body.messages[0].content[1]
		}).toEqual({
			plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }],
			model: 'ocr-model',
			file: {
				type: 'file',
				file: { filename: 'doc.pdf', file_data: 'data:application/pdf;base64,QUJD' }
			}
		});
	});

	it('reads annotations from error.metadata.file_annotations on failure responses', async () => {
		const transport = new FakeFetch(
			{
				error: {
					message: 'Inference failed',
					metadata: { file_annotations: [annotation('hash-1', [textPart('partial text')])] }
				}
			},
			500
		);

		const content = await clientUsing(transport).ocr(input);

		expect(content.parts).toEqual([{ kind: 'markdown', text: 'partial text' }]);
	});

	it('dedupes annotations that appear under both locations by file hash', async () => {
		const shared = annotation('hash-1', [textPart('only once')]);
		const transport = new FakeFetch(
			{
				choices: [{ message: { annotations: [shared] } }],
				error: { metadata: { file_annotations: [shared] } }
			},
			500
		);

		const content = await clientUsing(transport).ocr(input);

		expect(content.parts).toEqual([{ kind: 'markdown', text: 'only once' }]);
	});

	it('fails when an error response carries no annotations', async () => {
		const transport = new FakeFetch({ error: { message: 'Upstream exploded' } }, 502);

		await expect(clientUsing(transport).ocr(input)).rejects.toThrow('PDF OCR failed');
	});

	it('drops empty text parts and tolerates missing image urls', async () => {
		const transport = new FakeFetch({
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

		const content = await clientUsing(transport).ocr(input);

		expect(content.parts).toEqual([{ kind: 'markdown', text: 'kept' }]);
	});
});
