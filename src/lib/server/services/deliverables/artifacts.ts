import type {
	Artifact,
	ArtifactId,
	ExportSettings,
	ListArtifactsOutput,
	ListArtifactsParams
} from '$lib/models/deliverables';
import { defaultExportSettings } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';
import { NotFoundError } from '$lib/errors';
import type {
	ArtifactRepository,
	ExportSettingsRepository
} from '$lib/server/repositories/deliverables';

export interface ArtifactLister {
	list(projectId: ProjectId, params?: ListArtifactsParams): Promise<ListArtifactsOutput>;
}
export interface ArtifactReader {
	get(artifactId: ArtifactId): Promise<Artifact | undefined>;
}
export interface ArtifactDeleter {
	delete(artifactId: ArtifactId): Promise<Pick<Artifact, 'id' | 'title'>>;
}
export interface ExportSettingsReader {
	getSettings(projectId: ProjectId): Promise<ExportSettings>;
}
export interface ExportSettingsWriter {
	updateSettings(projectId: ProjectId, settings: ExportSettings): Promise<ExportSettings>;
}
export interface ArtifactWriter {
	store(artifact: Artifact): Promise<Artifact>;
}

/** Everything the deliverables controller does with stored artifacts. */
export interface ArtifactStore
	extends ArtifactWriter, ArtifactReader, ArtifactLister, ArtifactDeleter {}
export interface ExportSettingsStore extends ExportSettingsReader, ExportSettingsWriter {}

export class ArtifactLibrary implements ArtifactStore {
	constructor(private readonly artifactRepo: ArtifactRepository) {}
	store(artifact: Artifact): Promise<Artifact> {
		return this.artifactRepo.insert(artifact);
	}
	get(artifactId: ArtifactId): Promise<Artifact | undefined> {
		return this.artifactRepo.findById(artifactId);
	}
	list(projectId: ProjectId, params?: ListArtifactsParams): Promise<ListArtifactsOutput> {
		return this.artifactRepo.listByProject(projectId, params);
	}
	async delete(artifactId: ArtifactId): Promise<Pick<Artifact, 'id' | 'title'>> {
		const artifact = await this.artifactRepo.findById(artifactId);
		if (!artifact) throw new NotFoundError('Artifact not found');
		await this.artifactRepo.delete(artifactId);
		return { id: artifact.id, title: artifact.title };
	}
}

export class ArtifactSettingsService implements ExportSettingsStore {
	constructor(private readonly settingsRepo: ExportSettingsRepository) {}
	async getSettings(projectId: ProjectId): Promise<ExportSettings> {
		return (await this.settingsRepo.find(projectId)) ?? defaultExportSettings;
	}
	updateSettings(projectId: ProjectId, settings: ExportSettings): Promise<ExportSettings> {
		return this.settingsRepo.upsert(projectId, settings);
	}
}
