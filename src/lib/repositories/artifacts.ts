import type { ActorContext, Artifact, ArtifactId, ArtifactView, ProjectId } from '../models';

export interface ArtifactRepository {
	insert(actor: ActorContext, artifact: Artifact): Promise<Artifact>;
	listByProject(actor: ActorContext, projectId: ProjectId): Promise<readonly ArtifactView[]>;
	findById(actor: ActorContext, id: ArtifactId): Promise<Artifact | undefined>;
	delete(actor: ActorContext, id: ArtifactId): Promise<void>;
}
