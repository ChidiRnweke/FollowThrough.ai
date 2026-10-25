import type { InlineCompletionPassage } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type {
	InlineGroundingLookup,
	InlineGroundingMarkers,
	InlineGroundingRepository
} from '$lib/server/repositories/inline-suggestions/grounding';

export interface InlineGroundingScope {
	readonly noteId: NoteId;
	readonly projectId: ProjectId;
	readonly headingPath: readonly string[];
}

/** The passages and memory one completion is grounded on. */
export interface InlineGroundingContent {
	readonly projectPassages: readonly InlineCompletionPassage[];
	readonly userMemory: readonly string[];
}

export type InlineGroundingDecision =
	| { readonly kind: 'reuse'; readonly grounding: InlineGroundingContent }
	| {
			readonly kind: 'rebuild';
			readonly reason: 'requested' | 'missing' | 'knowledge_changed' | 'memory_changed';
			/** What the rebuilt grounding is to be stamped with. */
			readonly markers: InlineGroundingMarkers;
	  };

/**
 * Whether a caret rest can be grounded on what an earlier rest in the same
 * section already retrieved. Retrieval is an embedding call, a vector search
 * and a rerank call, and the corpus they read rarely changes between two
 * pauses in one section; the stored grounding stays valid until it does.
 */
export interface InlineGrounding {
	decide(
		scope: InlineGroundingScope,
		requested: 'reuse' | 'rebuild'
	): Promise<InlineGroundingDecision>;
	/** Stores what retrieval produced, stamped with the markers it was decided against. */
	keep(
		scope: Pick<InlineGroundingScope, 'noteId' | 'headingPath'>,
		grounding: InlineGroundingContent,
		markers: InlineGroundingMarkers
	): Promise<void>;
}

/** Headings join on a separator no heading text contains. */
const sectionKeyOf = (headingPath: readonly string[]): string => headingPath.join('\u001f');

const decisionFor = (
	requested: 'reuse' | 'rebuild',
	lookup: InlineGroundingLookup
): InlineGroundingDecision => {
	const { stored, current } = lookup;
	if (requested === 'rebuild') return { kind: 'rebuild', reason: 'requested', markers: current };
	if (!stored) return { kind: 'rebuild', reason: 'missing', markers: current };
	if (stored.knowledgeMarker !== current.knowledge)
		return { kind: 'rebuild', reason: 'knowledge_changed', markers: current };
	if (stored.memoryMarker !== current.memory)
		return { kind: 'rebuild', reason: 'memory_changed', markers: current };
	return {
		kind: 'reuse',
		grounding: { projectPassages: stored.projectPassages, userMemory: stored.userMemory }
	};
};

export class InlineGroundingService implements InlineGrounding {
	constructor(private readonly snapshots: InlineGroundingRepository) {}

	async decide(
		scope: InlineGroundingScope,
		requested: 'reuse' | 'rebuild'
	): Promise<InlineGroundingDecision> {
		const lookup = await this.snapshots.find(
			{ noteId: scope.noteId, sectionKey: sectionKeyOf(scope.headingPath) },
			scope.projectId
		);
		return decisionFor(requested, lookup);
	}

	keep(
		scope: Pick<InlineGroundingScope, 'noteId' | 'headingPath'>,
		grounding: InlineGroundingContent,
		markers: InlineGroundingMarkers
	): Promise<void> {
		return this.snapshots.put(
			{ noteId: scope.noteId, sectionKey: sectionKeyOf(scope.headingPath) },
			{
				projectPassages: grounding.projectPassages,
				userMemory: grounding.userMemory,
				knowledgeMarker: markers.knowledge,
				memoryMarker: markers.memory
			}
		);
	}
}
