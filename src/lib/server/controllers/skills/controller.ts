import type { NoteMarkdown } from '$lib/models/note-markdown';
import type { DateTime } from '$lib/models/workspace';
import type { NoteCreator } from '$lib/server/services/notes/catalog';
import type { ProjectLister } from '$lib/server/services/projects/catalog';
import type { NoteEditingRules } from '$lib/services/notes/editing';
import type { NoteCreationRules } from '$lib/services/notes/lifecycle';
import type { ProjectChoiceRules } from '$lib/services/projects/rules';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import { NotFoundError, StaleRevisionError, ValidationError } from '$lib/errors';
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
	synchronize(input: SkillMutationRequest): Promise<WorkspaceMutationResult>;
	/** List the user's skills, optionally scoped to a project. */
	list(input?: { projectId?: ProjectId }): Promise<ListSkillsOutput>;
	/** Load a skill and its usage counts for the editor view. Read-only. */
	get(input: GetSkillViewInput): Promise<SkillView<Note>>;
	/**
	 * Load a skill to apply it, with its instructions as Markdown, and record that it was used.
	 *
	 * Distinct from {@link get} because using a skill is a side effect: it writes a usage
	 * record linking the skill to the note it was applied against, which is what makes
	 * "which skills actually get used" observable later.
	 */
	use(input: LoadSkillInput): Promise<SkillInstructions>;
	/**
	 * Create a new skill backed by a fresh note, in one transaction.
	 *
	 * @throws ProjectChoiceRequiredError if the request names no project.
	 */
	create(input: WithProjectChoice<CreateSkillInput>): Promise<CreateSkillOutput<Note>>;
	/**
	 * Create a skill distilled from a text selection.
	 *
	 * Records provenance from the source selection first, so the new skill carries a
	 * traceable lineage back to the content it was extracted from.
	 */
	createFromSelection(
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput>;
	/** List the revision history of a skill's underlying note. */
	listVersions(input: GetSkillViewInput): Promise<readonly NoteRevision[]>;
	/** Restore a skill to an earlier revision, in one transaction. */
	restoreVersion(input: RestoreSkillVersionInput): Promise<SkillView<Note>>;
	/** Edit a skill's content, returning the refreshed view with its usage counts. */
	update(input: SkillEditInput): Promise<SkillView<Note>>;
	/** Pin or unpin a skill within a project so it is offered before unpinned ones. */
	setPinned(input: SkillPinChange): Promise<void>;
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
	async synchronize(input: SkillMutationRequest): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					await this.dependencies.skillEditor.lockCatalog();
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(input);
					return this.dependencies.syncMutations.complete(input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(input: SkillMutationRequest): Promise<void> {
		const command = input.command;

		switch (command.kind) {
			case 'updateSkill':
				await this.update(command);
				break;
		}
	}

	constructor(
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: SkillsDependencies
	) {}
	async list(input?: { projectId?: ProjectId }): Promise<ListSkillsOutput> {
		await this.dependencies.transactionRunner.run(() => this.dependencies.builtInSkills.ensure());
		return { skills: await this.dependencies.skillFinder.listAll(input?.projectId) };
	}
	async get(input: GetSkillViewInput): Promise<SkillView<Note>> {
		const [skill, usages] = await Promise.all([
			this.dependencies.skillFinder.load(input.noteId),
			this.dependencies.skillUsageLister.list(input.noteId)
		]);
		return { skill, usages };
	}
	async use(input: LoadSkillInput): Promise<SkillInstructions> {
		const view = await this.dependencies.transactionRunner.run(async () => {
			const skill = await this.dependencies.skillFinder.load(input.noteId);
			await this.dependencies.skillUsageRecorder.record({
				skillNoteId: input.noteId,
				contextNoteId: input.contextNoteId,
				provenanceId: input.provenanceId
			});
			return {
				skill,
				usages: await this.dependencies.skillUsageLister.list(input.noteId)
			};
		});
		return { view, instructions: this.dependencies.markdown.write(view.skill.note.document) };
	}
	private async createSkillNote(input: CreateNoteInput): Promise<Note> {
		const facts = await this.dependencies.noteCreation.creationFacts(input);
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
		return this.dependencies.noteCreation.insert(decision.note);
	}

	async create(input: WithProjectChoice<CreateSkillInput>): Promise<CreateSkillOutput<Note>> {
		const projectId =
			input.projectId ??
			this.dependencies.projectChoice.requireChoice(
				await this.dependencies.projectLister.list(),
				'create a skill'
			);
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.skillCreator.lockCatalog();
			const note = await this.createSkillNote({
				id: input.id,
				title: input.name,
				projectId,
				parentId: input.parentId
			});
			const skill = await this.dependencies.skillCreator.create(note, {
				name: input.name,
				description: input.description ?? '',
				triggerHints: input.triggerHints ?? []
			});
			if (input.instructions === undefined) return { skill };
			const text = input.instructions.trimEnd();
			const saved = await this.saveDocument({
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
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.skillCreator.lockCatalog();
			const sourceNote = await this.dependencies.selectionOrigins.validate(input.selection);
			// Acquire the project lock before inserting an anchor that locks its source note's FK.
			const created = await this.createSkillNote({
				title: input.name,
				projectId: sourceNote.projectId,
				parentId: sourceNote.parentId
			});
			const source = await this.dependencies.selectionOrigins.resolve(input.selection);
			await this.dependencies.selectionOrigins.record(source, {
				producerKind: 'user',
				producerName: 'Create Skill From Selection',
				metadata: {}
			});
			const note = await this.saveDocument({
				...created,
				document: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: input.selection.text }] }]
				},
				plainText: input.selection.text
			});
			const skill = await this.dependencies.skillCreator.create(note, input);

			return { skillNoteId: skill.note.id };
		});
	}
	async listVersions(input: GetSkillViewInput): Promise<readonly NoteRevision[]> {
		await this.dependencies.skillFinder.load(input.noteId);
		return this.dependencies.revisionReader.revisions(input.noteId);
	}
	async restoreVersion(input: RestoreSkillVersionInput): Promise<SkillView<Note>> {
		const skill = await this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.skillEditor.getForEdit(input.noteId);
			const snapshot = (await this.dependencies.revisionReader.revisions(input.noteId)).find(
				(item) => item.revision === input.revision
			);
			if (!snapshot) throw new NotFoundError('Skill version was not found');
			const note = await this.saveDocument({
				...current.note,
				title: snapshot.title,
				document: snapshot.document,
				plainText: snapshot.plainText
			});
			await this.dependencies.attachmentRestorer.restoreAttachments(input.noteId, snapshot.id);
			await this.dependencies.revisionRecorder.record(note);
			return this.dependencies.skillEditor.commitEdit({
				...current,
				note
			});
		});
		return {
			skill,
			usages: await this.dependencies.skillUsageLister.list(input.noteId)
		};
	}
	async update(input: SkillEditInput): Promise<SkillView<Note>> {
		const skill = await this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.skillEditor.lockCatalog();
			const current = await this.dependencies.skillEditor.getForEdit(input.noteId);
			const metadata = this.dependencies.skillMetadataEditing.edit(current, input);
			const prepared = await this.dependencies.skillEditor.prepareEdit(
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
					? await this.saveDocument(prepared.skill.note)
					: prepared.skill.note;
			return this.dependencies.skillEditor.commitEdit({ ...prepared.skill, note });
		});
		return { skill, usages: await this.dependencies.skillUsageLister.list(input.noteId) };
	}
	private async saveDocument(candidate: Note): Promise<Note> {
		const current = await this.dependencies.noteEditor.getForEdit(candidate);
		const decision = this.dependencies.noteEditingRules.prepareSave(
			current,
			candidate,
			new Date().toISOString() as DateTime
		);
		const note =
			decision.kind === 'unchanged'
				? decision.note
				: await this.dependencies.noteEditor.persistEdit(decision.write);
		await this.dependencies.anchorRepairer.repairForNote(note);
		await this.dependencies.noteLinkReconciler.reconcile(
			note,
			this.dependencies.noteReferences.links(note.document)
		);
		await this.dependencies.noteIndexer.indexNote(note);
		return note;
	}

	setPinned(input: SkillPinChange): Promise<void> {
		return this.dependencies.transactionRunner.run(async () => {
			const change = await this.dependencies.skillPinWriter.prepare(input);
			await this.dependencies.skillPinWriter.persist(change);
		});
	}
}

/** A skill loaded for use, with its instructions as the Markdown its editing operations anchor on. */
export interface SkillInstructions {
	readonly view: SkillView<Note>;
	readonly instructions: string;
}
