import type { DiagramIndexing } from '$lib/server/services/knowledge-search/retrieval';
import type { DrawioDocuments } from '$lib/server/services/diagrams/drawio';
import type { MemoryIndexing as MemoryIndexer } from '$lib/server/services/knowledge-search/retrieval';
import type { DiagramIndexContext } from '$lib/models/knowledge-search';
import type { DiagramWriter } from '$lib/server/services/diagrams/library';
import type { AppliedRecord } from '$lib/server/services/suggestions/inbox';
import type { DiagramLabelPresentation } from '$lib/services/diagrams/labels';
import type { ProvenancePresentation } from '$lib/services/provenance/presentation';
import type { ISuggestionPresentationService } from '$lib/services/suggestions/presentation';
import type { TodoCreationRules } from '$lib/services/todos/edits';

import type { AppliedChange } from '$lib/models/proposal-effects';
import type { CreateTodoInput, Todo, TodoId } from '$lib/models/todos';
import type { MemoryChanges } from '$lib/server/services/memory/library';
import type { NoteReader } from '$lib/server/services/notes/catalog';
import type { ReferenceCreator } from '$lib/server/services/references/library';
import type { RelationshipCreator } from '$lib/server/services/relationships/graph';
import type { TodoCreator } from '$lib/server/services/todos/catalog';

import { InvalidTransitionError, ValidationError } from '$lib/errors';
import type { Diagram } from '$lib/models/diagrams';
import type { ActorContext } from '$lib/models/identity';
import type { ListPendingMemoryInput } from '$lib/models/memory';
import type { NoteId } from '$lib/models/notes';
import type {
	AcceptSuggestionInput,
	AcceptSuggestionOutput,
	ListPendingMemoryOutput,
	ListSuggestionsInput,
	ListSuggestionsOutput,
	RejectSuggestionInput,
	RevertSuggestionInput,
	Suggestion,
	SuggestionView
} from '$lib/models/suggestions';
import type { DateTime, AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { SuggestionEffectService } from '$lib/server/services/suggestions/effects';
import type {
	SuggestionAccepter,
	SuggestionExpirer,
	SuggestionFinder,
	SuggestionReader,
	SuggestionRejecter,
	SuggestionReverter
} from '$lib/server/services/suggestions/inbox';

import type { SuggestionArtifact } from '$lib/models/suggestions';
interface SuggestionApplicationResult {
	readonly artifact: SuggestionArtifact;
	readonly changes: readonly AppliedChange<AppliedRecord>[];
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
	list(input: ListSuggestionsInput): Promise<ListSuggestionsOutput>;
	/**
	 * List the proposed memory suggestions for a project, newest first. Used to surface
	 * candidate memories for a project's memory pane before any acceptance decision.
	 */
	listPendingMemory(input: ListPendingMemoryInput): Promise<ListPendingMemoryOutput>;
	/**
	 * Apply a pending suggestion's edit and mark it accepted, atomically. `autoAccepted`
	 * records whether the user explicitly confirmed the suggestion or let it through
	 * automatically.
	 */
	accept(input: AcceptSuggestionInput): Promise<AcceptSuggestionOutput<SuggestionArtifact>>;
	/**
	 * Accept a suggestion and, when the client submits a reviewed draw.io diagram, persist
	 * that reviewed version over the generated one.
	 *
	 * @throws ValidationError if a review is supplied but the suggestion did not create a
	 * draw.io diagram, or draw.io review is unavailable in this deployment.
	 */
	acceptReviewed(
		input: AcceptReviewedSuggestionInput
	): Promise<AcceptSuggestionOutput<SuggestionArtifact>>;
	/** Reject a pending suggestion, marking it so it no longer appears in the proposed set. */
	reject(input: RejectSuggestionInput): Promise<Suggestion>;
	/**
	 * Undo a previously accepted suggestion and mark it reverted in one transaction. Reverting is only possible while the accepted artifact still matches
	 * what was applied.
	 */
	revert(input: RevertSuggestionInput): Promise<Suggestion>;
}
/** Everything the {@link SuggestionsController} needs, injected so it can be built and tested without real stores. */
export interface SuggestionsDependencies {
	readonly todoCreationRules: TodoCreationRules;
	readonly suggestionPresentation: ISuggestionPresentationService;
	suggestionReader: SuggestionReader;
	suggestionExpirer: SuggestionExpirer;
	suggestionFinder: SuggestionFinder;
	suggestionAccepter: SuggestionAccepter;
	suggestionRejecter: SuggestionRejecter;
	suggestionReverter: SuggestionReverter;
	todoCreator: TodoCreator;
	relationshipCreator: RelationshipCreator;
	referenceCreator: ReferenceCreator;
	memoryChanges: MemoryChanges;
	sourceNotes: NoteReader;
	suggestionEffects: SuggestionEffectService;
	memoryIndexer: MemoryIndexer;
	diagramIndexer: DiagramIndexing;
	diagramWriter: DiagramWriter;
	drawio: DrawioDocuments;
	readonly diagramLabelPresentation: DiagramLabelPresentation;
	now: () => DateTime;
	transactionRunner: TransactionRunner;
}
export class Suggestions implements SuggestionsController {
	constructor(
		private readonly actor: ActorContext,
		private readonly provenancePresentation: ProvenancePresentation,
		private readonly dependencies: SuggestionsDependencies
	) {}
	async list(input: ListSuggestionsInput): Promise<ListSuggestionsOutput> {
		await this.dependencies.suggestionExpirer.expire();
		const suggestions = await this.dependencies.suggestionReader.listByStatus(input.status);
		const views = await this.readViews(suggestions);
		return { groups: this.dependencies.suggestionPresentation.groupSuggestionViews(views) };
	}
	async listPendingMemory(input: ListPendingMemoryInput): Promise<ListPendingMemoryOutput> {
		await this.dependencies.suggestionExpirer.expire();
		const pending = await this.dependencies.suggestionReader.listByStatus('proposed');
		const memory = this.dependencies.suggestionPresentation.pendingMemorySuggestions(
			pending,
			input.projectId
		);
		const views = await this.readViews(memory);
		return {
			suggestions: this.dependencies.suggestionPresentation.newestMemoryViews(views)
		};
	}
	private async readViews(suggestions: readonly Suggestion[]): Promise<readonly SuggestionView[]> {
		const contexts = await this.dependencies.suggestionReader.readContexts(suggestions);
		return contexts.map(({ suggestion, note, anchor, provenance }) =>
			this.dependencies.suggestionPresentation.assembleSuggestionView(suggestion, {
				note,
				anchor,
				origin: this.provenancePresentation.provenanceOrigin(provenance)
			})
		);
	}
	accept(input: AcceptSuggestionInput): Promise<AcceptSuggestionOutput<SuggestionArtifact>> {
		return this.acceptInTransaction(input);
	}
	acceptReviewed(
		input: AcceptReviewedSuggestionInput
	): Promise<AcceptSuggestionOutput<SuggestionArtifact>> {
		return this.acceptInTransaction(input, true);
	}
	private acceptInTransaction(
		input: AcceptReviewedSuggestionInput,
		requireReview = false
	): Promise<AcceptSuggestionOutput<SuggestionArtifact>> {
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.suggestionEffects.lock(input.suggestionId);
			const pending = await this.dependencies.suggestionFinder.get(input.suggestionId);
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
			const applied = await this.applySuggestion(pending);
			let artifact = applied.artifact;
			let changes = applied.changes;
			if (input.drawioReview) {
				const created = changes.find((change) => change.after.type === 'diagrams');
				if (!created || created.after.type !== 'diagrams' || created.after.value.kind !== 'drawio')
					throw new ValidationError('The suggestion did not create the expected draw.io diagram.');
				if (created.after.value.sourceNoteId !== input.drawioReview.noteId)
					throw new ValidationError('The suggestion did not create the expected draw.io diagram.');
				const source = this.dependencies.drawio.validate(input.drawioReview.source);
				const renderedSvg = this.dependencies.drawio.sanitize(input.drawioReview.renderedSvg);
				const searchableText = this.dependencies.diagramLabelPresentation.searchText(
					this.dependencies.drawio.read(source)
				);
				const diagram = await this.dependencies.diagramWriter.persistContent({
					kind: 'drawio',
					diagramId: created.after.value.id,
					expectedUpdatedAt: created.after.value.updatedAt,
					expectedRevision: created.after.value.currentRevision,
					expectedPublishedRevision: created.after.value.publishedRevision,
					source,
					renderedSvg,
					searchableText,
					updatedAt: this.dependencies.now()
				});
				artifact = diagram;
				changes = [{ kind: 'created', after: { type: 'diagrams', value: diagram } }];
			}
			await this.indexRecords(changes.map((change) => change.after));
			await this.dependencies.suggestionEffects.record(pending.id, changes);
			const suggestion = await this.dependencies.suggestionAccepter.accept(
				pending,
				artifact.id,
				input.autoAccepted ?? false
			);
			return { suggestion, artifact };
		});
	}

	reject(input: RejectSuggestionInput): Promise<Suggestion> {
		return this.dependencies.transactionRunner.run(async () =>
			this.dependencies.suggestionRejecter.reject(
				await this.dependencies.suggestionFinder.get(input.suggestionId)
			)
		);
	}
	revert(input: RevertSuggestionInput): Promise<Suggestion> {
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.suggestionEffects.lock(input.suggestionId);
			const accepted = await this.dependencies.suggestionFinder.get(input.suggestionId);
			const restored = await this.dependencies.suggestionEffects.restore(accepted);
			await this.indexRecords(restored);
			return this.dependencies.suggestionReverter.revert(accepted);
		});
	}
	private async createTodo(input: CreateTodoInput): Promise<Todo> {
		const decision = this.dependencies.todoCreationRules.create(input, {
			id: input.id ?? (crypto.randomUUID() as TodoId),
			userId: this.actor.userId,
			timestamp: this.dependencies.now()
		});
		if (decision.kind === 'invalid') throw new ValidationError(decision.message);
		return this.dependencies.todoCreator.create(decision.todo);
	}

	private async applySuggestion(suggestion: Suggestion): Promise<SuggestionApplicationResult> {
		switch (suggestion.kind) {
			case 'todo': {
				const artifact = await this.createTodo(suggestion.payload);
				return {
					artifact,
					changes: [{ kind: 'created', after: { type: 'todos', value: artifact } }]
				};
			}
			case 'backlink': {
				const change = await this.dependencies.relationshipCreator.createWithChange(
					suggestion.payload
				);
				return {
					artifact: change.after,
					changes: [this.dependencies.suggestionEffects.tag(change, 'note_relationships')]
				};
			}
			case 'reference': {
				const artifact = await this.dependencies.referenceCreator.create(suggestion.payload);
				return {
					artifact,
					changes: [{ kind: 'created', after: { type: 'references', value: artifact } }]
				};
			}
			case 'diagram':
				return this.applyDiagram(suggestion);
			case 'memory': {
				const result = await this.dependencies.memoryChanges.apply(
					suggestion.payload,
					suggestion.provenanceId
				);
				return {
					artifact: result.entry,
					changes: result.changes.map((change) =>
						this.dependencies.suggestionEffects.tag(change, 'memory_entries')
					)
				};
			}
		}
	}
	private async applyDiagram(
		suggestion: Extract<Suggestion, { kind: 'diagram' }>
	): Promise<SuggestionApplicationResult> {
		const source =
			suggestion.payload.kind === 'drawio'
				? this.dependencies.drawio.validate(suggestion.payload.source)
				: suggestion.payload.source;
		const note = await this.dependencies.sourceNotes.get(suggestion.payload.noteId);
		const now = this.dependencies.now();
		const base = {
			id: crypto.randomUUID() as Diagram['id'],
			userId: this.actor.userId,
			projectId: note.projectId,
			sourceNoteId: suggestion.payload.noteId,
			title: suggestion.payload.title,
			source,
			searchableText:
				suggestion.payload.kind === 'drawio'
					? this.dependencies.diagramLabelPresentation.searchText(
							this.dependencies.drawio.read(source)
						)
					: source,
			sourceAnchorId: suggestion.sourceAnchorId,
			provenanceId: suggestion.provenanceId,
			createdAt: now,
			updatedAt: now
		};
		const diagram: Diagram =
			suggestion.payload.kind === 'mermaid'
				? { ...base, kind: 'mermaid' }
				: { ...base, kind: 'drawio', currentRevision: 1, publishedRevision: 0 };
		const artifact = await this.dependencies.diagramWriter.create(diagram);
		return {
			artifact,
			changes: [{ kind: 'created', after: { type: 'diagrams', value: artifact } }]
		};
	}
	private async indexRecords(records: readonly AppliedRecord[]): Promise<void> {
		for (const record of records) {
			if (record.type === 'memory_entries')
				await this.dependencies.memoryIndexer.indexMemory(record.value);
			if (record.type === 'diagrams') await this.indexDiagram(record.value);
		}
	}
	private async indexDiagram(diagram: Diagram): Promise<void> {
		const requirement = this.dependencies.diagramIndexer.diagramContextRequirement(diagram);
		const context: DiagramIndexContext =
			requirement.kind === 'standalone'
				? { kind: 'standalone' }
				: {
						kind: 'note',
						title: (await this.dependencies.sourceNotes.get(requirement.noteId)).title
					};
		await this.dependencies.diagramIndexer.indexDiagram(diagram, context);
	}
}
