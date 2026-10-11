import type { ActorContext } from '$lib/models/identity';
import type { Database } from '$lib/server/db';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import {
	Workspace,
	type WorkspaceController,
	type WorkspaceDependencies
} from '$lib/server/controllers/workspace/controller';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { createSkillsCapability } from '$lib/server/factories/capabilities/skills-capability-factory';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { TodayPresentationService } from '$lib/services/workspace/today';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

/** Complete pull operation with real persistence and the production capability wiring. */
export function workspacePullFixture(actor: ActorContext, db: Database): WorkspaceController {
	const { database, transactionRunner } = createTransactionContext(db);
	const synchronization = createSyncCapability(actor, { db: database });
	const skills = createSkillsCapability(actor, {
		db: database,
		projects: new ProjectRecords(actor, database),
		notes: new NoteRecords(actor, database),
		provenance: new ProvenanceRecords(actor, database)
	});
	return new Workspace(
		new TodayPresentationService(),
		capabilityDependencies<WorkspaceDependencies>({
			transactionRunner,
			builtInSkills: skills.builtIns,
			syncChanges: synchronization.changes,
			resourceVersions: synchronization.resourceVersions,
			resourceKeys: synchronization.resourceKeys
		})
	);
}
