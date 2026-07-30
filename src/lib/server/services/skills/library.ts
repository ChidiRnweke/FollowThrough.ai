import type {
	ActorContext,
	DateTime,
	Note,
	NoteId,
	NoteRevision,
	NoteRevisionId,
	ProvenanceId,
	ProjectId,
	Skill,
	SkillSummary,
	SkillManifest,
	SkillUsage,
	SkillUsageId,
	SkillUsageView,
	TextSelection
} from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/errors';
import type {
	NoteRepository,
	ProvenanceRepository,
	SkillRepository
} from '$lib/server/repositories';
interface SkillManifests {
	parse(source: string): SkillManifest;
	serialize(manifest: SkillManifest & { readonly instructions: string }): string;
}

const now = (): DateTime => new Date().toISOString() as DateTime;
const slug = (value: string): string =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64) || `skill-${crypto.randomUUID().slice(0, 8)}`;

export class SkillLibrary {
	constructor(
		private readonly skills: SkillRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly manifests: SkillManifests
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
		const skillSlug = slug(name);
		if ((await this.skills.listAll(actor)).some((skill) => skill.slug === skillSlug))
			throw new ValidationError('A skill with this portable name already exists');
		const description = input.description.trim() || `Reusable instructions for ${name}.`;
		if (description.length > 1024) throw new ValidationError('Skill description is too long');
		const skillNote = await this.notes.update(actor, {
			...owned,
			kind: 'skill',
			title: name,
			updatedAt: now()
		});
		return this.skills.insert(actor, {
			note: skillNote,
			name,
			slug: skillSlug,
			description,
			triggerHints: input.triggerHints.map((hint) => hint.trim()).filter(Boolean),
			metadata: {},
			allowImplicitInvocation: true,
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
			publishedRevision: 0,
			isPinned: false,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		return this.create(actor, note, input);
	}
	listEnabled(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		return this.skills.listEnabled(actor, projectId);
	}
	listAll(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		return this.skills.listAll(actor, projectId);
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
		await this.notes.restoreAttachmentSnapshot(actor, snapshot.id, skillNoteId);
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

	async update(
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
	): Promise<Skill> {
		const current = await this.load(actor, input.noteId);
		if (input.raw !== undefined && input.manifest !== undefined)
			throw new ValidationError('Provide raw SKILL.md or structured fields, not both');
		if (input.raw === undefined && input.manifest === undefined) {
			// Metadata-only update: the note — its document, revision, and revision
			// history — belongs to the note sync path and must not be touched here.
			return this.skills.update(actor, {
				...current,
				...(input.displayName?.trim() ? { name: input.displayName.trim() } : {}),
				...(input.description !== undefined
					? { description: input.description.trim() || current.description }
					: {}),
				...(input.triggerHints
					? { triggerHints: input.triggerHints.map((hint) => hint.trim()).filter(Boolean) }
					: {}),
				...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {})
			});
		}
		const manifest =
			input.raw !== undefined
				? this.manifests.parse(input.raw)
				: input.manifest
					? this.manifests.parse(this.manifests.serialize(input.manifest))
					: undefined;
		if (
			manifest &&
			(await this.skills.listAll(actor)).some(
				(skill) => skill.noteId !== input.noteId && skill.slug === manifest.slug
			)
		)
			throw new ValidationError('A skill with this portable name already exists');
		const timestamp = now();
		const displayName = input.displayName?.trim() || current.name;
		const instructions = manifest?.instructions ?? current.note.plainText;
		const note = await this.notes.update(actor, {
			...current.note,
			title: displayName,
			document: {
				type: 'doc',
				content: instructions
					? [{ type: 'paragraph', content: [{ type: 'text', text: instructions }] }]
					: [{ type: 'paragraph' }]
			},
			plainText: instructions,
			currentRevision: current.note.currentRevision + 1,
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
		return this.skills.update(actor, {
			...current,
			note,
			name: displayName,
			...(manifest
				? {
						slug: manifest.slug,
						description: manifest.description,
						license: manifest.license,
						compatibility: manifest.compatibility,
						metadata: manifest.metadata,
						allowImplicitInvocation: manifest.allowImplicitInvocation
					}
				: {}),
			...(input.triggerHints
				? { triggerHints: input.triggerHints.map((hint) => hint.trim()).filter(Boolean) }
				: {}),
			...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {})
		});
	}

	async serialize(actor: ActorContext, noteId: NoteId): Promise<string> {
		const skill = await this.load(actor, noteId);
		return this.manifests.serialize({
			slug: skill.slug ?? slug(skill.name),
			description: skill.description,
			...(skill.license ? { license: skill.license } : {}),
			...(skill.compatibility ? { compatibility: skill.compatibility } : {}),
			metadata: skill.metadata ?? {},
			allowImplicitInvocation: skill.allowImplicitInvocation ?? true,
			instructions: skill.note.plainText
		});
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

export type SkillCreator = Pick<SkillLibrary, 'create' | 'createFromSelection'>;
export type SkillEditor = Pick<SkillLibrary, 'update' | 'serialize' | 'setPinned'>;
export type SkillFinder = Pick<SkillLibrary, 'listEnabled' | 'listAll' | 'load'>;
export type SkillUsageLister = Pick<SkillLibrary, 'list'>;
export type SkillUsageRecorder = Pick<SkillLibrary, 'record'>;
export type SkillVersionManager = Pick<SkillLibrary, 'listVersions' | 'restoreVersion'>;
