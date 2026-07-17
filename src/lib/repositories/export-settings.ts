import type { ActorContext, ExportSettings, ProjectId } from '../models';

export interface ExportSettingsRepository {
	find(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings | undefined>;
	upsert(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings>;
}
