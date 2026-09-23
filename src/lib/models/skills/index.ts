import { z } from 'zod';
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

export type SkillUsageId = Brand<string, 'SkillUsageId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type DateTime = Brand<string, 'DateTime'>;

interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

/** A skill is a note plus metadata: the instruction text lives in `note`, everything the agent uses to decide whether to load it lives alongside it. */
export interface Skill<Document> {
	readonly note: Document;
	readonly slug: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
	readonly license?: string;
	readonly compatibility?: string;
	readonly metadata: Readonly<Record<string, string>>;
	readonly allowImplicitInvocation: boolean;
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

export const SKILL_PORTABLE_LIMITS = { slug: 64, description: 1024, compatibility: 500 } as const;
export const SKILL_PORTABLE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const skillFrontmatterSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(SKILL_PORTABLE_LIMITS.slug)
		.regex(SKILL_PORTABLE_NAME, 'Use lowercase letters, numbers, and single hyphens'),
	description: z.string().trim().min(1).max(SKILL_PORTABLE_LIMITS.description),
	license: z.string().trim().min(1).optional(),
	compatibility: z.string().trim().min(1).max(SKILL_PORTABLE_LIMITS.compatibility).optional(),
	metadata: z.record(z.string(), z.string()).optional()
});

/** Document edits carry the revision the user actually edited. Metadata edits need no body revision. */
export interface SkillEditInput {
	readonly noteId: NoteId;
	readonly displayName?: string;
	readonly description?: string;
	readonly triggerHints?: readonly string[];
	readonly isEnabled?: boolean;
	readonly content?:
		| { readonly kind: 'instructions'; readonly text: string; readonly baseRevision: number }
		| {
				readonly kind: 'manifest';
				readonly manifest: SkillManifest;
				readonly baseRevision: number;
		  };
}

export type SkillSummary = Pick<
	Skill<never>,
	'slug' | 'description' | 'triggerHints' | 'allowImplicitInvocation' | 'isEnabled'
> & {
	readonly name: string;
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

export interface CreateSkillOutput<Document> {
	readonly skill: Skill<Document>;
}

interface NoteRef {
	readonly id: NoteId;
	readonly title: string;
}

export interface SkillUsageView {
	readonly usage: SkillUsage;
	readonly contextNote?: NoteRef;
}

export interface SkillView<Document> {
	readonly skill: Skill<Document>;
	readonly usages: readonly SkillUsageView[];
}

export interface ListSkillsOutput {
	readonly skills: readonly SkillSummary[];
}

export interface GetSkillViewInput {
	readonly noteId: NoteId;
}

/** A document edit includes the portable metadata whose validity its controller must check. */
export type PreparedSkillEdit<Document> =
	| { readonly kind: 'metadata'; readonly skill: Skill<Document> }
	| { readonly kind: 'title'; readonly skill: Skill<Document>; readonly document: Document }
	| {
			readonly kind: 'document';
			readonly skill: Skill<Document>;
			readonly document: Document;
			readonly manifest: SkillManifest;
	  };
