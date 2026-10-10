import { imageDescriptionResponseSchema } from '$lib/models/attachment-recognition';
import type { IImageDescription } from '$lib/server/controllers/attachment-processing/controller';

const DEFAULT_LANGUAGE_MODEL_BASE_URL = 'https://openrouter.ai/api/v1';

interface LanguageModelClientOptions {
	readonly baseURL?: string;
	readonly appURL?: string;
}

/**
 * Shared image describing over OpenRouter chat completions. Accepts any image
 * URL the model can resolve — presigned object-storage URLs for uploaded
 * images and base64 data-URLs for PDF-embedded images from OCR — so both
 * paths share one describing implementation and one configured model.
 */
export class ImageDescription implements IImageDescription {
	private readonly endpoint: string;

	constructor(
		private readonly apiKey: string,
		options: LanguageModelClientOptions = {}
	) {
		this.endpoint = `${options.baseURL ?? DEFAULT_LANGUAGE_MODEL_BASE_URL}/chat/completions`;
	}

	async describe(input: { imageDataUrl: string; prompt: string; model: string }): Promise<string> {
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
								text: input.prompt
							},
							{ type: 'image_url', image_url: { url: input.imageDataUrl } }
						]
					}
				]
			})
		});
		if (!response.ok) throw new Error(`Vision description failed (${response.status})`);
		const payload = imageDescriptionResponseSchema.parse(await response.json());
		const description = payload.choices?.[0]?.message?.content?.trim();
		if (!description) throw new Error('Vision model returned no description');
		return description;
	}
}
