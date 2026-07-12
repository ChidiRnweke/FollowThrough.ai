import type { NoteRef, PipelineKind, Provenance, Suggestion, SuggestionView } from '$lib/models';

const producerNames: Record<PipelineKind, string> = {
	extract_promises: 'Extract Promises',
	relate: 'Relate',
	reference: 'Reference',
	agent: 'Agent'
};

export function suggestionToView(
	suggestion: Suggestion,
	pipeline: PipelineKind,
	note?: NoteRef
): SuggestionView {
	const provenance: Provenance = {
		id: suggestion.provenanceId,
		userId: suggestion.userId,
		producerKind: pipeline === 'agent' ? 'agent' : 'pipeline',
		producerName: producerNames[pipeline],
		pipeline,
		metadata: {},
		createdAt: suggestion.createdAt
	};
	return { suggestion, provenance, ...(note !== undefined ? { note } : {}) };
}
