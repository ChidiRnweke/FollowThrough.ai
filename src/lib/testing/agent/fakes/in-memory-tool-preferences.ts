import type { ActorContext, UserId } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type {
	StoredToolPreference,
	ToolPreferenceRepository
} from '$lib/server/repositories/agent';

interface Row extends StoredToolPreference {
	userId: UserId;
	projectId?: ProjectId;
}

export class InMemoryToolPreferenceRepository implements ToolPreferenceRepository {
	constructor(private readonly actor: ActorContext) {}
	rows: Row[] = [];

	async listForUser(): Promise<readonly StoredToolPreference[]> {
		return this.rows
			.filter((row) => row.userId === this.actor.userId && row.projectId === undefined)
			.map(({ toolName, enabled }) => ({ toolName, enabled }));
	}

	async listForProject(projectId: ProjectId): Promise<readonly StoredToolPreference[]> {
		return this.rows
			.filter((row) => row.userId === this.actor.userId && row.projectId === projectId)
			.map(({ toolName, enabled }) => ({ toolName, enabled }));
	}

	async upsertForUser(preference: StoredToolPreference): Promise<void> {
		this.replace({ userId: this.actor.userId, ...preference });
	}

	async upsertForProject(projectId: ProjectId, preference: StoredToolPreference): Promise<void> {
		this.replace({ userId: this.actor.userId, projectId, ...preference });
	}

	async deleteProjectOverride(projectId: ProjectId, toolName: string): Promise<void> {
		this.rows = this.rows.filter(
			(row) =>
				row.userId !== this.actor.userId || row.projectId !== projectId || row.toolName !== toolName
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
