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
import { NotFoundError, ValidationError } from '$lib/errors';
import type {
	ArtifactRepository,
	ExportSettingsRepository
} from '$lib/server/repositories/deliverables';

export const mediaTypeFor = (format: 'docx' | 'pdf'): string =>
	format === 'docx'
		? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		: 'application/pdf';

export const safeFilename = (title: string, extension: string): string =>
	`${title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'document'}.${extension}`;

export const validateSettings: (settings: ExportSettings) => ExportSettings = (
	settings: ExportSettings
): ExportSettings => {
	if (!['helvetica', 'times', 'courier'].includes(settings.fontFamily))
		throw new ValidationError('Unknown export font family');
	const within = (value: number, minimum: number, maximum: number): boolean =>
		Number.isFinite(value) && value >= minimum && value <= maximum;
	if (!within(settings.fontSize, 8, 18))
		throw new ValidationError('Export font size must be between 8 and 18 points');
	if (!within(settings.lineHeight, 1, 2.2))
		throw new ValidationError('Export line height must be between 1 and 2.2');
	if (!within(settings.margin, 18, 144))
		throw new ValidationError('Export margin must be between 18 and 144 points');
	return {
		fontFamily: settings.fontFamily,
		fontSize: settings.fontSize,
		lineHeight: settings.lineHeight,
		margin: settings.margin,
		...(settings.includeTitle === undefined ? {} : { includeTitle: settings.includeTitle }),
		...(settings.diagramTheme === undefined ? {} : { diagramTheme: settings.diagramTheme })
	};
};

export class ArtifactLibrary {
	constructor(
		private readonly artifactRepo: ArtifactRepository,
		private readonly settingsRepo: ExportSettingsRepository
	) {}

	store(actor: ActorContext, artifact: Artifact): Promise<Artifact> {
		return this.artifactRepo.insert(actor, artifact);
	}

	async getSettings(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings> {
		return (await this.settingsRepo.find(actor, projectId)) ?? defaultExportSettings;
	}

	async updateSettings(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings> {
		return this.settingsRepo.upsert(actor, projectId, validateSettings(settings));
	}

	async list(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput> {
		return this.artifactRepo.listByProject(actor, projectId, params);
	}

	async get(actor: ActorContext, artifactId: ArtifactId): Promise<Artifact | undefined> {
		return this.artifactRepo.findById(actor, artifactId);
	}

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
