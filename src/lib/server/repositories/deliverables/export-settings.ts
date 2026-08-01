import type { ActorContext } from '$lib/models/identity';
import type { ExportSettings } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';

export interface ExportSettingsRepository {
	find(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings | undefined>;
	upsert(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings>;
}
