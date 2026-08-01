import type { ActorContext } from '$lib/models/identity';
import type { Diagram, DiagramId } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
export interface DiagramRepository {
	findById(actor: ActorContext, id: DiagramId): Promise<Diagram | undefined>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]>;
	listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Diagram[]>;
	insert(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	update(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	delete(actor: ActorContext, id: DiagramId): Promise<void>;
}
