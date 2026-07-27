import type { ImageDescriber } from '$lib/services';
import { DEFAULT_OPENROUTER_BASE_URL, type OpenRouterClientOptions } from './openrouter-client';

const DESCRIBE_PROMPT =
	'Describe this image factually for search. Include visible text, charts, diagrams, objects, and layout. Do not make unsupported inferences.';

/**
 * Shared image describing over OpenRouter chat completions. Accepts any image
 * URL the model can resolve — presigned object-storage URLs for uploaded
 * images and base64 data-URLs for PDF-embedded images from OCR — so both
 * paths share one describing implementation and one configured model.
 */
export class OpenRouterImageDescriber implements ImageDescriber {
	private readonly endpoint: string;

	constructor(
		private readonly apiKey: string,
		options: OpenRouterClientOptions = {}
	) {
		this.endpoint = `${options.baseURL ?? DEFAULT_OPENROUTER_BASE_URL}/chat/completions`;
	}

	async describe(input: {
		imageDataUrl: string;
		context?: string;
		model: string;
	}): Promise<string> {
		const response = await fetch(this.endpoint, {
			method: 'POST',
			signal: AbortSignal.timeout(60_000),
			headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				model: input.model,
				messages: [
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: input.context
									? `This image appears in a document near the following text:\n${input.context}\n\n${DESCRIBE_PROMPT}`
									: DESCRIBE_PROMPT
							},
							{ type: 'image_url', image_url: { url: input.imageDataUrl } }
						]
					}
				]
			})
		});
		if (!response.ok) throw new Error(`Vision description failed (${response.status})`);
		const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
		const description = payload.choices?.[0]?.message?.content?.trim();
		if (!description) throw new Error('Vision model returned no description');
		return description;
	}
}
