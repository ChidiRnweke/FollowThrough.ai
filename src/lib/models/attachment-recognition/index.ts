import { z } from 'zod';
import type { AgentPayload } from '$lib/models/agent/payload';
export interface OcrImage {
	readonly id?: string;
	readonly image_base64?: string;
}

export interface OcrPage {
	readonly index?: number;
	readonly markdown?: string;
	readonly images?: readonly OcrImage[];
}

export interface OcrResponse {
	readonly pages?: readonly OcrPage[];
	readonly usage_info?: { readonly pages_processed?: number };
	readonly message?: string;
	/** Mistral's error detail: sometimes a string, sometimes a nested object. */
	readonly detail?: AgentPayload;
}

export const ocrResponseSchema: z.ZodType<OcrResponse> = z.object({
	pages: z
		.array(
			z.object({
				index: z.number().optional(),
				markdown: z.string().optional(),
				images: z
					.array(z.object({ id: z.string().optional(), image_base64: z.string().optional() }))
					.optional()
			})
		)
		.optional(),
	usage_info: z.object({ pages_processed: z.number().optional() }).optional(),
	message: z.string().optional(),
	detail: z.json().optional()
});

export const imageDescriptionResponseSchema = z.object({
	choices: z.array(z.object({ message: z.object({ content: z.string() }) }))
});
