import { isDeepStrictEqual } from 'node:util';
import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { Note, NoteId, NoteRevisionId } from '$lib/models/notes';
import type { Project, ProjectId } from '$lib/models/projects';
import type { Skill } from '$lib/models/skills';
import { INBOX_PROJECT_NAME } from '$lib/models/projects';
import { NotFoundError, StaleRevisionError, ValidationError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type { SkillRepository } from '$lib/server/repositories/skills/skills';
import type { BuiltInSkillDefinition } from '$lib/models/skills/built-ins';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class BuiltInSkills {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly notes: NoteRepository,
		private readonly skills: SkillRepository,
		private readonly definitions: {
			readonly active: readonly BuiltInSkillDefinition[];
			readonly retired: readonly BuiltInSkillDefinition[];
		}
	) {}

	/** The calling controller owns the transaction for installation and its lock. */
	async ensure(actor: ActorContext): Promise<void> {
		await this.skills.lockBuiltInProvisioning(actor);
		const projects: Project[] = [];
		const ids = (await this.projects.listActive(actor)).map((project) => project.id).sort();
		for (const id of ids) {
			const project = await this.projects.findForWrite(actor, id);
			if (project) projects.push(project);
		}
		const inbox = await this.ensureInbox(actor, projects);
		const activeProjectIds = new Set(projects.map((project) => project.id));
		activeProjectIds.add(inbox.id);
		for (const definition of this.definitions.active)
			await this.ensureDefinition(actor, definition, inbox.id, activeProjectIds);
	}

	/**
	 * Provisioning is the only thing that creates an inbox.
	 *
	 * It used to be found by name and created by whichever write ran first — a
	 * note, a skill, an import — so a workspace grew projects as a side effect of
	 * saving something. Now the role says which project it is, and this runs on the
	 * provisioning path that every actor already goes through.
	 */
	private async ensureInbox(actor: ActorContext, projects: readonly Project[]): Promise<Project> {
		const existing = projects.find((project) => project.role === 'inbox');
		if (existing) return existing;
		const names = new Set(projects.map((project) => project.name.toLowerCase()));
		let name = INBOX_PROJECT_NAME;
		for (let suffix = 2; names.has(name.toLowerCase()); suffix++)
			name = `${INBOX_PROJECT_NAME} (${suffix})`;
		return this.projects.insert(actor, { name, role: 'inbox' });
	}

	async load(actor: ActorContext, key: string): Promise<Skill<Note>> {
		const note = await this.notes.findByBuiltInKey(actor, key);
		if (!note) throw new NotFoundError(`Built-in skill "${key}" was not found`);
		const skill = await this.skills.findByNoteId(actor, note.id);
		if (!skill) throw new NotFoundError(`Built-in skill "${key}" is incomplete`);
		if (!skill.isEnabled)
			throw new ValidationError(
				`The ${skill.note.title} skill is disabled. Re-enable it in Skills first.`
			);
		return skill;
	}

	private async ensureDefinition(
		actor: ActorContext,
		definition: BuiltInSkillDefinition,
		defaultProjectId: ProjectId,
		activeProjectIds: ReadonlySet<ProjectId>
	): Promise<void> {
		let note = await this.notes.findBuiltInForWrite(actor, definition.key);
		if (!note) note = await this.createNote(actor, definition, defaultProjectId);
		else {
			const moved = !activeProjectIds.has(note.projectId);
			const projectId = moved ? defaultProjectId : note.projectId;
			const parent =
				!moved && note.parentId ? await this.notes.findForWrite(actor, note.parentId) : undefined;
			const detached =
				note.parentId !== undefined &&
				(moved ||
					!parent ||
					parent.archivedAt !== undefined ||
					parent.kind !== 'folder' ||
					parent.projectId !== projectId);
			if (moved || detached || note.kind !== 'skill' || note.archivedAt !== undefined) {
				const parentId = detached ? undefined : note.parentId;
				const repaired = await this.notes.repairBuiltIn(actor, {
					noteId: note.id,
					builtInKey: definition.key,
					projectId,
					parentId,
					position:
						moved || detached
							? await this.notes.countSiblings(actor, projectId, parentId)
							: note.position,
					kind: 'skill',
					archivedAt: null,
					updatedAt: note.updatedAt
				});
				if (!repaired) throw new StaleRevisionError('The built-in note changed during repair');
				note = repaired;
			}
		}
		const existing = await this.skills.findForWrite(actor, note.id);
		if (!existing) {
			await this.skills.insert(actor, this.toSkill(note, definition));
			return;
		}

		if (
			this.definitions.retired.some(
				(retired) => retired.key === definition.key && this.isUntouched(note, existing, retired)
			)
		)
			await this.upgradeBuiltIn(actor, note, existing, definition);
	}

	/**
	 * True when the stored skill is still byte-for-byte a released version, so
	 * replacing it cannot lose the user's work. Revision numbers are deliberately
	 * not compared: an install already carried forward by an earlier upgrade is
	 * still untouched.
	 *
	 * Publication state is not consulted either, and that is the point. It used to
	 * be, and it conflated "published" with "edited" — publishing an unmodified
	 * built-in froze it at that version forever. The Diagramming skill sat on v1
	 * through every later release because of it, so none of the guidance those
	 * releases added ever reached the agent. The byte comparison below is what
	 * actually protects an edit; whether the user pressed publish says nothing
	 * about authorship.
	 */
	private isUntouched(note: Note, skill: Skill<Note>, released: BuiltInSkillDefinition): boolean {
		const metadata = skill.metadata ?? {};
		const expected = this.metadata(released);
		return (
			note.title === released.name &&
			note.plainText === released.instructions &&
			isDeepStrictEqual(note.document, this.stockDocument(released)) &&
			skill.slug === released.key &&
			skill.description === released.description &&
			skill.allowImplicitInvocation === released.allowImplicitInvocation &&
			this.sameStrings(skill.triggerHints, released.triggerHints) &&
			Object.keys(metadata).length === Object.keys(expected).length &&
			Object.entries(expected).every(([key, value]) => metadata[key] === value)
		);
	}

	private sameStrings(left: readonly string[], right: readonly string[]): boolean {
		return left.length === right.length && left.every((value, index) => value === right[index]);
	}

	private stockDocument(definition: BuiltInSkillDefinition): Note['document'] {
		return {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: definition.instructions }] }]
		};
	}

	private async upgradeBuiltIn(
		actor: ActorContext,
		note: Note,
		skill: Skill<Note>,
		definition: BuiltInSkillDefinition
	): Promise<void> {
		const timestamp = now();
		const updated = await this.notes.updateIfRevision(
			actor,
			{
				...note,
				document: this.stockDocument(definition),
				plainText: definition.instructions,
				currentRevision: note.currentRevision + 1,
				updatedAt: timestamp
			},
			note.currentRevision
		);
		if (!updated) throw new StaleRevisionError('The built-in note changed during upgrade');
		await this.notes.insertRevision(actor, {
			id: crypto.randomUUID() as NoteRevisionId,
			noteId: updated.id,
			revision: updated.currentRevision,
			title: updated.title,
			document: updated.document,
			plainText: updated.plainText,
			createdAt: timestamp
		});
		await this.skills.update(actor, {
			...skill,
			note: updated,
			slug: definition.key,
			description: definition.description,
			triggerHints: definition.triggerHints,
			metadata: this.metadata(definition),
			allowImplicitInvocation: definition.allowImplicitInvocation
		});
	}

	private async createNote(
		actor: ActorContext,
		definition: BuiltInSkillDefinition,
		projectId: ProjectId
	): Promise<Note> {
		const timestamp = now();
		const note = await this.notes.insert(actor, {
			id: crypto.randomUUID() as NoteId,
			userId: actor.userId,
			projectId,
			kind: 'skill',
			position: await this.notes.countSiblings(actor, projectId),
			title: definition.name,
			builtInKey: definition.key,
			document: this.stockDocument(definition),
			plainText: definition.instructions,
			currentRevision: 1,
			publishedRevision: 0,
			isPinned: false,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		await this.notes.insertRevision(actor, {
			id: crypto.randomUUID() as NoteRevisionId,
			noteId: note.id,
			revision: 1,
			title: note.title,
			document: note.document,
			plainText: note.plainText,
			createdAt: timestamp
		});
		return note;
	}

	private toSkill(note: Note, definition: BuiltInSkillDefinition): Skill<Note> {
		return {
			note,
			slug: definition.key,
			description: definition.description,
			triggerHints: definition.triggerHints,
			metadata: this.metadata(definition),
			allowImplicitInvocation: definition.allowImplicitInvocation,
			isEnabled: true
		};
	}

	private metadata(definition: BuiltInSkillDefinition): Readonly<Record<string, string>> {
		return {
			'followthrough.built-in': 'true',
			'followthrough.built-in-key': definition.key,
			...(definition.version ? { 'followthrough.built-in-version': definition.version } : {})
		};
	}
}
