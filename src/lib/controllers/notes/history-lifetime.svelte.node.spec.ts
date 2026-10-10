import { expect, it } from 'vitest';
import type { NoteRevision, NoteRevisionSummary } from '$lib/models/notes';
import { createHistory, revision, summary } from '$lib/testing/notes/fixtures/history';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const changedSession = {
	kind: 'failure',
	message: 'The workspace session changed. Close this dialog and try again.'
};

for (const outcome of ['success', 'failure'] as const) {
	it(`ignores a late list ${outcome} after cancellation and reopening`, async () => {
		const delayed = Promise.withResolvers<readonly NoteRevisionSummary[]>();
		let first = true;
		const history = createHistory(
			testNoteId(),
			async () => {
				if (first) {
					first = false;
					return delayed.promise;
				}
				return [summary(2)];
			},
			async () => revision(2)
		);
		const pending = history.open();
		history.cancel();
		await history.open();
		if (outcome === 'success') delayed.resolve([summary(1)]);
		else delayed.reject(new Error('Old list failed'));
		await pending;
		expect({
			revisions: history.revisions,
			selected: history.selected,
			status: history.readState
		}).toEqual({
			revisions: [summary(2)],
			selected: revision(2),
			status: { kind: 'ready' }
		});
	});

	it(`ignores a late revision ${outcome} while the reopened preferred revision loads`, async () => {
		const old = Promise.withResolvers<NoteRevision>();
		const current = Promise.withResolvers<NoteRevision>();
		const started = Promise.withResolvers<void>();
		const history = createHistory(
			testNoteId(),
			async () => [summary(2)],
			async (_note, id) => {
				if (id === revision(1).id) return old.promise;
				started.resolve();
				return current.promise;
			}
		);
		const pending = history.select(revision(1).id);
		history.cancel();
		const opening = history.open();
		await started.promise;
		if (outcome === 'success') old.resolve(revision(1));
		else old.reject(new Error('Old read failed'));
		await pending;
		const whileLoading = {
			selectedId: history.selectedId,
			selected: history.selected,
			status: history.readState
		};
		current.resolve(revision(2));
		await opening;
		expect({ whileLoading, selected: history.selected, status: history.readState }).toEqual({
			whileLoading: {
				selectedId: revision(2).id,
				selected: undefined,
				status: { kind: 'loading' }
			},
			selected: revision(2),
			status: { kind: 'ready' }
		});
	});

	for (const operation of ['list', 'revision'] as const) {
		it(`keeps cancelled ${operation} state clear after late ${outcome}`, async () => {
			const gate = Promise.withResolvers<void>();
			const history = createHistory(
				testNoteId(),
				async () => {
					await gate.promise;
					return [summary(1)];
				},
				async () => {
					await gate.promise;
					return revision(1);
				}
			);
			const pending = operation === 'list' ? history.open() : history.select(revision(1).id);
			history.cancel();
			if (outcome === 'success') gate.resolve();
			else gate.reject(new Error('Cancelled read failed'));
			await pending;
			expect({
				revisions: history.revisions,
				selectedId: history.selectedId,
				selected: history.selected,
				status: history.readState
			}).toEqual({
				revisions: [],
				selectedId: undefined,
				selected: undefined,
				status: { kind: 'ready' }
			});
		});

		for (const replacement of ['different account', 'same account'] as const) {
			it(`hides pending ${operation} and its late ${outcome} after ${replacement}`, async () => {
				const session: { accountId: string | null; generation: number } = {
					accountId: 'first',
					generation: 0
				};
				const gate = Promise.withResolvers<void>();
				const history = createHistory(
					testNoteId(),
					async () => {
						await gate.promise;
						return [summary(1)];
					},
					async () => {
						await gate.promise;
						return revision(1);
					},
					session
				);
				const pending = operation === 'list' ? history.open() : history.select(revision(1).id);
				session.accountId = null;
				session.generation++;
				const loggedOutStatus = history.readState;
				session.accountId = replacement === 'different account' ? 'second' : 'first';
				const replacementStatus = history.readState;
				if (outcome === 'success') gate.resolve();
				else gate.reject(new Error('Old session read failed'));
				await pending;
				expect({
					loggedOutStatus,
					replacementStatus,
					revisions: history.revisions,
					selected: history.selected,
					selectedId: history.selectedId,
					status: history.readState
				}).toEqual({
					loggedOutStatus: changedSession,
					replacementStatus: changedSession,
					revisions: [],
					selected: undefined,
					selectedId: undefined,
					status: changedSession
				});
			});
		}
	}
}

it('hides an existing failure when the same account starts a new session', async () => {
	const session = { accountId: 'first', generation: 0 };
	const history = createHistory(
		testNoteId(),
		async () => {
			throw new Error('Unavailable');
		},
		async () => revision(1),
		session
	);
	await history.open();
	session.generation++;
	expect(history.readState).toEqual(changedSession);
});

it('clears the old session list when selecting in a replacement session', async () => {
	const session = { accountId: 'first', generation: 0 };
	const history = createHistory(
		testNoteId(),
		async () => [summary(1)],
		async (_note, id) => (id === revision(1).id ? revision(1) : revision(2)),
		session
	);
	await history.open();
	session.generation++;
	await history.select(revision(2).id);
	expect({
		revisions: history.revisions,
		selected: history.selected,
		status: history.readState
	}).toEqual({ revisions: [], selected: revision(2), status: { kind: 'ready' } });
});

it('keeps two panes of the same note independent', async () => {
	const gate = Promise.withResolvers<NoteRevision>();
	const first = createHistory(
		testNoteId(),
		async () => [summary(1)],
		async () => gate.promise
	);
	const second = createHistory(
		testNoteId(),
		async () => [summary(2)],
		async () => revision(2)
	);
	const pending = first.select(revision(1).id);
	await second.open();
	first.cancel();
	gate.resolve(revision(1));
	await pending;
	expect({
		first: first.selected,
		second: second.selected,
		secondList: second.revisions,
		secondStatus: second.readState
	}).toEqual({
		first: undefined,
		second: revision(2),
		secondList: [summary(2)],
		secondStatus: { kind: 'ready' }
	});
});

for (const operation of ['open', 'select'] as const) {
	it(`reports missing workspace identity on ${operation} without a remote result`, async () => {
		const session = { accountId: null, generation: 0 };
		const history = createHistory(
			testNoteId(),
			async () => [summary(1)],
			async () => revision(1),
			session
		);
		if (operation === 'open') await history.open();
		else await history.select(revision(1).id);
		expect({
			revisions: history.revisions,
			selected: history.selected,
			status: history.readState
		}).toEqual({
			revisions: [],
			selected: undefined,
			status: { kind: 'failure', message: 'Open the workspace before loading version history.' }
		});
	});
}

it('reopening can recover from failure into a successful empty history', async () => {
	let unavailable = true;
	const history = createHistory(
		testNoteId(),
		async () => {
			if (unavailable) throw new Error('Unavailable');
			return [];
		},
		async () => revision(1)
	);
	await history.open();
	unavailable = false;
	await history.open();
	expect({
		status: history.readState,
		revisions: history.revisions,
		selected: history.selected
	}).toEqual({ status: { kind: 'ready' }, revisions: [], selected: undefined });
});
