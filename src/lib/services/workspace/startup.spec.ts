import { expect, it } from 'vitest';
import { WorkspaceReadinessRulesService } from '$lib/services/workspace/startup';
const { workspaceReadiness } = new WorkspaceReadinessRulesService();
import type { WorkspaceStartupFacts } from '$lib/models/workspace-startup';

const downloaded: WorkspaceStartupFacts = {
	userKnown: true,
	inboxKnown: true,
	preferencesKnown: true,
	inventoryComplete: false,
	online: true,
	failure: null
};

it('opens downloaded prerequisites before the inventory finishes', () => {
	expect(workspaceReadiness(downloaded)).toEqual({ kind: 'ready' });
});

it('waits for preferences instead of treating an unfinished lookup as absence', () => {
	expect(workspaceReadiness({ ...downloaded, preferencesKnown: false })).toEqual({
		kind: 'loading'
	});
});

it('waits for an inbox that has not arrived yet', () => {
	expect(workspaceReadiness({ ...downloaded, inboxKnown: false })).toEqual({ kind: 'loading' });
});

it('reports a missing inbox only after inventory completion', () => {
	expect(workspaceReadiness({ ...downloaded, inboxKnown: false, inventoryComplete: true })).toEqual(
		{
			kind: 'failure',
			message: 'Required account or inbox records are missing from this workspace.'
		}
	);
});

it('keeps downloaded prerequisites usable when background synchronization fails', () => {
	expect(
		workspaceReadiness({ ...downloaded, online: false, failure: 'Connection interrupted' })
	).toEqual({ kind: 'ready' });
});

it('reports offline startup when required records are missing', () => {
	expect(workspaceReadiness({ ...downloaded, userKnown: false, online: false })).toEqual({
		kind: 'offline'
	});
});

it('reports a failed download when required records are missing', () => {
	expect(
		workspaceReadiness({ ...downloaded, userKnown: false, failure: 'Download failed' })
	).toEqual({ kind: 'failure', message: 'Download failed' });
});
