import type {
	AcceptSuggestionOutput,
	ActorContext,
	CreateReferenceInput,
	CreateRelationshipInput,
	CreateTodoInput,
	Diagram,
	DiagramId,
	MemoryChangePayload,
	MemoryEntry,
	ProvenanceId,
	ReferenceId,
	RelationshipId,
	Suggestion,
	Todo,
	TodoId
} from '$lib/models';
import { InvalidTransitionError } from '$lib/errors';

interface TodoCreator {
	create(actor: ActorContext, input: CreateTodoInput): Promise<Todo>;
}
interface TodoDeleter {
	softDelete(actor: ActorContext, todoId: TodoId): Promise<void>;
}
interface RelationshipCreator {
	create(
		actor: ActorContext,
		input: CreateRelationshipInput
	): Promise<import('$lib/models').NoteRelationship>;
}
interface RelationshipDeleter {
	delete(actor: ActorContext, relationshipId: RelationshipId): Promise<void>;
}
interface ReferenceCreator {
	create(
		actor: ActorContext,
		input: CreateReferenceInput
	): Promise<import('$lib/models').ExternalReference>;
}
interface ReferenceDeleter {
	delete(actor: ActorContext, referenceId: ReferenceId): Promise<void>;
}
interface DiagramWriter {
	create(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
}
interface DiagramDeleter {
	delete(actor: ActorContext, diagramId: DiagramId): Promise<void>;
}
interface MemoryChangeApplier {
	apply(
		actor: ActorContext,
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryEntry>;
	revert(actor: ActorContext, suggestion: import('$lib/models').MemorySuggestion): Promise<void>;
}
interface DrawioContent {
	validate(source: string): string;
	extract(source: string): string;
}

export interface ISuggestionApplication {
	apply(actor: ActorContext, suggestion: Suggestion): Promise<AcceptSuggestionOutput['artifact']>;
	revert(actor: ActorContext, suggestion: Suggestion): Promise<void>;
}

export class SuggestionApplication implements ISuggestionApplication {
	constructor(
		private readonly todoCreator: TodoCreator,
		private readonly relationshipCreator: RelationshipCreator,
		private readonly referenceCreator: ReferenceCreator,
		private readonly diagramWriter: DiagramWriter,
		private readonly todoDeleter: TodoDeleter,
		private readonly relationshipDeleter: RelationshipDeleter,
		private readonly referenceDeleter: ReferenceDeleter,
		private readonly diagramDeleter: DiagramDeleter,
		private readonly memoryChangeApplier: MemoryChangeApplier,
		private readonly drawioValidator: Pick<DrawioContent, 'validate'>,
		private readonly drawioLabels: Pick<DrawioContent, 'extract'>
	) {}

	async apply(
		actor: ActorContext,
		suggestion: Suggestion
	): Promise<AcceptSuggestionOutput['artifact']> {
		switch (suggestion.kind) {
			case 'todo':
				return this.todoCreator.create(actor, suggestion.payload);
			case 'backlink':
				return this.relationshipCreator.create(actor, suggestion.payload);
			case 'reference':
				return this.referenceCreator.create(actor, suggestion.payload);
			case 'diagram': {
				const source =
					suggestion.payload.kind === 'drawio'
						? this.drawioValidator.validate(suggestion.payload.source)
						: suggestion.payload.source;
				const now = new Date().toISOString() as Diagram['createdAt'];
				const base = {
					id: crypto.randomUUID() as Diagram['id'],
					userId: actor.userId,
					noteId: suggestion.payload.noteId,
					title: suggestion.payload.title,
					source,
					searchableText:
						suggestion.payload.kind === 'drawio' ? this.drawioLabels.extract(source) : source,
					sourceAnchorId: suggestion.sourceAnchorId,
					provenanceId: suggestion.provenanceId,
					createdAt: now,
					updatedAt: now
				};
				const diagram =
					suggestion.payload.kind === 'mermaid'
						? ({ ...base, kind: 'mermaid' } as Diagram)
						: ({ ...base, kind: 'drawio' } as Diagram);
				return this.diagramWriter.create(actor, diagram);
			}
			case 'memory':
				return this.memoryChangeApplier.apply(actor, suggestion.payload, suggestion.provenanceId);
		}
	}

	async revert(actor: ActorContext, suggestion: Suggestion): Promise<void> {
		if (!suggestion.appliedArtifactId)
			throw new InvalidTransitionError('Suggestion has no applied artifact');
		switch (suggestion.kind) {
			case 'todo':
				await this.todoDeleter.softDelete(actor, suggestion.appliedArtifactId as TodoId);
				break;
			case 'backlink':
				await this.relationshipDeleter.delete(
					actor,
					suggestion.appliedArtifactId as RelationshipId
				);
				break;
			case 'reference':
				await this.referenceDeleter.delete(actor, suggestion.appliedArtifactId as ReferenceId);
				break;
			case 'diagram':
				await this.diagramDeleter.delete(actor, suggestion.appliedArtifactId as DiagramId);
				break;
			case 'memory':
				await this.memoryChangeApplier.revert(actor, suggestion);
				break;
		}
	}
}
