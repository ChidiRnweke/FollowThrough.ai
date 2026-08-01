type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

export type SkillUsageId = Brand<string, 'SkillUsageId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type DateTime = Brand<string, 'DateTime'>;

interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly Record<string, unknown>[];
}

interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

type NoteKind = 'folder' | 'note' | 'skill';

interface Note {
	readonly id: NoteId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly parentId?: NoteId;
	readonly kind: NoteKind;
	readonly position: number;
	readonly title: string;
	readonly builtInKey?: string;
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
	readonly currentRevision: number;
	readonly publishedRevision: number;
	readonly isPinned: boolean;
	readonly publishedAt?: DateTime;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface Skill {
	readonly note: Note;
	readonly name: string;
	readonly slug?: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
	readonly license?: string;
	readonly compatibility?: string;
	readonly metadata?: Readonly<Record<string, string>>;
	readonly allowImplicitInvocation?: boolean;
	readonly isEnabled: boolean;
}

export interface SkillManifest {
	readonly slug: string;
	readonly description: string;
	readonly license?: string;
	readonly compatibility?: string;
	readonly metadata: Readonly<Record<string, string>>;
	readonly allowImplicitInvocation: boolean;
	readonly instructions: string;
}

export type SkillSummary = Pick<
	Skill,
	'name' | 'slug' | 'description' | 'triggerHints' | 'allowImplicitInvocation' | 'isEnabled'
> & {
	readonly noteId: NoteId;
	readonly projectId?: ProjectId;
	readonly isPinned?: boolean;
};

export interface SkillUsage {
	readonly id: SkillUsageId;
	readonly skillNoteId: NoteId;
	readonly contextNoteId?: NoteId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
}

export interface RestoreSkillVersionInput {
	readonly noteId: NoteId;
	readonly revision: number;
}

export interface LoadSkillInput {
	readonly noteId: NoteId;
	readonly contextNoteId?: NoteId;
	readonly provenanceId: ProvenanceId;
}

export interface CreateSkillFromSelectionInput {
	readonly selection: TextSelection;
	readonly name: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
}

export interface CreateSkillFromSelectionOutput {
	readonly skillNoteId: NoteId;
}

export interface CreateSkillInput {
	readonly name: string;
	readonly description?: string;
	readonly triggerHints?: readonly string[];
	readonly projectId?: ProjectId;
	readonly parentId?: NoteId;
}

export interface CreateSkillOutput {
	readonly skill: Skill;
}

type NoteRef = Pick<Note, 'id' | 'title'>;

export interface SkillUsageView {
	readonly usage: SkillUsage;
	readonly contextNote?: NoteRef;
}

export interface SkillView {
	readonly skill: Skill;
	readonly usages: readonly SkillUsageView[];
}

export interface ListSkillsOutput {
	readonly skills: readonly SkillSummary[];
}

export interface GetSkillViewInput {
	readonly noteId: NoteId;
}
