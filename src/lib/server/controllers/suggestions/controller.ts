import type {
	DiagramWriter,
	DrawioXmlContentValidator,
	DrawioSvgPreviewSanitizer,
	DiagramTextExtractor
} from '$lib/server/services/diagrams/contracts';
import type { AppliedRecord } from '$lib/server/services/suggestions/contracts';
import type { MemoryIndexer } from '$lib/server/services/memory/contracts';
import type {
	ISuggestionApplication,
	SuggestionArtifact
} from '$lib/server/services/suggestions/application';
import type { ActorContext } from '$lib/models/identity';
import type { Diagram } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import type {
	AcceptSuggestionInput,
	AcceptSuggestionOutput,
	ListSuggestionsInput,
	ListSuggestionsOutput,
	SuggestionGroup,
	SuggestionView,
	RejectSuggestionInput,
	RevertSuggestionInput,
	Suggestion
} from '$lib/models/suggestions';
import type {
	ListPendingMemoryInput,
	ListPendingMemoryOutput,
	MemorySuggestionView
} from '$lib/models/memory';
import type { AtomicOperation as TransactionRunner, DateTime } from '$lib/models/workspace';
import { InvalidTransitionError, ValidationError } from '$lib/errors';
import type {
	SuggestionEffectService,
	SuggestionAccepter,
	SuggestionFinder,
	SuggestionLister,
	SuggestionRejecter,
	SuggestionReverter,
	SuggestionViewAssembler
} from '$lib/server/services/suggestions/contracts';

/**
 * Applies or reverts the concrete edit a suggestion represents, so the controller can
 * stay agnostic about what accepting a suggestion actually does to the document.
 */
export type SuggestionArtifactApplier = ISuggestionApplication;

/** {@link AcceptSuggestionInput} with an optional reviewed draw.io diagram to persist alongside the accepted suggestion. */
export interface AcceptReviewedSuggestionInput extends AcceptSuggestionInput {
	readonly drawioReview?: {
		readonly noteId: NoteId;
		readonly source: string;
		readonly renderedSvg: string;
	};
}

/**
 * Application boundary for suggestions: listing the proposed, accepted, and rejected
 * sets, and accepting, rejecting, or reverting individual suggestions.
 *
 * Acceptance applies the suggestion's edit and records the outcome in one transaction,
 * so a suggestion is never accepted without its edit actually landing.
 */
export interface SuggestionsController {
	/**
	 * List suggestions by status, sorted oldest-first and grouped by the note they apply
	 * to so the UI can present a per-note review surface. Suggestions not tied to a note
	 * form their own group.
	 */
	list(actor: ActorContext, input: ListSuggestionsInput): Promise<ListSuggestionsOutput>;
	/**
	 * List the proposed memory suggestions for a project, newest first. Used to surface
	 * candidate memories for a project's memory pane before any acceptance decision.
	 */
	listPendingMemory(
		actor: ActorContext,
		input: ListPendingMemoryInput
	): Promise<ListPendingMemoryOutput>;
	/**
	 * Apply a pending suggestion's edit and mark it accepted, atomically. `autoAccepted`
	 * records whether the user explicitly confirmed the suggestion or let it through
	 * automatically.
	 */
	accept(
		actor: ActorContext,
		input: AcceptSuggestionInput
	): Promise<AcceptSuggestionOutput<SuggestionArtifact>>;
	/**
	 * Accept a suggestion and, when the client submits a reviewed draw.io diagram, persist
	 * that reviewed version over the generated one.
	 *
	 * @throws ValidationError if a review is supplied but the suggestion did not create a
	 * draw.io diagram, or draw.io review is unavailable in this deployment.
	 */
	acceptReviewed(
		actor: ActorContext,
		input: AcceptReviewedSuggestionInput
	): Promise<AcceptSuggestionOutput<SuggestionArtifact>>;
	/** Reject a pending suggestion, marking it so it no longer appears in the proposed set. */
	reject(actor: ActorContext, input: RejectSuggestionInput): Promise<Suggestion>;
	/**
	 * Undo a previously accepted suggestion and mark it reverted in one transaction. Reverting is only possible while the accepted artifact still matches
	 * what was applied.
	 */
	revert(actor: ActorContext, input: RevertSuggestionInput): Promise<Suggestion>;
}
/** Everything the {@link SuggestionsController} needs, injected so it can be built and tested without real stores. */
export interface SuggestionsDependencies {
	suggestionLister: SuggestionLister;
	suggestionViewAssembler: SuggestionViewAssembler;
	suggestionFinder: SuggestionFinder;
	suggestionAccepter: SuggestionAccepter;
	suggestionRejecter: SuggestionRejecter;
	suggestionReverter: SuggestionReverter;
	artifactApplier: SuggestionArtifactApplier;
	suggestionEffects: SuggestionEffectService;
	memoryIndexer: MemoryIndexer;
	diagramIndexer: { index(actor: ActorContext, diagram: Diagram): Promise<void> };
	diagramWriter: DiagramWriter;
	drawioXmlValidator: DrawioXmlContentValidator;
	drawioSvgSanitizer: DrawioSvgPreviewSanitizer;
	drawioTextExtractor: DiagramTextExtractor;
	now: () => DateTime;
	transactionRunner: TransactionRunner;
}
export class Suggestions implements SuggestionsController {
	constructor(private readonly dependencies: SuggestionsDependencies) {}
	async list(actor: ActorContext, input: ListSuggestionsInput): Promise<ListSuggestionsOutput> {
		const suggestions = await this.dependencies.suggestionLister.listByStatus(actor, input.status);
		const views = await this.dependencies.suggestionViewAssembler.assemble(actor, suggestions);
		const ordered = [...views].sort((a, b) =>
			a.suggestion.createdAt.localeCompare(b.suggestion.createdAt)
		);
		const groups = new Map<string, { note?: SuggestionView['note']; views: SuggestionView[] }>();
		for (const view of ordered) {
			const key = view.note?.id ?? '';
			const group = groups.get(key) ?? { note: view.note, views: [] };
			group.views.push(view);
			groups.set(key, group);
		}
		const result: SuggestionGroup[] = [...groups.values()].map((group) =>
			group.note ? { note: group.note, suggestions: group.views } : { suggestions: group.views }
		);
		return { groups: result };
	}
	async listPendingMemory(
		actor: ActorContext,
		input: ListPendingMemoryInput
	): Promise<ListPendingMemoryOutput> {
		const pending = await this.dependencies.suggestionLister.listByStatus(actor, 'proposed');
		const memory = pending.filter(
			(suggestion) =>
				suggestion.kind === 'memory' && suggestion.payload.projectId === input.projectId
		);
		const views = await this.dependencies.suggestionViewAssembler.assemble(actor, memory);
		return {
			suggestions: views
				.filter((view): view is MemorySuggestionView => view.suggestion.kind === 'memory')
				.sort((a, b) => b.suggestion.createdAt.localeCompare(a.suggestion.createdAt))
		};
	}
	accept(
		actor: ActorContext,
		input: AcceptSuggestionInput
	): Promise<AcceptSuggestionOutput<SuggestionArtifact>> {
		return this.acceptInTransaction(actor, input);
	}
	acceptReviewed(
		actor: ActorContext,
		input: AcceptReviewedSuggestionInput
	): Promise<AcceptSuggestionOutput<SuggestionArtifact>> {
		return this.acceptInTransaction(actor, input, true);
	}
	private acceptInTransaction(
		actor: ActorContext,
		input: AcceptReviewedSuggestionInput,
		requireReview = false
	): Promise<AcceptSuggestionOutput<SuggestionArtifact>> {
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.suggestionEffects.lock(actor, input.suggestionId);
			const pending = await this.dependencies.suggestionFinder.get(actor, input.suggestionId);
			if (pending.status !== 'proposed')
				throw new InvalidTransitionError('Only a pending suggestion can be accepted');
			if (
				requireReview &&
				pending.kind === 'diagram' &&
				pending.payload.kind === 'drawio' &&
				!input.drawioReview
			)
				throw new ValidationError('A draw.io diagram must be accepted through its review.');
			if (input.drawioReview && (pending.kind !== 'diagram' || pending.payload.kind !== 'drawio'))
				throw new ValidationError('The suggestion did not create the expected draw.io diagram.');
			const applied = await this.dependencies.artifactApplier.apply(actor, pending);
			let artifact = applied.artifact;
			let changes = applied.changes;
			if (input.drawioReview) {
				const created = changes.find((change) => change.after.type === 'diagrams');
				if (!created || created.after.type !== 'diagrams' || created.after.value.kind !== 'drawio')
					throw new ValidationError('The suggestion did not create the expected draw.io diagram.');
				if (created.after.value.sourceNoteId !== input.drawioReview.noteId)
					throw new ValidationError('The suggestion did not create the expected draw.io diagram.');
				const source = this.dependencies.drawioXmlValidator.validate(input.drawioReview.source);
				const renderedSvg = this.dependencies.drawioSvgSanitizer.sanitize(
					input.drawioReview.renderedSvg
				);
				const searchableText = await this.dependencies.drawioTextExtractor.extract({
					...created.after.value,
					source
				});
				const diagram = await this.dependencies.diagramWriter.update(actor, {
					...created.after.value,
					source,
					renderedSvg,
					searchableText,
					updatedAt: this.dependencies.now()
				});
				artifact = diagram;
				changes = [{ kind: 'created', after: { type: 'diagrams', value: diagram } }];
			}
			await this.indexRecords(
				actor,
				changes.map((change) => change.after)
			);
			await this.dependencies.suggestionEffects.record(actor, pending.id, changes);
			const suggestion = await this.dependencies.suggestionAccepter.accept(
				actor,
				pending,
				artifact.id,
				input.autoAccepted ?? false
			);
			return { suggestion, artifact };
		});
	}

	reject(actor: ActorContext, input: RejectSuggestionInput): Promise<Suggestion> {
		return this.dependencies.transactionRunner.run(async () =>
			this.dependencies.suggestionRejecter.reject(
				actor,
				await this.dependencies.suggestionFinder.get(actor, input.suggestionId)
			)
		);
	}
	revert(actor: ActorContext, input: RevertSuggestionInput): Promise<Suggestion> {
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.suggestionEffects.lock(actor, input.suggestionId);
			const accepted = await this.dependencies.suggestionFinder.get(actor, input.suggestionId);
			const restored = await this.dependencies.suggestionEffects.restore(actor, accepted);
			await this.indexRecords(actor, restored);
			return this.dependencies.suggestionReverter.revert(actor, accepted);
		});
	}
	private async indexRecords(
		actor: ActorContext,
		records: readonly AppliedRecord[]
	): Promise<void> {
		for (const record of records) {
			if (record.type === 'memory_entries')
				await this.dependencies.memoryIndexer.index(actor, record.value);
			if (record.type === 'diagrams')
				await this.dependencies.diagramIndexer.index(actor, record.value);
		}
	}
}
