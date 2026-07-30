import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { NoteImportsController } from './controller';
import type { NotesController } from '../notes/controller';
import type { ProjectsController } from '../projects/controller';
import { noteBuilder, testActor } from '$lib/testing/fixtures/domain-builders';
import type {
	ActorContext,
	CreateFolderInput,
	CreateNoteInput,
	Note,
	NoteId,
	ProjectId,
	SaveNoteInput
} from '$lib/models';
import { ValidationError } from '$lib/errors';

const projectId = crypto.randomUUID() as ProjectId;

/**
 * Hand-rolled fakes over the two controllers an import composes, recording what it asked
 * for. `failTitles` lets a single file fail so the partial-import behaviour is observable.
 */
class FakeWorkspace {
	created: { title: string; parentId?: NoteId }[] = [];
	folders: { name: string; parentId?: NoteId }[] = [];
	saved: { id: NoteId; plainText: string }[] = [];
	/** Kept separately so a spec can assert on marks, not just text. */
	savedDocuments: { path: string; document: unknown }[] = [];
	failTitles = new Set<string>();
	/** Note id back to the archive path, so a spec can find one saved body. */
	pathFor = new Map<NoteId, string>();

	notes: NotesController = {
		create: async (_actor: ActorContext, input: CreateNoteInput) => {
			if (this.failTitles.has(input.title)) throw new Error('Refused by the fake');
			this.created.push({
				title: input.title,
				...(input.parentId ? { parentId: input.parentId } : {})
			});
			const note = noteBuilder({ id: crypto.randomUUID() as NoteId, title: input.title });
			this.pathFor.set(note.id, `${input.title}.md`);
			return { note };
		},
		save: async (_actor: ActorContext, input: SaveNoteInput) => {
			this.saved.push({ id: input.note.id, plainText: input.note.plainText });
			this.savedDocuments.push({
				path: this.pathFor.get(input.note.id) ?? '',
				document: input.note.document
			});
			return { note: input.note as Note, etag: 'note:x:r1', repairedAnchorIds: [] };
		}
	} as unknown as NotesController;

	projects: ProjectsController = {
		createFolder: async (_actor: ActorContext, input: CreateFolderInput) => {
			this.folders.push({
				name: input.name,
				...(input.parentId ? { parentId: input.parentId } : {})
			});
			return {
				folder: noteBuilder({
					id: crypto.randomUUID() as NoteId,
					title: input.name,
					kind: 'folder'
				})
			};
		}
	} as unknown as ProjectsController;
}

const zipOf = (files: Readonly<Record<string, string>>): Uint8Array => {
	const zip = new AdmZip();
	for (const [path, content] of Object.entries(files))
		zip.addFile(path, Buffer.from(content, 'utf8'));
	return new Uint8Array(zip.toBuffer());
};

const importArchive = (workspace: FakeWorkspace, files: Readonly<Record<string, string>>) =>
	new NoteImportsController({
		notes: workspace.notes,
		projects: workspace.projects
	}).importMarkdownArchive(testActor(), {
		projectId,
		archive: zipOf(files),
		fileName: 'vault.zip'
	});

describe('Importing a Markdown archive', () => {
	it('creates a note for each Markdown file', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'one.md': '# One', 'two.md': '# Two' });
		expect(workspace.created.map((note) => note.title)).toEqual(['one', 'two']);
	});

	it('writes the file body into the note', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'one.md': '# One\n\nThe body.' });
		expect(workspace.saved[0]?.plainText).toContain('The body.');
	});

	it('reports the notes it created', async () => {
		const workspace = new FakeWorkspace();
		const report = await importArchive(workspace, { 'one.md': '# One' });
		expect(report.importedNoteIds).toHaveLength(1);
	});

	it('does not save a body for an empty file', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'one.md': '   ' });
		expect(workspace.saved).toHaveLength(0);
	});
});

describe('Recreating the archive’s folders', () => {
	it('creates a folder for each directory', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'a/one.md': '# One', 'b/two.md': '# Two' });
		expect(workspace.folders.map((folder) => folder.name)).toEqual(['a', 'b']);
	});

	it('creates each folder once for sibling files', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'a/one.md': '# One', 'a/two.md': '# Two' });
		expect(workspace.folders).toHaveLength(1);
	});

	it('creates a parent folder before its child', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'a/b/one.md': '# One' });
		expect(workspace.folders.map((folder) => folder.name)).toEqual(['a', 'b']);
	});

	it('nests a child folder under its parent', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'a/b/one.md': '# One' });
		expect(workspace.folders[1]?.parentId).toBeDefined();
	});

	it('puts a note inside its folder', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'a/one.md': '# One' });
		expect(workspace.created[0]?.parentId).toBeDefined();
	});

	it('leaves a root-level note unparented', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'one.md': '# One' });
		expect(workspace.created[0]?.parentId).toBeUndefined();
	});
});

describe('Surviving a partly broken archive', () => {
	/** A 400-note vault with three bad files should import 397, not zero. */
	it('keeps importing after one file fails', async () => {
		const workspace = new FakeWorkspace();
		workspace.failTitles.add('two');
		await importArchive(workspace, { 'one.md': '# One', 'two.md': '# Two', 'three.md': '# Three' });
		expect(workspace.created.map((note) => note.title)).toEqual(['one', 'three']);
	});

	it('names the file that failed', async () => {
		const workspace = new FakeWorkspace();
		workspace.failTitles.add('two');
		const report = await importArchive(workspace, { 'one.md': '# One', 'two.md': '# Two' });
		expect(report.failed[0]?.path).toBe('two.md');
	});

	it('does not count a failed file as imported', async () => {
		const workspace = new FakeWorkspace();
		workspace.failTitles.add('two');
		const report = await importArchive(workspace, { 'one.md': '# One', 'two.md': '# Two' });
		expect(report.importedNoteIds).toHaveLength(1);
	});

	it('reports a non-Markdown file as skipped', async () => {
		const workspace = new FakeWorkspace();
		const report = await importArchive(workspace, { 'one.md': '# One', 'logo.png': 'binary' });
		expect(report.skipped.map((skip) => skip.path)).toEqual(['logo.png']);
	});

	it('rejects an archive that is not a zip', async () => {
		const workspace = new FakeWorkspace();
		const controller = new NoteImportsController({
			notes: workspace.notes,
			projects: workspace.projects
		});
		await expect(
			controller.importMarkdownArchive(testActor(), {
				projectId,
				archive: new Uint8Array([1, 2, 3]),
				fileName: 'broken.zip'
			})
		).rejects.toThrow(ValidationError);
	});
});

describe('Keeping imported names distinct', () => {
	it('suffixes a duplicate title in the same folder', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'notes.md': '# A', 'a/notes.md': '# B' });
		expect(workspace.created.map((note) => note.title)).toEqual(['notes', 'notes']);
	});

	/** Two files called Index in different folders are not a collision. */
	it('allows the same title in different folders', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'a/index.md': '# Index', 'b/index.md': '# Index' });
		expect(workspace.created.map((note) => note.title)).toEqual(['index', 'index']);
	});

	it('reports frontmatter it could not map', async () => {
		const workspace = new FakeWorkspace();
		const report = await importArchive(workspace, {
			'one.md': '---\ntitle: One\ntags: [a]\n---\nBody.'
		});
		expect(report.unmappedFrontmatterKeys).toEqual(['tags', 'title']);
	});
});

/**
 * A vault's links point in both directions, so resolution needs every note to exist
 * before any body is written.
 */
describe('Resolving wiki links in an imported vault', () => {
	it('turns a wiki link into a note link', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, {
			'index.md': 'see [[design]]',
			'design.md': 'The design.'
		});
		expect(workspace.saved[0]?.plainText).toContain('design');
	});

	it('resolves a link to a note that appears later in the archive', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, {
			'aaa.md': 'see [[zzz]]',
			'zzz.md': 'The target.'
		});
		const linked = workspace.savedDocuments.find((entry) => entry.path === 'aaa.md');
		expect(JSON.stringify(linked?.document)).toContain('noteLink');
	});

	it('leaves an unresolvable wiki link as written', async () => {
		const workspace = new FakeWorkspace();
		await importArchive(workspace, { 'index.md': 'see [[nothing here]]' });
		expect(workspace.saved[0]?.plainText).toContain('[[nothing here]]');
	});
});
