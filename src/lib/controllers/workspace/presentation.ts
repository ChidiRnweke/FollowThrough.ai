import { type SidebarConstraints } from '$lib/models/workspace';
import type { SyncIndicatorInput } from '$lib/models/sync';
import type { Provenance, ProvenanceOrigin } from '$lib/models/provenance';

import type { CacheAccess } from '$lib/models/sync';

import { type Note } from '$lib/models/notes';

import { type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { AccountPresentation } from '$lib/services/workspace/initials';
import type { SidebarSizing } from '$lib/services/workspace/sidebar-width';
import type { SyncPresentation } from '$lib/services/sync/indicator';
import type { ProvenancePresentation } from '$lib/services/provenance/presentation';
import type { SyncResourceRules } from '$lib/services/sync/state';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

export interface WorkspacePresentationController {
	initialsOf(displayName: string): string;
	clampPreferred(width: number): number;
	effectiveSidebarWidth(preferred: number, constraints: SidebarConstraints): number;
	syncIndicator(input: SyncIndicatorInput): {
		kind: 'synced' | 'saving' | 'offline' | 'downloading' | 'attention';
		headline: string;
		description: string;
		badge: number;
	};
	provenanceOrigin(provenance: Provenance): ProvenanceOrigin;
	accessMessage<T>(access: Exclude<CacheAccess<T>, { kind: 'ready' }>, name: string): string;
	workspaceResourceKey(identity: WorkspaceResourceIdentity): string;
	noteHasUnpublishedChanges(note: Note, commands: readonly WorkspaceCommand[]): boolean;
}
export class WorkspacePresentation implements WorkspacePresentationController {
	constructor(
		private readonly accountPresentation: AccountPresentation,
		private readonly sidebarSizing: SidebarSizing,
		private readonly syncPresentation: SyncPresentation,
		private readonly provenancePresentation: ProvenancePresentation,
		private readonly syncResourceRules: SyncResourceRules,
		private readonly workspaceCommandRules: WorkspaceCommandRules
	) {}
	readonly initialsOf = (displayName: string): string =>
		this.accountPresentation.initialsOf(displayName);
	readonly clampPreferred = (width: number): number => this.sidebarSizing.clampPreferred(width);
	readonly effectiveSidebarWidth = (preferred: number, constraints: SidebarConstraints): number =>
		this.sidebarSizing.effectiveSidebarWidth(preferred, constraints);
	readonly syncIndicator = (
		input: SyncIndicatorInput
	): {
		kind: 'synced' | 'saving' | 'offline' | 'downloading' | 'attention';
		headline: string;
		description: string;
		badge: number;
	} => this.syncPresentation.syncIndicator(input);
	readonly provenanceOrigin = (provenance: Provenance): ProvenanceOrigin =>
		this.provenancePresentation.provenanceOrigin(provenance);
	readonly accessMessage = <T>(
		access: Exclude<CacheAccess<T>, { kind: 'ready' }>,
		name: string
	): string => this.syncResourceRules.accessMessage(access, name);
	readonly workspaceResourceKey = (identity: WorkspaceResourceIdentity): string =>
		this.workspaceCommandRules.workspaceResourceKey(identity);
	readonly noteHasUnpublishedChanges = (
		note: Note,
		commands: readonly WorkspaceCommand[]
	): boolean => this.workspaceCommandRules.noteHasUnpublishedChanges(note, commands);
}
