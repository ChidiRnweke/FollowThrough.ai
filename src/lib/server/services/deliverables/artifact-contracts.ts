import type { ActorContext } from '$lib/models/identity';
import type {
	Artifact,
	ArtifactId,
	ExportSettings,
	ListArtifactsOutput,
	ListArtifactsParams
} from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';

export interface ArtifactLister {
	list(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput>;
}

export interface ArtifactReader {
	get(actor: ActorContext, artifactId: ArtifactId): Promise<Artifact | undefined>;
}

export interface ArtifactDeleter {
	delete(actor: ActorContext, artifactId: ArtifactId): Promise<Pick<Artifact, 'id' | 'title'>>;
}

export interface ExportSettingsReader {
	getSettings(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings>;
}

export interface ExportSettingsWriter {
	updateSettings(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings>;
}
