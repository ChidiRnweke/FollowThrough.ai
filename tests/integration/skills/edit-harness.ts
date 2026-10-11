import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import type { ActorContext } from '$lib/models/identity';
import { NoteMarkdownCodec } from '$lib/infrastructure/notes/markdown';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { SkillPortabilityService } from '$lib/services/skills/manifest';
import { SkillMetadataEditingService } from '$lib/services/skills/metadata';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { vi } from 'vitest';
import postgres from 'postgres';
import type { Database } from '$lib/server/db';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { BUILT_INS, RETIRED_BUILT_INS } from '$lib/server/services/skills/built-in-definitions';
import { createSkillServices } from '$lib/server/factories/capabilities/skills-capability-factory';
import { SkillPins } from '$lib/server/services/skills/pins';
import { SelectionOrigins } from '$lib/server/services/notes/selection-origin';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import { Skills, type SkillsDependencies } from '$lib/server/controllers/skills/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { context } from '../database-harness';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';

export const skillController = (
	actor: ActorContext,
	database: Database,
	transactionRunner: TransactionRunner
) => {
	const projects = new ProjectRecords(actor, database);
	const notes = new NoteRecords(actor, database);
	const skills = new SkillRecords(actor, database);
	const provenance = new ProvenanceRecords(actor, database);
	const library = createSkillServices(actor, skills, notes, provenance, testClock);
	const catalog = createNoteServices(
		actor,
		notes,
		new SourceAnchorRecords(actor, database),
		projects,
		testClock
	);
	const content = new InMemoryNoteContent(actor);
	const sync = createSyncCapability(actor, { db: database });
	return new Skills(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<SkillsDependencies>({
			skillPortability: new SkillPortabilityService(),
			skillMetadataEditing: new SkillMetadataEditingService(),
			noteReferences: new NoteReferenceService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			transactionRunner,
			selectionOrigins: new SelectionOrigins(
				actor,
				notes,
				new SourceAnchorRecords(actor, database),
				provenance
			),
			syncMutations: sync.mutations,
			syncRetry: sync.mutationRetry,
			builtInSkills: new BuiltInSkills(
				actor,
				projects,
				notes,
				skills,
				{
					active: BUILT_INS,
					retired: RETIRED_BUILT_INS
				},
				testClock
			),
			skillFinder: library.finder,
			skillCreator: library.creator,
			noteCreation: catalog.creator,
			skillEditor: library.editor,
			skillPinWriter: new SkillPins(projects, notes, skills),
			skillUsageLister: library.usageLister,
			skillUsageRecorder: library.usageRecorder,
			noteAuthoring: catalog.authoring,
			revisionReader: catalog.library,
			noteLinkReconciler: content,
			noteIndexer: content,
			markdown: new NoteMarkdownCodec()
		})
	);
};

/** Commit the first controller write only after the competing write reaches a PostgreSQL lock. */
export const competingSkillWrites = async <T>(
	actor: ActorContext,
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
		await first(skillController(actor, held.database, held.transactionRunner));
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
		const writing = second(skillController(actor, write.database, write.transactionRunner)).then(
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
