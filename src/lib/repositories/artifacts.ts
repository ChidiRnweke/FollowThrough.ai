import type {
	ActorContext,
	Artifact,
	ArtifactId,
	ListArtifactsOutput,
	ListArtifactsParams,
	ProjectId
} from '../models';

export interface ArtifactRepository {
	insert(actor: ActorContext, artifact: Artifact): Promise<Artifact>;
	listByProject(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput>;
	findById(actor: ActorContext, id: ArtifactId): Promise<Artifact | undefined>;
	delete(actor: ActorContext, id: ArtifactId): Promise<void>;
}
