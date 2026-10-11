import type { ActorContext } from '$lib/models/identity';
import type {
	Artifact,
	ArtifactId,
	ListArtifactsOutput,
	ListArtifactsParams
} from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';

/** Generated documents. Deleting an artifact removes the record only; the underlying object-storage cleanup happens at the service layer. */
export interface ArtifactRepository {
	insert(artifact: Artifact): Promise<Artifact>;
	listByProject(projectId: ProjectId, params?: ListArtifactsParams): Promise<ListArtifactsOutput>;
	findById(id: ArtifactId): Promise<Artifact | undefined>;
	delete(id: ArtifactId): Promise<void>;
}
