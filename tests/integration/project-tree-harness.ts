import { NoteArchiveImportService } from '$lib/server/services/notes/import';
import { NotePatchPreparationService } from '$lib/server/services/notes/patches';
import { NoteRevisionComparisonService } from '$lib/server/services/notes/revision-diff';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { ProjectDetailService } from '$lib/services/projects/details';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { vi } from 'vitest';
import postgres from 'postgres';
import type { Database } from '$lib/server/db';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { context } from './database-harness';

export const treeControllers = (database: Database, transactionRunner: TransactionRunner) => {
	const projects = new ProjectRecords(database);
	const catalog = createProjectServices(projects, projects);
	const records = new NoteRecords(database);
	const notes = createNoteServices(records, new SourceAnchorRecords(database), projects);
	return {
		records,
		projects: new Projects(
			capabilityDependencies<ProjectsDependencies>({
				noteCreationRules: new NoteLifecycleRulesService(),
				details: new ProjectDetailService(),
				presentation: new ProjectTreePresentationService(),
				placement: catalog.placement,
				projectLifecycle: catalog.lifecycle,
				entryWriter: catalog.treeWriter,
				projectEditor: catalog.editor,
				noteCreation: notes.creator,
				transactionRunner
			})
		),
		notes: new Notes(
			capabilityDependencies<NotesDependencies>({
				archiveImport: new NoteArchiveImportService(),
				patchPreparation: new NotePatchPreparationService(),
				revisionComparison: new NoteRevisionComparisonService(),
				todoPresentation: new TodoPresentationService(),
				textSearch: new NoteTextSearchService(),
				noteReferences: new NoteReferenceService(),
				sections: new NoteSectionNumberingService(),
				noteCreationRules: new NoteLifecycleRulesService(),
				noteTrashRules: new NoteLifecycleRulesService(),
				notePublicationRules: new NoteLifecycleRulesService(),
				noteEditingRules: new NoteEditingRulesService(),
				notePresentation: new NotePresentationService(),
				suggestionPresentation: new SuggestionPresentationService(),
				noteCreation: notes.creator,
				noteTrash: notes.trash,
				noteDeletion: notes.deletion,
				noteIndexer: new InMemoryNoteContent(),
				transactionRunner
			})
		)
	};
};

/** Hold an actual controller write open until the competing connection reaches its lock. */
export const competingTreeWrites = async <T>(
	first: (api: ReturnType<typeof treeControllers>) => Promise<void>,
	second: (api: ReturnType<typeof treeControllers>) => Promise<T>
) => {
	const holder = connectPostgresTestDatabase(context.url);
	const writer = connectPostgresTestDatabase(context.url);
	const observer = postgres(context.url, { max: 1 });
	const heldContext = createTransactionContext(holder.db);
	const writeContext = createTransactionContext(writer.db);
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const holding = heldContext.transactionRunner.run(async () => {
		await first(treeControllers(heldContext.database, heldContext.transactionRunner));
		locked.resolve();
		await release.promise;
	});
	// A setup failure must reject the readiness gate instead of leaving the test waiting.
	void holding.catch((error) => {
		locked.reject(error);
		return { kind: 'failure', error };
	});
	try {
		await locked.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const writing = second(
			treeControllers(writeContext.database, writeContext.transactionRunner)
		).then(
			(value) => ({ kind: 'success' as const, value }),
			(error: Error) => ({ kind: 'failure' as const, error })
		);
		await vi.waitFor(async () => {
			const rows = await observer<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (rows.length !== 1) throw new Error('The competing tree write has not reached its lock');
		});
		release.resolve();
		await holding;
		return await writing;
	} finally {
		release.resolve();
		try {
			await holding;
		} finally {
			await Promise.all([holder.close(), writer.close(), observer.end()]);
		}
	}
};
