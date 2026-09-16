import type { DiagramIndexContext, IndexingResult } from '$lib/models/knowledge-search';
import type { IEmbeddings } from '$lib/server/services/knowledge-search/embeddings';
import {
	diagramIndexNoteId,
	type ContentIndex
} from '$lib/server/services/knowledge-search/indexing';
import type {
	DiagramWriter,
	DrawioXmlContentValidator,
	DrawioSvgPreviewSanitizer,
	DiagramTextExtractor
} from '$lib/server/services/diagrams/contracts';
import type { AppliedRecord } from '$lib/server/services/suggestions/contracts';
import { assembleSuggestionView } from '$lib/services/suggestions/presentation';
import { provenanceOrigin } from '$lib/services/provenance/presentation';
import type { MemoryIndexer } from '$lib/server/services/memory/contracts';
import type { AppliedChange } from '$lib/models/proposal-effects';
import { mapAppliedChange } from '$lib/server/services/suggestions/effects';
import type { Todo } from '$lib/models/todos';
import type { ExternalReference } from '$lib/models/references';
import type { NoteRelationship } from '$lib/models/notes';
import type { MemoryEntry } from '$lib/models/memory';
import type { TodoCreator } from '$lib/server/services/todos/contracts';
import type { RelationshipCreator } from '$lib/server/services/relationships/contracts';
import type { ReferenceCreator } from '$lib/server/services/references/contracts';
import type { MemoryChanges } from '$lib/server/services/memory/contracts';
import type { NoteReader } from '$lib/server/services/notes/contracts';
import type { DrawioLabelExtractor } from '$lib/server/services/diagrams/drawio';
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
import type { ListPendingMemoryInput } from '$lib/models/memory';
import type { ListPendingMemoryOutput, MemorySuggestionView } from '$lib/models/suggestions';
import type { AtomicOperation as TransactionRunner, DateTime } from '$lib/models/workspace';
import { InvalidTransitionError, ValidationError } from '$lib/errors';
import type {
	SuggestionEffectService,
	SuggestionAccepter,
	SuggestionFinder,
	SuggestionLister,
	SuggestionExpirer,
	SuggestionRejecter,
	SuggestionReverter,
	SuggestionContextReader
} from '$lib/server/services/suggestions/contracts';

type SuggestionArtifact = Todo | NoteRelationship | ExternalReference | Diagram | MemoryEntry;
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
	suggestionExpirer: SuggestionExpirer;
	suggestionContextReader: SuggestionContextReader;
	suggestionFinder: SuggestionFinder;
	suggestionAccepter: SuggestionAccepter;
	suggestionRejecter: SuggestionRejecter;
	suggestionReverter: SuggestionReverter;
	todoCreator: TodoCreator;
	relationshipCreator: Pick<RelationshipCreator, 'createWithChange'>;
	referenceCreator: ReferenceCreator;
	memoryChanges: MemoryChanges;
	sourceNotes: NoteReader;
	drawioLabels: Pick<DrawioLabelExtractor, 'extract'>;
	suggestionEffects: SuggestionEffectService;
	indexEmbeddings: IEmbeddings;
	indexWriter: Pick<ContentIndex, 'complete'>;
	memoryIndexer: MemoryIndexer;
	diagramIndexer: {
		index(
			actor: ActorContext,
			diagram: Diagram,
			context: DiagramIndexContext
		): Promise<IndexingResult>;
	};
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
		await this.dependencies.suggestionExpirer.expire(actor);
		const suggestions = await this.dependencies.suggestionLister.listByStatus(actor, input.status);
		const views = await this.readViews(actor, suggestions);
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
		await this.dependencies.suggestionExpirer.expire(actor);
		const pending = await this.dependencies.suggestionLister.listByStatus(actor, 'proposed');
		const memory = pending.filter(
			(suggestion) =>
				suggestion.kind === 'memory' && suggestion.payload.projectId === input.projectId
		);
		const views = await this.readViews(actor, memory);
		return {
			suggestions: views
				.filter((view): view is MemorySuggestionView => view.suggestion.kind === 'memory')
				.sort((a, b) => b.suggestion.createdAt.localeCompare(a.suggestion.createdAt))
		};
	}
	private async readViews(
		actor: ActorContext,
		suggestions: readonly Suggestion[]
	): Promise<readonly SuggestionView[]> {
		const contexts = await this.dependencies.suggestionContextReader.readContexts(
			actor,
			suggestions
		);
		return contexts.map(({ suggestion, note, anchor, provenance }) =>
			assembleSuggestionView(suggestion, { note, anchor, origin: provenanceOrigin(provenance) })
		);
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
			const applied = await this.applySuggestion(actor, pending);
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
	private async applySuggestion(
		actor: ActorContext,
		suggestion: Suggestion
	): Promise<SuggestionApplicationResult> {
		switch (suggestion.kind) {
			case 'todo': {
				const artifact = await this.dependencies.todoCreator.create(actor, suggestion.payload);
				return {
					artifact,
					changes: [{ kind: 'created', after: { type: 'todos', value: artifact } }]
				};
			}
			case 'backlink': {
				const change = await this.dependencies.relationshipCreator.createWithChange(
					actor,
					suggestion.payload
				);
				return {
					artifact: change.after,
					changes: [
						mapAppliedChange(change, (value) => ({ type: 'note_relationships' as const, value }))
					]
				};
			}
			case 'reference': {
				const artifact = await this.dependencies.referenceCreator.create(actor, suggestion.payload);
				return {
					artifact,
					changes: [{ kind: 'created', after: { type: 'references', value: artifact } }]
				};
			}
			case 'diagram':
				return this.applyDiagram(actor, suggestion);
			case 'memory': {
				const result = await this.dependencies.memoryChanges.apply(
					actor,
					suggestion.payload,
					suggestion.provenanceId
				);
				return {
					artifact: result.entry,
					changes: result.changes.map((change) =>
						mapAppliedChange(change, (value) => ({ type: 'memory_entries' as const, value }))
					)
				};
			}
		}
	}
	private async applyDiagram(
		actor: ActorContext,
		suggestion: Extract<Suggestion, { kind: 'diagram' }>
	): Promise<SuggestionApplicationResult> {
		const source =
			suggestion.payload.kind === 'drawio'
				? this.dependencies.drawioXmlValidator.validate(suggestion.payload.source)
				: suggestion.payload.source;
		const note = await this.dependencies.sourceNotes.get(actor, suggestion.payload.noteId);
		const now = this.dependencies.now();
		const base = {
			id: crypto.randomUUID() as Diagram['id'],
			userId: actor.userId,
			projectId: note.projectId,
			sourceNoteId: suggestion.payload.noteId,
			title: suggestion.payload.title,
			source,
			searchableText:
				suggestion.payload.kind === 'drawio'
					? this.dependencies.drawioLabels.extract(source)
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
		const artifact = await this.dependencies.diagramWriter.create(actor, diagram);
		return {
			artifact,
			changes: [{ kind: 'created', after: { type: 'diagrams', value: artifact } }]
		};
	}
	private async indexRecords(
		actor: ActorContext,
		records: readonly AppliedRecord[]
	): Promise<void> {
		for (const record of records) {
			if (record.type === 'memory_entries')
				await this.finishIndex(
					actor,
					await this.dependencies.memoryIndexer.index(actor, record.value)
				);
			if (record.type === 'diagrams') await this.indexDiagram(actor, record.value);
		}
	}
	private async indexDiagram(actor: ActorContext, diagram: Diagram): Promise<void> {
		const noteId = diagramIndexNoteId(diagram);
		const context: DiagramIndexContext =
			noteId === undefined
				? { kind: 'standalone' }
				: { kind: 'note', title: (await this.dependencies.sourceNotes.get(actor, noteId)).title };
		await this.finishIndex(
			actor,
			await this.dependencies.diagramIndexer.index(actor, diagram, context)
		);
	}

	private async finishIndex(actor: ActorContext, result: IndexingResult): Promise<void> {
		if (result.kind === 'stored') return;
		const batch = await this.dependencies.indexEmbeddings.embed(
			result.missing.map((chunk) => chunk.input)
		);
		await this.dependencies.indexWriter.complete(actor, result, batch);
	}
}
