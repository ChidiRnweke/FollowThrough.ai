import type { IndexingResult } from '$lib/models/knowledge-search';
import { serializeSkillManifest, validatePortableSkill } from '$lib/services/skills/manifest';
import type { IEmbeddings } from '$lib/server/services/knowledge-search/embeddings';
import type { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import type { Note } from '$lib/models/notes';
import { collectNoteLinkTargets } from '$lib/models/notes';
import { NotFoundError } from '$lib/errors';
import type { NoteLinkReconciler } from '$lib/server/services/relationships/contracts';
import type {
	SkillMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';
import type { ActorContext } from '$lib/models/identity';
import type {
	CreateSkillFromSelectionInput,
	CreateSkillFromSelectionOutput,
	CreateSkillInput,
	CreateSkillOutput,
	GetSkillViewInput,
	ListSkillsOutput,
	LoadSkillInput,
	RestoreSkillVersionInput,
	SkillView
} from '$lib/models/skills';
import type { NoteRevision } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	NoteCreator,
	NoteEditor,
	NoteRevisionReader,
	NoteRevisionRecorder,
	NoteAttachmentRestorer,
	SourceAnchorRepairer,
	NoteIndexer,
	SelectionOriginService
} from '$lib/server/services/notes/contracts';
import type {
	SkillCreator,
	BuiltInSkillProvisioner,
	SkillFinder,
	SkillUsageLister,
	SkillUsageRecorder,
	SkillEditor
} from '$lib/server/services/skills/contracts';

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
	 * Load a skill for the agent and record that it was used.
	 *
	 * Distinct from {@link get} because loading by the agent is a side effect: it writes
	 * a usage record linking the skill to the note it was applied against, which is what
	 * makes "which skills actually get used" observable later.
	 */
	loadForAgent(actor: ActorContext, input: LoadSkillInput): Promise<SkillView<Note>>;
	/** Create a new skill backed by a fresh note, in one transaction. */
	create(actor: ActorContext, input: CreateSkillInput): Promise<CreateSkillOutput<Note>>;
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
	update(
		actor: ActorContext,
		input: Parameters<SkillEditor['prepareEdit']>[1]
	): Promise<SkillView<Note>>;
	/** Serialize a skill into the compact form the agent consumes. */
	serialize(actor: ActorContext, input: GetSkillViewInput): Promise<string>;
	/** Pin or unpin a skill within a project so it is offered before unpinned ones. */
	setPinned(
		actor: ActorContext,
		input: { noteId: GetSkillViewInput['noteId']; projectId: ProjectId; pinned: boolean }
	): Promise<void>;
}
/** Everything the {@link SkillsController} needs, injected so it can be built and tested without real stores. */
export interface SkillsDependencies {
	builtInSkills: Pick<BuiltInSkillProvisioner, 'ensure'>;
	syncMutations: Pick<WorkspaceMutationReceipts, 'prepare' | 'complete' | 'reject'>;
	syncRetry: 'database-only' | 'never';
	skillFinder: SkillFinder;
	skillUsageLister: SkillUsageLister;
	skillUsageRecorder: SkillUsageRecorder;
	noteEditor: NoteEditor;
	revisionReader: NoteRevisionReader;
	revisionRecorder: NoteRevisionRecorder;
	attachmentRestorer: NoteAttachmentRestorer;
	anchorRepairer: SourceAnchorRepairer;
	indexEmbeddings: IEmbeddings;
	indexWriter: Pick<ContentIndex, 'complete'>;
	noteIndexer: NoteIndexer;
	noteLinkReconciler: NoteLinkReconciler;
	skillEditor: SkillEditor;
	selectionOrigins: SelectionOriginService;
	skillCreator: SkillCreator;
	noteCreator: NoteCreator;
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
					const prepared = await this.dependencies.syncMutations.prepare(actor, input);
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
					return this.dependencies.syncMutations.complete(actor, input);
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

	constructor(private readonly dependencies: SkillsDependencies) {}
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
	async loadForAgent(actor: ActorContext, input: LoadSkillInput): Promise<SkillView<Note>> {
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
	}
	create(actor: ActorContext, input: CreateSkillInput): Promise<CreateSkillOutput<Note>> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteCreator.create(actor, {
				documentKind: 'skill',
				id: input.id,
				title: input.name,
				projectId: input.projectId,
				parentId: input.parentId
			});
			const skill = await this.dependencies.skillCreator.create(actor, note, {
				name: input.name,
				description: input.description ?? '',
				triggerHints: input.triggerHints ?? []
			});
			return { skill };
		});
	}
	createFromSelection(
		actor: ActorContext,
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const source = await this.dependencies.selectionOrigins.resolve(actor, input.selection);
			await this.dependencies.selectionOrigins.record(actor, source, {
				producerKind: 'user',
				producerName: 'Create Skill From Selection',
				metadata: {}
			});
			const created = await this.dependencies.noteCreator.create(actor, {
				documentKind: 'skill',
				title: input.name,
				projectId: source.note.projectId,
				parentId: source.note.parentId
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
		return [...(await this.dependencies.revisionReader.revisions(actor, input.noteId))].reverse();
	}
	async restoreVersion(
		actor: ActorContext,
		input: RestoreSkillVersionInput
	): Promise<SkillView<Note>> {
		const skill = await this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.skillFinder.load(actor, input.noteId);
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
	async update(
		actor: ActorContext,
		input: Parameters<SkillEditor['prepareEdit']>[1]
	): Promise<SkillView<Note>> {
		const skill = await this.dependencies.transactionRunner.run(async () => {
			const prepared = await this.dependencies.skillEditor.prepareEdit(actor, input);
			if (prepared.kind === 'document') validatePortableSkill(prepared.manifest);
			const note =
				prepared.kind !== 'metadata'
					? await this.saveDocument(actor, prepared.document)
					: prepared.skill.note;
			return this.dependencies.skillEditor.commitEdit(actor, { ...prepared.skill, note });
		});
		return { skill, usages: await this.dependencies.skillUsageLister.list(actor, input.noteId) };
	}
	private async saveDocument(actor: ActorContext, candidate: Note): Promise<Note> {
		const note = await this.dependencies.noteEditor.save(actor, candidate);
		await this.dependencies.anchorRepairer.repairForNote(actor, note);
		await this.dependencies.noteLinkReconciler.reconcile(
			actor,
			note,
			collectNoteLinkTargets(note.document)
		);
		await this.finishIndex(actor, await this.dependencies.noteIndexer.index(actor, note));
		return note;
	}

	async serialize(actor: ActorContext, input: GetSkillViewInput): Promise<string> {
		const manifest = await this.dependencies.skillEditor.manifest(actor, input.noteId);
		return serializeSkillManifest(manifest);
	}
	setPinned(
		actor: ActorContext,
		input: { noteId: GetSkillViewInput['noteId']; projectId: ProjectId; pinned: boolean }
	): Promise<void> {
		return this.dependencies.skillEditor.setPinned(
			actor,
			input.noteId,
			input.projectId,
			input.pinned
		);
	}
	private async finishIndex(actor: ActorContext, result: IndexingResult): Promise<void> {
		if (result.kind === 'stored') return;
		const batch = await this.dependencies.indexEmbeddings.embed(
			result.missing.map((chunk) => chunk.input)
		);
		await this.dependencies.indexWriter.complete(actor, result, batch);
	}
}
