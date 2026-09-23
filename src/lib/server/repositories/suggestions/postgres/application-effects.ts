import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '$lib/server/db';
import type { ActorContext } from '$lib/models/identity';
import type { SuggestionId } from '$lib/models/suggestions';
import {
	applicationEffectSchema,
	type AppliedChange,
	type ApplicationEffect,
	type RecordedChange
} from '$lib/models/proposal-effects';
import { resourceDataSchemas, todoRecordFields } from '$lib/models/workspace-records';
import type { ApplicationEffectRepository, AppliedRecord } from '../application-effects';
import { WorkspaceSyncObjects } from '$lib/server/repositories/workspace/sync-objects';
import { InvalidTransitionError } from '$lib/errors';

const recordSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('todos'), value: resourceDataSchemas.todos }),
	z.object({
		type: z.literal('note_relationships'),
		value: resourceDataSchemas.note_relationships
	}),
	z.object({
		type: z.literal('references'),
		value: resourceDataSchemas.references.omit({ projectId: true })
	}),
	z.object({ type: z.literal('diagrams'), value: resourceDataSchemas.diagrams }),
	z.object({ type: z.literal('memory_entries'), value: resourceDataSchemas.memory_entries })
]);
const effectSchema = applicationEffectSchema(recordSchema).superRefine((effect, context) => {
	const identities = new Set<string>();
	for (const [index, change] of effect.changes.entries()) {
		const identity = change.after.type + ':' + change.after.value.id;
		if (identities.has(identity))
			context.addIssue({
				code: 'custom',
				message: 'A participant can occur only once in a recorded effect',
				path: ['changes', index]
			});
		identities.add(identity);
		if (
			change.kind === 'modified' &&
			(change.before.type !== change.after.type ||
				change.before.value.id !== change.after.value.id ||
				change.before.value.userId !== change.after.value.userId)
		)
			context.addIssue({
				code: 'custom',
				message: 'A recorded change must describe one owned participant',
				path: ['changes', index]
			});
	}
});
const column = (key: string) => key.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase());

export class SuggestionEffectRecords implements ApplicationEffectRepository {
	private readonly objects: WorkspaceSyncObjects;
	constructor(private readonly db: Database) {
		this.objects = new WorkspaceSyncObjects(db);
	}
	async lock(actor: ActorContext, id: SuggestionId): Promise<void> {
		await this.db.execute(
			sql`select id from suggestions where id=${id} and user_id=${actor.userId} for update`
		);
	}
	async find(
		actor: ActorContext,
		id: SuggestionId
	): Promise<ApplicationEffect<AppliedRecord> | null> {
		const result = await this.db.execute(
			sql`select effect from suggestion_application_effects where suggestion_id=${id} and user_id=${actor.userId}`
		);
		const rows = z.array(z.object({ effect: effectSchema }));
		const parsed = z
			.union([rows, z.object({ rows })])
			.transform((value) => (Array.isArray(value) ? value : value.rows))
			.parse(result);
		return parsed[0]?.effect ?? null;
	}
	async lockVersion(actor: ActorContext, record: AppliedRecord): Promise<string | null> {
		await this.db.execute(
			sql`select id from ${sql.identifier(record.type)} where id=${record.value.id} and user_id=${actor.userId} for update`
		);
		const current = await this.objects.read(
			actor,
			{ type: record.type, id: [record.value.id] },
			null
		);
		return current.kind === 'found' ? current.snapshot.etag : null;
	}
	async record(
		actor: ActorContext,
		id: SuggestionId,
		changes: readonly AppliedChange<AppliedRecord>[]
	): Promise<void> {
		await this.db.execute(sql`SET CONSTRAINTS workspace_sync_journal IMMEDIATE`);
		await this.db.execute(sql`SET CONSTRAINTS workspace_sync_journal DEFERRED`);
		const recorded: RecordedChange<AppliedRecord>[] = [];
		for (const change of changes) {
			const current = await this.objects.read(
				actor,
				{ type: change.after.type, id: [change.after.value.id] },
				null
			);
			if (current.kind !== 'found')
				throw new InvalidTransitionError('An applied proposal participant is unavailable');
			const after = recordSchema.parse(current.snapshot.value);
			recorded.push(
				change.kind === 'unchanged'
					? { kind: 'unchanged', after }
					: { ...change, after, version: current.snapshot.etag }
			);
		}
		const effect = effectSchema.parse({ changes: recorded });
		await this.db.execute(
			sql`insert into suggestion_application_effects (suggestion_id,user_id,effect) values (${id},${actor.userId},${JSON.stringify(effect)}::jsonb)`
		);
	}
	async restore(actor: ActorContext, change: AppliedChange<AppliedRecord>): Promise<AppliedRecord> {
		if (change.kind === 'unchanged') return change.after;
		const record = change.kind === 'modified' ? change.before : change.after;
		if (change.kind === 'created') {
			if (record.type === 'todos' || record.type === 'memory_entries') {
				await this.db.execute(
					sql`update ${sql.identifier(record.type)} set deleted_at=now(),updated_at=now() where id=${record.value.id} and user_id=${actor.userId}`
				);
			} else if (record.type === 'diagrams') {
				await this.db.execute(
					sql`update diagrams set archived_at=now(),updated_at=now() where id=${record.value.id} and user_id=${actor.userId}`
				);
			} else {
				await this.db.execute(
					sql`delete from ${sql.identifier(record.type)} where id=${record.value.id} and user_id=${actor.userId}`
				);
				return record;
			}
		} else {
			const payload = Object.fromEntries(
				Object.entries(record.value).map(([key, value]) => [column(key), value])
			);
			// Missing optional fields are restored as SQL null, through the typed table record.
			const shape =
				record.type === 'diagrams'
					? {
							...resourceDataSchemas.diagrams.options[0].shape,
							...resourceDataSchemas.diagrams.options[1].shape
						}
					: record.type === 'references'
						? resourceDataSchemas.references.omit({ projectId: true }).shape
						: record.type === 'todos'
							? todoRecordFields
							: resourceDataSchemas[record.type].shape;
			const allFields = Object.keys(shape).filter((key) => key !== 'id' && key !== 'userId');
			const names = sql.join(
				allFields.map((key) => sql.identifier(column(key))),
				sql`, `
			);
			const selected = sql.join(
				allFields.map((key) =>
					key === 'updatedAt' ? sql`now()` : sql`p.${sql.identifier(column(key))}`
				),
				sql`, `
			);
			await this.db.execute(
				sql`update ${sql.identifier(record.type)} set (${names})=(select ${selected} from jsonb_populate_record(null::${sql.identifier(record.type)},${JSON.stringify(payload)}::jsonb) p) where id=${record.value.id} and user_id=${actor.userId}`
			);
		}
		const current = await this.objects.read(
			actor,
			{ type: record.type, id: [record.value.id] },
			null
		);
		if (current.kind !== 'found')
			throw new InvalidTransitionError('A restored proposal participant is unavailable');
		return recordSchema.parse(current.snapshot.value);
	}
}
