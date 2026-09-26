import type { MemorySuggestion } from '$lib/models/suggestions';
import type { SuggestionContext } from '$lib/server/services/suggestions/contracts';

export const memorySuggestionContext = (suggestion: MemorySuggestion): SuggestionContext => ({
	suggestion,
	provenance: {
		id: suggestion.provenanceId,
		userId: suggestion.userId,
		createdAt: suggestion.createdAt,
		producerKind: 'agent',
		producerName: 'Agent memory',
		pipeline: 'memory',
		metadata: {}
	}
});
