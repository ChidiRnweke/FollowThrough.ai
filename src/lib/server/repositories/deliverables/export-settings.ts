import type { ActorContext } from '$lib/models/identity';
import type { ExportSettings } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';

/** One row per project: font, margins, and diagram theme applied to every document that project exports. Absent means the app's defaults apply. */
export interface ExportSettingsRepository {
	find(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings | undefined>;
	upsert(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings>;
}
