import type {
	ActorContext,
	ImportMarkdownArchiveInput,
	ImportMarkdownArchiveOutput,
	CreateFolderInput,
	CreateFolderOutput,
	CreateNoteInput,
	CreateNoteOutput,
	Note,
	NoteId,
	SaveNoteInput,
	SaveNoteOutput
} from '$lib/models';
import { resolveWikiLinks } from '$lib/models';
import { ValidationError } from '$lib/errors';
import { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';
import {
	DEFAULT_ARCHIVE_LIMITS,
	describeArchiveRejection,
	parseMarkdownNote,
	readMarkdownArchive,
	uniqueTitleIn,
	unmappedFrontmatterKeys,
	type ParsedMarkdownNote
} from '$lib/server/services/notes/import';

export interface ImportsController {
	importMarkdownArchive(
		actor: ActorContext,
		input: ImportMarkdownArchiveInput
	): Promise<ImportMarkdownArchiveOutput>;
}

export interface ImportsDependencies {
	readonly notes: {
		create(actor: ActorContext, input: CreateNoteInput): Promise<CreateNoteOutput>;
		save(actor: ActorContext, input: SaveNoteInput): Promise<SaveNoteOutput>;
	};
	readonly projects: {
		createFolder(actor: ActorContext, input: CreateFolderInput): Promise<CreateFolderOutput>;
	};
}

/**
 * Bulk-importing a zip of Markdown notes.
 *
 * Deliberately not transactional. A four-hundred-note vault with three malformed files
 * should import three hundred and ninety-seven and say which three it could not read —
 * rolling the lot back because of one bad file is the wrong trade for an onboarding
 * action, and a partial import that reports itself honestly is recoverable.
 */
export class NoteImportsController implements ImportsController {
	constructor(private readonly dependencies: ImportsDependencies) {}

	async importMarkdownArchive(
		actor: ActorContext,
		input: ImportMarkdownArchiveInput
	): Promise<ImportMarkdownArchiveOutput> {
		const outcome = readMarkdownArchive(input.archive, DEFAULT_ARCHIVE_LIMITS);
		if (!outcome.ok) throw new ValidationError(describeArchiveRejection(outcome.rejection));

		const notes = outcome.result.entries.map(parseMarkdownNote);
		const folders = await this.createFolders(actor, input, notes);
		const created = await this.createNotes(actor, input, notes, folders);

		return {
			importedNoteIds: created.importedNoteIds,
			createdFolderIds: [...folders.values()],
			skipped: outcome.result.skipped,
			failed: created.failed,
			unmappedFrontmatterKeys: unmappedFrontmatterKeys(notes)
		};
	}

	/** One folder note per distinct directory, parents before children. */
	private async createFolders(
		actor: ActorContext,
		input: ImportMarkdownArchiveInput,
		notes: readonly ParsedMarkdownNote[]
	): Promise<Map<string, NoteId>> {
		const paths = new Set<string>();
		for (const note of notes)
			for (let depth = 1; depth <= note.folders.length; depth += 1)
				paths.add(note.folders.slice(0, depth).join('/'));

		const created = new Map<string, NoteId>();
		// Shortest first, so a folder's parent always exists by the time it is created.
		for (const path of [...paths].sort((a, b) => a.split('/').length - b.split('/').length)) {
			const segments = path.split('/');
			const parentPath = segments.slice(0, -1).join('/');
			const parentId = parentPath ? created.get(parentPath) : input.parentId;
			const output = await this.dependencies.projects.createFolder(actor, {
				projectId: input.projectId,
				name: segments[segments.length - 1],
				...(parentId ? { parentId } : {})
			});
			created.set(path, output.folder.id);
		}
		return created;
	}

	private async createNotes(
		actor: ActorContext,
		input: ImportMarkdownArchiveInput,
		notes: readonly ParsedMarkdownNote[],
		folders: ReadonlyMap<string, NoteId>
	): Promise<{
		importedNoteIds: NoteId[];
		failed: { path: string; message: string }[];
	}> {
		const importedNoteIds: NoteId[] = [];
		const failed: { path: string; message: string }[] = [];
		// Titles are unique per destination folder, not per import: two notes called
		// "Index" in different folders are not a collision.
		const takenByFolder = new Map<string, Set<string>>();
		/**
		 * Two passes, because a vault's links point in both directions: a note early in the
		 * archive routinely links to one that appears later, and only after every note exists
		 * is every title resolvable. The first pass creates and names, the second writes
		 * bodies with links resolved.
		 */
		const pending: { note: ParsedMarkdownNote; created: Note }[] = [];
		const titlesToIds = new Map<string, NoteId>();

		for (const note of notes) {
			const folderPath = note.folders.join('/');
			const parentId = folderPath ? folders.get(folderPath) : input.parentId;
			const taken = takenByFolder.get(folderPath) ?? new Set<string>();
			takenByFolder.set(folderPath, taken);
			try {
				const created = await this.dependencies.notes.create(actor, {
					projectId: input.projectId,
					title: uniqueTitleIn(taken, note.title),
					...(parentId ? { parentId } : {})
				});
				// Keyed on the title as written in the archive, since that is what a
				// `[[Wiki Link]]` names — not the suffixed title a collision produced.
				titlesToIds.set(note.title.trim().toLowerCase(), created.note.id);
				pending.push({ note, created: created.note });
				importedNoteIds.push(created.note.id);
			} catch (error) {
				failed.push({
					path: note.path,
					message: error instanceof Error ? error.message : 'Could not be imported.'
				});
			}
		}

		for (const { note, created } of pending) {
			if (!note.markdown.trim()) continue;
			try {
				await this.dependencies.notes.save(actor, {
					note: {
						...created,
						...noteContentFromMarkdown(resolveWikiLinks(note.markdown, titlesToIds))
					}
				});
			} catch (error) {
				failed.push({
					path: note.path,
					message: error instanceof Error ? error.message : 'Its body could not be imported.'
				});
			}
		}

		return { importedNoteIds, failed };
	}
}
