import { describe, expect, it } from 'vitest';
import { readStoredBootstrap, workspaceAccountHint } from './bootstrap-storage';
const accountId = 'a0000000-0000-4000-8000-000000000001';
const bootstrap = {
	accountId,
	agentPreferences: {
		userId: accountId,
		executionMode: 'approval_required',
		inlineSuggestionsEnabled: true,
		createdAt: '2026-09-07T10:00:00.000Z',
		updatedAt: '2026-09-07T10:00:00.000Z'
	},
	agentDefaults: { chatModelId: 'provider/chat', visionModelId: 'provider/vision' },
	agentModels: [
		{
			id: 'provider/chat',
			name: 'provider/chat',
			provider: 'provider',
			supportsTools: true,
			supportsVision: false,
			recommended: false,
			capabilities: ['configured']
		}
	],
	agentAvailable: false
};

describe('offline startup account binding', () => {
	it('restores deployment metadata for the account confirmed by the server hint', () => {
		expect(readStoredBootstrap(JSON.stringify(bootstrap), accountId)).toEqual({
			kind: 'stored',
			value: bootstrap
		});
	});
	it('does not expose the previous account bootstrap after sign-out clears the hint', () => {
		expect(readStoredBootstrap(JSON.stringify(bootstrap), null)).toEqual({ kind: 'absent' });
	});
	it('does not restore another account’s metadata after switching accounts', () => {
		expect(
			readStoredBootstrap(JSON.stringify(bootstrap), 'a0000000-0000-4000-8000-000000000002')
		).toEqual({ kind: 'absent' });
	});
	it('reports corrupt persisted metadata instead of inventing deployment settings', () => {
		expect(readStoredBootstrap('{broken', accountId)).toMatchObject({ kind: 'corrupt' });
	});
	it('reads the non-secret account hint independently of the authentication cookie', () => {
		expect(workspaceAccountHint(`theme=dark; workspace_account=${accountId}`)).toBe(accountId);
	});
});
