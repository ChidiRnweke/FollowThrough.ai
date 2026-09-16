import AdmZip from 'adm-zip';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';
import {
	noteContentFromMarkdown,
	noteMarkdownFromContent
} from '$lib/server/services/notes/markdown';
import {
	readMarkdownArchive,
	parseMarkdownNote,
	describeArchiveRejection
} from '$lib/remote/notes/archive-reader.server';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	projectBuilder,
	testActor,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

export const archiveBytes = (files: Readonly<Record<string, string>>): Uint8Array => {
	const zip = new AdmZip();
	for (const [path, content] of Object.entries(files)) zip.addFile(path, Buffer.from(content));
	return new Uint8Array(zip.toBuffer());
};

export const importedNotesFixture = () => {
	const records = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository(records);
	projects.projects = [projectBuilder()];
	const catalog = new NoteCatalog(records, new InMemoryAnchorRepository(), projects);
	const consequences = new InMemoryNoteContent();
	const folders = new ProjectCatalog(projects, projects);
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			noteCreator: catalog,
			noteEditor: catalog,
			anchorRepairer: catalog,
			noteLinkReconciler: consequences,
			noteIndexer: consequences,
			folderCreator: folders,
			markdown: { read: noteContentFromMarkdown, write: noteMarkdownFromContent },
			transactionRunner: new InMemoryTransactionRunner([records, consequences])
		})
	);
	const run = (files: Readonly<Record<string, string>>) => {
		const archive = readMarkdownArchive(archiveBytes(files));
		if (!archive.ok) throw new Error(describeArchiveRejection(archive.rejection));
		return controller.importMarkdownArchive(testActor(), {
			projectId: testProjectId(),
			notes: archive.result.entries.map(parseMarkdownNote),
			skipped: archive.result.skipped
		});
	};
	return { records, projects, consequences, controller, folders, run };
};
