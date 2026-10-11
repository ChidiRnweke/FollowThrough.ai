import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { Note, NoteId } from '$lib/models/notes';
import type { ProvenanceId } from '$lib/models/provenance';
import type { ProjectId } from '$lib/models/projects';
import type {
	Skill,
	SkillEditInput,
	PreparedSkillEdit,
	SkillSummary,
	SkillManifest,
	SkillUsage,
	SkillUsageId,
	SkillUsageView
} from '$lib/models/skills';
import { NotFoundError, ValidationError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProvenanceRepository } from '$lib/server/repositories/provenance/provenance';
import type { SkillRepository } from '$lib/server/repositories/skills/skills';

const now = (): DateTime => new Date().toISOString() as DateTime;
const slug = (value: string): string =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64)
		.replace(/-+$/g, '') || `skill-${crypto.randomUUID().slice(0, 8)}`;

export interface SkillCreator {
	lockCatalog(): Promise<void>;
	create(
		note: Note,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill<Note>>;
}
export interface SkillFinder {
	listEnabled(projectId?: ProjectId): Promise<readonly SkillSummary[]>;
	listAll(projectId?: ProjectId): Promise<readonly SkillSummary[]>;
	load(noteId: NoteId): Promise<Skill<Note>>;
}
export interface SkillEditor {
	lockCatalog(): Promise<void>;
	getForEdit(noteId: NoteId): Promise<Skill<Note>>;
	prepareEdit(
		current: Skill<Note>,
		input: Omit<SkillEditInput, 'noteId'>
	): Promise<PreparedSkillEdit<Note>>;
	commitEdit(skill: Skill<Note>): Promise<Skill<Note>>;
}
export interface SkillUsageRecorder {
	record(input: {
		skillNoteId: NoteId;
		contextNoteId?: NoteId;
		provenanceId: ProvenanceId;
	}): Promise<void>;
}
export interface SkillUsageLister {
	list(skillNoteId: NoteId): Promise<readonly SkillUsageView[]>;
}
async function loadSkill(
	skills: SkillRepository,
	actor: ActorContext,
	noteId: NoteId
): Promise<Skill<Note>> {
	const skill = await skills.findByNoteId(noteId);
	if (!skill || skill.note.archivedAt) throw new NotFoundError('Skill was not found');
	return skill;
}
export class SkillCreationService implements SkillCreator {
	constructor(
		private readonly skills: SkillRepository,
		private readonly notes: NoteRepository
	) {}
	lockCatalog(): Promise<void> {
		return this.skills.lockCatalog();
	}
	async create(
		note: Note,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill<Note>> {
		const owned = await this.notes.findById(note.id);
		if (!owned) throw new NotFoundError('Skill note was not found');
		if (owned.kind !== 'skill') throw new ValidationError('Skill metadata requires a skill note');
		const name = input.name.trim();
		if (!name) throw new ValidationError('Skill name is required');
		const skillSlug = slug(name);
		if ((await this.skills.listAll()).some((skill) => skill.slug === skillSlug))
			throw new ValidationError('A skill with this portable name already exists');
		const description = input.description.trim() || `Reusable instructions for ${name}.`;
		if (description.length > 1024) throw new ValidationError('Skill description is too long');
		return this.skills.insert({
			note: owned,
			slug: skillSlug,
			description,
			triggerHints: input.triggerHints.map((hint) => hint.trim()).filter(Boolean),
			metadata: {},
			allowImplicitInvocation: true,
			isEnabled: true
		});
	}
}
export class SkillReadingService implements SkillFinder {
	constructor(
		private readonly actor: ActorContext,
		private readonly skills: SkillRepository
	) {}
	listEnabled(projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		return this.skills.listEnabled(projectId);
	}
	listAll(projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		return this.skills.listAll(projectId);
	}
	load(noteId: NoteId): Promise<Skill<Note>> {
		return loadSkill(this.skills, this.actor, noteId);
	}
}
export class SkillEditingService implements SkillEditor {
	constructor(
		private readonly actor: ActorContext,
		private readonly skills: SkillRepository,
		private readonly notes: NoteRepository
	) {}
	lockCatalog(): Promise<void> {
		return this.skills.lockCatalog();
	}
	async getForEdit(noteId: NoteId): Promise<Skill<Note>> {
		const note = await this.notes.findForWrite(noteId);
		if (!note) throw new NotFoundError('Skill note was not found');
		if (note.archivedAt) throw new ValidationError('Archived notes cannot be edited');
		if (note.kind !== 'skill') throw new ValidationError('Skill metadata requires a skill note');
		const skill = await this.skills.findForWrite(noteId);
		if (!skill) throw new NotFoundError('Skill was not found');
		return skill;
	}
	async prepareEdit(
		current: Skill<Note>,
		input: Omit<SkillEditInput, 'noteId'>
	): Promise<PreparedSkillEdit<Note>> {
		const displayName =
			input.displayName === undefined ? current.note.title : input.displayName.trim();
		if (!displayName) throw new ValidationError('Skill name is required');
		if (!input.content) {
			return displayName === current.note.title
				? { kind: 'metadata', skill: current }
				: {
						kind: 'title',
						skill: { ...current, note: { ...current.note, title: displayName } }
					};
		}
		const manifest =
			input.content.kind === 'manifest'
				? input.content.manifest
				: {
						...this.portable(current),
						instructions: input.content.text.trimEnd()
					};
		if (
			(await this.skills.listAll()).some(
				(skill) => skill.noteId !== current.note.id && skill.slug === manifest.slug
			)
		)
			throw new ValidationError('A skill with this portable name already exists');
		const instructions = manifest.instructions;
		const note: Note = {
			...current.note,
			title: displayName,
			document: {
				type: 'doc',
				content: instructions
					? [{ type: 'paragraph', content: [{ type: 'text', text: instructions }] }]
					: [{ type: 'paragraph' }]
			},
			plainText: instructions
		};

		return {
			kind: 'document',
			manifest,
			skill: {
				...current,
				note,
				slug: manifest.slug,
				description: manifest.description,
				license: manifest.license,
				compatibility: manifest.compatibility,
				metadata: manifest.metadata,
				allowImplicitInvocation: manifest.allowImplicitInvocation
			}
		};
	}
	commitEdit(skill: Skill<Note>): Promise<Skill<Note>> {
		return this.skills.update(skill);
	}
	private portable(skill: Skill<Note>): SkillManifest {
		return {
			slug: skill.slug,
			description: skill.description,
			...(skill.license ? { license: skill.license } : {}),
			...(skill.compatibility ? { compatibility: skill.compatibility } : {}),
			metadata: skill.metadata,
			allowImplicitInvocation: skill.allowImplicitInvocation,
			instructions: skill.note.plainText
		};
	}
}
export class SkillUsageService implements SkillUsageRecorder, SkillUsageLister {
	constructor(
		private readonly actor: ActorContext,
		private readonly skills: SkillRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async record(input: {
		skillNoteId: NoteId;
		contextNoteId?: NoteId;
		provenanceId: ProvenanceId;
	}): Promise<void> {
		await loadSkill(this.skills, this.actor, input.skillNoteId);
		if (input.contextNoteId) {
			const context = await this.notes.findById(input.contextNoteId);
			if (!context) throw new NotFoundError('Skill context note was not found');
		}
		if (!(await this.provenance.findById(input.provenanceId)))
			throw new NotFoundError('Skill usage provenance was not found');
		await this.skills.recordUsage({
			id: crypto.randomUUID() as SkillUsageId,
			...input,
			createdAt: now()
		});
	}
	async list(skillNoteId: NoteId): Promise<readonly SkillUsageView[]> {
		await loadSkill(this.skills, this.actor, skillNoteId);
		const usages = await this.skills.listUsages(skillNoteId);
		return Promise.all(
			usages.map(async (usage: SkillUsage) => {
				const context = usage.contextNoteId
					? await this.notes.findById(usage.contextNoteId)
					: undefined;
				return {
					usage,
					...(context ? { contextNote: { id: context.id, title: context.title } } : {})
				};
			})
		);
	}
}
