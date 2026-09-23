import { vi } from 'vitest';
import postgres from 'postgres';
import type { Database } from '$lib/server/db';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { BUILT_INS, RETIRED_BUILT_INS } from '$lib/server/services/skills/built-in-definitions';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { SkillPins } from '$lib/server/services/skills/pins';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { Skills, type SkillsDependencies } from '$lib/server/controllers/skills/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { context } from '../database-harness';

export const skillController = (database: Database, transactionRunner: TransactionRunner) => {
	const projects = new ProjectRecords(database);
	const notes = new NoteRecords(database);
	const skills = new SkillRecords(database);
	const library = new SkillLibrary(skills, notes, new ProvenanceRecords(database));
	const catalog = new NoteCatalog(notes, new SourceAnchorRecords(database), projects);
	const content = new InMemoryNoteContent();
	return new Skills(
		capabilityDependencies<SkillsDependencies>({
			transactionRunner,
			builtInSkills: new BuiltInSkills(projects, notes, skills, {
				active: BUILT_INS,
				retired: RETIRED_BUILT_INS
			}),
			skillFinder: library,
			skillEditor: library,
			skillPinWriter: new SkillPins(projects, notes, skills),
			skillUsageLister: library,
			noteEditor: catalog,
			revisionReader: catalog,
			revisionRecorder: catalog,
			attachmentRestorer: catalog,
			anchorRepairer: catalog,
			noteLinkReconciler: content,
			noteIndexer: content
		})
	);
};

/** Commit the first controller write only after the competing write reaches a PostgreSQL lock. */
export const competingSkillWrites = async <T>(
	first: (controller: Skills) => Promise<void>,
	second: (controller: Skills) => Promise<T>
) => {
	const holder = connectPostgresTestDatabase(context.url);
	const writer = connectPostgresTestDatabase(context.url);
	const observer = postgres(context.url, { max: 1 });
	const held = createTransactionContext(holder.db);
	const write = createTransactionContext(writer.db);
	const ready = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const holding = held.transactionRunner.run(async () => {
		await first(skillController(held.database, held.transactionRunner));
		ready.resolve();
		await release.promise;
	});
	void holding.catch((error) => {
		ready.reject(error);
		return { kind: 'failure', error };
	});
	try {
		await ready.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const writing = second(skillController(write.database, write.transactionRunner)).then(
			(value) => ({ kind: 'success' as const, value }),
			(error: Error) => ({ kind: 'failure' as const, error })
		);
		await vi.waitFor(async () => {
			const rows = await observer<{ pid: number }[]>`
				select pid from pg_stat_activity
				where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (rows.length !== 1) throw new Error('The competing skill write has not reached its lock');
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
