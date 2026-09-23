import { expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { LocalDate } from '$lib/models/workspace';
import type { SuggestionId } from '$lib/models/suggestions';
import { suggestions } from '$lib/server/db/schema/suggestions';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import { context, now, seedNote, seedProvenance } from '../database-harness';

const setup = async (suffix: string) => {
	const { owner, note, project } = await seedNote(suffix);
	const provenance = await seedProvenance(owner, suffix);
	const repository = new SuggestionRecords(context.db);
	const proposal = await repository.insert(owner, {
		id: crypto.randomUUID() as SuggestionId,
		userId: owner.userId,
		noteId: note.id,
		kind: 'todo',
		status: 'proposed',
		payload: {
			projectId: project.id,
			title: 'Send the draft',
			responsibility: 'mine',
			dueDate: '2028-02-29' as LocalDate
		},
		provenanceId: provenance.id,
		isAutoAccepted: false,
		createdAt: now,
		updatedAt: now
	});
	return { owner, proposal, repository };
};

it('marks an older malformed task date unreadable without losing a valid neighboring proposal', async () => {
	const { owner, proposal, repository } = await setup('21801');
	const valid = await repository.insert(owner, {
		...proposal,
		id: crypto.randomUUID() as SuggestionId
	});
	await context.db
		.update(suggestions)
		.set({
			payload: sql`jsonb_set(${suggestions.payload}, '{dueDate}', to_jsonb(${'2026-02-30'}::text))`
		})
		.where(eq(suggestions.id, proposal.id));
	const listed = await repository.list(owner, { status: 'proposed' });
	expect(
		listed.map((entry) => ({
			id: entry.status === 'readable' ? entry.suggestion.id : entry.id,
			status: entry.status
		}))
	).toEqual(
		expect.arrayContaining([
			{ id: proposal.id, status: 'unreadable' },
			{ id: valid.id, status: 'readable' }
		])
	);
});

it('refuses a malformed stored task date on the read used for acceptance', async () => {
	const { owner, proposal, repository } = await setup('21802');
	await context.db
		.update(suggestions)
		.set({
			payload: sql`jsonb_set(${suggestions.payload}, '{dueDate}', to_jsonb(${'tomorrow'}::text))`
		})
		.where(eq(suggestions.id, proposal.id));
	await expect(repository.findById(owner, proposal.id)).rejects.toThrow();
});

it('round-trips a valid leap-day task proposal', async () => {
	const { owner, proposal, repository } = await setup('21803');
	expect((await repository.findById(owner, proposal.id))?.payload).toMatchObject({
		dueDate: '2028-02-29'
	});
});
