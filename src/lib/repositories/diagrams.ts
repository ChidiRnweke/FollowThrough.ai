import type { ActorContext, Diagram, DiagramId, NoteId, ProjectId } from '../models';
export interface DiagramRepository {
	findById(actor: ActorContext, id: DiagramId): Promise<Diagram | undefined>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]>;
	listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Diagram[]>;
	insert(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	update(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	delete(actor: ActorContext, id: DiagramId): Promise<void>;
}
