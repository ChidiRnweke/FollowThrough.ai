import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { SuggestionId } from '$lib/models/suggestions';
import type { MemoryEntryId } from '$lib/models/memory';
import type { RelationshipId } from '$lib/models/relationships';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import { SuggestionEffectRecords } from '$lib/server/repositories/suggestions/postgres/application-effects';
import { SuggestionEffects } from '$lib/server/services/suggestions/effects';
import { RelationshipRecords } from '$lib/server/repositories/relationships/postgres/relationships';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import { mapAppliedChange } from '$lib/models/proposal-effects';
import { context, now, seedNote, seedProvenance } from '../database-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const provenance = await seedProvenance(seeded.owner, suffix);
	const transaction = createTransactionContext(context.db);
	const suggestions = new SuggestionRecords(transaction.database);
	const suggestion = await suggestions.insert(seeded.owner, {
		id: crypto.randomUUID() as SuggestionId,
		userId: seeded.owner.userId,
		noteId: seeded.note.id,
		kind: 'memory',
		status: 'proposed',
		payload: { operation: 'add', content: 'Original', projectId: seeded.project.id },
		provenanceId: provenance.id,
		isAutoAccepted: false,
		createdAt: now,
		updatedAt: now
	});
	const repository = new SuggestionEffectRecords(transaction.database);
	return {
		...seeded,
		...transaction,
		suggestions,
		suggestion,
		repository,
		effects: new SuggestionEffects(repository)
	};
};
const memoryReplacement = async (suffix: string) => {
	const state = await setup(suffix);
	const entries = new MemoryRecords(state.database);
	const original = await entries.insert(state.owner, {
		id: crypto.randomUUID() as MemoryEntryId,
		userId: state.owner.userId,
		projectId: state.project.id,
		content: 'Original',
		shareWithAgents: true,
		createdAt: now,
		updatedAt: now
	});
	const replacement = await state.transactionRunner.run(async () => {
		await state.effects.lock(state.owner, state.suggestion.id);
		const replacement = await entries.insert(state.owner, {
			...original,
			id: crypto.randomUUID() as MemoryEntryId,
			content: 'Replacement',
			replacesEntryId: original.id
		});
		const deleted = await entries.update(state.owner, { ...original, deletedAt: now });
		await state.effects.record(state.owner, state.suggestion.id, [
			{
				kind: 'modified',
				before: { type: 'memory_entries', value: original },
				after: { type: 'memory_entries', value: deleted }
			},
			{ kind: 'created', after: { type: 'memory_entries', value: replacement } }
		]);
		await state.suggestions.transition(state.owner, state.suggestion.id, 'proposed', {
			status: 'accepted',
			appliedArtifactId: replacement.id,
			decidedAt: now
		});
		return replacement;
	});
	const accepted = {
		...state.suggestion,
		status: 'accepted' as const,
		appliedArtifactId: replacement.id,
		decidedAt: now
	};
	return { ...state, entries, original, replacement, accepted };
};
describe('Durable proposal application effects', () => {
	it('restores both memory records from the recorded replacement', async () => {
		const state = await memoryReplacement('9501');
		await state.transactionRunner.run(async () => {
			await state.effects.lock(state.owner, state.suggestion.id);
			await state.effects.restore(state.owner, state.accepted);
		});
		expect(
			(await state.entries.list(state.owner, { projectId: state.project.id })).map((entry) => ({
				id: entry.id,
				content: entry.content
			}))
		).toEqual([{ id: state.original.id, content: 'Original' }]);
	});
	it('refuses stale undo before restoring either memory record', async () => {
		const state = await memoryReplacement('9502');
		await state.entries.update(state.owner, { ...state.replacement, content: 'Later edit' });
		const refused = await state.transactionRunner
			.run(async () => {
				await state.effects.lock(state.owner, state.suggestion.id);
				await state.effects.restore(state.owner, state.accepted);
			})
			.then(
				() => false,
				() => true
			);
		expect({
			refused,
			active: (await state.entries.list(state.owner, { projectId: state.project.id })).map(
				(entry) => entry.content
			)
		}).toEqual({ refused: true, active: ['Later edit'] });
	});
	it('preserves an existing relationship when undo restores its justification', async () => {
		const state = await setup('9503');
		const target = await seedNote('9504', state.owner);
		const relationships = new RelationshipRecords(state.database);
		const original = await relationships.insert(state.owner, {
			id: crypto.randomUUID() as RelationshipId,
			userId: state.owner.userId,
			sourceNoteId: state.note.id,
			targetNoteId: target.note.id,
			kind: 'elaborates',
			justification: 'Original',
			createdAt: now,
			updatedAt: now
		});
		await state.transactionRunner.run(async () => {
			const change = await relationships.insertWithChange(state.owner, {
				...original,
				id: crypto.randomUUID() as RelationshipId,
				justification: 'Suggested'
			});
			await state.effects.record(state.owner, state.suggestion.id, [
				mapAppliedChange(change, (value) => ({ type: 'note_relationships' as const, value }))
			]);
			await state.suggestions.transition(state.owner, state.suggestion.id, 'proposed', {
				status: 'accepted',
				appliedArtifactId: original.id,
				decidedAt: now
			});
		});
		await state.transactionRunner.run(async () => {
			await state.effects.lock(state.owner, state.suggestion.id);
			await state.effects.restore(state.owner, {
				...state.suggestion,
				status: 'accepted',
				appliedArtifactId: original.id,
				decidedAt: now
			});
		});
		expect(await relationships.findById(state.owner, original.id)).toMatchObject({
			id: original.id,
			justification: 'Original'
		});
	});
	it('rolls back restored records when the surrounding transaction fails', async () => {
		const state = await memoryReplacement('9505');
		await state.transactionRunner
			.run(async () => {
				await state.effects.lock(state.owner, state.suggestion.id);
				await state.effects.restore(state.owner, state.accepted);
				throw new Error('Rejected state write');
			})
			.catch((error) => ({ kind: 'failure', error }));
		expect(
			(await state.entries.list(state.owner, { projectId: state.project.id })).map(
				(entry) => entry.id
			)
		).toEqual([state.replacement.id]);
	});
	it('serializes two undo attempts with one completed state transition', async () => {
		const state = await memoryReplacement('9506');
		const connection = connectPostgresTestDatabase(context.url);
		const second = createTransactionContext(connection.db);
		const undo = async (transaction: typeof second) =>
			transaction.transactionRunner.run(async () => {
				const effects = new SuggestionEffects(new SuggestionEffectRecords(transaction.database));
				const suggestions = new SuggestionRecords(transaction.database);
				await effects.lock(state.owner, state.suggestion.id);
				const stored = await suggestions.findById(state.owner, state.suggestion.id);
				if (!stored) throw new Error('Missing suggestion');
				await effects.restore(state.owner, stored);
				return suggestions.transition(state.owner, state.suggestion.id, 'accepted', {
					status: 'reverted',
					decidedAt: now
				});
			});
		try {
			const results = await Promise.allSettled([undo(state), undo(second)]);
			expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
		} finally {
			await connection.close();
		}
	});
	it('serializes competing acceptances with one effect and one artifact', async () => {
		const state = await setup('9508');
		const connection = connectPostgresTestDatabase(context.url);
		const second = createTransactionContext(connection.db);
		const accept = async (transaction: typeof second) =>
			transaction.transactionRunner.run(async () => {
				const effects = new SuggestionEffects(new SuggestionEffectRecords(transaction.database));
				const suggestions = new SuggestionRecords(transaction.database);
				const entries = new MemoryRecords(transaction.database);
				await effects.lock(state.owner, state.suggestion.id);
				const pending = await suggestions.findById(state.owner, state.suggestion.id);
				if (pending?.status !== 'proposed') throw new Error('No longer pending');
				const entry = await entries.insert(state.owner, {
					id: crypto.randomUUID() as MemoryEntryId,
					userId: state.owner.userId,
					projectId: state.project.id,
					content: 'Accepted',
					shareWithAgents: true,
					createdAt: now,
					updatedAt: now
				});
				await effects.record(state.owner, pending.id, [
					{ kind: 'created', after: { type: 'memory_entries', value: entry } }
				]);
				await suggestions.transition(state.owner, pending.id, 'proposed', {
					status: 'accepted',
					decidedAt: now,
					appliedArtifactId: entry.id
				});
				return entry.id;
			});
		try {
			const results = await Promise.allSettled([accept(state), accept(second)]);
			const accepted = await state.suggestions.findById(state.owner, state.suggestion.id);
			const effect = await state.repository.find(state.owner, state.suggestion.id);
			const entries = await new MemoryRecords(state.database).list(state.owner, {
				projectId: state.project.id
			});
			expect({
				outcomes: results.map((result) => result.status).sort(),
				artifactIds: entries.map((entry) => entry.id),
				effectId: effect?.changes[0]?.after.value.id
			}).toEqual({
				outcomes: ['fulfilled', 'rejected'],
				artifactIds: [accepted?.appliedArtifactId],
				effectId: accepted?.appliedArtifactId
			});
		} finally {
			await connection.close();
		}
	});
	it('rejects an invalid stored effect at the repository boundary', async () => {
		const state = await setup('9507');
		await state.database.execute(
			sql`insert into suggestion_application_effects(suggestion_id,user_id,effect) values (${state.suggestion.id},${state.owner.userId},'{"changes":[]}'::jsonb)`
		);
		await expect(state.repository.find(state.owner, state.suggestion.id)).rejects.toThrow();
	});
});
