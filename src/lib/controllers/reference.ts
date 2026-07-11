import type { ActorContext, FindReferencesInput, FindReferencesOutput } from '../models';
import type {
	ProvenanceRecorder,
	ReferenceFinder,
	ReferenceRanker,
	SelectionAnchorCreator,
	SuggestionCreator
} from '../services';
export interface ReferenceDependencies {
	anchorCreator: SelectionAnchorCreator;
	referenceFinder: ReferenceFinder;
	referenceRanker: ReferenceRanker;
	provenanceRecorder: ProvenanceRecorder;
	suggestionCreator: SuggestionCreator;
}
export class DefaultReferenceController {
	constructor(private readonly dependencies: ReferenceDependencies) {}
	async execute(actor: ActorContext, input: FindReferencesInput): Promise<FindReferencesOutput> {
		const anchor = await this.dependencies.anchorCreator.create(actor, input.selection);
		const found = await this.dependencies.referenceFinder.find(actor, input.selection);
		const ranked = await this.dependencies.referenceRanker.rank(actor, input.selection, found);
		if (ranked.length === 0) return { outcome: 'nothing_relevant', anchorId: anchor.id };
		const provenance = await this.dependencies.provenanceRecorder.record(actor, {
			producerKind: 'pipeline',
			producerName: 'Reference',
			pipeline: 'reference',
			sourceAnchorId: anchor.id,
			metadata: {}
		});
		const suggestions = await Promise.all(
			ranked.map((candidate) =>
				this.dependencies.suggestionCreator.create(actor, {
					kind: 'reference',
					noteId: input.selection.noteId,
					confidence: candidate.confidence,
					provenanceId: provenance.id,
					sourceAnchorId: anchor.id,
					payload: {
						noteId: input.selection.noteId,
						url: candidate.url,
						title: candidate.title,
						tier: candidate.tier,
						relevanceNote: candidate.relevanceNote,
						sourceAnchorId: anchor.id,
						provenanceId: provenance.id
					}
				})
			)
		);
		return { outcome: 'found', anchorId: anchor.id, suggestions };
	}
}
