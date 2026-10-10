import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { AgentToolReviewControl } from '$lib/server/controllers/agent/tool-reviews';
import type { TokenCounter } from '$lib/models/tokenization';
import { agentFileOf } from '$lib/server/services/agent-files/virtual-files';
import type { NoteMarkdown } from '$lib/server/controllers/notes/controller';
import type { NotesController } from '$lib/server/controllers/notes/controller';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentProjectChoice } from '../project-choice';
import type { AgentToolOutput } from '../tool-outputs';
interface NotesToolOperationsDependencies {
	notes(): Pick<
		NotesController,
		| 'get'
		| 'create'
		| 'rename'
		| 'archive'
		| 'restore'
		| 'listTrash'
		| 'deleteForever'
		| 'emptyTrash'
		| 'listRevisions'
		| 'compareRevisions'
		| 'restoreRevision'
		| 'publish'
		| 'discardDraft'
	>;
}
export interface NotesToolOperations {
	get_note(input: AgentToolInput<'get_note'>): Promise<AgentToolOutput<'get_note'>>;
	create_note(input: AgentToolInput<'create_note'>): Promise<AgentToolOutput<'create_note'>>;
	save_note(input: AgentToolInput<'save_note'>): Promise<AgentToolOutput<'save_note'>>;
	edit_note(input: AgentToolInput<'edit_note'>): Promise<AgentToolOutput<'edit_note'>>;
	rename_note(input: AgentToolInput<'rename_note'>): Promise<AgentToolOutput<'rename_note'>>;
	archive_note(input: AgentToolInput<'archive_note'>): Promise<AgentToolOutput<'archive_note'>>;
	restore_note(input: AgentToolInput<'restore_note'>): Promise<AgentToolOutput<'restore_note'>>;
	list_trashed_notes(
		input: AgentToolInput<'list_trashed_notes'>
	): Promise<AgentToolOutput<'list_trashed_notes'>>;
	delete_note_forever(
		input: AgentToolInput<'delete_note_forever'>
	): Promise<AgentToolOutput<'delete_note_forever'>>;
	empty_note_trash(
		input: AgentToolInput<'empty_note_trash'>
	): Promise<AgentToolOutput<'empty_note_trash'>>;
	list_note_versions(
		input: AgentToolInput<'list_note_versions'>
	): Promise<AgentToolOutput<'list_note_versions'>>;
	diff_note_versions(
		input: AgentToolInput<'diff_note_versions'>
	): Promise<AgentToolOutput<'diff_note_versions'>>;
	restore_note_version(
		input: AgentToolInput<'restore_note_version'>
	): Promise<AgentToolOutput<'restore_note_version'>>;
	publish_note(input: AgentToolInput<'publish_note'>): Promise<AgentToolOutput<'publish_note'>>;
	discard_note_draft(
		input: AgentToolInput<'discard_note_draft'>
	): Promise<AgentToolOutput<'discard_note_draft'>>;
}
export class NotesToolOperationsController implements NotesToolOperations {
	constructor(
		private readonly controllers: NotesToolOperationsDependencies,
		private readonly actor: ActorContext,
		private readonly reviews: Pick<AgentToolReviewControl, 'change'>,
		private readonly toolPresentation: AgentToolPresentation,
		private readonly projectChoice: AgentProjectChoice,
		private readonly markdown: NoteMarkdown,
		private readonly tokens: TokenCounter
	) {}
	async get_note(input: AgentToolInput<'get_note'>): Promise<AgentToolOutput<'get_note'>> {
		const view = await this.controllers.notes().get(this.actor, { noteId: input.noteId as NoteId });
		const path = `/projects/${view.note.projectId}/notes/${view.note.id}.md`;
		const markdown = this.markdown.write(view.note.document);
		return this.toolPresentation.projectNoteView(
			view,
			agentFileOf(this.tokens, path, 'text/markdown', markdown).metadata
		);
	}
	async create_note(input: AgentToolInput<'create_note'>): Promise<AgentToolOutput<'create_note'>> {
		const chosenProjectId =
			input.projectId ?? (await this.projectChoice.requireChoice(this.actor, 'create a note'));
		const created = await this.controllers
			.notes()
			.create(this.actor, { ...input, projectId: chosenProjectId });
		return this.toolPresentation.projectNoteWrite(created.note);
	}
	async save_note(input: AgentToolInput<'save_note'>): Promise<AgentToolOutput<'save_note'>> {
		return this.reviews.change(
			{
				kind: 'replace',
				noteId: input.noteId as NoteId,
				markdown: input.markdown
			},
			'authored'
		);
	}
	async edit_note(input: AgentToolInput<'edit_note'>): Promise<AgentToolOutput<'edit_note'>> {
		return this.reviews.change(
			{
				kind: 'patch',
				noteId: input.noteId as NoteId,
				edits: input.edits
			},
			'authored'
		);
	}
	async rename_note(input: AgentToolInput<'rename_note'>): Promise<AgentToolOutput<'rename_note'>> {
		return this.toolPresentation.projectNoteWrite(
			(await this.controllers.notes().rename(this.actor, input)).note
		);
	}
	async archive_note(
		input: AgentToolInput<'archive_note'>
	): Promise<AgentToolOutput<'archive_note'>> {
		return this.toolPresentation.projectNoteWrite(
			(await this.controllers.notes().archive(this.actor, input)).note
		);
	}
	async restore_note(
		input: AgentToolInput<'restore_note'>
	): Promise<AgentToolOutput<'restore_note'>> {
		return this.toolPresentation.projectNoteWrite(
			(await this.controllers.notes().restore(this.actor, input)).note
		);
	}
	async list_trashed_notes(
		input: AgentToolInput<'list_trashed_notes'>
	): Promise<AgentToolOutput<'list_trashed_notes'>> {
		return this.controllers.notes().listTrash(this.actor, input);
	}
	async delete_note_forever(
		input: AgentToolInput<'delete_note_forever'>
	): Promise<AgentToolOutput<'delete_note_forever'>> {
		return this.controllers.notes().deleteForever(this.actor, input);
	}
	async empty_note_trash(
		input: AgentToolInput<'empty_note_trash'>
	): Promise<AgentToolOutput<'empty_note_trash'>> {
		return this.controllers.notes().emptyTrash(this.actor, input);
	}
	async list_note_versions(
		input: AgentToolInput<'list_note_versions'>
	): Promise<AgentToolOutput<'list_note_versions'>> {
		return this.controllers.notes().listRevisions(this.actor, input);
	}
	async diff_note_versions(
		input: AgentToolInput<'diff_note_versions'>
	): Promise<AgentToolOutput<'diff_note_versions'>> {
		return this.controllers.notes().compareRevisions(this.actor, input);
	}
	async restore_note_version(
		input: AgentToolInput<'restore_note_version'>
	): Promise<AgentToolOutput<'restore_note_version'>> {
		// The etag survives the projection: publish_note takes it as an argument, and
		// restoring a version is the step most likely to be followed by publishing it.
		const restored = await this.controllers.notes().restoreRevision(this.actor, input);
		return { ...this.toolPresentation.projectNoteWrite(restored.note), etag: restored.etag };
	}
	async publish_note(
		input: AgentToolInput<'publish_note'>
	): Promise<AgentToolOutput<'publish_note'>> {
		const published = await this.controllers.notes().publish(this.actor, input);
		return { ...this.toolPresentation.projectNoteWrite(published.note), etag: published.etag };
	}
	async discard_note_draft(
		input: AgentToolInput<'discard_note_draft'>
	): Promise<AgentToolOutput<'discard_note_draft'>> {
		return this.controllers.notes().discardDraft(this.actor, input);
	}
}
