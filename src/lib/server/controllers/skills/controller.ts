import type { NoteMarkdown } from '$lib/models/note-markdown';
import type { DateTime } from '$lib/models/workspace';
import type { NoteCreator } from '$lib/server/services/notes/catalog';
import type { ProjectLister } from '$lib/server/services/projects/catalog';
import type { NoteEditingRules } from '$lib/services/notes/editing';
import type { NoteCreationRules } from '$lib/services/notes/lifecycle';
import type { ProjectChoiceRules } from '$lib/services/projects/choice';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import { NotFoundError, StaleRevisionError, ValidationError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { CreateNoteInput, Note, NoteId, NoteRevision } from '$lib/models/notes';
import type { ProjectId, WithProjectChoice } from '$lib/models/projects';
import type {
	CreateSkillFromSelectionInput,
	CreateSkillFromSelectionOutput,
	CreateSkillInput,
	CreateSkillOutput,
	GetSkillViewInput,
	ListSkillsOutput,
	LoadSkillInput,
	RestoreSkillVersionInput,
	SkillEditInput,
	SkillPinChange,
	SkillView
} from '$lib/models/skills';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	SkillMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type {
	NoteAttachmentRestorer,
	NoteEditor,
	NoteRevisionReader,
	NoteRevisionRecorder,
	SourceAnchorRepairer
} from '$lib/server/services/notes/catalog';
import type { NoteIndexing as NoteIndexer } from '$lib/server/services/knowledge-search/retrieval';
import type { SelectionOriginService } from '$lib/server/services/notes/selection-origin';
import type { NoteLinkReconciler } from '$lib/server/services/relationships/graph';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';
import type { NoteReferences } from '$lib/services/notes/references';
import type { SkillPortability } from '$lib/services/skills/manifest';
import type { SkillMetadataEditing } from '$lib/services/skills/metadata';

import type { BuiltInSkillProvisioner } from '$lib/server/services/skills/built-ins';
import type {
	SkillCreator,
	SkillEditor,
	SkillFinder,
	SkillUsageLister,
	SkillUsageRecorder
} from '$lib/server/services/skills/library';
import type { SkillPinWriter } from '$lib/server/services/skills/pins';

/**
 * Application boundary for skills: reading, creating, editing, and versioning the
 * skill notes the agent can load.
 *
 * Skills are just notes with extra metadata, so creation and versioning go through the
 * note subsystem; `get` is a pure read, while the agent-facing load also records usage.
 */
export interface SkillsController {
	synchronize(actor: ActorContext, input: SkillMutationRequest): Promise<WorkspaceMutationResult>;
	/** List the user's skills, optionally scoped to a project. */
	list(actor: ActorContext, input?: { projectId?: ProjectId }): Promise<ListSkillsOutput>;
	/** Load a skill and its usage counts for the editor view. Read-only. */
	get(actor: ActorContext, input: GetSkillViewInput): Promise<SkillView<Note>>;
	/**
	 * Load a skill to apply it, with its instructions as Markdown, and record that it was used.
	 *
	 * Distinct from {@link get} because using a skill is a side effect: it writes a usage
	 * record linking the skill to the note it was applied against, which is what makes
	 * "which skills actually get used" observable later.
	 */
	use(actor: ActorContext, input: LoadSkillInput): Promise<SkillInstructions>;
	/**
	 * Create a new skill backed by a fresh note, in one transaction.
	 *
	 * @throws ProjectChoiceRequiredError if the request names no project.
	 */
	create(
		actor: ActorContext,
		input: WithProjectChoice<CreateSkillInput>
	): Promise<CreateSkillOutput<Note>>;
	/**
	 * Create a skill distilled from a text selection.
	 *
	 * Records provenance from the source selection first, so the new skill carries a
	 * traceable lineage back to the content it was extracted from.
	 */
	createFromSelection(
		actor: ActorContext,
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput>;
	/** List the revision history of a skill's underlying note. */
	listVersions(actor: ActorContext, input: GetSkillViewInput): Promise<readonly NoteRevision[]>;
	/** Restore a skill to an earlier revision, in one transaction. */
	restoreVersion(actor: ActorContext, input: RestoreSkillVersionInput): Promise<SkillView<Note>>;
	/** Edit a skill's content, returning the refreshed view with its usage counts. */
	update(actor: ActorContext, input: SkillEditInput): Promise<SkillView<Note>>;
	/** Pin or unpin a skill within a project so it is offered before unpinned ones. */
	setPinned(actor: ActorContext, input: SkillPinChange): Promise<void>;
}
/** Everything the {@link SkillsController} needs, injected so it can be built and tested without real stores. */
export interface SkillsDependencies {
	readonly projectChoice: ProjectChoiceRules;
	readonly projectLister: ProjectLister;
	readonly markdown: NoteMarkdown;

	readonly skillPortability: SkillPortability;
	readonly skillMetadataEditing: SkillMetadataEditing;
	readonly noteReferences: NoteReferences;
	readonly noteEditingRules: NoteEditingRules;
	readonly noteCreationRules: NoteCreationRules;
	builtInSkills: Pick<BuiltInSkillProvisioner, 'ensure'>;
	syncMutations: WorkspaceMutationGuard;
	syncRetry: 'database-only' | 'never';
	skillFinder: SkillFinder;
	skillUsageLister: SkillUsageLister;
	skillUsageRecorder: SkillUsageRecorder;
	noteEditor: NoteEditor;
	revisionReader: NoteRevisionReader;
	revisionRecorder: NoteRevisionRecorder;
	attachmentRestorer: NoteAttachmentRestorer;
	anchorRepairer: SourceAnchorRepairer;
	noteIndexer: NoteIndexer;
	noteLinkReconciler: NoteLinkReconciler;
	skillEditor: SkillEditor;
	skillPinWriter: SkillPinWriter;
	selectionOrigins: SelectionOriginService;
	skillCreator: SkillCreator;
	noteCreation: NoteCreator;
	transactionRunner: TransactionRunner;
}
export class Skills implements SkillsController {
	async synchronize(
		actor: ActorContext,
		input: SkillMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					await this.dependencies.skillEditor.lockCatalog(actor);
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
					return this.dependencies.syncMutations.complete(actor, input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(
		actor: ActorContext,
		input: SkillMutationRequest
	): Promise<void> {
		const command = input.command;

		switch (command.kind) {
			case 'updateSkill':
				await this.update(actor, command);
				break;
		}
	}

	constructor(
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: SkillsDependencies
	) {}
	async list(actor: ActorContext, input?: { projectId?: ProjectId }): Promise<ListSkillsOutput> {
		await this.dependencies.transactionRunner.run(() =>
			this.dependencies.builtInSkills.ensure(actor)
		);
		return { skills: await this.dependencies.skillFinder.listAll(actor, input?.projectId) };
	}
	async get(actor: ActorContext, input: GetSkillViewInput): Promise<SkillView<Note>> {
		const [skill, usages] = await Promise.all([
			this.dependencies.skillFinder.load(actor, input.noteId),
			this.dependencies.skillUsageLister.list(actor, input.noteId)
		]);
		return { skill, usages };
	}
	async use(actor: ActorContext, input: LoadSkillInput): Promise<SkillInstructions> {
		const view = await this.dependencies.transactionRunner.run(async () => {
			const skill = await this.dependencies.skillFinder.load(actor, input.noteId);
			await this.dependencies.skillUsageRecorder.record(actor, {
				skillNoteId: input.noteId,
				contextNoteId: input.contextNoteId,
				provenanceId: input.provenanceId
			});
			return {
				skill,
				usages: await this.dependencies.skillUsageLister.list(actor, input.noteId)
			};
		});
		return { view, instructions: this.dependencies.markdown.write(view.skill.note.document) };
	}
	private async createSkillNote(actor: ActorContext, input: CreateNoteInput): Promise<Note> {
		const facts = await this.dependencies.noteCreation.creationFacts(actor, input);
		const decision = this.dependencies.noteCreationRules.decideCreation(
			{
				id: input.id ?? (crypto.randomUUID() as NoteId),
				title: input.title,
				parentId: input.parentId,
				kind: 'skill'
			},
			facts,
			new Date().toISOString() as DateTime
		);
		if (decision.kind === 'invalid') {
			if (decision.code === 'NOT_FOUND') throw new NotFoundError(decision.message);
			throw new ValidationError(decision.message);
		}
		return this.dependencies.noteCreation.insert(actor, decision.note);
	}

	async create(
		actor: ActorContext,
		input: WithProjectChoice<CreateSkillInput>
	): Promise<CreateSkillOutput<Note>> {
		const projectId =
			input.projectId ??
			this.dependencies.projectChoice.requireChoice(
				await this.dependencies.projectLister.list(actor),
				'create a skill'
			);
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.skillCreator.lockCatalog(actor);
			const note = await this.createSkillNote(actor, {
				id: input.id,
				title: input.name,
				projectId,
				parentId: input.parentId
			});
			const skill = await this.dependencies.skillCreator.create(actor, note, {
				name: input.name,
				description: input.description ?? '',
				triggerHints: input.triggerHints ?? []
			});
			if (input.instructions === undefined) return { skill };
			const text = input.instructions.trimEnd();
			const saved = await this.saveDocument(actor, {
				...note,
				document: {
					type: 'doc',
					content: text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : []
				},
				plainText: text
			});
			return { skill: { ...skill, note: saved } };
		});
	}
	createFromSelection(
		actor: ActorContext,
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.skillCreator.lockCatalog(actor);
			const sourceNote = await this.dependencies.selectionOrigins.validate(actor, input.selection);
			// Acquire the project lock before inserting an anchor that locks its source note's FK.
			const created = await this.createSkillNote(actor, {
				title: input.name,
				projectId: sourceNote.projectId,
				parentId: sourceNote.parentId
			});
			const source = await this.dependencies.selectionOrigins.resolve(actor, input.selection);
			await this.dependencies.selectionOrigins.record(actor, source, {
				producerKind: 'user',
				producerName: 'Create Skill From Selection',
				metadata: {}
			});
			const note = await this.saveDocument(actor, {
				...created,
				document: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: input.selection.text }] }]
				},
				plainText: input.selection.text
			});
			const skill = await this.dependencies.skillCreator.create(actor, note, input);

			return { skillNoteId: skill.note.id };
		});
	}
	async listVersions(
		actor: ActorContext,
		input: GetSkillViewInput
	): Promise<readonly NoteRevision[]> {
		await this.dependencies.skillFinder.load(actor, input.noteId);
		return this.dependencies.revisionReader.revisions(actor, input.noteId);
	}
	async restoreVersion(
		actor: ActorContext,
		input: RestoreSkillVersionInput
	): Promise<SkillView<Note>> {
		const skill = await this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.skillEditor.getForEdit(actor, input.noteId);
			const snapshot = (await this.dependencies.revisionReader.revisions(actor, input.noteId)).find(
				(item) => item.revision === input.revision
			);
			if (!snapshot) throw new NotFoundError('Skill version was not found');
			const note = await this.saveDocument(actor, {
				...current.note,
				title: snapshot.title,
				document: snapshot.document,
				plainText: snapshot.plainText
			});
			await this.dependencies.attachmentRestorer.restoreAttachments(
				actor,
				input.noteId,
				snapshot.id
			);
			await this.dependencies.revisionRecorder.record(actor, note);
			return this.dependencies.skillEditor.commitEdit(actor, {
				...current,
				note
			});
		});
		return {
			skill,
			usages: await this.dependencies.skillUsageLister.list(actor, input.noteId)
		};
	}
	async update(actor: ActorContext, input: SkillEditInput): Promise<SkillView<Note>> {
		const skill = await this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.skillEditor.lockCatalog(actor);
			const current = await this.dependencies.skillEditor.getForEdit(actor, input.noteId);
			const metadata = this.dependencies.skillMetadataEditing.edit(current, input);
			const prepared = await this.dependencies.skillEditor.prepareEdit(
				actor,
				{ ...current, ...metadata },
				input
			);
			if (prepared.kind === 'document') {
				this.dependencies.skillPortability.validate(prepared.manifest);
				if (
					input.content &&
					input.content.baseRevision !== current.note.currentRevision &&
					!this.dependencies.noteEditingRules.sameDraft(current.note, prepared.skill.note)
				)
					throw new StaleRevisionError('The skill document has changed since it was loaded');
			}
			const note =
				prepared.kind !== 'metadata'
					? await this.saveDocument(actor, prepared.skill.note)
					: prepared.skill.note;
			return this.dependencies.skillEditor.commitEdit(actor, { ...prepared.skill, note });
		});
		return { skill, usages: await this.dependencies.skillUsageLister.list(actor, input.noteId) };
	}
	private async saveDocument(actor: ActorContext, candidate: Note): Promise<Note> {
		const current = await this.dependencies.noteEditor.getForEdit(actor, candidate);
		const decision = this.dependencies.noteEditingRules.prepareSave(
			current,
			candidate,
			new Date().toISOString() as DateTime
		);
		const note =
			decision.kind === 'unchanged'
				? decision.note
				: await this.dependencies.noteEditor.persistEdit(actor, decision.write);
		await this.dependencies.anchorRepairer.repairForNote(actor, note);
		await this.dependencies.noteLinkReconciler.reconcile(
			actor,
			note,
			this.dependencies.noteReferences.links(note.document)
		);
		await this.dependencies.noteIndexer.indexNote(actor, note);
		return note;
	}

	setPinned(actor: ActorContext, input: SkillPinChange): Promise<void> {
		return this.dependencies.transactionRunner.run(async () => {
			const change = await this.dependencies.skillPinWriter.prepare(actor, input);
			await this.dependencies.skillPinWriter.persist(actor, change);
		});
	}
}

/** A skill loaded for use, with its instructions as the Markdown its editing operations anchor on. */
export interface SkillInstructions {
	readonly view: SkillView<Note>;
	readonly instructions: string;
}
