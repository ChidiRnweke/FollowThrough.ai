import { z } from 'zod';
import { stringify } from 'yaml';
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

export type SkillUsageId = Brand<string, 'SkillUsageId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type DateTime = Brand<string, 'DateTime'>;

interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly ProseMirrorNodeView[];
}
interface ProseMirrorNodeView {
	readonly type: string;
	readonly text?: string;
	readonly content?: readonly ProseMirrorNodeView[];
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

/** A skill is a note plus metadata: the instruction text lives in `note`, everything the agent uses to decide whether to load it lives alongside it. */
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

/**
 * The stored `skills.metadata` column, read rather than handed out.
 *
 * A genuine open-keyed map of strings — the frontmatter keys a skill author
 * chose — so `Record<string, string>` is the honest type and this schema only
 * has to prove the values really are strings. It was reaching the domain
 * through the mapper's blanket `domain<T>` cast with nothing checking it.
 */
export const skillMetadataSchema = z.record(z.string(), z.string());

/** The portable SKILL.md form: YAML frontmatter plus an instruction body, used for import/export. */
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

/** Recorded every time the agent loads a skill's full instructions, so "which skills actually get used" is answerable later. Reads via `get_skill` don't create one. */
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
	readonly id?: NoteId;
	readonly name: string;
	readonly description?: string;
	readonly triggerHints?: readonly string[];
	/** Required for the reason `CreateNoteInput.projectId` is: a skill is a note, and no default can honestly say where it belongs. */
	readonly projectId: ProjectId;
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

/** Portable text is derived from the current instruction body and metadata, on either side. */
export const serializeSkillManifest = (manifest: SkillManifest): string => {
	const header = stringify(
		{
			name: manifest.slug,
			description: manifest.description,
			...(manifest.license ? { license: manifest.license } : {}),
			...(manifest.compatibility ? { compatibility: manifest.compatibility } : {}),
			metadata: {
				...manifest.metadata,
				...(manifest.allowImplicitInvocation
					? {}
					: { 'followthrough.allow-implicit-invocation': 'false' })
			}
		},
		{ lineWidth: 0 }
	).trimEnd();
	return `---\n${header}\n---\n\n${manifest.instructions.trimEnd()}\n`;
};
