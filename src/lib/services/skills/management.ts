import type {
	ActorContext,
	DateTime,
	Note,
	NoteId,
	NoteRevision,
	NoteRevisionId,
	ProvenanceId,
	Skill,
	SkillSummary,
	SkillUsage,
	SkillUsageId,
	SkillUsageView,
	TextSelection
} from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/models';
import type { NoteRepository, ProvenanceRepository, SkillRepository } from '$lib/repositories';
import type {
	SkillCreator,
	SkillFinder,
	SkillUsageLister,
	SkillUsageRecorder,
	SkillVersionManager
} from './contracts';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class SkillManagementService
	implements SkillCreator, SkillFinder, SkillUsageLister, SkillUsageRecorder, SkillVersionManager
{
	constructor(
		private readonly skills: SkillRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async create(
		actor: ActorContext,
		note: Note,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill> {
		const owned = await this.notes.findById(actor, note.id);
		if (!owned) throw new NotFoundError('Skill note was not found');
		if (owned.kind === 'folder') throw new ValidationError('A folder cannot become a skill');
		const name = input.name.trim();
		if (!name) throw new ValidationError('Skill name is required');
		const skillNote = await this.notes.update(actor, {
			...owned,
			kind: 'skill',
			title: name,
			updatedAt: now()
		});
		return this.skills.insert(actor, {
			note: skillNote,
			name,
			description: input.description.trim(),
			triggerHints: input.triggerHints.map((hint) => hint.trim()).filter(Boolean),
			isEnabled: true
		});
	}
	async createFromSelection(
		actor: ActorContext,
		selection: TextSelection,
		input: {
			name: string;
			description: string;
			triggerHints: readonly string[];
			provenanceId: ProvenanceId;
		}
	): Promise<Skill> {
		const name = input.name.trim();
		if (!name) throw new ValidationError('Skill name is required');
		const source = await this.notes.findById(actor, selection.noteId);
		if (!source) throw new NotFoundError('Selection note was not found');
		if (
			selection.revision !== source.currentRevision ||
			selection.from < 0 ||
			selection.to < selection.from ||
			selection.to > source.plainText.length ||
			source.plainText.slice(selection.from, selection.to) !== selection.text
		)
			throw new ValidationError('Skill selection does not match the current note');
		if (!(await this.provenance.findById(actor, input.provenanceId)))
			throw new NotFoundError('Skill provenance was not found');
		if (!selection.text.trim()) throw new ValidationError('Skill source text is required');
		const timestamp = now();
		const note = await this.notes.insert(actor, {
			id: crypto.randomUUID() as NoteId,
			userId: actor.userId,
			projectId: source.projectId,
			parentId: source.parentId,
			kind: 'skill',
			position: await this.notes.countSiblings(actor, source.projectId, source.parentId),
			title: name,
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: selection.text }] }]
			},
			plainText: selection.text,
			currentRevision: 1,
			isPinned: false,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		return this.create(actor, note, input);
	}
	listEnabled(actor: ActorContext): Promise<readonly SkillSummary[]> {
		return this.skills.listEnabled(actor);
	}
	async load(actor: ActorContext, noteId: NoteId): Promise<Skill> {
		const skill = await this.skills.findByNoteId(actor, noteId);
		if (!skill) throw new NotFoundError('Skill was not found');
		return skill;
	}
	async record(
		actor: ActorContext,
		input: { skillNoteId: NoteId; contextNoteId?: NoteId; provenanceId: ProvenanceId }
	): Promise<void> {
		const skill = await this.load(actor, input.skillNoteId);
		if (input.contextNoteId) {
			const context = await this.notes.findById(actor, input.contextNoteId);
			if (!context || context.projectId !== skill.note.projectId)
				throw new NotFoundError('Skill context note was not found');
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

	async listVersions(actor: ActorContext, skillNoteId: NoteId): Promise<readonly NoteRevision[]> {
		await this.load(actor, skillNoteId);
		return this.notes.listRevisions(actor, skillNoteId);
	}

	async restoreVersion(actor: ActorContext, skillNoteId: NoteId, revision: number): Promise<Skill> {
		const skill = await this.load(actor, skillNoteId);
		const snapshot = (await this.notes.listRevisions(actor, skillNoteId)).find(
			(candidate) => candidate.revision === revision
		);
		if (!snapshot) throw new NotFoundError('Skill version was not found');
		const timestamp = now();
		const note = await this.notes.update(actor, {
			...skill.note,
			title: snapshot.title,
			document: snapshot.document,
			plainText: snapshot.plainText,
			currentRevision: skill.note.currentRevision + 1,
			updatedAt: timestamp
		});
		await this.notes.insertRevision(actor, {
			id: crypto.randomUUID() as NoteRevisionId,
			noteId: note.id,
			revision: note.currentRevision,
			title: note.title,
			document: note.document,
			plainText: note.plainText,
			createdAt: timestamp
		});
		return this.skills.update(actor, { ...skill, note, name: note.title });
	}
}
