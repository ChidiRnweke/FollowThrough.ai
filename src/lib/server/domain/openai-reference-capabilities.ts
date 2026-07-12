import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { ActorContext, ReferenceCandidate, TextSelection, Url } from '$lib/models';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/models';
import type { ReferenceFinder, WebReferenceClient } from '$lib/services';

const ReferenceSearch = z.object({
	references: z.array(
		z.object({
			url: z.string().url(),
			title: z.string().min(1),
			tier: z.enum(['official', 'standard', 'vendor', 'community']),
			relevanceNote: z.string().min(1),
			confidence: z.number().int().min(0).max(100)
		})
	)
});

const REFERENCE_PROMPT = `Search the web for sources that directly support or clarify the selected architecture text.
Prefer standards and official documentation, then vendor documentation, then community sources.
Return no sources when nothing is sufficiently relevant. Do not pad the result.
Write each relevance note specifically against the supplied selection.`;

export class OpenAIWebReferenceClient implements WebReferenceClient {
	private readonly client: OpenAI;

	constructor(
		apiKey: string,
		private readonly model = process.env.OPENAI_REFERENCE_MODEL ?? 'gpt-5.6-luna'
	) {
		this.client = new OpenAI({ apiKey });
	}

	async search(selectionText: string): Promise<readonly ReferenceCandidate[] | undefined> {
		const response = await this.client.responses.parse({
			model: this.model,
			tools: [{ type: 'web_search' }],
			input: [
				{ role: 'system', content: REFERENCE_PROMPT },
				{ role: 'user', content: selectionText }
			],
			text: { format: zodTextFormat(ReferenceSearch, 'reference_search') }
		});
		return response.output_parsed?.references.map((reference) => ({
			...reference,
			url: reference.url as Url
		}));
	}
}

export class WebSearchReferenceFinder implements ReferenceFinder {
	private readonly client?: WebReferenceClient;

	constructor(options: { client?: WebReferenceClient; apiKey?: string; model?: string } = {}) {
		const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
		this.client =
			options.client ?? (apiKey ? new OpenAIWebReferenceClient(apiKey, options.model) : undefined);
	}

	async find(
		_actor: ActorContext,
		selection: TextSelection
	): Promise<readonly ReferenceCandidate[]> {
		if (!this.client) return [];
		try {
			const references = await this.client.search(selection.text);
			if (!references)
				throw new InvalidGeneratedContentError('The model returned no structured reference output');
			return references;
		} catch (error) {
			if (error instanceof InvalidGeneratedContentError) throw error;
			throw new ExternalServiceError('Reference search failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
