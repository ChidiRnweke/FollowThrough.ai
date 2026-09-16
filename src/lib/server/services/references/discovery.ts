import type { ActorContext } from '$lib/models/identity';
import type { ReferenceCandidate, ReferenceSource } from '$lib/models/references';
import type { TextSelection } from '$lib/models/notes';
import type {
	WebReferenceClient,
	ReferenceSearchOptions
} from '$lib/server/repositories/references/web-research';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';

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

const referenceTier = (source: ReferenceSource): ReferenceCandidate['tier'] => {
	const hostname = source.hostname.toLowerCase();
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
	citation: ReferenceSource,
	selectionText: string
): ReferenceCandidate => {
	const tier = referenceTier(citation);
	return {
		url: citation.url,
		title: citation.title?.trim() || citation.hostname,
		tier,
		relevanceNote:
			compactExcerpt(citation.content) ??
			`Supporting source for “${compactExcerpt(selectionText) ?? 'the selected text'}”.`,
		confidence: confidenceFor(tier)
	};
};

/** Domain ranking metadata for sources returned by the web provider. */
export class ReferenceDiscovery {
	constructor(private readonly client: WebReferenceClient) {}
	async find(
		_actor: ActorContext,
		selection: TextSelection,
		options: ReferenceSearchOptions = {}
	): Promise<readonly ReferenceCandidate[]> {
		try {
			const sources = await this.client.search(selection.text, options);
			if (!sources)
				throw new InvalidGeneratedContentError('The provider returned no usable reference output');
			const seen = new Set<string>();
			return sources.flatMap((source) => {
				if (seen.has(source.url)) return [];
				seen.add(source.url);
				return [candidateFromCitation(source, selection.text)];
			});
		} catch (error) {
			if (options.signal?.aborted) throw error;
			if (error instanceof InvalidGeneratedContentError || error instanceof ExternalServiceError)
				throw error;
			throw new ExternalServiceError('Reference search failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
