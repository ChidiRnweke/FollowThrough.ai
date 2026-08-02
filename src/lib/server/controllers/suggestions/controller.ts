import type { ActorContext } from '$lib/models/identity';
import type { Diagram, DiagramId, DrawioDiagram } from '$lib/models/diagrams';
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
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import { ValidationError } from '$lib/errors';
import type {
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
export interface SuggestionArtifactApplier {
	apply(actor: ActorContext, suggestion: Suggestion): Promise<AcceptSuggestionOutput['artifact']>;
	revert(actor: ActorContext, suggestion: Suggestion): Promise<void>;
}

interface DrawioReviewSaver {
	save(
		actor: ActorContext,
		input: {
			noteId: NoteId;
			diagramId: DiagramId;
			source: string;
			renderedSvg: string;
		}
	): Promise<DrawioDiagram>;
}

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
	accept(actor: ActorContext, input: AcceptSuggestionInput): Promise<AcceptSuggestionOutput>;
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
	): Promise<AcceptSuggestionOutput>;
	/** Reject a pending suggestion, marking it so it no longer appears in the proposed set. */
	reject(actor: ActorContext, input: RejectSuggestionInput): Promise<Suggestion>;
	/**
	 * Undo a previously accepted suggestion: revert its edit to the document and reopen
	 * it, atomically. Reverting is only possible while the accepted artifact still matches
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
	drawioReviewSaver?: DrawioReviewSaver;
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
	accept(actor: ActorContext, input: AcceptSuggestionInput): Promise<AcceptSuggestionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const pending = await this.dependencies.suggestionFinder.get(actor, input.suggestionId);
			const artifact = await this.dependencies.artifactApplier.apply(actor, pending);
			const suggestion = await this.dependencies.suggestionAccepter.accept(
				actor,
				pending,
				artifact.id,
				input.autoAccepted ?? false
			);
			return { suggestion, artifact };
		});
	}
	acceptReviewed(
		actor: ActorContext,
		input: AcceptReviewedSuggestionInput
	): Promise<AcceptSuggestionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const accepted = await this.accept(actor, input);
			if (!input.drawioReview) return accepted;
			if (accepted.suggestion.kind !== 'diagram' || accepted.suggestion.payload.kind !== 'drawio')
				throw new ValidationError('The suggestion did not create the expected draw.io diagram.');
			if (!this.dependencies.drawioReviewSaver)
				throw new ValidationError('Draw.io suggestion review is unavailable.');
			const artifact = accepted.artifact as Diagram;
			const diagram = await this.dependencies.drawioReviewSaver.save(actor, {
				...input.drawioReview,
				diagramId: artifact.id as DiagramId
			});
			return { ...accepted, artifact: diagram };
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
			const accepted = await this.dependencies.suggestionFinder.get(actor, input.suggestionId);
			await this.dependencies.artifactApplier.revert(actor, accepted);
			return this.dependencies.suggestionReverter.revert(actor, accepted);
		});
	}
}
