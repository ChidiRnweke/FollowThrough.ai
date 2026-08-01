import type { NoteRef } from '$lib/models/notes';
import type { PipelineKind } from '$lib/models/agent';
import type { Provenance } from '$lib/models/provenance';
import type { Suggestion, SuggestionView } from '$lib/models/suggestions';

const producerNames: Record<PipelineKind, string> = {
	extract_promises: 'Extract Promises',
	relate: 'Relate',
	reference: 'Reference',
	agent: 'Agent',
	memory: 'Memory'
};

export function suggestionToView(
	suggestion: Suggestion,
	pipeline: PipelineKind,
	note?: NoteRef
): SuggestionView {
	const provenance: Provenance = {
		id: suggestion.provenanceId,
		userId: suggestion.userId,
		producerKind: pipeline === 'agent' || pipeline === 'memory' ? 'agent' : 'pipeline',
		producerName: producerNames[pipeline],
		pipeline,
		metadata: {},
		createdAt: suggestion.createdAt
	};
	return { suggestion, provenance, ...(note !== undefined ? { note } : {}) };
}
