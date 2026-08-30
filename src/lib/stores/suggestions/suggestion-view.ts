import type { NoteRef } from '$lib/models/notes';
import type { PipelineKind } from '$lib/models/agent';
import type { Suggestion, SuggestionView } from '$lib/models/suggestions';

/**
 * A suggestion the user just watched a pipeline produce, as the tray shows it.
 *
 * It states the pipeline and the time, which is what the caption reads and all
 * this side knows. It used to assemble a whole `Provenance` here — inventing a
 * producer name per pipeline, an empty metadata bag, and omitting the source
 * anchor, run id and model that the real record carries. The stored row was
 * never consulted and never matched.
 */
export function suggestionToView(
	suggestion: Suggestion,
	pipeline: PipelineKind,
	note?: NoteRef
): SuggestionView {
	return {
		suggestion,
		origin: { pipeline, createdAt: suggestion.createdAt },
		...(note !== undefined ? { note } : {})
	};
}
