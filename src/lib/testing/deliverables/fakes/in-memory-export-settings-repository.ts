import type { ActorContext, UserId } from '$lib/models/identity';
import type { ExportSettings } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';
import type { ExportSettingsRepository } from '$lib/server/repositories/deliverables';

export class InMemoryExportSettingsRepository implements ExportSettingsRepository {
	constructor(private readonly actor: ActorContext) {}
	rows: { userId: UserId; projectId: ProjectId; settings: ExportSettings }[] = [];

	async find(projectId: ProjectId): Promise<ExportSettings | undefined> {
		return this.rows.find((row) => row.userId === this.actor.userId && row.projectId === projectId)
			?.settings;
	}

	async upsert(projectId: ProjectId, settings: ExportSettings): Promise<ExportSettings> {
		this.rows = [
			...this.rows.filter((row) => row.userId !== this.actor.userId || row.projectId !== projectId),
			{ userId: this.actor.userId, projectId, settings }
		];
		return settings;
	}
}
