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

export interface AcceptReviewedSuggestionInput extends AcceptSuggestionInput {
	readonly drawioReview?: {
		readonly noteId: NoteId;
		readonly source: string;
		readonly renderedSvg: string;
	};
}

export interface SuggestionsController {
	list(actor: ActorContext, input: ListSuggestionsInput): Promise<ListSuggestionsOutput>;
	listPendingMemory(
		actor: ActorContext,
		input: ListPendingMemoryInput
	): Promise<ListPendingMemoryOutput>;
	accept(actor: ActorContext, input: AcceptSuggestionInput): Promise<AcceptSuggestionOutput>;
	acceptReviewed(
		actor: ActorContext,
		input: AcceptReviewedSuggestionInput
	): Promise<AcceptSuggestionOutput>;
	reject(actor: ActorContext, input: RejectSuggestionInput): Promise<Suggestion>;
	revert(actor: ActorContext, input: RevertSuggestionInput): Promise<Suggestion>;
}
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
