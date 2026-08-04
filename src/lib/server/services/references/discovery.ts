import OpenAI from 'openai';
import type { ActorContext } from '$lib/models/identity';
import {
	openRouterWebSearchTool,
	REFERENCE_WEB_SEARCH_DEFAULTS,
	webSearchOptionsFromEnvironment
} from '$lib/models/agent';
import type { ReferenceCandidate, Url } from '$lib/models/references';
import type { TextSelection } from '$lib/models/notes';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
interface OperationObserver {
	run<T>(
		name: string,
		context: unknown,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string
	): Promise<T>;
}
const directObserver: OperationObserver = { run: (_name, _context, body) => body() };

const DEFAULT_GENERATION_MODEL = 'deepseek/deepseek-v4-flash';

export interface ReferenceSearchOptions {
	readonly model?: string;
	/** Aborts the web-search call when the user cancels the run it belongs to. */
	readonly signal?: AbortSignal;
}

export interface IWebReferenceResearch {
	search(
		selectionText: string,
		options?: ReferenceSearchOptions
	): Promise<readonly ReferenceCandidate[] | undefined>;
}

export interface IReferenceDiscovery {
	find(
		actor: ActorContext,
		selection: TextSelection,
		options?: ReferenceSearchOptions
	): Promise<readonly ReferenceCandidate[]>;
}

const createLanguageModelClient = (
	apiKey: string,
	options: { baseURL?: string; appURL?: string } = {}
): OpenAI =>
	new OpenAI({
		apiKey,
		baseURL: options.baseURL ?? 'https://openrouter.ai/api/v1',
		defaultHeaders: {
			'HTTP-Referer': options.appURL ?? 'http://localhost:5173',
			'X-OpenRouter-Title': 'FollowThrough'
		}
	});

const REFERENCE_PROMPT = `Search the web for sources that directly support or clarify the selected architecture text.
Prefer standards and official documentation, then vendor documentation, then community sources.
Perform one focused search and cite no more than six directly relevant sources.
Do not write a guide or tutorial. Cite every source so its citation metadata is included in the response.
Return no sources when nothing is sufficiently relevant. Do not pad the result.`;

interface OpenRouterCitation {
	readonly type?: string;
	readonly url?: string;
	readonly title?: string;
	readonly content?: string;
}

interface OpenRouterOutputItem {
	readonly type?: string;
	readonly action?: {
		readonly sources?: readonly OpenRouterCitation[];
	};
	readonly content?: readonly {
		readonly annotations?: readonly OpenRouterCitation[];
	}[];
}

const STANDARD_HOSTS = [
	'rfc-editor.org',
	'ietf.org',
	'w3.org',
	'iso.org',
	'oasis-open.org',
	'ecma-international.org',
	'unicode.org'
];

const hostMatches = (hostname: string, domain: string): boolean =>
	hostname === domain || hostname.endsWith(`.${domain}`);

const referenceTier = (url: URL): ReferenceCandidate['tier'] => {
	const hostname = url.hostname.toLowerCase();
	if (STANDARD_HOSTS.some((domain) => hostMatches(hostname, domain))) return 'standard';
	if (hostname.endsWith('.gov') || hostname.includes('.gov.')) return 'official';
	if (/^(docs?|developers?|learn|support|cloud)\./.test(hostname)) return 'vendor';
	if (hostname.endsWith('.org')) return 'official';
	return 'community';
};

const confidenceFor = (tier: ReferenceCandidate['tier']): number =>
	({ standard: 95, official: 85, vendor: 75, community: 60 })[tier];

const compactExcerpt = (value: string | undefined): string | undefined => {
	const compact = value?.replace(/\s+/g, ' ').trim();
	if (!compact) return undefined;
	if (compact.length <= 280) return compact;
	const shortened = compact.slice(0, 277);
	const boundary = shortened.lastIndexOf(' ');
	return `${shortened.slice(0, boundary > 180 ? boundary : shortened.length)}…`;
};

const candidateFromCitation = (
	citation: OpenRouterCitation,
	selectionText: string
): ReferenceCandidate | undefined => {
	if (!citation.url) return undefined;
	let parsed: URL;
	try {
		parsed = new URL(citation.url);
	} catch {
		return undefined;
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
	const tier = referenceTier(parsed);
	return {
		url: parsed.href as Url,
		title: citation.title?.trim() || parsed.hostname,
		tier,
		relevanceNote:
			compactExcerpt(citation.content) ??
			`Supporting source for “${compactExcerpt(selectionText) ?? 'the selected text'}”.`,
		confidence: confidenceFor(tier)
	};
};

const referenceCandidatesFrom = (
	output: readonly OpenRouterOutputItem[],
	selectionText: string
): readonly ReferenceCandidate[] => {
	const citations = output.flatMap(
		(item) =>
			item.content?.flatMap((content) =>
				(content.annotations ?? []).filter((annotation) => annotation.type === 'url_citation')
			) ?? []
	);
	const searchSources = output.flatMap((item) => item.action?.sources ?? []);
	const seen = new Set<string>();
	const references: ReferenceCandidate[] = [];
	for (const citation of [...citations, ...searchSources]) {
		const candidate = candidateFromCitation(citation, selectionText);
		if (!candidate || seen.has(candidate.url)) continue;
		seen.add(candidate.url);
		references.push(candidate);
		if (references.length === 6) break;
	}
	return references;
};

interface ReferenceResearchOptions {
	readonly baseURL?: string;
	readonly appURL?: string;
	readonly defaultModel?: string;
	readonly observer?: OperationObserver;
}

export class ReferenceResearch implements IWebReferenceResearch {
	private readonly client: OpenAI;
	private readonly defaultModel: string;
	private readonly observer: OperationObserver;

	constructor(apiKey: string, options: ReferenceResearchOptions = {}) {
		this.defaultModel = options.defaultModel ?? DEFAULT_GENERATION_MODEL;
		this.client = createLanguageModelClient(apiKey, options);
		this.observer = options.observer ?? directObserver;
	}

	async search(
		selectionText: string,
		options: ReferenceSearchOptions = {}
	): Promise<readonly ReferenceCandidate[] | undefined> {
		const model = options.model ?? this.defaultModel;
		return this.observer.run(
			'reference.search',
			{ input: selectionText, metadata: { model }, tags: ['reference', 'web-search'] },
			async () => {
				const response = await this.client.responses.create(
					{
						model,
						tools: [
							openRouterWebSearchTool(
								webSearchOptionsFromEnvironment(process.env),
								REFERENCE_WEB_SEARCH_DEFAULTS
							) as never
						],
						input: [
							{ role: 'system', content: REFERENCE_PROMPT },
							{ role: 'user', content: selectionText }
						]
					},
					options.signal ? { signal: options.signal } : undefined
				);
				return referenceCandidatesFrom(
					response.output as unknown as readonly OpenRouterOutputItem[],
					selectionText
				);
			},
			(results) => JSON.stringify(results)
		);
	}
}

export class ReferenceDiscovery implements IReferenceDiscovery {
	private readonly client?: IWebReferenceResearch;

	constructor(
		options: {
			client?: IWebReferenceResearch;
			apiKey?: string;
			baseURL?: string;
			appURL?: string;
			defaultModel?: string;
			observer?: OperationObserver;
		} = {}
	) {
		const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
		this.client =
			options.client ??
			(apiKey
				? new ReferenceResearch(apiKey, {
						baseURL: options.baseURL ?? process.env.OPENROUTER_BASE_URL,
						appURL: options.appURL ?? process.env.ORIGIN,
						defaultModel: options.defaultModel ?? process.env.OPENROUTER_DEFAULT_MODEL,
						observer: options.observer
					})
				: undefined);
	}

	async find(
		_actor: ActorContext,
		selection: TextSelection,
		options: ReferenceSearchOptions = {}
	): Promise<readonly ReferenceCandidate[]> {
		if (!this.client) return [];
		try {
			const references = await this.client.search(selection.text, options);
			if (!references)
				throw new InvalidGeneratedContentError('The provider returned no usable reference output');
			return references;
		} catch (error) {
			if (error instanceof InvalidGeneratedContentError) throw error;
			throw new ExternalServiceError('Reference search failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
