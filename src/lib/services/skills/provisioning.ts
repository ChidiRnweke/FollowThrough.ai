import type {
	ActorContext,
	DateTime,
	Note,
	NoteId,
	NoteRevisionId,
	ProjectId,
	Skill,
	SkillSummary
} from '$lib/models';
import { DEFAULT_PROJECT_NAME, NotFoundError, ValidationError } from '$lib/models';
import type { NoteRepository, ProjectRepository, SkillRepository } from '$lib/repositories';
import type { BuiltInSkillProvisioner, SkillFinder } from './contracts';
import type { BuiltInSkillDefinition } from './built-in-definitions';
import { BUILT_INS, RETIRED_BUILT_INS } from './built-in-definitions';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class DefaultBuiltInSkillProvisioner implements BuiltInSkillProvisioner {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly notes: NoteRepository,
		private readonly skills: SkillRepository
	) {}

	async ensure(actor: ActorContext): Promise<void> {
		const projects = await this.projects.listActive(actor);
		const defaultProject =
			projects.find((candidate) => candidate.name === DEFAULT_PROJECT_NAME) ??
			(await this.projects.insert(actor, { name: DEFAULT_PROJECT_NAME }));
		const activeProjectIds = new Set(projects.map((project) => project.id));
		activeProjectIds.add(defaultProject.id);
		for (const definition of BUILT_INS)
			await this.ensureDefinition(actor, definition, defaultProject.id, activeProjectIds);
	}

	async load(actor: ActorContext, key: string): Promise<Skill> {
		await this.ensure(actor);
		const note = await this.notes.findByBuiltInKey(actor, key);
		if (!note) throw new NotFoundError(`Built-in skill "${key}" was not found`);
		const skill = await this.skills.findByNoteId(actor, note.id);
		if (!skill) throw new NotFoundError(`Built-in skill "${key}" is incomplete`);
		if (!skill.isEnabled)
			throw new ValidationError(
				`The ${skill.name} skill is disabled. Re-enable it in Skills first.`
			);
		return skill;
	}

	private async ensureDefinition(
		actor: ActorContext,
		definition: BuiltInSkillDefinition,
		defaultProjectId: ProjectId,
		activeProjectIds: ReadonlySet<ProjectId>
	): Promise<void> {
		let note = await this.notes.findByBuiltInKey(actor, definition.key);
		let adoptedLegacy = false;
		if (!note && definition.key === 'followthrough') {
			const active = await this.notes.listActive(actor);
			note = active.find(
				(candidate) =>
					candidate.kind === 'skill' && candidate.title.toLocaleLowerCase() === 'followthrough'
			);
			adoptedLegacy = note !== undefined;
		}
		if (!note) note = await this.createNote(actor, definition, defaultProjectId);
		else {
			const repaired: Note = {
				...note,
				projectId: activeProjectIds.has(note.projectId) ? note.projectId : defaultProjectId,
				kind: 'skill',
				builtInKey: definition.key,
				archivedAt: undefined,
				updatedAt: note.updatedAt
			};
			if (
				repaired.projectId !== note.projectId ||
				repaired.kind !== note.kind ||
				repaired.builtInKey !== note.builtInKey ||
				note.archivedAt !== undefined
			)
				note = await this.notes.update(actor, repaired);
		}
		const existing = await this.skills.findByNoteId(actor, note.id);
		if (!existing) {
			await this.skills.insert(
				actor,
				adoptedLegacy
					? {
							...this.toSkill(note, definition),
							metadata: {
								...this.metadata(definition),
								'followthrough.adopted-legacy': 'true'
							}
						}
					: this.toSkill(note, definition)
			);
			return;
		}
		if (adoptedLegacy) {
			await this.skills.update(actor, {
				...existing,
				note,
				metadata: {
					...(existing.metadata ?? {}),
					'followthrough.adopted-legacy': 'true'
				}
			});
			return;
		}
		if (
			RETIRED_BUILT_INS.some(
				(retired) => retired.key === definition.key && this.isUntouched(note, existing, retired)
			)
		)
			await this.upgradeBuiltIn(actor, note, existing, definition);
	}

	/**
	 * True when the stored skill is still byte-for-byte a released version and was
	 * never published, so replacing it cannot lose the user's work. Revision
	 * numbers are deliberately not compared: an install already carried forward by
	 * an earlier upgrade is still untouched.
	 */
	private isUntouched(note: Note, skill: Skill, released: BuiltInSkillDefinition): boolean {
		const metadata = skill.metadata ?? {};
		const expected = this.metadata(released);
		return (
			note.title === released.name &&
			note.plainText === released.instructions &&
			note.publishedRevision === 0 &&
			note.publishedAt === undefined &&
			skill.name === released.name &&
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

	private async upgradeBuiltIn(
		actor: ActorContext,
		note: Note,
		skill: Skill,
		definition: BuiltInSkillDefinition
	): Promise<void> {
		const timestamp = now();
		const updated = await this.notes.update(actor, {
			...note,
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: definition.instructions }] }]
			},
			plainText: definition.instructions,
			currentRevision: note.currentRevision + 1,
			updatedAt: timestamp
		});
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
			name: definition.name,
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
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: definition.instructions }] }]
			},
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

	private toSkill(note: Note, definition: BuiltInSkillDefinition): Skill {
		return {
			note,
			name: definition.name,
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

export class ProvisioningSkillFinder implements SkillFinder {
	constructor(
		private readonly provisioner: BuiltInSkillProvisioner,
		private readonly delegate: SkillFinder
	) {}

	async listEnabled(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		await this.provisioner.ensure(actor);
		return this.delegate.listEnabled(actor, projectId);
	}

	async listAll(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		await this.provisioner.ensure(actor);
		return this.delegate.listAll(actor, projectId);
	}

	load(actor: ActorContext, noteId: NoteId): Promise<Skill> {
		return this.delegate.load(actor, noteId);
	}
}
