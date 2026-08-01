import type { ActorContext } from '$lib/models/identity';
import type { Note, NoteId, NoteRevision, TextSelection } from '$lib/models/notes';
import type { ProvenanceId } from '$lib/models/provenance';
import type { ProjectId } from '$lib/models/projects';
import type { Skill, SkillSummary, SkillUsageView, SkillManifest } from '$lib/models/skills';

export interface SkillCreator {
	create(
		actor: ActorContext,
		note: Note,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill>;
	createFromSelection(
		actor: ActorContext,
		selection: TextSelection,
		input: {
			name: string;
			description: string;
			triggerHints: readonly string[];
			provenanceId: ProvenanceId;
		}
	): Promise<Skill>;
}
export interface SkillFinder {
	listEnabled(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]>;
	listAll(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]>;
	load(actor: ActorContext, noteId: NoteId): Promise<Skill>;
}

export interface SkillEditor {
	update(
		actor: ActorContext,
		input: {
			noteId: NoteId;
			displayName?: string;
			description?: string;
			raw?: string;
			manifest?: SkillManifest;
			triggerHints?: readonly string[];
			isEnabled?: boolean;
		}
	): Promise<Skill>;
	serialize(actor: ActorContext, noteId: NoteId): Promise<string>;
	setPinned(
		actor: ActorContext,
		noteId: NoteId,
		projectId: ProjectId,
		pinned: boolean
	): Promise<void>;
}
export interface SkillUsageRecorder {
	record(
		actor: ActorContext,
		input: { skillNoteId: NoteId; contextNoteId?: NoteId; provenanceId: ProvenanceId }
	): Promise<void>;
}
export interface SkillUsageLister {
	list(actor: ActorContext, skillNoteId: NoteId): Promise<readonly SkillUsageView[]>;
}
export interface SkillVersionManager {
	listVersions(actor: ActorContext, skillNoteId: NoteId): Promise<readonly NoteRevision[]>;
	restoreVersion(actor: ActorContext, skillNoteId: NoteId, revision: number): Promise<Skill>;
}
export interface BuiltInSkillProvisioner {
	ensure(actor: ActorContext): Promise<void>;
	load(actor: ActorContext, key: string): Promise<Skill>;
}
