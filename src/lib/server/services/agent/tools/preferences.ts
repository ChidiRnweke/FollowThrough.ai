import type { ResolvedToolCatalogEntry } from '$lib/models/agent/tool-catalog';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { ToolPreference } from '$lib/models/agent';
import { ValidationError } from '$lib/errors';
import type { ToolPreferenceRepository } from '$lib/server/repositories/agent';

export interface ToolPreferenceCapability {
	/** The full catalog with each tool's resolved state, for the settings UI. */
	view(
		actor: ActorContext,
		catalog: readonly ResolvedToolCatalogEntry[],
		projectId?: ProjectId
	): Promise<readonly ToolPreference[]>;
	setEnabled(
		actor: ActorContext,
		catalog: readonly ResolvedToolCatalogEntry[],
		input: { toolName: string; enabled: boolean; projectId?: ProjectId }
	): Promise<void>;
	clearOverride(
		actor: ActorContext,
		catalog: readonly ResolvedToolCatalogEntry[],
		projectId: ProjectId,
		toolName: string
	): Promise<void>;
}

const byName = (rows: readonly { toolName: string; enabled: boolean }[]) =>
	new Map(rows.map((row) => [row.toolName, row.enabled]));

export class ToolAccess implements ToolPreferenceCapability {
	constructor(private readonly repository: ToolPreferenceRepository) {}

	async view(
		actor: ActorContext,
		catalog: readonly ResolvedToolCatalogEntry[],
		projectId?: ProjectId
	): Promise<readonly ToolPreference[]> {
		const { user, project } = await this.storedRows(actor, projectId);
		return catalog.map((entry) => {
			const { enabled, source } = this.resolveEntry(entry, user, project);
			return {
				name: entry.name,
				description: entry.description,
				classification: entry.classification,
				enabled,
				locked: entry.locked,
				source
			};
		});
	}

	async setEnabled(
		actor: ActorContext,
		catalog: readonly ResolvedToolCatalogEntry[],
		input: { toolName: string; enabled: boolean; projectId?: ProjectId }
	): Promise<void> {
		this.assertSelectable(catalog, input.toolName);
		const preference = { toolName: input.toolName, enabled: input.enabled };
		if (input.projectId) await this.repository.upsertForProject(actor, input.projectId, preference);
		else await this.repository.upsertForUser(actor, preference);
	}

	async clearOverride(
		actor: ActorContext,
		catalog: readonly ResolvedToolCatalogEntry[],
		projectId: ProjectId,
		toolName: string
	): Promise<void> {
		this.assertSelectable(catalog, toolName);
		await this.repository.deleteProjectOverride(actor, projectId, toolName);
	}

	/**
	 * Guards the write path rather than the UI, so the agent's own
	 * `set_tool_enabled` is held to the same rules as the settings page.
	 */
	private assertSelectable(catalog: readonly ResolvedToolCatalogEntry[], toolName: string): void {
		const entry = catalog.find((candidate) => candidate.name === toolName);
		if (!entry) throw new ValidationError(`There is no tool named "${toolName}"`);
		if (entry.locked)
			throw new ValidationError(
				`"${toolName}" is always available and cannot be turned off — the agent depends on it to work at all.`
			);
	}

	private async storedRows(actor: ActorContext, projectId?: ProjectId) {
		const user = byName(await this.repository.listForUser(actor));
		const project = projectId
			? byName(await this.repository.listForProject(actor, projectId))
			: new Map<string, boolean>();
		return { user, project };
	}

	private resolveEntry(
		entry: ResolvedToolCatalogEntry,
		user: ReadonlyMap<string, boolean>,
		project: ReadonlyMap<string, boolean>
	): { enabled: boolean; source: ToolPreference['source'] } {
		if (entry.locked) return { enabled: true, source: 'default' };
		const override = project.get(entry.name);
		if (override !== undefined) return { enabled: override, source: 'project' };
		const preference = user.get(entry.name);
		if (preference !== undefined) return { enabled: preference, source: 'user' };
		return { enabled: true, source: 'default' };
	}
}
