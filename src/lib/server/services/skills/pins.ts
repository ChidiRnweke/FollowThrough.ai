import { NotFoundError, StaleRevisionError, ValidationError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { SkillPinChange } from '$lib/models/skills';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type { SkillRepository } from '$lib/server/repositories/skills/skills';

export class SkillPins {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly notes: NoteRepository,
		private readonly skills: SkillRepository
	) {}

	/** The controller owns the transaction; project locks precede note and metadata locks. */
	async prepare(actor: ActorContext, input: SkillPinChange): Promise<SkillPinChange> {
		const current = await this.skills.findByNoteId(actor, input.noteId);
		if (!current) throw new NotFoundError('Skill was not found');
		const projectIds = [...new Set([current.note.projectId, input.projectId])].sort();
		for (const projectId of projectIds) {
			if (!(await this.projects.findForWrite(actor, projectId)))
				throw new NotFoundError('Project was not found');
		}
		const note = await this.notes.findForWrite(actor, input.noteId);
		if (!note) throw new NotFoundError('Skill note was not found');
		if (note.projectId !== current.note.projectId)
			throw new StaleRevisionError('The skill moved while its pin was being changed');
		if (note.archivedAt || note.kind !== 'skill')
			throw new ValidationError('Only active skills can be pinned');
		if (!(await this.skills.findForWrite(actor, note.id)))
			throw new NotFoundError('Skill was not found');
		return { noteId: note.id, projectId: input.projectId, pinned: input.pinned };
	}

	persist(actor: ActorContext, change: SkillPinChange): Promise<void> {
		return this.skills.setPinned(actor, change.noteId, change.projectId, change.pinned);
	}
}
