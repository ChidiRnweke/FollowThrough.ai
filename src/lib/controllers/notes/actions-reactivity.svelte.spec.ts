import { flushSync } from 'svelte';
import { afterEach, expect, it } from 'vitest';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import { WorkspaceSessionStore } from '$lib/stores/workspace/session.svelte';
import { WorkspaceSessions } from '$lib/controllers/workspace/session';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import {
	InMemoryWorkspaceSessionEnvironment,
	InMemoryWorkspaceRecovery
} from '$lib/testing/sync/fakes/in-memory-session';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { projectBuilder, testSuggestionId } from '$lib/testing/workspace/fixtures/domain-builders';

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

import { NoteActions } from './actions';
import { NoteActionStore } from '$lib/stores/notes/note-actions.svelte';
import { NoteActionIdentityService } from '$lib/services/notes/action-identities';
import { noteSubmissionFixture } from '$lib/testing/notes/fixtures/submissions';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import type { NoteReviewRemote } from '$lib/models/browser-workspace';

it('reactively hides a pending review across same-account restart and keeps its late failure hidden', async () => {
	const { state, sessions } = await setup();
	const pending = Promise.withResolvers<void>();
	const fixture = noteSubmissionFixture(sessionStorage);
	const actions = new NoteActions(
		new NoteActionStore(),
		state,
		fixture.selections,
		fixture.diagrams,
		new NoteActionIdentityService(),
		fixture.remote,
		{ create: () => crypto.randomUUID() },
		capabilityDependencies<NoteReviewRemote>({
			reject: async () => {
				await pending.promise;
				throw new Error('Old review failed');
			}
		})
	);
	let visible: { running: boolean; error: string | undefined } | undefined;
	cleanups.push(
		$effect.root(() => {
			$effect(() => {
				visible = { running: actions.running, error: actions.lastError };
			});
		})
	);
	const reviewing = actions.rejectDrawio(testSuggestionId());
	flushSync();
	const before = visible;
	sessions.stop();
	await sessions.start();
	flushSync();
	const replaced = visible;
	pending.resolve();
	const result = await reviewing;
	flushSync();
	expect({ before, replaced, visible, result }).toEqual({
		before: { running: true, error: undefined },
		replaced: { running: false, error: undefined },
		visible: { running: false, error: undefined },
		result: undefined
	});
});

it('reactively removes a displayed action failure on logout', async () => {
	const { state, sessions } = await setup();
	const fixture = noteSubmissionFixture(sessionStorage);
	const actions = new NoteActions(
		new NoteActionStore(),
		state,
		fixture.selections,
		fixture.diagrams,
		new NoteActionIdentityService(),
		fixture.remote,
		{ create: () => crypto.randomUUID() },
		capabilityDependencies<NoteReviewRemote>({
			reject: async () => {
				throw new Error('Review failed');
			}
		})
	);
	let visible: string | undefined;
	cleanups.push(
		$effect.root(() => {
			$effect(() => {
				visible = actions.lastError;
			});
		})
	);
	await actions.rejectDrawio(testSuggestionId());
	flushSync();
	const before = visible;
	sessions.stop();
	flushSync();
	expect({ before, visible }).toEqual({ before: 'Review failed', visible: undefined });
});

it('does not resurrect a missing-session error after a complete session lifetime', async () => {
	const { state, sessions } = await setup();
	sessions.stop();
	const fixture = noteSubmissionFixture(sessionStorage);
	const actions = new NoteActions(
		new NoteActionStore(),
		state,
		fixture.selections,
		fixture.diagrams,
		new NoteActionIdentityService(),
		fixture.remote,
		{ create: () => crypto.randomUUID() },
		capabilityDependencies<NoteReviewRemote>({})
	);
	await actions.rejectDrawio(testSuggestionId());
	const missing = actions.lastError;
	await sessions.start();
	sessions.stop();
	expect({ missing, error: actions.lastError }).toEqual({
		missing: 'Open the workspace before running a note action.',
		error: undefined
	});
});
