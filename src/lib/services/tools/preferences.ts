import type { ActorContext, ProjectId, ToolClassification, ToolPreference } from '$lib/models';
import { ValidationError } from '$lib/models';
import type { ToolPreferenceRepository } from '$lib/repositories';

/** One tool's identity, as published by whatever owns the tool definitions. */
export interface ToolCatalogEntry {
	readonly name: string;
	readonly description: string;
	readonly classification: ToolClassification;
	/** Locked tools are always enabled and cannot be stored as disabled. */
	readonly locked: boolean;
}

/**
 * Injected rather than imported so this module stays free of the agent registry
 * — the registry pulls in the whole controller surface, and the settings page
 * only needs names and descriptions.
 */
export interface ToolCatalog {
	entries(): readonly ToolCatalogEntry[];
}

/** The resolved selection, shaped for `AgentToolRegistry`'s filter. */
export interface ResolvedToolAccess {
	isEnabled(toolName: string): boolean;
}

export interface ToolPreferenceStore {
	/** The full catalog with each tool's resolved state, for the settings UI. */
	view(actor: ActorContext, projectId?: ProjectId): Promise<readonly ToolPreference[]>;
	/** The same resolution collapsed to a predicate, for an agent turn. */
	resolve(actor: ActorContext, projectId?: ProjectId): Promise<ResolvedToolAccess>;
	setEnabled(
		actor: ActorContext,
		input: { toolName: string; enabled: boolean; projectId?: ProjectId }
	): Promise<void>;
	clearOverride(actor: ActorContext, projectId: ProjectId, toolName: string): Promise<void>;
}

const byName = (rows: readonly { toolName: string; enabled: boolean }[]) =>
	new Map(rows.map((row) => [row.toolName, row.enabled]));

export class PersistentToolPreferenceStore implements ToolPreferenceStore {
	constructor(
		private readonly repository: ToolPreferenceRepository,
		private readonly catalog: ToolCatalog
	) {}

	async view(actor: ActorContext, projectId?: ProjectId): Promise<readonly ToolPreference[]> {
		const { user, project } = await this.storedRows(actor, projectId);
		return this.catalog.entries().map((entry) => {
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

	async resolve(actor: ActorContext, projectId?: ProjectId): Promise<ResolvedToolAccess> {
		const view = await this.view(actor, projectId);
		const disabled = new Set(
			view.filter((preference) => !preference.enabled).map((preference) => preference.name)
		);
		// Unknown names resolve to enabled: a tool the user never touched, and a
		// tool added since these rows were written, are the same case.
		return { isEnabled: (toolName: string) => !disabled.has(toolName) };
	}

	async setEnabled(
		actor: ActorContext,
		input: { toolName: string; enabled: boolean; projectId?: ProjectId }
	): Promise<void> {
		this.assertSelectable(input.toolName);
		const preference = { toolName: input.toolName, enabled: input.enabled };
		if (input.projectId) await this.repository.upsertForProject(actor, input.projectId, preference);
		else await this.repository.upsertForUser(actor, preference);
	}

	async clearOverride(actor: ActorContext, projectId: ProjectId, toolName: string): Promise<void> {
		this.assertSelectable(toolName);
		await this.repository.deleteProjectOverride(actor, projectId, toolName);
	}

	/**
	 * Guards the write path rather than the UI, so the agent's own
	 * `set_tool_enabled` is held to the same rules as the settings page.
	 */
	private assertSelectable(toolName: string): void {
		const entry = this.catalog.entries().find((candidate) => candidate.name === toolName);
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
		entry: ToolCatalogEntry,
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
