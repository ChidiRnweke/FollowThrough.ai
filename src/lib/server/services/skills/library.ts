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

export class SkillLibrary {
	constructor(
		private readonly skills: SkillRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async create(
		actor: ActorContext,
		note: Note,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill<Note>> {
		const owned = await this.notes.findById(actor, note.id);
		if (!owned) throw new NotFoundError('Skill note was not found');
		if (owned.kind !== 'skill') throw new ValidationError('Skill metadata requires a skill note');
		const name = input.name.trim();
		if (!name) throw new ValidationError('Skill name is required');
		const skillSlug = slug(name);
		if ((await this.skills.listAll(actor)).some((skill) => skill.slug === skillSlug))
			throw new ValidationError('A skill with this portable name already exists');
		const description = input.description.trim() || `Reusable instructions for ${name}.`;
		if (description.length > 1024) throw new ValidationError('Skill description is too long');
		return this.skills.insert(actor, {
			note: owned,
			slug: skillSlug,
			description,
			triggerHints: input.triggerHints.map((hint) => hint.trim()).filter(Boolean),
			metadata: {},
			allowImplicitInvocation: true,
			isEnabled: true
		});
	}
	listEnabled(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		return this.skills.listEnabled(actor, projectId);
	}
	listAll(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		return this.skills.listAll(actor, projectId);
	}
	async load(actor: ActorContext, noteId: NoteId): Promise<Skill<Note>> {
		const skill = await this.skills.findByNoteId(actor, noteId);
		if (!skill) throw new NotFoundError('Skill was not found');
		return skill;
	}
	async record(
		actor: ActorContext,
		input: { skillNoteId: NoteId; contextNoteId?: NoteId; provenanceId: ProvenanceId }
	): Promise<void> {
		await this.load(actor, input.skillNoteId);
		if (input.contextNoteId) {
			const context = await this.notes.findById(actor, input.contextNoteId);
			if (!context) throw new NotFoundError('Skill context note was not found');
		}
		if (!(await this.provenance.findById(actor, input.provenanceId)))
			throw new NotFoundError('Skill usage provenance was not found');
		await this.skills.recordUsage(actor, {
			id: crypto.randomUUID() as SkillUsageId,
			...input,
			createdAt: now()
		});
	}
	async list(actor: ActorContext, skillNoteId: NoteId): Promise<readonly SkillUsageView[]> {
		await this.load(actor, skillNoteId);
		const usages = await this.skills.listUsages(actor, skillNoteId);
		return Promise.all(
			usages.map(async (usage: SkillUsage) => {
				const context = usage.contextNoteId
					? await this.notes.findById(actor, usage.contextNoteId)
					: undefined;
				return {
					usage,
					...(context ? { contextNote: { id: context.id, title: context.title } } : {})
				};
			})
		);
	}

	/** Lock the note before metadata to match provisioning and the title projection trigger. */
	async getForEdit(actor: ActorContext, noteId: NoteId): Promise<Skill<Note>> {
		const note = await this.notes.findForWrite(actor, noteId);
		if (!note) throw new NotFoundError('Skill note was not found');
		if (note.archivedAt) throw new ValidationError('Archived notes cannot be edited');
		if (note.kind !== 'skill') throw new ValidationError('Skill metadata requires a skill note');
		const skill = await this.skills.findForWrite(actor, noteId);
		if (!skill) throw new NotFoundError('Skill was not found');
		return skill;
	}

	async prepareEdit(
		actor: ActorContext,
		current: Skill<Note>,
		input: Omit<SkillEditInput, 'noteId'>
	): Promise<PreparedSkillEdit<Note>> {
		const displayName =
			input.displayName === undefined ? current.note.title : input.displayName.trim();
		if (!displayName) throw new ValidationError('Skill name is required');
		if (!input.content) {
			return displayName === current.note.title
				? { kind: 'metadata', skill: current }
				: { kind: 'title', skill: current, document: { ...current.note, title: displayName } };
		}
		const manifest =
			input.content.kind === 'manifest'
				? input.content.manifest
				: {
						...this.portable(current),
						instructions: input.content.text.trimEnd()
					};
		if (
			(await this.skills.listAll(actor)).some(
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
			document: note,
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

	commitEdit(actor: ActorContext, skill: Skill<Note>): Promise<Skill<Note>> {
		return this.skills.update(actor, skill);
	}

	async manifest(actor: ActorContext, noteId: NoteId): Promise<SkillManifest> {
		const skill = await this.load(actor, noteId);
		return this.portable(skill);
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

	setPinned(
		actor: ActorContext,
		noteId: NoteId,
		projectId: ProjectId,
		pinned: boolean
	): Promise<void> {
		return this.skills.setPinned(actor, noteId, projectId, pinned);
	}
}
