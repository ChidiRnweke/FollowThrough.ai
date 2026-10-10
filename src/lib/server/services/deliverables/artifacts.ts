import type { ActorContext } from '$lib/models/identity';
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
export interface ArtifactWriter {
	store(actor: ActorContext, artifact: Artifact): Promise<Artifact>;
}

export class ArtifactWritingService implements ArtifactWriter {
	constructor(private readonly artifactRepo: ArtifactRepository) {}
	store(actor: ActorContext, artifact: Artifact): Promise<Artifact> {
		return this.artifactRepo.insert(actor, artifact);
	}
}

export class ArtifactReadingService implements ArtifactReader, ArtifactLister {
	constructor(private readonly artifactRepo: ArtifactRepository) {}
	async get(actor: ActorContext, artifactId: ArtifactId): Promise<Artifact | undefined> {
		return this.artifactRepo.findById(actor, artifactId);
	}
	async list(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput> {
		return this.artifactRepo.listByProject(actor, projectId, params);
	}
}

export class ArtifactLifecycleService implements ArtifactDeleter {
	constructor(private readonly artifactRepo: ArtifactRepository) {}
	async delete(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<Pick<Artifact, 'id' | 'title'>> {
		const artifact = await this.artifactRepo.findById(actor, artifactId);
		if (!artifact) throw new NotFoundError('Artifact not found');
		await this.artifactRepo.delete(actor, artifactId);
		return { id: artifact.id, title: artifact.title };
	}
}

export class ArtifactSettingsService implements ExportSettingsReader, ExportSettingsWriter {
	constructor(private readonly settingsRepo: ExportSettingsRepository) {}
	async getSettings(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings> {
		return (await this.settingsRepo.find(actor, projectId)) ?? defaultExportSettings;
	}
	async updateSettings(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings> {
		return this.settingsRepo.upsert(actor, projectId, settings);
	}
}
