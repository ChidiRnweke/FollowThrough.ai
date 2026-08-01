import type { ActorContext } from '$lib/models/identity';
import type {
	Artifact,
	ArtifactId,
	ListArtifactsOutput,
	ListArtifactsParams
} from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';

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
