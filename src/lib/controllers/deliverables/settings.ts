import {
	defaultExportSettings,
	type ExportSettings,
	type ExportSettingsLoad
} from '$lib/models/deliverables';
import type { DateTime } from '$lib/models/workspace';
import type { UserId } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type {
	WorkspaceSession,
	WorkspaceSessionController
} from '$lib/controllers/workspace/session';
import type { ExportSettingsStore } from '$lib/stores/deliverables/settings.svelte';
export type ExportSettingsSave =
	| { readonly kind: 'saved' | 'superseded' }
	| { readonly kind: 'failure'; readonly message: string };
export interface ProjectExportSettingsController {
	readonly ready: boolean;
	readonly busy: boolean;
	open(projectId: string): Promise<ExportSettingsLoad>;
	save(settings: ExportSettings): Promise<ExportSettingsSave>;
	close(): void;
}
export class ProjectExportSettings implements ProjectExportSettingsController {
	constructor(
		private readonly state: ExportSettingsStore,
		private readonly workspace: WorkspaceSessionController
	) {}
	get ready(): boolean {
		return this.state.binding !== null;
	}
	get busy(): boolean {
		return this.state.busy;
	}
	private current(generation: number, session: WorkspaceSession): boolean {
		return (
			generation === this.state.generation &&
			session.resources.active &&
			this.workspace.current === session
		);
	}
	async open(projectId: string): Promise<ExportSettingsLoad> {
		this.state.clear();
		const generation = this.state.generation;
		let session: WorkspaceSession | undefined;
		try {
			session = await this.workspace.start();
			if (!this.current(generation, session)) return { kind: 'superseded' };
			const draft = session.resources.draft({
				type: 'export_settings',
				id: [session.bootstrap.accountId, projectId]
			});
			const timestamp = new Date().toISOString() as DateTime;
			const opened = await draft.readOrCreate({
				type: 'export_settings',
				value: {
					userId: session.bootstrap.accountId as UserId,
					projectId: projectId as ProjectId,
					settings: { ...defaultExportSettings },
					createdAt: timestamp,
					updatedAt: timestamp
				}
			});
			if (!this.current(generation, session)) return { kind: 'superseded' };
			if (opened.kind !== 'ready')
				throw new Error(draft.lastError ?? 'The export defaults are unavailable');
			this.state.bind({ session, draft });
			return { kind: 'ready', settings: { ...defaultExportSettings, ...opened.value.settings } };
		} catch (error) {
			if (generation !== this.state.generation || (session && !this.current(generation, session)))
				return { kind: 'superseded' };
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Export defaults could not be loaded'
			};
		}
	}
	async save(settings: ExportSettings): Promise<ExportSettingsSave> {
		const binding = this.state.binding;
		if (!binding || this.busy) return { kind: 'superseded' };
		const generation = this.state.generation;
		if (!this.current(generation, binding.session)) return { kind: 'superseded' };
		const value = binding.draft.value;
		if (!value) return { kind: 'failure', message: 'The export defaults are unavailable' };
		this.state.setBusy(true);
		try {
			const result = await binding.draft.stage({
				kind: 'updateExportSettings',
				userId: value.userId,
				projectId: value.projectId,
				settings: { ...settings }
			});
			if (!this.current(generation, binding.session)) return { kind: 'superseded' };
			if (result.kind === 'failure') throw new Error(result.message);
			return { kind: 'saved' };
		} catch {
			if (!this.current(generation, binding.session)) return { kind: 'superseded' };
			return { kind: 'failure', message: 'Could not save the export defaults.' };
		} finally {
			if (generation === this.state.generation) this.state.setBusy(false);
		}
	}
	close(): void {
		this.state.clear();
	}
}
