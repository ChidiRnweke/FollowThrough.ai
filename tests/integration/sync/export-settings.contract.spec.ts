import { describe, expect, it } from 'vitest';
import { defaultExportSettings } from '$lib/models/deliverables';
import {
	Deliverables,
	type DeliverablesDependencies
} from '$lib/server/controllers/deliverables/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { ExportSettingsRecords } from '$lib/server/repositories/deliverables/postgres/export-settings';
import { ArtifactLibrary } from '$lib/server/services/deliverables/artifacts';
import {
	InMemoryArtifactRepository,
	InMemoryAttachmentStorage,
	InMemoryTemplateRepository
} from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { actor, context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const sync = createSyncCapability({ db: database, transactionRunner });
	const settings = new ExportSettingsRecords(database);
	const artifacts = new ArtifactLibrary(
		new InMemoryArtifactRepository(),
		new InMemoryAttachmentStorage(),
		async () => {
			throw new Error('Settings do not generate files');
		},
		async () => {
			throw new Error('Settings do not generate files');
		},
		new InMemoryProvenanceRecorder(),
		new InMemoryNoteContent(),
		new InMemoryTemplateRepository(),
		transactionRunner,
		settings,
		{
			downloadById: async () => {
				throw new Error('Settings do not download files');
			}
		},
		() => {
			throw new Error('Settings do not generate bundles');
		}
	);
	const controller = new Deliverables(
		capabilityDependencies<DeliverablesDependencies>({
			syncMutations: sync.mutations,
			exportSettingsWriter: artifacts
		})
	);
	return { ...seeded, controller, sync, settings };
};

describe('guarded export default writes', () => {
	it('creates a missing override once after a lost response', async () => {
		const { owner, project, controller, settings } = await setup('9391');
		const selected = { ...defaultExportSettings, fontSize: 14 };
		const input = {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command: {
				kind: 'updateExportSettings' as const,
				userId: owner.userId,
				projectId: project.id,
				settings: selected
			}
		};
		await controller.synchronize(owner, input);
		await controller.synchronize(owner, input);
		expect(await settings.find(owner, project.id)).toEqual(selected);
	});
	it('preserves another client’s override when an absent-base form is submitted late', async () => {
		const { owner, project, controller, settings } = await setup('9392');
		await settings.upsert(owner, project.id, { ...defaultExportSettings, fontSize: 16 });
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command: {
				kind: 'updateExportSettings',
				userId: owner.userId,
				projectId: project.id,
				settings: defaultExportSettings
			}
		});
		expect({ kind: result.kind, settings: await settings.find(owner, project.id) }).toEqual({
			kind: 'conflict',
			settings: { ...defaultExportSettings, fontSize: 16 }
		});
	});
	it('rejects writes to a project owned by another account', async () => {
		const { project, controller } = await setup('9393');
		const outsider = actor('9394');
		const result = await controller.synchronize(outsider, {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command: {
				kind: 'updateExportSettings',
				userId: outsider.userId,
				projectId: project.id,
				settings: defaultExportSettings
			}
		});
		expect({
			kind: result.kind,
			rows: await context.client`select user_id from export_settings where project_id = ${project.id}`
		}).toEqual({ kind: 'rejected', rows: [] });
	});
});
