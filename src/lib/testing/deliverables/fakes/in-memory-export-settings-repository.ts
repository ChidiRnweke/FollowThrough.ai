import type { ActorContext, UserId } from '$lib/models/identity';
import type { ExportSettings } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';
import type { ExportSettingsRepository } from '$lib/server/repositories/deliverables';

export class InMemoryExportSettingsRepository implements ExportSettingsRepository {
	rows: { userId: UserId; projectId: ProjectId; settings: ExportSettings }[] = [];

	async find(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings | undefined> {
		return this.rows.find((row) => row.userId === actor.userId && row.projectId === projectId)
			?.settings;
	}

	async upsert(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings> {
		this.rows = [
			...this.rows.filter((row) => row.userId !== actor.userId || row.projectId !== projectId),
			{ userId: actor.userId, projectId, settings }
		];
		return settings;
	}
}
