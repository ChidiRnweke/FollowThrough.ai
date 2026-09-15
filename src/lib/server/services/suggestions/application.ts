import { mapAppliedChange, type AppliedChange } from '$lib/models/proposal-effects';
import type { AppliedRecord } from '$lib/server/repositories/suggestions/application-effects';
import type { Suggestion } from '$lib/models/suggestions';
import type { ActorContext } from '$lib/models/identity';
import type { CreateReferenceInput, ExternalReference } from '$lib/models/references';
import type { CreateRelationshipInput } from '$lib/models/relationships';
import type { CreateTodoInput, Todo } from '$lib/models/todos';
import type { Diagram } from '$lib/models/diagrams';
import type { NoteId, NoteRelationship } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { MemoryChangePayload, MemoryEntry, MemoryApplication } from '$lib/models/memory';
import type { ProvenanceId } from '$lib/models/provenance';
import { NotFoundError } from '$lib/errors';

interface TodoCreator {
	create(actor: ActorContext, input: CreateTodoInput): Promise<Todo>;
}

interface RelationshipCreator {
	createWithChange(
		actor: ActorContext,
		input: CreateRelationshipInput
	): Promise<AppliedChange<NoteRelationship>>;
}

interface ReferenceCreator {
	create(actor: ActorContext, input: CreateReferenceInput): Promise<ExternalReference>;
}

interface DiagramWriter {
	create(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
}
/**
 * Diagrams are owned by their project, but a suggestion payload only names the note
 * it was raised on, so the note is what says which project the diagram belongs to.
 */
interface DiagramProjectResolver {
	findById(
		actor: ActorContext,
		noteId: NoteId
	): Promise<{ readonly projectId: ProjectId } | undefined>;
}

interface MemoryChangeApplier {
	apply(
		actor: ActorContext,
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>>;
}
interface DrawioContent {
	validate(source: string): string;
	extract(source: string): string;
}

export type SuggestionArtifact =
	Todo | NoteRelationship | ExternalReference | Diagram | MemoryEntry;

export interface SuggestionApplicationResult {
	readonly artifact: SuggestionArtifact;
	readonly changes: readonly AppliedChange<AppliedRecord>[];
}

export interface ISuggestionApplication {
	apply(actor: ActorContext, suggestion: Suggestion): Promise<SuggestionApplicationResult>;
}

export class SuggestionApplication implements ISuggestionApplication {
	constructor(
		private readonly todoCreator: TodoCreator,
		private readonly relationshipCreator: RelationshipCreator,
		private readonly referenceCreator: ReferenceCreator,
		private readonly diagramWriter: DiagramWriter,
		private readonly memoryChangeApplier: MemoryChangeApplier,
		private readonly drawioValidator: Pick<DrawioContent, 'validate'>,
		private readonly drawioLabels: Pick<DrawioContent, 'extract'>,
		private readonly diagramProjects: DiagramProjectResolver
	) {}

	async apply(actor: ActorContext, suggestion: Suggestion): Promise<SuggestionApplicationResult> {
		switch (suggestion.kind) {
			case 'todo': {
				const artifact = await this.todoCreator.create(actor, suggestion.payload);
				return {
					artifact,
					changes: [{ kind: 'created', after: { type: 'todos', value: artifact } }]
				};
			}
			case 'backlink': {
				const change = await this.relationshipCreator.createWithChange(actor, suggestion.payload);
				return {
					artifact: change.after,
					changes: [
						mapAppliedChange(change, (value) => ({ type: 'note_relationships' as const, value }))
					]
				};
			}
			case 'reference': {
				const artifact = await this.referenceCreator.create(actor, suggestion.payload);
				return {
					artifact,
					changes: [{ kind: 'created', after: { type: 'references', value: artifact } }]
				};
			}
			case 'diagram': {
				const source =
					suggestion.payload.kind === 'drawio'
						? this.drawioValidator.validate(suggestion.payload.source)
						: suggestion.payload.source;
				const now = new Date().toISOString() as Diagram['createdAt'];
				const note = await this.diagramProjects.findById(actor, suggestion.payload.noteId);
				if (!note) throw new NotFoundError('Diagram note was not found');
				const base = {
					id: crypto.randomUUID() as Diagram['id'],
					userId: actor.userId,
					projectId: note.projectId,
					sourceNoteId: suggestion.payload.noteId,
					title: suggestion.payload.title,
					source,
					searchableText:
						suggestion.payload.kind === 'drawio' ? this.drawioLabels.extract(source) : source,
					sourceAnchorId: suggestion.sourceAnchorId,
					provenanceId: suggestion.provenanceId,
					createdAt: now,
					updatedAt: now
				};
				const diagram: Diagram =
					suggestion.payload.kind === 'mermaid'
						? { ...base, kind: 'mermaid' }
						: {
								...base,
								kind: 'drawio',
								currentRevision: 1,
								publishedRevision: 0
							};
				const artifact = await this.diagramWriter.create(actor, diagram);
				return {
					artifact,
					changes: [{ kind: 'created', after: { type: 'diagrams', value: artifact } }]
				};
			}
			case 'memory': {
				const result = await this.memoryChangeApplier.apply(
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
}
