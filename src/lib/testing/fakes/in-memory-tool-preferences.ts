import type { ActorContext, ProjectId, UserId } from '$lib/models';
import type { StoredToolPreference, ToolPreferenceRepository } from '$lib/repositories';

interface Row extends StoredToolPreference {
	userId: UserId;
	projectId?: ProjectId;
}

export class InMemoryToolPreferenceRepository implements ToolPreferenceRepository {
	rows: Row[] = [];

	async listForUser(actor: ActorContext): Promise<readonly StoredToolPreference[]> {
		return this.rows
			.filter((row) => row.userId === actor.userId && row.projectId === undefined)
			.map(({ toolName, enabled }) => ({ toolName, enabled }));
	}

	async listForProject(
		actor: ActorContext,
		projectId: ProjectId
	): Promise<readonly StoredToolPreference[]> {
		return this.rows
			.filter((row) => row.userId === actor.userId && row.projectId === projectId)
			.map(({ toolName, enabled }) => ({ toolName, enabled }));
	}

	async upsertForUser(actor: ActorContext, preference: StoredToolPreference): Promise<void> {
		this.replace({ userId: actor.userId, ...preference });
	}

	async upsertForProject(
		actor: ActorContext,
		projectId: ProjectId,
		preference: StoredToolPreference
	): Promise<void> {
		this.replace({ userId: actor.userId, projectId, ...preference });
	}

	async deleteProjectOverride(
		actor: ActorContext,
		projectId: ProjectId,
		toolName: string
	): Promise<void> {
		this.rows = this.rows.filter(
			(row) =>
				row.userId !== actor.userId || row.projectId !== projectId || row.toolName !== toolName
		);
	}

	private replace(row: Row): void {
		this.rows = [
			...this.rows.filter(
				(existing) =>
					existing.userId !== row.userId ||
					existing.projectId !== row.projectId ||
					existing.toolName !== row.toolName
			),
			row
		];
	}
}
