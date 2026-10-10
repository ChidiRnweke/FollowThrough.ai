import { expect, it } from 'vitest';
import { syncCursorSchema } from '$lib/models/sync';
import { InMemoryWorkspaceJournal } from '$lib/testing/sync/fakes/in-memory-workspace-journal';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceJournal } from './journal';

it('rejects a cursor just beyond the account head without rounding', async () => {
	const actor = testActor();
	const repository = new InMemoryWorkspaceJournal();
	repository.createAccount(actor, 9007199254740992n);
	await expect(
		new WorkspaceJournal(repository).selectPage(actor, syncCursorSchema.parse('9007199254740993'))
	).rejects.toThrow('The client cursor is ahead of this account');
});

it('does not turn a missing account head into an empty successful page', async () => {
	await expect(
		new WorkspaceJournal(new InMemoryWorkspaceJournal()).selectPage(
			testActor(),
			syncCursorSchema.parse('1')
		)
	).rejects.toThrow('The account has no synchronization head');
});
