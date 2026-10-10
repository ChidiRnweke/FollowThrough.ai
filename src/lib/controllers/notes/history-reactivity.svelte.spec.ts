import { flushSync } from 'svelte';
import { afterEach, expect, it } from 'vitest';
import type { NoteHistoryReadState, NoteRevision } from '$lib/models/notes';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import { WorkspaceSessionStore } from '$lib/stores/workspace/session.svelte';
import { WorkspaceSessions } from '$lib/controllers/workspace/session';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { createHistory, revision, summary } from '$lib/testing/notes/fixtures/history';
import {
	InMemoryWorkspaceSessionEnvironment,
	InMemoryWorkspaceRecovery
} from '$lib/testing/sync/fakes/in-memory-session';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { projectBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const cleanups: (() => void)[] = [];
afterEach(() => {
	cleanups
		.splice(0)
		.reverse()
		.forEach((cleanup) => cleanup());
});

const setup = async () => {
	const bootstrap: WorkspaceBootstrap = {
		accountId: projectBuilder().userId,
		agentDefaults: { chatModelId: 'provider/chat', visionModelId: 'provider/vision' },
		agentModels: [],
		numericDefaults: { webSearchMaxResults: 5, webSearchMaxTotalResults: 10, agentMaxTurns: 10 },
		agentAvailable: false
	};
	const state = new WorkspaceSessionStore();
	const sessions = new WorkspaceSessions(
		state,
		new InMemoryWorkspaceSessionEnvironment(bootstrap),
		{ create: (accountId) => workspaceResourcesFixture(accountId).resources },
		new InMemoryWorkspaceRecovery(),
		agentRulesFixture()
	);
	cleanups.push(() => sessions.stop());
	await sessions.start();
	return { state, sessions };
};

it('reactively replaces pending history status when the same account restarts', async () => {
	const { state, sessions } = await setup();
	const pending = Promise.withResolvers<NoteRevision>();
	const history = createHistory(
		testNoteId(),
		async () => [summary(1)],
		async () => pending.promise,
		state
	);
	let visible: { status: NoteHistoryReadState; selected: NoteRevision | undefined } | undefined;
	cleanups.push(
		$effect.root(() => {
			$effect(() => {
				visible = { status: history.readState, selected: history.selected };
			});
		})
	);
	const reading = history.select(revision(1).id);
	flushSync();
	const whileLoading = visible;
	sessions.stop();
	await sessions.start();
	flushSync();
	pending.resolve(revision(1));
	await reading;
	flushSync();
	expect({ whileLoading, visible }).toEqual({
		whileLoading: { status: { kind: 'loading' }, selected: undefined },
		visible: {
			status: {
				kind: 'failure',
				message: 'The workspace session changed. Close this dialog and try again.'
			},
			selected: undefined
		}
	});
});

it('reactively removes displayed history after logout and allows a fresh same-account opening', async () => {
	const { state, sessions } = await setup();
	let version = 1;
	const history = createHistory(
		testNoteId(),
		async () => [summary(version)],
		async () => revision(version),
		state
	);
	let visible:
		| { status: NoteHistoryReadState; ids: readonly string[]; selected: string | undefined }
		| undefined;
	cleanups.push(
		$effect.root(() => {
			$effect(() => {
				visible = {
					status: history.readState,
					ids: history.revisions.map((item) => item.id),
					selected: history.selected?.id
				};
			});
		})
	);
	await history.open();
	flushSync();
	const before = visible;
	sessions.stop();
	flushSync();
	const loggedOut = visible;
	await sessions.start();
	version = 2;
	await history.open();
	flushSync();
	expect({ before, loggedOut, visible }).toEqual({
		before: { status: { kind: 'ready' }, ids: [revision(1).id], selected: revision(1).id },
		loggedOut: {
			status: {
				kind: 'failure',
				message: 'The workspace session changed. Close this dialog and try again.'
			},
			ids: [],
			selected: undefined
		},
		visible: { status: { kind: 'ready' }, ids: [revision(2).id], selected: revision(2).id }
	});
});
